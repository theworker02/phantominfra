import { HeroVisual } from "./HeroVisual";
import { SpeculativeDemo } from "./SpeculativeDemo";
import { AgentDemo } from "./AgentDemo";
import { PlatformDemo } from "./PlatformDemo";
import { ValueSection } from "./ValueSection";

export default function App() {
  return (
    <>
      <nav className="site-nav">
        <a href="#how">How it works</a>
        <a href="#value">Value</a>
        <a href="#demo">Live demo</a>
        <a href="#agent">Agent</a>
        <a href="#platform">Platform</a>
        <a href="#acquire">Acquire</a>
      </nav>

      <header className="hero">
        <HeroVisual />
        <div className="hero-content">
          <h1 className="brand">PhantomInfra</h1>
          <p className="hero-line">
            Speculative zero-latency edge engine.
          </p>
          <p className="hero-sub">
            Predict the next API call, pre-execute it on a copy-on-write branch,
            and commit at packet arrival — or roll back with zero side effects.
          </p>
          <div className="cta-row">
            <a className="btn btn-primary" href="#value">
              See the proof
            </a>
            <a className="btn btn-ghost" href="#demo">
              Run the demo
            </a>
          </div>
        </div>
      </header>

      <section id="how">
        <p className="section-kicker">Core concept</p>
        <h2 className="section-title">Branch prediction for the cloud</h2>
        <p className="section-lead">
          Hardware already gambles on the future of every instruction. PhantomInfra
          lifts that bet to microservices, mutations, and agent tool calls.
        </p>
        <div className="how-grid">
          <article className="how-step">
            <span className="how-num">01 — Predict</span>
            <h3>Probabilistic state graphs</h3>
            <p>
              Real-time Markov transitions and surface priors score the next API
              routes before the user or agent fires the request.
            </p>
          </article>
          <article className="how-step">
            <span className="how-num">02 — Speculate</span>
            <h3>Ephemeral COW workspaces</h3>
            <p>
              Top candidates clone production state and pre-run handlers. External
              I/O stays shadowed until commit — Stripe and email never fire on a miss.
            </p>
          </article>
          <article className="how-step">
            <span className="how-num">03 — Commit / wipe</span>
            <h3>True 0ms on hit</h3>
            <p>
              A correct prediction promotes the branch instantly. A miss quietly
              rolls back — no trace, no production side effects.
            </p>
          </article>
        </div>
      </section>

      <ValueSection />

      <section id="demo" className="demo-section">
        <p className="section-kicker">Interactive</p>
        <h2 className="section-title">Watch speculation land</h2>
        <p className="section-lead">
          Run locally in-browser, or flip to the Edge Worker — sessions stick to a
          Cloudflare Durable Object that keeps COW branches warm and persists
          production state after each commit.
        </p>
        <SpeculativeDemo />
      </section>

      <section id="agent" className="demo-section">
        <p className="section-kicker">Phase 3 — Agents</p>
        <h2 className="section-title">Speculate while the model plans</h2>
        <p className="section-lead">
          Feed an agent plan — structured steps or free text. PhantomInfra ranks
          tool candidates, shadow-runs irreversible effects, and commits the winner
          when the agent actually invokes the tool.
        </p>
        <AgentDemo />
      </section>

      <section id="platform" className="demo-section">
        <p className="section-kicker">Phase 4–5 — Platform</p>
        <h2 className="section-title">Auth, mesh learning, live streams</h2>
        <p className="section-lead">
          API keys, rate limits, KV predictor mesh, SSE, effect ledger, timeouts, and
          OpenAPI — the production chair under the speculative runtime.
        </p>
        <PlatformDemo />
      </section>

      <section id="acquire">
        <p className="section-kicker">Acquisition value</p>
        <h2 className="section-title">Latency as a weapon</h2>
        <p className="section-lead">
          Every major cloud is fighting over microseconds for commerce, trading,
          and real-time agent orchestration. A runtime that makes backend lag
          functionally invisible is an unfair advantage.
        </p>
        <ul className="acquire-list">
          <li>
            <strong>Cloudflare / Fastly / Vercel</strong>
            <span>
              Embed directly in V8 isolates — Workers and Edge Functions that
              return pre-computed state the instant the packet arrives.
            </span>
          </li>
          <li>
            <strong>AWS / Azure</strong>
            <span>
              Speculatively warm serverless cold starts and stage mutations at
              enterprise scale before the invoke lands.
            </span>
          </li>
          <li>
            <strong>Agent platforms</strong>
            <span>
              Pre-run the top tool-call candidates while the model is still
              planning — turn tool latency into a commit, not a round trip.
            </span>
          </li>
        </ul>
      </section>

      <footer className="site-footer">
        <span>PhantomInfra — distributed cloud runtime &amp; predictive compute</span>
        <span>Speculative · agents · edge platform</span>
      </footer>
    </>
  );
}
