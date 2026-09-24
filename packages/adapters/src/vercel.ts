import type { PhantomEngine } from "@phantominfra/runtime";
import {
  handleWithSpeculation,
  jsonResult,
  type SpeculateGateOptions,
} from "./gate.js";

export interface VercelEdgeAdapterOptions<TState extends object>
  extends Omit<SpeculateGateOptions<TState>, "engine"> {
  engine: PhantomEngine<TState>;
}

/**
 * Vercel Edge / Next.js middleware-compatible handler.
 * Use from `middleware.ts` or an Edge Route Handler.
 *
 * Acquisition fit: Vercel Edge Functions / Fluid compute.
 */
export function createVercelEdgeHandler<TState extends object>(
  options: VercelEdgeAdapterOptions<TState>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const result = await handleWithSpeculation(request, options);
    if (result instanceof Response) return result;
    return jsonResult(result);
  };
}

/**
 * Example Next.js-style matcher config string for docs.
 * Copy into middleware.ts: `export const config = { matcher: PHANTOM_MATCHER }`
 */
export const PHANTOM_MATCHER = ["/api/:path*", "/v1/:path*"];
