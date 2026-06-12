"use client";
import { useEffect, useState, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, CalendarCheck } from "lucide-react";
import { api, AttendanceDay } from "@/lib/api";

function dotColor(status: string): string {
  if (status === "present") return "bg-emerald-500";
  if (status === "absent") return "bg-rose-400";
  return "bg-surface-mid/30";
}

function mondayIndex(dateStr: string): number {
  return (new Date(`${dateStr}T00:00:00`).getDay() + 6) % 7;
}

export default function AttendanceHeatmap({ callerId }: { callerId: string }) {
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [todayStatus, setTodayStatus] = useState<string>("absent");
  const [loading, setLoading] = useState(true);
  const [markDate, setMarkDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState<"present" | "absent" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.team.attendanceForCaller(callerId, 4);
      setDays(res.data.days);
      setTodayStatus(res.data.today_status);
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

  const markDayStatus = days.find((d) => d.date === markDate)?.status;

  const weeks: (AttendanceDay | null)[][] = [];
  if (days.length > 0) {
    const padding = mondayIndex(days[0].date);
    const cells: (AttendanceDay | null)[] = [...Array.from({ length: padding }, () => null), ...days];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarCheck size={14} className="text-primary" />
          <h3 className="font-display font-semibold text-ink text-xs">Attendance</h3>
          <span className={`badge text-[10px] py-0 ${todayStatus === "present" ? "badge-green" : todayStatus === "absent" ? "badge-red" : "badge-yellow"}`}>
            Today: {todayStatus === "future" ? "—" : todayStatus}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl bg-surface-subtle">
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

      {loading ? (
        <div className="flex items-center justify-center h-24"><Loader2 className="animate-spin text-primary" size={20} /></div>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((cell, di) => cell ? (
                  <div
                    key={cell.date}
                    title={`${format(parseISO(cell.date), "MMM d, yyyy")} — ${cell.status === "present" ? "Present" : cell.status === "absent" ? "Absent" : "Upcoming"}`}
                    className={`w-3 h-3 rounded-sm ${dotColor(cell.status)}`}
                  />
                ) : (
                  <div key={`pad-${wi}-${di}`} className="w-3 h-3 rounded-sm" />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border-subtle text-[10px] text-ink-muted font-body">
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Present</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> Absent</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-surface-mid/30 inline-block" /> Upcoming</div>
      </div>
    </div>
  );
}
