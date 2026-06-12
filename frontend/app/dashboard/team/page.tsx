"use client";
import { useEffect, useState, useMemo } from "react";
import {
  Trash2, UserPlus, Phone, Pencil, Check, X, Loader2, Activity, Users,
  TrendingUp, ClipboardList, LayoutGrid, List, Search, Calendar,
  Coffee, UserCircle, Clock, Target, BarChart3
} from "lucide-react";
import { api, TeamMember, Caller, TimelineEvent, CallLog } from "@/lib/api";
import { useAuthRole } from "../contexts/AuthRoleContext";
import { format, differenceInSeconds, subDays, startOfDay, isSameDay } from "date-fns";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

import AssignmentLog from "../telecalling/components/assignment-log";
import PerformanceView from "../telecalling/components/performance-view";
import AttendanceHeatmap from "./AttendanceHeatmap";

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

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "UN";
}

/* ──────────────────────────── InlineEditCell ──────────────────────────── */
function InlineEditCell({
  callerId,
  initial,
  field,
  placeholder,
  onUpdate
}: {
  callerId: string;
  initial: string | null;
  field: "name" | "phone" | "telecmi_agent_id";
  placeholder?: string;
  onUpdate?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.callers.update(callerId, { [field]: value.trim() || null });
      setEditing(false);
      onUpdate?.();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setValue(initial ?? ""); setEditing(false); }
          }}
          className="w-32 px-2 py-1 text-xs border border-border-subtle rounded-lg font-body focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={placeholder}
        />
        <button onClick={save} disabled={saving} className="p-1 rounded text-green-600 hover:bg-green-50">
          <Check size={13} />
        </button>
        <button onClick={() => { setValue(initial ?? ""); setEditing(false); }} className="p-1 rounded text-ink-muted hover:bg-surface-subtle">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 group" onClick={e => e.stopPropagation()}>
      <span className={`font-body text-sm ${value ? "text-ink" : "text-ink-muted"}`}>
        {value || "—"}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-subtle text-ink-muted transition-opacity"
      >
        <Pencil size={11} />
      </button>
    </div>
  );
}

