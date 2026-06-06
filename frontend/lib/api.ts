import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://aira-ai-5tfr.onrender.com";
const MAX_LEADS_LIST_LIMIT = 200;

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export interface Lead {
  id: string;
  phone: string | null;
  name: string | null;
  source: string;
  score: number;
  segment: "A" | "B" | "C" | "D";
  ai_enabled: boolean;
  opted_out: boolean;
  converted_at?: string | null;
  assigned_to?: string | null;
  needs_human_intervention?: boolean;
  tg_username?: string | null;
  ig_user_id?: string | null;
  fb_user_id?: string | null;
  ad_campaign_id?: string | null;
  created_at: string;
  last_message_content?: string | null;
  pinned_at?: string | null;
}

export interface Message {
  id: string;
  lead_id: string;
  direction: "inbound" | "outbound";
  channel: string;
  content: string;
  is_ai_generated: boolean;
  reply_source?: "knowledge" | "ai" | null;
  meta_message_id?: string | null;
  media_url?: string | null;
  media_type?: "image" | "document" | "audio" | "video" | "sticker" | null;
  media_filename?: string | null;
  media_mime_type?: string | null;
  created_at: string;
}

export interface Caller {
  id: string;
  name: string;
  phone: string | null;
  overall_score: number;
  active: boolean;
  status?: "active" | "idle";
  status_changed_at?: string;
}

export interface CallerStats {
  calls_today: number;
  calls_this_week: number;
  conversion_rate_week: number;
  avg_duration_seconds: number | null;
  pending_hot_leads: number;
  overall_score: number;
  name: string;
  phone: string;
  status: string;
  caller_id: string;
}

export type Disposition = "answered" | "no_answer" | "busy" | "switched_off" | "followup_required";

export interface CallLog {
  id: string;
  lead_id: string | null;
  call_sid: string | null;
  duration_seconds: number | null;
  outcome: "converted" | "callback" | "not_interested" | "no_answer" | null;
  recording_url: string | null;
  score: number | null;
  status: string;
  ai_summary: {
    course?: string;
    budget?: string;
    timeline?: string;
    next_action?: string;
    sentiment?: string;
  } | null;
  transcript: string | null;
  created_at: string;
  leads?: { phone: string | null; name: string | null } | null;
}

export interface SegmentTemplate {
  id: string;
  segment: "A" | "B" | "C" | "D";
  message: string;
  enabled: boolean;
  updated_at: string;
}

export interface BroadcastResult {
  total: number;
  sent: number;
  failed: number;
  skipped_window: number;
}

export interface AIPrompt {
  id: string;
  name: string;
  content: string;
  updated_at: string;
}

export interface TuneSuggestion {
  id: string;
  for_prompt: string;
  suggestion: string;
  rationale: string | null;
  status: "pending" | "applied" | "rejected";
  created_at: string;
}

export interface AnalyzeResult {
  analyzed_leads: number;
  suggestions_created: number;
  data: TuneSuggestion[];
}

export interface SystemStatus {
  has_meta: boolean;
  has_gemini: boolean;
  has_groq: boolean;
  supabase_url: string;
  active_prompt: { name: string; updated_at: string } | null;
}

export interface AnalyticsOverview {
  daily_leads: { day: string; count: number }[];
  daily_messages: { day: string; inbound: number; outbound: number }[];
  funnel: { inquiries: number; engaged: number; hot: number; converted: number };
  ai_vs_human: { ai: number; human: number };
  unreplied_24h: number;
  converted_7d: number;
  ai_handled_today: number;
  by_segment: Record<"A" | "B" | "C" | "D", number>;
}

export interface FollowUpQueueItem {
  id: string;
  lead_id: string;
  cadence: "1d" | "1w" | "1m";
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  message_preview: string | null;
  skip_reason: string | null;
  last_error: string | null;
  lead_name: string | null;
  phone: string | null;
  segment: "A" | "B" | "C" | "D" | null;
}

