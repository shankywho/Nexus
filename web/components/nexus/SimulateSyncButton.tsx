"use client";

import React, { useState, useEffect, useCallback } from "react";
import { startSync, cancelSync, getSyncStatus, SyncStatus } from "@/lib/nexus/api";
import { PixelPlay } from "./PixelIcons";

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
  const progressPercent = status.total > 0 ? Math.min(100, Math.round((status.processed / status.total) * 100)) : 0;
  const label = running
    ? `STOP ${status.processed}/${status.total || "?"}`
    : status.state === "completed"
      ? `REPLAY SYNC · ${status.processed}/${status.total}`
      : "REPLAY SYNC";

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="nx-mono text-xs" style={{ color: "var(--nx-bad)" }} title={error}>
          {error.slice(0, 32)}
        </span>
      )}
      <button
        type="button"
        data-testid="simulate-sync-button"
        className={`nx-btn ${running ? "is-warn" : "nx-btn--primary"}`}
        style={{ position: "relative", overflow: "hidden" }}
        onClick={toggle}
        disabled={loading}
      >
        {running && (
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${progressPercent}%`,
              background: "rgba(0,0,0,0.2)",
              pointerEvents: "none",
            }}
          />
        )}
        {!running && <PixelPlay size={12} />}
        {running && <span className="nx-dot is-busy nx-blink" />}
        <span style={{ position: "relative", zIndex: 1 }}>{label}</span>
      </button>
    </div>
  );
}
