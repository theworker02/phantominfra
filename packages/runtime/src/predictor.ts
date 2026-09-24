import type { RouteCandidate } from "./types.js";

export type PredictorModel = {
  transitions: Record<string, Record<string, number>>;
  surfacePriors: Record<string, Record<string, number>>;
  globalCounts: Record<string, number>;
  totalConfirms: number;
};

export interface PredictorInput {
  /** Session / user / agent identity key for transition history. */
  contextKey: string;
  /** Optional hint of the current UI surface or agent plan step. */
  surface?: string;
  /** Recent confirmed routes (most recent last). */
  history?: string[];
}

/**
 * Real-time probabilistic route predictor.
 * Combines Markov transitions from observed history with surface priors.
 */
export class RoutePredictor {
  private transitions = new Map<string, Map<string, number>>();
  private surfacePriors = new Map<string, Map<string, number>>();
  private globalCounts = new Map<string, number>();
  private totalConfirms = 0;

  /** Register a known route so cold starts still have a prior. */
  registerRoute(route: string, priorWeight = 1): void {
    this.globalCounts.set(route, (this.globalCounts.get(route) ?? 0) + priorWeight);
  }

  /** Bias predictions when the user is on a given surface. */
  setSurfacePrior(surface: string, route: string, weight: number): void {
    if (!this.surfacePriors.has(surface)) {
      this.surfacePriors.set(surface, new Map());
    }
    this.surfacePriors.get(surface)!.set(route, weight);
  }

  /** Learn from a confirmed route transition. */
  observe(fromRoute: string | null, toRoute: string): void {
    this.totalConfirms += 1;
    this.globalCounts.set(toRoute, (this.globalCounts.get(toRoute) ?? 0) + 1);

    if (!fromRoute) return;
    if (!this.transitions.has(fromRoute)) {
      this.transitions.set(fromRoute, new Map());
    }
    const row = this.transitions.get(fromRoute)!;
    row.set(toRoute, (row.get(toRoute) ?? 0) + 1);
  }

  predict(input: PredictorInput, topK = 3): RouteCandidate[] {
    const scores = new Map<string, number>();
    const last = input.history?.at(-1) ?? null;

    const globalTotal = [...this.globalCounts.values()].reduce((a, b) => a + b, 0) || 1;
    for (const [route, count] of this.globalCounts) {
      scores.set(route, (count / globalTotal) * 0.25);
    }

    if (last && this.transitions.has(last)) {
      const row = this.transitions.get(last)!;
      const rowTotal = [...row.values()].reduce((a, b) => a + b, 0) || 1;
      for (const [route, count] of row) {
        scores.set(route, (scores.get(route) ?? 0) + (count / rowTotal) * 0.55);
      }
    }

    if (input.surface && this.surfacePriors.has(input.surface)) {
      const priors = this.surfacePriors.get(input.surface)!;
      const priorTotal = [...priors.values()].reduce((a, b) => a + b, 0) || 1;
      for (const [route, weight] of priors) {
        scores.set(route, (scores.get(route) ?? 0) + (weight / priorTotal) * 0.35);
      }
    }

    const entries = [...scores.entries()];
    const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
    return entries
      .map(([route, score]) => ({
        route,
        probability: Number((score / sum).toFixed(4)),
      }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, topK);
  }

  exportModel(): PredictorModel {
    return {
      transitions: mapOfMapsToObject(this.transitions),
      surfacePriors: mapOfMapsToObject(this.surfacePriors),
      globalCounts: Object.fromEntries(this.globalCounts),
      totalConfirms: this.totalConfirms,
    };
  }

  importModel(model: PredictorModel): void {
    this.transitions = objectToMapOfMaps(model.transitions);
    this.surfacePriors = objectToMapOfMaps(model.surfacePriors);
    this.globalCounts = new Map(Object.entries(model.globalCounts));
    this.totalConfirms = model.totalConfirms;
  }

  /**
   * Absorb another model's counts (global KV learning mesh).
   * Additive merge — does not replace local session evidence.
   */
  mergeModel(other: PredictorModel, weight = 1): void {
    const w = Math.max(0, weight);
    this.totalConfirms += Math.round(other.totalConfirms * w);

    for (const [route, count] of Object.entries(other.globalCounts)) {
      this.globalCounts.set(
        route,
        (this.globalCounts.get(route) ?? 0) + Math.round(count * w),
      );
    }

    for (const [from, row] of Object.entries(other.transitions)) {
      if (!this.transitions.has(from)) this.transitions.set(from, new Map());
      const local = this.transitions.get(from)!;
      for (const [to, count] of Object.entries(row)) {
        local.set(to, (local.get(to) ?? 0) + Math.round(count * w));
      }
    }

    for (const [surface, row] of Object.entries(other.surfacePriors)) {
      if (!this.surfacePriors.has(surface)) this.surfacePriors.set(surface, new Map());
      const local = this.surfacePriors.get(surface)!;
      for (const [route, count] of Object.entries(row)) {
        local.set(route, (local.get(route) ?? 0) + Math.round(count * w));
      }
    }
  }
}

/** Pure merge of two exported models (for KV read-modify-write). */
export function mergePredictorModels(
  a: PredictorModel | null | undefined,
  b: PredictorModel,
): PredictorModel {
  const base = new RoutePredictor();
  if (a) base.importModel(a);
  base.mergeModel(b);
  return base.exportModel();
}

function mapOfMapsToObject(
  map: Map<string, Map<string, number>>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [k, v] of map) {
    out[k] = Object.fromEntries(v);
  }
  return out;
}

function objectToMapOfMaps(
  obj: Record<string, Record<string, number>>,
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const [k, v] of Object.entries(obj)) {
    map.set(k, new Map(Object.entries(v)));
  }
  return map;
}
