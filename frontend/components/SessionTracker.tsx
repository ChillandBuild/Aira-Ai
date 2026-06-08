"use client";

import { useEffect, useRef } from "react";
import { useAuthRole } from "@/app/dashboard/contexts/AuthRoleContext";
import { api } from "@/lib/api";

export function SessionTracker() {
  const { role, callerId } = useAuthRole();
  const autoLoginRef = useRef(false);

  useEffect(() => {
    if (role === "caller" && callerId && !autoLoginRef.current) {
      autoLoginRef.current = true;
      // Force caller status to active globally upon entering the dashboard
      api.callers.setMyStatus("active").catch(console.error);
    }
  }, [role, callerId]);

  return null;
}
