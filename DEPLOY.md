# Deploy PhantomInfra Edge

## Prerequisites

- Cloudflare account
- `npx wrangler login`
- Node 18+

## 1. Create KV namespace

```bash
cd apps/edge
npx wrangler kv namespace create PREDICTOR_KV
npx wrangler kv namespace create PREDICTOR_KV --preview
```

Copy the returned IDs into `wrangler.jsonc` → `kv_namespaces[0].id` / `preview_id`.

## 2. Configure secrets / vars

Local defaults in `wrangler.jsonc`:

- `ALLOW_ANON=true`
- `API_KEYS=dev_phantom_key`

For production:

```bash
npx wrangler secret put API_KEYS   # comma-separated keys
```

Set `ALLOW_ANON` to `"false"` in `wrangler.jsonc` vars (or remove it).

## 3. Deploy

```bash
npm run deploy:edge
# or: npm run deploy -w @phantominfra/edge
```

## 4. Verify

```bash
curl https://<worker>.workers.dev/health
curl -H "Authorization: Bearer <key>" https://<worker>.workers.dev/openapi.json
```

## Architecture notes

- **Sessions** stick to SQLite-backed Durable Objects (`PhantomSession`).
- **Live COW branches** stay in DO memory — they are not durable across DO eviction.
- **Production state + predictor** persist in DO storage; predictor deltas also merge into `PREDICTOR_KV`.
- **SSE** (`/v1/sessions/:id/events`) is served from the DO `fetch` handler.
- Point the web app at the Worker with `VITE_EDGE_URL` and `VITE_EDGE_API_KEY`.
