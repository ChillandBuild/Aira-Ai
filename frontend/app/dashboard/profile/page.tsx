import { createClient } from "@/lib/supabase/server";
import { serverFetchJson } from "@/lib/serverApi";
import type { CallerStats, CallLog } from "@/lib/api";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // stats + perf are independent — fetch in parallel so a cold backend doesn't
  // stack sequential 2.5s timeouts. logs needs caller_id, so it follows stats.
  const [stats, perf] = await Promise.all([
    serverFetchJson<CallerStats>("/api/v1/callers/my-stats", token),
    serverFetchJson<{ target: number; achieved: number }>("/api/v1/callers/my-performance", token),
  ]);

  let logs: CallLog[] | null = null;
  if (stats?.caller_id) {
    logs = await serverFetchJson<CallLog[]>(`/api/v1/callers/${stats.caller_id}/logs`, token);
  }

  return (
    <ProfileClient
      fallbackStats={stats}
      fallbackPerformance={perf}
      fallbackLogs={logs}
    />
  );
}
