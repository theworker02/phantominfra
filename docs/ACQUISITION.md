# Acquisition Brief — PhantomInfra

**Version:** 1.4.1  
**Status:** Pre-revenue · working runtime + live edge · **Proprietary IP**  
**Thesis:** Own the speculative execution layer for the edge, and backend latency becomes a commit — not a round trip.

**Live demo:** https://phantominfra-edge.matthewlooney5.workers.dev  
**Data room index:** [DATA-ROOM.md](./DATA-ROOM.md)  
**Pages front door:** [index.html](./index.html) (GitHub Pages → `/docs`)

## Executive summary

PhantomInfra is a **proprietary** speculative zero-latency edge engine: predict the next API/tool call, pre-execute on copy-on-write branches with shadow side effects, then **commit** (~0ms) or **roll back**.  

There is no ARR story. The asset is **runtime IP + Cloudflare reference edge + acquirer-shaped adapters + diligence pack**, offered for:

1. **Exclusive acquisition / acqui-hire**, or  
2. **Commercial license** (non-exclusive production use)

## Why this is valuable without revenue

1. **Category creation, not a feature tweak**  
   Caching and prefetch hide reads. PhantomInfra speculatively executes *mutations and tool calls* on COW branches with shadow/compensate semantics — closer to CPU branch prediction than CDN caching.

2. **Mapped to buyer product lines**  

   | Acquirer | Fit |
   |----------|-----|
   | Cloudflare | Workers + Durable Objects + KV — already implemented |
   | Vercel | Edge / Fluid — `@phantominfra/adapters` Vercel handler |
   | Fastly | Compute@Edge path via fetch adapter pattern |
   | AWS / Azure | Node adapter → Lambda / Functions warm-path |
   | Agent platforms | Tool-call speculation while models plan |

3. **Diligence artifacts included**  
   - Whitepaper · IP inventory · patent/trade-secret notice  
   - Proprietary + commercial + evaluation licenses  
   - Assignment outline · term sheet outline · data room index  
   - Threat model · OpenAPI · bench · live `/v1/proof` (~100×+ hit vs miss in demo)  
   - `/v1/value` diligence snapshot · audit export · brand wordmark  

4. **Agent-era timing**  
   Tool-call latency dominates agent UX. Speculating tools mid-plan is a wedge into every agent runtime.

5. **Low integration cost**  
   Drop-in adapters wrap an existing route map. Shadow effects keep irreversible I/O off production until confirm.

## Proprietary licensing (current)

| Document | Role |
|----------|------|
| [LICENSE](../LICENSE) | All rights reserved + limited evaluation grant |
| [LICENSE-EVALUATION.md](./LICENSE-EVALUATION.md) | Diligence / demo only |
| [LICENSE-COMMERCIAL.md](./LICENSE-COMMERCIAL.md) | Production / OEM / SaaS framework |
| [ASSIGNMENT.md](./ASSIGNMENT.md) | Exclusive IP transfer outline |
| [TERM-SHEET-OUTLINE.md](./TERM-SHEET-OUTLINE.md) | Non-binding deal framework |
| [PATENT-NOTICE.md](./PATENT-NOTICE.md) | Trade secret + reserved patent rights |
| [NOTICE](../NOTICE) | Third-party OSS pass-through |

**Not open source.** Redistribution and production use require a signed commercial license or acquisition.

## Transaction paths

### Path A — Buy (preferred for strategic buyers)

Exclusive assignment of copyright, marks, trade secrets, and demo migration assistance.  
See [ASSIGNMENT.md](./ASSIGNMENT.md) + [TERM-SHEET-OUTLINE.md](./TERM-SHEET-OUTLINE.md).

### Path B — License

Non-exclusive commercial license for internal production, OEM, or SaaS operator scope.  
See [LICENSE-COMMERCIAL.md](./LICENSE-COMMERCIAL.md).

### Path C — Evaluate first

NDA → run live proof + bench → security review → Path A or B.  
See [LICENSE-EVALUATION.md](./LICENSE-EVALUATION.md) + [DATA-ROOM.md](./DATA-ROOM.md).

## Suggested diligence package

```bash
npm ci
npm test && npm run bench && npm run build
curl -s "https://phantominfra-edge.matthewlooney5.workers.dev/v1/proof?rounds=6"
curl -s "https://phantominfra-edge.matthewlooney5.workers.dev/v1/value"
# Audit: engine.exportAuditBundle() or GET /v1/sessions/:id/audit
# UI: open live playground → Tour all → Prove it
```

## Ask framing (non-binding)

Strategic **technology acquisition** or **acqui-hire** into an edge or agent runtime org.  
Value = **proprietary runtime IP + edge reference + adapters + brand**, not ARR.

Secondary: paid commercial license if exclusive sale is not the fit.

**Contact:** [theworker02](https://github.com/theworker02) · [thanks.dev/u/gh/theworker02](https://thanks.dev/u/gh/theworker02)

---

*Business and licensing templates only. Not a binding offer or legal advice.*
