"use client";
import { useState } from "react";
import { api, Lead } from "@/lib/api";
import { SegmentBadge } from "./segment-badge";
import { timeAgo, formatPhone, cn } from "@/lib/utils";
import { MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

type ConversationLead = Lead & { last_reply_at?: string };

function IgIcon({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

const FILTERS = [
  { label: "All", value: null },
  { label: "Hot", value: "A" },
  { label: "Warm", value: "B" },
  { label: "Cold", value: "C" },
  { label: "DQ", value: "D" },
] as const;

interface Props {
  leads: Lead[];
  selectedId: string | null;
  onSelect: (lead: Lead) => void;
  onDeleted?: (ids: string[]) => void;
}

export function ConversationList({ leads, selectedId, onSelect, onDeleted }: Props) {
  const [segment, setSegment] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const visible = (segment ? leads.filter((l) => l.segment === segment) : leads).sort((a, b) => {
    if (a.needs_human_intervention && !b.needs_human_intervention) return -1;
    if (!a.needs_human_intervention && b.needs_human_intervention) return 1;
    const aTime = (a as ConversationLead).last_reply_at || a.created_at;
    const bTime = (b as ConversationLead).last_reply_at || b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  async function handleDeleteSelected() {
    if (!confirm(`Delete ${selectedIds.size} conversations?`)) return;
    setIsDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => api.leads.delete(id)));
      onDeleted?.(Array.from(selectedIds));
      setSelectedIds(new Set());
      toast.success("Conversations deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete some conversations");
    } finally {
      setIsDeleting(false);
    }
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  return (
    <div className="w-80 flex-shrink-0 bg-surface border-r border-surface-mid flex flex-col h-full">
      <div className="px-5 py-4 border-b border-surface-mid">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-tertiary">Conversations</h2>
          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="flex items-center gap-1 text-red-600 hover:text-red-700 disabled:opacity-50 text-xs font-semibold"
            >
              <Trash2 size={12} />
              {isDeleting ? "..." : "Delete"}
            </button>
          )}
        </div>
        <p className="font-label text-xs text-on-surface-muted">{visible.length} leads</p>
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={String(f.value)}
              onClick={() => setSegment(f.value as typeof segment)}
              className={cn(
                "px-2.5 py-1 rounded-lg font-label text-xs font-semibold transition-colors",
                segment === f.value
                  ? "bg-tertiary text-white"
                  : "bg-surface-low text-on-surface-muted hover:bg-surface-mid"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {visible.map((lead) => (
          <button
            key={lead.id}
            onClick={() => onSelect(lead)}
            className={cn(
              "w-full text-left px-5 py-4 border-b border-surface-mid/50 transition-colors hover:bg-surface-low group flex gap-3",
              selectedId === lead.id && "bg-surface-low"
            )}
          >
            <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedIds.has(lead.id)}
                onChange={(e) => toggleSelect(lead.id, e as unknown as React.MouseEvent)}
                className="cursor-pointer"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {lead.source === "instagram" ? (
                    <IgIcon size={12} className="shrink-0 text-pink-500" />
                  ) : (
                    <MessageCircle size={12} className="shrink-0 text-green-500" />
                  )}
                  <span className="font-body text-sm font-semibold text-on-surface truncate">
                    {lead.name || formatPhone(lead.phone) || "Instagram lead"}
                  </span>
                </div>
                <span className="font-label text-[10px] text-on-surface-muted shrink-0">
                  {timeAgo((lead as ConversationLead).last_reply_at || lead.created_at)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {lead.needs_human_intervention && (
                  <span className="font-label text-[10px] font-semibold text-white bg-red-500 px-1.5 py-0.5 rounded">ACTION REQUIRED</span>
                )}
                <SegmentBadge segment={lead.segment} />
                {lead.opted_out ? (
                  <span className="font-label text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">STOP</span>
                ) : (
                  <span className="font-label text-xs text-on-surface-muted">Score {lead.score}/10</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
