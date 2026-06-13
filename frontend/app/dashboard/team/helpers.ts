import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "UN";
}

export function dotColorClass(status: string | undefined): string {
  if (status === "present") return "bg-emerald-500";
  if (status === "absent") return "bg-red-500";
  return "bg-surface-mid/30";
}

export const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export interface MiniMonth {
  key: string;
  label: string;
  weeks: ({ date: string; status: string } | null)[][];
}

export function buildMiniMonths(days: { date: string; status: string }[], count: number = 6): MiniMonth[] {
  if (days.length === 0) return [];
  const statusByDate = new Map(days.map((d) => [d.date, d.status]));
  const monthKeys = Array.from(new Set(days.map((d) => d.date.slice(0, 7)))).slice(-count);
  return monthKeys.map((key) => {
    const monthStart = parseISO(`${key}-01`);
    const allDays = eachDayOfInterval({ start: startOfMonth(monthStart), end: endOfMonth(monthStart) });
    const cells: ({ date: string; status: string } | null)[] = [];
    const leadingEmpty = getDay(allDays[0]);
    for (let i = 0; i < leadingEmpty; i++) cells.push(null);
    allDays.forEach((d) => {
      const dateStr = format(d, "yyyy-MM-dd");
      cells.push({ date: dateStr, status: statusByDate.get(dateStr) ?? "future" });
    });
    const weeks: ({ date: string; status: string } | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { key, label: format(monthStart, "MMM yyyy"), weeks };
  });
}
