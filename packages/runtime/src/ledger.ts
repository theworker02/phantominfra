export type EffectPhase = "shadow" | "commit" | "compensate";

export interface EffectLedgerEntry {
  branchId: string;
  route: string;
  label: string;
  phase: EffectPhase;
  at: number;
  ok: boolean;
  error?: string;
}

/** Append-only ledger of shadow / commit / compensate effect activity. */
export class EffectLedger {
  private entries: EffectLedgerEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  record(entry: Omit<EffectLedgerEntry, "at"> & { at?: number }): void {
    this.entries.unshift({
      ...entry,
      at: entry.at ?? Date.now(),
    });
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }
  }

  list(limit = 50): EffectLedgerEntry[] {
    return this.entries.slice(0, limit);
  }

  clear(): void {
    this.entries = [];
  }

  summary(): { shadows: number; commits: number; compensates: number; failures: number } {
    let shadows = 0;
    let commits = 0;
    let compensates = 0;
    let failures = 0;
    for (const e of this.entries) {
      if (!e.ok) failures += 1;
      if (e.phase === "shadow") shadows += 1;
      else if (e.phase === "commit") commits += 1;
      else compensates += 1;
    }
    return { shadows, commits, compensates, failures };
  }
}
