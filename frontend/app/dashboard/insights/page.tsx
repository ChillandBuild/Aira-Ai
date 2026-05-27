"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { ChevronDown, Download, Calendar, Info, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CostEntry = { conversations: number; cost_inr: number };
type CostMap = Record<string, CostEntry>;

type InsightsNumber = {
  meta_phone_number_id: string;
  display_name: string;
  number: string;
  quality_rating: string;
  messaging_tier: number;
  sent: number;
  delivered: number;
  read: number;
  received: number;
  cost_by_category: CostMap;
  free_by_type: CostMap;
  paid_by_category: CostMap;
  snapshots?: SnapshotRow[];
};

type SnapshotRow = {
  snapshot_date: string;
  sent: number;
  delivered: number;
  read: number;
  received: number;
  total_cost_inr: number;
  quality_rating: string;
};

type InsightsResponse = {
  numbers: InsightsNumber[];
  totals: {
    sent: number;
    delivered: number;
    read: number;
    received: number;
    cost_by_category: CostMap;
    free_by_type: CostMap;
    paid_by_category: CostMap;
  };
  range: { since: string; until: string };
};

type TrendDay = {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  received: number;
  cost_inr: number;
  quality_rating: string;
};

type TrendsResponse = {
  daily: TrendDay[];
  range: { since: string; until: string };
};

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utility",
  authentication: "Authentication",
  authentication_international: "Authentication – international",
  ai_provider: "AI provider",
  service: "Service",
  customer_service: "Free customer service",
  entry_point: "Free entry point",
};

const CATEGORY_COLORS: Record<string, string> = {
  marketing: "text-cyan-600",
  utility: "text-purple-600",
  authentication: "text-orange-600",
  authentication_international: "text-orange-400",
  ai_provider: "text-teal-600",
  service: "text-green-700",
  customer_service: "text-cyan-500",
  entry_point: "text-purple-500",
};

