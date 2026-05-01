"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import type { Caller } from "@/lib/api";
import { UserCheck, ChevronDown, Loader2, UserX } from "lucide-react";

interface AssignButtonProps {
  leadId: string;
  currentAssignedTo: string | null | undefined;
  onAssigned?: (callerId: string | null, callerName: string | null) => void;
}

export function AssignButton({ leadId, currentAssignedTo, onAssigned }: AssignButtonProps) {
  const [callers, setCallers] = useState<Caller[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingCallers, setFetchingCallers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignedId, setAssignedId] = useState(currentAssignedTo ?? null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setError(null);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Fetch callers when dropdown opens (only once)
  useEffect(() => {
    if (!open || callers.length > 0) return;
    setFetchingCallers(true);
    api.callers
      .list()
      .then((data) => setCallers(data.filter((c) => c.active)))
      .catch(() => setError("Failed to load callers"))
      .finally(() => setFetchingCallers(false));
  }, [open]);

  const assignedCaller = callers.find((c) => c.id === assignedId);

  async function assign(callerId: string | null, callerName: string | null) {
    setLoading(true);
    setError(null);
    try {
      const auth = await import("@/lib/api").then((m) => m.getAuthHeaders());
      const API_URL = await import("@/lib/api").then((m) => m.API_URL);
      const res = await fetch(`${API_URL}/api/v1/leads/${leadId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ caller_id: callerId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Error ${res.status}`);
      }
      setAssignedId(callerId);
      onAssigned?.(callerId, callerName);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setOpen((o) => !o); setError(null); }}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-colors ${
          assignedId
            ? "bg-tertiary/10 text-tertiary hover:bg-tertiary/20"
            : "bg-surface-mid text-on-surface-muted hover:bg-surface-low"
        }`}
        title={assignedCaller ? `Assigned to ${assignedCaller.name}` : "Unassigned — click to assign"}
      >
        <UserCheck size={12} />
        {assignedCaller ? assignedCaller.name : "Assign"}
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 bg-white border border-surface-mid rounded-xl shadow-xl min-w-[180px] py-1 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Header */}
          <p className="px-3 py-1.5 text-[10px] font-bold text-on-surface-muted uppercase tracking-widest border-b border-surface-mid">
            Assign to telecaller
          </p>

          {fetchingCallers ? (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-on-surface-muted">
              <Loader2 size={12} className="animate-spin" />
              Loading callers…
            </div>
          ) : callers.length === 0 ? (
            <p className="px-4 py-3 text-xs text-on-surface-muted">No active callers found</p>
          ) : (
            <>
              {/* Unassign option */}
              {assignedId && (
                <button
                  onClick={() => assign(null, null)}
                  disabled={loading}
                  className="w-full flex items-center gap-2 text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <UserX size={12} />
                  Unassign
                </button>
              )}

              {/* Caller list */}
              {callers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => assign(c.id, c.name)}
                  disabled={loading || c.id === assignedId}
                  className={`w-full flex items-center justify-between text-left px-4 py-2 text-sm transition-colors disabled:opacity-50 ${
                    c.id === assignedId
                      ? "bg-tertiary/5 text-tertiary font-bold cursor-default"
                      : "text-on-surface hover:bg-surface-low"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {c.id === assignedId && <span className="text-[10px]">✓</span>}
                    {c.name}
                  </span>
                  {c.overall_score != null && (
                    <span className="text-[10px] text-on-surface-muted font-normal">
                      ⭐ {Number(c.overall_score).toFixed(1)}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}

          {/* Saving indicator */}
          {loading && (
            <div className="flex items-center gap-2 px-4 py-2 text-xs text-on-surface-muted border-t border-surface-mid">
              <Loader2 size={11} className="animate-spin" />
              Saving…
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="px-4 py-2 text-xs text-red-500 border-t border-surface-mid">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
