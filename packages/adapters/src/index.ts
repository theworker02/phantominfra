export {
  handleWithSpeculation,
  jsonResult,
  registerRoutes,
} from "./gate.js";
export {
  createWorkersFetchHandler,
  pathSurfaceResolver,
} from "./workers.js";
export {
  createVercelEdgeHandler,
  PHANTOM_MATCHER,
} from "./vercel.js";
export { createNodeRequestListener } from "./node.js";
export type {
  SpeculateGateOptions,
  SpeculateGateResult,
  SurfaceResolver,
} from "./gate.js";
export type { WorkersAdapterOptions } from "./workers.js";
export type { VercelEdgeAdapterOptions } from "./vercel.js";
export type { NodeAdapterOptions } from "./node.js";
