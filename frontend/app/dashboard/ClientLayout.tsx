"use client";
import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { HotLeadAlertBanner } from "@/components/hot-lead-alert-banner";
import { AuthRoleProvider } from "./contexts/AuthRoleContext";
import { CalendarPanel } from "@/components/CalendarPanel";
import { Calendar } from "lucide-react";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  return (
    <AuthRoleProvider>
      <div className="flex min-h-screen bg-background">
        <HotLeadAlertBanner />
        <Sidebar />

        <main className="ml-[220px] flex-1 min-h-screen">
          <div className="p-7 max-w-[1400px] relative">
            {children}

            {/* Floating Calendar Toggle */}
            <button
              onClick={() => setIsCalendarOpen(true)}
              className="fixed bottom-8 right-8 w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 group"
              title="Schedule & Notes"
            >
              <Calendar size={24} />
              <span className="absolute right-full mr-4 px-3 py-1.5 bg-ink text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Schedule & Notes
              </span>
            </button>
          </div>
        </main>

        <CalendarPanel
          isOpen={isCalendarOpen}
          onClose={() => setIsCalendarOpen(false)}
        />
      </div>
    </AuthRoleProvider>
  );
}
