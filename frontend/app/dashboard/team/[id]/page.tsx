"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Calendar as CalendarIcon, Phone, Coffee, UserCircle } from "lucide-react";
import Link from "next/link";
import { api, TimelineEvent } from "@/lib/api";
import { format, differenceInSeconds } from "date-fns";

export default function TelecallerProfilePage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [sumRes, timeRes] = await Promise.all([
          api.callers.statusSummary(params.id),
          api.callers.getTimeline(params.id, date),
        ]);
        setSummary(sumRes as Record<string, unknown>);
        setTimeline(timeRes.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [date, params.id]);

  function formatDuration(seconds: number) {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  // Pre-process timeline to insert 'Idle' gaps
  const eventsWithGaps = [];
  for (let i = 0; i < timeline.length; i++) {
    eventsWithGaps.push(timeline[i]);
    
    if (i < timeline.length - 1) {
      const current = timeline[i];
      const next = timeline[i + 1];
      
      // Calculate end of current event
      let currentEnd;
      if (current.type === "status" && current.ended_at) {
        currentEnd = new Date(current.ended_at);
      } else if (current.type === "call" && current.duration_seconds) {
        currentEnd = new Date(new Date(current.started_at).getTime() + current.duration_seconds * 1000);
      } else {
        currentEnd = new Date(current.started_at);
      }
      
      const nextStart = new Date(next.started_at);
      const gapSeconds = differenceInSeconds(nextStart, currentEnd);
      
      // Only show gaps larger than 2 minutes and if current isn't 'logged_out' or 'break'
      if (gapSeconds > 120 && current.status !== "logged_out" && current.status !== "break") {
        eventsWithGaps.push({
          type: "idle",
          id: `gap-${i}`,
          started_at: currentEnd.toISOString(),
          duration_seconds: gapSeconds,
        });
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard/team" className="p-2 rounded-xl hover:bg-surface-subtle text-ink-muted transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="page-title">Telecaller Timeline</h1>
          <p className="page-subtitle">Track precise activity and idle time throughout the day.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Summary */}
        <div className="md:w-1/3 space-y-4">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <CalendarIcon size={18} className="text-primary" />
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)}
                className="input py-1.5 text-sm"
              />
            </div>
            
            {summary && (
              <div className="space-y-4 pt-4 border-t border-border-subtle">
                <div>
                  <p className="text-xs text-ink-muted font-body mb-1">Total Active Time</p>
                  <p className="font-display font-semibold text-lg text-ink">
                    {Math.floor((summary.active_minutes_today as number) / 60)}h {(summary.active_minutes_today as number) % 60}m
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted font-body mb-1">Total Break Time</p>
                  <p className="font-display font-semibold text-lg text-ink">
                    {Math.floor((summary.break_minutes_today as number) / 60)}h {(summary.break_minutes_today as number) % 60}m
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted font-body mb-1">Total Idle Time</p>
                  <p className="font-display font-semibold text-lg text-ink">
                    {Math.floor((summary.idle_minutes_today as number) / 60)}h {(summary.idle_minutes_today as number) % 60}m
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Timeline View */}
        <div className="md:w-2/3">
          <div className="card p-6">
            <h2 className="font-display font-bold text-ink mb-6">Activity Log</h2>
            
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-primary" size={24} />
              </div>
            ) : eventsWithGaps.length === 0 ? (
              <div className="text-center py-12 text-ink-muted font-body">
                No activity logged for this date.
              </div>
            ) : (
              <div className="relative border-l-2 border-border-subtle ml-3 space-y-6">
                {eventsWithGaps.map((ev: any) => {
                  
                  let Icon = UserCircle;
                  let iconColor = "bg-gray-100 text-gray-500";
                  let title = "Unknown Event";
                  let details = "";
                  
                  if (ev.type === "status") {
                    if (ev.status === "active") {
                      Icon = UserCircle;
                      iconColor = "bg-green-100 text-green-600";
                      title = "Logged In & Active";
                    } else if (ev.status === "break") {
                      Icon = Coffee;
                      iconColor = "bg-orange-100 text-orange-500";
                      title = "Went on Break";
                    } else if (ev.status === "logged_out") {
                      Icon = UserCircle;
                      iconColor = "bg-red-100 text-red-500";
                      title = "Logged Out";
                    }
                  } else if (ev.type === "call") {
                    Icon = Phone;
                    iconColor = "bg-blue-100 text-blue-500";
                    title = `Call with ${ev.lead_name}`;
                    details = `Duration: ${formatDuration(ev.duration_seconds)} • Outcome: ${ev.outcome || "Unknown"}`;
                  } else if (ev.type === "idle") {
                    title = `Idle Gap (${formatDuration(ev.duration_seconds)})`;
                  }

                  if (ev.type === "idle") {
                    return (
                      <div key={ev.id} className="relative pl-6 py-2">
                        <div className="absolute -left-[5px] top-4 w-2 h-2 rounded-full bg-border-subtle"></div>
                        <p className="text-sm font-body text-ink-muted bg-surface-subtle inline-block px-3 py-1 rounded-full">
                          {title}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div key={ev.id} className="relative pl-8">
                      <div className={`absolute -left-3.5 top-0.5 p-1.5 rounded-full ring-4 ring-white ${iconColor}`}>
                        <Icon size={14} />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <p className="font-label font-medium text-ink">{title}</p>
                          <span className="text-xs text-ink-muted font-body">
                            {format(new Date(ev.started_at), "h:mm a")}
                          </span>
                        </div>
                        {details && <p className="text-sm text-ink-muted font-body mt-0.5">{details}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
