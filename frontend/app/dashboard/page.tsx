"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, AnalyticsOverview } from "@/lib/api";
import {
  MessageSquare,
  Sparkles,
  TrendingUp,
  Inbox,
  Send as SendIcon,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useAuthRole } from "./contexts/AuthRoleContext";
import { cn } from "@/lib/utils";

const SEGMENT_CONFIG: Record<"A" | "B" | "C" | "D", { label: string; tone: string; bar: string; bg: string }> = {
  A: { label: "Hot", tone: "text-emerald-700", bar: "bg-emerald-500", bg: "bg-emerald-50" },
  B: { label: "Warm", tone: "text-amber-700", bar: "bg-amber-500", bg: "bg-amber-50" },
  C: { label: "Cold", tone: "text-slate-600", bar: "bg-slate-400", bg: "bg-slate-50" },
  D: { label: "Disqualified", tone: "text-rose-600", bar: "bg-rose-400", bg: "bg-rose-50" },
};

function PipelineBar({ by_segment }: { by_segment: Record<"A" | "B" | "C" | "D", number> }) {
  const counts = (["A", "B", "C", "D"] as const).map((s) => ({
    seg: s,
    count: by_segment?.[s] ?? 0,
  }));
  const total = counts.reduce((acc, c) => acc + c.count, 0);

  return (
    <div className="card rounded-[32px] p-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display font-bold text-zinc-900 text-[18px]">
            Pipeline Activity
          </h2>
          <p className="font-body text-xs text-zinc-400 mt-1">
            {total === 0 ? "No leads yet" : `${total} active leads categorized`}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="py-8 text-center font-body text-sm text-zinc-400">
          Upload leads or wait for inbound WhatsApp messages.
        </div>
      ) : (
        <>
          {/* Stacked bar chart */}
          <div className="h-3 rounded-full overflow-hidden flex bg-zinc-100 mb-6">
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

          {/* Table list */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {counts.map(({ seg, count }) => {
              const cfg = SEGMENT_CONFIG[seg];
              const pct = total ? Math.round((count / total) * 100) : 0;
              return (
                <Link
                  key={seg}
                  href={`/dashboard/leads?segment=${seg}`}
                  className={`p-4 rounded-2xl ${cfg.bg} border border-transparent hover:border-zinc-200 transition-all`}
                >
                  <div className="font-display font-bold text-zinc-900 text-[22px]">
                    {count}
                  </div>
                  <div className="font-label text-[10px] font-semibold mt-1 uppercase tracking-wider text-zinc-500">
                    {cfg.label}
                  </div>
                  <div className="font-body text-[11px] text-zinc-400 mt-0.5">{pct}% of pipeline</div>
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
    <div className="card rounded-[32px] h-full p-8 flex flex-col justify-between">
      <div>
        <h2 className="font-display font-bold text-zinc-900 mb-6 text-[18px]">
          Today
        </h2>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <Inbox size={16} className="text-blue-600" />
              </div>
              <div>
                <div className="font-body font-semibold text-[13px] text-zinc-800">Inbound</div>
                <div className="font-body text-xs text-zinc-400">Messages received</div>
              </div>
            </div>
            <div className="font-display font-bold text-zinc-900 text-[20px]">
              {inbound}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <SendIcon size={16} className="text-emerald-600" />
              </div>
              <div>
                <div className="font-body font-semibold text-[13px] text-zinc-800">Outbound</div>
                <div className="font-body text-xs text-zinc-400">Replies sent</div>
              </div>
            </div>
            <div className="font-display font-bold text-zinc-900 text-[20px]">
              {outbound}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
                <Sparkles size={16} className="text-purple-600" />
              </div>
              <div>
                <div className="font-body font-semibold text-[13px] text-zinc-800">AI handled</div>
                <div className="font-body text-xs text-zinc-400">Auto-replies sent</div>
              </div>
            </div>
            <div className="font-display font-bold text-zinc-900 text-[20px]">
              {aiToday}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { role, loading: roleLoading } = useAuthRole();
  const router = useRouter();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  // Redirect callers to their profile page
  useEffect(() => {
    if (!roleLoading && role === "caller") {
      router.replace("/dashboard/profile");
    }
  }, [role, roleLoading, router]);

  useEffect(() => {
    if (role !== "owner") return; // only owners fetch admin data
    api.analytics.overview()
      .then((o) => {
        setOverview(o);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [role]);

  if (roleLoading || role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <RefreshCw size={24} className="animate-spin text-zinc-900" />
        {!roleLoading && role === null && (
          <div className="text-center max-w-sm">
            <p className="font-body text-sm text-zinc-400 mb-3">
              Couldn&apos;t reach the server. The backend may be waking up — this can take 30–60 seconds.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary text-sm"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  const total = overview?.funnel?.inquiries ?? 0;
  const segA = overview?.by_segment?.A ?? 0;
  const aiVsHuman = overview?.ai_vs_human;
  const totalReplies = (aiVsHuman?.ai ?? 0) + (aiVsHuman?.human ?? 0);
  const aiPct = totalReplies > 0 ? Math.round(((aiVsHuman?.ai ?? 0) / totalReplies) * 100) : 0;

  return (
    <div className="animate-slide-up space-y-6 select-none">
      {/* Title */}
      <div className="mb-6">
        <h1 className="page-title text-[26px]">
          Product <span className="text-zinc-400 font-normal">overview</span>
        </h1>
        <p className="page-subtitle">Here&apos;s what&apos;s happening with your leads.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-[260px] bg-white rounded-[32px] animate-pulse" />
          <div className="h-[260px] bg-white rounded-[32px] animate-pulse" />
        </div>
      ) : (
        <>
          {/* Row 1: Overview & Snapshot */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col">
              {/* Massive rounded Overview Card */}
              <div className="card rounded-[32px] p-8 flex-1 flex flex-col justify-between">
                <div>
                  <h2 className="font-display font-bold text-zinc-900 mb-6 text-[18px]">
                    Overview
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-zinc-100">
                    {/* Column 1: Total Leads */}
                    <div className="flex flex-col justify-between h-full pb-6 md:pb-0">
                      <div>
                        <div className="w-11 h-11 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
                          <MessageSquare className="text-zinc-500" size={18} />
                        </div>
                        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Leads</div>
                        <div className="flex items-center gap-6 mt-2">
                          <div className="font-display font-bold text-[36px] text-zinc-900 tracking-tight leading-none">
                            {total}
                          </div>
                          {/* Sparkline */}
                          <svg className="w-24 h-10 text-emerald-500" viewBox="0 0 100 40" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M 0 30 Q 20 20 40 25 T 80 5 T 100 15" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      </div>
                      <div className="mt-6 flex items-center">
                        <span className="badge badge-green">↑ 12.4%</span>
                        <span className="text-xs text-zinc-400 ml-2 font-medium">vs last week</span>
                      </div>
                    </div>

                    {/* Column 2: Hot Leads */}
                    <div className="flex flex-col justify-between h-full pt-6 md:pt-0 md:pl-8">
                      <div>
                        <div className="w-11 h-11 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
                          <TrendingUp className="text-zinc-500" size={18} />
                        </div>
                        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Hot Leads</div>
                        <div className="flex items-center gap-6 mt-2">
                          <div className="font-display font-bold text-[36px] text-zinc-900 tracking-tight leading-none">
                            {segA}
                          </div>
                          {/* Sparkline */}
                          <svg className="w-24 h-10 text-amber-500" viewBox="0 0 100 40" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M 0 25 Q 15 35 35 20 T 70 10 T 100 5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      </div>
                      <div className="mt-6 flex items-center">
                        <span className="badge badge-green">↑ 36.8%</span>
                        <span className="text-xs text-zinc-400 ml-2 font-medium">high intent</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <TodaySnapshot overview={overview} />
            </div>
          </div>

          {/* Row 2: Secondary Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Performance Stats */}
            <div className="card rounded-[32px] p-8 flex flex-col justify-between">
              <div>
                <h2 className="font-display font-bold text-zinc-900 mb-6 text-[18px]">
                  Performance
                </h2>
                <div className="space-y-6">
                  <div>
                    <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Converted (7d)</div>
                    <div className="font-display font-bold text-[28px] text-zinc-900 mt-1">{overview?.converted_7d ?? 0}</div>
                  </div>
                  <div className="pt-4 border-t border-zinc-100">
                    <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Awaiting Response</div>
                    <div className={cn(
                      "font-display font-bold text-[28px] mt-1",
                      (overview?.unreplied_24h ?? 0) > 0 ? "text-rose-600" : "text-zinc-900"
                    )}>
                      {overview?.unreplied_24h ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Volume & Automation Share */}
            <div className="lg:col-span-2 card rounded-[32px] p-8">
              <h2 className="font-display font-bold text-zinc-900 mb-6 text-[18px]">
                Automation & Traffic
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-zinc-100">
                <div className="pb-6 md:pb-0">
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">AI Auto-Reply Share</div>
                  <div className="font-display font-bold text-[36px] text-zinc-900 tracking-tight mt-2">{aiPct}%</div>
                  <div className="text-xs text-zinc-400 mt-2 font-medium">
                    {aiVsHuman?.ai ?? 0} AI · {aiVsHuman?.human ?? 0} human (7d)
                  </div>
                </div>

                <div className="pt-6 md:pt-0 md:pl-8">
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Inquiries (7d)</div>
                  <div className="font-display font-bold text-[36px] text-zinc-900 tracking-tight mt-2">
                    {overview?.daily_leads?.reduce((acc, d) => acc + d.count, 0) ?? 0}
                  </div>
                  <div className="text-xs text-zinc-400 mt-2 font-medium">New leads added this week</div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Pipeline Activities */}
          <div className="grid grid-cols-1 gap-6">
            <PipelineBar by_segment={overview?.by_segment ?? { A: 0, B: 0, C: 0, D: 0 }} />
          </div>
        </>
      )}
    </div>
  );
}
