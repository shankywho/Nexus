"use client";

import React, { useCallback, useEffect, useState } from "react";
import { askNexus, AskResponse } from "@/lib/nexus/api";
import { ProvenanceBadge } from "./ProvenanceBadge";

export interface AskPanelProps {
  onQuestionAnswered?: (res: AskResponse) => void;
}

const SAMPLES = [
  { label: "Session Store", question: "Where do we store user sessions?" },
  { label: "Who Owns What", question: "Who maintains the session-store service?" },
  { label: "Root Cause INC-77", question: "What caused incident INC-77?" },
  { label: "Superseded Decisions", question: "What decisions were superseded?" },
];

export function AskPanel({ onQuestionAnswered }: AskPanelProps) {
  const [question, setQuestion] = useState(SAMPLES[0].question);
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
    [onQuestionAnswered]
  );

  useEffect(() => {
    ask(SAMPLES[0].question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decisionId = response?.answer.match(/\bDEC-\d+\b/)?.[0];

  return (
    <div data-testid="ask-panel" className="h-full flex flex-col gap-2.5 p-3 min-h-0">
      {/* 3–4 Preset Question Chips Above Input */}
      <div className="flex flex-wrap gap-1.5 shrink-0" role="group" aria-label="Example Questions">
        {SAMPLES.map((s) => (
          <button
            key={s.label}
            type="button"
            className="nx-chip cursor-pointer nx-hover text-[11px]"
            style={{
              height: 24,
              padding: "0 8px",
              background: question === s.question ? "var(--nx-panel-2)" : "var(--nx-panel)",
              borderColor: question === s.question ? "var(--nx-accent)" : "var(--nx-line)",
              color: question === s.question ? "var(--nx-accent)" : "var(--nx-text)",
            }}
            onClick={() => {
              setQuestion(s.question);
              ask(s.question);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Question Input Form */}
      <form
        className="flex gap-2 shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label className="sr-only" htmlFor="nx-ask">
          Ask the company brain
        </label>
        <input
          id="nx-ask"
          className="nx-input nx-mono flex-1 text-xs"
          style={{ height: 36, padding: "0 10px" }}
          data-testid="ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about systems, owners, or decisions..."
        />
        <button
          type="submit"
          className="nx-btn nx-btn--primary text-xs"
          style={{ height: 36, padding: "0 14px" }}
          data-testid="ask-submit"
          disabled={loading || !question.trim()}
        >
          {loading ? "SEARCHING..." : "ASK"}
        </button>
      </form>

      {/* Answer Area (Scrolls) */}
      <div className="nx-scroll flex-1 min-h-0 flex flex-col gap-3 pr-1" aria-live="polite">
        {loading && !response && (
          <p className="nx-mono text-xs p-3 text-center" style={{ color: "var(--nx-muted)" }}>
            Searching the graph…
          </p>
        )}
        {error && (
          <p role="alert" className="nx-mono text-xs p-3" style={{ color: "var(--nx-bad)" }}>
            {error}
          </p>
        )}
        {response && (
          <>
            {/* Mono Card for Answer */}
            <div
              className="p-3"
              style={{
                background: "var(--nx-panel-2)",
                border: "var(--bd)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="nx-display text-xs" style={{ color: "var(--nx-ok)" }}>
                  ANSWER
                </span>
                <div className="flex gap-2">
                  <span className="nx-chip text-[10px]" title={response.model ?? undefined}>
                    {{ groq: "Groq", claude: "Claude", openai: "OpenAI" }[response.mode ?? ""] ?? "Offline"}
                  </span>
                  <span className="nx-chip text-[10px]">
                    <span className="nx-dot" />
                    {Math.round(response.confidence * 100)}% confidence
                  </span>
                </div>
              </div>
              <p
                className="nx-mono"
                style={{ fontSize: 13, lineHeight: "20px", color: "var(--nx-text)", margin: 0 }}
              >
                {response.answer}
              </p>
            </div>

            {/* Provenance Badge */}
            <ProvenanceBadge
              decisionId={decisionId}
              currentSource={response.current_sources?.[0]}
              supersededSource={response.superseded_sources?.[0]}
            />

            {/* Cypher Traces */}
            {response.cypher_queries?.length > 0 && (
              <details className="nx-panel p-2">
                <summary className="nx-mono text-xs cursor-pointer select-none" style={{ color: "var(--nx-info)" }}>
                  Cypher query used ({response.cypher_queries.length})
                </summary>
                <pre
                  className="nx-mono nx-scroll mt-2 p-2 text-xs"
                  style={{
                    background: "var(--nx-ink)",
                    border: "1px solid var(--nx-line)",
                    color: "var(--nx-info)",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >
                  {response.cypher_queries[0]}
                </pre>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
