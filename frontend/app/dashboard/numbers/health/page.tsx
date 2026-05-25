"use client";
import { useEffect, useState } from "react";
import { RefreshCw, ShieldAlert, TrendingUp, UserX, Shuffle } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

type PhoneNumber = {
  id: string;
  number: string;
  display_name: string;
  status: "active" | "warming" | "restricted" | "archived";
  quality_rating: "green" | "yellow" | "red";
  messaging_tier: number;
  daily_send_count: number;
  warm_up_day: number;
};

type QualityHistoryRow = {
  id: string;
  phone_number_id: string;
  quality_rating: string;
  messaging_tier: number;
  recorded_at: string;
};

const QUALITY_LABEL: Record<PhoneNumber["quality_rating"], string> = {
  green: "HIGH",
  yellow: "MEDIUM",
  red: "LOW",
};

const QUALITY_DOT: Record<PhoneNumber["quality_rating"], string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

const QUALITY_TEXT: Record<PhoneNumber["quality_rating"], string> = {
  green: "text-emerald-600",
  yellow: "text-amber-600",
  red: "text-red-600",
};

const STATUS_STYLES: Record<PhoneNumber["status"], string> = {
  active: "bg-green-100 text-green-700",
  warming: "bg-amber-100 text-amber-700",
  restricted: "bg-red-100 text-red-700",
  archived: "bg-gray-100 text-gray-500",
};

const STATUS_LABEL: Record<PhoneNumber["status"], string> = {
  active: "Active",
  warming: "Warming",
  restricted: "Restricted",
  archived: "Archived",
};

const WARM_UP_DAYS = 14;

function getSpamRisk(quality: PhoneNumber["quality_rating"], sendRatio: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (quality === "red") return { label: "High Risk", color: "text-red-600", bg: "bg-red-100" };
  if (quality === "yellow" || sendRatio >= 0.5) return { label: "Medium Risk", color: "text-amber-600", bg: "bg-amber-100" };
  return { label: "Low Risk", color: "text-emerald-600", bg: "bg-emerald-100" };
}

const BEST_PRACTICES = [
  {
    icon: ShieldAlert,
    title: "Keep spam rate < 1%",
    desc: "If 10+ leads per 1,000 report you, quality drops. Only message opted-in leads.",
  },
  {
    icon: TrendingUp,
    title: "Respect warm-up limits",
    desc: "New numbers: 50/day → 250/day over 14 days. Never jump tiers.",
  },
  {
    icon: UserX,
    title: "Suppress cold leads",
    desc: "Leads with 3+ sends and no reply are auto-suppressed from bulk sends.",
  },
  {
    icon: Shuffle,
    title: "Rotate templates",
    desc: "Use template variations to avoid identical blasts triggering Meta's bulk detection.",
  },
];

