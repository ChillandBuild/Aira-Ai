"use client";
import { useEffect, useState, useCallback } from "react";
import { Phone, ChevronDown, Save, Loader2, CheckCircle2 } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

type TelecallingConfig = {
  enabled: boolean;
  auto_assign_enabled: boolean;
  segments: string[];
  channels: string[];
};

const DEFAULT: TelecallingConfig = {
  enabled: false,
  auto_assign_enabled: false,
  segments: ["A"],
  channels: ["whatsapp"],
};

const SEGMENT_LABELS: Record<string, string> = {
  A: "Hot",
  B: "Warm",
  C: "Cold",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  telegram: "Telegram",
};

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function TelecallingConfigPanel() {
  const [config, setConfig] = useState<TelecallingConfig>(DEFAULT);
  const [draft, setDraft] = useState<TelecallingConfig>(DEFAULT);
  const [collapsed, setCollapsed] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const load = useCallback(async () => {
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/settings/telecalling-config`, { headers: auth });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setDraft(data);
      }
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(config);

  async function handleSave() {
    setSaveState("saving");
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/settings/telecalling-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("Save failed");
      const saved = await res.json();
      setConfig(saved);
      setDraft(saved);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("idle");
    }
  }

  return (
    <div className="card rounded-3xl">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-amber-100">
          <Phone size={18} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display font-bold text-ink" style={{ fontSize: "1rem", letterSpacing: "-0.02em" }}>
              Telecalling Assignment
            </h2>
            {draft.enabled ? (
              <span className="badge badge-green inline-flex items-center gap-1">
                <CheckCircle2 size={10} /> Enabled
              </span>
            ) : (
              <span className="badge badge-gray">Disabled</span>
            )}
          </div>
          <p className="font-body text-sm text-ink-muted mt-0.5">
            Configure which leads get auto-assigned to telecallers when their score crosses the threshold.
          </p>
        </div>
        <ChevronDown size={18} className={`text-ink-muted transition-transform flex-shrink-0 ${collapsed ? "" : "rotate-180"}`} />
      </button>

      {!collapsed && (
        <div className="mt-6 space-y-6">
          {/* Master toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-start gap-3 p-4 rounded-2xl border border-border bg-surface-subtle cursor-pointer hover:border-amber-300 transition-colors">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                className="mt-0.5 accent-amber-600"
              />
              <div>
                <div className="font-label text-sm font-semibold text-ink">Enable Telecalling Module</div>
                <div className="font-body text-xs text-ink-muted mt-0.5">Master switch — enables telecaller assignment on segment changes</div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 rounded-2xl border border-border bg-surface-subtle cursor-pointer hover:border-amber-300 transition-colors">
              <input
                type="checkbox"
                checked={draft.auto_assign_enabled}
                onChange={(e) => setDraft({ ...draft, auto_assign_enabled: e.target.checked })}
                className="mt-0.5 accent-amber-600"
              />
              <div>
                <div className="font-label text-sm font-semibold text-ink">Auto-Assign (Round-Robin)</div>
                <div className="font-body text-xs text-ink-muted mt-0.5">Automatically assign qualifying leads to the active telecaller with fewest leads</div>
              </div>
            </label>
          </div>

          {/* Segments */}
          <div>
            <div className="font-label text-sm font-semibold text-ink mb-1">Segments to Assign</div>
            <div className="font-body text-xs text-ink-muted mb-2">Which lead segments get assigned to telecallers when score threshold is crossed</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SEGMENT_LABELS).map(([seg, label]) => (
                <label key={seg} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface-subtle cursor-pointer hover:border-amber-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={draft.segments.includes(seg)}
                    onChange={() => setDraft({ ...draft, segments: toggle(draft.segments, seg) })}
                    className="accent-amber-600"
                  />
                  <span className="font-label text-sm font-semibold text-ink">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Channels */}
          <div>
            <div className="font-label text-sm font-semibold text-ink mb-1">Channels</div>
            <div className="font-body text-xs text-ink-muted mb-2">Which channels feed into the telecalling queue (typically WhatsApp only)</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CHANNEL_LABELS).map(([ch, label]) => (
                <label key={ch} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface-subtle cursor-pointer hover:border-amber-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={draft.channels.includes(ch)}
                    onChange={() => setDraft({ ...draft, channels: toggle(draft.channels, ch) })}
                    className="accent-amber-600"
                  />
                  <span className="font-label text-sm font-semibold text-ink">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end pt-2 border-t border-border">
            <button
              onClick={handleSave}
              disabled={saveState === "saving" || saveState === "saved" || !isDirty}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-label text-sm font-semibold transition-all ${
                saveState === "saved"
                  ? "bg-emerald-100 text-emerald-700 cursor-default"
                  : isDirty
                  ? "bg-primary text-white hover:bg-primary/90"
                  : "bg-surface-subtle text-ink-muted cursor-default"
              }`}
            >
              {saveState === "saving" ? (
                <><Loader2 size={14} className="animate-spin" />Saving…</>
              ) : saveState === "saved" ? (
                <><CheckCircle2 size={14} />Saved</>
              ) : (
                <><Save size={14} />Save Changes</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
