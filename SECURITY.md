# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.x (main) | Yes — pre-1.0, APIs may change |

## Threat model (summary)

PhantomInfra executes **speculative** server-side work. The primary risks are:

1. **Irreversible side effects during speculate**  
   Mitigated by shadow/commit split. Policy can `requireShadowFor` labels (e.g. `stripe.capture`).

2. **Resource exhaustion via unbounded speculation**  
   Mitigated by `maxBranches`, branch TTL, handler timeouts, and edge rate limits.

3. **Session fixation / unauthorized confirm**  
   Mitigated by API keys (`API_KEYS`), optional `ALLOW_ANON=false` in production.

4. **Predictor model poisoning**  
   Global KV merges are additive; treat predictor input as untrusted signal, not authz.

5. **Data leakage via SSE / audit export**  
   Event streams and `exportAuditBundle()` may include application state — protect with auth and least privilege.

## Reporting a vulnerability

Please open a **private** security advisory on GitHub or email the maintainer via GitHub [@theworker02](https://github.com/theworker02).

Do not file public issues for exploitable flaws until a fix is available.

## Production checklist

- [ ] `ALLOW_ANON=false`  
- [ ] Strong `API_KEYS` via `wrangler secret`  
- [ ] Shadow required for all irreversible effect labels  
- [ ] Rate limits tuned per tier  
- [ ] Audit bundle access restricted  
- [ ] KV / DO namespaces isolated per environment  
