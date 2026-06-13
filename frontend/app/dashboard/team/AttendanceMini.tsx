"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, CalendarCheck, UserCheck, UserX, Percent } from "lucide-react";
import { api, AttendanceDay } from "@/lib/api";
import { dotColorClass, WEEKDAY_LABELS, buildMiniMonths } from "./helpers";

export default function AttendanceMini({ callerId }: { callerId: string }) {
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [markDate, setMarkDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState<"present" | "absent" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.team.attendanceForCaller(callerId, 3);
      setDays(res.data.days);
    } finally {
      setLoading(false);
    }
  }, [callerId]);

  useEffect(() => { load(); }, [load]);

  async function mark(status: "present" | "absent") {
    setSaving(status);
    try {
      await api.team.markAttendance(callerId, markDate, status);
      await load();
    } finally {
      setSaving(null);
    }
  }

  const currentMonth = format(new Date(), "yyyy-MM");
  const { presentCount, absentCount, rate } = useMemo(() => {
    const monthDays = days.filter((d) => d.date.startsWith(currentMonth));
    const present = monthDays.filter((d) => d.status === "present").length;
    const absent = monthDays.filter((d) => d.status === "absent").length;
    const total = present + absent;
    return { presentCount: present, absentCount: absent, rate: total > 0 ? Math.round((present / total) * 100) : 0 };
  }, [days, currentMonth]);

  const markDayStatus = days.find((d) => d.date === markDate)?.status;
  const months = useMemo(() => buildMiniMonths(days, 3), [days]);

  if (loading) {
    return (
      <div className="card p-5 flex items-center justify-center h-32">
        <Loader2 className="animate-spin text-primary" size={20} />
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <CalendarCheck size={14} className="text-primary" />
        <h3 className="font-display font-semibold text-ink text-xs">Attendance</h3>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-100">
          <div className="p-1 rounded-md bg-emerald-100 w-fit mb-1 text-emerald-600"><UserCheck size={12} /></div>
          <span className="block text-base font-display font-black text-slate-800">{presentCount}</span>
          <span className="text-emerald-700 font-label text-[9px] uppercase font-bold tracking-wider block">Present</span>
        </div>
        <div className="bg-rose-50 rounded-lg p-2 border border-rose-100">
          <div className="p-1 rounded-md bg-rose-100 w-fit mb-1 text-rose-600"><UserX size={12} /></div>
          <span className="block text-base font-display font-black text-slate-800">{absentCount}</span>
          <span className="text-rose-700 font-label text-[9px] uppercase font-bold tracking-wider block">Absent</span>
        </div>
        <div className="bg-indigo-50 rounded-lg p-2 border border-indigo-100">
          <div className="p-1 rounded-md bg-indigo-100 w-fit mb-1 text-indigo-600"><Percent size={12} /></div>
          <span className="block text-base font-display font-black text-slate-800">{rate}%</span>
          <span className="text-indigo-700 font-label text-[9px] uppercase font-bold tracking-wider block">Rate (Month)</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4 p-2.5 rounded-xl bg-surface-subtle">
        <input
          type="date"
          value={markDate}
          max={format(new Date(), "yyyy-MM-dd")}
          onChange={(e) => setMarkDate(e.target.value)}
          className="input h-8 px-2 text-xs w-auto"
        />
        <button
          onClick={() => mark("present")}
          disabled={saving !== null}
          className={`px-3 py-1.5 rounded-lg text-xs font-label font-semibold border transition-colors ${markDayStatus === "present" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50"}`}
        >
          {saving === "present" ? <Loader2 size={12} className="animate-spin" /> : "Present"}
        </button>
        <button
          onClick={() => mark("absent")}
          disabled={saving !== null}
          className={`px-3 py-1.5 rounded-lg text-xs font-label font-semibold border transition-colors ${markDayStatus === "absent" ? "bg-rose-500 text-white border-rose-500" : "bg-white text-rose-600 border-rose-200 hover:bg-rose-50"}`}
        >
          {saving === "absent" ? <Loader2 size={12} className="animate-spin" /> : "Absent"}
        </button>
      </div>

      {months.length === 0 ? (
        <div className="text-center py-4 text-xs text-ink-muted font-body">No attendance history yet.</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {months.map((m) => (
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

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border-subtle text-[10px] text-ink-muted font-body">
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Present</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> Absent</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-surface-mid/30 inline-block" /> Future</div>
      </div>
    </div>
  );
}
