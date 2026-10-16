"use client";

import { useMemo } from "react";
import type { Health } from "@/lib/nexus/api";

export type GraphState = "up" | "down" | "checking";
export type ClaudeState = "live" | "offline-answers" | "checking";
export type StreamState = "connected-idle" | "streaming" | "disconnected";
export type PodState = "standby" | "running" | "done" | "error";

export interface SystemStatusInput {
  online: boolean | null;
  llm: Health["llm"] | null;
  streamLive: boolean;
  isStreaming?: boolean;
  podRunning?: boolean;
  podError?: string | null;
  podDone?: boolean;
}

export interface SystemStatus {
  graph: {
    state: GraphState;
    dotClass: string;
    label: string;
    tooltip: string;
  };
  claude: {
    state: ClaudeState;
    dotClass: string;
    label: string;
    tooltip: string;
  };
  stream: {
    state: StreamState;
    dotClass: string;
    label: string;
    tooltip: string;
  };
  pod: {
    state: PodState;
    dotClass: string;
    label: string;
    tooltip: string;
  };
}

export function useSystemStatus({
  online,
  llm,
  streamLive,
  isStreaming = false,
  podRunning = false,
  podError = null,
  podDone = false,
}: SystemStatusInput): SystemStatus {
  return useMemo(() => {
    // 1. Graph status
    const graphState: GraphState = online === true ? "up" : online === false ? "down" : "checking";
    const graphDotClass = graphState === "up" ? "" : graphState === "down" ? "is-bad" : "is-busy";
    const graphLabel = "graph";
    const graphTooltip = graphState === "up" ? "FalkorDB graph database is online" : graphState === "down" ? "FalkorDB / backend API is unreachable" : "Checking FalkorDB connection...";

    // 2. Claude status
    const claudeState: ClaudeState =
      !llm ? "offline-answers" : llm.mode === "scripted" ? "offline-answers" : "live";
    const claudeDotClass = claudeState === "live" ? "" : "is-busy";
    const claudeLabel = claudeState === "live" ? (llm?.mode === "claude" ? "claude" : "openai") : "offline answers";
    const claudeTooltip =
      claudeState === "live"
        ? `Answers driven live by ${llm?.model ?? llm?.provider ?? "LLM"}`
        : "Set ANTHROPIC_API_KEY in .env and restart API to enable live Claude intelligence";

    // 3. Stream (SSE) status
    // Spec §3: "A red offline while the API is up is a bug; it should read grey stream idle."
    const streamState: StreamState = isStreaming
      ? "streaming"
      : online === false
      ? "disconnected"
      : "connected-idle";
    const streamDotClass =
      streamState === "streaming"
        ? "nx-blink"
        : streamState === "connected-idle"
        ? "is-muted"
        : "is-bad";
    const streamLabel =
      streamState === "streaming"
        ? "streaming"
        : streamState === "connected-idle"
        ? "stream idle"
        : "stream down";
    const streamTooltip =
      streamState === "streaming"
        ? "SSE ingestion stream active"
        : streamState === "connected-idle"
        ? streamLive
          ? "SSE ingestion connected (idle, waiting for events)"
          : "SSE ingestion standby (API online, waiting for stream)"
        : "SSE ingestion stream disconnected (backend offline)";

    // 4. Pod status: standby / running / done / error | muted / blue pulsing / mint / red
    const podState: PodState = podError
      ? "error"
      : podRunning
      ? "running"
      : podDone
      ? "done"
      : "standby";
    const podDotClass =
      podState === "running"
        ? "is-info nx-blink"
        : podState === "done"
        ? ""
        : podState === "error"
        ? "is-bad"
        : "is-muted";
    const podLabel =
      podState === "running"
        ? "triaging"
        : podState === "done"
        ? "resolved"
        : podState === "error"
        ? "error"
        : "standby";
    const podTooltip =
      podState === "running"
        ? "Autonomous agents actively triaging incident"
        : podState === "error"
        ? `Agent pod failed: ${podError}`
        : "Agent pod on standby. Select an incident and click PAGE AGENTS.";

    return {
      graph: { state: graphState, dotClass: graphDotClass, label: graphLabel, tooltip: graphTooltip },
      claude: { state: claudeState, dotClass: claudeDotClass, label: claudeLabel, tooltip: claudeTooltip },
      stream: { state: streamState, dotClass: streamDotClass, label: streamLabel, tooltip: streamTooltip },
      pod: { state: podState, dotClass: podDotClass, label: podLabel, tooltip: podTooltip },
    };
  }, [online, llm, streamLive, isStreaming, podRunning, podError, podDone]);
}
