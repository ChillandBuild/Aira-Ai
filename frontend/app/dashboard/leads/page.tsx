import { createClient } from "@/lib/supabase/server";
import { serverFetchJson } from "@/lib/serverApi";
import type { Lead } from "@/lib/api";
import { LeadsClient } from "./LeadsClient";

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const seed = await serverFetchJson<{ data: Lead[] }>(
    "/api/v1/leads/?segment=A&limit=200",
    token,
  );

  return <LeadsClient fallbackLeads={seed?.data ?? null} />;
}