async function apiFetch<T>(path: string): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export default function NumberHealthPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [history, setHistory] = useState<QualityHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const numbersData = await apiFetch<PhoneNumber[]>("/api/v1/numbers");
      setNumbers(Array.isArray(numbersData) ? numbersData : []);
    } catch {
      setNumbers([]);
    }
    try {
      const histData = await apiFetch<{ data: QualityHistoryRow[] }>("/api/v1/numbers/quality-history");
      setHistory(histData?.data ?? []);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Number Health</h1>
          <p className="text-sm text-on-surface-muted mt-1">
            Quality trends and spam risk for your sender pool
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-surface-mid hover:bg-surface-high border border-[#c4c7c7]/30 text-on-surface transition-colors disabled:opacity-50"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Section 1 — Per-number health cards */}
      <section>
        <h2 className="text-sm font-semibold text-on-surface-muted uppercase tracking-wide mb-4">
          Sender Numbers
        </h2>
        {loading ? (
          <div className="flex flex-wrap gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-80 h-56 rounded-card bg-surface-mid animate-pulse" />
            ))}
          </div>
        ) : numbers.length === 0 ? (
          <p className="text-sm text-on-surface-muted">No numbers found in your pool.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {numbers.map((n) => {
              const tier = n.messaging_tier || 1000;
              const sendRatio = Math.min((n.daily_send_count || 0) / tier, 1);
              const sendPct = Math.round(sendRatio * 100);
              const risk = getSpamRisk(n.quality_rating, sendRatio);
              const warmPct = Math.min(Math.round(((n.warm_up_day || 0) / WARM_UP_DAYS) * 100), 100);

              return (
                <div
                  key={n.id}
                  className="w-80 bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15 p-6 flex flex-col gap-4"
                >
                  {/* Name + number */}
                  <div>
                    <p className="font-semibold text-on-surface text-sm leading-tight">
                      {n.display_name}
                    </p>
                    <p className="text-xs text-on-surface-muted mt-0.5">{n.number}</p>
                  </div>

                  {/* Quality badge + status badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <span className={`w-2 h-2 rounded-full ${QUALITY_DOT[n.quality_rating]}`} />
                      <span className={QUALITY_TEXT[n.quality_rating]}>
                        {QUALITY_LABEL[n.quality_rating]}
                      </span>
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[n.status]}`}>
                      {STATUS_LABEL[n.status]}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${risk.bg} ${risk.color}`}>
                      {risk.label}
                    </span>
                  </div>

                  {/* Send usage bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-on-surface-muted">
                      <span>Daily sends</span>
                      <span>{n.daily_send_count ?? 0} / {tier} ({sendPct}%)</span>
                    </div>
                    <div className="h-2 bg-surface-mid rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          sendRatio >= 0.8
                            ? "bg-red-500"
                            : sendRatio >= 0.5
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${sendPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Warm-up progress (only when warming) */}
                  {n.status === "warming" && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-on-surface-muted">
                        <span>Warm-up</span>
                        <span>Day {n.warm_up_day ?? 0} / {WARM_UP_DAYS}</span>
                      </div>
                      <div className="h-2 bg-surface-mid rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all"
                          style={{ width: `${warmPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2 — Best Practices Panel */}
      <section>
        <h2 className="text-sm font-semibold text-on-surface-muted uppercase tracking-wide mb-4">
          Best Practices
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {BEST_PRACTICES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15 p-5 flex gap-4"
            >
              <div className="shrink-0 w-9 h-9 rounded-lg bg-surface-mid flex items-center justify-center text-on-surface-muted">
                <Icon size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">{title}</p>
                <p className="text-xs text-on-surface-muted mt-1 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3 — Quality History Timeline */}
      <section>
        <h2 className="text-sm font-semibold text-on-surface-muted uppercase tracking-wide mb-4">
          Quality History
        </h2>
        {numbers.length === 0 ? (
          <p className="text-sm text-on-surface-muted">No numbers to show history for.</p>
        ) : (
          <div className="space-y-6">
            {numbers.map((n) => {
              const numHistory = history.filter((h) => h.phone_number_id === n.id);
              return (
                <div key={n.id} className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15 p-5">
                  <p className="text-sm font-semibold text-on-surface mb-3">
                    {n.display_name} · {n.number}
                  </p>
                  {numHistory.length === 0 ? (
                    <p className="text-xs text-on-surface-muted">
                      No history recorded yet. Sync from Meta to start tracking.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {numHistory.map((h) => {
                        const date = new Date(h.recorded_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        });
                        const qualityKey = (h.quality_rating?.toLowerCase() ?? "green") as PhoneNumber["quality_rating"];
                        return (
                          <li key={h.id} className="flex items-center gap-3 text-xs text-on-surface-muted">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${QUALITY_DOT[qualityKey] ?? "bg-gray-400"}`} />
                            <span>{date}</span>
                            <span>·</span>
                            <span>
                              Quality:{" "}
                              <span className={`font-medium ${QUALITY_TEXT[qualityKey] ?? "text-gray-600"}`}>
                                {QUALITY_LABEL[qualityKey] ?? h.quality_rating}
                              </span>
                            </span>
                            <span>·</span>
                            <span>Tier: {h.messaging_tier?.toLocaleString()}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
