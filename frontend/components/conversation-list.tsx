import { useState, useRef, useEffect } from "react";
import { api, Lead } from "@/lib/api";
import { SegmentBadge } from "./segment-badge";
import { timeAgo, formatPhone, cn } from "@/lib/utils";
import { MessageCircle, Trash2, MoreVertical, Search, X, SearchX } from "lucide-react";
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const visible = (segment ? leads.filter((l) => l.segment === segment) : leads)
    .filter((l) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const name = l.name?.toLowerCase() || "";
      const phone = l.phone?.toLowerCase() || "";
      return name.includes(q) || phone.includes(q);
    })
    .sort((a, b) => {
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
      setSelectionMode(false);
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

  function cancelSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  return (
    <div className="w-[340px] flex-shrink-0 bg-surface border-r border-surface-mid flex flex-col h-full shadow-[2px_0_10px_rgba(0,0,0,0.02)] z-10 relative">
      <div className="px-5 py-5 border-b border-surface-mid relative bg-surface z-10">
        <div className="flex items-center justify-between">
          {selectionMode ? (
            <div className="flex items-center justify-between w-full">
              <span className="font-display text-sm font-semibold text-tertiary">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (selectedIds.size === visible.length && visible.length > 0) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(visible.map(l => l.id)));
                    }
                  }}
                  className="text-[11px] font-semibold text-tertiary hover:text-tertiary/80 transition-colors"
                >
                  {selectedIds.size === visible.length && visible.length > 0 ? "Deselect All" : "Select All"}
                </button>
                <button
                  onClick={cancelSelection}
                  className="text-[11px] font-semibold text-on-surface-muted hover:text-on-surface transition-colors ml-1"
                >
                  Cancel
                </button>
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    disabled={isDeleting}
                    className="flex items-center gap-1.5 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-[11px] font-semibold ml-2 px-2 py-1 rounded-md transition-colors"
                  >
                    <Trash2 size={12} />
                    {isDeleting ? "..." : "Delete"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <h2 className="font-display text-lg font-bold text-tertiary tracking-tight">Conversations</h2>
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-1.5 rounded-md hover:bg-surface-low text-on-surface-muted hover:text-on-surface transition-colors"
                >
                  <MoreVertical size={16} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-32 bg-surface border border-surface-mid rounded-xl shadow-xl overflow-hidden z-20 py-1.5">
                    <button
                      onClick={() => {
                        setSelectionMode(true);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-[13px] font-medium text-on-surface hover:bg-surface-low transition-colors flex items-center justify-between group"
                    >
                      Select chats
                    </button>
                    <button
                      onClick={() => {
                        setSelectionMode(true);
                        setSelectedIds(new Set(visible.map(l => l.id)));
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-[13px] font-medium text-on-surface hover:bg-surface-low transition-colors flex items-center justify-between group"
                    >
                      Select all
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        
        <div className="relative mt-4 mb-4 group">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted group-focus-within:text-tertiary transition-colors" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-surface-low border border-surface-mid rounded-xl text-sm text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:ring-2 focus:ring-tertiary/20 focus:border-tertiary transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-muted hover:text-on-surface p-0.5 rounded-full hover:bg-surface-mid transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between mb-2">
          <p className="font-label text-xs font-medium text-on-surface-muted">{visible.length} leads</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => {
            const count = f.value === null ? leads.length : leads.filter(l => l.segment === f.value).length;
            return (
              <button
                key={String(f.value)}
                onClick={() => setSegment(f.value as typeof segment)}
                className={cn(
                  "px-2.5 py-1 rounded-lg font-label text-[11px] font-semibold transition-all duration-200 flex items-center gap-1.5",
                  segment === f.value
                    ? "bg-tertiary text-white shadow-sm"
                    : "bg-surface-low text-on-surface-muted hover:bg-surface-mid hover:text-on-surface"
                )}
              >
                {f.label}
                <span className={cn(
                  "px-1.5 py-0.5 rounded-full text-[9px] font-bold min-w-[18px] text-center",
                  segment === f.value ? "bg-white/20 text-white" : "bg-surface-mid text-on-surface-muted"
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-surface-low/30">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10 text-on-surface-muted space-y-3 animate-in fade-in duration-300">
            <div className="w-14 h-14 rounded-2xl bg-surface-low border border-surface-mid flex items-center justify-center shadow-sm">
              <SearchX size={24} className="text-on-surface-muted opacity-60" />
            </div>
            <div>
              <p className="font-display font-semibold text-[15px] text-on-surface">No conversations found</p>
              <p className="text-[13px] mt-1.5 leading-relaxed">Try adjusting your search query or switching filters to find what you&apos;re looking for.</p>
            </div>
            {(searchQuery || segment) && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSegment(null);
                }}
                className="mt-3 text-[13px] font-semibold text-tertiary hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          visible.map((lead) => (
            <button
              key={lead.id}
              onClick={() => onSelect(lead)}
              className={cn(
                "w-full text-left px-5 py-4 border-b border-surface-mid/50 transition-all hover:bg-surface-low group flex gap-3 relative",
                selectedId === lead.id ? "bg-surface-low before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-tertiary" : ""
              )}
            >
              {selectionMode && (
                <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(lead.id)}
                    onChange={(e) => toggleSelect(lead.id, e as unknown as React.MouseEvent)}
                    className="cursor-pointer w-4 h-4 rounded border-surface-mid text-tertiary focus:ring-tertiary transition-colors"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {lead.source === "instagram" ? (
                      <IgIcon size={13} className="shrink-0 text-pink-500 drop-shadow-sm" />
                    ) : (
                      <MessageCircle size={13} className="shrink-0 text-green-500 drop-shadow-sm" />
                    )}
                    <span className={cn(
                      "font-display text-[14px] font-semibold truncate",
                      selectedId === lead.id ? "text-tertiary" : "text-on-surface group-hover:text-tertiary transition-colors"
                    )}>
                      {lead.name || formatPhone(lead.phone) || "Instagram lead"}
                    </span>
                  </div>
                  <span className="font-label text-[10px] font-medium text-on-surface-muted shrink-0 whitespace-nowrap">
                    {timeAgo((lead as ConversationLead).last_reply_at || lead.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {lead.needs_human_intervention && (
                    <span className="font-label text-[9px] font-bold tracking-wider text-white bg-red-500 px-1.5 py-0.5 rounded shadow-sm">ACTION</span>
                  )}
                  <SegmentBadge segment={lead.segment} />
                  {lead.opted_out ? (
                    <span className="font-label text-[9px] font-bold tracking-wider text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">STOP</span>
                  ) : (
                    <span className="font-label text-[11px] font-medium text-on-surface-muted">Score {lead.score}/10</span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
