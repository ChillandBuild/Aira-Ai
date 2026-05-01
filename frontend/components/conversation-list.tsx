"use client";
import { useState } from "react";
import { Lead } from "@/lib/api";
import { SegmentBadge } from "./segment-badge";
import { timeAgo, formatPhone, cn } from "@/lib/utils";
import { MessageCircle } from "lucide-react";

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
}

export function ConversationList({ leads, selectedId, onSelect }: Props) {
  const [segment, setSegment] = useState<"A" | "B" | "C" | "D" | null>(null);
  const visible = (segment ? leads.filter((l) => l.segment === segment) : leads).sort((a, b) => {
    if (a.needs_human_intervention && !b.needs_human_intervention) return -1;
    if (!a.needs_human_intervention && b.needs_human_intervention) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="w-80 flex-shrink-0 bg-surface border-r border-surface-mid flex flex-col h-full">
      <div className="px-5 py-4 border-b border-surface-mid">
        <h2 className="font-display text-base font-bold text-tertiary">Conversations</h2>
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
              "w-full text-left px-5 py-4 border-b border-surface-mid/50 transition-colors hover:bg-surface-low",
              selectedId === lead.id && "bg-surface-low"
            )}
          >
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
                {timeAgo(lead.created_at)}
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
          </button>
        ))}
      </div>
    </div>
  );
}
