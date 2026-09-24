# Intellectual Property — PhantomInfra

**Version:** 1.4.1  
**License:** Proprietary — All Rights Reserved ([LICENSE](../LICENSE))  
**Copyright holder:** [@theworker02](https://github.com/theworker02)

## Licensing posture

| Mode | Document | Use |
|------|----------|-----|
| Default | [LICENSE](../LICENSE) | Proprietary; no open-source grant |
| Evaluation | [LICENSE-EVALUATION.md](./LICENSE-EVALUATION.md) | Diligence + live demo only |
| Commercial | [LICENSE-COMMERCIAL.md](./LICENSE-COMMERCIAL.md) | Production / OEM / SaaS (negotiated) |
| Acquisition | [ASSIGNMENT.md](./ASSIGNMENT.md) | Exclusive ownership transfer |

PhantomInfra is **not** MIT/Apache/GPL licensed. Earlier drafts may have used MIT; **current and authoritative terms are proprietary**.

## Owned / transferable assets

| Asset | Location | Notes |
|-------|----------|--------|
| Speculative COW runtime | `packages/runtime` | Predict → branch → shadow → commit / rollback |
| Route predictor (Markov + surface priors) | `packages/runtime/src/predictor.ts` | Learnable mesh via KV |
| Hit/miss proof harness | `packages/runtime/src/proof.ts` | Diligence-grade latency proof |
| Shadow / commit / compensate effects | `packages/runtime` | Safe speculative mutations |
| Policy + ledger + audit export | `packages/runtime` | Data-room ready |
| Edge reference (Workers + DO + KV) | `apps/edge` | Production-shaped implementation |
| Acquirer adapters | `packages/adapters` | Cloudflare / Vercel / Node |
| HTTP + SSE SDK | `packages/sdk` | Client integration surface |
| Demo catalog (cart + agent tools) | `packages/runtime/src/catalog` | Shared handlers / priors |
| Brand identity | `brand/` | Wordmark + logo (proprietary marks) |
| Diligence pack | `docs/` | Acquisition, IP, patents, term sheet, data room |

## Patent / trade-secret posture

- Implementation and system design are protected as **proprietary trade secrets** and copyright.  
- Patent rights are **reserved**; see [PATENT-NOTICE.md](./PATENT-NOTICE.md).  
- Commercial and evaluation licenses do **not** imply a patent grant unless signed paperwork says so.  
- No third-party copyleft (GPL/AGPL) in first-party packages — see [NOTICE](../NOTICE).

## Third-party & platform dependencies

| Dependency | Role | Risk |
|------------|------|------|
| Cloudflare Workers / Durable Objects / KV | Reference edge | Buyer may rehost via adapters |
| TypeScript / Node tooling | Build | Standard OSS (pass-through) |
| Vite / React (web app) | Local demos | Optional surface |

## Chain of title (diligence)

1. Sole copyright claimed by **theworker02** for first-party works in this monorepo.  
2. Contributions (if any) must be under Contributor License Agreement assigning or licensing IP to the copyright holder — see [CONTRIBUTING.md](../CONTRIBUTING.md).  
3. Live edge demo: https://phantominfra-edge.matthewlooney5.workers.dev  
4. Closing mechanics: [ASSIGNMENT.md](./ASSIGNMENT.md) · checklist: [DATA-ROOM.md](./DATA-ROOM.md)

## Trademarks

“PhantomInfra” and the wordmark/logo are proprietary identity marks. No trademark license is granted beyond factual identification during authorized evaluation, commercial license, or post-acquisition ownership by buyer.

## Related

- [ACQUISITION.md](./ACQUISITION.md)  
- [TERM-SHEET-OUTLINE.md](./TERM-SHEET-OUTLINE.md)  
- [LICENSE-COMMERCIAL.md](./LICENSE-COMMERCIAL.md)
