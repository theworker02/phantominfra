/** A candidate API route the predictor may pre-execute. */
export interface RouteCandidate {
  route: string;
  probability: number;
  /** Optional payload hint used when pre-running the handler. */
  payload?: unknown;
}

/** Observable event stream from the speculative engine. */
export type SpeculativeEvent =
  | { type: "predicted"; candidates: RouteCandidate[]; contextKey: string }
  | { type: "branch_opened"; branchId: string; route: string; probability: number }
  | { type: "pre_executed"; branchId: string; route: string; durationMs: number }
  | { type: "effect_shadowed"; branchId: string; label: string }
  | { type: "effect_committed"; branchId: string; label: string }
  | { type: "effect_compensated"; branchId: string; label: string }
  | { type: "policy_denied"; route: string; reason: string }
  | { type: "handler_timeout"; branchId: string; route: string; timeoutMs: number }
  | { type: "committed"; branchId: string; route: string; serverLatencyMs: number }
  | { type: "rolled_back"; branchId: string; route: string; reason: "miss" | "superseded" | "ttl" }
  | { type: "cold_path"; route: string; durationMs: number };

export type EventListener = (event: SpeculativeEvent) => void;

export interface EngineOptions<TState extends object = Record<string, unknown>> {
  /** Initial production state snapshot. */
  initialState: TState;
  /** How many top candidates to speculate (default 2). */
  topK?: number;
  /** Minimum probability to open a speculative branch (default 0.15). */
  minProbability?: number;
  /** Branch time-to-live in ms before automatic rollback (default 8000). */
  branchTtlMs?: number;
  /** Simulated network/compute delay for cold-path execution (demo). */
  coldPathDelayMs?: number;
  /** Kill a speculative/cold handler after this many ms (default: none). */
  handlerTimeoutMs?: number;
  /** Optional speculation policy (deny lists, caps, shadow requirements). */
  policy?: import("./policy.js").SpeculationPolicy;
}

export interface EffectOptions {
  /**
   * Runs immediately during speculative (and cold-path) execution against the
   * ephemeral draft. Never touches production. Real `apply` still waits for commit.
   */
  shadow?: () => void | Promise<void>;
  /**
   * Runs if a later commit-time effect throws — undo already-applied effects
   * in reverse order (compensating transaction).
   */
  compensate?: () => void | Promise<void>;
}

export interface HandlerContext<TState extends object = Record<string, unknown>> {
  state: TState;
  /** Mutate ephemeral branch state. Changes are discarded on rollback. */
  mutate: (fn: (draft: TState) => void) => void;
  /**
   * Record a side effect. `apply` runs only on commit.
   * Optional `shadow` runs immediately against the draft during speculation.
   */
  effect: (
    label: string,
    apply: () => void | Promise<void>,
    options?: EffectOptions,
  ) => Promise<void>;
  payload: unknown;
  route: string;
  branchId: string;
}

export type RouteHandler<TState extends object = Record<string, unknown>> = (
  ctx: HandlerContext<TState>,
) => Promise<unknown> | unknown;

export interface SpeculativeResult {
  hit: boolean;
  route: string;
  result: unknown;
  /** Wall time from confirm() call to ready response — ~0 on hit. */
  serverLatencyMs: number;
  branchId?: string;
  state: Record<string, unknown>;
}

export interface BranchSnapshot {
  id: string;
  route: string;
  probability: number;
  status: "running" | "ready" | "committed" | "rolled_back";
  result?: unknown;
  openedAt: number;
  readyAt?: number;
  shadowedEffects?: string[];
}
