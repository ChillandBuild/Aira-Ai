"use client";
import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileMenu } from "@/components/ProfileMenu";

export function AppHeader({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false, hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-40 h-14 flex items-center justify-end gap-2.5 px-7 bg-background/80 backdrop-blur border-b border-slate-200/60">
      <button
        onClick={onOpenCalendar}
        className="px-3 py-1.5 transition-all text-black font-bold text-lg hover:text-indigo-600 bg-slate-200/40 backdrop-blur-md border border-slate-200/50 rounded-xl shadow-sm hover:bg-slate-200/60"
        title="Schedule & Notes"
      >
        <Clock size={14} className="inline -mt-0.5 mr-1" />
        <span className="font-bold">{time || "00:00"}</span>
        <span className="sr-only">Schedule & Notes</span>
      </button>
      <NotificationBell />
      <ProfileMenu />
    </header>
  );
}
