"use client";
import { useEffect, useState, useMemo } from "react";
import {
  ArrowLeft,
  Loader2,
  Calendar,
  Phone,
  Coffee,
  UserCircle,
  Clock,
  TrendingUp,
  Target,
  BarChart3,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { api, TimelineEvent, CallLog } from "@/lib/api";
import { format, differenceInSeconds, subDays, startOfDay, isSameDay } from "date-fns";

/* ────────────────────────────── types ────────────────────────────── */

interface StatusSummary {
  active_minutes_today: number;
  break_minutes_today: number;
  idle_minutes_today: number;
  current_status: string;
  since: string;
  first_login_at: string | null;
  last_logout_at: string | null;
  breaks: { started_at: string; ended_at: string | null; duration_minutes: number }[];
  scheduled_count: number;
}

interface GapEvent {
  type: "idle";
  id: string;
  started_at: string;
  duration_seconds: number;
}

type DisplayEvent = TimelineEvent | GapEvent;

/* outcome colour palette */
const OUTCOME_COLORS: Record<string, string> = {
  converted: "#10b981",
  callback: "#f59e0b",
  not_interested: "#f43f5e",
  no_answer: "#94a3b8",
  do_not_call: "#7c3aed",
  do_not_contact: "#7c3aed",
  in_progress: "#6366f1",
};

const OUTCOME_LABELS: Record<string, string> = {
  converted: "Converted",
  callback: "Callback",
  not_interested: "Not Interested",
  no_answer: "No Answer",
  do_not_call: "DNC",
  do_not_contact: "DNC",
  in_progress: "In Progress",
};

/* ──────────────────────────── helpers ──────────────────────────── */

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ──────────────────────────── component ──────────────────────────── */

export default function TelecallerProfilePage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);

  /* ── data loading ── */
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        const [sumRes, timeRes, logsRes] = await Promise.all([
          api.callers.statusSummary(params.id),
          api.callers.getTimeline(params.id, date),
          api.callers.logs(params.id),
        ]);
        if (cancelled) return;
        setSummary(sumRes);
        setTimeline(timeRes.data);
        setCallLogs(logsRes);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [date, params.id]);

  /* ── derived metrics ── */
  const todayCallEvents = useMemo(
    () => timeline.filter((e) => e.type === "call"),
    [timeline],
  );

  const totalDurationSeconds = useMemo(
    () => callLogs.reduce((s, l) => s + (l.duration_seconds ?? 0), 0),
    [callLogs],
  );

  const conversionRate = useMemo(() => {
    if (callLogs.length === 0) return 0;
    const converted = callLogs.filter((l) => l.outcome === "converted").length;
    return Math.round((converted / callLogs.length) * 100);
  }, [callLogs]);

  const avgScore = useMemo(() => {
    const scored = callLogs.filter((l) => l.score !== null);
    if (scored.length === 0) return 0;
    return +(scored.reduce((s, l) => s + (l.score ?? 0), 0) / scored.length).toFixed(1);
  }, [callLogs]);

  /* ── weekly bar chart data ── */
  const weeklyData = useMemo(() => {
    const days: { label: string; count: number; dateStr: string }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = subDays(now, i);
      days.push({
        label: DAY_LABELS[d.getDay()],
        dateStr: format(d, "yyyy-MM-dd"),
        count: 0,
      });
    }
    callLogs.forEach((log) => {
      const logDate = startOfDay(new Date(log.created_at));
      const match = days.find((d) => isSameDay(new Date(d.dateStr), logDate));
      if (match) match.count++;
    });
    return days;
  }, [callLogs]);

  const maxWeekly = useMemo(() => Math.max(...weeklyData.map((d) => d.count), 1), [weeklyData]);

  /* ── outcome breakdown ── */
  const outcomeBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    callLogs.forEach((l) => {
      const key = l.outcome ?? "unknown";
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [callLogs]);

  const outcomeTotal = useMemo(
    () => Object.values(outcomeBreakdown).reduce((a, b) => a + b, 0),
    [outcomeBreakdown],
  );

  const conicGradient = useMemo(() => {
    if (outcomeTotal === 0) return "conic-gradient(#e2e8f0 0% 100%)";
    const entries = Object.entries(outcomeBreakdown);
    const segments: string[] = [];
    let cumulative = 0;
    entries.forEach(([key, count]) => {
      const pct = (count / outcomeTotal) * 100;
      const color = OUTCOME_COLORS[key] ?? "#a78bfa";
      segments.push(`${color} ${cumulative}% ${cumulative + pct}%`);
      cumulative += pct;
    });
    return `conic-gradient(${segments.join(", ")})`;
  }, [outcomeBreakdown, outcomeTotal]);

  /* ── time distribution ── */
  const timeDist = useMemo(() => {
    if (!summary) return { active: 0, breakPct: 0, idle: 0 };
    const total =
      summary.active_minutes_today + summary.break_minutes_today + summary.idle_minutes_today;
    if (total === 0) return { active: 0, breakPct: 0, idle: 0 };
    return {
      active: Math.round((summary.active_minutes_today / total) * 100),
      breakPct: Math.round((summary.break_minutes_today / total) * 100),
      idle: Math.round((summary.idle_minutes_today / total) * 100),
    };
  }, [summary]);

  /* ── timeline with idle gaps ── */
  const eventsWithGaps = useMemo<DisplayEvent[]>(() => {
    const result: DisplayEvent[] = [];
    for (let i = 0; i < timeline.length; i++) {
      result.push(timeline[i]);
      if (i < timeline.length - 1) {
        const current = timeline[i];
        const next = timeline[i + 1];
        let currentEnd: Date;
        if (current.type === "status" && current.ended_at) {
          currentEnd = new Date(current.ended_at);
        } else if (current.type === "call" && current.duration_seconds) {
          currentEnd = new Date(
            new Date(current.started_at).getTime() + current.duration_seconds * 1000,
          );
        } else {
          currentEnd = new Date(current.started_at);
        }
        const nextStart = new Date(next.started_at);
        const gapSeconds = differenceInSeconds(nextStart, currentEnd);
        if (gapSeconds > 120 && current.status !== "logged_out" && current.status !== "break") {
          result.push({
            type: "idle" as const,
            id: `gap-${i}`,
            started_at: currentEnd.toISOString(),
            duration_seconds: gapSeconds,
          });
        }
      }
    }
    return result;
  }, [timeline]);

  /* ── overall score (from avgScore 0-10) ── */
  const scoreRingPct = Math.min(avgScore / 10, 1);
  const RING_RADIUS = 40;
  const RING_CIRC = 2 * Math.PI * RING_RADIUS;

  /* ────────────────────────────── render ────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const statusColor =
    summary?.current_status === "active"
      ? "bg-emerald-500"
      : summary?.current_status === "break"
        ? "bg-amber-500"
        : "bg-slate-400";

  const statusLabel =
    summary?.current_status === "active"
      ? "Active"
      : summary?.current_status === "break"
        ? "On Break"
        : "Logged Out";

  const callerName = `Caller ${params.id.slice(0, 6)}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── back + title ── */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/team"
          className="p-2 rounded-xl hover:bg-surface-subtle text-ink-muted transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="page-title">Telecaller Profile</h1>
          <p className="page-subtitle">
            Performance overview and activity details.
          </p>
        </div>
      </div>

      {/* ═══════════ 1. PROFILE HEADER ═══════════ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          {/* left: avatar + info */}
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-display text-xl font-bold shadow-lg">
              {initials(callerName)}
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white">{callerName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
                <span className="text-sm text-slate-300 font-body">{statusLabel}</span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-slate-400 font-body">
                {summary?.first_login_at && (
                  <span>
                    First Login:{" "}
                    <span className="text-slate-200">
                      {format(new Date(summary.first_login_at), "h:mm a")}
                    </span>
                  </span>
                )}
                {summary?.last_logout_at && (
                  <span>
                    Last Logout:{" "}
                    <span className="text-slate-200">
                      {format(new Date(summary.last_logout_at), "h:mm a")}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* right: score ring */}
          <div className="flex flex-col items-center gap-1">
            <svg width="100" height="100" viewBox="0 0 100 100" className="transform -rotate-90">
              <circle
                cx="50"
                cy="50"
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r={RING_RADIUS}
                fill="none"
                stroke={avgScore >= 7 ? "#10b981" : avgScore >= 4 ? "#f59e0b" : "#f43f5e"}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${scoreRingPct * RING_CIRC} ${RING_CIRC}`}
                className="transition-all duration-700"
              />
            </svg>
            <span className="absolute text-white font-display text-lg font-bold" style={{ marginTop: 34 }}>
              {avgScore}
            </span>
            <span className="text-[11px] text-slate-400 font-label mt-0.5">Avg Score</span>
          </div>
        </div>
      </div>

      {/* ═══════════ 2. METRICS ROW ═══════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Calls Today */}
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Phone size={16} className="text-amber-600" />
            <span className="text-xs font-label text-amber-700 dark:text-amber-400">Calls Today</span>
          </div>
          <p className="font-display text-2xl font-bold text-ink">{todayCallEvents.length}</p>
        </div>
        {/* Total Duration */}
        <div className="rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-orange-600" />
            <span className="text-xs font-label text-orange-700 dark:text-orange-400">Total Duration</span>
          </div>
          <p className="font-display text-2xl font-bold text-ink">{formatDuration(totalDurationSeconds)}</p>
        </div>
        {/* Conversion Rate */}
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-rose-600" />
            <span className="text-xs font-label text-rose-700 dark:text-rose-400">Conversion Rate</span>
          </div>
          <p className="font-display text-2xl font-bold text-ink">{conversionRate}%</p>
        </div>
        {/* Avg Score */}
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Target size={16} className="text-emerald-600" />
            <span className="text-xs font-label text-emerald-700 dark:text-emerald-400">Avg Score</span>
          </div>
          <p className="font-display text-2xl font-bold text-ink">{avgScore}</p>
        </div>
      </div>

      {/* ═══════════ 3 + 4. CHARTS ROW ═══════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── 3. Weekly Bar Chart ── */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 size={16} className="text-amber-600" />
            <h3 className="font-display font-semibold text-ink text-sm">
              Call Volume — Last 7 Days
            </h3>
          </div>
          <div className="flex items-end justify-between gap-2 h-40">
            {weeklyData.map((d) => (
              <div key={d.dateStr} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-label text-ink-muted">{d.count || ""}</span>
                <div className="w-full flex justify-center">
                  <div
                    className="w-7 rounded-t-md transition-all duration-500"
                    style={{
                      height: d.count > 0 ? `${(d.count / maxWeekly) * 120}px` : "4px",
                      background:
                        d.count > 0
                          ? "linear-gradient(to top, #f59e0b, #f97316)"
                          : "#e2e8f0",
                    }}
                  />
                </div>
                <span className="text-[10px] font-label text-ink-muted mt-1">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 4. Outcome Donut ── */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Activity size={16} className="text-emerald-600" />
            <h3 className="font-display font-semibold text-ink text-sm">Outcome Breakdown</h3>
          </div>
          <div className="flex flex-col items-center gap-4">
            {/* donut */}
            <div className="relative w-36 h-36">
              <div
                className="w-full h-full rounded-full"
                style={{ background: conicGradient }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center shadow-inner">
                  <span className="font-display text-lg font-bold text-ink">{outcomeTotal}</span>
                </div>
              </div>
            </div>
            {/* legend */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
              {Object.entries(outcomeBreakdown).map(([key, count]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: OUTCOME_COLORS[key] ?? "#a78bfa" }}
                  />
                  <span className="text-[11px] font-label text-ink-muted">
                    {OUTCOME_LABELS[key] ?? key} ({count})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ 5. TIME DISTRIBUTION ═══════════ */}
      {summary && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-slate-500" />
            <h3 className="font-display font-semibold text-ink text-sm">Time Distribution</h3>
          </div>
          <div className="w-full h-5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
            {timeDist.active > 0 && (
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${timeDist.active}%` }}
              />
            )}
            {timeDist.breakPct > 0 && (
              <div
                className="h-full bg-amber-400 transition-all duration-500"
                style={{ width: `${timeDist.breakPct}%` }}
              />
            )}
            {timeDist.idle > 0 && (
              <div
                className="h-full bg-slate-300 dark:bg-slate-600 transition-all duration-500"
                style={{ width: `${timeDist.idle}%` }}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs font-label text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              Active — {formatMinutes(summary.active_minutes_today)} ({timeDist.active}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
              Break — {formatMinutes(summary.break_minutes_today)} ({timeDist.breakPct}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" />
              Idle — {formatMinutes(summary.idle_minutes_today)} ({timeDist.idle}%)
            </span>
          </div>
        </div>
      )}

      {/* ═══════════ 6. ACTIVITY TIMELINE ═══════════ */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-primary" />
            <h3 className="font-display font-semibold text-ink text-sm">Activity Timeline</h3>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input py-1.5 text-sm w-auto"
          />
        </div>

        {eventsWithGaps.length === 0 ? (
          <div className="text-center py-12 text-ink-muted font-body">
            No activity logged for this date.
          </div>
        ) : (
          <div className="relative border-l-2 border-border-subtle ml-4 space-y-7">
            {eventsWithGaps.map((ev) => {
              /* ── Idle gap ── */
              if (ev.type === "idle") {
                const gap = ev as GapEvent;
                return (
                  <div key={gap.id} className="relative pl-7 py-1">
                    <div className="absolute -left-[5px] top-3 w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900" />
                    <p className="text-xs font-body text-ink-muted bg-surface-subtle inline-block px-3 py-1.5 rounded-full border border-dashed border-border-subtle">
                      Idle — {formatDuration(gap.duration_seconds)}
                    </p>
                  </div>
                );
              }

              /* ── Status or Call event ── */
              const tev = ev as TimelineEvent;
              let Icon = UserCircle;
              let iconBg = "bg-gray-100 text-gray-500";
              let title = "Event";
              let details = "";

              if (tev.type === "status") {
                if (tev.status === "active") {
                  Icon = UserCircle;
                  iconBg = "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400";
                  title = "Logged In & Active";
                } else if (tev.status === "break") {
                  Icon = Coffee;
                  iconBg = "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400";
                  title = "Went on Break";
                } else if (tev.status === "logged_out") {
                  Icon = UserCircle;
                  iconBg = "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400";
                  title = "Logged Out";
                }
              } else if (tev.type === "call") {
                Icon = Phone;
                iconBg = "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400";
                title = `Call with ${tev.lead_name ?? "Unknown"}`;
                details = [
                  tev.duration_seconds != null ? `Duration: ${formatDuration(tev.duration_seconds)}` : null,
                  tev.outcome ? `Outcome: ${tev.outcome}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
              }

              return (
                <div key={tev.id} className="relative pl-9">
                  <div
                    className={`absolute -left-4 top-0.5 p-2 rounded-full ring-4 ring-white dark:ring-slate-900 ${iconBg} shadow-sm`}
                  >
                    <Icon size={15} />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <p className="font-label font-medium text-ink text-sm">{title}</p>
                      <span className="text-xs text-ink-muted font-body">
                        {format(new Date(tev.started_at), "h:mm a")}
                      </span>
                    </div>
                    {details && (
                      <p className="text-xs text-ink-muted font-body mt-0.5">{details}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
