"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  MessageSquare, Phone, Sparkles, Eye, EyeOff,
  Save, AlertCircle, Loader2, CheckCircle2, ChevronDown,
} from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

type Setting = {
  key: string;
  display_value: string;
  is_secret: boolean;
  is_set: boolean;
  updated_at: string;
};

type SettingsMap = Record<string, string>;

type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  secret: boolean;
  required?: boolean; // only required=true fields affect the "Connected" badge
  hint?: string;
};

type ToggleDef = { key: string; label: string; description: string };

type SectionDef = {
  id: string;
  label: string;
  icon: typeof MessageSquare;
  color: string;
  bg: string;
  description: string;
  fields: FieldDef[];
  toggles?: ToggleDef[];
};

const SECTIONS: SectionDef[] = [
  {
    id: "whatsapp",
    label: "WhatsApp (Meta Cloud API)",
    icon: MessageSquare,
    color: "#059669",
    bg: "#d1fae5",
    description: "Connect your WhatsApp Business Account to send and receive messages.",
    fields: [
      { key: "meta_phone_number_id", label: "Phone Number ID", secret: false, required: true },
      { key: "meta_access_token", label: "Permanent Access Token", secret: true, required: true },
      { key: "meta_webhook_verify_token", label: "Webhook Verify Token", secret: true, required: true },
    ],
  },
  {
    id: "voice",
    label: "Voice Calling (TeleCMI)",
    icon: Phone,
    color: "#d97706",
    bg: "#fef3c7",
    description: "TeleCMI credentials for click-to-call telecalling. Per-caller Agent IDs are set on the Team page.",
    fields: [
      { key: "telecmi_secret", label: "App Secret", secret: true, required: true },
      { key: "telecmi_callerid", label: "Caller ID (DID shown to leads)", secret: false, required: false, hint: "The outbound number leads see when you call them" },
      { key: "admin_phone", label: "Admin Mobile", secret: false, required: false, hint: "Your mobile number — TeleCMI rings this first when you make a call" },
    ],
  },
  {
    id: "ai",
    label: "AI Configuration",
    icon: Sparkles,
    color: "#7c3aed",
    bg: "#ede9fe",
    description: "Groq powers WhatsApp auto-reply, lead scoring, call summaries, and AI coaching.",
    fields: [
      { key: "groq_api_key", label: "Groq API Key", secret: true, required: true },
      { key: "faq_match_threshold", label: "FAQ Match Threshold (0–1)", secret: false, required: false, hint: "How closely a message must match a FAQ keyword. Default: 0.7", placeholder: "0.7" },
    ],
    toggles: [
      { key: "ai_auto_reply_enabled", label: "AI Auto-Reply", description: "Automatically reply to inbound WhatsApp messages using AI" },
    ],
  },
];

