"use client";

import React, { useState, useEffect, useCallback } from "react";
import { startSync, cancelSync, getSyncStatus, SyncStatus } from "@/lib/nexus/api";

export interface SimulateSyncButtonProps {
  onSyncCompleted?: () => void;
}

export function SimulateSyncButton({ onSyncCompleted }: SimulateSyncButtonProps) {
  const [status, setStatus] = useState<SyncStatus>({ state: "idle", processed: 0, total: 0, run_id: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const st = await getSyncStatus();
      setStatus(st);
      if (st.state === "completed") onSyncCompleted?.();
    } catch {
      // API offline: leave the button idle
    }
  }, [onSyncCompleted]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (status.state !== "running") return undefined;
    const t = setInterval(checkStatus, 500);
    return () => clearInterval(t);
  }, [status.state, checkStatus]);

  const toggle = async () => {
    setError(null);
    try {
      if (status.state === "running") {
        await cancelSync();
      } else {
        setLoading(true);
        await startSync(300, false);
      }
      await checkStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  };

  const running = status.state === "running";
  const label = running
    ? `Stop sync · ${status.processed}/${status.total || "?"}`
    : status.state === "completed"
      ? `Replay sync · ${status.processed}/${status.total} done`
      : "Replay company sync";

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="nx-mono" style={{ color: "var(--nx-coral)" }} title={error}>
          {error.slice(0, 36)}
        </span>
      )}
      <button type="button" data-testid="simulate-sync-button" className={`nx-btn ${running ? "is-warn" : ""}`} onClick={toggle} disabled={loading}>
        <span className={`nx-dot ${running ? "is-busy nx-blink" : ""}`} />
        {label}
      </button>
    </div>
  );
}
