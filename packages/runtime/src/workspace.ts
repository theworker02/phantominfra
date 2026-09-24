/**
 * Copy-on-write ephemeral workspace.
 * Speculative branches clone production state; mutations stay local until commit.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep clone via structuredClone when available, else JSON. */
export function cloneState<T>(state: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state)) as T;
}

export interface SideEffect {
  label: string;
  apply: () => void | Promise<void>;
  compensate?: () => void | Promise<void>;
  shadowed: boolean;
}

export class CowWorkspace<TState extends object> {
  readonly id: string;
  readonly route: string;
  readonly probability: number;
  readonly openedAt: number;
  status: "running" | "ready" | "committed" | "rolled_back" = "running";
  result?: unknown;
  readyAt?: number;
  private draft: TState;
  private effects: SideEffect[] = [];
  private ttlTimer?: ReturnType<typeof setTimeout>;

  constructor(
    id: string,
    route: string,
    probability: number,
    production: TState,
  ) {
    this.id = id;
    this.route = route;
    this.probability = probability;
    this.openedAt = Date.now();
    this.draft = cloneState(production);
  }

  get state(): TState {
    return this.draft;
  }

  shadowedEffectLabels(): string[] {
    return this.effects.filter((e) => e.shadowed).map((e) => e.label);
  }

  mutate(fn: (draft: TState) => void): void {
    if (this.status !== "running" && this.status !== "ready") {
      throw new Error(`Cannot mutate branch ${this.id} in status ${this.status}`);
    }
    fn(this.draft);
  }

  effect(
    label: string,
    apply: () => void | Promise<void>,
    opts?: { shadowed?: boolean; compensate?: () => void | Promise<void> },
  ): void {
    this.effects.push({
      label,
      apply,
      compensate: opts?.compensate,
      shadowed: opts?.shadowed ?? false,
    });
  }

  markReady(result: unknown): void {
    this.result = result;
    this.readyAt = Date.now();
    this.status = "ready";
  }

  /**
   * Flush deferred commit effects against the draft, then promote into production.
   * On mid-flight failure, runs compensate() in reverse for already-applied effects.
   */
  async commit(production: {
    replace: (next: TState) => void;
    onEffect?: (label: string) => void;
    onCompensate?: (label: string) => void;
  }): Promise<string[]> {
    if (this.status !== "ready" && this.status !== "running") {
      throw new Error(`Cannot commit branch ${this.id} in status ${this.status}`);
    }
    this.clearTtl();
    const committed: string[] = [];
    try {
      for (const effect of this.effects) {
        await effect.apply();
        committed.push(effect.label);
        production.onEffect?.(effect.label);
      }
    } catch (err) {
      for (const label of [...committed].reverse()) {
        const effect = this.effects.find((e) => e.label === label);
        if (effect?.compensate) {
          await effect.compensate();
          production.onCompensate?.(label);
        }
      }
      this.status = "rolled_back";
      this.effects = [];
      throw err;
    }
    this.effects = [];
    production.replace(cloneState(this.draft));
    this.status = "committed";
    return committed;
  }

  /** Wipe ephemeral state — zero side effects on production. */
  rollback(): void {
    this.clearTtl();
    this.draft = {} as TState;
    this.effects = [];
    this.status = "rolled_back";
  }

  armTtl(ms: number, onExpire: () => void): void {
    this.clearTtl();
    this.ttlTimer = setTimeout(onExpire, ms);
  }

  clearTtl(): void {
    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer);
      this.ttlTimer = undefined;
    }
  }
}

/** Shallow merge helper for nested COW patches (unused by default path). */
export function patchObject(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      patchObject(target[key] as Record<string, unknown>, value);
    } else {
      target[key] = value;
    }
  }
}
