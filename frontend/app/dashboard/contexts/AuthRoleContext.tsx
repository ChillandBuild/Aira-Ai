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

const CACHE_KEY = "aira_role_cache";

function readCache(): Partial<RoleCtx> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCache(data: Partial<RoleCtx>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
}

export function AuthRoleProvider({ children }: { children: ReactNode }) {
  const cached = typeof window !== "undefined" ? readCache() : null;

  const [role, setRole] = useState<"owner" | "caller" | null>(
    (cached?.role as "owner" | "caller" | null) ?? null
  );
  const [callerId, setCallerId] = useState<string | null>(cached?.callerId ?? null);
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>(
    cached?.enabledFeatures ?? ["whatsapp", "telecalling"]
  );
  const [isSystemAdmin, setIsSystemAdmin] = useState(cached?.isSystemAdmin ?? false);
  // If we have cached data, don't block render
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    async function fetchMe(retries = 3, delayMs = 5000): Promise<void> {
      const auth = await getAuthHeaders();
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const res = await fetch(`${API_URL}/api/v1/team/me`, { headers: auth });
          if (!res.ok) throw new Error(`team/me ${res.status}`);
          const d = await res.json();
          const newRole = d.role as "owner" | "caller";
          const newFeatures = d.enabled_features ?? ["whatsapp", "telecalling"];
          const newIsAdmin = d.is_system_admin ?? false;
          const newCallerId = d.caller_id ?? null;
          setRole(newRole);
          setCallerId(newCallerId);
          setEnabledFeatures(newFeatures);
          setIsSystemAdmin(newIsAdmin);
          writeCache({ role: newRole, callerId: newCallerId, enabledFeatures: newFeatures, isSystemAdmin: newIsAdmin });
          return;
        } catch {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      }
      // All retries failed — keep whatever was in cache (don't clear it)
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