async function fetchSettings(): Promise<Setting[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/settings`, { headers: auth });
  if (!res.ok) throw new Error("Failed to load settings");
  return (await res.json()).settings;
}

async function saveSettings(updates: SettingsMap): Promise<void> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) throw new Error("Failed to save settings");
}

function OutlinedField({
  label, value, onChange, placeholder, type = "text", rightSlot, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: "text" | "password"; rightSlot?: React.ReactNode; hint?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? " "}
          className="peer w-full px-4 pt-5 pb-2 pr-10 rounded-xl bg-white border border-border text-sm font-body text-ink placeholder:text-ink-muted/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition"
        />
        <label className="pointer-events-none absolute left-3 -top-2 px-1.5 text-[11px] font-label font-medium text-ink-muted bg-white tracking-wide">
          {label}
        </label>
        {rightSlot && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
            {rightSlot}
          </div>
        )}
      </div>
      {hint && <p className="text-[11px] text-ink-muted font-body pl-1">{hint}</p>}
    </div>
  );
}

function SecretField({
  label, storedMask, isSet, newValue, onChange, hint,
}: {
  label: string; storedMask: string; isSet: boolean;
  newValue: string; onChange: (v: string) => void; hint?: string;
}) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const showInput = editing || newValue.length > 0 || !isSet;

  return (
    <div className="space-y-1">
      {!showInput ? (
        <button type="button" onClick={() => setEditing(true)} className="relative w-full text-left group">
          <div className="w-full px-4 pt-5 pb-2 rounded-xl bg-white border border-border font-mono text-sm text-ink-secondary cursor-text group-hover:border-primary/40 transition">
            {storedMask}
          </div>
          <span className="pointer-events-none absolute left-3 -top-2 px-1.5 text-[11px] font-label font-medium text-ink-muted bg-white tracking-wide">
            {label}
          </span>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-label font-semibold text-primary opacity-0 group-hover:opacity-100 transition">
            Edit
          </span>
        </button>
      ) : (
        <OutlinedField
          label={label}
          value={newValue}
          onChange={onChange}
          type={show ? "text" : "password"}
          placeholder={isSet ? "Enter new value to replace existing" : "Paste your value here"}
          rightSlot={
            <button type="button" onClick={() => setShow(s => !s)} className="p-1 text-ink-muted hover:text-ink-secondary" tabIndex={-1}>
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          }
        />
      )}
      {hint && <p className="text-[11px] text-ink-muted font-body pl-1">{hint}</p>}
    </div>
  );
}

type SaveState = "idle" | "dirty" | "saving" | "saved";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<SettingsMap>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const s = await fetchSettings();
      setSettings(s);
      setDrafts((prev) => {
        const next: SettingsMap = { ...prev };
        s.forEach((row) => {
          if (!row.is_secret) {
            const value = row.display_value === "Not set" ? "" : row.display_value;
            if (!(row.key in next) || next[row.key] === "") next[row.key] = value;
          } else {
            if (!(row.key in next)) next[row.key] = "";
          }
        });
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function settingFor(key: string) {
    return settings.find(s => s.key === key);
  }

  // Per-section dirty check — true if any field has an unsaved change
  const sectionDirty = useMemo(() => {
    const map: Record<string, boolean> = {};
    SECTIONS.forEach(section => {
      const dirty = section.fields.some(f => {
        const meta = settingFor(f.key);
        const draft = drafts[f.key] ?? "";
        if (f.secret) return draft.length > 0;
        const stored = meta?.display_value === "Not set" ? "" : (meta?.display_value ?? "");
        return draft !== stored;
      }) || (section.toggles ?? []).some(t => {
        const meta = settingFor(t.key);
        const draft = drafts[t.key];
        if (draft === undefined) return false;
        const stored = meta?.display_value !== "false" ? "true" : "false";
        return draft !== stored;
      });
      map[section.id] = dirty;
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, settings]);

  async function handleSave(sectionId: string, allKeys: string[]) {
    setSaveStates(s => ({ ...s, [sectionId]: "saving" }));
    setError(null);
    const updates: SettingsMap = {};
    allKeys.forEach(k => {
      const draft = drafts[k];
      const current = settingFor(k);
      if (!current) return;
      if (current.is_secret) {
        if (draft && draft.length > 0) updates[k] = draft;
      } else {
        const stored = current.display_value === "Not set" ? "" : current.display_value;
        if (draft !== undefined && draft !== stored) updates[k] = draft;
      }
    });

    try {
      if (Object.keys(updates).length > 0) await saveSettings(updates);
      setDrafts(prev => {
        const next = { ...prev };
        Object.keys(updates).forEach(k => {
          if (settingFor(k)?.is_secret) next[k] = "";
        });
        return next;
      });
      await load();
      setSaveStates(s => ({ ...s, [sectionId]: "saved" }));
      setTimeout(() => setSaveStates(s => ({ ...s, [sectionId]: "idle" })), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaveStates(s => ({ ...s, [sectionId]: "idle" }));
    }
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Connect your services and configure AI behaviour.</p>
      </div>

      {error && (
        <div className="mb-5 flex items-center gap-2 p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-100">
          <AlertCircle size={15} />
          <span className="font-body text-sm">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
          {[...Array(3)].map((_, i) => <div key={i} className="card rounded-3xl h-56 animate-pulse bg-border-subtle" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {SECTIONS.map((section) => {
            const isCollapsed = !!collapsed[section.id];
            const allKeys = [...section.fields.map(f => f.key), ...(section.toggles?.map(t => t.key) ?? [])];
            // Only required fields determine the Connected badge
            const requiredFields = section.fields.filter(f => f.required !== false);
            const isConfigured = requiredFields.every(f => settingFor(f.key)?.is_set);
            const saveState = saveStates[section.id] ?? "idle";
            const isDirty = sectionDirty[section.id] ?? false;

            return (
              <div key={section.id} className="card rounded-3xl">
                {/* Header */}
                <button
                  type="button"
                  onClick={() => setCollapsed(c => ({ ...c, [section.id]: !c[section.id] }))}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: section.bg }}>
                    <section.icon size={18} style={{ color: section.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display font-bold text-ink" style={{ fontSize: "1rem", letterSpacing: "-0.02em" }}>
                        {section.label}
                      </h2>
                      {isConfigured ? (
                        <span className="badge badge-green inline-flex items-center gap-1">
                          <CheckCircle2 size={10} /> Connected
                        </span>
                      ) : (
                        <span className="badge badge-gray">Not configured</span>
                      )}
                    </div>
                    <p className="font-body text-sm text-ink-muted mt-0.5">{section.description}</p>
                  </div>
                  <ChevronDown size={18} className={`text-ink-muted transition-transform flex-shrink-0 ${isCollapsed ? "" : "rotate-180"}`} />
                </button>

                {!isCollapsed && (
                  <>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {section.fields.map((field) => {
                        const meta = settingFor(field.key);
                        const draft = drafts[field.key] ?? "";
                        const labelWithOptional = field.required === false
                          ? `${field.label} (optional)`
                          : field.label;
                        if (field.secret) {
                          return (
                            <SecretField
                              key={field.key}
                              label={labelWithOptional}
                              storedMask={meta?.display_value ?? "Not set"}
                              isSet={!!meta?.is_set}
                              newValue={draft}
                              onChange={v => setDrafts(d => ({ ...d, [field.key]: v }))}
                              hint={field.hint}
                            />
                          );
                        }
                        return (
                          <OutlinedField
                            key={field.key}
                            label={labelWithOptional}
                            value={draft}
                            onChange={v => setDrafts(d => ({ ...d, [field.key]: v }))}
                            placeholder={field.placeholder}
                            hint={field.hint}
                          />
                        );
                      })}
                    </div>

                    {section.toggles && section.toggles.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {section.toggles.map((toggle) => {
                          const val = drafts[toggle.key];
                          const stored = settingFor(toggle.key)?.display_value;
                          const enabled = val !== undefined ? val === "true" : stored !== "false";
                          return (
                            <div key={toggle.key} className="flex items-center justify-between p-4 rounded-2xl bg-surface-subtle border border-border-subtle">
                              <div>
                                <p className="font-body text-sm font-semibold text-ink">{toggle.label}</p>
                                <p className="font-body text-xs text-ink-muted mt-0.5">{toggle.description}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setDrafts(d => ({ ...d, [toggle.key]: enabled ? "false" : "true" }))}
                                className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${enabled ? "bg-green-600" : "bg-gray-300"}`}
                              >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${enabled ? "translate-x-5" : "translate-x-0"}`} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Save row */}
                    <div className="mt-6 flex items-center justify-between border-t border-border-subtle pt-5">
                      <div className="min-h-[20px]">
                        {saveState === "saved" && (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 font-body text-sm font-medium">
                            <CheckCircle2 size={15} /> Saved successfully
                          </span>
                        )}
                        {!isDirty && saveState === "idle" && isConfigured && (
                          <span className="text-[11px] text-ink-muted font-body">No unsaved changes</span>
                        )}
                        {isDirty && (
                          <span className="text-[11px] text-amber-600 font-body font-medium">Unsaved changes</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleSave(section.id, allKeys)}
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
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
