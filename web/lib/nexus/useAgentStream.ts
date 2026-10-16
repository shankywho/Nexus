"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentStepTrace } from "./api";

export interface TaskHandoffEvent {
  task_id: string;
  from_agent: string;
  to_agent: string;
  reason: string;
  step_n: number;
  note?: string;
  ts?: number;
}

export interface AgentCompletedEvent {
  run_id: string;
  incident_id: string;
  status: string;
  final_output: string;
  steps_count: number;
  tasks_count: number;
}

export interface UseAgentStreamReturn {
  live: boolean;
  isRunning: boolean;
  activeAgent: string | null;
  currentRunId: string | null;
  steps: AgentStepTrace[];
  latestStep: AgentStepTrace | null;
  latestHandoff: TaskHandoffEvent | null;
  completedRun: AgentCompletedEvent | null;
  touchedIds: string[];
  clearRun: () => void;
}

/**
 * Subscribes to real-time agent execution events from the SSE stream.
 * Tracks live steps, multi-agent task handoffs, and touched graph entities.
 */
export function useAgentStream(): UseAgentStreamReturn {
  const [live, setLive] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStepTrace[]>([]);
  const [latestStep, setLatestStep] = useState<AgentStepTrace | null>(null);
  const [latestHandoff, setLatestHandoff] = useState<TaskHandoffEvent | null>(null);
  const [completedRun, setCompletedRun] = useState<AgentCompletedEvent | null>(null);
  const [touchedIds, setTouchedIds] = useState<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events/stream");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);

    const handleStep = (e: MessageEvent) => {
      try {
        const raw = JSON.parse(e.data);
        const data = raw?.event;
        if (!data || !data.step) return;

        const step: AgentStepTrace = data.step;
        const runId: string = data.run_id ?? "";
        const agentName: string = data.agent ?? step.agent;

        setIsRunning(true);
        setActiveAgent(agentName);
        setCurrentRunId(runId);
        setLatestStep(step);
        setSteps((prev) => [...prev, step]);

        if (step.touched_entity_ids && step.touched_entity_ids.length > 0) {
          setTouchedIds((prev) => {
            const next = new Set([...prev, ...(step.touched_entity_ids ?? [])]);
            return Array.from(next);
          });
        }

        // Auto-clear active agent banner after inactivity
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setIsRunning(false);
          setActiveAgent(null);
        }, 8000);
      } catch {
        // ignore malformed events
      }
    };

    const handleHandoff = (e: MessageEvent) => {
      try {
        const raw = JSON.parse(e.data);
        const data = raw?.event;
        if (!data || !data.from_agent || !data.to_agent) return;

        const handoff: TaskHandoffEvent = {
          task_id: data.task_id,
          from_agent: data.from_agent,
          to_agent: data.to_agent,
          reason: data.reason,
          step_n: data.step_n,
          note: data.note,
          ts: Date.now(),
        };

        setLatestHandoff(handoff);
        setActiveAgent(data.to_agent);
      } catch {
        // ignore
      }
    };

    const handleCompleted = (e: MessageEvent) => {
      try {
        const raw = JSON.parse(e.data);
        const data = raw?.event;
        if (!data || !data.run_id) return;

        setCompletedRun({
          run_id: data.run_id,
          incident_id: data.incident_id,
          status: data.status,
          final_output: data.final_output ?? "",
          steps_count: data.steps_count ?? 0,
          tasks_count: data.tasks_count ?? 0,
        });
        setIsRunning(false);
        setActiveAgent(null);
      } catch {
        // ignore
      }
    };

    es.addEventListener("agent.step", handleStep);
    es.addEventListener("task.handoff", handleHandoff);
    es.addEventListener("agent.completed", handleCompleted);

    return () => {
      es.close();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const clearRun = () => {
    setSteps([]);
    setLatestStep(null);
    setLatestHandoff(null);
    setCompletedRun(null);
    setTouchedIds([]);
    setIsRunning(false);
    setActiveAgent(null);
  };

  return {
    live,
    isRunning,
    activeAgent,
    currentRunId,
    steps,
    latestStep,
    latestHandoff,
    completedRun,
    touchedIds,
    clearRun,
  };
}
