# Loom script — PhantomInfra (≈2 minutes)

Record this as an inbound / diligence Loom. Keep camera optional; screen-share the repo + live Worker.

## Setup before record

1. `npm run dev` and `npm run dev:edge` (or use the **public Worker URL** from `docs/LIVE.md`)
2. Open landing `#value`, `#demo`, `#agent`
3. Have `docs/one-pager.html` ready to flash at the end

## Script (spoken)

**0:00–0:15 — Hook**  
“PhantomInfra brings CPU-style branch prediction to the cloud. We run backend and agent tool calls *before* they happen — on copy-on-write branches — and commit at packet arrival for near-zero server latency.”

**0:15–0:40 — Category**  
“Caches hide reads. We speculatively execute mutations and tool calls. Wrong guess? Roll back with zero production side effects. Right guess? Confirm is essentially free.”  
*(Show `#value` bench numbers: ~0.1ms hit vs ~156ms miss.)*

**0:40–1:10 — Live demo**  
*(Edge or local demo)*  
“Surface is checkout — we already warmed `checkout.confirm`. Confirm — that’s a hit, sub-millisecond server path.”  
*(Switch to agent)*  
“While an agent plans, we pre-run likely tools. Stripe stays shadowed until confirm.”

**1:10–1:35 — Why acquirers care**  
“Ships against Cloudflare Workers and Durable Objects today. Drop-in adapters for Vercel Edge and Node/Lambda. Diligence pack: whitepaper, threat model, OpenAPI, audit bundle, CI.”

**1:35–2:00 — Close**  
“Pre-revenue. The asset is the runtime IP and the edge reference — not ARR. One-pager and live API are in the repo. Happy to walk a deeper diligence session.”  
*(Show one-pager + live URL.)*

## On-screen checklist

- [ ] Brand landing hero  
- [ ] Value stats  
- [ ] Speculate → HIT latency  
- [ ] Agent shadow effect  
- [ ] `docs/ACQUISITION.md` or one-pager  
- [ ] Live Worker `/health` in browser

## Title / description (Loom)

**Title:** PhantomInfra — speculative zero-latency edge (2 min)  
**Description:** Speculative execution for APIs & agent tools. Live Worker + acquisition one-pager in repo. Contact: github.com/theworker02
