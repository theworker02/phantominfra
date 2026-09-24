/**
 * API key auth for the edge Worker.
 * Dev default: ALLOW_ANON=true (or unset keys) permits open access.
 * Production: set API_KEYS=key1,key2 and ALLOW_ANON=false.
 */

export interface AuthEnv {
  API_KEYS?: string;
  ALLOW_ANON?: string;
}

export interface AuthResult {
  ok: boolean;
  keyId: string | null;
  error?: string;
}

export function authorize(request: Request, env: AuthEnv): AuthResult {
  const configured = (env.API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const allowAnon =
    env.ALLOW_ANON === "true" ||
    env.ALLOW_ANON === "1" ||
    configured.length === 0;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const queryKey = new URL(request.url).searchParams.get("api_key");
  const presented = bearer || queryKey || null;

  if (!presented) {
    if (allowAnon) return { ok: true, keyId: "anon" };
    return { ok: false, keyId: null, error: "missing_api_key" };
  }

  if (configured.length === 0) {
    return { ok: true, keyId: hashKeyId(presented) };
  }

  if (configured.includes(presented)) {
    return { ok: true, keyId: hashKeyId(presented) };
  }

  return { ok: false, keyId: null, error: "invalid_api_key" };
}

function hashKeyId(key: string): string {
  // Non-cryptographic short id for logs / rate-limit buckets
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `key_${h.toString(36)}`;
}
