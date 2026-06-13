"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Users, X, Check, Loader2, Trash2, Pencil } from "lucide-react";
import { api, type Caller } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

interface LiveAgentStatusProps {
  callers: Caller[];
  selectedCallerId: string | null;
  onSelectCaller: (id: string | null) => void;
  statsFrom: string;
  statsTo: string;
  onStatsFromChange: (v: string) => void;
  onStatsToChange: (v: string) => void;
  onCallersChange: (updater: (prev: Caller[]) => Caller[]) => void;
  onRemoved: () => Promise<void> | void;
}

export default function LiveAgentStatus({
  callers, selectedCallerId, onSelectCaller,
  statsFrom, statsTo, onStatsFromChange, onStatsToChange,
  onCallersChange, onRemoved,
}: LiveAgentStatusProps) {
  const [editingAgentIdFor, setEditingAgentIdFor] = useState<string | null>(null);
  const [agentIdInputValue, setAgentIdInputValue] = useState<string>("");
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);

  const totalAgentsCount = callers.length;
  const breakAgents = callers.filter((c) => c.status === "break");
  const activeAgents = callers.filter((c) => (c.status || "active") === "active");
  const offlineAgents = callers.filter((c) => c.status === "logged_out");

  const handleRemoveCaller = async (callerId: string, callerName: string) => {
    if (!confirm(`Remove ${callerName}?`)) return;
    try {
      await api.callers.remove(callerId);
      toast.success(`${callerName} removed`);
      await onRemoved();
      if (selectedCallerId === callerId) onSelectCaller(null);
    } catch (err) {
      console.error("Failed to remove caller:", err);
      toast.error("Failed to remove caller");
    }
  };

  const handleSaveAgentId = async (callerId: string) => {
    setSavingAgentId(callerId);
    try {
      const trimmed = agentIdInputValue.trim();
      const updated = await api.callers.update(callerId, { telecmi_agent_id: trimmed || null });
      onCallersChange((prev) =>
        prev.map((c) => (c.id === callerId ? { ...c, telecmi_agent_id: updated.telecmi_agent_id } : c))
      );
      setEditingAgentIdFor(null);
      setAgentIdInputValue("");
    } catch (err) {
      console.error("Failed to update TeleCMI agent ID:", err);
      toast.error("Failed to update TeleCMI agent ID");
    } finally {
      setSavingAgentId(null);
    }
  };

  return (
    <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h2 className="font-display text-sm font-bold text-tertiary flex items-center gap-2">
          <Users size={16} className="text-primary" /> Live Agent Status
        </h2>
        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
          <span className="font-label text-[10px] text-slate-500 font-bold uppercase pl-1">Range:</span>
          <input type="date" value={statsFrom} onChange={(e) => onStatsFromChange(e.target.value)} className="px-2 py-1 rounded bg-white border border-slate-200 font-body text-xs text-slate-800 focus:outline-none" />
          <span className="text-slate-400 text-xs">to</span>
          <input type="date" value={statsTo} onChange={(e) => onStatsToChange(e.target.value)} className="px-2 py-1 rounded bg-white border border-slate-200 font-body text-xs text-slate-800 focus:outline-none" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
          <span className="font-bold text-slate-700">{totalAgentsCount} Total</span>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="font-bold">{activeAgents.length} Ready</span>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 bg-amber-500 rounded-full" />
          <span className="font-bold">{breakAgents.length} On Break</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 bg-slate-400 rounded-full" />
          <span className="font-bold">{offlineAgents.length} Offline</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
        {callers.map((c) => {
          const st = c.status || "active";
          const statusColor = st === "active" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : st === "break" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-slate-500 bg-slate-100 border-slate-200";
          const isSelected = selectedCallerId === c.id;
          return (
            <div
              key={c.id}
              onClick={() => onSelectCaller(selectedCallerId === c.id ? null : c.id)}
              className={`relative flex items-center justify-between p-2.5 bg-surface-low rounded-xl border text-xs cursor-pointer transition-all ${
                isSelected ? "ring-2 ring-primary border-primary/40 bg-primary/5" : "border-slate-100 hover:border-slate-200"
              }`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); handleRemoveCaller(c.id, c.name); }}
                className="absolute top-1 right-1 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                title={`Remove ${c.name}`}
              >
                <Trash2 size={11} />
              </button>
              <div className="truncate pr-5">
                <span className="font-bold text-slate-800">{c.name}</span>
                {c.status_changed_at && (
                  <span className="block text-[10px] text-slate-400 font-medium">Since {timeAgo(c.status_changed_at)}</span>
                )}
                <span className="block text-xs text-slate-500 mt-0.5">{c.phone || "—"}</span>
                {editingAgentIdFor === c.id ? (
                  <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={agentIdInputValue}
                      onChange={(e) => setAgentIdInputValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="w-20 px-1 py-0.5 rounded bg-white border border-slate-200 text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSaveAgentId(c.id); }}
                      disabled={savingAgentId === c.id}
                      className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded border border-emerald-200"
                      title="Save Agent ID"
                    >
                      {savingAgentId === c.id ? <Loader2 className="animate-spin" size={10} /> : <Check size={10} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingAgentIdFor(null); setAgentIdInputValue(""); }}
                      disabled={savingAgentId === c.id}
                      className="p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded border border-slate-200"
                      title="Cancel"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    {c.telecmi_agent_id || "—"}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingAgentIdFor(c.id); setAgentIdInputValue(c.telecmi_agent_id || ""); }}
                      className="p-0.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded"
                      title="Edit TeleCMI Agent ID"
                    >
                      <Pencil size={9} />
                    </button>
                  </span>
                )}
              </div>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${statusColor}`}>
                {st === "logged_out" ? "Offline" : st}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
