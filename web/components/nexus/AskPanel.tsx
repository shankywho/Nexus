"use client";

import React, { useCallback, useEffect, useState } from "react";
import { askNexus, AskResponse } from "@/lib/nexus/api";
import { ProvenanceBadge } from "./ProvenanceBadge";

export interface AskPanelProps {
  onQuestionAnswered?: (res: AskResponse) => void;
}

const SAMPLES = [
  { label: "Where are sessions stored?", question: "Where do we store user sessions?" },
  { label: "Who maintains session-store?", question: "Who maintains the session-store service?" },
  { label: "What caused INC-77?", question: "What caused incident INC-77?" },
  { label: "What was replaced?", question: "What decisions were superseded?" },
];

export function AskPanel({ onQuestionAnswered }: AskPanelProps) {
  const [question, setQuestion] = useState(SAMPLES[0].question);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text) return;
      setLoading(true);
      setError(null);
      try {
        const res = await askNexus(text);
        setResponse(res);
        setHistory((h) => [text, ...h.filter((x) => x !== text)].slice(0, 5));
        onQuestionAnswered?.(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "The API did not answer. Check that it is running on port 8000.");
      } finally {
        setLoading(false);
      }
    },
    [onQuestionAnswered],
  );

  useEffect(() => {
    ask(SAMPLES[0].question);
    // run once on mount so the panel opens with a real answer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decisionId = response?.answer.match(/\bDEC-\d+\b/)?.[0];

  return (
    <div data-testid="ask-panel" className="h-full flex flex-col gap-3 p-3 min-h-0">
      <div>
        <label className="sr-only" htmlFor="nx-examples">Example questions</label>
        <select
          id="nx-examples"
          className="nx-input w-full"
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            setQuestion(e.target.value);
            ask(e.target.value);
          }}
        >
          <option value="">Try an example question…</option>
          {SAMPLES.map((q) => (
            <option key={q.label} value={q.question}>
              {q.label}
            </option>
          ))}
        </select>
      </div>

      <div className="nx-scroll flex-1 min-h-0 flex flex-col gap-3 pr-1" aria-live="polite">
        {loading && !response && <p className="nx-mono text-xs" style={{ color: "var(--nx-muted)" }}>Searching the graph…</p>}
        {error && (
          <p role="alert" className="nx-mono text-xs" style={{ color: "var(--nx-bad)" }}>
            {error}
          </p>
        )}
        {response && (
          <>
            <div className="p-3" style={{ background: "var(--nx-panel-2)", border: "var(--bd)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="nx-display text-xs" style={{ color: "var(--nx-ok)" }}>Answer</span>
                <span className="flex gap-2">
                  <span className="nx-chip" title={response.model ?? undefined}>
                    {response.mode === "claude" ? "Claude" : response.mode === "openai" ? "OpenAI" : "offline"}
                  </span>
                  <span className="nx-chip">
                    <span className="nx-dot" />
                    {Math.round(response.confidence * 100)}% sure
                  </span>
                </span>
              </div>
              <p className="nx-mono" style={{ fontSize: 13, lineHeight: "20px", color: "var(--nx-text)" }}>{response.answer}</p>
            </div>
            <ProvenanceBadge
              currentSource={response.current_sources[0]}
              supersededSource={response.superseded_sources[0]}
              decisionId={decisionId}
            />
            {history.length > 1 && (
              <div>
                <p className="nx-display text-xs" style={{ color: "var(--nx-muted)", marginBottom: 6 }}>Earlier questions</p>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {history.slice(1).map((h) => (
                    <li key={h}>
                      <button
                        type="button"
                        onClick={() => { setQuestion(h); ask(h); }}
                        className="nx-mono text-xs hover:underline"
                        style={{ background: "none", border: 0, color: "var(--nx-info)", cursor: "pointer", padding: "2px 0", textAlign: "left" }}
                      >
                        {h}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {response.cypher_queries?.length > 0 && (
              <details>
                <summary className="nx-mono text-xs" style={{ cursor: "pointer", color: "var(--nx-info)" }}>
                  Cypher used
                </summary>
                <pre className="nx-mono nx-scroll mt-2 p-2 text-xs" style={{ background: "var(--nx-ink)", border: "1px solid var(--nx-line)", color: "var(--nx-info)", whiteSpace: "pre-wrap" }}>
                  {response.cypher_queries[0]}
                </pre>
              </details>
            )}
          </>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label className="sr-only" htmlFor="nx-ask">Ask the company brain</label>
        <input
          id="nx-ask"
          className="nx-input flex-1"
          data-testid="ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about a decision, owner or incident"
        />
        <button type="submit" className="nx-btn is-on" data-testid="ask-submit" disabled={loading}>
          {loading ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
