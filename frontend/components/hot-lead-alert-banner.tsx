"use client";
import { useEffect, useState } from "react";
import { api, HotLeadAlert } from "@/lib/api";

export function HotLeadAlertBanner() {
  const [alerts, setAlerts] = useState<HotLeadAlert[]>([]);

  async function load() {
    try {
      const data = await api.alerts.mine();
      setAlerts(data);
    } catch {}
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function dismiss(id: string) {
    try {
      await api.alerts.acknowledge(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch {}
  }

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className="bg-red-600 text-white rounded-2xl shadow-xl px-4 py-3 flex items-start gap-3"
        >
          <span className="text-xl shrink-0">🔴</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-snug">
              {alert.lead?.name || "Unknown"} ({alert.lead?.phone}) — Score {alert.lead?.score}/10
            </p>
            <p className="text-xs text-red-200 mt-0.5">
              {alert.status === "escalated"
                ? "⚡ Escalated — needs anyone available"
                : "Needs your attention now"}
            </p>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <a
              href="/dashboard/telecalling"
              onClick={() => dismiss(alert.id)}
              className="text-xs bg-white text-red-600 font-bold px-3 py-1 rounded-lg hover:bg-red-50 text-center"
            >
              Call Now
            </a>
            <button
              onClick={() => dismiss(alert.id)}
              className="text-xs text-red-200 hover:text-white text-center"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
