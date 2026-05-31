"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Zap } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { TRIGGER_LABELS } from "../[id]/flow/blockMeta";
import type { TriggerConfig, TriggerType } from "../[id]/flow/types";

const TRIGGER_HELP: Record<TriggerType, string> = {
  lead_created: "Runs when a new lead enters your pipeline.",
  first_inbound_message: "Runs the first time a lead messages you.",
  new_message_received: "Runs each time a lead sends a message.",
  keyword_match: "Runs when a lead's message contains a keyword.",
  segment_changed: "Runs when a lead moves into a segment.",
  score_threshold: "Runs when a lead's score crosses a threshold.",
};

const TRIGGERS: TriggerType[] = [
  "lead_created",
  "first_inbound_message",
  "new_message_received",
  "keyword_match",
  "segment_changed",
  "score_threshold",
];

export default function NewBotFlowPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<TriggerType>("lead_created");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) {
      setError("Give your flow a name");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const auth = await getAuthHeaders();
      const triggerConfig: TriggerConfig =
        trigger === "keyword_match" ? { keywords: [] } : trigger === "segment_changed" ? { to_segment: "A" } : {};
      const res = await fetch(`${API_URL}/api/v1/automations/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({
          name: name.trim(),
          trigger_type: trigger,
          trigger_config: triggerConfig,
          active: false,
          flow_kind: "bot_flow",
          steps: [],
        }),
      });
      if (!res.ok) {
        setError("Could not create flow");
        return;
      }
      const json = await res.json();
      router.push(`/dashboard/automations/${json.data.id}`);
    } catch {
      setError("Could not reach server");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto">
      <button
        onClick={() => router.push("/dashboard/automations")}
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-muted hover:text-on-surface transition-colors mb-6"
      >
        <ArrowLeft size={16} /> Back to Bot Flows
      </button>

      <div className="flex items-center gap-2 mb-1">
        <Zap size={20} className="text-primary" />
        <h1 className="text-xl font-bold text-on-surface">New Bot Flow</h1>
      </div>
      <p className="text-sm text-on-surface-muted mb-6">Name it and choose what starts it. You&apos;ll add blocks next.</p>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-on-surface mb-1.5">Flow name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Welcome sequence"
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-surface-mid text-sm text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-on-surface mb-2">Trigger</label>
          <div className="grid grid-cols-1 gap-2">
            {TRIGGERS.map((t) => (
              <button
                key={t}
                onClick={() => setTrigger(t)}
                className={`text-left p-3 rounded-2xl border transition-all ${
                  trigger === t
                    ? "border-primary/40 bg-primary-light ring-1 ring-primary/20"
                    : "border-surface-mid bg-surface hover:border-primary/25"
                }`}
              >
                <span className="block text-sm font-medium text-on-surface">{TRIGGER_LABELS[t]}</span>
                <span className="block text-xs text-on-surface-muted mt-0.5">{TRIGGER_HELP[t]}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={create}
          disabled={creating}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          {creating ? "Creating…" : "Create flow"}
        </button>
      </div>
    </div>
  );
}
