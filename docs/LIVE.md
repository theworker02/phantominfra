# Live deployment

**Try it:** [https://phantominfra-edge.matthewlooney5.workers.dev](https://phantominfra-edge.matthewlooney5.workers.dev)

Pick a case (**Browse / Quote / Checkout / Inventory / Support / Agent / Search**) — it auto-speculates. Confirm a branch, or **Tour all** for seven different 0ms hits plus a forced miss.

**GitHub Pages front door:** enable **Settings → Pages → Deploy from branch → `/docs`**. Landing: [`index.html`](./index.html) → live Worker.

| Endpoint | Notes |
|----------|--------|
| [`/`](https://phantominfra-edge.matthewlooney5.workers.dev/) | Interactive demo |
| [`/v1/proof`](https://phantominfra-edge.matthewlooney5.workers.dev/v1/proof) | Live HIT vs MISS proof |
| [`/v1/value`](https://phantominfra-edge.matthewlooney5.workers.dev/v1/value) | Diligence value snapshot |
| `POST /v1/demo` | session / speculate / confirm / run / proof |
| [`/health`](https://phantominfra-edge.matthewlooney5.workers.dev/health) | Liveness |
| [`/openapi.json`](https://phantominfra-edge.matthewlooney5.workers.dev/openapi.json) | Full API |

Optional key for scripted calls: `Authorization: Bearer dev_phantom_key`

```bash
curl -X POST https://phantominfra-edge.matthewlooney5.workers.dev/v1/demo -H "content-type: application/json" -d "{\"action\":\"run\",\"surface\":\"checkout\"}"
```

## Point the web app at prod

```bash
# apps/web/.env.local
VITE_EDGE_URL=https://phantominfra-edge.matthewlooney5.workers.dev
VITE_EDGE_API_KEY=dev_phantom_key
```

Then `npm run dev` and flip the demo to **Edge Worker**.

## Inbound assets

- One-pager (Print → PDF): [`one-pager.html`](./one-pager.html)
- Loom script: [`LOOM_SCRIPT.md`](./LOOM_SCRIPT.md)
- Acquisition brief: [`ACQUISITION.md`](./ACQUISITION.md)
- Data room: [`DATA-ROOM.md`](./DATA-ROOM.md)
- IP inventory: [`IP.md`](./IP.md)
- Screenshots / demo loop: [`assets/`](./assets/)
