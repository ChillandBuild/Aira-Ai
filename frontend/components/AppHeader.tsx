"use client";
import { Calendar } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { ProfileMenu } from "@/components/ProfileMenu";

export function AppHeader({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  return (
    <header className="sticky top-0 z-40 h-14 flex items-center justify-end gap-2.5 px-7 bg-background/80 backdrop-blur border-b border-slate-200/60">
      <button
        onClick={onOpenCalendar}
        className="p-2.5 bg-white border border-slate-200/80 rounded-xl hover:bg-slate-50 hover:border-indigo-500 transition-all"
        title="Schedule & Notes"
      >
        <Calendar size={18} className="text-slate-600" />
        <span className="sr-only">Schedule & Notes</span>
      </button>
      <NotificationBell />
      <ProfileMenu />
    </header>
  );
}
