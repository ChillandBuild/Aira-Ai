"use client";
import { useEffect, useState } from "react";
import { api, Lead, AnalyticsOverview } from "@/lib/api";
import { MessageSquare, Users, Sparkles, TrendingUp, Phone, Zap } from "lucide-react";

const SEGMENT_CONFIG = {
  A: { label: "Hot", color: "#059669", bg: "#d1fae5", desc: "High Intent" },
  B: { label: "Warm", color: "#d97706", bg: "#fef3c7", desc: "In Discussion" },
  C: { label: "Cold", color: "#6b7280", bg: "#f3f4f6", desc: "No Reply" },
  D: { label: "Lost", color: "#ef4444", bg: "#fee2e2", desc: "Disqualified" },
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <div
      className={`card card-hover rounded-3xl ${accent ? "bg-emerald-vivid text-white border-transparent" : ""}`}
      style={accent ? { background: "linear-gradient(135deg, #059669 0%, #047857 100%)" } : {}}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
            accent ? "bg-white/20" : "bg-surface-low"
          }`}
        >
          <Icon size={18} className={accent ? "text-white" : "text-primary"} />
        </div>
      </div>
      <div className={`stat-num mb-1 ${accent ? "text-white" : ""}`}>{value}</div>
      <div className={`font-body text-sm font-medium ${accent ? "text-white/90" : "text-ink"} mb-0.5`}>
        {label}
      </div>
      <div className={`stat-label ${accent ? "text-white/60" : ""}`}>{sub}</div>
    </div>
  );
}

function SegmentBar({ leads }: { leads: Lead[] }) {
  const total = leads.length || 1;
  return (
    <div className="card rounded-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display font-bold text-ink" style={{ fontSize: "1.05rem", letterSpacing: "-0.02em" }}>
            Segment Distribution
          </h2>
          <p className="font-body text-sm text-ink-muted mt-0.5">{leads.length} total leads across all stages</p>
        </div>
      </div>
      {/* Bar chart */}
      <div className="flex gap-3 items-end" style={{ height: "120px" }}>
        {(["A", "B", "C", "D"] as const).map((seg) => {
          const count = leads.filter((l) => l.segment === seg).length;
          const pct = (count / total) * 100;
          const cfg = SEGMENT_CONFIG[seg];
          return (
            <div key={seg} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              <span className="font-label font-semibold text-ink-secondary" style={{ fontSize: "0.8rem" }}>{count}</span>
              <div
                className="w-full rounded-t-xl transition-all duration-500"
                style={{
                  height: `${Math.max(pct * 0.9, 6)}%`,
                  background: cfg.color,
                  opacity: 0.85,
                  minHeight: "6px",
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Labels */}
      <div className="flex gap-3 mt-3">
        {(["A", "B", "C", "D"] as const).map((seg) => {
          const cfg = SEGMENT_CONFIG[seg];
          return (
            <div key={seg} className="flex-1 text-center">
              <span
                className="inline-block px-2 py-0.5 rounded-full font-label font-semibold"
                style={{ fontSize: "0.65rem", background: cfg.bg, color: cfg.color, letterSpacing: "0.04em" }}
              >
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityFeed({ leads }: { leads: Lead[] }) {
  const recent = leads.slice(0, 6);
  return (
    <div className="card rounded-3xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display font-bold text-ink" style={{ fontSize: "1.05rem", letterSpacing: "-0.02em" }}>
          Recent Leads
        </h2>
        <span className="badge badge-green">Live</span>
      </div>
      <div className="space-y-3">
        {recent.length === 0 && (
          <p className="font-body text-sm text-ink-muted text-center py-6">No leads yet</p>
        )}
        {recent.map((lead) => {
          const cfg = SEGMENT_CONFIG[lead.segment as keyof typeof SEGMENT_CONFIG];
          return (
            <div key={lead.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-subtle transition-colors">
              <div
                className="w-9 h-9 rounded-2xl flex items-center justify-center font-label font-bold flex-shrink-0"
                style={{ background: cfg?.bg, color: cfg?.color, fontSize: "0.75rem" }}
              >
                {cfg?.label[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-body font-medium text-sm text-ink truncate">{lead.name || "Unknown"}</p>
                <p className="font-body text-xs text-ink-muted truncate">{lead.phone}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-label font-semibold text-primary" style={{ fontSize: "0.75rem" }}>
                  {lead.score}/10
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.leads.list({ limit: 200 }), api.analytics.overview()])
      .then(([l, o]) => { setLeads(l); setOverview(o); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = leads.length;
  const segA = leads.filter((l) => l.segment === "A").length;
  const segB = leads.filter((l) => l.segment === "B").length;

  return (
    <div>
      {/* Header */}
      <div className="mb-7">
        <h1 className="page-title">Good morning 👋</h1>
        <p className="page-subtitle">Here's what's happening with your leads today.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-3xl h-36 bg-border-subtle animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Stat row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
            <StatCard label="Total Leads" value={total} sub="All segments" icon={Users} accent />
            <StatCard label="Hot Leads" value={segA} sub="Segment A — high intent" icon={TrendingUp} />
            <StatCard label="Warm Leads" value={segB} sub="Segment B — in discussion" icon={MessageSquare} />
            <StatCard label="AI Handled" value={overview?.ai_handled_today ?? 0} sub="Today's auto-replies" icon={Sparkles} />
          </div>

          {/* Second row */}
          <div className="grid grid-cols-3 gap-5 mb-5">
            <StatCard label="Converted (7d)" value={overview?.converted_7d ?? 0} sub="Closed this week" icon={Zap} />
            <StatCard label="Unreplied (24h)" value={overview?.unreplied_24h ?? 0} sub="Awaiting reply" icon={MessageSquare} />
            <StatCard
              label="AI vs Human"
              value={overview ? `${overview.ai_vs_human.ai} · ${overview.ai_vs_human.human}` : "—"}
              sub="Auto vs manual replies (7d)"
              icon={Phone}
            />
          </div>

          {/* Bottom section */}
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2">
              <SegmentBar leads={leads} />
            </div>
            <div>
              <ActivityFeed leads={leads} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
