# Contributing

Thanks for interest in PhantomInfra.

**Important:** This project is **proprietary**. Contributions are accepted only under terms that assign (or irrevocably license) IP to the copyright holder (**theworker02**). Do not submit code expecting MIT/open-source treatment.

## Dev setup

```bash
npm install
npm test
npm run bench
npm run dev
npm run dev:edge
```

## Guidelines

- Prefer small, focused PRs  
- Keep speculative side effects behind `shadow` / `compensate`  
- Add tests for runtime behavior changes  
- Run `npm run build` before pushing  
- Do not commit secrets (`.env`, real API keys, account IDs)  
- Do not remove proprietary license headers or `LICENSE` terms  

## Contributor IP

By submitting a contribution (PR, patch, or suggestion that becomes source), you agree that:

1. You have the right to submit it;  
2. You assign all right, title, and interest in the contribution to the copyright holder, **or** grant an irrevocable, perpetual, worldwide, royalty-free license to use, modify, sublicense, and commercialize it as part of PhantomInfra;  
3. Your contribution is not knowingly encumbered by GPL/AGPL or other terms incompatible with proprietary licensing.

If you cannot agree, do not contribute — open a discussion instead.

## Package map

| Path | Purpose |
|------|---------|
| `packages/runtime` | Core engine |
| `packages/sdk` | HTTP/SSE client |
| `packages/adapters` | Workers / Vercel / Node |
| `apps/edge` | Cloudflare reference deploy |
| `apps/web` | Marketing + demos |

## License

Proprietary — see [`LICENSE`](./LICENSE), [`docs/LICENSE-EVALUATION.md`](./docs/LICENSE-EVALUATION.md), and [`docs/LICENSE-COMMERCIAL.md`](./docs/LICENSE-COMMERCIAL.md).
