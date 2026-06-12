"use client";
import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { Loader2, CalendarCheck, UserCheck, UserX, Percent } from "lucide-react";
import { api, TeamAttendanceGridData } from "@/lib/api";

export default function TeamAttendanceGrid() {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [callerFilter, setCallerFilter] = useState<string>("all");
  const [data, setData] = useState<TeamAttendanceGridData | null>(null);
  const [loading, setLoading] = useState(true);

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <div className="p-2 rounded-lg bg-emerald-100 w-fit mb-2 text-emerald-600"><UserCheck size={16} /></div>
          <span className="block text-2xl font-display font-black text-slate-800">{data?.summary.present_today ?? 0}</span>
          <span className="text-emerald-700 font-label text-[10px] uppercase font-bold tracking-wider mt-1 block">Present Today</span>
        </div>
        <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
          <div className="p-2 rounded-lg bg-rose-100 w-fit mb-2 text-rose-600"><UserX size={16} /></div>
          <span className="block text-2xl font-display font-black text-slate-800">{data?.summary.absent_today ?? 0}</span>
          <span className="text-rose-700 font-label text-[10px] uppercase font-bold tracking-wider mt-1 block">Absent Today</span>
        </div>
        <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
          <div className="p-2 rounded-lg bg-indigo-100 w-fit mb-2 text-indigo-600"><Percent size={16} /></div>
          <span className="block text-2xl font-display font-black text-slate-800">
            {data ? Math.round(data.summary.attendance_rate_month * 100) : 0}%
          </span>
          <span className="text-indigo-700 font-label text-[10px] uppercase font-bold tracking-wider mt-1 block">Attendance Rate (Month)</span>
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
    </div>
  );
}
