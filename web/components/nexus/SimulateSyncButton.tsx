"use client";

import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Square, Check, AlertCircle } from "lucide-react";
import { startSync, cancelSync, getSyncStatus, SyncStatus } from "@/lib/nexus/api";

export interface SimulateSyncButtonProps {
  onSyncCompleted?: () => void;
}

export function SimulateSyncButton({ onSyncCompleted }: SimulateSyncButtonProps) {
  const [status, setStatus] = useState<SyncStatus>({
    state: "idle",
    processed: 0,
    total: 0,
    run_id: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const st = await getSyncStatus();
      setStatus(st);
      if (st.state === "completed" && onSyncCompleted) {
        onSyncCompleted();
      }
    } catch {
      // ignore
    }
  }, [onSyncCompleted]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (status.state === "running") {
      const interval = setInterval(checkStatus, 500);
      return () => clearInterval(interval);
    }
  }, [status.state, checkStatus]);

  const handleToggleSync = async () => {
    setError(null);
    if (status.state === "running") {
      try {
        await cancelSync();
        await checkStatus();
      } catch (err: any) {
        setError(err.message || "Failed to cancel");
      }
      return;
    }

    setLoading(true);
    try {
      await startSync(300, false);
      await checkStatus();
    } catch (err: any) {
      setError(err.message || "Failed to start sync");
    } finally {
      setLoading(false);
    }
  };

  const isRunning = status.state === "running";

  return (
    <div className="flex items-center gap-2 font-mono">
      {error && (
        <span className="text-[10px] text-[#ef4444] flex items-center gap-1" title={error}>
          <AlertCircle size={10} />
          {error.slice(0, 30)}
        </span>
      )}

      <button
        type="button"
        data-testid="simulate-sync-button"
        onClick={handleToggleSync}
        disabled={loading}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold tracking-widest uppercase border transition-all ${
          isRunning
            ? "bg-[#f59e0b]/20 border-[#f59e0b] text-[#f59e0b] hover:bg-[#f59e0b]/30"
            : status.state === "completed"
            ? "bg-[#10b981]/15 border-[#10b981] text-[#10b981] hover:bg-[#10b981]/25"
            : "bg-[#141414] border-[#27272a] text-zinc-300 hover:text-zinc-100 hover:border-zinc-500"
        }`}
      >
        {isRunning ? (
          <>
            <RefreshCw size={12} className="animate-spin" />
            <span>SYNCING ({status.processed}/{status.total || 50})</span>
            <Square size={10} className="ml-1 text-[#ef4444]" />
          </>
        ) : status.state === "completed" ? (
          <>
            <Check size={12} />
            <span>SYNC REPLAYED (50/50)</span>
          </>
        ) : (
          <>
            <RefreshCw size={12} />
            <span>SIMULATE LIVE COMPANY SYNC</span>
          </>
        )}
      </button>
    </div>
  );
}
