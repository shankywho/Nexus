"use client";

import React, { useCallback, useEffect, useState } from "react";
import { askNexus, AskResponse } from "@/lib/nexus/api";
import { ProvenanceBadge } from "./ProvenanceBadge";

export interface AskPanelProps {
  onQuestionAnswered?: (res: AskResponse) => void;
}

const SAMPLES = [
  "Where do we store user sessions?",
  "Who maintains the session-store service?",
  "What caused incident INC-77?",
  "What decisions were superseded?",
];

export function AskPanel({ onQuestionAnswered }: AskPanelProps) {
  const [question, setQuestion] = useState(SAMPLES[0]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text) return;
      setLoading(true);
      setError(null);
      try {
        const res = await askNexus(text);
        setResponse(res);
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
    ask(SAMPLES[0]);
    // run once on mount so the panel opens with a real answer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decisionId = response?.answer.match(/\bDEC-\d+\b/)?.[0];

  return (
    <div data-testid="ask-panel" className="h-full flex flex-col gap-3 p-3 min-h-0">
      <div className="flex flex-wrap gap-2">
        {SAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            className="nx-chip"
            style={{ cursor: "pointer", fontSize: 16 }}
            onClick={() => {
              setQuestion(q);
              ask(q);
            }}
          >
            {q}
          </button>
        ))}
      </div>

      <div className="nx-scroll flex-1 min-h-0 flex flex-col gap-3 pr-1" aria-live="polite">
        {loading && !response && <p style={{ color: "var(--nx-dim)" }}>Searching the graph…</p>}
        {error && (
          <p role="alert" style={{ color: "var(--nx-coral)" }}>
            {error}
          </p>
        )}
        {response && (
          <>
            <div className="p-3" style={{ background: "var(--nx-ink)", boxShadow: "inset 0 0 0 2px var(--nx-line)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="nx-display" style={{ color: "var(--nx-mint)" }}>Answer</span>
                <span className="nx-chip">
                  <span className="nx-dot" />
                  {Math.round(response.confidence * 100)}% sure
                </span>
              </div>
              <p style={{ fontSize: 16, lineHeight: "22px" }}>{response.answer}</p>
            </div>
            <ProvenanceBadge
              currentSource={response.current_sources[0]}
              supersededSource={response.superseded_sources[0]}
              decisionId={decisionId}
            />
            {response.cypher_queries?.length > 0 && (
              <details>
                <summary className="nx-mono" style={{ cursor: "pointer", color: "var(--nx-sky)" }}>
                  Cypher used
                </summary>
                <pre className="nx-mono nx-scroll mt-2 p-2" style={{ background: "var(--nx-ink)", fontSize: 16, whiteSpace: "pre-wrap" }}>
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
          className="nx-input"
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
