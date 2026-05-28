"use client";
import { useEffect, useState } from "react";
import { MessageSquare, CheckCircle, Settings } from "lucide-react";
import Link from "next/link";
import { SegmentBadge } from "@/components/segment-badge";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { cn } from "@/lib/utils";
import { InboxConfigPanel } from "../settings/InboxConfigPanel";

type Handover = {
  id: string;
  lead_id: string;
  reason: string | null;
  status: string;
  opened_at: string;
  leads: {
    name: string | null;
    phone: string | null;
    segment: "A" | "B" | "C" | "D";
    source?: string;
    tg_username?: string | null;
    ig_user_id?: string | null;
    fb_user_id?: string | null;
  } | null;
};

async function fetchHandovers(): Promise<Handover[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/chat-handovers`, { headers: auth });
  if (!res.ok) return [];
  return (await res.json()).data ?? [];
}

async function resolveHandover(id: string): Promise<void> {
  const auth = await getAuthHeaders();
  await fetch(`${API_URL}/api/v1/chat-handovers/${id}/resolve`, {
    method: "PATCH",
    headers: auth,
  });
}

export default function InboxPage() {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  async function load() {
    setLoading(true);
    setHandovers(await fetchHandovers());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleResolve(id: string) {
    await resolveHandover(id);
    await load();
  }

  return (
    <div>
      <div className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="page-title">Chat Inbox</h1>
          <p className="page-subtitle">Conversations where AI couldn&apos;t answer — needs your reply.</p>
        </div>
        <button
          onClick={() => setShowConfig(prev => !prev)}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl font-label text-sm font-semibold transition-colors border",
            showConfig
              ? "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100"
              : "bg-white border-surface-mid text-on-surface hover:text-violet-600 hover:border-violet-300"
          )}
        >
          <Settings size={16} />
          {showConfig ? "Hide Rules" : "Escalation Rules"}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-grow flex-1 min-w-0 w-full">
          {loading ? (
            <div className="card rounded-3xl p-8 text-center font-body text-sm text-ink-muted">Loading…</div>
          ) : handovers.length === 0 ? (
            <div className="card rounded-3xl p-12 text-center">
              <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
              <p className="font-display font-bold text-ink">All caught up</p>
              <p className="font-body text-sm text-ink-muted mt-1">No conversations need your attention right now.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {handovers.map((h) => (
                <div key={h.id} className="card rounded-2xl p-5 flex items-start gap-4">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <MessageSquare size={16} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-label font-semibold text-ink text-sm">
                        {h.leads?.name || "Unknown Lead"}
                      </span>
                      {h.leads?.segment && <SegmentBadge segment={h.leads.segment} />}
                    </div>
                    <p className="font-body text-xs text-ink-muted mb-1.5 font-medium">
                      {h.leads?.source === "telegram" ? (
                        <span className="text-sky-500">Telegram · @{h.leads.tg_username || "unknown"}</span>
                      ) : h.leads?.source === "instagram" ? (
                        <span className="text-pink-500">Instagram · {h.leads.ig_user_id}</span>
                      ) : h.leads?.source === "facebook" ? (
                        <span className="text-blue-600">Facebook · {h.leads.fb_user_id}</span>
                      ) : (
                        <span>WhatsApp · {h.leads?.phone}</span>
                      )}
                    </p>
                    {h.reason && (
                      <p className="font-body text-sm text-ink bg-surface-subtle rounded-lg px-3 py-2 mb-3">
                        &ldquo;{h.reason}&rdquo;
                      </p>
                    )}
                    <p className="font-body text-xs text-ink-muted">
                      {new Date(h.opened_at).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Link
                      href={`/dashboard/conversations?lead=${h.lead_id}`}
                      className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
                    >
                      <MessageSquare size={12} /> Reply
                    </Link>
                    <button
                      onClick={() => handleResolve(h.id)}
                      className="text-xs px-3 py-1.5 rounded-xl border border-green-200 text-green-700 hover:bg-green-50 flex items-center gap-1.5 transition-colors"
                    >
                      <CheckCircle size={12} /> Resolve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showConfig && (
          <div className="w-full lg:w-[420px] shrink-0 sticky top-4">
            <InboxConfigPanel />
          </div>
        )}
      </div>
    </div>
  );
}
