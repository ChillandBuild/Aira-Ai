"use client";
import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { AuthRoleProvider } from "./contexts/AuthRoleContext";
import { ActiveCallProvider } from "./contexts/ActiveCallContext";
import { CalendarPanel } from "@/components/CalendarPanel";
import { SessionTracker } from "@/components/SessionTracker";
import { AppHeader } from "@/components/AppHeader";
import { ClaimBanner } from "@/components/ClaimBanner";
import { API_URL } from "@/lib/api";

const PING_INTERVAL_MS = 8 * 60 * 1000; // 8 min — keeps Render warm (sleeps after 15 min)

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  useEffect(() => {
    const ping = () => fetch(`${API_URL}/health`, { method: "GET" }).catch(() => {});
    ping(); // immediate ping on mount to wake server if sleeping
    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <AuthRoleProvider>
      <ActiveCallProvider>
        <SessionTracker />
        <div className="flex min-h-screen bg-background">
          <Sidebar />

          <main className="ml-[220px] flex-1 min-h-screen flex flex-col">
            <AppHeader onOpenCalendar={() => setIsCalendarOpen(true)} />
            <ClaimBanner />
            <div className="p-7 max-w-[1400px] relative w-full">
              {children}
            </div>
          </main>

          <CalendarPanel
            isOpen={isCalendarOpen}
            onClose={() => setIsCalendarOpen(false)}
          />
        </div>
      </ActiveCallProvider>
    </AuthRoleProvider>
  );
}
