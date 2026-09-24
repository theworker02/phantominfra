import type { PhantomEngine } from "@phantominfra/runtime";
import {
  handleWithSpeculation,
  jsonResult,
  type SpeculateGateOptions,
  type SurfaceResolver,
} from "./gate.js";

export interface WorkersAdapterOptions<TState extends object>
  extends Omit<SpeculateGateOptions<TState>, "engine"> {
  engine: PhantomEngine<TState>;
}

/**
 * Cloudflare Workers fetch handler wrapper.
 * Drop into `export default { fetch }` or compose with other middleware.
 *
 * Acquisition fit: Cloudflare Workers / Durable Objects product line.
 */
export function createWorkersFetchHandler<TState extends object>(
  options: WorkersAdapterOptions<TState>,
): (request: Request, env?: unknown, ctx?: { waitUntil(p: Promise<unknown>): void }) => Promise<Response> {
  return async (request, _env, ctx) => {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers":
            "content-type, authorization, x-phantom-speculate, x-phantom-session",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
      });
    }

    const result = await handleWithSpeculation(request, options);
    if (result instanceof Response) return result;

    // Publish metrics asynchronously when waitUntil is available
    ctx?.waitUntil?.(
      Promise.resolve().then(() => {
        // Placeholder for analytics / KV mesh publish hooks
      }),
    );

    return jsonResult(result);
  };
}

/** Common surface resolver: first path segment or x-phantom-surface header. */
export const pathSurfaceResolver: SurfaceResolver = (request) => {
  const header = request.headers.get("x-phantom-surface");
  if (header) return header;
  const path = new URL(request.url).pathname.replace(/^\//, "");
  return path.split("/")[0] || undefined;
};
