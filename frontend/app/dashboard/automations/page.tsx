"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Zap, Play, Pause, Copy, Trash2, ChevronRight, Activity, Users, Loader2 } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { useAuthRole } from "../contexts/AuthRoleContext";
import { TRIGGER_LABELS, TRIGGER_COLORS } from "./[id]/flow/blockMeta";
import type { FlowListItem } from "./[id]/flow/types";

export default function BotFlowsPage() {
  const { role, loading: roleLoading } = useAuthRole();
  const router = useRouter();
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/automations/?flow_kind=bot_flow`, { headers: auth });
      if (res.ok) {
        const json = await res.json();
        setFlows(json.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "owner") {
    return (
      <div className="text-center py-20">
        <p className="text-on-surface-muted font-body">
          This section is only available for owners/admins.
        </p>
      </div>
    );
  }

  const toggle = async (f: FlowListItem) => {
    setToggling(f.id);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/automations/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ active: !f.active }),
      });
      if (res.ok) await load();
    } finally {
      setToggling(null);
    }
  };

  const duplicate = async (id: string) => {
    const auth = await getAuthHeaders();
    const res = await fetch(`${API_URL}/api/v1/automations/${id}/duplicate`, { method: "POST", headers: auth });
    if (res.ok) await load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this bot flow?")) return;
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Zap size={22} className="text-violet-500" />
            Bot Flows
          </h1>
          <p className="text-sm text-on-surface-muted mt-1">
            Design WhatsApp message sequences that run on their own
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard/automations/new")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          New Flow
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-surface-subtle animate-pulse" />
          ))}
        </div>
      ) : flows.length === 0 ? (
        <div className="text-center py-24 text-on-surface-muted">
          <Zap size={40} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium text-lg mb-1">No bot flows yet</p>
          <p className="text-sm mb-6">Build your first automated message sequence in minutes.</p>
          <button
            onClick={() => router.push("/dashboard/automations/new")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} /> Create flow
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {flows.map((f) => (
            <div
              key={f.id}
              className="group flex items-center gap-4 p-4 rounded-2xl bg-surface border border-surface-mid hover:border-primary/30 transition-all"
            >
              <button
                onClick={() => toggle(f)}
                disabled={toggling === f.id}
                className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                  f.active
                    ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                    : "bg-surface-subtle text-on-surface-muted hover:bg-surface-mid"
                }`}
                title={f.active ? "Pause flow" : "Activate flow"}
              >
                {f.active ? <Play size={15} /> : <Pause size={15} />}
              </button>

              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/dashboard/automations/${f.id}`)}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-on-surface text-sm truncate">{f.name}</span>
                  <span
                    className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      TRIGGER_COLORS[f.trigger_type] || "bg-surface-subtle text-on-surface-muted"
                    }`}
                  >
                    {TRIGGER_LABELS[f.trigger_type] || f.trigger_type}
                  </span>
                  {f.active ? (
                    <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">Active</span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-subtle text-on-surface-muted">Draft</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-on-surface-muted">
                  <span className="flex items-center gap-1">
                    <Users size={10} /> {f.subscriber_count} subscribers
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Activity size={10} /> {f.run_count} runs
                  </span>
                  <span>·</span>
                  <span>Created {new Date(f.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => duplicate(f.id)}
                  className="p-2 rounded-lg hover:bg-surface-subtle text-on-surface-muted hover:text-on-surface transition-colors"
                  title="Duplicate"
                >
                  <Copy size={15} />
                </button>
                <button
                  onClick={() => del(f.id)}
                  disabled={deleting === f.id}
                  className="p-2 rounded-lg hover:bg-red-50 text-on-surface-muted hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
                <ChevronRight
                  size={15}
                  className="text-on-surface-muted cursor-pointer"
                  onClick={() => router.push(`/dashboard/automations/${f.id}`)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
