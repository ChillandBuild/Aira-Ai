import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_LEADS_LIST_LIMIT = 200;

async function getAuthHeaders(): Promise<Record<string, string>> {
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
  created_at: string;
}

export interface Message {
  id: string;
  lead_id: string;
  direction: "inbound" | "outbound";
  channel: string;
  content: string;
  is_ai_generated: boolean;
  twilio_message_sid: string | null;
  created_at: string;
}

export interface Caller {
  id: string;
  name: string;
  phone: string | null;
  overall_score: number;
  active: boolean;
}

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

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  hit_count: number;
  active: boolean;
  created_at?: string;
}

export interface FAQInput {
  question: string;
  answer: string;
  keywords: string[];
  active?: boolean;
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
  twilio_number: string | null;
  exotel_virtual_number: string | null;
  has_meta: boolean;
  has_gemini: boolean;
  supabase_url: string;
  active_prompt: { name: string; updated_at: string } | null;
  active_faq_count: number;
}

export interface AnalyticsOverview {
  daily_leads: { day: string; count: number }[];
  daily_messages: { day: string; inbound: number; outbound: number }[];
  funnel: { inquiries: number; engaged: number; hot: number; converted: number };
  ai_vs_human: { ai: number; human: number };
  unreplied_24h: number;
  converted_7d: number;
  ai_handled_today: number;
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

export interface WhatsAppAnalytics {
  messages_sent_today: number;
  messages_received_today: number;
  ai_reply_count_today: number;
  avg_reply_time_seconds: number | null;
  top_faqs: { question: string; hit_count: number }[];
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

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  leads: {
    list: async (params?: { segment?: string; limit?: number; skip?: number }) => {
      const qs = new URLSearchParams();
      if (params?.segment) qs.set("segment", params.segment);
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
    compose: (phone: string, content: string, name?: string) =>
      apiFetch<{ lead_id: string; sid: string; phone: string }>(`/api/v1/leads/compose`, {
        method: "POST",
        body: JSON.stringify({ phone, content, name }),
      }),
    delete: (id: string) =>
      apiFetch<{ success: boolean; message: string }>(`/api/v1/leads/${id}`, {
        method: "DELETE",
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
  },
  callers: {
    create: (name: string, phone: string) =>
      apiFetch<Caller>(`/api/v1/callers/`, {
        method: "POST",
        body: JSON.stringify({ name, phone }),
      }),
    update: (id: string, data: { name?: string; phone?: string }) =>
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
    recentByLeads: (leadIds: string[]) =>
      apiFetch<Record<string, string>>(
        `/api/v1/calls/recent-by-leads?lead_ids=${leadIds.slice(0, 50).join(",")}`,
      ),
    deleteLog: (callLogId: string) =>
      apiFetch<{ deleted: boolean }>(`/api/v1/calls/${callLogId}`, { method: "DELETE" }),
  },
  notes: {
    update: (noteId: string, data: { content?: string; is_pinned?: boolean }) =>
      apiFetch<{ id: string; content: string; is_pinned: boolean }>(
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
    list: async () => {
      const res = await apiFetch<{ data: FAQ[] }>(`/api/v1/knowledge/faqs`);
      return res.data || [];
    },
    create: (payload: FAQInput) =>
      apiFetch<FAQ>(`/api/v1/knowledge/faqs`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Partial<FAQInput>) =>
      apiFetch<FAQ>(`/api/v1/knowledge/faqs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    remove: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/v1/knowledge/faqs/${id}`, {
        method: "DELETE",
      }),
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
};

export { API_URL };
