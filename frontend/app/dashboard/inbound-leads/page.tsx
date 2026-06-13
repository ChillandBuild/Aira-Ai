import { createClient } from "@/lib/supabase/server";
import { serverFetchJson } from "@/lib/serverApi";
import type { InboundLead } from "@/lib/api";
import { InboundLeadsClient } from "./InboundLeadsClient";

export default async function InboundLeadsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const [inboundLeadsRes, campaignsRes] = await Promise.all([
    serverFetchJson<{ data: InboundLead[]; total: number; page: number; limit: number }>(
      "/api/v1/inbound-leads/?limit=200",
      token,
    ),
    serverFetchJson<{ data: { id: string; campaign_name: string; platform: string }[] }>(
      "/api/v1/inbound-leads/campaigns",
      token,
    ),
  ]);

  const inboundLeads = inboundLeadsRes;
  const campaigns = campaignsRes?.data ?? null;

  return (
    <InboundLeadsClient
      fallbackInboundLeads={inboundLeads}
      fallbackCampaigns={campaigns}
    />
  );
}