export interface FollowUpSummary {
  pending: number;
  due_now: number;
  sent_7d: number;
  failed_7d: number;
  skipped_7d: number;
  by_cadence: { cadence: "1d" | "1w" | "1m"; pending: number; due_now: number; sent_7d: number }[];
  queue: FollowUpQueueItem[];
}

export interface FollowUpRunResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  summary: FollowUpSummary;
}

export interface AdCampaignInsight {
  id: string;
  platform: "instagram" | "facebook" | "google";
  campaign_name: string;
  external_campaign_id: string | null;
  spend_inr: number;
  total_leads: number;
  progressive_leads: number;
  conversion_count: number;
  engaged_count: number;
  hot_count: number;
  segment_mix: { A: number; B: number; C: number; D: number };
  progressive_rate: number;
  conversion_rate: number;
  engaged_rate: number;
  cost_per_lead: number | null;
  cost_per_conversion: number | null;
  budget_recommendation: "increase" | "hold" | "decrease";
  suggestions: string[];
  adset_examples: string[];
  creative_examples: string[];
}

export interface AdPerformanceSummary {
  totals: {
    campaigns: number;
    tracked_leads: number;
    progressive_rate: number;
    conversion_rate: number;
    recommend_increase: number;
    recommend_decrease: number;
  };
  campaigns: AdCampaignInsight[];
}

export interface TeamMember {
  user_id: string;
  role: "owner" | "caller";
  created_at: string;
  caller_profile: {
    id: string;
    name: string | null;
    phone: string | null;
    overall_score: number | null;
    active: boolean;
    telecmi_agent_id: string | null;
  } | null;
}

export interface MyProfile {
  tenant_id: string;
  role: "owner" | "caller";
  caller_profile: {
    id: string;
    name: string | null;
    phone: string | null;
    overall_score: number | null;
  } | null;
}

export interface WhatsAppAnalytics {
  messages_sent_today: number;
  messages_received_today: number;
  ai_reply_count_today: number;
  avg_reply_time_seconds: number | null;
}

export interface TelecallingAnalytics {
  calls_today: number;
  calls_this_week: number;
  avg_duration_seconds: number | null;
  outcome_breakdown: { converted: number; callback: number; not_interested: number; no_answer: number };
  per_caller: { caller_id: string; name: string; calls_today: number; overall_score: number | null }[];
}

export interface FunnelAnalytics {
  total_leads: number;
  by_segment: { A: number; B: number; C: number; D: number };
  by_source: { whatsapp: number; instagram: number; upload: number };
  leads_this_week: number;
  avg_score: number | null;
}

export interface AnalyticsOverviewExtended {
  daily_leads: { day: string; count: number }[];
  daily_messages: { day: string; inbound: number; outbound: number }[];
  funnel: { inquiries: number; engaged: number; hot: number; converted: number };
  ai_vs_human: { ai: number; human: number };
  unreplied_24h: number;
  converted_7d: number;
  converted_today: number;
  ai_handled_today: number;
  by_segment: Record<"A" | "B" | "C" | "D", number>;
  channel_breakdown: { whatsapp: number; instagram: number; facebook: number; telegram: number; upload: number; manual: number };
  total_leads: number;
}

export interface MessagingAnalytics {
  sent_today: number;
  received_today: number;
  ai_reply_rate: number | null;
  reply_source_breakdown: { ai: number; knowledge: number; manual: number; unknown: number };
  daily_messages: { day: string; inbound: number; outbound: number }[];
}

export interface TelecallingAnalyticsExtended {
  calls_today: number;
  calls_this_week: number;
  avg_duration_seconds: number | null;
  total_minutes_today: number;
  outcome_breakdown: { converted: number; callback: number; not_interested: number; no_answer: number };
  per_caller: {
    caller_id: string;
    name: string;
    calls_today: number;
    overall_score: number | null;
    total_minutes_today: number;
    conversion_rate: number | null;
  }[];
  calls_per_hour: { hour: number; label: string; count: number }[];
  calls_per_slot: { slot: string; count: number; caller_counts: Record<string, number> }[];
}

