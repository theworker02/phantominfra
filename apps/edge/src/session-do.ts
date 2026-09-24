/**
 * Session Durable Object — sticky isolate per speculation session.
 * Holds live COW branches; SSE fans out events; KV mesh shares predictor learning.
 */
import { DurableObject } from "cloudflare:workers";
import {
  AGENT_TOOLS,
  PhantomEngine,
  applyAgentSurfacePriors,
  applyCartSurfacePriors,
  createAgentToolHandlers,
  createCartHandlers,
  DEFAULT_CART_STATE,
  type AgentPlan,
  type CartState,
  type EngineSnapshot,
  type PredictorModel,
  type SpeculativeEvent,
} from "@phantominfra/runtime";
import { loadGlobalPredictor, publishPredictorDelta } from "./global-model";

const STORAGE_KEY = "engine_snapshot_v1";
const encoder = new TextEncoder();

export interface SessionEnv {
  PREDICTOR_KV: KVNamespace;
}

export class PhantomSession extends DurableObject<SessionEnv> {
  private engine: PhantomEngine<CartState> | null = null;
  private recentEvents: SpeculativeEvent[] = [];
  private hydrated = false;
  private lastPlan: AgentPlan | null = null;
  private sseControllers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private lastPublished: PredictorModel | null = null;
  private isolated = false;

  private ensureEngine(): PhantomEngine<CartState> {
    if (this.engine) return this.engine;

    const engine = new PhantomEngine<CartState>({
      initialState: DEFAULT_CART_STATE,
      topK: 3,
      minProbability: 0.08,
      coldPathDelayMs: 160,
      branchTtlMs: 12_000,
      policy: {
        maxBranches: 3,
        requireShadowFor: ["stripe.capture", "email.send"],
      },
    });

    for (const [route, handler] of Object.entries(createCartHandlers())) {
      engine.register(route, handler);
    }
    for (const [route, handler] of Object.entries(createAgentToolHandlers())) {
      engine.register(route, handler);
    }
    applyCartSurfacePriors((surface, route, w) => {
      engine.predictor.setSurfacePrior(surface, route, w);
    });
    applyAgentSurfacePriors((surface, route, w) => {
      engine.predictor.setSurfacePrior(surface, route, w);
    });

    engine.on((event) => {
      this.recentEvents = [event, ...this.recentEvents].slice(0, 40);
      this.broadcast(event);
    });

    this.engine = engine;
    return engine;
  }

  private broadcast(event: unknown): void {
    const chunk = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    for (const controller of this.sseControllers) {
      try {
        controller.enqueue(chunk);
      } catch {
        this.sseControllers.delete(controller);
      }
    }
  }

  private async hydrate(): Promise<PhantomEngine<CartState>> {
    const engine = this.ensureEngine();
    if (this.hydrated) return engine;

    const snap = await this.ctx.storage.get<EngineSnapshot<CartState>>(STORAGE_KEY);
    if (snap?.version === 1) {
      engine.importSnapshot(snap);
    }

    this.isolated = (await this.ctx.storage.get<boolean>("demo_isolated")) === true;

    if (!this.isolated) {
      const global = await loadGlobalPredictor(this.env.PREDICTOR_KV);
      if (global) {
        engine.predictor.mergeModel(global, 0.5);
        this.lastPublished = global;
      }
    }

    this.hydrated = true;
    return engine;
  }

  private async persist(): Promise<void> {
    if (!this.engine) return;
    await this.ctx.storage.put(STORAGE_KEY, this.engine.exportSnapshot());
  }

  private async syncGlobalModel(): Promise<void> {
    if (!this.engine || this.isolated) return;
    const delta = this.engine.predictor.exportModel();
    const merged = await publishPredictorDelta(this.env.PREDICTOR_KV, delta);
    if (merged) this.lastPublished = merged;
  }

