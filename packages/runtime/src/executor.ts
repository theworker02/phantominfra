import { buildValueReport, type AuditBundle, type ValueReport } from "./value.js";
import {
  predictFromAgentPlan,
  type AgentPlan,
  type ToolSpec,
} from "./agent.js";
import { PhantomError } from "./errors.js";
import { EffectLedger } from "./ledger.js";
import { RoutePredictor, type PredictorInput } from "./predictor.js";
import {
  emptyMetrics,
  summarizeMetrics,
  type EngineMetrics,
  type MetricsSummary,
} from "./metrics.js";
import { applySpeculationPolicy, type SpeculationPolicy } from "./policy.js";
import type { EngineSnapshot } from "./snapshot.js";
import type {
  BranchSnapshot,
  EffectOptions,
  EngineOptions,
  EventListener,
  RouteCandidate,
  RouteHandler,
  SpeculativeEvent,
  SpeculativeResult,
} from "./types.js";
import { CowWorkspace, cloneState } from "./workspace.js";

let branchSeq = 0;

function nextBranchId(): string {
  branchSeq += 1;
  return `ph-${Date.now().toString(36)}-${branchSeq.toString(36)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  onTimeout: () => void,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(
            new PhantomError("handler_timeout", `Handler exceeded ${timeoutMs}ms`, {
              timeoutMs,
            }),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * PhantomEngine — speculative zero-latency edge runtime.
 *
 * 1. predict / plan → open COW branches for top-K routes
 * 2. pre-execute handlers (shadow effects only) against ephemeral state
 * 3. confirm() → commit hit instantly (real effects), roll back misses
 */
export class PhantomEngine<TState extends object = Record<string, unknown>> {
  readonly predictor = new RoutePredictor();
  readonly ledger = new EffectLedger();
  private production: TState;
  private handlers = new Map<string, RouteHandler<TState>>();
  private branches = new Map<string, CowWorkspace<TState>>();
  private listeners = new Set<EventListener>();
  private history: string[] = [];
  private readonly topK: number;
  private readonly minProbability: number;
  private readonly branchTtlMs: number;
  private readonly coldPathDelayMs: number;
  private readonly handlerTimeoutMs: number | undefined;
  private policy: SpeculationPolicy | undefined;
  private metrics: EngineMetrics = emptyMetrics();
  private preExecMs = new Map<string, number>();

  constructor(options: EngineOptions<TState>) {
    this.production = cloneState(options.initialState);
    this.topK = options.topK ?? 2;
    this.minProbability = options.minProbability ?? 0.15;
    this.branchTtlMs = options.branchTtlMs ?? 8000;
    this.coldPathDelayMs = options.coldPathDelayMs ?? 120;
    this.handlerTimeoutMs = options.handlerTimeoutMs;
    this.policy = options.policy;
  }

  setPolicy(policy: SpeculationPolicy | undefined): void {
    this.policy = policy;
  }

  on(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SpeculativeEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  register(route: string, handler: RouteHandler<TState>, priorWeight = 1): void {
    this.handlers.set(route, handler);
    this.predictor.registerRoute(route, priorWeight);
  }

  getState(): TState {
    return cloneState(this.production);
  }

  getHistory(): string[] {
    return [...this.history];
  }

  getMetrics(): MetricsSummary {
    return summarizeMetrics(this.metrics);
  }

  getLedger(limit = 50) {
    return this.ledger.list(limit);
  }

  getValueReport(usdPerCpuHour?: number): ValueReport {
    return buildValueReport({
      metrics: this.getMetrics(),
      ledgerSummary: this.ledger.summary(),
      usdPerCpuHour,
      phase: "phantom-engine",
    });
  }

  /** Diligence-ready export: metrics, ledger, predictor, policy, state. */
  exportAuditBundle(usdPerCpuHour?: number): AuditBundle {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      value: this.getValueReport(usdPerCpuHour),
      predictor: this.predictor.exportModel(),
      ledger: this.ledger.list(200),
      policy: this.policy ?? null,
      history: this.getHistory(),
      production: this.getState(),
    };
  }

  exportSnapshot(): EngineSnapshot<TState> {
    return {
      version: 1,
      production: cloneState(this.production),
      history: [...this.history],
      predictor: this.predictor.exportModel(),
      metrics: { ...this.metrics },
      options: {
        topK: this.topK,
        minProbability: this.minProbability,
        branchTtlMs: this.branchTtlMs,
        coldPathDelayMs: this.coldPathDelayMs,
      },
    };
  }

  importSnapshot(snapshot: EngineSnapshot<TState>): void {
    for (const branch of [...this.branches.values()]) {
      branch.rollback();
      this.branches.delete(branch.id);
    }
    this.preExecMs.clear();
    this.production = cloneState(snapshot.production);
    this.history = [...snapshot.history];
    this.predictor.importModel(snapshot.predictor);
    this.metrics = { ...snapshot.metrics };
  }

  listBranches(): BranchSnapshot[] {
    return [...this.branches.values()].map((b) => ({
      id: b.id,
      route: b.route,
      probability: b.probability,
      status: b.status,
      result: b.result,
      openedAt: b.openedAt,
      readyAt: b.readyAt,
      shadowedEffects: b.shadowedEffectLabels(),
    }));
  }

  /** Clear open branches (supersede). */
  private clearBranches(reason: "superseded" | "miss"): void {
    for (const branch of [...this.branches.values()]) {
      if (branch.status === "ready" || branch.status === "running") {
        branch.rollback();
        this.metrics.rollbacks += 1;
        this.emit({
          type: "rolled_back",
          branchId: branch.id,
          route: branch.route,
          reason,
        });
        this.branches.delete(branch.id);
        this.preExecMs.delete(branch.id);
      }
    }
  }

  private async runHandler(
    branch: CowWorkspace<TState>,
    payload: unknown,
  ): Promise<unknown> {
    const handler = this.handlers.get(branch.route);
    if (!handler) {
      throw new PhantomError("unknown_route", `No handler for ${branch.route}`, {
        route: branch.route,
      });
    }

    const run = Promise.resolve(
      handler({
        state: branch.state,
        mutate: (fn) => branch.mutate(fn),
        effect: async (label, apply, options?: EffectOptions) => {
          const requiresShadow = this.policy?.requireShadowFor?.includes(label);
          if (requiresShadow && !options?.shadow) {
            throw new PhantomError(
              "policy_violation",
              `Policy requires shadow for effect "${label}"`,
              { label },
            );
          }
          let shadowed = false;
          if (options?.shadow) {
            try {
              await options.shadow();
              shadowed = true;
              this.ledger.record({
                branchId: branch.id,
                route: branch.route,
                label,
                phase: "shadow",
                ok: true,
              });
              this.emit({
                type: "effect_shadowed",
                branchId: branch.id,
                label,
              });
            } catch (err) {
              this.ledger.record({
                branchId: branch.id,
                route: branch.route,
                label,
                phase: "shadow",
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              });
              throw err;
            }
          }
          branch.effect(label, apply, {
            shadowed,
            compensate: options?.compensate,
          });
        },
        payload,
        route: branch.route,
        branchId: branch.id,
      }),
    );

    try {
      return await withTimeout(run, this.handlerTimeoutMs, () => {
        this.emit({
          type: "handler_timeout",
          branchId: branch.id,
          route: branch.route,
          timeoutMs: this.handlerTimeoutMs ?? 0,
        });
      });
    } catch (err) {
      if (err instanceof PhantomError) throw err;
      throw new PhantomError(
        "handler_failed",
        err instanceof Error ? err.message : String(err),
        { route: branch.route, branchId: branch.id },
      );
    }
  }

  private async openCandidates(
    candidates: RouteCandidate[],
    contextKey: string,
  ): Promise<BranchSnapshot[]> {
    this.clearBranches("superseded");
    this.metrics.predicts += 1;
    this.emit({ type: "predicted", candidates, contextKey });

    const decision = applySpeculationPolicy(candidates, this.policy);
    for (const d of decision.denied) {
      this.emit({ type: "policy_denied", route: d.route, reason: d.reason });
    }

    const opened: BranchSnapshot[] = [];
    for (const candidate of decision.allowed) {
      if (candidate.probability < this.minProbability) continue;
      if (!this.handlers.has(candidate.route)) continue;

      const branch = new CowWorkspace(
        nextBranchId(),
        candidate.route,
        candidate.probability,
        this.production,
      );
      this.branches.set(branch.id, branch);
      this.metrics.branchesOpened += 1;
      this.emit({
        type: "branch_opened",
        branchId: branch.id,
        route: branch.route,
        probability: branch.probability,
      });

      branch.armTtl(this.branchTtlMs, () => {
        if (branch.status === "ready" || branch.status === "running") {
          branch.rollback();
          this.metrics.rollbacks += 1;
          this.emit({
            type: "rolled_back",
            branchId: branch.id,
            route: branch.route,
            reason: "ttl",
          });
          this.branches.delete(branch.id);
          this.preExecMs.delete(branch.id);
        }
      });

      const start = performance.now();
      try {
        const result = await this.runHandler(branch, candidate.payload);
        const durationMs = Number((performance.now() - start).toFixed(2));
        branch.markReady(result);
        this.preExecMs.set(branch.id, durationMs);
        this.metrics.preExecuted += 1;
        this.emit({
          type: "pre_executed",
          branchId: branch.id,
          route: branch.route,
          durationMs,
        });
      } catch {
        branch.rollback();
        this.metrics.rollbacks += 1;
        this.branches.delete(branch.id);
        continue;
      }

      opened.push({
        id: branch.id,
        route: branch.route,
        probability: branch.probability,
        status: branch.status,
        result: branch.result,
        openedAt: branch.openedAt,
        readyAt: branch.readyAt,
        shadowedEffects: branch.shadowedEffectLabels(),
      });
    }

    return opened;
  }

  /**
   * Surface/history-based speculation (Phase 1–2 path).
   */
  async speculate(input: PredictorInput): Promise<BranchSnapshot[]> {
    const withHistory: PredictorInput = {
      ...input,
      history: input.history ?? this.history,
    };
    const candidates = this.predictor.predict(withHistory, this.topK);
    return this.openCandidates(candidates, input.contextKey);
  }

  /**
   * Explicit candidate list — used by agent planners and custom predictors.
   */
  async speculateCandidates(
    candidates: RouteCandidate[],
    contextKey = "explicit",
  ): Promise<BranchSnapshot[]> {
    return this.openCandidates(candidates, contextKey);
  }

  /**
   * Agent plan → candidates → speculative tool pre-execution.
   */
  async speculatePlan(
    plan: AgentPlan,
    tools: ToolSpec[],
    contextKey = "agent",
  ): Promise<BranchSnapshot[] & { prediction?: ReturnType<typeof predictFromAgentPlan> }> {
    const prediction = predictFromAgentPlan(plan, tools, this.topK);
    const opened = await this.openCandidates(prediction.candidates, contextKey);
    return Object.assign(opened, { prediction });
  }

  async confirm(route: string, payload?: unknown): Promise<SpeculativeResult> {
    const confirmStart = performance.now();
    const hit = [...this.branches.values()].find(
      (b) => b.route === route && b.status === "ready",
    );

    for (const branch of [...this.branches.values()]) {
      if (hit && branch.id === hit.id) continue;
      if (branch.status === "ready" || branch.status === "running") {
        branch.rollback();
        this.metrics.rollbacks += 1;
        this.emit({
          type: "rolled_back",
          branchId: branch.id,
          route: branch.route,
          reason: "miss",
        });
        this.branches.delete(branch.id);
        this.preExecMs.delete(branch.id);
      }
    }

    if (hit) {
      try {
        await hit.commit({
          replace: (next) => {
            this.production = next;
          },
          onEffect: (label) => {
            this.ledger.record({
              branchId: hit.id,
              route: hit.route,
              label,
              phase: "commit",
              ok: true,
            });
            this.emit({
              type: "effect_committed",
              branchId: hit.id,
              label,
            });
          },
          onCompensate: (label) => {
            this.ledger.record({
              branchId: hit.id,
              route: hit.route,
              label,
              phase: "compensate",
              ok: true,
            });
            this.emit({
              type: "effect_compensated",
              branchId: hit.id,
              label,
            });
          },
        });
      } catch (err) {
        this.branches.delete(hit.id);
        this.preExecMs.delete(hit.id);
        throw err instanceof PhantomError
          ? err
          : new PhantomError(
              "commit_failed",
              err instanceof Error ? err.message : String(err),
              { route, branchId: hit.id },
            );
      }
      const serverLatencyMs = Number((performance.now() - confirmStart).toFixed(3));
      const saved = this.preExecMs.get(hit.id) ?? 0;
      this.preExecMs.delete(hit.id);
      this.metrics.hits += 1;
      this.metrics.hitLatencyTotalMs += serverLatencyMs;
      this.metrics.estimatedSavedMs += saved;
      this.emit({
        type: "committed",
        branchId: hit.id,
        route: hit.route,
        serverLatencyMs,
      });
      this.branches.delete(hit.id);
      this.learn(route);
      return {
        hit: true,
        route,
        result: hit.result,
        serverLatencyMs,
        branchId: hit.id,
        state: this.getState() as Record<string, unknown>,
      };
    }

    const coldStart = performance.now();
    if (this.coldPathDelayMs > 0) await sleep(this.coldPathDelayMs);

    if (!this.handlers.has(route)) {
      throw new PhantomError("unknown_route", `No handler registered for route: ${route}`, {
        route,
      });
    }

    const workspace = new CowWorkspace(nextBranchId(), route, 0, this.production);
    const result = await this.runHandler(workspace, payload);
    workspace.markReady(result);
    await workspace.commit({
      replace: (next) => {
        this.production = next;
      },
      onEffect: (label) => {
        this.ledger.record({
          branchId: workspace.id,
          route,
          label,
          phase: "commit",
          ok: true,
        });
        this.emit({
          type: "effect_committed",
          branchId: workspace.id,
          label,
        });
      },
      onCompensate: (label) => {
        this.ledger.record({
          branchId: workspace.id,
          route,
          label,
          phase: "compensate",
          ok: true,
        });
        this.emit({
          type: "effect_compensated",
          branchId: workspace.id,
          label,
        });
      },
    });

    const durationMs = Number((performance.now() - coldStart).toFixed(2));
    this.metrics.misses += 1;
    this.metrics.missLatencyTotalMs += durationMs;
    this.emit({ type: "cold_path", route, durationMs });
    this.learn(route);

    return {
      hit: false,
      route,
      result,
      serverLatencyMs: durationMs,
      state: this.getState() as Record<string, unknown>,
    };
  }

  private learn(route: string): void {
    const from = this.history.at(-1) ?? null;
    this.predictor.observe(from, route);
    this.history.push(route);
    if (this.history.length > 32) this.history.shift();
  }
}

export type { PredictorInput };
