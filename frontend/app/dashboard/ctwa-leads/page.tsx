"use client";
import { useEffect, useState, useCallback } from "react";
import { api, CtwaLead } from "@/lib/api";
import {
  Download, MousePointerClick, Filter, X,
  Megaphone, Smartphone, MessageSquare, Users, RefreshCw, ChevronDown,
} from "lucide-react";
import { cn, formatPhone } from "@/lib/utils";
import { SegmentBadge } from "@/components/segment-badge";
import { toast } from "sonner";

// ─── Channel config ───────────────────────────────────────────────────────────
const CHANNEL_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  whatsapp: {
    label: "WhatsApp (CTWA)",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
  },
  instagram: {
    label: "Instagram DM Ad",
    color: "text-pink-700",
    bg: "bg-pink-50 border-pink-200",
    dot: "bg-pink-500",
  },
  facebook: {
    label: "Facebook Messenger Ad",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    dot: "bg-blue-500",
  },
};

const SOURCE_OPTIONS = [
  { value: "", label: "All Channels" },
  { value: "whatsapp", label: "WhatsApp (CTWA)" },
  { value: "instagram", label: "Instagram DM" },
  { value: "facebook", label: "Facebook Messenger" },
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
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border", cfg.bg, cfg.color)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(Math.max(score, 1), 10) * 10;
  const color = score >= 8 ? "bg-emerald-500" : score >= 6 ? "bg-amber-500" : "bg-zinc-300";
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-500 font-semibold">{score}</span>
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, color,
}: { label: string; value: string | number; icon: typeof Users; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", color)}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900 font-display leading-none">{value}</p>
        <p className="text-xs text-zinc-500 font-medium mt-0.5 font-label">{label}</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
        <MousePointerClick size={28} className="text-violet-400" />
      </div>
      <h3 className="font-display text-lg font-bold text-zinc-700 mb-1">No Ad Leads Yet</h3>
      <p className="text-sm text-zinc-400 max-w-xs font-body">
        When users click your Meta Ad CTA buttons (WhatsApp, Instagram DM, or Facebook Messenger),
        they&apos;ll appear here with their first message keyword.
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CTWALeadsPage() {
  const [leads, setLeads] = useState<CtwaLead[]>([]);
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

  // Derived stats
  const uniqueKeywords = new Set(leads.filter((l) => l.keyword !== "—").map((l) => l.keyword.toLowerCase().trim())).size;
  const uniqueCampaignsInResults = new Set(leads.map((l) => l.campaign_name)).size;
  const hasFilters = !!(selectedCampaign || selectedSource || dateFrom || dateTo);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.ctwaLeads.list({
        ad_campaign_id: selectedCampaign || undefined,
        source: selectedSource || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 200,
      });
      setLeads(res.data || []);
      setTotal(res.total || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load CTWA leads");
    } finally {
      setLoading(false);
    }
  }, [selectedCampaign, selectedSource, dateFrom, dateTo]);

  useEffect(() => {
    api.ctwaLeads.campaigns().then(setCampaigns).catch(() => {});
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  async function handleExport() {
    setExporting(true);
    try {
      await api.ctwaLeads.exportCsv({
        ad_campaign_id: selectedCampaign || undefined,
        source: selectedSource || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      toast.success("CSV downloaded — ctwa_leads_ad_traffic.csv");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setSelectedCampaign("");
    setSelectedSource("");
    setDateFrom("");
    setDateTo("");
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return iso;
    }
  }

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-7 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
              <MousePointerClick size={16} className="text-violet-600" />
            </div>
            <h1 className="font-display text-2xl font-bold text-zinc-900">Click-to-Ad Leads</h1>
          </div>
          <p className="font-body text-sm text-zinc-500 ml-10.5">
            Inbound leads from Meta Ad clicks — WhatsApp, Instagram DM & Facebook Messenger.
            Segregated from organic messages by Ad attribution.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowFilters((p) => !p)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl font-label text-sm font-semibold border transition-all",
              showFilters || hasFilters
                ? "bg-violet-50 border-violet-200 text-violet-700"
                : "bg-white border-zinc-200 text-zinc-700 hover:border-violet-300 hover:text-violet-700"
            )}
          >
            <Filter size={15} />
            Filters
            {hasFilters && (
              <span className="w-4 h-4 rounded-full bg-violet-600 text-white text-[9px] font-bold flex items-center justify-center">
                {[selectedCampaign, selectedSource, dateFrom, dateTo].filter(Boolean).length}
              </span>
            )}
          </button>
          <button
            onClick={fetchLeads}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-zinc-200 text-zinc-600 font-label text-sm font-semibold hover:border-zinc-300 transition-all disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || leads.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 text-white font-label text-sm font-semibold hover:bg-violet-700 transition-all disabled:opacity-40 shadow-sm shadow-violet-200"
          >
            <Download size={15} />
            {exporting ? "Downloading…" : "Download CSV"}
          </button>
        </div>
      </div>

      {/* ── Filter Panel ─────────────────────────────────────────── */}
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        showFilters ? "max-h-48 opacity-100 mb-6" : "max-h-0 opacity-0 mb-0"
      )}>
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="font-label text-sm font-bold text-zinc-700 flex items-center gap-2">
              <Filter size={14} /> Filters
            </p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-500 font-label font-semibold transition-colors"
              >
                <X size={12} /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Campaign filter */}
            <div className="relative">
              <label className="block font-label text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Ad Campaign
              </label>
              <div className="relative">
                <select
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                  className="w-full appearance-none px-3 py-2 pr-8 bg-zinc-50 border border-zinc-200 rounded-xl font-body text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 cursor-pointer"
                >
                  <option value="">All Campaigns</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.campaign_name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Source filter */}
            <div>
              <label className="block font-label text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Channel
              </label>
              <div className="relative">
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="w-full appearance-none px-3 py-2 pr-8 bg-zinc-50 border border-zinc-200 rounded-xl font-body text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 cursor-pointer"
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Date from */}
            <div>
              <label className="block font-label text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl font-body text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300"
              />
            </div>

            {/* Date to */}
            <div>
              <label className="block font-label text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl font-body text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats Row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Ad Leads" value={total} icon={MousePointerClick} color="bg-violet-500" />
        <StatCard label="Showing Now" value={leads.length} icon={Users} color="bg-blue-500" />
        <StatCard label="Unique Keywords" value={uniqueKeywords} icon={MessageSquare} color="bg-amber-500" />
        <StatCard label="Campaigns" value={uniqueCampaignsInResults} icon={Megaphone} color="bg-emerald-500" />
      </div>

      {/* ── Segregation Notice ────────────────────────────────────── */}
      <div className="flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3 mb-6">
        <Smartphone size={15} className="text-violet-500 mt-0.5 flex-shrink-0" />
        <p className="font-body text-xs text-violet-700 leading-relaxed">
          <strong>Segregation rule:</strong> These are leads where{" "}
          <code className="bg-violet-100 px-1 rounded text-[10px] font-mono">ad_campaign_id IS NOT NULL</code> — meaning
          they clicked a Meta Ad CTA button (WhatsApp, Instagram DM, or Facebook Messenger). Organic inbound messages
          (direct WhatsApp saves, DMs without ad attribution) are <em>excluded</em> from this view.
        </p>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-zinc-400">
            <RefreshCw size={18} className="animate-spin" />
            <span className="font-body text-sm">Loading ad leads…</span>
          </div>
        ) : leads.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/60">
                  <th className="px-5 py-3.5 text-left font-label text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Contact
                  </th>
                  <th className="px-5 py-3.5 text-left font-label text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Channel
                  </th>
                  <th className="px-5 py-3.5 text-left font-label text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Keyword (First Message)
                  </th>
                  <th className="px-5 py-3.5 text-left font-label text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Ad Campaign
                  </th>
                  <th className="px-5 py-3.5 text-left font-label text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Segment
                  </th>
                  <th className="px-5 py-3.5 text-left font-label text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Score
                  </th>
                  <th className="px-5 py-3.5 text-left font-label text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Date & Time Joined
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {leads.map((lead, i) => (
                  <tr
                    key={lead.id}
                    className={cn(
                      "hover:bg-zinc-50/80 transition-colors group",
                      i % 2 === 1 ? "bg-zinc-50/30" : ""
                    )}
                  >
                    {/* Contact */}
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="font-label text-sm font-semibold text-zinc-800">
                          {lead.name !== "—" ? lead.name : (
                            <span className="text-zinc-400 italic font-normal text-xs">No name</span>
                          )}
                        </p>
                        <p className="font-body text-xs text-zinc-400 mt-0.5">
                          {lead.phone !== "—" ? formatPhone(lead.phone) : "—"}
                        </p>
                      </div>
                    </td>

                    {/* Channel */}
                    <td className="px-5 py-3.5">
                      <ChannelBadge source={lead.source} />
                    </td>

                    {/* Keyword */}
                    <td className="px-5 py-3.5 max-w-[200px]">
                      {lead.keyword !== "—" ? (
                        <span
                          className="inline-block font-body text-xs text-zinc-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-lg max-w-full truncate"
                          title={lead.keyword}
                        >
                          &ldquo;{lead.keyword}&rdquo;
                        </span>
                      ) : (
                        <span className="text-zinc-300 text-xs font-body italic">no message yet</span>
                      )}
                    </td>

                    {/* Campaign */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Megaphone size={11} className="text-violet-400 flex-shrink-0" />
                        <span
                          className="font-label text-xs font-semibold text-zinc-600 truncate max-w-[140px]"
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
                      <p className="font-body text-xs text-zinc-500">{formatDate(lead.created_at)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
              <p className="font-label text-xs text-zinc-400">
                Showing <strong className="text-zinc-600">{leads.length}</strong> of{" "}
                <strong className="text-zinc-600">{total}</strong> ad leads
                {hasFilters && " (filtered)"}
              </p>
              <button
                onClick={handleExport}
                disabled={exporting || leads.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-100 font-label text-xs font-semibold hover:bg-violet-100 transition-colors disabled:opacity-40"
              >
                <Download size={12} />
                {exporting ? "Downloading…" : "Export visible rows"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
