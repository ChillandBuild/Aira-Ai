"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Phone, TrendingUp, Users, Coffee, Clock, Eye, X, Check,
  Calendar, Download, ChevronUp, ChevronDown,
  Loader2, Search, Award, BarChart2, ShieldAlert, Trash2, Pencil
} from "lucide-react";
import { eachDayOfInterval, format } from "date-fns";
import { api, Caller, CallLog, TimelineEvent, Lead, TelecallingAnalyticsExtended } from "@/lib/api";
import TeamAttendanceGrid from "../../team/TeamAttendanceGrid";
import { formatPhone, timeAgo, formatIST } from "@/lib/utils";
import { fetchNotes } from "../lib/notes-api";
import type { NotesResponse, Note } from "../types";

export default function PerformanceView({ callers }: { callers: Caller[] }) {
  // Stats & Callers state
  const [stats, setStats] = useState<TelecallingAnalyticsExtended | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [callersList, setCallersList] = useState<Caller[]>(callers);
  const [selectedCallerId, setSelectedCallerId] = useState<string | null>(null);

  // Daily Target inline editing state
  const [editingTarget, setEditingTarget] = useState<Record<string, number>>({});
  const [updatingTargetId, setUpdatingTargetId] = useState<string | null>(null);

  // Sorting state for table
  const [sortField, setSortField] = useState<
    "name" | "calls_today" | "connect_rate" | "avg_talk_seconds" | "idle_minutes_today" | "quality_avg"
  >("calls_today");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Timeline state
  const [selectedCallerForTimeline, setSelectedCallerForTimeline] = useState<string>("");
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [timelineFrom, setTimelineFrom] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [timelineTo, setTimelineTo] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Overall stats date-range filter state
  const [statsFrom, setStatsFrom] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [statsTo, setStatsTo] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Inline editing state for TeleCMI Agent ID on Live Agent Status cards
  const [editingAgentIdFor, setEditingAgentIdFor] = useState<string | null>(null);
  const [agentIdInputValue, setAgentIdInputValue] = useState<string>("");
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);

  // QA Queue state
  const [qaQueue, setQaQueue] = useState<CallLog[]>([]);
  const [loadingQa, setLoadingQa] = useState(true);

  // Bulk Assignment state
  const [leadList, setLeadList] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkAssigneeId, setBulkAssigneeId] = useState<string>("");
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState("");

  // CSV Export state
  const [exportSince, setExportSince] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [exportUntil, setExportUntil] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [exporting, setExporting] = useState(false);

  // Lead Profile Modal state
  const [viewingLeadId, setViewingLeadId] = useState<string | null>(null);
  const [viewingLead, setViewingLead] = useState<Lead | null>(null);
  const [viewingLeadNotes, setViewingLeadNotes] = useState<NotesResponse | null>(null);
  const [viewingLeadLoading, setViewingLeadLoading] = useState(false);

  // Fetch performance metrics
  const loadPerformanceStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const data = await api.analytics.telecallingExtended({ from: statsFrom, to: statsTo });
      setStats(data);
    } catch (err) {
      console.error("Failed to load telecalling extended stats:", err);
      toast.error("Failed to load performance metrics");
    } finally {
      setLoadingStats(false);
    }
  }, [statsFrom, statsTo]);

  // Fetch callers
  const loadCallers = useCallback(async () => {
    try {
      const data = await api.callers.list();
      setCallersList(data);
      if (data.length > 0 && !selectedCallerForTimeline) {
        setSelectedCallerForTimeline(data[0].id);
      }
    } catch (err) {
      console.error("Failed to load callers:", err);
    }
  }, [selectedCallerForTimeline]);

  // Fetch QA Queue
  const loadQaQueue = useCallback(async () => {
    setLoadingQa(true);
    try {
      const res = await api.analytics.qaQueue(10);
      setQaQueue(res.data || []);
    } catch (err) {
      console.error("Failed to load QA queue:", err);
    } finally {
      setLoadingQa(false);
    }
  }, []);

  // Fetch Leads for Assignment
  const loadLeadsForAssign = useCallback(async () => {
    setLoadingLeads(true);
    try {
      // List leads, showing up to 50
      const res = await api.leads.list({ limit: 50 });
      setLeadList(res);
    } catch (err) {
      console.error("Failed to load leads for assignment:", err);
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  // Fetch timeline events for selected caller across a date range
  const loadTimelineEvents = useCallback(async () => {
    if (!selectedCallerForTimeline) return;
    setLoadingTimeline(true);
    try {
      let fromDate = new Date(timelineFrom);
      let toDate = new Date(timelineTo);

      // Cap the range at 31 days to avoid excessive requests
      const maxDays = 31;
      const dayMs = 24 * 60 * 60 * 1000;
      if ((toDate.getTime() - fromDate.getTime()) / dayMs > maxDays - 1) {
        fromDate = new Date(toDate.getTime() - (maxDays - 1) * dayMs);
      }

      const days = fromDate.getTime() <= toDate.getTime()
        ? eachDayOfInterval({ start: fromDate, end: toDate })
        : [toDate];

      const results = await Promise.all(
        days.map((d) => api.analytics.callerTimeline(selectedCallerForTimeline, format(d, "yyyy-MM-dd")))
      );

      const allEvents = results.flatMap((res) => res.data || []);
      setTimelineEvents(allEvents);
    } catch (err) {
      console.error("Failed to load timeline events:", err);
      setTimelineEvents([]);
    } finally {
      setLoadingTimeline(false);
    }
  }, [selectedCallerForTimeline, timelineFrom, timelineTo]);

  // Load initial data
  useEffect(() => {
    loadPerformanceStats();
    loadCallers();
    loadQaQueue();
    loadLeadsForAssign();
  }, [loadPerformanceStats, loadCallers, loadQaQueue, loadLeadsForAssign, statsFrom, statsTo]);

  // Refetch timeline when selected agent or date changes
  useEffect(() => {
    loadTimelineEvents();
  }, [loadTimelineEvents]);

  // Sync timeline dropdown to newly selected caller (without locking it)
  useEffect(() => {
    if (selectedCallerId) {
      setSelectedCallerForTimeline(selectedCallerId);
    }
  }, [selectedCallerId]);

  // Fetch full details for the viewing lead modal
  useEffect(() => {
    if (!viewingLeadId) {
      setViewingLead(null);
      setViewingLeadNotes(null);
      return;
    }
    setViewingLeadLoading(true);

    Promise.all([
      api.leads.get(viewingLeadId),
      fetchNotes(viewingLeadId).catch(() => ({ pinned: [], notes: [] }))
    ])
      .then(([leadData, notesData]) => {
        setViewingLead(leadData);
        setViewingLeadNotes(notesData);
      })
      .catch((err) => {
        toast.error("Failed to load lead profile");
        console.error(err);
      })
      .finally(() => {
        setViewingLeadLoading(false);
      });
  }, [viewingLeadId]);

  // Daily target inline update function
  const handleUpdateTarget = async (callerId: string) => {
    const targetVal = editingTarget[callerId];
    if (targetVal === undefined) return;
    setUpdatingTargetId(callerId);
    try {
      await api.callers.updateTarget(callerId, targetVal);
      toast.success("Daily target updated successfully");
      
      // Update local callers list target
      setCallersList(prev =>
        prev.map(c => c.id === callerId ? { ...c, target: targetVal } : c)
      );
      
      // Clear editing state for this caller
      const nextEditing = { ...editingTarget };
      delete nextEditing[callerId];
      setEditingTarget(nextEditing);
    } catch (err) {
      console.error("Failed to update target:", err);
      toast.error("Failed to update target");
    } finally {
      setUpdatingTargetId(null);
    }
  };

  // Remove a caller
  const handleRemoveCaller = async (callerId: string, callerName: string) => {
    if (!confirm(`Remove ${callerName}?`)) return;
    try {
      await api.callers.remove(callerId);
      toast.success(`${callerName} removed`);
      await loadCallers();
      if (selectedCallerId === callerId) {
        setSelectedCallerId(null);
      }
    } catch (err) {
      console.error("Failed to remove caller:", err);
      toast.error("Failed to remove caller");
    }
  };

  // Save edited TeleCMI Agent ID for a caller
  const handleSaveAgentId = async (callerId: string) => {
    setSavingAgentId(callerId);
    try {
      const trimmed = agentIdInputValue.trim();
      const updated = await api.callers.update(callerId, { telecmi_agent_id: trimmed || null });
      setCallersList(prev =>
        prev.map(c => c.id === callerId ? { ...c, telecmi_agent_id: updated.telecmi_agent_id } : c)
      );
      setEditingAgentIdFor(null);
      setAgentIdInputValue("");
    } catch (err) {
      console.error("Failed to update TeleCMI agent ID:", err);
      toast.error("Failed to update TeleCMI agent ID");
    } finally {
      setSavingAgentId(null);
    }
  };

  // CSV Exporter function
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      await api.analytics.exportTelecallingCsv(exportSince, exportUntil);
      toast.success("CSV download started");
    } catch (err) {
      console.error("Failed to export telecalling CSV:", err);
      toast.error("Failed to export CSV report");
    } finally {
      setExporting(false);
    }
  };

  // Bulk assign function
  const handleBulkAssign = async () => {
    if (selectedLeadIds.length === 0 || !bulkAssigneeId) return;
    setBulkAssigning(true);
    try {
      const res = await api.leads.bulkAssign(selectedLeadIds, bulkAssigneeId);
      toast.success(`Successfully assigned ${res.updated || selectedLeadIds.length} leads`);
      setSelectedLeadIds([]);
      setBulkAssigneeId("");
      loadLeadsForAssign();
    } catch (err) {
      console.error("Failed bulk assign:", err);
      toast.error("Failed to bulk assign leads");
    } finally {
      setBulkAssigning(false);
    }
  };

  // Toggle single lead selection
  const toggleSelectLead = (leadId: string) => {
    setSelectedLeadIds(prev =>
      prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
    );
  };

  // Toggle all visible leads selection
  const filteredLeads = leadList.filter(l => {
    if (!leadSearchQuery) return true;
    const q = leadSearchQuery.toLowerCase();
    return (
      (l.name && l.name.toLowerCase().includes(q)) ||
      (l.phone && l.phone.includes(q)) ||
      (l.segment && l.segment.toLowerCase().includes(q))
    );
  });

  const toggleSelectAllLeads = () => {
    const visibleIds = filteredLeads.map(l => l.id);
    const allSelected = visibleIds.every(id => selectedLeadIds.includes(id));
    if (allSelected) {
      setSelectedLeadIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedLeadIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Sorting logic helper
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Process data for the Performance table
  const getSortedPerformers = () => {
    if (!stats || !stats.per_caller) return [];

    return [...stats.per_caller].sort((a, b) => {
      let valA: string | number = 0;
      let valB: string | number = 0;

      if (sortField === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === "calls_today") {
        valA = a.calls_today || 0;
        valB = b.calls_today || 0;
      } else if (sortField === "connect_rate") {
        valA = a.connect_rate || 0;
        valB = b.connect_rate || 0;
      } else if (sortField === "avg_talk_seconds") {
        valA = a.avg_talk_seconds || 0;
        valB = b.avg_talk_seconds || 0;
      } else if (sortField === "idle_minutes_today") {
        valA = a.idle_minutes_today || 0;
        valB = b.idle_minutes_today || 0;
      } else if (sortField === "quality_avg") {
        valA = a.quality_avg || 0;
        valB = b.quality_avg || 0;
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  };

  // Selection derived state
  const selectedCaller = callersList.find(c => c.id === selectedCallerId) ?? null;
  const selectedCallerName = selectedCaller?.name;
  const callerStats = stats?.per_caller?.find(p => p.caller_id === selectedCallerId);

  // Live Agent Status calculations
  const totalAgentsCount = callersList.length;
  const breakAgents = callersList.filter(c => c.status === "break");
  const activeAgents = callersList.filter(c => (c.status || "active") === "active");
  const offlineAgents = callersList.filter(c => c.status === "logged_out");
  
  // Timeline calculations
  const startHour = 9;
  const endHour = 19;
  const totalSeconds = (endHour - startHour) * 3600;

  const getEventStyle = (event: TimelineEvent) => {
    try {
      const eventDate = new Date(event.started_at);
      const dayStart = new Date(eventDate);
      dayStart.setHours(startHour, 0, 0, 0);

      const startMs = eventDate.getTime();
      const baseMs = dayStart.getTime();

      const offsetSeconds = (startMs - baseMs) / 1000;
      const durationSeconds = event.ended_at
        ? (new Date(event.ended_at).getTime() - startMs) / 1000
        : (event.duration_seconds || 60);

      const left = Math.max(0, Math.min(100, (offsetSeconds / totalSeconds) * 100));
      const width = Math.max(0.5, Math.min(100 - left, (durationSeconds / totalSeconds) * 100));

      return { left: `${left}%`, width: `${width}%` };
    } catch {
      return { left: "0%", width: "0%" };
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Live Agent Status Strip */}
      <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h2 className="font-display text-sm font-bold text-tertiary flex items-center gap-2">
            <Users size={16} className="text-primary" /> Live Agent Status
          </h2>
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
            <span className="font-label text-[10px] text-slate-500 font-bold uppercase pl-1">Range:</span>
            <input
              type="date"
              value={statsFrom}
              onChange={(e) => setStatsFrom(e.target.value)}
              className="px-2 py-1 rounded bg-white border border-slate-200 font-body text-xs text-slate-800 focus:outline-none"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={statsTo}
              onChange={(e) => setStatsTo(e.target.value)}
              className="px-2 py-1 rounded bg-white border border-slate-200 font-body text-xs text-slate-800 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <span className="font-bold text-slate-700">{totalAgentsCount} Total</span>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="font-bold">{activeAgents.length} Ready</span>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 bg-amber-500 rounded-full" />
            <span className="font-bold">{breakAgents.length} On Break</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 bg-slate-400 rounded-full" />
            <span className="font-bold">{offlineAgents.length} Offline</span>
          </div>
        </div>

        {/* Status list details */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
          {callersList.map(c => {
            const st = c.status || "active";
            const statusColor = st === "active" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : st === "break" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-slate-500 bg-slate-100 border-slate-200";
            const isSelected = selectedCallerId === c.id;
            return (
              <div
                key={c.id}
                onClick={() => setSelectedCallerId(prev => prev === c.id ? null : c.id)}
                className={`relative flex items-center justify-between p-2.5 bg-surface-low rounded-xl border text-xs cursor-pointer transition-all ${
                  isSelected ? "ring-2 ring-primary border-primary/40 bg-primary/5" : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveCaller(c.id, c.name);
                  }}
                  className="absolute top-1 right-1 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  title={`Remove ${c.name}`}
                >
                  <Trash2 size={11} />
                </button>
                <div className="truncate pr-5">
                  <span className="font-bold text-slate-800">{c.name}</span>
                  {c.status_changed_at && (
                    <span className="block text-[10px] text-slate-400 font-medium">Since {timeAgo(c.status_changed_at)}</span>
                  )}
                  <span className="block text-xs text-slate-500 mt-0.5">{c.phone || "—"}</span>
                  {editingAgentIdFor === c.id ? (
                    <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={agentIdInputValue}
                        onChange={(e) => setAgentIdInputValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="w-20 px-1 py-0.5 rounded bg-white border border-slate-200 text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveAgentId(c.id);
                        }}
                        disabled={savingAgentId === c.id}
                        className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded border border-emerald-200"
                        title="Save Agent ID"
                      >
                        {savingAgentId === c.id ? <Loader2 className="animate-spin" size={10} /> : <Check size={10} />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAgentIdFor(null);
                          setAgentIdInputValue("");
                        }}
                        disabled={savingAgentId === c.id}
                        className="p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded border border-slate-200"
                        title="Cancel"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      {c.telecmi_agent_id || "—"}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAgentIdFor(c.id);
                          setAgentIdInputValue(c.telecmi_agent_id || "");
                        }}
                        className="p-0.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded"
                        title="Edit TeleCMI Agent ID"
                      >
                        <Pencil size={9} />
                      </button>
                    </span>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${statusColor}`}>
                  {st === "logged_out" ? "Offline" : st}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. KPI Summary Grid */}
      <div className="flex items-center gap-2 text-xs">
        {selectedCallerId ? (
          <>
            <span className="font-label text-slate-500">
              Showing: <span className="font-bold text-slate-800">{selectedCallerName}</span>
            </span>
            <button
              onClick={() => setSelectedCallerId(null)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors text-[10px] font-bold"
            >
              <X size={10} /> Clear
            </button>
          </>
        ) : (
          <span className="font-label text-slate-500">
            Showing: <span className="font-bold text-slate-800">Team Overview</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-surface rounded-card p-4 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="p-2 rounded-lg bg-indigo-50 w-fit mb-2 text-indigo-600"><Phone size={16} /></div>
          <span className="block text-2xl font-display font-black text-slate-800">
            {loadingStats ? <Loader2 className="animate-spin text-slate-400" size={20} /> : (
              selectedCallerId
                ? (callerStats?.connect_rate ? `${Math.round(callerStats.connect_rate * 100)}%` : "0%")
                : (stats?.connect_rate ? `${Math.round(stats.connect_rate * 100)}%` : "0%")
            )}
          </span>
          <span className="text-slate-400 font-label text-[10px] uppercase font-bold tracking-wider mt-1 block">Connection Rate</span>
        </div>

        <div className="bg-surface rounded-card p-4 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="p-2 rounded-lg bg-sky-50 w-fit mb-2 text-sky-600"><Clock size={16} /></div>
          <span className="block text-2xl font-display font-black text-slate-800">
            {loadingStats ? <Loader2 className="animate-spin text-slate-400" size={20} /> : (
              selectedCallerId
                ? (callerStats?.avg_talk_seconds ? `${Math.floor(callerStats.avg_talk_seconds / 60)}m ${callerStats.avg_talk_seconds % 60}s` : "0s")
                : (stats?.avg_talk_seconds ? `${Math.floor(stats.avg_talk_seconds / 60)}m ${stats.avg_talk_seconds % 60}s` : "0s")
            )}
          </span>
          <span className="text-slate-400 font-label text-[10px] uppercase font-bold tracking-wider mt-1 block">Avg Talk Time</span>
        </div>

        <div className="bg-surface rounded-card p-4 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="p-2 rounded-lg bg-amber-50 w-fit mb-2 text-amber-600"><Coffee size={16} /></div>
          <span className="block text-2xl font-display font-black text-slate-800">
            {loadingStats ? (
              <Loader2 className="animate-spin text-slate-400" size={20} />
            ) : selectedCallerId ? (
              callerStats?.idle_minutes_today ? `${Math.round(callerStats.idle_minutes_today)} min` : "0 min"
            ) : (
              stats?.idle_minutes_today ? `${Math.round(stats.idle_minutes_today)} min` : "0 min"
            )}
          </span>
          <span className="text-slate-400 font-label text-[10px] uppercase font-bold tracking-wider mt-1 block">
            {selectedCallerId ? "Idle Minutes" : "Total Team Idle"}
          </span>
        </div>

        <div className="bg-surface rounded-card p-4 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="p-2 rounded-lg bg-emerald-50 w-fit mb-2 text-emerald-600"><TrendingUp size={16} /></div>
          <span className="block text-2xl font-display font-black text-slate-800">
            {loadingStats ? <Loader2 className="animate-spin text-slate-400" size={20} /> : (stats?.outcome_breakdown?.converted || 0)}
          </span>
          <span className="text-slate-400 font-label text-[10px] uppercase font-bold tracking-wider mt-1 block">Conversions</span>
        </div>

        <div className="bg-surface rounded-card p-4 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="p-2 rounded-lg bg-purple-50 w-fit mb-2 text-purple-600"><Award size={16} /></div>
          <span className="block text-2xl font-display font-black text-slate-800">
            {loadingStats ? <Loader2 className="animate-spin text-slate-400" size={20} /> : (
              selectedCallerId
                ? (callerStats?.quality_avg ? `${callerStats.quality_avg.toFixed(1)}/10` : "\u2014")
                : (stats?.quality_avg ? `${stats.quality_avg.toFixed(1)}/10` : "\u2014")
            )}
          </span>
          <span className="text-slate-400 font-label text-[10px] uppercase font-bold tracking-wider mt-1 block">Quality Score</span>
        </div>

        <div className="bg-surface rounded-card p-4 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="p-2 rounded-lg bg-rose-50 w-fit mb-2 text-rose-600"><BarChart2 size={16} /></div>
          <span className="block text-2xl font-display font-black text-slate-800">
            {loadingStats ? <Loader2 className="animate-spin text-slate-400" size={20} /> : (
              selectedCallerId ? (callerStats?.calls_today ?? 0) : (stats?.calls_today || 0)
            )}
          </span>
          <span className="text-slate-400 font-label text-[10px] uppercase font-bold tracking-wider mt-1 block">Total Calls Today</span>
        </div>
      </div>

      {/* 2b. Team Attendance */}
      <TeamAttendanceGrid selectedCallerId={selectedCallerId} selectedCallerName={selectedCallerName} />

      {/* 3. Performance Table & Export */}
      <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-tertiary">Agent Performance Leaderboard</h2>
            <p className="font-label text-xs text-on-surface-muted">Sort by connect rate, idle time, or quality scores to manage team output.</p>
          </div>
          
          {/* Export section */}
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
            <span className="font-label text-[10px] text-slate-500 font-bold uppercase pl-1">Export Performance:</span>
            <input 
              type="date"
              value={exportSince}
              onChange={(e) => setExportSince(e.target.value)}
              className="px-2 py-1 rounded bg-white border border-slate-200 font-body text-xs text-slate-800 focus:outline-none"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input 
              type="date"
              value={exportUntil}
              onChange={(e) => setExportUntil(e.target.value)}
              className="px-2 py-1 rounded bg-white border border-slate-200 font-body text-xs text-slate-800 focus:outline-none"
            />
            <button
              onClick={handleExportCsv}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/95 disabled:opacity-50 font-label text-xs font-semibold transition-colors"
            >
              {exporting ? <Loader2 className="animate-spin" size={12} /> : <Download size={12} />}
              CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-label uppercase text-[10px] font-bold">
                <th className="py-3 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort("name")}>
                  Agent Name {sortField === "name" && (sortDirection === "asc" ? <ChevronUp size={10} className="inline ml-1" /> : <ChevronDown size={10} className="inline ml-1" />)}
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort("calls_today")}>
                  Calls Today {sortField === "calls_today" && (sortDirection === "asc" ? <ChevronUp size={10} className="inline ml-1" /> : <ChevronDown size={10} className="inline ml-1" />)}
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort("connect_rate")}>
                  Connect Rate {sortField === "connect_rate" && (sortDirection === "asc" ? <ChevronUp size={10} className="inline ml-1" /> : <ChevronDown size={10} className="inline ml-1" />)}
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort("avg_talk_seconds")}>
                  Avg Talk Time {sortField === "avg_talk_seconds" && (sortDirection === "asc" ? <ChevronUp size={10} className="inline ml-1" /> : <ChevronDown size={10} className="inline ml-1" />)}
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort("idle_minutes_today")}>
                  Idle Minutes {sortField === "idle_minutes_today" && (sortDirection === "asc" ? <ChevronUp size={10} className="inline ml-1" /> : <ChevronDown size={10} className="inline ml-1" />)}
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort("quality_avg")}>
                  Quality Score {sortField === "quality_avg" && (sortDirection === "asc" ? <ChevronUp size={10} className="inline ml-1" /> : <ChevronDown size={10} className="inline ml-1" />)}
                </th>
                <th className="py-3 px-4">Bunking Alert</th>
                <th className="py-3 px-4">Daily Target</th>
              </tr>
            </thead>
            <tbody>
              {loadingStats ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400 font-medium">
                    <Loader2 className="animate-spin text-slate-400 inline mr-2" size={16} /> Loading performance logs...
                  </td>
                </tr>
              ) : getSortedPerformers().length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">No performance records for today.</td>
                </tr>
              ) : (
                getSortedPerformers().map((row) => {
                  const dbCaller = callersList.find(c => c.id === row.caller_id);
                  const currentTarget = editingTarget[row.caller_id] !== undefined
                    ? editingTarget[row.caller_id]
                    : (dbCaller?.target ?? 0);
                  const isUpdating = updatingTargetId === row.caller_id;

                  return (
                    <tr
                      key={row.caller_id}
                      className={`border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${
                        selectedCallerId === row.caller_id ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-800">{row.name}</td>
                      <td className="py-3.5 px-4 text-slate-600 font-semibold">{row.calls_today}</td>
                      <td className="py-3.5 px-4 text-slate-600 font-semibold">
                        {row.connect_rate ? `${Math.round(row.connect_rate * 100)}%` : "0%"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        {row.avg_talk_seconds ? `${Math.floor(row.avg_talk_seconds / 60)}m ${row.avg_talk_seconds % 60}s` : "0s"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-650 font-medium">
                        {row.idle_minutes_today ? `${Math.round(row.idle_minutes_today)} min` : "0 min"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-800 font-bold text-sm">
                        {row.quality_avg ? `${row.quality_avg.toFixed(1)}/10` : "\u2014"}
                      </td>
                      <td className="py-3.5 px-4">
                        {row.bunking_flag ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-600 font-bold text-[9px] uppercase border border-red-200">
                            <ShieldAlert size={10} /> Idle Gap Alert
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="number"
                            min="0"
                            value={currentTarget}
                            onChange={(e) => setEditingTarget({
                              ...editingTarget,
                              [row.caller_id]: parseInt(e.target.value) || 0
                            })}
                            className="w-14 px-1.5 py-1 rounded bg-white border border-slate-200 text-center font-bold font-body text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          {(editingTarget[row.caller_id] !== undefined) && (
                            <button
                              onClick={() => handleUpdateTarget(row.caller_id)}
                              disabled={isUpdating}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded border border-emerald-200"
                              title="Save Daily Target"
                            >
                              {isUpdating ? <Loader2 className="animate-spin" size={10} /> : <Check size={10} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Agent Timeline Visualization */}
      <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-tertiary">Shift Timeline Visualizer</h2>
            <p className="font-label text-xs text-on-surface-muted">Analyze live calling activity blocks, status transitions, and gaps.</p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedCallerForTimeline}
              onChange={(e) => setSelectedCallerForTimeline(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-250 text-xs font-bold focus:outline-none"
            >
              {callersList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
              <span className="font-label text-[10px] text-slate-500 font-bold uppercase pl-1">From</span>
              <input
                type="date"
                value={timelineFrom}
                onChange={(e) => setTimelineFrom(e.target.value)}
                className="px-2 py-1 rounded bg-white border border-slate-200 font-body text-xs text-slate-800 focus:outline-none"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={timelineTo}
                onChange={(e) => setTimelineTo(e.target.value)}
                className="px-2 py-1 rounded bg-white border border-slate-200 font-body text-xs text-slate-800 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {loadingTimeline ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-slate-400 mb-2" size={24} />
            <p className="text-xs text-slate-400">Fetching timeline details...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Visual Bar representation */}
            <div className="relative pt-4">
              <div className="w-full h-10 bg-slate-200 rounded-xl relative border border-slate-350/50 shadow-inner overflow-hidden">
                {/* 9 AM to 7 PM background blocks/idle slots */}
                {timelineEvents.map((event) => {
                  if (event.type === "status" && event.status === "break") {
                    const style = getEventStyle(event);
                    return (
                      <div
                        key={event.id}
                        className="absolute top-0 bottom-0 bg-amber-400 border-x border-amber-500/25 opacity-70"
                        style={style}
                        title={`Break Block: ${formatIST(event.started_at)} - ${event.ended_at ? formatIST(event.ended_at) : "ongoing"}`}
                      />
                    );
                  }
                  
                  if (event.type === "call") {
                    const style = getEventStyle(event);
                    let color = "bg-primary border-primary-dark";
                    if (event.outcome === "converted") color = "bg-emerald-500 border-emerald-600";
                    else if (event.outcome === "callback") color = "bg-amber-500 border-amber-600";
                    else if (event.outcome === "no_answer") color = "bg-rose-450 border-rose-500";
                    
                    return (
                      <div
                        key={event.id}
                        className={`absolute top-1.5 bottom-1.5 rounded-md border text-[9px] font-bold text-white flex items-center justify-center cursor-pointer transition-all hover:scale-y-110 shadow-sm ${color}`}
                        style={style}
                        title={`Call (${event.outcome || "disposition"}): ${formatIST(event.started_at)} (${event.duration_seconds || 0}s)\nLead: ${event.lead_name || event.lead_phone}`}
                      >
                        <Phone size={8} className="shrink-0" />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>

              {/* Time tick labels at the bottom */}
              <div className="flex justify-between text-[10px] text-slate-400 font-bold px-1 mt-2">
                <span>09:00 IST</span>
                <span>11:00</span>
                <span>13:00</span>
                <span>15:00</span>
                <span>17:00</span>
                <span>19:00 IST</span>
              </div>
            </div>

            {/* List log representation */}
            <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 max-h-[300px] overflow-y-auto space-y-2">
              <span className="font-label text-[10px] text-slate-450 font-bold uppercase tracking-wider block mb-2">Detailed Log Checklist</span>
              {timelineEvents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No events logged for this day.</p>
              ) : (
                timelineEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between py-2 border-b border-slate-100 text-xs text-slate-650">
                    <div className="flex items-center gap-2.5">
                      <Clock size={12} className="text-slate-400" />
                      <span className="font-bold text-slate-700">{formatIST(event.started_at)}</span>
                      <span className="text-slate-400">·</span>
                      {event.type === "status" ? (
                        <span>
                          Status changed to <span className="font-bold text-slate-800 capitalize">{event.status}</span>
                        </span>
                      ) : (
                        <span>
                          Called <span className="font-bold text-slate-800">{event.lead_name || formatPhone(event.lead_phone)}</span>
                          {" ("}
                          <span className="font-medium">{event.duration_seconds || 0}s</span>
                          {")"}
                        </span>
                      )}
                    </div>
                    {event.type === "call" && (
                      <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase border ${
                        event.outcome === "converted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        event.outcome === "callback" ? "bg-amber-50 text-amber-700 border-amber-200" :
                        "bg-slate-150 text-slate-600 border-slate-200"
                      }`}>
                        {event.outcome || "Answered"}
                      </span>
                    )}
                    {event.type === "status" && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[9px] uppercase rounded border border-slate-200">
                        Shift Status
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 5. QA Review Feed */}
        <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
          <h2 className="font-display text-base font-bold text-tertiary mb-1 flex items-center gap-2">
            <Award size={16} className="text-purple-600" /> QA Quality Review Feed
          </h2>
          <p className="font-label text-xs text-on-surface-muted mb-4">Listen to call logs, view AI sentiment tags, and evaluate caller scores.</p>
          
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {loadingQa ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-slate-400 mb-2" size={24} />
                <p className="text-xs text-slate-400">Loading call recordings...</p>
              </div>
            ) : qaQueue.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-12">No calls pending QA review.</p>
            ) : (
              qaQueue.map(item => (
                <div key={item.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <button
                        onClick={() => item.lead_id && setViewingLeadId(item.lead_id)}
                        className="font-bold text-slate-800 hover:text-indigo-600 text-xs flex items-center gap-1"
                      >
                        {item.leads?.name || formatPhone(item.leads?.phone)} <Eye size={12} className="text-slate-400" />
                      </button>
                      <span className="text-[10px] text-slate-450 block font-medium mt-0.5">{timeAgo(item.created_at)}</span>
                    </div>
                    
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase border ${
                      item.outcome === "converted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      item.outcome === "callback" ? "bg-amber-50 text-amber-700 border-amber-200" :
                      "bg-slate-150 text-slate-600 border-slate-200"
                    }`}>
                      {item.outcome || item.disposition || "Completed"}
                    </span>
                  </div>

                  {item.ai_summary && (
                    <div className="bg-white/80 p-3 rounded-xl border border-slate-200/50 text-[11px] leading-relaxed text-slate-600 space-y-1">
                      {item.ai_summary.brief && <p><span className="font-bold text-slate-800">Brief:</span> {item.ai_summary.brief}</p>}
                      {(item.ai_summary.course || item.ai_summary.product) && (
                        <p><span className="font-bold text-slate-800">Course Interest:</span> {item.ai_summary.course || item.ai_summary.product}</p>
                      )}
                      <p><span className="font-bold text-slate-800">Summary:</span> Next Action: {item.ai_summary.next_action || "\u2014"}</p>
                      {item.ai_summary.budget && <p><span className="font-bold text-slate-800">Budget:</span> {item.ai_summary.budget}</p>}
                      {item.ai_summary.sentiment && <p><span className="font-bold text-slate-800">Sentiment:</span> {item.ai_summary.sentiment}</p>}
                    </div>
                  )}

                  {item.recording_url ? (
                    <div className="pt-1">
                      <audio 
                        src={item.recording_url}
                        controls 
                        className="w-full h-8 text-xs focus:outline-none"
                      />
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 font-medium italic">Audio recording processing or not available</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 6. Bulk Assignment Tool */}
        <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 flex flex-col">
          <h2 className="font-display text-base font-bold text-tertiary mb-1 flex items-center gap-2">
            <Users size={16} className="text-sky-600" /> Lead Bulk Assignment
          </h2>
          <p className="font-label text-xs text-on-surface-muted mb-4">Select multiple leads to dispatch or hand off to another agent queue.</p>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl mb-4 text-xs">
            <Search size={14} className="text-slate-400 shrink-0 ml-1" />
            <input
              type="text"
              placeholder="Search leads name, phone, segment..."
              value={leadSearchQuery}
              onChange={(e) => setLeadSearchQuery(e.target.value)}
              className="bg-transparent w-full focus:outline-none placeholder-slate-400"
            />
          </div>

          <div className="flex-1 overflow-y-auto max-h-[350px] border border-slate-100 rounded-2xl pr-1 mb-4">
            {loadingLeads ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-slate-400" size={20} />
              </div>
            ) : filteredLeads.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-12">No leads matching search query.</p>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 sticky top-0 font-label text-[10px] text-slate-400 uppercase font-bold">
                    <th className="py-2.5 px-3 w-8">
                      <input 
                        type="checkbox"
                        checked={filteredLeads.length > 0 && filteredLeads.every(l => selectedLeadIds.includes(l.id))}
                        onChange={toggleSelectAllLeads}
                        className="rounded text-primary focus:ring-primary"
                      />
                    </th>
                    <th className="py-2.5 px-2">Lead</th>
                    <th className="py-2.5 px-2">Phone</th>
                    <th className="py-2.5 px-2">Seg</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-2">Assigned To</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map(lead => {
                    const isSelected = selectedLeadIds.includes(lead.id);
                    const assignedCaller = callersList.find(c => c.id === lead.assigned_to);
                    return (
                      <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50/20 transition-colors">
                        <td className="py-2 px-3">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectLead(lead.id)}
                            className="rounded text-primary focus:ring-primary"
                          />
                        </td>
                        <td className="py-2 px-2 font-bold text-slate-800">{lead.name || "Unnamed"}</td>
                        <td className="py-2 px-2 text-slate-500 font-medium">{formatPhone(lead.phone)}</td>
                        <td className="py-2 px-2">
                          <span className="bg-slate-100 px-1 py-0.5 rounded font-black text-[9px] uppercase">{lead.segment || "—"}</span>
                        </td>
                        <td className="py-2 px-2">
                          <span className={`px-1.5 py-0.5 rounded font-label text-[9px] font-black uppercase ${
                            lead.call_status === "converted" ? "bg-emerald-100 text-emerald-800" :
                            lead.call_status === "dnc" ? "bg-red-100 text-red-800" :
                            lead.call_status === "unreachable" ? "bg-rose-100 text-rose-800" :
                            "bg-slate-100 text-slate-650"
                          }`}>
                            {lead.call_status || "new"}
                            {lead.do_not_call ? " (DNC)" : ""}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-slate-500 font-semibold truncate">
                          {assignedCaller ? assignedCaller.name : <span className="text-amber-500">Unassigned</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-auto">
            <div className="flex-1">
              <span className="font-label text-[10px] text-slate-400 uppercase font-extrabold block">Reassign To:</span>
              <select
                value={bulkAssigneeId}
                onChange={(e) => setBulkAssigneeId(e.target.value)}
                className="w-full bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary mt-1"
              >
                <option value="">Select Caller...</option>
                {callersList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            
            <div className="shrink-0 pt-4">
              <button
                onClick={handleBulkAssign}
                disabled={bulkAssigning || selectedLeadIds.length === 0 || !bulkAssigneeId}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/95 disabled:opacity-50 font-label text-xs font-bold transition-all shadow-sm"
              >
                {bulkAssigning ? <Loader2 className="animate-spin" size={12} /> : null}
                Assign ({selectedLeadIds.length})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Detail Modal */}
      {viewingLeadId && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm cursor-pointer"
          onClick={() => setViewingLeadId(null)}
        >
          <div 
            className="w-full max-w-4xl bg-white rounded-3xl p-7 shadow-2xl max-h-[90vh] overflow-y-auto cursor-default border border-slate-200/50 flex flex-col gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="font-display text-lg font-bold text-slate-800 flex items-center gap-2">
                🔍 Lead Attribution profile
              </h3>
              <button 
                onClick={() => setViewingLeadId(null)} 
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all"
              >
                <X size={16} />
              </button>
            </div>
            
            {viewingLeadLoading ? (
              <div className="py-12 flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-indigo-500 mb-2" size={28} />
                <p className="text-xs text-slate-500 font-medium">Fetching lead history...</p>
              </div>
            ) : viewingLead ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div className="space-y-6">
                  <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500 text-white font-display text-lg font-bold flex items-center justify-center">
                        {viewingLead.name ? viewingLead.name.charAt(0).toUpperCase() : <Users size={18} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-body text-base font-extrabold text-slate-850">{viewingLead.name || "Unnamed Lead"}</p>
                          <span className={`px-2 py-0.5 rounded font-label text-[9px] font-black uppercase ${
                            viewingLead.segment === "A" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                            viewingLead.segment === "B" ? "bg-blue-50 text-blue-700 border border-blue-100" :
                            viewingLead.segment === "C" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                            "bg-slate-100 text-slate-700"
                          }`}>
                            Seg {viewingLead.segment}
                          </span>
                          {viewingLead.call_status && (
                            <span className={`px-2 py-0.5 rounded font-label text-[9px] font-black uppercase ${
                              viewingLead.call_status === "converted" ? "bg-emerald-100 text-emerald-800 border border-emerald-250" :
                              viewingLead.call_status === "dnc" ? "bg-red-100 text-red-800 border border-red-200" :
                              viewingLead.call_status === "unreachable" ? "bg-rose-100 text-rose-800 border border-rose-250" :
                              viewingLead.call_status === "callback" ? "bg-amber-100 text-amber-800 border border-amber-250" :
                              "bg-indigo-100 text-indigo-800 border border-indigo-200"
                            }`}>
                              {viewingLead.call_status}
                            </span>
                          )}
                          {viewingLead.do_not_call && (
                            <span className="px-2 py-0.5 bg-red-650 text-white rounded font-label text-[9px] font-black uppercase">
                              DNC
                            </span>
                          )}
                        </div>
                        <p className="font-label text-xs text-slate-500 mt-1 select-all">
                          {formatPhone(viewingLead.phone)} · Score {viewingLead.score}/10
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200/60 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                    <Calendar size={16} className="text-indigo-500 shrink-0" />
                    <div>
                      <p className="font-label text-[9px] text-slate-400 uppercase tracking-wider font-extrabold">Queue Assignment Timestamp</p>
                      <p className="font-body text-xs text-slate-800 font-bold mt-0.5">
                        {viewingLead.assigned_at 
                          ? new Date(viewingLead.assigned_at).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
                          : "Unknown (Assigned prior to tracking)"}
                      </p>
                    </div>
                  </div>

                  {viewingLead.broadcast_id || viewingLead.template_name ? (
                    <div className="bg-gradient-to-br from-purple-50/50 to-indigo-50/20 border border-purple-100/60 rounded-3xl p-5 shadow-sm space-y-4">
                      <span className="font-display text-[11px] font-black text-purple-800 uppercase tracking-widest flex items-center gap-1.5">
                        <Phone size={12} className="text-purple-500" /> Outbound Campaign
                      </span>
                      <div className="space-y-3.5">
                        <div className="bg-white/90 backdrop-blur-sm border border-purple-100/65 rounded-xl p-3.5 relative shadow-sm">
                          <span className="font-label text-[9px] text-purple-700/60 uppercase font-extrabold block">Broadcast Campaign ID</span>
                          <p className="font-mono text-xs text-slate-800 font-bold mt-1.5 truncate pr-8 select-all">
                            {viewingLead.broadcast_id || "None"}
                          </p>
                        </div>

                        <div className="bg-white/90 backdrop-blur-sm border border-purple-100/65 rounded-xl p-3.5 shadow-sm">
                          <span className="font-label text-[9px] text-purple-700/60 uppercase font-extrabold block">Message Template</span>
                          <p className="font-body text-xs text-slate-850 font-bold mt-1.5 truncate">
                            {viewingLead.template_name || "N/A"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/20 border border-emerald-100/60 rounded-3xl p-5 shadow-sm space-y-4">
                      <span className="font-display text-[11px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                        <Phone size={12} className="text-emerald-500" /> Inbound Origin
                      </span>
                      <div className="grid grid-cols-2 gap-3.5">
                        <div className="bg-white/90 backdrop-blur-sm border border-emerald-100/65 rounded-xl p-3.5 shadow-sm">
                          <span className="font-label text-[9px] text-emerald-700/60 uppercase font-extrabold block">Ad Campaign</span>
                          <p className="font-body text-xs text-slate-850 font-bold mt-1 truncate">{viewingLead.ad_campaign_name || "Organic Traffic"}</p>
                        </div>
                        <div className="bg-white/90 backdrop-blur-sm border border-emerald-100/65 rounded-xl p-3.5 shadow-sm">
                          <span className="font-label text-[9px] text-emerald-700/60 uppercase font-extrabold block">Channel Source</span>
                          <p className="font-body text-xs text-slate-850 font-bold mt-1 capitalize truncate">{viewingLead.channel || viewingLead.source || "Organic"}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h4 className="font-display text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <Users size={12} className="text-indigo-500" /> Lead Interaction Timeline
                  </h4>

                  {viewingLeadNotes?.pinned && viewingLeadNotes.pinned.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="font-label text-[9px] text-slate-400 uppercase tracking-wider font-extrabold">📌 Pinned Notes</p>
                      {viewingLeadNotes.pinned.map((n: Note) => (
                        <div key={n.id} className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-slate-700 font-semibold shadow-sm">
                          {n.content}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    <p className="font-label text-[9px] text-slate-400 uppercase tracking-wider font-extrabold">📝 Recent Notes</p>
                    {viewingLeadNotes?.notes && viewingLeadNotes.notes.length > 0 ? (
                      <div className="relative border-l border-slate-100 pl-4 ml-2.5 max-h-[350px] overflow-y-auto pr-1 space-y-4">
                        {viewingLeadNotes.notes.slice(0, 5).map((n: Note) => (
                          <div key={n.id} className="relative">
                            <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-indigo-400 border-2 border-white ring-4 ring-white" />
                            <div className="flex justify-between items-center text-[9px] text-slate-450 font-bold mb-1">
                              <span>{timeAgo(n.created_at)}</span>
                              {n.is_pinned && <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-black text-[8px]">PINNED</span>}
                            </div>
                            <p className="font-body text-xs text-slate-600 bg-slate-50 border border-slate-100 p-3 rounded-2xl leading-relaxed break-words font-medium">
                              {n.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-8 bg-slate-50/60 border border-slate-100 rounded-2xl">
                        No prior interaction notes logged.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
