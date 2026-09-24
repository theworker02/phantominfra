import type {
  AgentPlan,
  BranchSnapshot,
  MetricsSummary,
  SpeculativeResult,
} from "@phantominfra/runtime";

export interface PhantomClientOptions {
  /** Edge Worker base URL, e.g. http://127.0.0.1:8787 or https://….workers.dev */
  baseUrl: string;
  /** Bearer API key (optional when edge ALLOW_ANON=true). */
  apiKey?: string;
  /** Optional fetch implementation (Workers / Node / browser). */
  fetch?: typeof fetch;
}

export interface SessionView {
  sessionId: string;
  state?: unknown;
  history?: string[];
  branches?: BranchSnapshot[];
  metrics?: MetricsSummary;
  events?: unknown[];
  globalConfirms?: number | null;
  keyId?: string;
}

export interface SpeculateResult {
  sessionId: string;
  branches: BranchSnapshot[];
  events?: unknown[];
  candidatesHint?: string;
  prediction?: unknown;
}

export interface ConfirmView extends SpeculativeResult {
  sessionId: string;
  branches: BranchSnapshot[];
  metrics: MetricsSummary;
  events?: unknown[];
}

/**
 * Typed HTTP client for the PhantomInfra edge API.
 * Use from browsers, agents, or other Workers via service bindings.
 */
export class PhantomClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey?: string;
  private sessionId: string | null = null;

  constructor(options: PhantomClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
    this.apiKey = options.apiKey;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  bindSession(sessionId: string): void {
    this.sessionId = sessionId;
  }

  private authHeaders(): Record<string, string> {
    return this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...this.authHeaders(),
        ...(init?.headers ?? {}),
      },
    });
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      throw new Error(data.error ?? `PhantomClient ${res.status} ${path}`);
    }
    return data;
  }

  async health(): Promise<{
    ok: boolean;
    service: string;
    phase: number;
    globalPredictor?: { totalConfirms: number; routes: number } | null;
  }> {
    return this.request("/health");
  }

  async predictor(): Promise<{
    keyId: string;
    globalPredictor: { totalConfirms: number; routes: number } | null;
    rateRemaining: number;
  }> {
    return this.request("/v1/predictor");
  }

  async createSession(sessionId?: string): Promise<SessionView> {
    const created = await this.request<SessionView>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify(sessionId ? { sessionId } : {}),
    });
    this.sessionId = created.sessionId;
    return created;
  }

  private requireSession(): string {
    if (!this.sessionId) {
      throw new Error("No session — call createSession() first");
    }
    return this.sessionId;
  }

  async getSession(sessionId = this.requireSession()): Promise<SessionView> {
    return this.request(`/v1/sessions/${encodeURIComponent(sessionId)}`);
  }

  async speculate(input: {
    surface?: string;
    history?: string[];
    sessionId?: string;
  } = {}): Promise<SpeculateResult> {
    const id = input.sessionId ?? this.requireSession();
    return this.request(`/v1/sessions/${encodeURIComponent(id)}/speculate`, {
      method: "POST",
      body: JSON.stringify({
        surface: input.surface,
        history: input.history,
      }),
    });
  }

  async plan(
    plan: AgentPlan,
    options: { sessionId?: string } = {},
  ): Promise<SpeculateResult> {
    const id = options.sessionId ?? this.requireSession();
    return this.request(`/v1/sessions/${encodeURIComponent(id)}/agent/plan`, {
      method: "POST",
      body: JSON.stringify({ plan }),
    });
  }

  async confirm(
    route: string,
    payload?: unknown,
    sessionId = this.requireSession(),
  ): Promise<ConfirmView> {
    return this.request(`/v1/sessions/${encodeURIComponent(sessionId)}/confirm`, {
      method: "POST",
      body: JSON.stringify({ route, payload }),
    });
  }

  async metrics(sessionId = this.requireSession()): Promise<{
    sessionId: string;
    metrics: MetricsSummary;
  }> {
    return this.request(`/v1/sessions/${encodeURIComponent(sessionId)}/metrics`);
  }

  /**
   * Subscribe to live session events (SSE).
   * Returns an abort handle — call abort() to disconnect.
   */
  streamEvents(
    onEvent: (event: unknown) => void,
    options: { sessionId?: string; onError?: (err: Error) => void } = {},
  ): { abort: () => void } {
    const id = options.sessionId ?? this.requireSession();
    const controller = new AbortController();
    const url = new URL(
      `${this.baseUrl}/v1/sessions/${encodeURIComponent(id)}/events`,
    );
    if (this.apiKey) url.searchParams.set("api_key", this.apiKey);

    (async () => {
      try {
        const res = await this.fetchImpl(url.toString(), {
          headers: this.authHeaders(),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`SSE failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!line) continue;
            try {
              onEvent(JSON.parse(line.slice(6)));
            } catch {
              onEvent({ type: "raw", data: line.slice(6) });
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        options.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return { abort: () => controller.abort() };
  }
}

export type { AgentPlan, BranchSnapshot, MetricsSummary, SpeculativeResult };
