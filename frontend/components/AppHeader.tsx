"use client";
import { useState, useEffect } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileMenu } from "@/components/ProfileMenu";

interface AppHeaderProps {
  onOpenCalendar: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function AppHeader({ onOpenCalendar, isSidebarCollapsed, onToggleSidebar }: AppHeaderProps) {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-40 h-14 flex items-center justify-between gap-2.5 px-7 bg-background/80 backdrop-blur border-b border-slate-200/60">
      <div className="flex items-center">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-2.5 bg-white border border-slate-200/80 rounded-xl hover:bg-slate-50 hover:border-zinc-400 transition-all text-zinc-600 shadow-sm"
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenCalendar}
          className="px-3 py-1.5 transition-all text-black font-bold text-lg hover:text-indigo-600 bg-slate-200/40 backdrop-blur-md border border-slate-200/50 rounded-xl shadow-sm hover:bg-slate-200/60"
          title="Schedule & Notes"
        >
          {time || "00:00"}
          <span className="sr-only">Schedule & Notes</span>
        </button>
        <NotificationBell />
        <ProfileMenu />
      </div>
    </header>
  );
}