function formatINR(val: number): string {
  return `₹ ${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateRange(since: string, until: string): string {
  const s = new Date(since);
  const u = new Date(until);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${fmt(s)} – ${fmt(u)}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [range, setRange] = useState<"7d" | "30d" | "custom">("7d");
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>(["all"]);
  const [showNumberDropdown, setShowNumberDropdown] = useState(false);
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);
  const [customSince, setCustomSince] = useState("");
  const [customUntil, setCustomUntil] = useState("");
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [trendsRange, setTrendsRange] = useState<"7d" | "30d">("30d");
  const [trendsLoading, setTrendsLoading] = useState(false);

  const fetchInsights = useCallback(async (since?: string, until?: string) => {
    setLoading(true);
    try {
      const auth = await getAuthHeaders();
      const params = new URLSearchParams();
      if (since && until) {
        params.set("since", since);
        params.set("until", until);
      } else {
        params.set("range", range);
      }
      const res = await fetch(`${API_URL}/api/v1/insights/whatsapp?${params}`, { headers: auth });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.numbers.length > 0) {
          setSelectedNumbers(["all"]);
        }
      }
    } catch (e) {
      console.error("Failed to fetch insights:", e);
    } finally {
      setLoading(false);
    }
  }, [range]);

  const fetchTrends = useCallback(async (r: "7d" | "30d") => {
    setTrendsLoading(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/insights/trends?range=${r}`, { headers: auth });
      if (res.ok) {
        setTrends(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch trends:", e);
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
    fetchTrends(trendsRange);
  }, [fetchInsights, fetchTrends, trendsRange]);

  async function handleSync() {
    setSyncing(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/insights/sync`, {
        method: "POST",
        headers: auth,
      });
      if (res.ok) {
        const json = await res.json();
        setLastSynced(new Date().toISOString());
        toast.success(`Synced ${json.total} number(s)`);
        await fetchInsights();
        await fetchTrends(trendsRange);
      } else {
        toast.error("Sync failed");
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function handleRangeChange(r: "7d" | "30d" | "custom") {
    setRange(r);
    setShowRangeDropdown(false);
    if (r !== "custom") {
      fetchInsights();
    }
  }

  function handleCustomRange() {
    if (customSince && customUntil) {
      fetchInsights(customSince, customUntil);
    }
  }

  function toggleNumber(id: string) {
    setSelectedNumbers((prev) => {
      if (id === "all") return ["all"];
      const filtered = prev.filter((n) => n !== "all");
      if (filtered.includes(id)) {
        const next = filtered.filter((n) => n !== id);
        return next.length === 0 ? ["all"] : next;
      }
      return [...filtered, id];
    });
  }

  function selectAllNumbers() {
    setSelectedNumbers(["all"]);
  }

  const isAllSelected = selectedNumbers.includes("all");
  const displayNumbers = isAllSelected ? data?.numbers || [] : (data?.numbers || []).filter((n) => selectedNumbers.includes(n.meta_phone_number_id));

  const agg = {
    sent: 0,
    delivered: 0,
    read: 0,
    received: 0,
    cost_by_category: {} as CostMap,
    free_by_type: {} as CostMap,
    paid_by_category: {} as CostMap,
  };
  for (const n of displayNumbers) {
    agg.sent += n.sent;
    agg.delivered += n.delivered;
    agg.read += n.read;
    agg.received += n.received;
    for (const [k, v] of Object.entries(n.cost_by_category)) {
      agg.cost_by_category[k] = {
        conversations: (agg.cost_by_category[k]?.conversations || 0) + v.conversations,
        cost_inr: (agg.cost_by_category[k]?.cost_inr || 0) + v.cost_inr,
      };
    }
    for (const [k, v] of Object.entries(n.free_by_type)) {
      agg.free_by_type[k] = {
        conversations: (agg.free_by_type[k]?.conversations || 0) + v.conversations,
        cost_inr: (agg.free_by_type[k]?.cost_inr || 0) + v.cost_inr,
      };
    }
    for (const [k, v] of Object.entries(n.paid_by_category)) {
      agg.paid_by_category[k] = {
        conversations: (agg.paid_by_category[k]?.conversations || 0) + v.conversations,
        cost_inr: (agg.paid_by_category[k]?.cost_inr || 0) + v.cost_inr,
      };
    }
  }

  const totalCost = Object.values(agg.cost_by_category).reduce((s, v) => s + v.cost_inr, 0);
  const totalPaidConv = Object.values(agg.paid_by_category).reduce((s, v) => s + v.conversations, 0);

  const rangeLabel = range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "Custom range";

  const maxTrendCost = trends?.daily.reduce((max, d) => Math.max(max, d.cost_inr), 0) || 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-tertiary">WhatsApp Insights</h1>
        <p className="font-body text-on-surface-muted mt-1">Message pricing and delivery analytics from Meta</p>
      </div>

      <div className="bg-surface rounded-card p-4 shadow-card ring-1 ring-[#c4c7c7]/15 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setShowNumberDropdown(!showNumberDropdown)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-label text-xs text-on-surface hover:bg-surface-mid transition-colors"
            >
              {isAllSelected ? "All phone numbers" : `${displayNumbers.length} selected`}
              <ChevronDown size={12} />
            </button>
            {showNumberDropdown && (
              <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-surface rounded-xl shadow-card ring-1 ring-[#c4c7c7]/20 py-1">
                <button
                  onClick={() => { selectAllNumbers(); setShowNumberDropdown(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low transition-colors"
                >
                  <input type="checkbox" checked={isAllSelected} readOnly className="rounded" />
                  Select all
                </button>
                {data?.numbers.map((n) => (
                  <button
                    key={n.meta_phone_number_id}
                    onClick={() => toggleNumber(n.meta_phone_number_id)}
                    className="w-full flex items-center gap-2 px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low transition-colors"
                  >
                    <input type="checkbox" checked={selectedNumbers.includes(n.meta_phone_number_id) || isAllSelected} readOnly className="rounded" />
                    {n.number}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-label text-xs text-on-surface-muted">
            All countries
          </div>

          <div className="relative">
            <button
              onClick={() => setShowRangeDropdown(!showRangeDropdown)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-label text-xs text-on-surface hover:bg-surface-mid transition-colors"
            >
              <Calendar size={12} />
              {range === "custom" && customSince && customUntil
                ? formatDateRange(customSince, customUntil)
                : `${rangeLabel}: ${data ? formatDateRange(data.range.since, data.range.until) : ""}`}
              <ChevronDown size={12} />
            </button>
            {showRangeDropdown && (
              <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-surface rounded-xl shadow-card ring-1 ring-[#c4c7c7]/20 py-1">
                <button onClick={() => handleRangeChange("7d")} className="w-full px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low text-left transition-colors">
                  Last 7 days
                </button>
                <button onClick={() => handleRangeChange("30d")} className="w-full px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low text-left transition-colors">
                  Last 30 days
                </button>
                <div className="px-3 py-2 border-t border-surface-mid mt-1">
                  <p className="font-label text-[10px] text-on-surface-muted mb-1">Custom range</p>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={customSince}
                      onChange={(e) => setCustomSince(e.target.value)}
                      className="flex-1 px-2 py-1 rounded bg-surface-low border border-surface-mid font-label text-xs"
                    />
                    <input
                      type="date"
                      value={customUntil}
                      onChange={(e) => setCustomUntil(e.target.value)}
                      className="flex-1 px-2 py-1 rounded bg-surface-low border border-surface-mid font-label text-xs"
                    />
                  </div>
                  <button
                    onClick={() => { handleCustomRange(); setShowRangeDropdown(false); }}
                    disabled={!customSince || !customUntil}
                    className="mt-2 w-full px-2 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1" />

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-label text-xs text-on-surface hover:bg-surface-mid transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync from Meta"}
          </button>

          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-label text-xs text-on-surface hover:bg-surface-mid transition-colors">
            <Download size={12} />
            Export
            <ChevronDown size={12} />
          </button>
        </div>

        {lastSynced && (
          <p className="font-label text-[10px] text-on-surface-muted mt-2">Last synced: {timeAgo(lastSynced)}</p>
        )}
      </div>

      <p className="font-label text-[11px] text-on-surface-muted mb-4">
        Note: All insights data is approximate and may differ from what&apos;s shown on your invoices due to small variations in data processing.
      </p>

      {loading ? (
        <p className="font-body text-sm text-on-surface-muted">Loading insights…</p>
      ) : !data || data.numbers.length === 0 ? (
        <p className="font-body text-sm text-on-surface-muted">No phone numbers configured. Add a number in Settings to see insights.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
              <h3 className="font-label text-xs font-semibold text-purple-700 mb-3 flex items-center gap-1">
                <span className="w-4 h-0.5 bg-purple-600 rounded" />
                All messages
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-label text-xs text-on-surface-muted flex items-center gap-1">
                    Messages sent <Info size={11} className="text-on-surface-muted/50" />
                  </span>
                  <span className="font-label text-sm font-semibold text-on-surface">{agg.sent}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-label text-xs text-on-surface-muted flex items-center gap-1">
                    Messages delivered <Info size={11} className="text-on-surface-muted/50" />
                  </span>
                  <span className="font-label text-sm font-semibold text-on-surface">{agg.delivered}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-label text-xs text-on-surface-muted flex items-center gap-1">
                    Messages received <Info size={11} className="text-on-surface-muted/50" />
                  </span>
                  <span className="font-label text-sm font-semibold text-on-surface">{agg.received}</span>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
              <h3 className="font-label text-xs font-semibold text-green-700 mb-3 flex items-center gap-1">
                <span className="w-4 h-0.5 bg-green-600 rounded" />
                Messages delivered <Info size={11} className="text-on-surface-muted/50" />
                <span className="ml-auto text-on-surface">{agg.delivered}</span>
              </h3>
              <div className="space-y-1.5">
                {(["marketing", "utility", "authentication", "authentication_international", "ai_provider", "service"] as const).map((cat) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className={cn("font-label text-xs flex items-center gap-1.5", CATEGORY_COLORS[cat])}>
                      <span className="w-3 h-0.5 rounded opacity-60" style={{ backgroundColor: "currentColor" }} />
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className="font-label text-xs font-semibold text-on-surface">
                      {agg.cost_by_category[cat]?.conversations || 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
              <h3 className="font-label text-xs font-semibold text-purple-700 mb-3 flex items-center gap-1">
                <span className="w-4 h-0.5 bg-purple-600 rounded" />
                Free messages delivered <Info size={11} className="text-on-surface-muted/50" />
                <span className="ml-auto text-on-surface">
                  {(agg.free_by_type.customer_service?.conversations || 0) + (agg.free_by_type.entry_point?.conversations || 0)}
                </span>
              </h3>
              <div className="space-y-1.5">
                {(["customer_service", "entry_point"] as const).map((type) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className={cn("font-label text-xs flex items-center gap-1.5", CATEGORY_COLORS[type])}>
                      <span className="w-3 h-0.5 rounded opacity-60" style={{ backgroundColor: "currentColor" }} />
                      {CATEGORY_LABELS[type]} <Info size={10} className="text-on-surface-muted/50" />
                    </span>
                    <span className="font-label text-xs font-semibold text-on-surface">
                      {agg.free_by_type[type]?.conversations || 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
              <h3 className="font-label text-xs font-semibold text-purple-700 mb-3 flex items-center gap-1">
                <span className="w-4 h-0.5 bg-purple-600 rounded" />
                Paid messages delivered <Info size={11} className="text-on-surface-muted/50" />
                <span className="ml-auto text-on-surface">{totalPaidConv}</span>
              </h3>
              <div className="space-y-1.5">
                {(["marketing", "utility", "authentication", "authentication_international", "ai_provider"] as const).map((cat) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className={cn("font-label text-xs flex items-center gap-1.5", CATEGORY_COLORS[cat])}>
                      <span className="w-3 h-0.5 rounded opacity-60" style={{ backgroundColor: "currentColor" }} />
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className="font-label text-xs font-semibold text-on-surface">
                      {agg.paid_by_category[cat]?.conversations || 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
              <h3 className="font-label text-xs font-semibold text-purple-700 mb-3 flex items-center gap-1">
                <span className="w-4 h-0.5 bg-purple-600 rounded" />
                Approximate total charges <Info size={11} className="text-on-surface-muted/50" />
                <span className="ml-auto text-on-surface font-semibold">{formatINR(totalCost)}</span>
              </h3>
              <div className="space-y-1.5">
                {(["marketing", "utility", "authentication", "authentication_international", "ai_provider"] as const).map((cat) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className={cn("font-label text-xs flex items-center gap-1.5", CATEGORY_COLORS[cat])}>
                      <span className="w-3 h-0.5 rounded opacity-60" style={{ backgroundColor: "currentColor" }} />
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className="font-label text-xs font-semibold text-on-surface">
                      {formatINR(agg.paid_by_category[cat]?.cost_inr || 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trends section */}
          <div className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-mid">
              <h3 className="font-display text-base font-bold text-tertiary">Trends</h3>
              <div className="flex gap-1">
                {(["7d", "30d"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTrendsRange(r)}
                    className={cn(
                      "px-3 py-1 rounded-lg font-label text-xs font-semibold transition-colors",
                      trendsRange === r ? "bg-tertiary text-white" : "bg-surface-low text-on-surface-muted hover:bg-surface-mid"
                    )}
                  >
                    {r === "7d" ? "7D" : "30D"}
                  </button>
                ))}
              </div>
            </div>

            {trendsLoading ? (
              <p className="px-5 py-4 font-body text-sm text-on-surface-muted">Loading trends…</p>
            ) : !trends || trends.daily.length === 0 ? (
              <p className="px-5 py-4 font-body text-sm text-on-surface-muted">No trend data yet. Click &quot;Sync from Meta&quot; to fetch historical data.</p>
            ) : (
              <div className="p-5 space-y-4">
                {/* Cost bar chart */}
                <div>
                  <p className="font-label text-xs font-semibold text-on-surface-muted mb-2">Daily Cost (₹)</p>
                  <div className="space-y-1">
                    {trends.daily.slice().reverse().map((d) => {
                      const pct = maxTrendCost > 0 ? (d.cost_inr / maxTrendCost) * 100 : 0;
                      return (
                        <div key={d.date} className="flex items-center gap-3">
                          <span className="font-label text-[11px] text-on-surface-muted w-14 text-right">{formatDate(d.date)}</span>
                          <div className="flex-1 h-4 bg-surface-low rounded overflow-hidden">
                            <div
                              className="h-full rounded bg-purple-500 transition-all"
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                          <span className="font-label text-[11px] font-semibold text-on-surface w-20 text-right">{formatINR(d.cost_inr)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Trends table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-surface-mid">
                        {["Date", "Sent", "Delivered", "Cost (₹)", "Quality"].map((h) => (
                          <th key={h} className="pb-2 pr-4 font-label text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trends.daily.slice().reverse().map((d) => (
                        <tr key={d.date} className="border-b border-surface-mid/50">
                          <td className="py-2 pr-4 font-label text-xs text-on-surface">{formatDate(d.date)}</td>
                          <td className="py-2 pr-4 font-label text-xs text-on-surface">{d.sent}</td>
                          <td className="py-2 pr-4 font-label text-xs text-on-surface">{d.delivered}</td>
                          <td className="py-2 pr-4 font-label text-xs font-semibold text-on-surface">{formatINR(d.cost_inr)}</td>
                          <td className="py-2">
                            <span className={cn(
                              "font-label text-[10px] font-bold px-1.5 py-0.5 rounded",
                              d.quality_rating === "HIGH" ? "bg-green-100 text-green-700" :
                              d.quality_rating === "MEDIUM" ? "bg-amber-100 text-amber-700" :
                              "bg-red-100 text-red-700"
                            )}>
                              {d.quality_rating}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
