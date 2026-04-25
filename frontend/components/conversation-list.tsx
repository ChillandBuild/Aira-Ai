"use client";
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

interface Props {
  leads: Lead[];
  selectedId: string | null;
  onSelect: (lead: Lead) => void;
}

export function ConversationList({ leads, selectedId, onSelect }: Props) {
  return (
    <div className="w-80 flex-shrink-0 bg-surface border-r border-surface-mid flex flex-col h-full">
      <div className="px-5 py-4 border-b border-surface-mid">
        <h2 className="font-display text-base font-bold text-tertiary">Conversations</h2>
        <p className="font-label text-xs text-on-surface-muted">{leads.length} leads</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {leads.map((lead) => (
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
            <div className="flex items-center gap-2">
              <SegmentBadge segment={lead.segment} />
              <span className="font-label text-xs text-on-surface-muted">Score {lead.score}/10</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
