"use client";
import { RefreshCw } from "lucide-react";
import { useAuthRole } from "../contexts/AuthRoleContext";
import CallerView from "./CallerView";
import AdminView from "./AdminView";

export default function TelecallingPage() {
  const { role, callerId, loading } = useAuthRole();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (role === "caller") {
    return <CallerView callerId={callerId} />;
  }

  return <AdminView />;
}
