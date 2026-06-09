"use client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Phone, RefreshCw, Check, Calendar, Clock, AlertTriangle, ChevronRight, Inbox } from "lucide-react";
import { api } from "@/lib/api";
import { formatPhone } from "@/lib/utils";
import { fetchAllCallbacks, markCallbackDone } from "../lib/notes-api";
import type { CallbackJob } from "../types";
import { usePolling } from "@/hooks/usePolling";
import { useActiveCall } from "../../contexts/ActiveCallContext";

type GroupedCallbacks = {
  overdue: CallbackJob[];
  today: CallbackJob[];
  tomorrow: CallbackJob[];
  upcoming: CallbackJob[];
};

function groupCallbacks(cbs: CallbackJob[]): GroupedCallbacks {
  const now = new Date();
  const todayStr = now.toDateString();
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toDateString();

  const groups: GroupedCallbacks = { overdue: [], today: [], tomorrow: [], upcoming: [] };
  for (const cb of cbs) {
    const d = new Date(cb.scheduled_for);
    if (d < now) {
      groups.overdue.push(cb);
    } else if (d.toDateString() === todayStr) {
      groups.today.push(cb);
    } else if (d.toDateString() === tomorrowStr) {
      groups.tomorrow.push(cb);
    } else {
      groups.upcoming.push(cb);
    }
  }
  return groups;
}

export default function ScheduledCallsPage() {
  const [callbacks, setCallbacks] = useState<CallbackJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingDone, setMarkingDone] = useState<string | null>(null);
  const { setActiveCall: setActiveCallCtx } = useActiveCall();

  const load = useCallback(async () => {
    try {
      const data = await fetchAllCallbacks();
      setCallbacks(data);
    } catch {
      toast.error("Failed to load scheduled calls");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 60_000);

  async function handleMarkDone(jobId: string) {
    setMarkingDone(jobId);
    try {
      await markCallbackDone(jobId);
      setCallbacks((prev) => prev.filter((c) => c.id !== jobId));
      toast.success("Callback marked as completed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark done");
    } finally { setMarkingDone(null); }
  }

  async function handleCallLead(cb: CallbackJob) {
    try {
      const callers = await api.callers.list();
      const me = callers[0]; // first available
      if (!me) { toast.error("No caller profile found"); return; }
      const res = await api.calls.initiate({ leadId: cb.lead_id, callbackJobId: cb.id }, me.id);
      setActiveCallCtx({
        leadId: res.lead_id ?? cb.lead_id,
        name: res.lead_name ?? cb.lead.name ?? null,
        phone: cb.lead.phone ?? "",
        callLogId: res.call_log_id ?? null,
      });
      toast.success(`Calling ${cb.lead.name || cb.lead.phone}...`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed");
    }
  }

  const groups = groupCallbacks(callbacks);

  const sectionConfig = [
    { key: "overdue" as const, label: "Overdue", icon: AlertTriangle, iconColor: "text-rose-500", bgGradient: "from-rose-50 to-red-50/30", borderColor: "border-rose-200/60", badgeColor: "bg-rose-100 text-rose-700" },
    { key: "today" as const, label: "Today", icon: Clock, iconColor: "text-amber-500", bgGradient: "from-amber-50 to-orange-50/30", borderColor: "border-amber-200/60", badgeColor: "bg-amber-100 text-amber-700" },
    { key: "tomorrow" as const, label: "Tomorrow", icon: Calendar, iconColor: "text-indigo-500", bgGradient: "from-indigo-50 to-purple-50/30", borderColor: "border-indigo-200/60", badgeColor: "bg-indigo-100 text-indigo-700" },
    { key: "upcoming" as const, label: "Upcoming", icon: ChevronRight, iconColor: "text-slate-500", bgGradient: "from-slate-50 to-gray-50/30", borderColor: "border-slate-200/60", badgeColor: "bg-slate-100 text-slate-600" },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-md">
            <Calendar size={22} className="text-white" />
          </div>
          Scheduled Calls
        </h1>
        <p className="font-body text-sm text-slate-500 mt-1.5">All pending callback reminders grouped by urgency</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <RefreshCw size={32} className="animate-spin text-indigo-500" />
        </div>
      ) : callbacks.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-200/60 shadow-sm">
          <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 border border-slate-100 mx-auto mb-4">
            <Inbox size={22} />
          </div>
          <h3 className="font-display text-lg font-bold text-slate-700">No scheduled callbacks</h3>
          <p className="font-body text-sm text-slate-400 mt-1 max-w-sm mx-auto">
            Schedule callbacks from the Dialer workspace using the &quot;Notes &amp; Schedule&quot; panel to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sectionConfig.map(({ key, label, icon: Icon, iconColor, bgGradient, borderColor, badgeColor }) => {
            const items = groups[key];
            if (items.length === 0) return null;
            return (
              <div key={key} className={`bg-gradient-to-br ${bgGradient} border ${borderColor} rounded-3xl p-6 shadow-sm`}>
                <h2 className="font-display text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-4 text-slate-800">
                  <Icon size={14} className={iconColor} />
                  {label}
                  <span className={`px-2 py-0.5 rounded-full font-label text-[10px] font-bold ${badgeColor}`}>
                    {items.length}
                  </span>
                </h2>
                <div className="space-y-2.5">
                  {items.map((cb) => (
                    <div
                      key={cb.id}
                      className="flex items-center justify-between bg-white rounded-2xl px-5 py-3.5 shadow-sm border border-slate-100 hover:shadow-md transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-body text-sm font-bold text-slate-800 truncate">{cb.lead.name ?? "Unnamed"}</p>
                          <span className="font-label text-[10px] text-slate-500">{formatPhone(cb.lead.phone)}</span>
                          {cb.lead.segment && (
                            <span className={`px-1.5 py-0.5 rounded font-label text-[9px] font-black uppercase ${
                              cb.lead.segment === "A" ? "bg-emerald-50 text-emerald-700" :
                              cb.lead.segment === "B" ? "bg-blue-50 text-blue-700" :
                              "bg-amber-50 text-amber-700"
                            }`}>SEG {cb.lead.segment}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-label text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock size={10} />
                            {new Date(cb.scheduled_for).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                          </span>
                          {cb.message_preview && (
                            <span className="font-label text-[10px] text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-lg truncate max-w-[200px]">
                              {cb.message_preview}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleCallLead(cb)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-label text-[10px] font-bold hover:from-emerald-600 hover:to-teal-700 transition-all shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <Phone size={12} className="fill-white" /> Call
                        </button>
                        <button
                          onClick={() => handleMarkDone(cb.id)}
                          disabled={markingDone === cb.id}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 text-slate-600 rounded-xl font-label text-[10px] font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
                        >
                          {markingDone === cb.id ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                          Done
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
