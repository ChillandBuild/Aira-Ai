"use client";
import { useEffect, useState, useCallback } from "react";
import { api, InboundLead } from "@/lib/api";
import {
  Download, Megaphone, Filter, X,
  Smartphone, MessageSquare, Users, RefreshCw, ChevronDown, RadioTower,
} from "lucide-react";
import { cn, formatPhone } from "@/lib/utils";
import { SegmentBadge } from "@/components/segment-badge";
import { toast } from "sonner";

// ─── Constants ───────────────────────────────────────────────────────────────

const CHANNEL_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  whatsapp: {
    label: "WhatsApp",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
  },
  instagram: {
    label: "Instagram",
    color: "text-pink-700",
    bg: "bg-pink-50 border-pink-200",
    dot: "bg-pink-500",
  },
  facebook: {
    label: "Facebook",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    dot: "bg-blue-500",
  },
  telegram: {
    label: "Telegram",
    color: "text-sky-700",
    bg: "bg-sky-50 border-sky-200",
    dot: "bg-sky-500",
  },
};

const SOURCE_OPTIONS = [
  { value: "", label: "All Channels" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "telegram", label: "Telegram" },
];

const ORIGIN_OPTIONS = [
  { value: "all", label: "All" },
  { value: "organic", label: "Organic" },
  { value: "ad", label: "Ad" },
] as const;

