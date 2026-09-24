import type { PhantomEngine, RouteHandler } from "@phantominfra/runtime";

export type SurfaceResolver = (request: Request) => string | undefined;

export interface SpeculateGateOptions<TState extends object> {
  engine: PhantomEngine<TState>;
  /**
   * Map an incoming request to a registered route.
   * Return null to skip speculation / pass through.
   */
  resolveRoute: (request: Request) => string | null;
  /** Optional surface for predictor priors (e.g. from path or header). */
  resolveSurface?: SurfaceResolver;
  /** Header that triggers speculate-only (no confirm) — default x-phantom-speculate. */
  speculateHeader?: string;
  /** When true, every matched request auto-speculates before confirm. */
  alwaysSpeculate?: boolean;
}

export interface SpeculateGateResult {
  hit: boolean;
  route: string;
  serverLatencyMs: number;
  result: unknown;
  state: Record<string, unknown>;
}

/**
 * Framework-agnostic speculative gate.
 * Pattern used by Workers / Vercel / Node adapters:
 * 1. Optional speculate warm-up (header or always)
 * 2. Confirm the resolved route on the real request
 */
export async function handleWithSpeculation<TState extends object>(
  request: Request,
  options: SpeculateGateOptions<TState>,
): Promise<SpeculateGateResult | Response> {
  const route = options.resolveRoute(request);
  if (!route) {
    return new Response(JSON.stringify({ error: "unroutable" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const speculateHeader = options.speculateHeader ?? "x-phantom-speculate";
  const surface = options.resolveSurface?.(request);
  const wantsSpeculateOnly =
    request.headers.get(speculateHeader) === "1" ||
    request.headers.get(speculateHeader)?.toLowerCase() === "true";

  if (wantsSpeculateOnly || options.alwaysSpeculate) {
    await options.engine.speculate({
      contextKey: request.headers.get("x-phantom-session") ?? "adapter",
      surface,
    });
  }

  if (wantsSpeculateOnly && request.method === "POST") {
    // Warm-only probe used by clients / agents before the real call
    return new Response(
      JSON.stringify({
        ok: true,
        speculated: true,
        branches: options.engine.listBranches(),
      }),
      { headers: { "content-type": "application/json", "x-phantom-mode": "speculate" } },
    );
  }

  let payload: unknown;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      payload = await request.clone().json();
    } catch {
      payload = undefined;
    }
  }

  // Ensure at least one speculate pass before confirm when alwaysSpeculate
  if (options.alwaysSpeculate && options.engine.listBranches().length === 0) {
    await options.engine.speculate({
      contextKey: request.headers.get("x-phantom-session") ?? "adapter",
      surface,
    });
  }

  const confirmed = await options.engine.confirm(route, payload);
  return confirmed;
}

export function jsonResult(result: SpeculateGateResult): Response {
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-phantom-hit": result.hit ? "1" : "0",
      "x-phantom-latency-ms": String(result.serverLatencyMs),
    },
  });
}

/** Helper to register a flat route map onto an engine. */
export function registerRoutes<TState extends object>(
  engine: PhantomEngine<TState>,
  routes: Record<string, RouteHandler<TState>>,
): void {
  for (const [route, handler] of Object.entries(routes)) {
    engine.register(route, handler);
  }
}
