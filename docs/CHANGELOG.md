# Changelog

## 1.4.2

- **Proprietary licensing** (replaces MIT): root `LICENSE`, evaluation + commercial terms
- Acquisition data room: assignment outline, term sheet, patent notice, `NOTICE`, thickened IP/ACQUISITION
- Contributor IP assignment language in `CONTRIBUTING.md`

## 1.4.1

- Live hit-vs-miss **proof** (`GET /v1/proof`, playground **Prove it**)
- Public diligence **value** snapshot (`GET /v1/value`)
- `runHitMissProof()` in `@phantominfra/runtime` (same story as `npm run bench`)

## 1.4.0

- Interactive live playground with seven cases (browse, quote, checkout, inventory, support, agent, search)
- Public `POST /v1/demo` session / speculate / confirm / run API
- Isolated demo sessions (surface priors, no global mesh skew)
- New catalog routes: `cart.remove`, `inventory.check`, `support.refund`
- Brand wordmark, GitHub Pages landing, IP + acquisition diligence docs
- README badges, screenshots, animated demo loop

## 1.3.0

- Phase 5 edge: auth, rate limits, OpenAPI, SSE, audit export
- Predictor KV mesh + Durable Object sticky sessions
- Acquirer adapters (Workers / Vercel / Node)
- Whitepaper, security threat model, one-pager, Loom script

## 0.6.0

- Initial monorepo: runtime, SDK, web demos, edge Worker
