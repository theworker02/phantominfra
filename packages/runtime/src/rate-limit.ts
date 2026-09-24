/**
 * Token-bucket rate limiter (edge Worker / Durable Object friendly).
 */
export interface RateLimitConfig {
  /** Max tokens in the bucket. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

export interface RateLimitState {
  tokens: number;
  updatedAtMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  state: RateLimitState;
}

export function createRateLimitState(config: RateLimitConfig, now = Date.now()): RateLimitState {
  return { tokens: config.capacity, updatedAtMs: now };
}

export function takeToken(
  state: RateLimitState,
  config: RateLimitConfig,
  now = Date.now(),
): RateLimitResult {
  const elapsedSec = Math.max(0, (now - state.updatedAtMs) / 1000);
  const refilled = Math.min(
    config.capacity,
    state.tokens + elapsedSec * config.refillPerSecond,
  );

  if (refilled < 1) {
    const need = 1 - refilled;
    const retryAfterMs = Math.ceil((need / config.refillPerSecond) * 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
      state: { tokens: refilled, updatedAtMs: now },
    };
  }

  const next = refilled - 1;
  return {
    allowed: true,
    remaining: Math.floor(next),
    retryAfterMs: 0,
    state: { tokens: next, updatedAtMs: now },
  };
}
