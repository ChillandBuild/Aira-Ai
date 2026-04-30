"use client";
import { useState, useEffect } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface Caller {
  id: string;
  name: string;
}

interface AssignButtonProps {
  leadId: string;
  currentAssignedTo: string | null | undefined;
}

export function AssignButton({ leadId, currentAssignedTo }: AssignButtonProps) {
  const [callers, setCallers] = useState<Caller[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || callers.length > 0) return;
    getAuthHeaders().then((auth) =>
      fetch(`${API_URL}/api/v1/callers`, { headers: auth })
        .then((r) => r.json())
        .then((d) => setCallers(d.data || []))
        .catch(() => {})
    );
  }, [open]);

  async function assign(callerId: string | null) {
    setLoading(true);
    const auth = await getAuthHeaders();
    await fetch(`${API_URL}/api/v1/leads/${leadId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ caller_id: callerId }),
    });
    setLoading(false);
    setOpen(false);
    window.location.reload();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs px-2 py-1 rounded-lg bg-surface-mid text-on-surface-muted hover:bg-surface-low"
      >
        👤 Assign
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 bg-white border border-surface-mid rounded-xl shadow-xl min-w-[160px] py-1">
          <button
            onClick={() => assign(null)}
            className="w-full text-left px-4 py-2 text-sm text-on-surface-muted hover:bg-surface-low"
          >
            Unassign
          </button>
          {callers.map((c) => (
            <button
              key={c.id}
              onClick={() => assign(c.id)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-low ${
                c.id === currentAssignedTo ? "font-bold text-tertiary" : "text-on-surface"
              }`}
            >
              {c.name}
            </button>
          ))}
          {loading && (
            <p className="px-4 py-2 text-xs text-on-surface-muted">Saving…</p>
          )}
        </div>
      )}
    </div>
  );
}
