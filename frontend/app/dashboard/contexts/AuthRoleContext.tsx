"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface RoleCtx {
  role: "owner" | "caller" | null;
  callerId: string | null;
  loading: boolean;
}

const AuthRoleContext = createContext<RoleCtx>({ role: null, callerId: null, loading: true });

export function AuthRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<"owner" | "caller" | null>(null);
  const [callerId, setCallerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuthHeaders()
      .then(async (auth) => {
        const res = await fetch(`${API_URL}/api/v1/team/me`, { headers: auth });
        const d = await res.json();
        setRole(d.role as "owner" | "caller");
        setCallerId(d.caller_id);
      })
      .catch(() => setRole("owner"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthRoleContext.Provider value={{ role, callerId, loading }}>
      {children}
    </AuthRoleContext.Provider>
  );
}

export const useAuthRole = () => useContext(AuthRoleContext);
