import { createClient } from "@/lib/supabase/server";
import { serverFetchJson } from "@/lib/serverApi";
import type { AnalyticsOverview } from "@/lib/api";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  // Server-seed the overview so owners paint content from the initial HTML
  // (~TTFB) instead of after a post-hydration fetch. Timeout-guarded: a cold
  // backend returns null and the client falls back to its spinner + retry.
  // Callers get a 403 → null and are redirected client-side.
  const overview = await serverFetchJson<AnalyticsOverview>(
    "/api/v1/analytics/overview",
    session?.access_token,
  );

  return <DashboardClient fallbackOverview={overview} />;
}
