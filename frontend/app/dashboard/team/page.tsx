import { createClient } from "@/lib/supabase/server";
import { serverFetchJson } from "@/lib/serverApi";
import type { TeamMember, Caller } from "@/lib/api";
import { TeamClient } from "./TeamClient";

interface TeamMe {
  role: "owner" | "caller";
}

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const me = await serverFetchJson<TeamMe>("/api/v1/team/me", token);

  let fallbackTeam: { data: TeamMember[] } | null = null;
  let fallbackCallers: Caller[] | null = null;

  if (me?.role === "owner") {
    const [teamRes, callersRes] = await Promise.all([
      serverFetchJson<{ data: TeamMember[] }>("/api/v1/team/", token),
      serverFetchJson<{ data: Caller[] }>("/api/v1/callers/", token),
    ]);
    fallbackTeam = teamRes;
    fallbackCallers = callersRes?.data ?? null;
  }

  return (
    <TeamClient
      fallbackTeam={fallbackTeam}
      fallbackCallers={fallbackCallers}
    />
  );
}
