"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Zap, Play, Pause, Copy, Trash2, ChevronRight, Activity } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface Automation {
  id: string;
  name: string;
  trigger_type: string;
  active: boolean;
  run_count: number;
  created_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  lead_created: "Lead Created",
  first_inbound_message: "First Inbound Message",
  new_message_received: "Message Received",
  keyword_match: "Keyword Match",
  segment_changed: "Segment Changed",
  score_threshold: "Score Threshold",
};

const TRIGGER_COLORS: Record<string, string> = {
  lead_created: "bg-emerald-100 text-emerald-700",
  first_inbound_message: "bg-blue-100 text-blue-700",
  new_message_received: "bg-violet-100 text-violet-700",
  keyword_match: "bg-amber-100 text-amber-700",
  segment_changed: "bg-pink-100 text-pink-700",
  score_threshold: "bg-orange-100 text-orange-700",
};

export default function AutomationsPage() {
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/automations/`, { headers: auth });
      if (res.ok) {
        const json = await res.json();
        setAutomations(json.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (a: Automation) => {
    setToggling(a.id);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/automations/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ active: !a.active }),
      });
      if (res.ok) await load();
    } finally {
      setToggling(null);
    }
  };

  const duplicate = async (id: string) => {
    const auth = await getAuthHeaders();
    const res = await fetch(`${API_URL}/api/v1/automations/${id}/duplicate`, {
      method: "POST",
      headers: auth,
    });
    if (res.ok) await load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this automation?")) return;
    setDeleting(id);
    try {
      const auth = await getAuthHeaders();
      await fetch(`${API_URL}/api/v1/automations/${id}`, { method: "DELETE", headers: auth });
      await load();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Zap size={22} className="text-violet-500" />
            Automations
          </h1>
          <p className="text-sm text-on-surface-muted mt-1">
            Trigger workflows automatically based on lead activity
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard/automations/new")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          New Automation
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-2xl bg-surface-subtle animate-pulse" />
          ))}
        </div>
      ) : automations.length === 0 ? (
        <div className="text-center py-24 text-on-surface-muted">
          <Zap size={40} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium text-lg mb-1">No automations yet</p>
          <p className="text-sm mb-6">Create your first workflow to automate lead responses and actions.</p>
          <button
            onClick={() => router.push("/dashboard/automations/new")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} /> Create automation
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map(a => (
            <div
              key={a.id}
              className="group flex items-center gap-4 p-4 rounded-2xl bg-surface border border-surface-mid hover:border-primary/30 transition-all"
            >
              {/* Active toggle */}
              <button
                onClick={() => toggle(a)}
                disabled={toggling === a.id}
                className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                  a.active
                    ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                    : "bg-surface-subtle text-on-surface-muted hover:bg-surface-mid"
                }`}
                title={a.active ? "Pause automation" : "Activate automation"}
              >
                {a.active ? <Play size={15} /> : <Pause size={15} />}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/dashboard/automations/${a.id}`)}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-on-surface text-sm truncate">{a.name}</span>
                  <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${TRIGGER_COLORS[a.trigger_type] || "bg-surface-subtle text-on-surface-muted"}`}>
                    {TRIGGER_LABELS[a.trigger_type] || a.trigger_type}
                  </span>
                  {a.active ? (
                    <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">Active</span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-subtle text-on-surface-muted">Draft</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-on-surface-muted">
                  <span className="flex items-center gap-1"><Activity size={10} /> {a.run_count} runs</span>
                  <span>·</span>
                  <span>Created {new Date(a.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => router.push(`/dashboard/automations/${a.id}/logs`)}
                  className="p-2 rounded-lg hover:bg-surface-subtle text-on-surface-muted hover:text-on-surface transition-colors"
                  title="View logs"
                >
                  <Activity size={15} />
                </button>
                <button
                  onClick={() => duplicate(a.id)}
                  className="p-2 rounded-lg hover:bg-surface-subtle text-on-surface-muted hover:text-on-surface transition-colors"
                  title="Duplicate"
                >
                  <Copy size={15} />
                </button>
                <button
                  onClick={() => del(a.id)}
                  disabled={deleting === a.id}
                  className="p-2 rounded-lg hover:bg-red-50 text-on-surface-muted hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
                <ChevronRight
                  size={15}
                  className="text-on-surface-muted cursor-pointer"
                  onClick={() => router.push(`/dashboard/automations/${a.id}`)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