/* ──────────────────────────── Profile Panel ──────────────────────────── */
function TeamProfilePanel({ callerId, callerName }: { callerId: string, callerName: string }) {
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        const [sumRes, timeRes, logsRes] = await Promise.all([
          api.callers.statusSummary(callerId),
          api.callers.getTimeline(callerId, date),
          api.callers.logs(callerId),
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
  }, [date, callerId]);

  const todayCallEvents = useMemo(() => timeline.filter((e) => e.type === "call"), [timeline]);
  const totalDurationSeconds = useMemo(() => callLogs.reduce((s, l) => s + (l.duration_seconds ?? 0), 0), [callLogs]);
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

  const dailyTrend = useMemo(() => {
    const days: { label: string; dateStr: string; calls: number; converted: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = subDays(now, i);
      days.push({ label: format(d, "MMM d"), dateStr: format(d, "yyyy-MM-dd"), calls: 0, converted: 0 });
    }
    callLogs.forEach((log) => {
      const logDate = startOfDay(new Date(log.created_at));
      const match = days.find((d) => isSameDay(new Date(d.dateStr), logDate));
      if (match) {
        match.calls++;
        if (log.outcome === "converted") match.converted++;
      }
    });
    return days;
  }, [callLogs]);

  const outcomeBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    callLogs.forEach((l) => {
      const key = l.outcome ?? "unknown";
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [callLogs]);
  const outcomeTotal = useMemo(() => Object.values(outcomeBreakdown).reduce((a, b) => a + b, 0), [outcomeBreakdown]);

  const timeDist = useMemo(() => {
    if (!summary) return { active: 0, breakPct: 0, idle: 0 };
    const total = summary.active_minutes_today + summary.break_minutes_today + summary.idle_minutes_today;
    if (total === 0) return { active: 0, breakPct: 0, idle: 0 };
    return {
      active: Math.round((summary.active_minutes_today / total) * 100),
      breakPct: Math.round((summary.break_minutes_today / total) * 100),
      idle: Math.round((summary.idle_minutes_today / total) * 100),
    };
  }, [summary]);

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
          currentEnd = new Date(new Date(current.started_at).getTime() + current.duration_seconds * 1000);
        } else {
          currentEnd = new Date(current.started_at);
        }
        const nextStart = new Date(next.started_at);
        const gapSeconds = differenceInSeconds(nextStart, currentEnd);
        if (gapSeconds > 120 && current.status !== "logged_out" && current.status !== "break") {
          result.push({ type: "idle", id: `gap-${i}`, started_at: currentEnd.toISOString(), duration_seconds: gapSeconds });
        }
      }
    }
    return result;
  }, [timeline]);

  const scoreRingPct = Math.min(avgScore / 10, 1);
  const RING_RADIUS = 30;
  const RING_CIRC = 2 * Math.PI * RING_RADIUS;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  const statusColor = summary?.current_status === "active" ? "bg-emerald-500"
    : summary?.current_status === "break" ? "bg-amber-500"
      : "bg-slate-400";
  const statusLabel = summary?.current_status === "active" ? "Active"
    : summary?.current_status === "break" ? "On Break"
      : "Offline";

  return (
    <div className="space-y-6 max-h-[calc(100vh-120px)] overflow-y-auto pr-2 pb-10 custom-scrollbar">
      {/* HEADER */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-display text-lg font-bold shadow-lg">
              {initials(callerName)}
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-white">{callerName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                <span className="text-xs text-slate-300 font-body">{statusLabel}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 relative">
            <svg width="70" height="70" viewBox="0 0 70 70" className="transform -rotate-90">
              <circle cx="35" cy="35" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
              <circle cx="35" cy="35" r={RING_RADIUS} fill="none"
                stroke={avgScore >= 7 ? "#10b981" : avgScore >= 4 ? "#f59e0b" : "#f43f5e"}
                strokeWidth="6" strokeLinecap="round" strokeDasharray={`${scoreRingPct * RING_CIRC} ${RING_CIRC}`}
                className="transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center mt-[-4px]">
               <span className="text-white font-display text-sm font-bold">{avgScore}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 text-xs text-slate-400 font-body">
          {summary?.first_login_at && (
            <span>Login: <span className="text-slate-200">{format(new Date(summary.first_login_at), "h:mm a")}</span></span>
          )}
          {summary?.last_logout_at && (
            <span>Logout: <span className="text-slate-200">{format(new Date(summary.last_logout_at), "h:mm a")}</span></span>
          )}
        </div>
      </div>

      {/* METRICS ROW */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Phone size={14} className="text-amber-600" />
            <span className="text-[11px] font-label text-amber-700">Calls Today</span>
          </div>
          <p className="font-display text-xl font-bold text-ink">{todayCallEvents.length}</p>
        </div>
        <div className="rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-orange-600" />
            <span className="text-[11px] font-label text-orange-700">Duration</span>
          </div>
          <p className="font-display text-xl font-bold text-ink">{formatDuration(totalDurationSeconds)}</p>
        </div>
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-rose-600" />
            <span className="text-[11px] font-label text-rose-700">Conversion</span>
          </div>
          <p className="font-display text-xl font-bold text-ink">{conversionRate}%</p>
        </div>
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target size={14} className="text-emerald-600" />
            <span className="text-[11px] font-label text-emerald-700">Avg Score</span>
          </div>
          <p className="font-display text-xl font-bold text-ink">{avgScore}</p>
        </div>
      </div>

      {/* ATTENDANCE */}
      <AttendanceHeatmap callerId={callerId} />

      {/* CHARTS */}
      <div className="grid grid-cols-1 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-amber-600" />
            <h3 className="font-display font-semibold text-ink text-xs">Calls vs Conversions — Last 14 Days</h3>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={dailyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#a1a1aa" }} interval={1} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e4e4e7" }} />
              <Line type="monotone" dataKey="calls" stroke="#f59e0b" strokeWidth={2} dot={false} name="Calls" />
              <Line type="monotone" dataKey="converted" stroke="#10b981" strokeWidth={2} dot={false} name="Converted" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={14} className="text-emerald-600" />
            <h3 className="font-display font-semibold text-ink text-xs">Outcome Breakdown</h3>
          </div>
          {outcomeTotal === 0 ? (
            <p className="text-center py-4 text-[11px] text-ink-muted font-body">No calls logged yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {Object.entries(outcomeBreakdown).map(([key, count]) => {
                const pct = Math.round((count / outcomeTotal) * 100);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-label text-ink-muted">{OUTCOME_LABELS[key] ?? key}</span>
                      <span className="text-[11px] font-label text-ink font-semibold">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-surface-subtle h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: OUTCOME_COLORS[key] ?? "#a78bfa" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* TIME DISTRIBUTION */}
      {summary && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-slate-500" />
            <h3 className="font-display font-semibold text-ink text-xs">Time Distribution</h3>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100">
            {timeDist.active > 0 && <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${timeDist.active}%` }} />}
            {timeDist.breakPct > 0 && <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${timeDist.breakPct}%` }} />}
            {timeDist.idle > 0 && <div className="h-full bg-slate-300 transition-all duration-500" style={{ width: `${timeDist.idle}%` }} />}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] font-label text-ink-muted">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Active: {timeDist.active}%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Break: {timeDist.breakPct}%
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" /> Idle: {timeDist.idle}%
            </span>
          </div>
        </div>
      )}

      {/* TIMELINE */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-primary" />
            <h3 className="font-display font-semibold text-ink text-xs">Activity</h3>
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input py-1 px-2 text-[11px] w-auto h-7" />
        </div>
        {eventsWithGaps.length === 0 ? (
          <div className="text-center py-6 text-[11px] text-ink-muted font-body">No activity logged.</div>
        ) : (
          <div className="relative border-l-2 border-border-subtle ml-3 space-y-5">
            {eventsWithGaps.map((ev) => {
              if (ev.type === "idle") {
                const gap = ev as GapEvent;
                return (
                  <div key={gap.id} className="relative pl-5 py-0.5">
                    <div className="absolute -left-[5px] top-2 w-2 h-2 rounded-full bg-slate-200 border-2 border-white" />
                    <p className="text-[10px] font-body text-ink-muted bg-surface-subtle inline-block px-2 py-1 rounded-md border border-dashed border-border-subtle">
                      Idle — {formatDuration(gap.duration_seconds)}
                    </p>
                  </div>
                );
              }
              const tev = ev as TimelineEvent;
              let Icon = UserCircle;
              let iconBg = "bg-gray-100 text-gray-500";
              let title = "Event";
              let details = "";
              if (tev.type === "status") {
                if (tev.status === "active") { Icon = UserCircle; iconBg = "bg-emerald-100 text-emerald-600"; title = "Active"; }
                else if (tev.status === "break") { Icon = Coffee; iconBg = "bg-amber-100 text-amber-600"; title = "Break"; }
                else if (tev.status === "logged_out") { Icon = UserCircle; iconBg = "bg-rose-100 text-rose-600"; title = "Logged Out"; }
              } else if (tev.type === "call") {
                Icon = Phone; iconBg = "bg-blue-100 text-blue-600";
                title = `Call with ${tev.lead_name ?? "Unknown"}`;
                details = [tev.duration_seconds != null ? `${formatDuration(tev.duration_seconds)}` : null, tev.outcome ? `${tev.outcome}` : null].filter(Boolean).join(" · ");
              }
              return (
                <div key={tev.id} className="relative pl-6">
                  <div className={`absolute -left-3.5 top-0 p-1.5 rounded-full ring-2 ring-white ${iconBg}`}>
                    <Icon size={12} />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <p className="font-label font-medium text-ink text-[11px]">{title}</p>
                      <span className="text-[9px] text-ink-muted font-body">{format(new Date(tev.started_at), "h:mm a")}</span>
                    </div>
                    {details && <p className="text-[10px] text-ink-muted font-body mt-0.5">{details}</p>}
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

/* ──────────────────────────── Main Page ──────────────────────────── */
export default function TeamPage() {
  const { role, loading: roleLoading } = useAuthRole();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [callers, setCallers] = useState<Caller[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"members" | "log" | "performance">("members");
  
  // controls
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "break" | "offline">("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // invite
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telecmiAgentId, setTelecmiAgentId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [teamRes, callersRes] = await Promise.all([
        api.team.list(),
        api.callers.list().catch(() => [])
      ]);
      setMembers(teamRes.data);
      setCallers(callersRes);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "owner") {
    return (
      <div className="text-center py-20">
        <p className="text-ink-muted font-body">This section is only available for owners/admins.</p>
      </div>
    );
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setInviting(true);
    setError(null);
    try {
      await api.team.invite(email.trim(), password.trim(), name.trim() || undefined, phone.trim() || undefined, telecmiAgentId.trim() || undefined);
      setEmail(""); setPassword(""); setName(""); setPhone(""); setTelecmiAgentId("");
      setShowInvite(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create telecaller");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member from your team?")) return;
    await api.team.remove(userId);
    if (selectedMemberId === userId) setSelectedMemberId(null);
    await load();
  }

  // merge members with caller status
  const mergedMembers = members.map(m => {
    const caller = m.caller_profile ? callers.find(c => c.id === m.caller_profile!.id) : null;
    let computedStatus = "offline";
    if (caller?.status === "active") computedStatus = "active";
    else if (caller?.status === "break") computedStatus = "break";
    
    return {
      ...m,
      computedStatus,
      displayName: m.caller_profile?.name || m.user_id.slice(0, 8),
    };
  });

  const filteredMembers = mergedMembers
    .filter(m => {
      if (statusFilter !== "all" && m.computedStatus !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!m.displayName.toLowerCase().includes(q) && 
            !m.caller_profile?.phone?.includes(q) && 
            !m.caller_profile?.telecmi_agent_id?.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));

  const selectedMember = mergedMembers.find(m => m.user_id === selectedMemberId);

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">Add and manage telecallers under your account.</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary">
          <UserPlus size={14} /> Add Telecaller
        </button>
      </div>

      {/* View tabs */}
      <div className="mb-6 flex border-b border-border-subtle">
        <button onClick={() => setTab("members")}
          className={`flex items-center gap-1.5 px-6 py-3 font-label font-semibold text-sm transition-all border-b-2 ${tab === "members" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"}`}>
          <Users size={14} /> Team Members
        </button>
        <button onClick={() => setTab("log")}
          className={`flex items-center gap-1.5 px-6 py-3 font-label font-semibold text-sm transition-all border-b-2 ${tab === "log" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"}`}>
          <ClipboardList size={14} /> Assignment Log
        </button>
        <button onClick={() => setTab("performance")}
          className={`flex items-center gap-1.5 px-6 py-3 font-label font-semibold text-sm transition-all border-b-2 ${tab === "performance" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"}`}>
          <TrendingUp size={14} /> Performance
        </button>
      </div>

      {tab === "log" ? (
        <AssignmentLog callers={callers} />
      ) : tab === "performance" ? (
        <PerformanceView callers={callers} />
      ) : (
      <>
      {showInvite && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-md p-6">
            <h2 className="font-display font-bold text-ink mb-4" style={{ fontSize: "1.05rem" }}>Add Telecaller</h2>
            {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 font-body text-sm">{error}</div>}
            <form onSubmit={handleInvite} className="space-y-3">
              <div><label className="font-body text-sm font-medium text-ink mb-1.5 block">Email *</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" placeholder="telecaller@example.com" /></div>
              <div><label className="font-body text-sm font-medium text-ink mb-1.5 block">Password *</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="input" placeholder="Set a password for them" /></div>
              <div><label className="font-body text-sm font-medium text-ink mb-1.5 block">Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ravi Kumar" /></div>
              <div><label className="font-body text-sm font-medium text-ink mb-1.5 block">Phone</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="+919876543210" /></div>
              <div><label className="font-body text-sm font-medium text-ink mb-1.5 block">TeleCMI Agent ID</label><input type="text" value={telecmiAgentId} onChange={(e) => setTelecmiAgentId(e.target.value)} className="input" placeholder="e.g. 102_33335739" /></div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowInvite(false); setError(null); }} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={inviting || !email.trim()} className="btn-primary flex-1">{inviting ? "Adding…" : "Add"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Layout Split */}
      <div className="flex flex-col lg:flex-row gap-6 relative">
        {/* Left Side: List/Grid */}
        <div className="w-full lg:w-[55%] flex-shrink-0 flex flex-col space-y-4">
          
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-border-subtle shadow-sm">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" size={16} />
              <input
                type="text"
                placeholder="Search team..."
                className="input !pl-10 h-10 w-full"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <select 
                className="input h-10 w-32" 
                value={statusFilter} 
                onChange={e => setStatusFilter(e.target.value as "all" | "active" | "break" | "offline")}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="break">On Break</option>
                <option value="offline">Offline</option>
              </select>
              <div className="flex bg-surface-subtle p-1 rounded-xl">
                <button 
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-white shadow-sm text-primary" : "text-ink-muted hover:text-ink"}`}
                >
                  <LayoutGrid size={16} />
                </button>
                <button 
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-primary" : "text-ink-muted hover:text-ink"}`}
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Render Members */}
          {loading ? (
            <div className="card p-8 text-center font-body text-sm text-ink-muted">Loading…</div>
          ) : filteredMembers.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="font-display font-bold text-ink mb-2">No team members found</p>
              <p className="font-body text-sm text-ink-muted">Adjust your filters or invite new members.</p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredMembers.map(m => (
                <div
                  key={m.user_id}
                  onClick={() => setSelectedMemberId(m.user_id)}
                  className={`card p-3 cursor-pointer transition-all border-2 ${selectedMemberId === m.user_id ? "border-primary bg-primary/5" : "border-transparent hover:border-primary/30"}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-display text-xs font-bold">
                          {initials(m.displayName)}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${m.computedStatus === 'active' ? 'bg-emerald-500' : m.computedStatus === 'break' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                      </div>
                      <div>
                        {m.caller_profile?.id ? (
                          <div className="font-label font-semibold text-ink text-xs">
                            <InlineEditCell callerId={m.caller_profile.id} initial={m.caller_profile.name ?? null} field="name" placeholder="Name" onUpdate={load} />
                          </div>
                        ) : (
                          <p className="font-label font-semibold text-ink text-xs">{m.displayName}</p>
                        )}
                        <span className={`mt-0.5 inline-block badge text-[9px] py-0 ${m.role === "owner" ? "badge-green" : "badge-yellow"}`}>
                          {m.role === "owner" ? "admin" : "caller"}
                        </span>
                      </div>
                    </div>
                    {m.role !== "owner" && (
                      <button onClick={(e) => { e.stopPropagation(); handleRemove(m.user_id); }} className="p-1 rounded-lg hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors" title="Remove Telecaller">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 mt-2">
                    <div className="flex items-center justify-between text-[11px] font-body">
                      <span className="text-ink-muted">Score</span>
                      <span className="font-semibold text-ink">{m.caller_profile?.overall_score ?? "—"}/10</span>
                    </div>
                    <div className="w-full bg-surface-subtle h-1 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(m.caller_profile?.overall_score || 0) * 10}%` }}
                      />
                    </div>
                    <div className="pt-1 flex items-center gap-1.5 text-[11px] font-body">
                      <Phone size={11} className="text-ink-muted" />
                      {m.caller_profile?.id ? (
                        <InlineEditCell callerId={m.caller_profile.id} initial={m.caller_profile.phone ?? null} field="phone" placeholder="+91xxxxxxxxxx" onUpdate={load} />
                      ) : <span className="text-ink-muted">—</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card rounded-3xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-subtle/50">
                    <th className="px-5 py-3 text-left stat-label">Telecaller</th>
                    <th className="px-5 py-3 text-left stat-label">Contact</th>
                    <th className="px-5 py-3 text-left stat-label">Status</th>
                    <th className="px-5 py-3 text-left stat-label">Role</th>
                    <th className="px-5 py-3 text-left stat-label">Score</th>
                    <th className="px-5 py-3 text-right stat-label">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredMembers.map((m) => (
                    <tr
                      key={m.user_id}
                      onClick={() => setSelectedMemberId(m.user_id)}
                      className={`cursor-pointer transition-colors ${selectedMemberId === m.user_id ? "bg-primary/5" : "hover:bg-surface-subtle"}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-display text-sm font-bold flex-shrink-0">
                            {initials(m.displayName)}
                          </div>
                          <div>
                            {m.caller_profile?.id ? (
                              <div className="font-label font-semibold text-ink text-sm">
                                <InlineEditCell callerId={m.caller_profile.id} initial={m.caller_profile.name ?? null} field="name" placeholder="Name" onUpdate={load} />
                              </div>
                            ) : (
                              <p className="font-label font-semibold text-ink text-sm">{m.displayName}</p>
                            )}
                            <p className="font-body text-[10px] text-ink-muted mt-0.5">{m.user_id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1 text-xs font-body">
                          <div className="flex items-center gap-1.5">
                            <Phone size={11} className="text-ink-muted" />
                            {m.caller_profile?.id ? (
                              <InlineEditCell callerId={m.caller_profile.id} initial={m.caller_profile.phone ?? null} field="phone" placeholder="+91xxxxxxxxxx" onUpdate={load} />
                            ) : <span className="text-ink-muted">—</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-label text-ink-muted bg-surface-subtle px-1 rounded">ID</span>
                            {m.caller_profile?.id ? (
                              <InlineEditCell callerId={m.caller_profile.id} initial={m.caller_profile.telecmi_agent_id ?? null} field="telecmi_agent_id" placeholder="e.g. 102_33335739" onUpdate={load} />
                            ) : <span className="text-ink-muted">—</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${m.computedStatus === 'active' ? 'bg-emerald-500' : m.computedStatus === 'break' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                          <span className="text-xs font-body text-ink capitalize">{m.computedStatus}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`badge ${m.role === "owner" ? "badge-green" : "badge-yellow"}`}>
                          {m.role === "owner" ? "admin" : "caller"}
                        </span>
                      </td>
                      <td className="px-5 py-4 w-32">
                        <div className="flex items-center justify-between text-xs font-body mb-1">
                          <span className="font-semibold text-ink">{m.caller_profile?.overall_score ?? "—"}/10</span>
                        </div>
                        <div className="w-full bg-surface-subtle h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${(m.caller_profile?.overall_score || 0) * 10}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4 flex items-center justify-end gap-2">
                        {m.role !== "owner" && (
                          <button onClick={(e) => { e.stopPropagation(); handleRemove(m.user_id); }} className="p-1.5 rounded-lg hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Side: Profile Panel */}
        <div className="w-full lg:w-[45%] flex-shrink-0 lg:sticky lg:top-6 lg:h-[calc(100vh-100px)]">
          {selectedMember ? (
            selectedMember.caller_profile?.id ? (
              <TeamProfilePanel 
                key={selectedMember.caller_profile.id} 
                callerId={selectedMember.caller_profile.id} 
                callerName={selectedMember.displayName} 
              />
            ) : (
              <div className="card p-12 text-center h-full flex flex-col justify-center items-center">
                <UserCircle size={48} className="text-ink-muted/30 mb-4" />
                <p className="font-display font-bold text-ink mb-2">No Caller Profile</p>
                <p className="font-body text-sm text-ink-muted">This user does not have a telecaller profile attached.</p>
              </div>
            )
          ) : (
            <div className="card p-12 text-center h-full flex flex-col justify-center items-center border-dashed border-2 bg-surface-subtle/30">
              <Users size={48} className="text-primary/20 mb-4" />
              <p className="font-display font-bold text-ink mb-2">Select a Team Member</p>
              <p className="font-body text-sm text-ink-muted">Click on a member from the list to view their detailed performance and activity.</p>
            </div>
          )}
        </div>

      </div>
      </>
      )}
    </div>
  );
}