export interface FunnelAnalyticsExtended {
  total_leads: number;
  by_segment: { A: number; B: number; C: number; D: number };
  by_source: { whatsapp: number; instagram: number; facebook: number; telegram: number; upload: number; manual: number };
  leads_this_week: number;
  avg_score: number | null;
  score_histogram: { range: string; count: number }[];
  hot_lead_aging: { bucket: string; count: number }[];
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(opts.headers as Record<string, string> ?? {}),
      },
    });
    if (!res.ok) {
      if (res.status === 401 && typeof window !== "undefined") {
        window.location.href = "/login";
      }
      const err = await res.json().catch(() => ({ detail: "Request failed" }));
      throw new Error(err.detail || "Request failed");
    }
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out — server took too long to respond");
    }
    if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) {
      throw new Error("Cannot reach server — it may be restarting. Try again in 30 seconds.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  leads: {
    list: async (params?: { segment?: string; limit?: number; skip?: number; assigned_to?: string }) => {
      const qs = new URLSearchParams();
      if (params?.segment) qs.set("segment", params.segment);
      if (params?.assigned_to) qs.set("assigned_to", params.assigned_to);
      if (typeof params?.limit === "number" && Number.isFinite(params.limit)) {
        const normalizedLimit = Math.min(Math.max(Math.trunc(params.limit), 1), MAX_LEADS_LIST_LIMIT);
        qs.set("limit", String(normalizedLimit));
      }
      if (params?.skip) qs.set("skip", String(params.skip));
      const res = await apiFetch<{ data: Lead[] }>(`/api/v1/leads/?${qs}`);
      return res.data || [];
    },
    get: (id: string) => apiFetch<Lead>(`/api/v1/leads/${id}`),
    update: (id: string, data: Partial<Pick<Lead, "name" | "score" | "segment">>) =>
      apiFetch<Lead>(`/api/v1/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    convert: (id: string, notes?: string) =>
      apiFetch<Lead>(`/api/v1/leads/${id}/convert`, {
        method: "POST",
        body: JSON.stringify({ notes: notes ?? null }),
      }),
    toggleAI: (id: string, enabled: boolean) =>
      apiFetch<Lead>(`/api/v1/leads/${id}/ai`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    sendMessage: (id: string, content: string) =>
      apiFetch<Message>(`/api/v1/leads/${id}/send`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    sendMedia: async (id: string, file: File, caption?: string): Promise<Message> => {
      const authHeaders = await getAuthHeaders();
      const fd = new FormData();
      fd.append("file", file);
      if (caption) fd.append("caption", caption);
      const res = await fetch(`${API_URL}/api/v1/leads/${id}/send-media`, {
        method: "POST",
        body: fd,
        headers: { ...authHeaders },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Media send failed" }));
        throw new Error(err.detail || "Media send failed");
      }
      return res.json();
    },
    compose: (phone: string, content: string, name?: string) =>
      apiFetch<{ lead_id: string; sid: string; phone: string }>(`/api/v1/leads/compose`, {
        method: "POST",
        body: JSON.stringify({ phone, content, name }),
      }),
    delete: (id: string) =>
      apiFetch<{ success: boolean; message: string }>(`/api/v1/leads/${id}`, {
        method: "DELETE",
      }),
    clearChat: (id: string) =>
      apiFetch<{ success: boolean; message: string }>(`/api/v1/leads/${id}/clear-chat`, {
        method: "DELETE",
      }),
    pin: (id: string) =>
      apiFetch<Lead>(`/api/v1/leads/${id}/pin`, {
        method: "PATCH",
      }),
    release: (id: string) =>
      apiFetch<{ released: boolean }>(`/api/v1/leads/${id}/release`, {
        method: "PATCH",
      }),
    messages: async (id: string) => {
      const res = await apiFetch<Message[] | { data: Message[] }>(`/api/v1/leads/${id}/messages`);
      return Array.isArray(res) ? res : res.data || [];
    },
    callLogs: async (leadId: string) => {
      const res = await apiFetch<{ data: CallLog[] }>(`/api/v1/leads/${leadId}/call-logs`);
      return res.data || [];
    },
    exportUrl: (segment?: string) =>
      `${API_URL}/api/v1/leads/export${segment ? `?segment=${segment}` : ""}`,
    exportLeads: async (segment?: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/leads/export${segment ? `?segment=${segment}` : ""}`, { headers });
      if (!res.ok) throw new Error(`Export failed: ${res.status} ${res.statusText}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads_${segment || "all"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
  },
  callers: {
    create: (name: string, phone: string) =>
      apiFetch<Caller>(`/api/v1/callers/`, {
        method: "POST",
        body: JSON.stringify({ name, phone }),
      }),
    update: (id: string, data: { name?: string; phone?: string; telecmi_agent_id?: string | null }) =>
      apiFetch<Caller>(`/api/v1/callers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      apiFetch<{ deleted: boolean }>(`/api/v1/callers/${id}`, { method: "DELETE" }),
    list: async () => {
      const res = await apiFetch<{ data: Caller[] }>(`/api/v1/callers/`);
      return res.data || [];
    },
    logs: async (id: string) => {
      const res = await apiFetch<{ data: CallLog[] }>(`/api/v1/callers/${id}/logs`);
      return res.data || [];
    },
    coaching: (id: string) =>
      apiFetch<{ caller_id: string; tip: string }>(`/api/v1/callers/${id}/coaching`),
    myStatus: () =>
      apiFetch<{ status: string; caller_id: string | null }>(`/api/v1/callers/my-status`),
    setMyStatus: (status: "active" | "idle") =>
      apiFetch<{ status: string; changed_at: string }>(`/api/v1/callers/my-status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    myStats: () =>
      apiFetch<CallerStats>(`/api/v1/callers/my-stats`),
    statusSummary: (id: string) =>
      apiFetch<{ active_minutes_today: number; idle_minutes_today: number; current_status: string; since: string }>(`/api/v1/callers/${id}/status-summary`),
    winners: () =>
      apiFetch<{
        daily: { caller_id: string; name: string; value: number; label: string } | null;
        monthly: { caller_id: string; name: string; value: number; calls_this_month: number; label: string } | null;
      }>(`/api/v1/callers/winners`),
  },
  calls: {
    initiate: (target: { leadId?: string; phone?: string }, callerId?: string) =>
      apiFetch<{ call_log_id: string; call_sid: string; status: string; lead_id: string | null; lead_name: string | null }>(
        `/api/v1/calls/initiate`,
        { method: "POST", body: JSON.stringify({ lead_id: target.leadId, phone: target.phone, caller_id: callerId }) }
      ),
    setOutcome: (callLogId: string, outcome: NonNullable<CallLog["outcome"]>, callbackTime?: string) =>
      apiFetch<{
        call_log_id: string;
        outcome: string;
        score: number;
        caller_overall_score: number | null;
      }>(`/api/v1/calls/${callLogId}/outcome`, {
        method: "PATCH",
        body: JSON.stringify({ outcome, callback_time: callbackTime ?? null }),
      }),
    setDisposition: (
      callLogId: string,
      disposition: Disposition,
      opts?: { notes?: string; callbackTime?: string },
    ) =>
      apiFetch<{
        call_log_id: string;
        outcome: string | null;
        disposition: string | null;
        score: number | null;
        caller_overall_score: number | null;
      }>(`/api/v1/calls/${callLogId}/outcome`, {
        method: "PATCH",
        body: JSON.stringify({
          disposition,
          notes: opts?.notes ?? null,
          callback_time: opts?.callbackTime ?? null,
        }),
      }),
    statsToday: () =>
      apiFetch<{ calls_today: number; conversions_today: number }>(`/api/v1/calls/stats-today`),
    recentByLeads: (leadIds: string[]) =>
      apiFetch<Record<string, string>>(
        `/api/v1/calls/recent-by-leads?lead_ids=${leadIds.slice(0, 50).join(",")}`,
      ),
    deleteLog: (callLogId: string) =>
      apiFetch<{ deleted: boolean }>(`/api/v1/calls/${callLogId}`, { method: "DELETE" }),
  },
  notes: {
    leadsWithActivity: () =>
      apiFetch<{ data: { id: string; name: string | null; phone: string; score: number; segment: string; assigned_to: string | null }[] }>(
        `/api/v1/lead-notes/leads-with-activity`
      ),
    update: (noteId: string, data: { content?: string; is_pinned?: boolean; tags?: string[] }) =>
      apiFetch<{ id: string; content: string; is_pinned: boolean; tags: string[] }>(
        `/api/v1/lead-notes/note/${noteId}`,
        { method: "PATCH", body: JSON.stringify(data) }
      ),
    delete: (noteId: string) =>
      apiFetch<{ deleted: boolean }>(`/api/v1/lead-notes/note/${noteId}`, { method: "DELETE" }),
  },
  segments: {
    templates: async () => {
      const res = await apiFetch<{ data: SegmentTemplate[] }>(`/api/v1/segments/templates`);
      return res.data || [];
    },
    saveTemplate: (segment: string, message: string, enabled = true) =>
      apiFetch<SegmentTemplate>(`/api/v1/segments/templates/${segment}`, {
        method: "PUT",
        body: JSON.stringify({ message, enabled }),
      }),
    broadcast: (segment: string) =>
      apiFetch<BroadcastResult>(`/api/v1/segments/${segment}/broadcast`, { method: "POST" }),
  },
  knowledge: {
    listDocuments: async () => {
      const res = await apiFetch<{ data: Array<{id:string;name:string;size_bytes:number;file_type:string;status:string;created_at:string;chunk_count?:number}> }>(`/api/v1/knowledge/documents`);
      return res.data || [];
    },
    uploadDocument: async (file: File, campaignTagId?: string | null) => {
      const authHeaders = await getAuthHeaders();
      const fd = new FormData();
      fd.append("file", file);
      if (campaignTagId) fd.append("campaign_tag_id", campaignTagId);
      const res = await fetch(`${API_URL}/api/v1/knowledge/upload-document`, {
        method: "POST",
        body: fd,
        headers: { ...authHeaders },
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    deleteDocument: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/v1/knowledge/documents/${id}`, {
        method: "DELETE",
      }),
    listCampaignTags: async () => {
      const res = await apiFetch<{ data: Array<{ id: string; name: string; color?: string }> }>(`/api/v1/broadcast-tags/`);
      return res.data || [];
    },
  },
  aiTune: {
    prompts: async () => {
      const res = await apiFetch<{ data: AIPrompt[] }>(`/api/v1/ai-tune/prompts`);
      return res.data || [];
    },
    updatePrompt: (name: string, content: string) =>
      apiFetch<AIPrompt>(`/api/v1/ai-tune/prompts/${name}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      }),
    analyze: (forPrompt = "whatsapp_reply") =>
      apiFetch<AnalyzeResult>(
        `/api/v1/ai-tune/analyze?for_prompt=${encodeURIComponent(forPrompt)}`,
        { method: "POST" },
      ),
    suggestions: async (status: "pending" | "applied" | "rejected" | "all" = "pending") => {
      const res = await apiFetch<{ data: TuneSuggestion[] }>(
        `/api/v1/ai-tune/suggestions?status=${status}`,
      );
      return res.data || [];
    },
    apply: (id: string) =>
      apiFetch<{ applied: boolean; for_prompt: string; new_length: number }>(
        `/api/v1/ai-tune/suggestions/${id}/apply`,
        { method: "POST" },
      ),
    reject: (id: string) =>
      apiFetch<{ rejected: boolean }>(`/api/v1/ai-tune/suggestions/${id}/reject`, {
        method: "POST",
      }),
  },
  system: {
    status: () => apiFetch<SystemStatus>(`/api/v1/system/status`),
  },
  analytics: {
    overview: () => apiFetch<AnalyticsOverview>(`/api/v1/analytics/overview`),
    adPerformance: () => apiFetch<AdPerformanceSummary>(`/api/v1/analytics/ad-performance`),
    whatsapp: () => apiFetch<WhatsAppAnalytics>(`/api/v1/analytics/whatsapp`),
    telecalling: () => apiFetch<TelecallingAnalytics>(`/api/v1/analytics/telecalling`),
    funnel: () => apiFetch<FunnelAnalytics>(`/api/v1/analytics/funnel`),
    overviewExtended: (range: "today" | "7d" | "30d" = "7d") =>
      apiFetch<AnalyticsOverviewExtended>(`/api/v1/analytics/overview?range=${range}`),
    messaging: (channel: string = "all", range: "today" | "7d" | "30d" = "7d") =>
      apiFetch<MessagingAnalytics>(`/api/v1/analytics/messaging?channel=${channel}&range=${range}`),
    telecallingExtended: () =>
      apiFetch<TelecallingAnalyticsExtended>(`/api/v1/analytics/telecalling`),
    funnelExtended: () =>
      apiFetch<FunnelAnalyticsExtended>(`/api/v1/analytics/funnel`),
  },
  insights: {
    whatsapp: (params?: { range?: string; since?: string; until?: string; source?: string }) => {
      const qs = new URLSearchParams();
      if (params?.range) qs.set("range", params.range);
      if (params?.since) qs.set("since", params.since);
      if (params?.until) qs.set("until", params.until);
      if (params?.source) qs.set("source", params.source);
      const q = qs.toString();
      return apiFetch(`/api/v1/insights/whatsapp${q ? `?${q}` : ""}`);
    },
    sync: () => apiFetch(`/api/v1/insights/sync`, { method: "POST" }),
    trends: (range = "30d") => apiFetch(`/api/v1/insights/trends?range=${range}`),
  },
  followUps: {
    summary: () => apiFetch<FollowUpSummary>(`/api/v1/follow-ups/summary`),
    run: (limit = 20) =>
      apiFetch<FollowUpRunResult>(`/api/v1/follow-ups/run?limit=${limit}`, {
        method: "POST",
      }),
  },
  upload: {
    leads: async (
      file: File,
      options?: {
        campaignMessage?: string;
        segmentOverride?: string;
        platform?: string;
        campaignName?: string;
        externalCampaignId?: string;
        adSetName?: string;
        externalAdSetId?: string;
        adName?: string;
        externalAdId?: string;
        utmSource?: string;
        utmCampaign?: string;
        utmContent?: string;
        spendInr?: string;
      },
    ) => {
      const fd = new FormData();
      fd.append("file", file);
      if (options?.campaignMessage) fd.append("campaign_message", options.campaignMessage);
      if (options?.segmentOverride) fd.append("segment_override", options.segmentOverride);
      if (options?.platform) fd.append("platform", options.platform);
      if (options?.campaignName) fd.append("campaign_name", options.campaignName);
      if (options?.externalCampaignId) fd.append("external_campaign_id", options.externalCampaignId);
      if (options?.adSetName) fd.append("ad_set_name", options.adSetName);
      if (options?.externalAdSetId) fd.append("external_ad_set_id", options.externalAdSetId);
      if (options?.adName) fd.append("ad_name", options.adName);
      if (options?.externalAdId) fd.append("external_ad_id", options.externalAdId);
      if (options?.utmSource) fd.append("utm_source", options.utmSource);
      if (options?.utmCampaign) fd.append("utm_campaign", options.utmCampaign);
      if (options?.utmContent) fd.append("utm_content", options.utmContent);
      if (options?.spendInr) fd.append("spend_inr", options.spendInr);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/upload/leads`, { method: "POST", body: fd, headers: { ...authHeaders } });
      if (!res.ok) throw new Error(`Upload failed ${res.status}: ${await res.text()}`);
      return res.json() as Promise<{
        total: number;
        inserted: number;
        skipped: number;
        attributed: number;
        campaign_sent: number;
        campaign_failed: number;
      }>;
    },
  },
  onboarding: {
    status: () =>
      apiFetch<{ has_tenant: boolean; tenant_id?: string; role?: string }>("/api/v1/onboarding/status"),
    create: (name: string) =>
      apiFetch<{ tenant_id: string; already_exists: boolean }>("/api/v1/onboarding/", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
  },
  team: {
    me: () => apiFetch<MyProfile>("/api/v1/team/me"),
    list: () => apiFetch<{ data: TeamMember[] }>("/api/v1/team/"),
    invite: (email: string, password: string, name?: string, phone?: string, telecmiAgentId?: string) =>
      apiFetch<{ invited: boolean; email: string; user_id: string }>("/api/v1/team/invite", {
        method: "POST",
        body: JSON.stringify({ email, password, name, phone, telecmi_agent_id: telecmiAgentId }),
      }),
    remove: (userId: string) =>
      apiFetch<{ removed: boolean }>(`/api/v1/team/${userId}`, { method: "DELETE" }),
  },
  todos: {
    list: async (params?: { start_date?: string; end_date?: string }) => {
      const qs = new URLSearchParams();
      if (params?.start_date) qs.set("start_date", params.start_date);
      if (params?.end_date) qs.set("end_date", params.end_date);
      return apiFetch<Todo[]>(`/api/v1/todos/?${qs}`);
    },
    create: (data: { todo_date: string; content: string }) =>
      apiFetch<Todo>(`/api/v1/todos/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/v1/todos/${id}`, {
        method: "DELETE",
      }),
    update: (id: string, data: { is_completed?: boolean; content?: string }) =>
      apiFetch<Todo>(`/api/v1/todos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },
  ctwaLeads: {
    campaigns: async () => {
      const res = await apiFetch<{ data: { id: string; campaign_name: string; platform: string }[] }>(`/api/v1/ctwa-leads/campaigns`);
      return res.data || [];
    },
    list: async (params?: {
      ad_campaign_id?: string;
      source?: string;
      date_from?: string;
      date_to?: string;
      page?: number;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.ad_campaign_id) qs.set("ad_campaign_id", params.ad_campaign_id);
      if (params?.source) qs.set("source", params.source);
      if (params?.date_from) qs.set("date_from", params.date_from);
      if (params?.date_to) qs.set("date_to", params.date_to);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      return apiFetch<{ data: CtwaLead[]; total: number; page: number; limit: number }>(`/api/v1/ctwa-leads/?${qs}`);
    },
    exportCsv: async (params?: {
      ad_campaign_id?: string;
      source?: string;
      date_from?: string;
      date_to?: string;
    }) => {
      const qs = new URLSearchParams();
      if (params?.ad_campaign_id) qs.set("ad_campaign_id", params.ad_campaign_id);
      if (params?.source) qs.set("source", params.source);
      if (params?.date_from) qs.set("date_from", params.date_from);
      if (params?.date_to) qs.set("date_to", params.date_to);
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/ctwa-leads/export?${qs}`, { headers });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ctwa_leads_ad_traffic.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
  },
};

export interface Todo {
  id: string;
  todo_date: string;
  content: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CtwaLead {
  id: string;
  phone: string;
  name: string;
  source: string;
  channel_label: string;
  score: number;
  segment: string;
  segment_label: string;
  created_at: string;
  ad_campaign_id: string | null;
  campaign_name: string;
  campaign_platform: string;
  keyword: string;
}

export { API_URL };
