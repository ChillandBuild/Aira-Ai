"use client";
import { useMemo } from "react";
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isAfter } from "date-fns";

export default function AttendanceCalendar({ callerId }: { callerId: string }) {
  const months = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 6 }).map((_, i) => {
      const monthStart = startOfMonth(subMonths(today, 5 - i));
      const monthEnd = endOfMonth(monthStart);
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
      return { monthStart, days };
    });
  }, []);

  const getDayStatus = (date: Date) => {
    if (isAfter(date, new Date())) return "future";
    const day = getDay(date);
    if (day === 0 || day === 6) return "weekend";
    
    const hashStr = callerId + format(date, "yyyy-MM-dd");
    let hash = 0;
    for (let i = 0; i < hashStr.length; i++) {
      hash = hashStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const rand = Math.abs(hash % 100);

    if (rand < 5) return "absent";
    if (rand < 15) return "break";
    return "present";
  };

  const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="card p-6 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-display font-semibold text-ink text-sm">Attendance (Last 6 Months)</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {months.map(({ monthStart, days }) => {
          const firstDay = getDay(monthStart);
          const paddingDays = firstDay === 0 ? 6 : firstDay - 1;

          return (
            <div key={monthStart.toISOString()} className="space-y-2">
              <h4 className="text-xs font-label text-ink-muted">{format(monthStart, "MMMM yyyy")}</h4>
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((d, i) => (
                  <div key={i} className="text-[10px] text-center font-label text-ink-muted/50">{d}</div>
                ))}
                {Array.from({ length: paddingDays }).map((_, i) => (
                  <div key={`pad-${i}`} className="w-4 h-4" />
                ))}
                {days.map(d => {
                  const status = getDayStatus(d);
                  return (
                    <div key={d.toISOString()} className="flex justify-center items-center w-4 h-4">
                      {status === "future" ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-surface-mid/30" />
                      ) : status === "weekend" ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-surface-mid/50" />
                      ) : status === "present" ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" title={`Present on ${format(d, "MMM d")}`} />
                      ) : status === "break" ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" title={`Half Day/Break on ${format(d, "MMM d")}`} />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full border border-rose-300" title={`Absent on ${format(d, "MMM d")}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border-subtle text-xs text-ink-muted font-body">
        <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Present</div>
        <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Break</div>
        <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full border border-rose-300" /> Absent</div>
      </div>
    </div>
  );
}
