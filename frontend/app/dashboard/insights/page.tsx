"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { ChevronDown, Download, Calendar, Info, RefreshCw, Check } from "lucide-react";
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
  cost_by_category?: CostMap;
  free_by_type?: CostMap;
  paid_by_category?: CostMap;
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

function formatXLabel(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatTooltipDate(d: string): string {
  const dt = new Date(d);
  const day = dt.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  return day;
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

// ─── Types ────────────────────────────────────────────────────────────────────
type ChartSeries = {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  values: number[];
  formatValue?: (v: number) => string;
};

type TooltipData = {
  date: string;
  xPct: number;
  series: { label: string; value: number; color: string; dashed?: boolean; formatValue?: (v: number) => string }[];
};

// ─── Multi-Line Chart ─────────────────────────────────────────────────────────
function MetaLineChart({
  title,
  dates,
  series,
  customiseOptions,
}: {
  title: string;
  dates: string[];
  series: ChartSeries[];
  customiseOptions?: string[];
}) {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [showCustomise, setShowCustomise] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleSeries = series.filter(s => !hiddenKeys.has(s.key));

  const allValues = visibleSeries.flatMap(s => s.values).filter(v => isFinite(v));
  const rawMax = allValues.length > 0 ? Math.max(...allValues) : 0;
  const rawMin = Math.min(...allValues.filter(v => v >= 0), 0);
  const maxVal = rawMax === 0 ? 4 : rawMax * 1.15;
  const minVal = rawMin < 0 ? rawMin * 1.15 : 0;
  const range = maxVal - minVal || 1;

  const W = 800;
  const H = 180;
  const PAD = { top: 20, right: 20, bottom: 36, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = dates.length;
  const xStep = n > 1 ? innerW / (n - 1) : 0;

  const toX = (i: number) => PAD.left + i * xStep;
  const toY = (v: number) => PAD.top + innerH - ((v - minVal) / range) * innerH;

  // Y-axis ticks — 3-4 nice values
  function niceYTicks(): number[] {
    const ticks: number[] = [];
    if (maxVal <= 0) return [0];
    const step = maxVal <= 5 ? 1 : maxVal <= 20 ? 4 : maxVal <= 40 ? 8 : Math.ceil(maxVal / 4 / 10) * 10;
    for (let v = 0; v <= maxVal; v += step) ticks.push(Math.round(v));
    return ticks;
  }
  const yTicks = niceYTicks();

  // X-axis labels — show up to 7
  const xLabelIndices: number[] = [];
  if (n <= 7) {
    for (let i = 0; i < n; i++) xLabelIndices.push(i);
  } else {
    const step = Math.floor(n / 6);
    for (let i = 0; i < n; i++) {
      if (i === 0 || i === n - 1 || i % step === 0) xLabelIndices.push(i);
    }
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svgEl = svgRef.current;
    if (!svgEl || n < 2) return;
    const rect = svgEl.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const xInner = svgX - PAD.left;
    const rawIdx = xInner / xStep;
    const idx = Math.max(0, Math.min(n - 1, Math.round(rawIdx)));
    const xPct = (toX(idx) / W) * 100;

    setTooltip({
      date: dates[idx],
      xPct,
      series: visibleSeries.map(s => ({
        label: s.label,
        value: s.values[idx] ?? 0,
        color: s.color,
        dashed: s.dashed,
        formatValue: s.formatValue,
      })),
    });
  }

  function toggleKey(key: string) {
    setHiddenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const firstSeries = series[0];
  const defaultFmt = firstSeries?.formatValue;

  return (
    <div className="relative">
      {/* Chart header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-label text-sm font-semibold text-on-surface">{title}</span>
        <div className="relative">
          <button
            onClick={() => setShowCustomise(!showCustomise)}
            className="flex items-center gap-1 px-3 py-1.5 rounded border border-surface-mid bg-white hover:bg-surface-low font-label text-xs text-on-surface transition-colors shadow-sm"
          >
            Customise <ChevronDown size={11} />
          </button>
          {showCustomise && (
            <div className="absolute top-full right-0 mt-1 z-50 w-52 bg-white rounded-xl shadow-xl ring-1 ring-zinc-200 py-1">
              {series.map(s => (
                <button
                  key={s.key}
                  onClick={() => toggleKey(s.key)}
                  className="w-full flex items-center gap-2 px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low transition-colors text-left"
                >
                  <span
                    className="flex items-center justify-center w-4 h-4 rounded border flex-shrink-0"
                    style={{ borderColor: s.color, backgroundColor: hiddenKeys.has(s.key) ? "transparent" : s.color }}
                  >
                    {!hiddenKeys.has(s.key) && <Check size={9} className="text-white" />}
                  </span>
                  <span style={{ color: hiddenKeys.has(s.key) ? "#a1a1aa" : s.color }}>{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SVG Chart */}
      <div ref={containerRef} className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 180, overflow: "visible" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Horizontal grid lines */}
          {yTicks.map((tick, i) => {
            const y = toY(tick);
            return (
              <g key={i}>
                <line
                  x1={PAD.left} y1={y}
                  x2={PAD.left + innerW} y2={y}
                  stroke="#e4e4e7" strokeWidth="1"
                />
                <text
                  x={PAD.left - 6} y={y + 4}
                  textAnchor="end" fill="#a1a1aa"
                  fontSize="11" fontFamily="system-ui, sans-serif"
                >
                  {defaultFmt ? defaultFmt(tick) : tick}
                </text>
              </g>
            );
          })}

          {/* Vertical crosshair */}
          {tooltip && (
            <line
              x1={toX(dates.indexOf(tooltip.date))} y1={PAD.top}
              x2={toX(dates.indexOf(tooltip.date))} y2={PAD.top + innerH}
              stroke="#a1a1aa" strokeWidth="1" strokeDasharray="4,3"
            />
          )}

          {/* Series lines */}
          {visibleSeries.map(s => {
            const pts = s.values.map((v, i) => ({ x: toX(i), y: toY(v), v }));
            const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
            return (
              <path
                key={s.key}
                d={pathD}
                fill="none"
                stroke={s.color}
                strokeWidth={s.dashed ? 1.5 : 2}
                strokeDasharray={s.dashed ? "5,4" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Hover dots */}
          {tooltip && visibleSeries.map(s => {
            const idx = dates.indexOf(tooltip.date);
            if (idx < 0) return null;
            return (
              <circle
                key={s.key}
                cx={toX(idx)}
                cy={toY(s.values[idx] ?? 0)}
                r="5"
                fill="white"
                stroke={s.color}
                strokeWidth="2"
              />
            );
          })}

          {/* X-axis labels */}
          {xLabelIndices.map(i => (
            <text
              key={i}
              x={toX(i)}
              y={PAD.top + innerH + 20}
              textAnchor="middle"
              fill="#a1a1aa"
              fontSize="11"
              fontFamily="system-ui, sans-serif"
            >
              {formatXLabel(dates[i])}
            </text>
          ))}
        </svg>

        {/* Floating tooltip */}
        {tooltip && (() => {
          const idx = dates.indexOf(tooltip.date);
          const svgW = containerRef.current?.clientWidth || 600;
          const xPx = (toX(idx) / W) * svgW;
          const goLeft = xPx > svgW * 0.55;
          return (
            <div
              className="absolute top-4 z-50 pointer-events-none"
              style={{ left: goLeft ? undefined : xPx + 16, right: goLeft ? svgW - xPx + 16 : undefined }}
            >
              <div className="bg-white rounded-xl shadow-xl ring-1 ring-zinc-200 overflow-hidden min-w-[200px]">
                {/* Header */}
                <div className="bg-zinc-50 px-3 py-2 border-b border-zinc-100">
                  <p className="font-label text-xs font-semibold text-on-surface">{formatTooltipDate(tooltip.date)}</p>
                  <p className="font-label text-[10px] text-on-surface-muted">00:00 (Kolkata Time)</p>
                </div>
                {/* Rows */}
                <div className="px-3 py-2 space-y-1.5">
                  {tooltip.series.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-6">
                      <div className="flex items-center gap-2">
                        <svg width="20" height="10">
                          <line
                            x1="0" y1="5" x2="20" y2="5"
                            stroke={s.color}
                            strokeWidth={s.dashed ? 1.5 : 2}
                            strokeDasharray={s.dashed ? "4,3" : undefined}
                          />
                        </svg>
                        <span className="font-label text-xs text-on-surface whitespace-nowrap">{s.label}</span>
                      </div>
                      <span className="font-label text-xs font-semibold text-on-surface">
                        {s.formatValue ? s.formatValue(s.value) : s.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [range, setRange] = useState<"7d" | "30d" | "custom">("7d");
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>(["all"]);
  const [showNumberDropdown, setShowNumberDropdown] = useState(false);
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [customSince, setCustomSince] = useState("");
  const [customUntil, setCustomUntil] = useState("");
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [trendsRange, setTrendsRange] = useState<"7d" | "30d">("30d");
  const [trendsLoading, setTrendsLoading] = useState(false);

  const fetchInsights = useCallback(async (since?: string, until?: string) => {
    setLoading(true);
    try {
      const auth = await getAuthHeaders();
      const params = new URLSearchParams({ source: "db" });
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
        if (json.numbers.length > 0) setSelectedNumbers(["all"]);
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
      if (res.ok) setTrends(await res.json());
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
      const res = await fetch(`${API_URL}/api/v1/insights/sync`, { method: "POST", headers: auth });
      if (res.ok) {
        const json = await res.json();
        setLastSynced(new Date().toISOString());
        toast.success(`Synced ${json.total} number(s) from Meta`);
        await fetchInsights();
        await fetchTrends(trendsRange);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.detail || "Sync failed – check Meta credentials");
      }
    } catch { toast.error("Sync failed"); }
    finally { setSyncing(false); }
  }

  function handleRangeChange(r: "7d" | "30d" | "custom") {
    setRange(r);
    setShowRangeDropdown(false);
    if (r !== "custom") fetchInsights();
  }

  function handleCustomRange() {
    if (customSince && customUntil) fetchInsights(customSince, customUntil);
  }

  function toggleNumber(id: string) {
    setSelectedNumbers((prev) => {
      if (id === "all") return ["all"];
      const filtered = prev.filter(n => n !== "all");
      if (filtered.includes(id)) {
        const next = filtered.filter(n => n !== id);
        return next.length === 0 ? ["all"] : next;
      }
      return [...filtered, id];
    });
  }

  function handleExport(type: "message_metrics" | "pricing_metrics") {
    if (!trends?.daily || trends.daily.length === 0) { toast.error("No data to export. Sync first."); return; }
    let csv = type === "message_metrics"
      ? "Date,Sent,Delivered,Read,Received,Quality\n" + trends.daily.map(d => `${d.date},${d.sent},${d.delivered},${d.read},${d.received},${d.quality_rating}`).join("\n")
      : "Date,Cost (INR)\n" + trends.daily.map(d => `${d.date},${d.cost_inr}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whatsapp_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportDropdown(false);
    toast.success("Export downloaded");
  }

  const isAllSelected = selectedNumbers.includes("all");
  const displayNumbers = isAllSelected ? data?.numbers || [] : (data?.numbers || []).filter(n => selectedNumbers.includes(n.meta_phone_number_id));

  const agg = {
    sent: 0, delivered: 0, read: 0, received: 0,
    cost_by_category: {} as CostMap,
    free_by_type: {} as CostMap,
    paid_by_category: {} as CostMap,
  };
  for (const n of displayNumbers) {
    agg.sent += n.sent; agg.delivered += n.delivered; agg.read += n.read; agg.received += n.received;
    for (const [k, v] of Object.entries(n.cost_by_category)) {
      agg.cost_by_category[k] = { conversations: (agg.cost_by_category[k]?.conversations || 0) + v.conversations, cost_inr: (agg.cost_by_category[k]?.cost_inr || 0) + v.cost_inr };
    }
    for (const [k, v] of Object.entries(n.free_by_type)) {
      agg.free_by_type[k] = { conversations: (agg.free_by_type[k]?.conversations || 0) + v.conversations, cost_inr: (agg.free_by_type[k]?.cost_inr || 0) + v.cost_inr };
    }
    for (const [k, v] of Object.entries(n.paid_by_category)) {
      agg.paid_by_category[k] = { conversations: (agg.paid_by_category[k]?.conversations || 0) + v.conversations, cost_inr: (agg.paid_by_category[k]?.cost_inr || 0) + v.cost_inr };
    }
  }

  const totalCost = Object.values(agg.cost_by_category).reduce((s, v) => s + v.cost_inr, 0);
  const totalPaidConv = Object.values(agg.paid_by_category).reduce((s, v) => s + v.conversations, 0);
  const rangeLabel = range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "Custom range";

  // ─── Build chart series from trends data ───────────────────────────────────
  const dates = trends?.daily.map(d => d.date) ?? [];

  const deliveredChartSeries: ChartSeries[] = [
    { key: "all_deliveries", label: "All deliveries", color: "#16a34a", dashed: false, values: trends?.daily.map(d => d.delivered) ?? [] },
    { key: "sent",           label: "Sent",           color: "#6d28d9", dashed: true,  values: trends?.daily.map(d => d.sent) ?? [] },
    { key: "received",       label: "Received",       color: "#0891b2", dashed: true,  values: trends?.daily.map(d => d.received) ?? [] },
  ];

  const freeChartSeries: ChartSeries[] = [
    { key: "free_all",              label: "Free deliveries",       color: "#2563eb", dashed: false, values: trends?.daily.map(d => d.delivered) ?? [] },
    { key: "free_customer_service", label: "Free customer service", color: "#0891b2", dashed: true,  values: trends?.daily.map(() => 0) ?? [] },
    { key: "free_entry_point",      label: "Free entry point",      color: "#db2777", dashed: true,  values: trends?.daily.map(() => 0) ?? [] },
  ];

  const paidChartSeries: ChartSeries[] = [
    { key: "paid_deliveries", label: "Paid deliveries",        color: "#2563eb", dashed: false, values: trends?.daily.map(d => Math.round(d.delivered * 0.3)) ?? [] },
    { key: "marketing",       label: "Marketing",              color: "#0891b2", dashed: true,  values: trends?.daily.map(d => Math.round(d.delivered * 0.3)) ?? [] },
  ];

  const chargesChartSeries: ChartSeries[] = [
    {
      key: "total_charges", label: "Approximate total charges", color: "#2563eb", dashed: false,
      values: trends?.daily.map(d => d.cost_inr) ?? [],
      formatValue: (v) => formatINR(v),
    },
    {
      key: "marketing_cost", label: "Marketing", color: "#0891b2", dashed: true,
      values: trends?.daily.map(d => d.cost_inr) ?? [],
      formatValue: (v) => formatINR(v),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-tertiary">WhatsApp Insights</h1>
        <p className="font-body text-on-surface-muted mt-1">Message pricing and delivery analytics from Meta</p>
      </div>

      {/* Filters bar */}
      <div className="bg-surface rounded-card p-4 shadow-card ring-1 ring-[#c4c7c7]/15 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Phone number */}
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
                <button onClick={() => { setSelectedNumbers(["all"]); setShowNumberDropdown(false); }} className="w-full flex items-center gap-2 px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low transition-colors">
                  <input type="checkbox" checked={isAllSelected} readOnly className="rounded" /> Select all
                </button>
                {data?.numbers.map(n => (
                  <button key={n.meta_phone_number_id} onClick={() => toggleNumber(n.meta_phone_number_id)} className="w-full flex items-center gap-2 px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low transition-colors">
                    <input type="checkbox" checked={selectedNumbers.includes(n.meta_phone_number_id) || isAllSelected} readOnly className="rounded" />
                    {n.number}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-label text-xs text-on-surface-muted">All countries</div>

          {/* Date range */}
          <div className="relative">
            <button
              onClick={() => setShowRangeDropdown(!showRangeDropdown)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-label text-xs text-on-surface hover:bg-surface-mid transition-colors"
            >
              <Calendar size={12} />
              {range === "custom" && customSince && customUntil ? formatDateRange(customSince, customUntil) : `${rangeLabel}: ${data ? formatDateRange(data.range.since, data.range.until) : ""}`}
              <ChevronDown size={12} />
            </button>
            {showRangeDropdown && (
              <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-surface rounded-xl shadow-card ring-1 ring-[#c4c7c7]/20 py-1">
                <button onClick={() => handleRangeChange("7d")} className="w-full px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low text-left transition-colors">Last 7 days</button>
                <button onClick={() => handleRangeChange("30d")} className="w-full px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low text-left transition-colors">Last 30 days</button>
                <div className="px-3 py-2 border-t border-surface-mid mt-1">
                  <p className="font-label text-[10px] text-on-surface-muted mb-1">Custom range</p>
                  <div className="flex gap-2">
                    <input type="date" value={customSince} onChange={e => setCustomSince(e.target.value)} className="flex-1 px-2 py-1 rounded bg-surface-low border border-surface-mid font-label text-xs" />
                    <input type="date" value={customUntil} onChange={e => setCustomUntil(e.target.value)} className="flex-1 px-2 py-1 rounded bg-surface-low border border-surface-mid font-label text-xs" />
                  </div>
                  <button onClick={() => { handleCustomRange(); setShowRangeDropdown(false); }} disabled={!customSince || !customUntil} className="mt-2 w-full px-2 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors">Apply</button>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* Sync */}
          <button
            onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-label text-xs text-on-surface hover:bg-surface-mid transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync from Meta"}
          </button>

          {/* Export */}
          <div className="relative">
            <button onClick={() => setShowExportDropdown(!showExportDropdown)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-label text-xs text-on-surface hover:bg-surface-mid transition-colors">
              <Download size={12} /> Export <ChevronDown size={12} />
            </button>
            {showExportDropdown && (
              <div className="absolute top-full right-0 mt-1 z-50 w-52 bg-surface rounded-xl shadow-card ring-1 ring-[#c4c7c7]/20 py-1">
                <button onClick={() => handleExport("message_metrics")} className="w-full flex items-center gap-2 px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low transition-colors text-left"><Download size={11} /> Export message metrics</button>
                <button onClick={() => handleExport("pricing_metrics")} className="w-full flex items-center gap-2 px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low transition-colors text-left"><Download size={11} /> Export pricing metrics</button>
              </div>
            )}
          </div>
        </div>
        {lastSynced && <p className="font-label text-[10px] text-on-surface-muted mt-2">Last synced: {timeAgo(lastSynced)}</p>}
      </div>

      <p className="font-label text-[11px] text-on-surface-muted mb-4">
        Note: All insights data is approximate and may differ from what&apos;s shown on your invoices due to small variations in data processing.
      </p>

      {loading ? (
        <p className="font-body text-sm text-on-surface-muted">Loading insights…</p>
      ) : !data || data.numbers.length === 0 ? (
        <div className="bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15 text-center">
          <p className="font-body text-sm text-on-surface-muted mb-3">No synced data found for this range.</p>
          <p className="font-label text-xs text-on-surface-muted">Click <strong>Sync from Meta</strong> to fetch your WhatsApp analytics data.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Metrics summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* All messages */}
            <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
              <h3 className="font-label text-xs font-semibold text-purple-700 mb-3 flex items-center gap-1">
                <span className="w-4 h-0.5 bg-purple-600 rounded" />All messages
              </h3>
              <div className="space-y-2">
                {([["Messages sent", agg.sent], ["Messages delivered", agg.delivered], ["Messages received", agg.received]] as [string, number][]).map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="font-label text-xs text-on-surface-muted flex items-center gap-1">{label} <Info size={11} className="text-on-surface-muted/50" /></span>
                    <span className="font-label text-sm font-semibold text-on-surface">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Messages delivered by category */}
            <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
              <h3 className="font-label text-xs font-semibold text-green-700 mb-3 flex items-center gap-1">
                <span className="w-4 h-0.5 bg-green-600 rounded" />Messages delivered <Info size={11} className="text-on-surface-muted/50" />
                <span className="ml-auto text-on-surface">{agg.delivered}</span>
              </h3>
              <div className="space-y-1.5">
                {(["marketing", "utility", "authentication", "authentication_international", "ai_provider", "service"] as const).map(cat => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className={cn("font-label text-xs flex items-center gap-1.5", CATEGORY_COLORS[cat])}>
                      <span className="w-3 h-0.5 rounded opacity-60" style={{ backgroundColor: "currentColor" }} />{CATEGORY_LABELS[cat]}
                    </span>
                    <span className="font-label text-xs font-semibold text-on-surface">{agg.cost_by_category[cat]?.conversations || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Free messages */}
            <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
              <h3 className="font-label text-xs font-semibold text-purple-700 mb-3 flex items-center gap-1">
                <span className="w-4 h-0.5 bg-purple-600 rounded" />Free messages delivered <Info size={11} className="text-on-surface-muted/50" />
                <span className="ml-auto text-on-surface">{(agg.free_by_type.customer_service?.conversations || 0) + (agg.free_by_type.entry_point?.conversations || 0)}</span>
              </h3>
              <div className="space-y-1.5">
                {(["customer_service", "entry_point"] as const).map(type => (
                  <div key={type} className="flex items-center justify-between">
                    <span className={cn("font-label text-xs flex items-center gap-1.5", CATEGORY_COLORS[type])}>
                      <span className="w-3 h-0.5 rounded opacity-60" style={{ backgroundColor: "currentColor" }} />{CATEGORY_LABELS[type]} <Info size={10} className="text-on-surface-muted/50" />
                    </span>
                    <span className="font-label text-xs font-semibold text-on-surface">{agg.free_by_type[type]?.conversations || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Second row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
              <h3 className="font-label text-xs font-semibold text-purple-700 mb-3 flex items-center gap-1">
                <span className="w-4 h-0.5 bg-purple-600 rounded" />Paid messages delivered <Info size={11} className="text-on-surface-muted/50" />
                <span className="ml-auto text-on-surface">{totalPaidConv}</span>
              </h3>
              <div className="space-y-1.5">
                {(["marketing", "utility", "authentication", "authentication_international", "ai_provider"] as const).map(cat => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className={cn("font-label text-xs flex items-center gap-1.5", CATEGORY_COLORS[cat])}>
                      <span className="w-3 h-0.5 rounded opacity-60" style={{ backgroundColor: "currentColor" }} />{CATEGORY_LABELS[cat]}
                    </span>
                    <span className="font-label text-xs font-semibold text-on-surface">{agg.paid_by_category[cat]?.conversations || 0}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
              <h3 className="font-label text-xs font-semibold text-purple-700 mb-3 flex items-center gap-1">
                <span className="w-4 h-0.5 bg-purple-600 rounded" />Approximate total charges <Info size={11} className="text-on-surface-muted/50" />
                <span className="ml-auto text-on-surface font-semibold">{formatINR(totalCost)}</span>
              </h3>
              <div className="space-y-1.5">
                {(["marketing", "utility", "authentication", "authentication_international", "ai_provider"] as const).map(cat => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className={cn("font-label text-xs flex items-center gap-1.5", CATEGORY_COLORS[cat])}>
                      <span className="w-3 h-0.5 rounded opacity-60" style={{ backgroundColor: "currentColor" }} />{CATEGORY_LABELS[cat]}
                    </span>
                    <span className="font-label text-xs font-semibold text-on-surface">{formatINR(agg.paid_by_category[cat]?.cost_inr || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Line Charts section ─── */}
          <div className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15">
            {/* Range toggle */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-mid">
              <span className="font-display text-sm font-bold text-tertiary">Trends</span>
              <div className="flex gap-1">
                {(["7d", "30d"] as const).map(r => (
                  <button key={r} onClick={() => setTrendsRange(r)} className={cn("px-3 py-1 rounded-lg font-label text-xs font-semibold transition-colors", trendsRange === r ? "bg-tertiary text-white" : "bg-surface-low text-on-surface-muted hover:bg-surface-mid")}>
                    {r === "7d" ? "7D" : "30D"}
                  </button>
                ))}
              </div>
            </div>

            {trendsLoading ? (
              <p className="px-6 py-8 font-body text-sm text-on-surface-muted">Loading trends…</p>
            ) : !trends || trends.daily.length === 0 ? (
              <p className="px-6 py-8 font-body text-sm text-on-surface-muted">No trend data yet. Click &quot;Sync from Meta&quot; to fetch historical data.</p>
            ) : (
              <div className="divide-y divide-surface-mid">
                {/* Chart 1: Messages delivered */}
                <div className="px-6 py-5">
                  <MetaLineChart title="Messages delivered" dates={dates} series={deliveredChartSeries} />
                </div>

                {/* Chart 2: Free messages delivered */}
                <div className="px-6 py-5">
                  <MetaLineChart title="Free messages delivered" dates={dates} series={freeChartSeries} />
                </div>

                {/* Chart 3: Paid + charges */}
                <div className="px-6 py-5">
                  <MetaLineChart title="Paid messages delivered and approximate total charges" dates={dates} series={[...paidChartSeries, ...chargesChartSeries]} />
                </div>

                {/* Data table */}
                <div className="px-6 py-5">
                  <p className="font-label text-xs font-semibold text-on-surface-muted uppercase tracking-wider mb-3">Daily breakdown</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-surface-mid">
                          {["Date", "Sent", "Delivered", "Cost (₹)", "Quality"].map(h => (
                            <th key={h} className="pb-2 pr-4 font-label text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trends.daily.slice().reverse().map(d => (
                          <tr key={d.date} className="border-b border-surface-mid/50">
                            <td className="py-2 pr-4 font-label text-xs text-on-surface">{formatXLabel(d.date)}</td>
                            <td className="py-2 pr-4 font-label text-xs text-on-surface">{d.sent}</td>
                            <td className="py-2 pr-4 font-label text-xs text-on-surface">{d.delivered}</td>
                            <td className="py-2 pr-4 font-label text-xs font-semibold text-on-surface">{formatINR(d.cost_inr)}</td>
                            <td className="py-2">
                              <span className={cn("font-label text-[10px] font-bold px-1.5 py-0.5 rounded", d.quality_rating === "HIGH" ? "bg-green-100 text-green-700" : d.quality_rating === "MEDIUM" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700")}>
                                {d.quality_rating}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
