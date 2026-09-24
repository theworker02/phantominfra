# Data Room Index — PhantomInfra

Virtual data room checklist for acquisition or commercial-license diligence.

**Live proof:** https://phantominfra-edge.matthewlooney5.workers.dev  
**Version:** 1.4.1+

## A. Corporate / ownership

| Doc | Path | Status |
|-----|------|--------|
| Proprietary license | [`../LICENSE`](../LICENSE) | Ready |
| Evaluation terms | [`LICENSE-EVALUATION.md`](./LICENSE-EVALUATION.md) | Ready |
| Commercial framework | [`LICENSE-COMMERCIAL.md`](./LICENSE-COMMERCIAL.md) | Template |
| IP assignment outline | [`ASSIGNMENT.md`](./ASSIGNMENT.md) | Template |
| Term sheet outline | [`TERM-SHEET-OUTLINE.md`](./TERM-SHEET-OUTLINE.md) | Template |
| IP inventory | [`IP.md`](./IP.md) | Ready |
| Patent / trade-secret notice | [`PATENT-NOTICE.md`](./PATENT-NOTICE.md) | Ready |
| Third-party notices | [`../NOTICE`](../NOTICE) | Ready |
| Funding / contact | [`../.github/FUNDING.yml`](../.github/FUNDING.yml) | Ready |

## B. Product & technical

| Doc / artifact | Path / command | Status |
|----------------|----------------|--------|
| Acquisition brief | [`ACQUISITION.md`](./ACQUISITION.md) | Ready |
| Whitepaper | [`whitepaper.md`](./whitepaper.md) | Ready |
| Security / threat model | [`../SECURITY.md`](../SECURITY.md) | Ready |
| Live notes | [`LIVE.md`](./LIVE.md) | Ready |
| One-pager | [`one-pager.html`](./one-pager.html) | Ready |
| OpenAPI | `GET /openapi.json` on live Worker | Ready |
| Hit/miss proof | `GET /v1/proof` | Ready |
| Value snapshot | `GET /v1/value` | Ready |
| Audit export | `engine.exportAuditBundle()` / `GET …/audit` | Ready |
| Bench | `npm run bench` | Ready |
| CI | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Ready |

## C. Brand

| Asset | Path |
|-------|------|
| Wordmark PNG | [`../brand/wordmark.png`](../brand/wordmark.png) |
| Logo SVG | [`../brand/logo.svg`](../brand/logo.svg) |
| Screenshots | [`assets/`](./assets/) |

## D. Suggested buyer diligence commands

```bash
npm ci
npm test && npm run bench && npm run build
curl -s https://phantominfra-edge.matthewlooney5.workers.dev/v1/proof?rounds=6
curl -s https://phantominfra-edge.matthewlooney5.workers.dev/v1/value
```

## E. Still buyer-side / at signing

- [ ] NDA executed  
- [ ] Definitive purchase agreement / CLA  
- [ ] Employment or consulting agreements (if any)  
- [ ] Cloud account transfer checklist  
- [ ] Public announcement plan  

---

*Index only. Missing checkboxes are intentional closing items, not product gaps.*
