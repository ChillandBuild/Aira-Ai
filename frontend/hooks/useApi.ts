import useSWR, { SWRConfiguration } from "swr";
import { api, AnalyticsOverview, Caller, Lead } from "@/lib/api";

// Shared SWR defaults: cache + revalidate on focus/reconnect, dedupe bursts.
// No global polling — pages opt in via refreshInterval where freshness matters.
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 5_000,
  errorRetryCount: 2,
};

export function useOverview(enabled = true, fallbackData?: AnalyticsOverview) {
  return useSWR<AnalyticsOverview>(
    enabled ? "analytics/overview" : null,
    () => api.analytics.overview(),
    { ...defaultConfig, fallbackData },
  );
}

export interface AdminDashboardData {
  callers: Caller[];
  topLeads: Lead[];
  totalCallsToday: number;
  totalConversionsToday: number;
}

export function useAdminDashboard(fallbackData?: AdminDashboardData) {
  return useSWR<AdminDashboardData>(
    "telecalling/admin-dashboard",
    async () => {
      const [callers, topLeads, stats] = await Promise.all([
        api.callers.list(),
        api.leads.list({ limit: 5 }),
        api.calls.statsToday().catch(() => ({ calls_today: 0, conversions_today: 0 })),
      ]);
      return {
        callers,
        topLeads,
        totalCallsToday: stats.calls_today,
        totalConversionsToday: stats.conversions_today,
      };
    },
    { ...defaultConfig, refreshInterval: 30_000, fallbackData },
  );
}
