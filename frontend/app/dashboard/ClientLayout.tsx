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

const PING_INTERVAL_MS = 8 * 60 * 1000; // 8 min — keeps Render warm (sleeps after 15 min)

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isInboxSidebarOpen, setIsInboxSidebarOpen] = useState(false);
  const pathname = usePathname();
  // The conversations route renders its own thin inbox rail (Bulkwise-style) and
  // fills the viewport, so we suppress the labeled sidebar + app header there.
  const isInbox = pathname?.startsWith("/dashboard/conversations") ?? false;

  useEffect(() => {
    const ping = () => fetch(`${API_URL}/health`, { method: "GET" }).catch(() => {});
    ping(); // immediate ping on mount to wake server if sleeping
    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleOpen = () => setIsInboxSidebarOpen(true);
    const handleClose = () => setIsInboxSidebarOpen(false);
    window.addEventListener("open-inbox-sidebar", handleOpen);
    window.addEventListener("close-inbox-sidebar", handleClose);
    return () => {
      window.removeEventListener("open-inbox-sidebar", handleOpen);
      window.removeEventListener("close-inbox-sidebar", handleClose);
    };
  }, []);

  useEffect(() => {
    setIsInboxSidebarOpen(false);
  }, [pathname]);

  if (isInbox) {
    return (
      <AuthRoleProvider>
        <ActiveCallProvider>
          <SessionTracker />
          <div className="h-screen bg-background overflow-hidden relative">
            {isInboxSidebarOpen && (
              <>
                {/* Backdrop */}
                <div
                  onClick={() => setIsInboxSidebarOpen(false)}
                  className="fixed inset-0 bg-black/45 backdrop-blur-xs z-40 transition-opacity cursor-pointer"
                />
                {/* Labeled Sidebar Drawer Overlay */}
                <div className="fixed left-0 top-0 bottom-0 w-[220px] z-50 [&>aside]:z-50 [&>aside]:shadow-2xl animate-in slide-in-from-left duration-200">
                  <Sidebar />
                </div>
              </>
            )}
            {children}
          </div>
          <CalendarPanel isOpen={isCalendarOpen} onClose={() => setIsCalendarOpen(false)} />
        </ActiveCallProvider>
      </AuthRoleProvider>
    );
  }

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
