"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Phone,
  TrendingUp,
  Clock,
  Target,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  PhoneForwarded,
  Minus,
} from "lucide-react";
import { api } from "@/lib/api";
import type { CallerStats, CallLog } from "@/lib/api";

export default function ProfilePage() {
  const [stats, setStats] = useState<CallerStats | null>(null);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [tip, setTip] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const s = await api.callers.myStats();
      setStats(s);
      if (s.caller_id) {
        const logsRes = await api.callers.logs(s.caller_id);
        setLogs(logsRes);
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function loadTip() {
    if (!stats?.caller_id) return;
    setTipLoading(true);
    try {
      const res = await api.callers.coaching(stats.caller_id);
      setTip(res.tip);
    } catch (err) {
      setTip(err instanceof Error ? err.message : "Could not fetch tip");
    } finally {
      setTipLoading(false);
    }
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const outcomeIcon = (outcome: string | null) => {
    switch (outcome) {
      case "converted":
        return <CheckCircle2 size={14} className="text-green-500" />;
      case "not_interested":
        return <XCircle size={14} className="text-red-400" />;
      case "callback":
        return <PhoneForwarded size={14} className="text-amber-500" />;
      case "no_answer":
        return <Minus size={14} className="text-gray-400" />;
      default:
        return <Minus size={14} className="text-gray-300" />;
    }
  };

  const outcomeLabel = (outcome: string | null) => {
    switch (outcome) {
      case "converted":
        return "Converted";
      case "not_interested":
        return "Not interested";
      case "callback":
        return "Callback";
      case "no_answer":
        return "No answer";
      default:
        return "—";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-20">
        <p className="text-on-surface-muted font-body">
          Profile is only available for telecallers.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-tertiary">
          My Profile
        </h1>
        <p className="font-body text-on-surface-muted mt-1">
          Your performance at a glance
        </p>
      </div>

      {/* Profile Card + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Profile Card */}
        <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
              <span className="font-display text-2xl font-bold text-primary">
                {stats.name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase() || "?"}
              </span>
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-on-surface">
                {stats.name}
              </h2>
              <p className="font-label text-sm text-on-surface-muted">
                {stats.phone || "—"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`px-2 py-0.5 rounded-full font-label text-xs font-semibold ${
                    stats.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {stats.status === "active" ? "🟢 Active" : "🟡 On Break"}
                </span>
              </div>
            </div>
          </div>

          {/* Overall Score */}
          <div className="mt-4 pt-4 border-t border-surface-mid">
            <p className="font-label text-xs text-on-surface-muted uppercase tracking-wider mb-1">
              Performance Score
            </p>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold text-primary">
                {Number(stats.overall_score).toFixed(1)}
              </span>
              <span className="font-label text-sm text-on-surface-muted">
                / 10
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-xl bg-primary/10">
                <Phone size={16} className="text-primary" />
              </div>
            </div>
            <span className="font-display text-3xl font-bold text-on-surface">
              {stats.calls_today}
            </span>
            <span className="font-label text-xs text-on-surface-muted mt-1">
              Calls Today
            </span>
          </div>

          <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-xl bg-green-100">
                <Target size={16} className="text-green-600" />
              </div>
            </div>
            <span className="font-display text-3xl font-bold text-on-surface">
              {(stats.conversion_rate_week * 100).toFixed(0)}%
            </span>
            <span className="font-label text-xs text-on-surface-muted mt-1">
              Conv. Rate (Week)
            </span>
          </div>

          <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-xl bg-blue-100">
                <Clock size={16} className="text-blue-600" />
              </div>
            </div>
            <span className="font-display text-3xl font-bold text-on-surface">
              {stats.avg_duration_seconds
                ? formatDuration(stats.avg_duration_seconds)
                : "—"}
            </span>
            <span className="font-label text-xs text-on-surface-muted mt-1">
              Avg Duration
            </span>
          </div>

          <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-xl bg-red-100">
                <TrendingUp size={16} className="text-red-500" />
              </div>
            </div>
            <span className="font-display text-3xl font-bold text-on-surface">
              {stats.pending_hot_leads}
            </span>
            <span className="font-label text-xs text-on-surface-muted mt-1">
              Pending Hot Leads
            </span>
          </div>

          <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15 flex flex-col col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-xl bg-secondary/10">
                <Phone size={16} className="text-secondary" />
              </div>
            </div>
            <span className="font-display text-3xl font-bold text-on-surface">
              {stats.calls_this_week}
            </span>
            <span className="font-label text-xs text-on-surface-muted mt-1">
              Calls This Week
            </span>
          </div>
        </div>
      </div>

      {/* AI Coaching */}
      <div className="mb-8 bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-bold text-tertiary flex items-center gap-2">
            <Sparkles size={16} className="text-secondary" /> AI Coaching
          </h2>
          <button
            onClick={loadTip}
            disabled={tipLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-low rounded-lg font-label text-xs font-semibold hover:bg-surface-mid transition-colors disabled:opacity-40"
          >
            <RefreshCw
              size={12}
              className={tipLoading ? "animate-spin" : ""}
            />
            {tip ? "New Tip" : "Get Tip"}
          </button>
        </div>
        <div className="p-4 bg-surface-low rounded-xl min-h-[3rem]">
          <p className="font-body text-sm text-on-surface leading-relaxed">
            {tipLoading
              ? "Generating your personalized coaching tip…"
              : tip
                ? `💡 ${tip}`
                : "Click 'Get Tip' to receive a personalized coaching suggestion based on your recent call data."}
          </p>
        </div>
      </div>

      {/* Call History */}
      <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
        <h2 className="font-display text-base font-bold text-tertiary mb-4 flex items-center gap-2">
          <Phone size={16} className="text-secondary" /> Recent Call History
        </h2>

        {logs.length === 0 ? (
          <p className="font-body text-sm text-on-surface-muted py-8 text-center">
            No calls yet. Start calling your assigned leads!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-mid">
                  <th className="pb-3 font-label text-xs text-on-surface-muted uppercase tracking-wider">
                    Lead
                  </th>
                  <th className="pb-3 font-label text-xs text-on-surface-muted uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="pb-3 font-label text-xs text-on-surface-muted uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="pb-3 font-label text-xs text-on-surface-muted uppercase tracking-wider">
                    Outcome
                  </th>
                  <th className="pb-3 font-label text-xs text-on-surface-muted uppercase tracking-wider text-right">
                    When
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-low">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-low transition-colors">
                    <td className="py-3 pr-4">
                      <span className="font-body text-sm font-semibold text-on-surface">
                        {log.leads?.name || "Unknown"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-label text-xs text-on-surface-muted">
                        {log.leads?.phone || "—"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-label text-xs text-on-surface">
                        {formatDuration(log.duration_seconds)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="flex items-center gap-1.5 font-label text-xs">
                        {outcomeIcon(log.outcome)}
                        {outcomeLabel(log.outcome)}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className="font-label text-xs text-on-surface-muted">
                        {timeAgo(log.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