  /** SSE / health fetch surface for the Worker proxy. */
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/events" || url.pathname.endsWith("/events")) {
      await this.hydrate();
      let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          controllerRef = controller;
          this.sseControllers.add(controller);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "sse_open", session: "ok" })}\n\n`,
            ),
          );
        },
        cancel: () => {
          if (controllerRef) this.sseControllers.delete(controllerRef);
        },
      });

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
        },
      });
    }

    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  async createSession(input?: {
    isolated?: boolean;
  }): Promise<{ sessionId: string; state: CartState }> {
    this.engine = null;
    this.recentEvents = [];
    this.lastPlan = null;
    this.hydrated = true;
    this.lastPublished = null;
    this.isolated = input?.isolated === true;
    await this.ctx.storage.delete(STORAGE_KEY);
    await this.ctx.storage.put("demo_isolated", this.isolated);
    const engine = this.ensureEngine();
    if (!this.isolated) {
      const global = await loadGlobalPredictor(this.env.PREDICTOR_KV);
      if (global) engine.predictor.mergeModel(global, 0.5);
    }
    await this.persist();
    return { sessionId: "ok", state: engine.getState() };
  }

  async speculate(input: {
    surface?: string;
    history?: string[];
  }): Promise<{
    branches: ReturnType<PhantomEngine["listBranches"]>;
    events: unknown[];
    candidatesHint: string;
  }> {
    const engine = await this.hydrate();
    await engine.speculate({
      contextKey: "edge",
      surface: input.surface,
      history: input.history,
    });
    return {
      branches: engine.listBranches(),
      events: this.recentEvents,
      candidatesHint: engine
        .listBranches()
        .map((b) => `${b.route}@${b.probability}`)
        .join(", "),
    };
  }

  async planAgent(input: { plan: AgentPlan }): Promise<{
    branches: ReturnType<PhantomEngine["listBranches"]>;
    events: unknown[];
    prediction: unknown;
    candidatesHint: string;
  }> {
    const engine = await this.hydrate();
    this.lastPlan = input.plan;
    const opened = await engine.speculatePlan(input.plan, AGENT_TOOLS, "agent");
    return {
      branches: engine.listBranches(),
      events: this.recentEvents,
      prediction: opened.prediction ?? null,
      candidatesHint: engine
        .listBranches()
        .map((b) => `${b.route}@${b.probability}`)
        .join(", "),
    };
  }

  async confirm(input: { route: string; payload?: unknown }): Promise<{
    hit: boolean;
    route: string;
    result: unknown;
    serverLatencyMs: number;
    branchId?: string;
    state: Record<string, unknown>;
    branches: ReturnType<PhantomEngine["listBranches"]>;
    metrics: ReturnType<PhantomEngine["getMetrics"]>;
    events: unknown[];
  }> {
    const engine = await this.hydrate();
    const result = await engine.confirm(input.route, input.payload);
    await this.persist();
    // Fire-and-forget mesh publish — don't block the confirm path hard
    this.ctx.waitUntil(this.syncGlobalModel());
    return {
      ...result,
      branches: engine.listBranches(),
      metrics: engine.getMetrics(),
      events: this.recentEvents,
    };
  }

  async exportAudit(): Promise<unknown> {
    const engine = await this.hydrate();
    return engine.exportAuditBundle();
  }

  async status(): Promise<{
    state: CartState;
    history: string[];
    branches: ReturnType<PhantomEngine["listBranches"]>;
    metrics: ReturnType<PhantomEngine["getMetrics"]>;
    events: unknown[];
    lastPlan: AgentPlan | null;
    globalConfirms: number | null;
    ledger: ReturnType<PhantomEngine["getLedger"]>;
    ledgerSummary: ReturnType<PhantomEngine["ledger"]["summary"]>;
  }> {
    const engine = await this.hydrate();
    return {
      state: engine.getState(),
      history: engine.getHistory(),
      branches: engine.listBranches(),
      metrics: engine.getMetrics(),
      events: this.recentEvents,
      lastPlan: this.lastPlan,
      globalConfirms: this.lastPublished?.totalConfirms ?? null,
      ledger: engine.getLedger(30),
      ledgerSummary: engine.ledger.summary(),
    };
  }
}
