"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  MessageCircle,
  AtSign,
  Tv2,
  Send,
  Upload,
  Users,
} from "lucide-react";
import {
  api,
  AnalyticsOverviewExtended,
  MessagingAnalytics,
  TelecallingAnalyticsExtended,
  FunnelAnalyticsExtended,
} from "@/lib/api";

type DateRange = "today" | "7d" | "30d";
type Tab = "overview" | "channels" | "telecalling" | "pipeline";

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 flex flex-col gap-1">
      <p className="font-label text-xs text-on-surface-muted uppercase tracking-wider">{label}</p>
      <p className={`font-display text-3xl font-bold text-on-surface mt-1 ${valueClass ?? ""}`}>{value}</p>
      {sub && <p className="font-label text-xs text-on-surface-muted">{sub}</p>}
    </div>
  );
}

function SkeletonGrid({ cols = 4, rows = 1 }: { cols?: number; rows?: number }) {
  return (
    <div className="space-y-6">
      <div className={`grid grid-cols-${cols} gap-6`}>
        {Array.from({ length: cols * rows }).map((_, i) => (
          <div key={i} className="h-36 rounded-card bg-surface-mid animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-red-50 text-red-700 font-label text-sm p-4 ring-1 ring-red-200">
      {message}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
      <h2 className="font-display text-base font-bold text-tertiary mb-5">{title}</h2>
      {children}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function FunnelSteps({
  funnel,
}: {
  funnel: AnalyticsOverviewExtended["funnel"];
}) {
  const steps = [
    { label: "Inquiries", count: funnel.inquiries },
    { label: "Engaged", count: funnel.engaged },
    { label: "Hot", count: funnel.hot },
    { label: "Converted", count: funnel.converted },
  ];

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const prevCount = i === 0 ? step.count : steps[i - 1].count;
        const dropPct =
          i === 0 || prevCount === 0
            ? null
            : Math.round((step.count / prevCount) * 100);
        const widthPct =
          funnel.inquiries === 0 ? 0 : Math.round((step.count / funnel.inquiries) * 100);

        return (
          <div key={step.label} className="flex items-center gap-3">
            <span className="font-label text-xs text-on-surface-muted w-20 text-right shrink-0">
              {step.label}
            </span>
            <div className="flex-1 bg-surface-mid rounded-full h-6 overflow-hidden">
              <div
                className="h-6 rounded-full bg-indigo-500 transition-all"
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className="font-display text-sm font-bold text-on-surface w-10 shrink-0">
              {step.count}
            </span>
            {dropPct !== null && (
              <span className="font-label text-xs text-on-surface-muted w-14 shrink-0">
                {dropPct}% kept
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SegmentBars({
  bySegment,
  total,
}: {
  bySegment: Record<"A" | "B" | "C" | "D", number>;
  total: number;
}) {
  const segs: { key: "A" | "B" | "C" | "D"; label: string; color: string }[] = [
    { key: "A", label: "Hot (A)", color: "bg-emerald-500" },
    { key: "B", label: "Warm (B)", color: "bg-blue-500" },
    { key: "C", label: "Cold (C)", color: "bg-amber-500" },
    { key: "D", label: "Disqualified (D)", color: "bg-red-400" },
  ];

  return (
    <div className="space-y-3">
      {segs.map(({ key, label, color }) => {
        const count = bySegment[key] ?? 0;
        const pct = total === 0 ? 0 : Math.round((count / total) * 100);
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="font-label text-xs text-on-surface-muted w-28 shrink-0">{label}</span>
            <div className="flex-1 bg-surface-mid rounded-full h-4 overflow-hidden">
              <div
                className={`h-4 rounded-full ${color} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-label text-xs text-on-surface w-8 text-right shrink-0">{count}</span>
            <span className="font-label text-xs text-on-surface-muted w-8 shrink-0">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function OverviewTab({ range }: { range: DateRange }) {
  const [data, setData] = useState<AnalyticsOverviewExtended | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    api.analytics
      .overviewExtended(range)
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, [range]);

  if (err) return <ErrorBox message={err} />;
  if (!data) return <SkeletonGrid cols={5} />;

  const total = data.total_leads;
  const hotCount = data.by_segment.A ?? 0;
  const hotPct = total === 0 ? 0 : Math.round((hotCount / total) * 100);
  const aiTotal = data.ai_vs_human.ai + data.ai_vs_human.human;
  const aiPct = aiTotal === 0 ? 0 : Math.round((data.ai_vs_human.ai / aiTotal) * 100);
  const cb = data.channel_breakdown;
  const channelSub = `WA: ${cb.whatsapp} · IG: ${cb.instagram} · FB: ${cb.facebook} · TG: ${cb.telegram}`;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="Total Leads" value={total.toLocaleString()} sub={channelSub} />
        <KpiCard
          label="Hot Leads"
          value={hotCount.toLocaleString()}
          sub={`${hotPct}% of total`}
        />
        <KpiCard
          label="Conversions"
          value={data.funnel.converted.toLocaleString()}
          sub={`${data.converted_today} today`}
        />
        <KpiCard
          label="Unreplied 24h"
          value={data.unreplied_24h.toLocaleString()}
          valueClass={data.unreplied_24h > 0 ? "text-red-600" : "text-emerald-600"}
        />
        <KpiCard label="AI Automation" value={`${aiPct}%`} sub={`${data.ai_vs_human.ai} AI · ${data.ai_vs_human.human} human`} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-2 gap-6">
        <SectionCard title="New Leads per Day">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.daily_leads} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#a1a1aa" }} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e4e7" }}
              />
              <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#leadGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Messages per Day">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.daily_messages} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#a1a1aa" }} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e4e7" }} />
              <Bar dataKey="inbound" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} name="Inbound" />
              <Bar dataKey="outbound" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} name="Outbound" />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-2 gap-6">
        <SectionCard title="Conversion Funnel">
          <FunnelSteps funnel={data.funnel} />
        </SectionCard>

        <SectionCard title="Segment Distribution">
          <SegmentBars bySegment={data.by_segment} total={total} />
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Channels Tab ─────────────────────────────────────────────────────────────

type ChannelFilter = "all" | "whatsapp" | "instagram" | "facebook" | "telegram";

const CHANNEL_OPTIONS: { id: ChannelFilter; label: string; Icon: React.ElementType }[] = [
  { id: "all", label: "All", Icon: MessageCircle },
  { id: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
  { id: "instagram", label: "Instagram", Icon: AtSign },
  { id: "facebook", label: "Facebook", Icon: Tv2 },
  { id: "telegram", label: "Telegram", Icon: Send },
];

function ReplySourceBar({ breakdown }: { breakdown: MessagingAnalytics["reply_source_breakdown"] }) {
  const total = breakdown.ai + breakdown.knowledge + breakdown.manual + breakdown.unknown;
  if (total === 0) return <p className="font-label text-xs text-on-surface-muted">No data</p>;

  const segments = [
    { label: "AI", value: breakdown.ai, color: "bg-indigo-500" },
    { label: "Knowledge Base", value: breakdown.knowledge, color: "bg-blue-400" },
    { label: "Manual", value: breakdown.manual, color: "bg-slate-400" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex h-8 rounded-lg overflow-hidden gap-px">
        {segments.map(({ label, value, color }) => {
          const pct = Math.round((value / total) * 100);
          if (pct === 0) return null;
          return (
            <div
              key={label}
              title={`${label}: ${pct}%`}
              className={`${color} flex items-center justify-center transition-all`}
              style={{ width: `${pct}%` }}
            >
              <span className="font-label text-xs text-white font-semibold">{pct}%</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4">
        {segments.map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${color} shrink-0`} />
            <span className="font-label text-xs text-on-surface-muted">{label}: {value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelsTab({ range }: { range: DateRange }) {
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [data, setData] = useState<MessagingAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    api.analytics
      .messaging(channel, range)
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, [channel, range]);

  return (
    <div className="space-y-6">
      {/* Channel switcher */}
      <div className="flex gap-2 flex-wrap">
        {CHANNEL_OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setChannel(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-label text-sm font-semibold transition-colors ring-1 ${
              channel === id
                ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
                : "bg-surface text-on-surface-muted ring-[#c4c7c7]/15 hover:text-on-surface"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {err && <ErrorBox message={err} />}
      {!data && !err && <SkeletonGrid cols={4} />}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label="Sent Today" value={data.sent_today.toLocaleString()} />
            <KpiCard label="Received Today" value={data.received_today.toLocaleString()} />
            <KpiCard
              label="AI Reply Rate"
              value={data.ai_reply_rate !== null ? `${Math.round(data.ai_reply_rate * 100)}%` : "—"}
            />
            <KpiCard
              label="AI + KB vs Manual"
              value={`${data.reply_source_breakdown.ai + data.reply_source_breakdown.knowledge}`}
              sub={`Manual: ${data.reply_source_breakdown.manual}`}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-6">
            <SectionCard title="Message Volume">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.daily_messages} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#a1a1aa" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e4e7" }} />
                  <Line type="monotone" dataKey="inbound" stroke="#3b82f6" strokeWidth={2} dot={false} name="Inbound" />
                  <Line type="monotone" dataKey="outbound" stroke="#10b981" strokeWidth={2} dot={false} name="Outbound" />
                </LineChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard title="Reply Source Split">
              <ReplySourceBar breakdown={data.reply_source_breakdown} />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Telecalling Tab ──────────────────────────────────────────────────────────

const SLOT_HOURS = ["9AM", "10AM", "11AM", "12PM", "1PM", "2PM", "3PM", "4PM", "5PM", "6PM"];

function CallerPulsStrip({ data }: { data: TelecallingAnalyticsExtended }) {
  const callers = data.per_caller;
  const slots = data.calls_per_slot;

  if (callers.length === 0) {
    return <p className="font-label text-sm text-on-surface-muted">No caller data for today.</p>;
  }

  return (
    <div>
      <div className="space-y-2">
        {callers.map((caller) => {
          const totalCalls = slots.reduce(
            (sum, s) => sum + (s.caller_counts[caller.caller_id] ?? 0),
            0
          );

          return (
            <div key={caller.caller_id} className="flex items-center gap-2">
              <span className="font-label text-xs text-on-surface-muted w-20 text-right shrink-0 truncate">
                {caller.name}
              </span>
              <div className="flex gap-0.5 flex-1">
                {slots.map((slot) => {
                  const count = slot.caller_counts[caller.caller_id] ?? 0;
                  return (
                    <div
                      key={slot.slot}
                      title={count > 0 ? `${count} call${count > 1 ? "s" : ""}` : "Idle"}
                      className={`h-7 flex-1 rounded-sm ${
                        count > 0 ? "bg-emerald-500" : "bg-surface-mid"
                      }`}
                    />
                  );
                })}
              </div>
              <span className="font-label text-xs text-on-surface-muted w-20 shrink-0">
                {totalCalls} calls · {formatMinutes(caller.total_minutes_today)}
              </span>
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex gap-0.5 mt-1 ml-[88px] mr-[88px]">
        {SLOT_HOURS.map((label, i) => (
          <div
            key={label}
            className="flex-1 font-label text-[10px] text-on-surface-muted text-center"
            style={{ gridColumn: `${i * 2 + 1} / span 2` }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function TelecallingTab() {
  const [data, setData] = useState<TelecallingAnalyticsExtended | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.analytics
      .telecallingExtended()
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  if (err) return <ErrorBox message={err} />;
  if (!data) return <SkeletonGrid cols={4} />;

  const totalCalls = data.calls_today;
  const converted = data.outcome_breakdown.converted;
  const convRate = totalCalls === 0 ? 0 : Math.round((converted / totalCalls) * 100);

  const outcomes = [
    { label: "Converted", value: data.outcome_breakdown.converted, color: "text-emerald-700 bg-emerald-50 ring-emerald-100" },
    { label: "Callback", value: data.outcome_breakdown.callback, color: "text-blue-700 bg-blue-50 ring-blue-100" },
    { label: "Not Interested", value: data.outcome_breakdown.not_interested, color: "text-red-700 bg-red-50 ring-red-100" },
    { label: "No Answer", value: data.outcome_breakdown.no_answer, color: "text-amber-700 bg-amber-50 ring-amber-100" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Calls Today" value={data.calls_today.toLocaleString()} />
        <KpiCard label="Calls This Week" value={data.calls_this_week.toLocaleString()} />
        <KpiCard label="Talk Time Today" value={formatMinutes(data.total_minutes_today)} />
        <KpiCard label="Team Conv. Rate" value={`${convRate}%`} sub={`${converted} converted`} />
      </div>

      {/* Caller pulse strip */}
      <SectionCard title="Who worked and when — today">
        <CallerPulsStrip data={data} />
      </SectionCard>

      {/* Outcome + calls per hour */}
      <div className="grid grid-cols-2 gap-6">
        <SectionCard title="Outcome Breakdown">
          <div className="grid grid-cols-2 gap-3">
            {outcomes.map((o) => (
              <div key={o.label} className={`rounded-2xl px-4 py-4 ring-1 ${o.color}`}>
                <p className="font-label text-xs uppercase tracking-wider opacity-70">{o.label}</p>
                <p className="font-display text-3xl font-bold mt-1">{o.value}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Calls Per Hour">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.calls_per_hour} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#a1a1aa" }} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e4e7" }} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Calls" />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* Caller leaderboard */}
      <SectionCard title="Caller Leaderboard">
        {data.per_caller.length === 0 ? (
          <p className="font-label text-sm text-on-surface-muted">No active callers today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-mid">
                  {["Name", "Calls Today", "Talk Time", "Conv. Rate", "Score"].map((h) => (
                    <th key={h} className="pb-3 pr-4 font-label text-xs font-semibold text-on-surface-muted uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.per_caller]
                  .sort((a, b) => b.calls_today - a.calls_today)
                  .map((c) => {
                    const scoreColor =
                      c.overall_score === null
                        ? "text-on-surface-muted"
                        : c.overall_score >= 7
                        ? "text-emerald-600"
                        : c.overall_score >= 4
                        ? "text-amber-600"
                        : "text-red-600";

                    return (
                      <tr key={c.caller_id} className="border-b border-surface-mid/50 hover:bg-surface-low transition-colors">
                        <td className="py-3 pr-4 font-body text-sm font-semibold text-on-surface">{c.name}</td>
                        <td className="py-3 pr-4 font-label text-sm text-on-surface">{c.calls_today}</td>
                        <td className="py-3 pr-4 font-label text-sm text-on-surface">{formatMinutes(c.total_minutes_today)}</td>
                        <td className="py-3 pr-4 font-label text-sm text-on-surface">
                          {c.conversion_rate !== null ? `${Math.round(c.conversion_rate * 100)}%` : "—"}
                        </td>
                        <td className={`py-3 font-label text-sm font-bold ${scoreColor}`}>
                          {c.overall_score !== null ? c.overall_score.toFixed(1) : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Leads Pipeline Tab ───────────────────────────────────────────────────────

const SOURCE_CONFIG: { key: keyof FunnelAnalyticsExtended["by_source"]; label: string; Icon: React.ElementType }[] = [
  { key: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
  { key: "instagram", label: "Instagram", Icon: AtSign },
  { key: "facebook", label: "Facebook", Icon: Tv2 },
  { key: "telegram", label: "Telegram", Icon: Send },
  { key: "upload", label: "Upload", Icon: Upload },
  { key: "manual", label: "Manual", Icon: Users },
];

const HOT_AGING_COLORS = ["bg-emerald-500", "bg-amber-400", "bg-orange-500", "bg-red-600"];

function HotLeadAging({ aging }: { aging: FunnelAnalyticsExtended["hot_lead_aging"] }) {
  const max = Math.max(...aging.map((a) => a.count), 1);
  return (
    <div className="space-y-3">
      {aging.map(({ bucket, count }, i) => {
        const pct = Math.round((count / max) * 100);
        return (
          <div key={bucket} className="flex items-center gap-3">
            <span className="font-label text-xs text-on-surface-muted w-14 shrink-0">{bucket}</span>
            <div className="flex-1 bg-surface-mid rounded-full h-4 overflow-hidden">
              <div
                className={`h-4 rounded-full ${HOT_AGING_COLORS[i] ?? "bg-slate-400"} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-label text-xs text-on-surface w-8 text-right shrink-0">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function PipelineTab() {
  const [data, setData] = useState<FunnelAnalyticsExtended | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.analytics
      .funnelExtended()
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  if (err) return <ErrorBox message={err} />;
  if (!data) return <SkeletonGrid cols={4} />;

  const segTotal = data.total_leads;
  const srcTotal = Object.values(data.by_source).reduce((a, b) => a + b, 0);

  const segs: { key: "A" | "B" | "C" | "D"; label: string; color: string }[] = [
    { key: "A", label: "Hot (A)", color: "bg-emerald-500" },
    { key: "B", label: "Warm (B)", color: "bg-blue-500" },
    { key: "C", label: "Cold (C)", color: "bg-amber-500" },
    { key: "D", label: "Disqualified (D)", color: "bg-red-400" },
  ];

  const histogramColored = data.score_histogram.map((item, i) => ({
    ...item,
    fill: ["#ef4444", "#f97316", "#f59e0b", "#22c55e", "#10b981"][i] ?? "#6366f1",
  }));

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total Leads" value={data.total_leads.toLocaleString()} />
        <KpiCard label="New This Week" value={data.leads_this_week.toLocaleString()} />
        <KpiCard label="Avg Score" value={data.avg_score !== null ? data.avg_score.toFixed(1) : "—"} />
        <KpiCard label="Disqualified" value={(data.by_segment.D ?? 0).toLocaleString()} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Segment distribution */}
        <SectionCard title="Segment Distribution">
          <div className="space-y-3">
            {segs.map(({ key, label, color }) => {
              const count = data.by_segment[key] ?? 0;
              const pct = segTotal === 0 ? 0 : Math.round((count / segTotal) * 100);
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="font-label text-xs text-on-surface-muted w-28 shrink-0">{label}</span>
                  <div className="flex-1 bg-surface-mid rounded-full h-4 overflow-hidden">
                    <div className={`h-4 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-label text-xs text-on-surface w-8 text-right shrink-0">{count}</span>
                  <span className="font-label text-xs text-on-surface-muted w-8 shrink-0">{pct}%</span>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* Source breakdown */}
        <SectionCard title="Source Breakdown">
          <div className="space-y-3">
            {SOURCE_CONFIG.map(({ key, label, Icon }) => {
              const count = data.by_source[key] ?? 0;
              const pct = srcTotal === 0 ? 0 : Math.round((count / srcTotal) * 100);
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 w-28 shrink-0">
                    <Icon size={12} className="text-on-surface-muted shrink-0" />
                    <span className="font-label text-xs text-on-surface-muted truncate">{label}</span>
                  </div>
                  <div className="flex-1 bg-surface-mid rounded-full h-4 overflow-hidden">
                    <div className="h-4 rounded-full bg-indigo-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-label text-xs text-on-surface w-8 text-right shrink-0">{count}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Score histogram */}
        <SectionCard title="Score Distribution">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={histogramColored} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#a1a1aa" }} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e4e7" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Leads" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Hot lead aging */}
        <SectionCard title="Segment A — Time without conversion">
          <HotLeadAging aging={data.hot_lead_aging} />
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "channels", label: "Channels" },
  { id: "telecalling", label: "Telecalling" },
  { id: "pipeline", label: "Leads Pipeline" },
];

const RANGES: { id: DateRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
];

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [range, setRange] = useState<DateRange>("7d");

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold text-tertiary">Analytics</h1>
          <p className="font-body text-on-surface-muted mt-1">
            Service metrics across all channels, telecalling, and lead funnel
          </p>
        </div>
        {/* Date range pills */}
        <div className="flex gap-1 bg-surface-low rounded-xl p-1 ring-1 ring-[#c4c7c7]/15 self-start">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-4 py-2 rounded-lg font-label text-sm font-semibold transition-colors ${
                range === r.id
                  ? "bg-surface text-tertiary shadow-card"
                  : "text-on-surface-muted hover:text-on-surface"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* Tab row */}
      <nav className="flex gap-1 bg-surface-low rounded-xl p-1 w-fit ring-1 ring-[#c4c7c7]/15">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 rounded-lg font-label text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? "bg-surface text-tertiary shadow-card"
                : "text-on-surface-muted hover:text-on-surface"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab range={range} />}
      {activeTab === "channels" && <ChannelsTab range={range} />}
      {activeTab === "telecalling" && <TelecallingTab />}
      {activeTab === "pipeline" && <PipelineTab />}
    </div>
  );
}
