"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface RoleCtx {
  role: "owner" | "caller" | null;
  callerId: string | null;
  enabledFeatures: string[];
  isSystemAdmin: boolean;
  loading: boolean;
}

const AuthRoleContext = createContext<RoleCtx>({
  role: null,
  callerId: null,
  enabledFeatures: ["whatsapp", "telecalling"],
  isSystemAdmin: false,
  loading: true,
});

export function AuthRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<"owner" | "caller" | null>(null);
  const [callerId, setCallerId] = useState<string | null>(null);
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>(["whatsapp", "telecalling"]);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMe(retries = 2, delayMs = 4000): Promise<void> {
      const auth = await getAuthHeaders();
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const res = await fetch(`${API_URL}/api/v1/team/me`, { headers: auth });
          if (!res.ok) throw new Error(`team/me ${res.status}`);
          const d = await res.json();
          setRole(d.role as "owner" | "caller");
          setCallerId(d.caller_id ?? null);
          setEnabledFeatures(d.enabled_features ?? ["whatsapp", "telecalling"]);
          setIsSystemAdmin(d.is_system_admin ?? false);
          return;
        } catch {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      }
      // All retries exhausted — leave role null (blank sidebar, not admin access)
      setRole(null);
    }

    fetchMe().finally(() => setLoading(false));
  }, []);

  return (
    <AuthRoleContext.Provider value={{ role, callerId, enabledFeatures, isSystemAdmin, loading }}>
      {children}
    </AuthRoleContext.Provider>
  );
}

export const useAuthRole = () => useContext(AuthRoleContext);
