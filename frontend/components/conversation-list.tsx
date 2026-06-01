import { useState, useRef, useEffect, useMemo } from "react";
import { api, Lead } from "@/lib/api";
import { SegmentBadge } from "./segment-badge";
import { formatIST, formatPhone, cn } from "@/lib/utils";
import { MessageCircle, Trash2, MoreVertical, Search, X, SearchX, ChevronLeft, Pin, Filter, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-indigo-500", "bg-cyan-500",
  "bg-teal-500", "bg-pink-500", "bg-rose-500", "bg-orange-500",
  "bg-amber-500", "bg-emerald-500",
];

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(lead: Lead): string {
  if (lead.name) return lead.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  if (lead.phone) return lead.phone.slice(-2);
  return "??";
}

type ConversationLead = Lead & { last_reply_at?: string };

function IgIcon({ size = 12, className = "" }: { size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TgIcon({ size = 12, className = "" }: { size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function FbIcon({ size = 12, className = "" }: { size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

type PlatformFilter = "whatsapp" | "instagram" | "facebook" | "telegram" | "all";

interface PlatformIconProps {
  size?: number | string;
  className?: string;
}

const PLATFORMS: { value: PlatformFilter; label: string; icon: React.FC<PlatformIconProps> }[] = [
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "instagram", label: "Instagram", icon: IgIcon },
  { value: "facebook", label: "Facebook", icon: FbIcon },
  { value: "telegram", label: "Telegram", icon: TgIcon },
  { value: "all", label: "All", icon: SearchX },
];

const SEGMENTS = [
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
  platform: string;
  onPlatformChange: (platform: string) => void;
  onCollapse?: () => void;
  onPin?: (id: string) => void;
  onPinSelected?: (ids: string[]) => void;
  onRefresh?: () => void;
}

export function ConversationList({ leads, selectedId, onSelect, onDeleted, platform, onPlatformChange, onCollapse, onPin, onPinSelected, onRefresh }: Props) {
  const [segment, setSegment] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const visible = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const base = platform === "all" ? leads : leads.filter((l) => l.source === platform);
    return (segment ? base.filter((l) => l.segment === segment) : base)
      .filter((l) => {
        if (!q) return true;
        const name = l.name?.toLowerCase() || "";
        const phone = l.phone?.toLowerCase() || "";
        return name.includes(q) || phone.includes(q);
      })
      .sort((a, b) => {
        const aPinned = a.pinned_at ? 1 : 0;
        const bPinned = b.pinned_at ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        if (aPinned && bPinned) {
          return new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime();
        }
        if (a.needs_human_intervention && !b.needs_human_intervention) return -1;
        if (!a.needs_human_intervention && b.needs_human_intervention) return 1;
        const aTime = (a as ConversationLead).last_reply_at || a.created_at;
        const bTime = (b as ConversationLead).last_reply_at || b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
  }, [leads, platform, segment, searchQuery]);

  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = { whatsapp: 0, instagram: 0, facebook: 0, telegram: 0, all: leads.length };
    for (const l of leads) {
      if (l.source in counts) counts[l.source]++;
    }
    return counts;
  }, [leads]);

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

  function handleRefresh() {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    onRefresh();
    setTimeout(() => setIsRefreshing(false), 900);
  }

  function getPlatformColor(source: string): string {
    switch (source) {
      case "whatsapp": return "text-green-500";
      case "instagram": return "text-pink-500";
      case "facebook": return "text-blue-600";
      case "telegram": return "text-sky-500";
      default: return "text-green-500";
    }
  }

  function getPlatformBg(selected: boolean, source: string): string {
    if (!selected) return "bg-surface-low text-on-surface-muted hover:bg-surface-mid hover:text-on-surface";
    switch (source) {
      case "whatsapp": return "bg-green-500 text-white shadow-sm";
      case "instagram": return "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm";
      case "facebook": return "bg-blue-600 text-white shadow-sm";
      case "telegram": return "bg-sky-500 text-white shadow-sm";
      case "all": return "bg-tertiary text-white shadow-sm";
      default: return "bg-tertiary text-white shadow-sm";
    }
  }

  return (
    <div className="w-[340px] flex-shrink-0 bg-surface border-r border-surface-mid flex flex-col h-full shadow-[2px_0_10px_rgba(0,0,0,0.02)] z-10 relative">
      <div className="px-4 py-3 border-b border-surface-mid bg-surface relative z-10">
        {selectionMode ? (
          /* ── Selection mode bar ── */
          <div className="flex items-center justify-between py-1">
            <span className="font-display text-sm font-semibold text-tertiary">{selectedIds.size} selected</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(selectedIds.size === visible.length && visible.length > 0 ? new Set() : new Set(visible.map(l => l.id)))}
                className="text-[11px] font-semibold text-tertiary hover:text-tertiary/80 transition-colors"
              >
                {selectedIds.size === visible.length && visible.length > 0 ? "Deselect All" : "Select All"}
              </button>
              <button onClick={cancelSelection} className="text-[11px] font-semibold text-on-surface-muted hover:text-on-surface transition-colors ml-1">
                Cancel
              </button>
              {selectedIds.size > 0 && onPinSelected && (
                <button onClick={() => onPinSelected(Array.from(selectedIds))} className="flex items-center gap-1.5 text-amber-600 bg-amber-50 hover:bg-amber-100 text-[11px] font-semibold ml-2 px-2 py-1 rounded-md transition-colors">
                  <Pin size={12} /> Pin
                </button>
              )}
              {selectedIds.size > 0 && (
                <button onClick={handleDeleteSelected} disabled={isDeleting} className="flex items-center gap-1.5 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-[11px] font-semibold ml-2 px-2 py-1 rounded-md transition-colors">
                  <Trash2 size={12} /> {isDeleting ? "..." : "Delete"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* ── Title row ── */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <h2 className="font-display text-base font-bold text-on-surface tracking-tight">Conversations</h2>
                {onCollapse && (
                  <button onClick={onCollapse} className="p-1 rounded-md hover:bg-surface-low text-on-surface-muted hover:text-on-surface transition-colors">
                    <ChevronLeft size={15} />
                  </button>
                )}
              </div>
              <div className="relative" ref={menuRef}>
                <button onClick={() => setMenuOpen(!menuOpen)} className="p-1.5 rounded-md hover:bg-surface-low text-on-surface-muted hover:text-on-surface transition-colors">
                  <MoreVertical size={15} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-36 bg-surface border border-surface-mid rounded-xl shadow-xl overflow-hidden z-20 py-1.5">
                    <button onClick={() => { setSelectionMode(true); setMenuOpen(false); }} className="w-full text-left px-4 py-2 text-[13px] font-medium text-on-surface hover:bg-surface-low transition-colors">
                      Select chats
                    </button>
                    <button onClick={() => { setSelectionMode(true); setSelectedIds(new Set(visible.map(l => l.id))); setMenuOpen(false); }} className="w-full text-left px-4 py-2 text-[13px] font-medium text-on-surface hover:bg-surface-low transition-colors">
                      Select all
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Search + Filter + Refresh row ── */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 group">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted group-focus-within:text-tertiary transition-colors" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-2 bg-surface-low border border-surface-mid rounded-xl text-[13px] text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:ring-2 focus:ring-tertiary/20 focus:border-tertiary transition-all"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-muted hover:text-on-surface p-0.5 rounded-full hover:bg-surface-mid transition-colors">
                    <X size={11} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                title="Filters"
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 relative",
                  filtersOpen
                    ? "bg-tertiary text-white shadow-sm"
                    : "bg-surface-low border border-surface-mid text-on-surface-muted hover:bg-surface-mid"
                )}
              >
                <Filter size={14} />
                {(segment !== null || platform !== "whatsapp") && !filtersOpen && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-tertiary rounded-full" />
                )}
              </button>
              <button
                onClick={handleRefresh}
                title="Refresh"
                disabled={isRefreshing}
                className="w-9 h-9 rounded-xl bg-surface-low border border-surface-mid flex items-center justify-center text-on-surface-muted hover:bg-surface-mid transition-colors shrink-0 disabled:opacity-60"
              >
                <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
              </button>
            </div>

            {/* ── Collapsible filter panel ── */}
            {filtersOpen && (
              <div className="mt-3 space-y-3 pb-1">
                <div className="flex gap-1.5 flex-wrap">
                  {PLATFORMS.map((p) => {
                    const count = p.value === "all" ? platformCounts.all : (platformCounts[p.value] ?? 0);
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.value}
                        onClick={() => onPlatformChange(p.value)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg font-label text-[11px] font-semibold transition-all duration-200 flex items-center gap-1.5",
                          getPlatformBg(platform === p.value, p.value)
                        )}
                      >
                        <Icon size={11} className={platform === p.value ? "text-white" : getPlatformColor(p.value === "all" ? "whatsapp" : p.value)} />
                        {p.label === "WhatsApp" ? "WA" : p.label === "All" ? "All" : p.label.substring(0, 4)}
                        <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-bold min-w-[18px] text-center", platform === p.value ? "bg-white/20 text-white" : "bg-surface-mid text-on-surface-muted")}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {SEGMENTS.map((f) => {
                    const count = leads.filter(l => l.segment === f.value && (platform === "all" || l.source === platform)).length;
                    return (
                      <button
                        key={f.value}
                        onClick={() => setSegment(segment === f.value ? null : f.value)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg font-label text-[11px] font-semibold transition-all duration-200 flex items-center gap-1.5",
                          segment === f.value ? "bg-tertiary text-white shadow-sm" : "bg-surface-low text-on-surface-muted hover:bg-surface-mid hover:text-on-surface"
                        )}
                      >
                        {f.label}
                        <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-bold min-w-[18px] text-center", segment === f.value ? "bg-white/20 text-white" : "bg-surface-mid text-on-surface-muted")}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="font-label text-[11px] text-on-surface-muted">{visible.length} conversations</p>
              </div>
            )}
          </>
        )}
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
            {(searchQuery || segment || platform !== "whatsapp") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSegment(null);
                  onPlatformChange("whatsapp");
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
                "w-full text-left px-4 py-3.5 border-b border-surface-mid/40 transition-all duration-150 group flex items-start gap-3 relative",
                selectedId === lead.id
                  ? "bg-surface before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-tertiary"
                  : "hover:bg-surface"
              )}
            >
              {selectionMode && (
                <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(lead.id)}
                    onChange={(e) => toggleSelect(lead.id, e as unknown as React.MouseEvent)}
                    className="cursor-pointer w-4 h-4 rounded border-surface-mid text-tertiary focus:ring-tertiary"
                  />
                </div>
              )}

              {/* Avatar with channel badge */}
              <div className="relative shrink-0 mt-0.5">
                <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-xs select-none", getAvatarColor(lead.id))}>
                  {getInitials(lead)}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-[16px] h-[16px] rounded-full bg-surface border border-surface flex items-center justify-center shadow-sm">
                  {lead.source === "instagram" ? (
                    <IgIcon size={9} className="text-pink-500" />
                  ) : lead.source === "telegram" ? (
                    <TgIcon size={9} className="text-sky-500" />
                  ) : lead.source === "facebook" ? (
                    <FbIcon size={9} className="text-blue-600" />
                  ) : (
                    <MessageCircle size={9} className="text-green-500" />
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Row 1: name + timestamp */}
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className={cn(
                      "font-display text-[13px] font-semibold truncate",
                      selectedId === lead.id ? "text-tertiary" : "text-on-surface"
                    )}>
                      {lead.name || formatPhone(lead.phone) || "Unknown"}
                    </span>
                    {onPin ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onPin(lead.id); }}
                        className={cn(
                          "shrink-0 p-0.5 rounded transition-all",
                          lead.pinned_at
                            ? "text-amber-500 opacity-100 hover:text-amber-700"
                            : "opacity-0 group-hover:opacity-100 text-on-surface-muted hover:text-amber-500"
                        )}
                      >
                        <Pin size={10} className={lead.pinned_at ? "fill-current" : ""} />
                      </button>
                    ) : lead.pinned_at ? (
                      <Pin size={10} className="text-amber-500 fill-current shrink-0" />
                    ) : null}
                  </div>
                  <span className="font-label text-[10px] text-on-surface-muted shrink-0 whitespace-nowrap">
                    {formatIST((lead as ConversationLead).last_reply_at || lead.created_at)}
                  </span>
                </div>

                {/* Row 2: last message */}
                <p className="font-body text-[11.5px] text-on-surface-muted truncate leading-snug mb-1.5">
                  {lead.last_message_content || (lead.phone ? formatPhone(lead.phone) : "No messages yet")}
                </p>

                {/* Row 3: status badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {lead.needs_human_intervention && (
                    <span className="font-label text-[9px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">ACTION</span>
                  )}
                  <span className={cn(
                    "font-label text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                    lead.ai_enabled !== false
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  )}>
                    {lead.ai_enabled !== false ? "Bot" : "You"}
                  </span>
                  {lead.ad_campaign_id && (
                    <span className="inline-flex items-center gap-0.5 font-label text-[9px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>
                      Meta Ad
                    </span>
                  )}
                  <SegmentBadge segment={lead.segment} />
                  {lead.opted_out ? (
                    <span className="font-label text-[9px] font-bold text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">STOP</span>
                  ) : (
                    <span className="font-label text-[10px] text-on-surface-muted font-medium">{lead.score}</span>
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
