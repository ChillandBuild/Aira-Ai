"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { AuthRoleProvider } from "./contexts/AuthRoleContext";
import { ActiveCallProvider } from "./contexts/ActiveCallContext";
import { CalendarPanel } from "@/components/CalendarPanel";
import { SessionTracker } from "@/components/SessionTracker";
import { AppHeader } from "@/components/AppHeader";
import { ClaimBanner } from "@/components/ClaimBanner";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

const PING_INTERVAL_MS = 8 * 60 * 1000; // 8 min — keeps Render warm (sleeps after 15 min)

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Sidebar collapse: honor the user's saved preference once they've set one;
  // otherwise default to collapsed on the chat-heavy conversations page only.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("sidebarCollapsed") : null;
    setIsSidebarCollapsed(stored !== null ? stored === "true" : pathname === "/dashboard/conversations");
  }, [pathname]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebarCollapsed", String(next)); } catch { /* storage unavailable */ }
      return next;
    });
  };

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
        <div className="flex min-h-screen bg-background overflow-x-hidden">
          <Sidebar className={isSidebarCollapsed ? "-translate-x-full" : "translate-x-0"} />

          <main className={cn(
            "flex-1 min-h-screen flex flex-col transition-all duration-300 ease-in-out",
            isSidebarCollapsed ? "ml-0" : "ml-[220px]"
          )}>
            <AppHeader
              onOpenCalendar={() => setIsCalendarOpen(true)}
              isSidebarCollapsed={isSidebarCollapsed}
              onToggleSidebar={toggleSidebar}
            />
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
