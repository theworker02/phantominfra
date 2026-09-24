# PhantomInfra — Technical Whitepaper

## Abstract

PhantomInfra lifts hardware branch prediction to the distributed backend. Before a user or agent issues an API/tool call, the runtime predicts top-K routes, clones production state into ephemeral copy-on-write (COW) workspaces, pre-executes handlers with **shadow** side effects, and either **commits** (~0ms server path) or **rolls back** (zero production side effects).

## Problem

Edge networks shave WAN latency, but application servers still pay:

- Handler compute  
- Cold starts  
- Serial tool calls in agent loops  
- Irreversible third-party I/O (payments, email)

Prefetch and HTTP cache do not safely pre-run mutations.

## Model

```
predict(surface, history | agent plan)
  → open COW branches for top-K candidates
  → run handlers; external I/O is shadowed
confirm(route)
  → hit: promote draft + flush commit effects
  → miss: discard branches + cold-path execute
```

### Safety

| Mechanism | Role |
|-----------|------|
| COW workspace | Isolates speculative mutations |
| Shadow effects | Simulate Stripe/email without calling them |
| Commit effects | Real I/O only after hit |
| Compensate | Reverse partial commits on failure |
| Policy | Deny lists, max branches, require-shadow |
| Ledger | Append-only audit of shadow/commit/compensate |

## Predictor

Hybrid scorer:

- Global route frequency  
- Markov transitions from confirmed history  
- Surface / agent-plan priors  

Models merge across sessions via KV (`mergePredictorModels`) for a learning mesh.

## Measured demo performance

From `npm run bench` (local demo handlers):

| Path | Avg confirm latency |
|------|---------------------|
| Speculative HIT | ~0.1ms |
| Cold MISS | ~156ms |
| Approx speedup | ~1000×+ |

These numbers illustrate the architectural claim; production savings depend on handler cost and hit rate.

## Edge reference architecture

- Cloudflare Worker router (auth, rate limit, OpenAPI)  
- Durable Object per session (sticky COW branches + SQLite snapshot)  
- KV global predictor mesh  
- SSE event fan-out  

## Adapters

`@phantominfra/adapters` provides Workers, Vercel Edge, and Node listeners so acquirers can embed the gate without rewriting the core.

## Non-goals (v0)

- Distributed consensus across multi-region live branches  
- Automatic semantic conflict resolution for overlapping DB rows  
- Formal verification of compensate handlers  

These are natural Phase-N research / enterprise extensions post-acquisition.
