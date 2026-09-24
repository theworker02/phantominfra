import {
  mergePredictorModels,
  type PredictorModel,
} from "@phantominfra/runtime";

const GLOBAL_KEY = "global_predictor_v1";

/** Read the shared predictor mesh from KV. */
export async function loadGlobalPredictor(
  kv: KVNamespace | undefined,
): Promise<PredictorModel | null> {
  if (!kv) return null;
  const raw = await kv.get(GLOBAL_KEY, "json");
  if (!raw || typeof raw !== "object") return null;
  return raw as PredictorModel;
}

/** Merge a session delta into the global predictor model (best-effort). */
export async function publishPredictorDelta(
  kv: KVNamespace | undefined,
  delta: PredictorModel,
): Promise<PredictorModel | null> {
  if (!kv) return null;
  const existing = await loadGlobalPredictor(kv);
  const merged = mergePredictorModels(existing, delta);
  await kv.put(GLOBAL_KEY, JSON.stringify(merged));
  return merged;
}

export async function globalPredictorStats(
  kv: KVNamespace | undefined,
): Promise<{ totalConfirms: number; routes: number } | null> {
  const model = await loadGlobalPredictor(kv);
  if (!model) return null;
  return {
    totalConfirms: model.totalConfirms,
    routes: Object.keys(model.globalCounts).length,
  };
}
