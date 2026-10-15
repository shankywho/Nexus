"use client";

import React, { useState } from "react";
import { Send, Loader2, Sparkles, AlertCircle, Database, HelpCircle } from "lucide-react";
import { askNexus, AskResponse } from "@/lib/nexus/api";
import { ProvenanceBadge } from "./ProvenanceBadge";

export interface AskPanelProps {
  onQuestionAnswered?: (res: AskResponse) => void;
}

export function AskPanel({ onQuestionAnswered }: AskPanelProps) {
  const [question, setQuestion] = useState("Where do we store user sessions?");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AskResponse | null>({
    answer:
      "User sessions are stored in Postgres per ADR-042 (ratified on 2026-10-12 via ticket LIN-409). The earlier architectural decision to use Redis (DEC-017) was superseded after memory eviction dropped sessions during incident INC-77.",
    confidence: 0.95,
    current_sources: ["ADR-042 (2026-10-12) via LIN-409"],
    superseded_sources: ["#eng-backend Slack Thread (2026-09-18) — Invalidated"],
    intent: "decision_lookup",
    trace_id: "trace_session_store_01",
    cypher_queries: [
      "MATCH (s:Service {name: 'session-store'})-[:HAS_DECISION]->(d:Decision {status: 'active'}) RETURN d",
    ],
    warnings: [],
    run_id: "run_ask_initial",
  });
  const [error, setError] = useState<string | null>(null);

  const sampleQuestions = [
    "Where do we store user sessions?",
    "Who maintains the session-store service?",
    "What caused incident INC-77?",
    "What decisions were superseded?",
  ];

  const handleAsk = async (qToAsk?: string) => {
    const q = (qToAsk || question).trim();
    if (!q) return;
    setLoading(true);
    setError(null);

    try {
      const res = await askNexus(q);
      setResponse(res);
      if (onQuestionAnswered) {
        onQuestionAnswered(res);
      }
    } catch (err: any) {
      setError(err.message || "Failed to query NEXUS");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="ask-panel"
      className="h-full flex flex-col justify-between p-4 font-mono text-xs overflow-y-auto space-y-4 select-none bg-[#141414]"
    >
      <div className="space-y-4">
        {/* Sample queries chips */}
        <div>
          <span className="text-[10px] tracking-widest uppercase text-zinc-500 font-semibold block mb-2">
            FREQUENT QUERIES:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {sampleQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setQuestion(q);
                  handleAsk(q);
                }}
                className="px-2 py-1 text-[10px] text-zinc-400 bg-[#0a0a0a] border border-[#27272a] hover:border-[#10b981]/50 hover:text-zinc-200 text-left transition-colors truncate max-w-full"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Answer section */}
        {response && (
          <div className="space-y-3">
            <div className="p-3 border border-[#10b981]/40 bg-[#10b981]/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#10b981]">
                  <Sparkles size={12} />
                  NEXUS SYNTHESIS
                </span>
                <span className="text-[10px] text-zinc-400">
                  CONFIDENCE: <strong className="text-[#10b981]">{(response.confidence * 100).toFixed(0)}%</strong>
                </span>
              </div>
              <p className="text-zinc-200 leading-relaxed text-[11px]">
                {response.answer}
              </p>
            </div>

            {/* Provenance Badge */}
            <ProvenanceBadge
              currentSource={response.current_sources[0]}
              supersededSource={response.superseded_sources[0]}
              decisionId="DEC-021"
            />

            {/* Cypher Traces */}
            {response.cypher_queries?.length > 0 && (
              <div className="p-2 border border-[#27272a] bg-[#0a0a0a]">
                <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-zinc-500 mb-1">
                  <Database size={10} />
                  FalkorDB Cypher Trace
                </span>
                <code className="text-[10px] text-emerald-400/90 block overflow-x-auto whitespace-pre">
                  {response.cypher_queries[0]}
                </code>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-2 border border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444] text-[11px] flex items-center gap-1.5">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Input box */}
      <div className="pt-2 border-t border-[#27272a]">
        <label className="text-[10px] tracking-widest uppercase text-zinc-500 font-semibold block mb-1.5">
          ASK COMPANY BRAIN
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="flex gap-1"
        >
          <input
            type="text"
            data-testid="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask architecture, decisions, bus factor..."
            className="flex-1 bg-[#0a0a0a] border border-[#27272a] px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#10b981] placeholder-zinc-600"
          />
          <button
            type="submit"
            data-testid="ask-submit"
            disabled={loading}
            className="px-4 py-2 bg-[#10b981] hover:bg-[#10b981]/90 text-black font-bold text-xs uppercase flex items-center gap-1 transition-colors"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            <span>ASK</span>
          </button>
        </form>
      </div>
    </div>
  );
}
