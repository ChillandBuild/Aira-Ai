"use client";
import { RefreshCw } from "lucide-react";
import { useAuthRole } from "../contexts/AuthRoleContext";
import { AdminDashboardData } from "@/hooks/useApi";
import CallerView from "./CallerView";
import AdminView from "./AdminView";

interface TelecallingViewProps {
  initialRole: "owner" | "caller" | null;
  initialCallerId: string | null;
  fallbackAdminData: AdminDashboardData | null;
}

export function TelecallingView({ initialRole, initialCallerId, fallbackAdminData }: TelecallingViewProps) {
  const ctx = useAuthRole();
  // Prefer the server-seeded role/callerId until the client context resolves.
  // Both read team/me, so they agree — this just skips the first-paint spinner
  // for BOTH admins (AdminView) and telecallers (CallerView).
  const role = ctx.loading ? initialRole : ctx.role;
  const callerId = ctx.loading ? initialCallerId : ctx.callerId;

  if (role === null) {
    // No server seed and context still resolving (e.g. cold backend) — brief spinner.
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (role === "caller") {
    return <CallerView callerId={callerId} />;
  }

  return <AdminView fallbackData={fallbackAdminData ?? undefined} />;
}
