"use client";
import { useEffect, useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, CalendarCheck, UserCheck, UserX, Percent } from "lucide-react";
import { api, TeamAttendanceGridData } from "@/lib/api";
import { dotColorClass, WEEKDAY_LABELS, buildMiniMonths } from "./helpers";

export default function TeamAttendanceGrid() {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [callerFilter, setCallerFilter] = useState<string>("all");
  const [data, setData] = useState<TeamAttendanceGridData | null>(null);
  const [loading, setLoading] = useState(true);

  const [sixMonthDays, setSixMonthDays] = useState<{ date: string; status: string }[]>([]);
  const [sixMonthLoading, setSixMonthLoading] = useState(true);
  const [sixMonthCallerName, setSixMonthCallerName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.team.attendanceGrid(month)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (callerFilter === "all") return data.callers;
    return data.callers.filter((c) => c.caller_id === callerFilter);
  }, [data, callerFilter]);

  // Resolve which caller's 6-month calendar to show
  const sixMonthCallerId = useMemo(() => {
    if (callerFilter !== "all") return callerFilter;
    return data?.callers[0]?.caller_id ?? null;
  }, [callerFilter, data]);

  useEffect(() => {
    if (!sixMonthCallerId) {
      setSixMonthDays([]);
      setSixMonthLoading(false);
      return;
    }
    let cancelled = false;
    setSixMonthLoading(true);
    api.team.attendanceForCaller(sixMonthCallerId, 6)
      .then((res) => {
        if (cancelled) return;
        setSixMonthDays(res.data.days);
        const caller = data?.callers.find((c) => c.caller_id === sixMonthCallerId);
        setSixMonthCallerName(caller?.name ?? "");
      })
      .catch(() => { if (!cancelled) setSixMonthDays([]); })
      .finally(() => { if (!cancelled) setSixMonthLoading(false); });
    return () => { cancelled = true; };
  }, [sixMonthCallerId, data]);

  const sixMonths = useMemo(() => buildMiniMonths(sixMonthDays, 6), [sixMonthDays]);

  return (
    <div className="bg-surface rounded-card p-5 shadow-card ring-1 ring-[#c4c7c7]/15">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-display text-sm font-bold text-tertiary flex items-center gap-2">
          <CalendarCheck size={16} className="text-primary" /> Team Attendance
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input h-9 text-xs w-auto"
          />
          <select
            value={callerFilter}
            onChange={(e) => setCallerFilter(e.target.value)}
            className="input h-9 text-xs w-auto"
          >
            <option value="all">All Telecallers</option>
            {(data?.callers ?? []).map((c) => (
              <option key={c.caller_id} value={c.caller_id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
          <div className="p-1.5 rounded-lg bg-emerald-100 w-fit mb-1.5 text-emerald-600"><UserCheck size={14} /></div>
          <span className="block text-lg font-display font-black text-slate-800">{data?.summary.present_today ?? 0}</span>
          <span className="text-emerald-700 font-label text-[10px] uppercase font-bold tracking-wider mt-0.5 block">Present Today</span>
        </div>
        <div className="bg-rose-50 rounded-xl p-3 border border-rose-100">
          <div className="p-1.5 rounded-lg bg-rose-100 w-fit mb-1.5 text-rose-600"><UserX size={14} /></div>
          <span className="block text-lg font-display font-black text-slate-800">{data?.summary.absent_today ?? 0}</span>
          <span className="text-rose-700 font-label text-[10px] uppercase font-bold tracking-wider mt-0.5 block">Absent Today</span>
        </div>
        <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
          <div className="p-1.5 rounded-lg bg-indigo-100 w-fit mb-1.5 text-indigo-600"><Percent size={14} /></div>
          <span className="block text-lg font-display font-black text-slate-800">
            {data ? Math.round(data.summary.attendance_rate_month * 100) : 0}%
          </span>
          <span className="text-indigo-700 font-label text-[10px] uppercase font-bold tracking-wider mt-0.5 block">Attendance Rate (Month)</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={20} /></div>
      ) : !data || rows.length === 0 ? (
        <div className="text-center py-8 text-sm text-ink-muted font-body">No telecallers found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left font-label text-ink-muted px-2 py-1 sticky left-0 bg-surface">Telecaller</th>
                {data.days.map((d) => (
                  <th key={d} className="px-0.5 py-1 text-center font-label text-ink-muted/60 text-[9px]">
                    {format(new Date(`${d}T00:00:00`), "d")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.caller_id} className="border-t border-border-subtle">
                  <td className="px-2 py-1.5 font-label font-semibold text-ink whitespace-nowrap sticky left-0 bg-surface">{c.name}</td>
                  {data.days.map((d) => {
                    const status = data.grid[c.caller_id]?.[d] ?? "future";
                    return (
                      <td key={d} className="px-0.5 py-1.5 text-center">
                        <span
                          title={`${c.name} — ${format(new Date(`${d}T00:00:00`), "MMM d")}: ${status}`}
                          className={`inline-block w-2.5 h-2.5 rounded-full ${status === "present" ? "bg-emerald-500" : status === "absent" ? "bg-rose-400" : "bg-surface-mid/30"}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border-subtle text-[10px] text-ink-muted font-body">
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Present</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> Absent</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-surface-mid/30 inline-block" /> Future</div>
      </div>

      {/* 6-Month Overview */}
      {!loading && data && data.callers.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border-subtle">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-display text-xs font-bold text-tertiary">6-Month Overview</h3>
            {callerFilter === "all" && sixMonthCallerName && (
              <p className="text-[10px] text-ink-muted font-body">
                Showing 6-month attendance for {sixMonthCallerName} — select a telecaller above to view another.
              </p>
            )}
          </div>
          {sixMonthLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="animate-spin text-primary" size={18} /></div>
          ) : sixMonths.length === 0 ? (
            <div className="text-center py-4 text-xs text-ink-muted font-body">No attendance history yet.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {sixMonths.map((m) => (
                <div key={m.key} className="rounded-xl border border-border-subtle p-2">
                  <div className="text-center text-[10px] font-label font-semibold text-ink-muted mb-1">{m.label}</div>
                  <div className="grid grid-cols-7 gap-[2px] mb-1">
                    {WEEKDAY_LABELS.map((d, i) => (
                      <div key={i} className="text-center text-[8px] text-ink-muted/60">{d}</div>
                    ))}
                  </div>
                  {m.weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-[2px] mb-[2px]">
                      {week.map((cell, di) => cell ? (
                        <span
                          key={cell.date}
                          title={`${format(parseISO(cell.date), "MMM d, yyyy")}: ${cell.status}`}
                          className={`block w-full aspect-square rounded-sm ${dotColorClass(cell.status)}`}
                        />
                      ) : (
                        <span key={`pad-${wi}-${di}`} className="block w-full aspect-square" />
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
