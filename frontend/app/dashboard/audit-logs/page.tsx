"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { RefreshCw, ExternalLink, Clock, User, Tag, Activity, AlertCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ActivityLogEntry = {
  time: string | null;
  user: string;
  category: string;
  activity: string;
};

type ActivityLogResponse = {
  logs: ActivityLogEntry[];
  paging: { cursors?: { after?: string; before?: string }; next?: string } | null;
  error: string | null;
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "Message template": { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  "Business profile": { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  "Phone number": { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  "Billing": { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  "Account": { bg: "bg-zinc-100", text: "text-zinc-700", dot: "bg-zinc-500" },
};

function getCategoryStyle(cat: string) {
  return CATEGORY_COLORS[cat] || { bg: "bg-zinc-100", text: "text-zinc-600", dot: "bg-zinc-400" };
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `${time} on ${date}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [afterCursor, setAfterCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchLogs = useCallback(async (cursor?: string, append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);

    try {
      const auth = await getAuthHeaders();
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.set("after", cursor);

      const res = await fetch(`${API_URL}/api/v1/insights/activity-log?${params}`, { headers: auth });
      if (!res.ok) {
        setError("Failed to fetch activity log.");
        return;
      }
      const json: ActivityLogResponse = await res.json();

      if (json.error) {
        setError(json.error);
        setLogs([]);
        return;
      }

      setError(null);
      if (append) {
        setLogs(prev => [...prev, ...json.logs]);
      } else {
        setLogs(json.logs);
        setLastSynced(new Date().toISOString());
      }

      const nextCursor = json.paging?.cursors?.after;
      setAfterCursor(nextCursor);
      setHasMore(!!json.paging?.next);

    } catch (e) {
      setError("Network error. Please try again.");
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  async function handleSync() {
    setSyncing(true);
    await fetchLogs(undefined, false);
    setSyncing(false);
    toast.success("Activity log refreshed from Meta");
  }

  function handleLoadMore() {
    if (afterCursor) fetchLogs(afterCursor, true);
  }

  const categories = Array.from(new Set(logs.map(l => l.category).filter(Boolean)));
  const filteredLogs = categoryFilter === "all"
    ? logs
    : logs.filter(l => l.category === categoryFilter);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-tertiary">Audit Logs</h1>
        <p className="font-body text-on-surface-muted mt-1">Track all activity across your Meta business account</p>
      </div>

      {/* Meta Activity Log Section */}
      <div className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15">
        {/* Section header */}
        <div className="px-6 py-4 border-b border-surface-mid">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Activity size={16} className="text-blue-600" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-on-surface">Meta Activity Log</h2>
                <p className="font-label text-[11px] text-on-surface-muted mt-0.5">
                  WhatsApp Business Manager · All account actions
                </p>
              </div>

              <a
                href="https://business.facebook.com/latest/whatsapp_manager/activity_log"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-surface-mid text-on-surface-muted hover:text-on-surface hover:bg-surface-low transition-colors font-label text-[11px]"
              >
                <ExternalLink size={11} />
                View on Meta
              </a>
            </div>

            <div className="flex items-center gap-2">
              {/* Category filter */}
              <div className="relative">
                <button
                  onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-label text-xs text-on-surface hover:bg-surface-mid transition-colors"
                >
                  <Tag size={11} />
                  {categoryFilter === "all" ? "All categories" : categoryFilter}
                  <ChevronDown size={11} />
                </button>
                {showCategoryDropdown && (
                  <div className="absolute top-full right-0 mt-1 z-50 w-52 bg-surface rounded-xl shadow-card ring-1 ring-[#c4c7c7]/20 py-1">
                    <button
                      onClick={() => { setCategoryFilter("all"); setShowCategoryDropdown(false); }}
                      className={cn("w-full text-left px-3 py-2 font-label text-xs hover:bg-surface-low transition-colors", categoryFilter === "all" ? "text-tertiary font-semibold" : "text-on-surface")}
                    >
                      All categories
                    </button>
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => { setCategoryFilter(cat); setShowCategoryDropdown(false); }}
                        className={cn("w-full text-left px-3 py-2 font-label text-xs hover:bg-surface-low transition-colors", categoryFilter === cat ? "text-tertiary font-semibold" : "text-on-surface")}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sync button */}
              <button
                onClick={handleSync}
                disabled={syncing || loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-label text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
              >
                <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Syncing…" : "Sync Meta"}
              </button>
            </div>
          </div>

          {lastSynced && (
            <p className="font-label text-[10px] text-on-surface-muted mt-3">
              Last synced: {timeAgo(lastSynced)} · Showing {filteredLogs.length} entries
            </p>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw size={24} className="text-on-surface-muted animate-spin" />
            <p className="font-body text-sm text-on-surface-muted">Fetching activity log from Meta…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle size={24} className="text-red-500" />
            </div>
            <div className="text-center">
              <p className="font-body text-sm font-semibold text-on-surface">Unable to load activity log</p>
              <p className="font-label text-xs text-on-surface-muted mt-1 max-w-md">{error}</p>
              {error.includes("credentials") && (
                <p className="font-label text-xs text-blue-600 mt-2">
                  Make sure <code className="bg-surface-low px-1 py-0.5 rounded">meta_access_token</code> and <code className="bg-surface-low px-1 py-0.5 rounded">meta_waba_id</code> are set in Settings.
                </p>
              )}
            </div>
            <button
              onClick={handleSync}
              className="mt-2 px-4 py-2 rounded-lg bg-tertiary text-white font-label text-xs font-semibold hover:bg-tertiary/90 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-surface-low flex items-center justify-center">
              <Activity size={24} className="text-on-surface-muted" />
            </div>
            <div className="text-center">
              <p className="font-body text-sm font-semibold text-on-surface">No activity found</p>
              <p className="font-label text-xs text-on-surface-muted mt-1">
                {categoryFilter !== "all" ? `No entries in category "${categoryFilter}"` : "Click Sync Meta to fetch your latest activity log"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-mid bg-surface-low/50">
                    <th className="px-6 py-3 text-left">
                      <div className="flex items-center gap-1.5 font-label text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider">
                        <Clock size={10} />
                        Time (Asia/Kolkata)
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <div className="flex items-center gap-1.5 font-label text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider">
                        <User size={10} />
                        User
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <div className="flex items-center gap-1.5 font-label text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider">
                        <Tag size={10} />
                        Category
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <div className="flex items-center gap-1.5 font-label text-[10px] font-semibold text-on-surface-muted uppercase tracking-wider">
                        <Activity size={10} />
                        Activity
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-mid/60">
                  {filteredLogs.map((entry, idx) => {
                    const catStyle = getCategoryStyle(entry.category);
                    return (
                      <tr key={idx} className="hover:bg-surface-low/40 transition-colors group">
                        {/* Time */}
                        <td className="px-6 py-3 whitespace-nowrap">
                          <span className="font-label text-xs text-on-surface">
                            {formatTime(entry.time)}
                          </span>
                        </td>

                        {/* User */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-[9px] flex-shrink-0">
                              {(entry.user || "?")[0].toUpperCase()}
                            </div>
                            <span className="font-label text-xs text-on-surface">{entry.user || "—"}</span>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {entry.category ? (
                            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label text-[10px] font-semibold", catStyle.bg, catStyle.text)}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", catStyle.dot)} />
                              {entry.category}
                            </span>
                          ) : (
                            <span className="font-label text-xs text-on-surface-muted">—</span>
                          )}
                        </td>

                        {/* Activity */}
                        <td className="px-4 py-3">
                          <span className="font-label text-xs text-on-surface leading-relaxed">
                            {entry.activity || "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="px-6 py-4 border-t border-surface-mid flex justify-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-low border border-surface-mid font-label text-xs text-on-surface hover:bg-surface-mid transition-colors disabled:opacity-50"
                >
                  {loadingMore ? <RefreshCw size={12} className="animate-spin" /> : <ChevronDown size={12} />}
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
