import Image from "next/image";
import Link from "next/link";
import "@fontsource/press-start-2p/400.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/atkinson-hyperlegible-mono/400.css";
import "@fontsource/atkinson-hyperlegible-mono/600.css";
import "./landing.css";
import { ReplayScene } from "@/components/landing/ReplayScene";

const TIMELINE: Array<{ when: string; what: React.ReactNode; tone?: "bad" | "end" }> = [
  { when: "Sep 18, Slack #eng-backend", what: <>Arjun: “Decision: move sessions to Redis.” <b>DEC-017</b> is proposed.</> },
  { when: "Sep 22, ADR", what: <><b>ADR-038</b> ratifies the move from Postgres to Redis.</> },
  { when: "Sep 26, GitHub", what: <><b>PR-1150</b> ships the Redis session store.</> },
  { when: "Oct 2, 03:15, incident", what: <><b>INC-77</b>: Redis memory pressure evicts keys and drops 12% of sessions.</>, tone: "bad" },
  { when: "Oct 2, 05:30, GitHub", what: <><b>PR-1184</b> reverts sessions to Postgres.</>, tone: "bad" },
  { when: "Oct 9, Linear", what: <><b>LIN-409</b> asks to ratify Postgres with unlogged tables and pooling.</> },
  { when: "Oct 12, ADR", what: <><b>ADR-042</b> supersedes ADR-038. <b>DEC-021</b> is live, <b>DEC-017</b> is replaced.</>, tone: "end" },
];

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-bar">
        <div className="lp-wrap lp-bar-in">
          <a className="lp-logo" href="#top">NEXUS</a>
          <nav className="lp-nav" aria-label="Page">
            <a href="#problem">The problem</a>
            <a href="#lifecycle">How a decision ends</a>
            <a href="#building">What is inside</a>
            <a href="#run">Run it</a>
            <Link className="lp-btn" href="/nexus">Open the office</Link>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div>
              <p className="lp-sign" style={{ ["--tab" as string]: "var(--mint)" }}>Company brain</p>
              <h1 className="lp-h1">
                Your team <em>decided</em> this once. Then it changed its mind.
              </h1>
              <p className="lp-lede">
                NEXUS reads Slack, Linear, GitHub, incidents and ADRs into one graph, marks which decision replaced which,
                and answers questions with the version that is still true.
              </p>
              <div className="lp-cta">
                <Link className="lp-btn" href="/nexus">Open the office</Link>
                <a className="lp-btn lp-btn-ghost" href="#lifecycle">See how a decision ends</a>
              </div>
              <p className="lp-fine">The demo runs on Acme Payments, a made-up company with 76 events and nine decisions.</p>
            </div>
            <ReplayScene />
          </div>
        </section>

        <section className="lp-section" id="problem">
          <div className="lp-wrap">
            <p className="lp-sign" style={{ ["--tab" as string]: "var(--coral)" }}>The problem</p>
            <h2 className="lp-h2">Search finds the loudest answer, not the current one.</h2>
            <p className="lp-p">
              The Slack thread where Redis won is long, clear and easy to retrieve. The incident and the ADR that undid it are short.
              A tool that ranks text will hand a new engineer the decision that no longer holds.
            </p>

            <div className="lp-compare">
              <div className="lp-panel">
                <div className="lp-panel-head"><span>Keyword search</span><span className="lp-tag lp-tag-bad">out of date</span></div>
                <div className="lp-panel-body">
                  <p className="lp-q">Where do we store user sessions?</p>
                  <blockquote className="lp-quote">
                    <small>Top result · #eng-backend · Sep 18</small>
                    Decision: move sessions to Redis. I will open Linear ticket LIN-391 and write ADR-038.
                  </blockquote>
                  <p className="lp-answer">Redis.</p>
                </div>
              </div>
              <div className="lp-panel">
                <div className="lp-panel-head"><span>NEXUS</span><span className="lp-tag lp-tag-good">current</span></div>
                <div className="lp-panel-body">
                  <p className="lp-q">Where do we store user sessions?</p>
                  <p className="lp-answer">
                    Sessions are stored in Postgres. ADR-042 reverted the Redis move after INC-77 eviction dropped sessions.
                  </p>
                  <p className="lp-src lp-src-use"><span>use</span><span>ADR-042, Oct 12, via LIN-409</span></p>
                  <p className="lp-src lp-src-old"><span>old</span><span>#eng-backend thread, Sep 18</span></p>
                </div>
              </div>
            </div>
            <p className="lp-note">
              On 12 test questions, plain keyword search gave a superseded answer 42% of the time. NEXUS gave none.
              The questions and the scoring script are in the repository (<code>fixtures/company/gold_questions.json</code>, <code>scripts/eval.py</code>).
            </p>
          </div>
        </section>

        <section className="lp-section" id="lifecycle">
          <div className="lp-wrap">
            <p className="lp-sign" style={{ ["--tab" as string]: "var(--lemon)" }}>How a decision ends</p>
            <h2 className="lp-h2">The same story, as NEXUS reads it.</h2>
            <div className="lp-life">
              <ol className="lp-rail">
                {TIMELINE.map((t) => (
                  <li key={t.when} className={t.tone === "bad" ? "is-bad" : t.tone === "end" ? "is-end" : undefined}>
                    <span className="lp-when">{t.when}</span>
                    <span className="lp-what">{t.what}</span>
                  </li>
                ))}
              </ol>
              <aside className="lp-aside">
                <h3>What the graph keeps</h3>
                <p>Every line on the left is an event NEXUS ingests. Nothing is deleted.</p>
                <p>
                  The new decision gets a <b>SUPERSEDES</b> edge to the old one. The old fact gets an <b>invalid_at</b> time. It stays searchable,
                  and every answer flags it as replaced.
                </p>
                <code className="lp-code">{"(DEC-021)-[:SUPERSEDES]->(DEC-017)\nDEC-017.status = \"superseded\""}</code>
              </aside>
            </div>
          </div>
        </section>

        <section className="lp-section" id="building">
          <div className="lp-wrap">
            <p className="lp-sign" style={{ ["--tab" as string]: "var(--sky)" }}>What is inside</p>
            <h2 className="lp-h2">Three graphs in one FalkorDB, shown as one office.</h2>
            <table className="lp-dir">
              <tbody>
                <tr><th scope="row">Floor 1</th><td>nexus_company</td><td>People, teams, services, decisions and incidents. Answers who owns what.</td></tr>
                <tr><th scope="row">Floor 2</th><td>nexus_temporal</td><td>Facts with valid and invalid times. Answers what was true on a given day.</td></tr>
                <tr><th scope="row">Floor 3</th><td>nexus_docs</td><td>ADRs and runbooks, indexed so answers can cite them.</td></tr>
              </tbody>
            </table>
            <div className="lp-shots">
              <figure className="lp-shot">
                <Image src="/img/office-floor.png" alt="The NEXUS office view: four team rooms with desks, server racks and decision boards." width={1920} height={1080} />
                <figcaption>The office. One room per team, one desk per person, one board per decision. Replaced boards are struck through.</figcaption>
              </figure>
              <figure className="lp-shot">
                <Image src="/img/decision-graph.png" alt="The NEXUS decision graph: one island per team with dashed red arrows from new decisions to the ones they replace." width={1920} height={1080} />
                <figcaption>The graph. The same data as team islands. Dashed red arrows point from a new decision to the one it replaces.</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="lp-section" id="run">
          <div className="lp-wrap">
            <p className="lp-sign" style={{ ["--tab" as string]: "var(--mint)" }}>Run it</p>
            <h2 className="lp-h2">Five minutes from clone to a working office.</h2>
            <div className="lp-run">
              <div className="lp-term">
                <div className="lp-term-bar">terminal</div>
                <pre>{`cp .env.example .env
make up
cd api && uv run python ../scripts/seed.py --reset
open http://localhost:3000/nexus

`}<span className="c"># optional: answer with Claude instead of offline answers</span>{`
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> .env`}</pre>
              </div>
              <ul className="lp-list">
                <li><b>Works offline.</b><span>Without a key, answers are built from the graph itself.</span></li>
                <li><b>Claude answers are checked.</b><span>Claude reads decisions, owners, incidents and matching events from the graph. Any id it invents is dropped before you see it.</span></li>
                <li><b>What it is not yet.</b><span>The data is synthetic and arrives by replaying a file, not by live Slack or Linear connections. There is no user login.</span></li>
              </ul>
            </div>
            <p className="lp-cta" style={{ marginTop: 40 }}>
              <Link className="lp-btn" href="/nexus">Open the office</Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <p>
            Built on FalkorDB, Graphiti and GraphRAG-SDK. The pixel interface takes its cue from Munder Difflin (MIT), used with the author&apos;s permission.
            Type: Press Start 2P and Atkinson Hyperlegible.
          </p>
          <p><Link href="/nexus">Open the office</Link></p>
        </div>
      </footer>
    </div>
  );
}