const SEGMENT_FILTER_OPTIONS = [
  { value: "", label: "All Segments" },
  { value: "A", label: "Hot" },
  { value: "B", label: "Warm" },
  { value: "C", label: "Cold" },
  { value: "D", label: "Disqualified" },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function ChannelBadge({ source }: { source: string }) {
  const cfg = CHANNEL_CONFIG[source] ?? {
    label: source,
    color: "text-zinc-600",
    bg: "bg-zinc-100 border-zinc-200",
    dot: "bg-zinc-400",
  };
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border",
      cfg.bg, cfg.color
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(Math.max(score, 1), 10) * 10;
  const color = score >= 8 ? "bg-emerald-500" : score >= 6 ? "bg-amber-400" : "bg-zinc-300";
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-500 font-bold">{score}</span>
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, gradient,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  gradient: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-all duration-200 group">
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110", gradient)}>
        <Icon size={19} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900 leading-none tabular-nums">{value}</p>
        <p className="text-xs text-zinc-400 font-medium mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mb-4 shadow-sm">
        <RadioTower size={28} className="text-violet-400" />
      </div>
      <h3 className="font-bold text-zinc-700 text-lg mb-1">No Inbound Leads Yet</h3>
      <p className="text-sm text-zinc-400 max-w-sm leading-relaxed">
        Leads will appear here when users message you via WhatsApp, Instagram DM,
        Facebook Messenger, or Telegram — whether from an ad or organically.
      </p>
      <div className="mt-5 flex items-center gap-2 flex-wrap justify-center">
        {["WhatsApp", "Instagram DM", "Facebook Messenger", "Telegram"].map((ch) => (
          <span key={ch} className="px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-500 text-xs font-medium border border-zinc-200">
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InboundLeadsPage() {
  const [leads, setLeads] = useState<InboundLead[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; campaign_name: string; platform: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);

  // Filters
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [origin, setOrigin] = useState<"all" | "organic" | "ad">("all");
  const [selectedSegment, setSelectedSegment] = useState("");

  const hasFilters = !!(selectedCampaign || selectedSource || dateFrom || dateTo || origin !== "all" || selectedSegment);
  const activeFilterCount = [
    selectedCampaign,
    selectedSource,
    dateFrom,
    dateTo,
    origin !== "all" ? origin : "",
    selectedSegment,
  ].filter(Boolean).length;
  const uniqueKeywords = new Set(leads.filter((l) => l.keyword !== "—").map((l) => l.keyword.toLowerCase().trim())).size;
  const uniqueCampaigns = new Set(leads.map((l) => l.campaign_name)).size;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.inboundLeads.list({
        origin: origin === "all" ? undefined : origin,
        segment: selectedSegment || undefined,
        ad_campaign_id: origin === "organic" ? undefined : (selectedCampaign || undefined),
        source: selectedSource || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 200,
      });
      setLeads(res.data || []);
      setTotal(res.total || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load inbound leads");
    } finally {
      setLoading(false);
    }
  }, [origin, selectedSegment, selectedCampaign, selectedSource, dateFrom, dateTo]);

  useEffect(() => {
    api.inboundLeads.campaigns()
      .then(setCampaigns)
      .catch(() => {}); // non-critical — dropdown just stays empty
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  async function handleExport() {
    setExporting(true);
    try {
      await api.inboundLeads.exportCsv({
        origin: origin === "all" ? undefined : origin,
        segment: selectedSegment || undefined,
        ad_campaign_id: origin === "organic" ? undefined : (selectedCampaign || undefined),
        source: selectedSource || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      toast.success("Downloaded: inbound_leads.csv");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
    } catch { return iso; }
  }

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-7 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm shadow-violet-200">
              <RadioTower size={17} className="text-white" />
            </div>
            <h1 className="page-title">Inbound Leads</h1>
          </div>
          <p className="page-subtitle ml-11.5">
            All inbound leads — organic and Meta Ad, across WhatsApp, Instagram, Facebook &amp; Telegram.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={() => setShowFilters((p) => !p)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl font-label text-sm font-semibold border transition-all",
              showFilters || hasFilters
                ? "bg-violet-50 border-violet-200 text-violet-700"
                : "bg-white border-surface-mid text-on-surface hover:border-violet-300 hover:text-violet-700"
            )}
          >
            <Filter size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-violet-600 text-white text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={fetchLeads}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-surface-mid text-on-surface font-label text-sm font-semibold hover:border-zinc-300 transition-all disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || leads.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white font-label text-sm font-semibold hover:bg-violet-700 transition-all disabled:opacity-40 shadow-sm"
          >
            <Download size={14} />
            {exporting ? "Downloading…" : "Download CSV"}
          </button>
        </div>
      </div>

      {/* ── Filter Panel ───────────────────────────────────────── */}
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        showFilters ? "max-h-80 opacity-100 mb-5" : "max-h-0 opacity-0 mb-0"
      )}>
        <div className="card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="font-label text-sm font-bold text-on-surface flex items-center gap-1.5">
              <Filter size={13} /> Filter Results
            </span>
            {hasFilters && (
              <button
                onClick={() => {
                  setSelectedCampaign("");
                  setSelectedSource("");
                  setDateFrom("");
                  setDateTo("");
                  setOrigin("all");
                  setSelectedSegment("");
                }}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-500 font-semibold transition-colors"
              >
                <X size={11} /> Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-3 mb-3">
            {/* Origin toggle */}
            <div>
              <label className="block font-label text-[10px] font-bold text-on-surface-muted uppercase tracking-wider mb-1.5">Origin</label>
              <div className="flex gap-1 rounded-lg bg-surface-mid p-1">
                {ORIGIN_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setOrigin(o.value)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                      origin === o.value ? "bg-white shadow text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Segment */}
            <div>
              <label className="block font-label text-[10px] font-bold text-on-surface-muted uppercase tracking-wider mb-1.5">Segment</label>
              <select
                value={selectedSegment}
                onChange={(e) => setSelectedSegment(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm bg-surface-low text-on-surface focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                {SEGMENT_FILTER_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Campaign */}
            <div>
              <label className="block font-label text-[10px] font-bold text-on-surface-muted uppercase tracking-wider mb-1.5">Ad Campaign</label>
              <div className="relative">
                <select
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                  disabled={origin === "organic"}
                  className="w-full appearance-none px-3 py-2 pr-8 bg-surface-low border border-surface-mid rounded-xl font-body text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-violet-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="">All Campaigns</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.campaign_name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            {/* Channel */}
            <div>
              <label className="block font-label text-[10px] font-bold text-on-surface-muted uppercase tracking-wider mb-1.5">Channel</label>
              <div className="relative">
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="w-full appearance-none px-3 py-2 pr-8 bg-surface-low border border-surface-mid rounded-xl font-body text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-violet-300 cursor-pointer"
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            {/* From */}
            <div>
              <label className="block font-label text-[10px] font-bold text-on-surface-muted uppercase tracking-wider mb-1.5">From Date</label>
              <input
                type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 bg-surface-low border border-surface-mid rounded-xl font-body text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            {/* To */}
            <div>
              <label className="block font-label text-[10px] font-bold text-on-surface-muted uppercase tracking-wider mb-1.5">To Date</label>
              <input
                type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 bg-surface-low border border-surface-mid rounded-xl font-body text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total Inbound Leads" value={total} icon={RadioTower} gradient="bg-gradient-to-br from-violet-500 to-indigo-600" />
        <StatCard label="Showing Now" value={leads.length} icon={Users} gradient="bg-gradient-to-br from-blue-500 to-cyan-600" />
        <StatCard label="Unique Keywords" value={uniqueKeywords} icon={MessageSquare} gradient="bg-gradient-to-br from-amber-500 to-orange-500" />
        <StatCard label="Active Campaigns" value={uniqueCampaigns} icon={Megaphone} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
      </div>

      {/* ── Info Banner ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 mb-5">
        <Smartphone size={14} className="text-indigo-500 mt-0.5 flex-shrink-0" />
        <p className="font-body text-xs text-indigo-700 leading-relaxed">
          <strong>Origin:</strong> Leads tagged <em>Ad</em> have an{" "}
          <code className="bg-indigo-100 px-1 rounded text-[10px] font-mono">ad_campaign_id</code> from Meta Ad referral data.
          Leads tagged <em>Organic</em> messaged you directly without an ad click.
          Use the Origin toggle above to filter between the two.
        </p>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      <div className="card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-on-surface-muted">
            <RefreshCw size={17} className="animate-spin" />
            <span className="font-body text-sm">Loading inbound leads…</span>
          </div>
        ) : leads.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-mid bg-surface-low/60">
                    {["Contact", "Channel", "Origin", "Keyword (First Message)", "Ad Campaign", "Segment", "Score", "Date & Time Joined"].map((h) => (
                      <th key={h} className="px-5 py-3.5 text-left font-label text-[10px] font-bold text-on-surface-muted uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-mid/50">
                  {leads.map((lead, i) => (
                    <tr
                      key={lead.id}
                      className={cn(
                        "hover:bg-surface-low/60 transition-colors",
                        i % 2 === 1 ? "bg-surface-low/20" : ""
                      )}
                    >
                      {/* Contact */}
                      <td className="px-5 py-3.5">
                        <p className="font-label text-sm font-semibold text-on-surface leading-tight">
                          {lead.name !== "—" ? lead.name : (
                            <span className="text-on-surface-muted italic font-normal text-xs">No name</span>
                          )}
                        </p>
                        <p className="font-body text-xs text-on-surface-muted mt-0.5">
                          {lead.phone !== "—" ? formatPhone(lead.phone) : "—"}
                        </p>
                      </td>

                      {/* Channel */}
                      <td className="px-5 py-3.5">
                        <ChannelBadge source={lead.source} />
                      </td>

                      {/* Origin */}
                      <td className="px-5 py-3.5">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border",
                          lead.origin === "ad"
                            ? "bg-violet-50 border-violet-200 text-violet-700"
                            : "bg-zinc-100 border-zinc-200 text-zinc-600"
                        )}>
                          {lead.origin.charAt(0).toUpperCase() + lead.origin.slice(1)}
                        </span>
                      </td>

                      {/* Keyword */}
                      <td className="px-5 py-3.5 max-w-[210px]">
                        {lead.keyword !== "—" ? (
                          <span
                            title={lead.keyword}
                            className="inline-block font-body text-xs text-amber-800 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-lg max-w-full truncate"
                          >
                            &ldquo;{lead.keyword}&rdquo;
                          </span>
                        ) : (
                          <span className="text-on-surface-muted text-xs italic">no message yet</span>
                        )}
                      </td>

                      {/* Campaign */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Megaphone size={11} className="text-violet-400 flex-shrink-0" />
                          <span
                            className="font-label text-xs font-semibold text-on-surface truncate max-w-[140px]"
                            title={lead.campaign_name}
                          >
                            {lead.campaign_name}
                          </span>
                        </div>
                      </td>

                      {/* Segment */}
                      <td className="px-5 py-3.5">
                        <SegmentBadge segment={lead.segment as "A" | "B" | "C" | "D"} />
                      </td>

                      {/* Score */}
                      <td className="px-5 py-3.5">
                        <ScoreBar score={lead.score} />
                      </td>

                      {/* Date joined */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <p className="font-body text-xs text-on-surface-muted">{formatDate(lead.created_at)}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div className="px-5 py-3 border-t border-surface-mid bg-surface-low/40 flex items-center justify-between">
              <p className="font-label text-xs text-on-surface-muted">
                Showing <strong className="text-on-surface">{leads.length}</strong> of{" "}
                <strong className="text-on-surface">{total}</strong> inbound leads
                {hasFilters && " (filtered)"}
              </p>
              <button
                onClick={handleExport}
                disabled={exporting || leads.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-100 font-label text-xs font-semibold hover:bg-violet-100 transition-colors disabled:opacity-40"
              >
                <Download size={11} />
                {exporting ? "Downloading…" : "Export CSV"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
