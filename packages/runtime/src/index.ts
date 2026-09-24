export { PhantomEngine } from "./executor.js";
export { RoutePredictor, mergePredictorModels } from "./predictor.js";
export { CowWorkspace, cloneState } from "./workspace.js";
export { emptyMetrics, summarizeMetrics } from "./metrics.js";
export { createSnapshotId } from "./snapshot.js";
export { predictFromAgentPlan, AGENT_TOOLS } from "./agent.js";
export { applySpeculationPolicy } from "./policy.js";
export {
  createRateLimitState,
  takeToken,
} from "./rate-limit.js";
export { PhantomError, isPhantomError } from "./errors.js";
export { EffectLedger } from "./ledger.js";
export { buildValueReport } from "./value.js";
export { runHitMissProof } from "./proof.js";
export type { ProofReport, ProofSample } from "./proof.js";
export {
  applyCartSurfacePriors,
  createCartHandlers,
  DEFAULT_CART_STATE,
} from "./catalog/cart.js";
export {
  applyAgentSurfacePriors,
  createAgentToolHandlers,
} from "./catalog/agent.js";
export type { CartState } from "./catalog/cart.js";
export type {
  AgentPlan,
  AgentPlanStep,
  AgentPrediction,
  ToolSpec,
} from "./agent.js";
export type { PredictorModel } from "./predictor.js";
export type { SpeculationPolicy, PolicyDecision } from "./policy.js";
export type { RateLimitConfig, RateLimitState, RateLimitResult } from "./rate-limit.js";
export type { EffectLedgerEntry, EffectPhase } from "./ledger.js";
export type { PhantomErrorCode } from "./errors.js";
export type { AuditBundle, ValueReport } from "./value.js";
export type { EngineMetrics, MetricsSummary } from "./metrics.js";
export type { EngineSnapshot } from "./snapshot.js";
export type {
  BranchSnapshot,
  EffectOptions,
  EngineOptions,
  EventListener,
  HandlerContext,
  RouteCandidate,
  RouteHandler,
  SpeculativeEvent,
  SpeculativeResult,
} from "./types.js";
export type { PredictorInput } from "./predictor.js";
