"use client";

import { useEffect, useState } from "react";
import {
  MessageCircle,
  Bot,
  Phone,
  Clock,
} from "lucide-react";
import {
  api,
  WhatsAppAnalytics,
  TelecallingAnalytics,
} from "@/lib/api";

type Tab = "whatsapp" | "telecalling";

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
      <Icon size={20} className="text-secondary mb-3" />
      <p className="font-label text-xs text-on-surface-muted uppercase tracking-wider">{label}</p>
      <p className="font-display text-3xl font-bold text-on-surface mt-1">{value}</p>
    </div>
  );
}

function SectionLoading() {
  return (
    <div className="grid grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-36 rounded-card bg-surface-mid animate-pulse" />
      ))}
    </div>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-red-50 text-red-700 font-label text-sm p-4">{message}</div>
  );
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function WhatsAppTab() {
  const [data, setData] = useState<WhatsAppAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.analytics.whatsapp()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  if (err) return <SectionError message={err} />;
  if (!data) return <SectionLoading />;

  const stats = [
    { icon: MessageCircle, label: "Sent Today", value: data.messages_sent_today.toString() },
    { icon: MessageCircle, label: "Received Today", value: data.messages_received_today.toString() },
    { icon: Bot, label: "AI Replies Today", value: data.ai_reply_count_today.toString() },
    { icon: Clock, label: "Avg Reply Time", value: formatDuration(data.avg_reply_time_seconds) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-6">
        {stats.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} />
        ))}
      </div>

      <div className="bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
        <h2 className="font-display text-lg font-bold text-tertiary mb-5">Top FAQs</h2>
        {data.top_faqs.length === 0 ? (
          <p className="font-body text-sm text-on-surface-muted">No FAQ hits recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {data.top_faqs.map((faq, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 rounded-2xl bg-surface-low px-4 py-3"
              >
                <p className="font-body text-sm text-on-surface">{faq.question}</p>
                <span className="shrink-0 rounded-full bg-secondary/10 px-3 py-1 font-label text-xs font-semibold text-secondary">
                  {faq.hit_count} hits
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TelecallingTab() {
  const [data, setData] = useState<TelecallingAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.analytics.telecalling()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  if (err) return <SectionError message={err} />;
  if (!data) return <SectionLoading />;

  const stats = [
    { icon: Phone, label: "Calls Today", value: data.calls_today.toString() },
    { icon: Phone, label: "Calls This Week", value: data.calls_this_week.toString() },
    { icon: Clock, label: "Avg Duration", value: formatDuration(data.avg_duration_seconds) },
  ];

  const outcomes = [
    { label: "Converted", value: data.outcome_breakdown.converted, color: "text-green-700 bg-green-50" },
    { label: "Callback", value: data.outcome_breakdown.callback, color: "text-blue-700 bg-blue-50" },
    { label: "Not Interested", value: data.outcome_breakdown.not_interested, color: "text-red-700 bg-red-50" },
    { label: "No Answer", value: data.outcome_breakdown.no_answer, color: "text-amber-700 bg-amber-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        {stats.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
          <h2 className="font-display text-lg font-bold text-tertiary mb-5">Outcome Breakdown</h2>
          <div className="grid grid-cols-2 gap-3">
            {outcomes.map((o) => (
              <div key={o.label} className={`rounded-2xl px-4 py-4 ${o.color}`}>
                <p className="font-label text-xs uppercase tracking-wider opacity-70">{o.label}</p>
                <p className="font-display text-3xl font-bold mt-1">{o.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
          <h2 className="font-display text-lg font-bold text-tertiary mb-5">Per Caller — Today</h2>
          {data.per_caller.length === 0 ? (
            <p className="font-body text-sm text-on-surface-muted">No active callers found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-surface-mid">
                    {["Name", "Calls Today", "Score"].map((h) => (
                      <th key={h} className="pb-3 pr-4 font-label text-xs font-semibold text-on-surface-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.per_caller.map((c) => (
                    <tr key={c.caller_id} className="border-b border-surface-mid/50 hover:bg-surface-low transition-colors">
                      <td className="py-3 pr-4 font-body text-sm font-semibold text-on-surface">{c.name}</td>
                      <td className="py-3 pr-4 font-label text-sm text-on-surface">{c.calls_today}</td>
                      <td className="py-3 font-label text-sm text-on-surface">
                        {c.overall_score !== null ? c.overall_score.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telecalling", label: "Telecalling" },
];

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("whatsapp");

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-tertiary">Analytics</h1>
        <p className="font-body text-on-surface-muted mt-1">
          Service metrics across WhatsApp, telecalling, and lead funnel
        </p>
      </div>

      <div className="flex gap-1 mb-8 bg-surface-low rounded-xl p-1 w-fit ring-1 ring-[#c4c7c7]/15">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 rounded-lg font-label text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? "bg-surface text-tertiary shadow-card"
                : "text-on-surface-muted hover:text-on-surface"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "whatsapp" && <WhatsAppTab />}
      {activeTab === "telecalling" && <TelecallingTab />}
    </div>
  );
}
