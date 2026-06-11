"use client";
import { useState, useEffect } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileMenu } from "@/components/ProfileMenu";

export function AppHeader({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      setTime(`${hh}:${mm}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-40 h-14 flex items-center justify-end gap-2.5 px-7 bg-background/80 backdrop-blur border-b border-slate-200/60">
      <button
        onClick={onOpenCalendar}
        className="px-3.5 py-2 bg-white border border-slate-200/80 rounded-xl hover:bg-slate-50 hover:border-indigo-500 transition-all font-mono text-xs font-extrabold text-slate-700 shadow-sm flex items-center justify-center min-w-[65px]"
        title="Schedule & Notes"
      >
        {time || "00:00"}
      </button>
      <NotificationBell />
      <ProfileMenu />
    </header>
  );
}
