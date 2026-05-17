"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Lead, AnalyticsOverview } from "@/lib/api";
import {
  MessageSquare,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  Inbox,
  Send as SendIcon,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useAuthRole } from "./contexts/AuthRoleContext";

const SEGMENT_CONFIG: Record<"A" | "B" | "C" | "D", { label: string; tone: string; bar: string; bg: string }> = {
  A: { label: "Hot", tone: "text-emerald-700", bar: "bg-emerald-500", bg: "bg-emerald-50" },
  B: { label: "Warm", tone: "text-amber-700", bar: "bg-amber-500", bg: "bg-amber-50" },
  C: { label: "Cold", tone: "text-slate-600", bar: "bg-slate-400", bg: "bg-slate-50" },
  D: { label: "Lost", tone: "text-rose-600", bar: "bg-rose-400", bg: "bg-rose-50" },
};

function greet(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function Kpi({
  label,
  value,
  sub,
  Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub: string;
  Icon: React.ElementType;
  href?: string;
  tone?: "default" | "alert" | "good";
}) {
  const toneClass =
    tone === "alert" ? "text-rose-600" : tone === "good" ? "text-emerald-600" : "text-ink";
  const Body = (
    <div className="card rounded-3xl h-full flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-surface-subtle flex items-center justify-center">
          <Icon size={18} className="text-ink-muted" />
        </div>
        {href && <ArrowUpRight size={14} className="text-ink-muted/40" />}
      </div>
      <div className="mt-6">
        <div className={`font-display font-bold leading-none ${toneClass}`} style={{ fontSize: "2rem", letterSpacing: "-0.03em" }}>
          {value}
        </div>
        <div className="font-body text-sm font-medium text-ink mt-2">{label}</div>
        <div className="font-body text-xs text-ink-muted mt-0.5">{sub}</div>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block hover:-translate-y-px transition-transform">{Body}</Link> : Body;
}

function PipelineBar({ leads }: { leads: Lead[] }) {
  const total = leads.length;
  const counts = (["A", "B", "C", "D"] as const).map((s) => ({
    seg: s,
    count: leads.filter((l) => l.segment === s).length,
  }));

  return (
    <div className="card rounded-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display font-bold text-ink" style={{ fontSize: "1.05rem", letterSpacing: "-0.02em" }}>
            Pipeline
          </h2>
          <p className="font-body text-sm text-ink-muted mt-0.5">
            {total === 0 ? "No leads yet" : `${total} active leads`}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="py-8 text-center font-body text-sm text-ink-muted">
          Upload leads or wait for inbound WhatsApp messages.
        </div>
      ) : (
        <>
          {/* Single horizontal stacked bar */}
          <div className="h-2.5 rounded-full overflow-hidden flex bg-surface-subtle mb-5">
            {counts.map(({ seg, count }) =>
              count > 0 ? (
                <div
                  key={seg}
                  className={SEGMENT_CONFIG[seg].bar}
                  style={{ width: `${(count / total) * 100}%` }}
                  title={`${SEGMENT_CONFIG[seg].label}: ${count}`}
                />
              ) : null,
            )}
          </div>

          {/* Counts table */}
          <div className="grid grid-cols-4 gap-3">
            {counts.map(({ seg, count }) => {
              const cfg = SEGMENT_CONFIG[seg];
              const pct = total ? Math.round((count / total) * 100) : 0;
              return (
                <Link
                  key={seg}
                  href={`/dashboard/leads?segment=${seg}`}
                  className={`p-3 rounded-2xl ${cfg.bg} hover:ring-1 hover:ring-current ${cfg.tone} transition-all`}
                >
                  <div className="font-display font-bold text-ink" style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>
                    {count}
                  </div>
                  <div className="font-label text-xs font-semibold mt-1 uppercase tracking-wider">
                    {cfg.label}
                  </div>
                  <div className="font-body text-xs text-ink-muted mt-0.5">{pct}% of total</div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function TodaySnapshot({ overview }: { overview: AnalyticsOverview | null }) {
  const today = overview?.daily_messages?.at(-1);
  const inbound = today?.inbound ?? 0;
  const outbound = today?.outbound ?? 0;
  const aiToday = overview?.ai_handled_today ?? 0;

  return (
    <div className="card rounded-3xl">
      <h2 className="font-display font-bold text-ink mb-4" style={{ fontSize: "1.05rem", letterSpacing: "-0.02em" }}>
        Today
      </h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Inbox size={16} className="text-blue-600" />
            </div>
            <div>
              <div className="font-body font-medium text-sm text-ink">Inbound</div>
              <div className="font-body text-xs text-ink-muted">Messages received</div>
            </div>
          </div>
          <div className="font-display font-bold text-ink" style={{ fontSize: "1.5rem" }}>
            {inbound}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <SendIcon size={16} className="text-emerald-600" />
            </div>
            <div>
              <div className="font-body font-medium text-sm text-ink">Outbound</div>
              <div className="font-body text-xs text-ink-muted">Replies sent</div>
            </div>
          </div>
          <div className="font-display font-bold text-ink" style={{ fontSize: "1.5rem" }}>
            {outbound}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
              <Sparkles size={16} className="text-purple-600" />
            </div>
            <div>
              <div className="font-body font-medium text-sm text-ink">AI handled</div>
              <div className="font-body text-xs text-ink-muted">Auto-replies sent</div>
            </div>
          </div>
          <div className="font-display font-bold text-ink" style={{ fontSize: "1.5rem" }}>
            {aiToday}
          </div>
        </div>
      </div>
    </div>
  );
}


export default function DashboardPage() {
  const { role, loading: roleLoading } = useAuthRole();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  // Redirect callers to their profile page
  useEffect(() => {
    if (!roleLoading && role === "caller") {
      router.replace("/dashboard/profile");
    }
  }, [role, roleLoading, router]);

  useEffect(() => {
    if (role === "caller") return; // skip fetching admin data for callers
    Promise.all([api.leads.list({ limit: 200 }), api.analytics.overview().catch(() => null)])
      .then(([l, o]) => {
        setLeads(l);
        setOverview(o);
      })
      .finally(() => setLoading(false));
  }, [role]);

  // Prevent flash of admin content for callers while role loads or redirect fires
  if (roleLoading || role === "caller") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  const total = leads.length;
  const segA = leads.filter((l) => l.segment === "A").length;
  const aiVsHuman = overview?.ai_vs_human;
  const totalReplies = (aiVsHuman?.ai ?? 0) + (aiVsHuman?.human ?? 0);
  const aiPct = totalReplies > 0 ? Math.round(((aiVsHuman?.ai ?? 0) / totalReplies) * 100) : 0;

  return (
    <div>
      <div className="mb-7">
        <h1 className="page-title">{greet()}</h1>
        <p className="page-subtitle">Here&apos;s what&apos;s happening with your leads.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-3xl h-36 bg-border-subtle animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
            <Kpi
              label="Total leads"
              value={total}
              sub="Active in pipeline"
              Icon={MessageSquare}
              href="/dashboard/leads"
            />
            <Kpi
              label="Hot leads"
              value={segA}
              sub="High intent · Segment A"
              Icon={TrendingUp}
              tone="good"
              href="/dashboard/leads?segment=A"
            />
            <Kpi
              label="Converted (7d)"
              value={overview?.converted_7d ?? 0}
              sub="Closed this week"
              Icon={CheckCircle2}
              tone="good"
            />
            <Kpi
              label="Awaiting reply"
              value={overview?.unreplied_24h ?? 0}
              sub="Inbound > 0 · No outbound (24h)"
              Icon={AlertCircle}
              tone={(overview?.unreplied_24h ?? 0) > 0 ? "alert" : "default"}
              href="/dashboard/conversations"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
            <Kpi
              label="AI auto-reply share"
              value={`${aiPct}%`}
              sub={`${aiVsHuman?.ai ?? 0} AI · ${aiVsHuman?.human ?? 0} human (7 days)`}
              Icon={Sparkles}
            />
            <Kpi
              label="Inquiries (7d)"
              value={overview?.daily_leads?.reduce((acc, d) => acc + d.count, 0) ?? 0}
              sub="New leads added this week"
              Icon={Inbox}
            />
            <Kpi
              label="Funnel velocity"
              value={
                overview?.funnel
                  ? `${overview.funnel.converted}/${overview.funnel.inquiries}`
                  : "—"
              }
              sub="Converted vs inquiries (7d)"
              Icon={TrendingUp}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <PipelineBar leads={leads} />
            </div>
            <div>
              <TodaySnapshot overview={overview} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
