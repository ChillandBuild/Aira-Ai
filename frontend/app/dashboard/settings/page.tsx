"use client";
import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare,
  Phone,
  Sparkles,
  Eye,
  EyeOff,
  Save,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ChevronDown,
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
};

type ToggleDef = {
  key: string;
  label: string;
  description: string;
};

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
      { key: "meta_phone_number_id", label: "Phone Number ID", secret: false },
      { key: "meta_access_token", label: "Permanent Access Token", secret: true },
      { key: "meta_webhook_verify_token", label: "Webhook Verify Token", secret: true },
    ],
  },
  {
    id: "voice",
    label: "Voice Calling (TeleCMI)",
    icon: Phone,
    color: "#d97706",
    bg: "#fef3c7",
    description: "TeleCMI credentials for click-to-call telecalling.",
    fields: [
      { key: "telecmi_user_id", label: "Agent ID", secret: false },
      { key: "telecmi_secret", label: "App Secret", secret: true },
      { key: "telecmi_callerid", label: "Caller ID (DID number shown to leads)", secret: false },
      { key: "admin_phone", label: "Admin Mobile (used when admin calls a lead)", secret: false },
    ],
  },
  {
    id: "ai",
    label: "AI Configuration",
    icon: Sparkles,
    color: "#7c3aed",
    bg: "#ede9fe",
    description: "Gemini AI for auto-reply, lead scoring, and call summarisation.",
    fields: [
      { key: "gemini_api_key", label: "Gemini API Key", secret: true },
      { key: "groq_api_key", label: "Groq API Key (call transcription)", secret: true },
      { key: "faq_match_threshold", label: "FAQ Match Threshold (0–1)", secret: false },
    ],
    toggles: [
      {
        key: "ai_auto_reply_enabled",
        label: "AI Auto-Reply",
        description: "Automatically reply to inbound WhatsApp messages using AI",
      },
    ],
  },
];

async function fetchSettings(): Promise<Setting[]> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/settings`, { headers: authHeaders });
  if (!res.ok) throw new Error("Failed to load settings");
  const data = await res.json();
  return data.settings;
}

async function saveSettings(updates: SettingsMap): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) throw new Error("Failed to save settings");
}

/**
 * Outlined input with a notched floating label that sits in the top border.
 */
function OutlinedField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  rightSlot,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  rightSlot?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? " "}
        disabled={disabled}
        className="peer w-full px-4 pt-5 pb-2 pr-10 rounded-xl bg-white border border-border text-sm font-body text-ink placeholder:text-ink-muted/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition disabled:bg-surface-subtle disabled:text-ink-muted"
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
  );
}

function SecretField({
  label,
  storedMask,
  isSet,
  newValue,
  onChange,
}: {
  label: string;
  storedMask: string;
  isSet: boolean;
  newValue: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const showInput = editing || newValue.length > 0 || !isSet;

  if (!showInput) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="relative w-full text-left group"
      >
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
    );
  }

  return (
    <OutlinedField
      label={label}
      value={newValue}
      onChange={onChange}
      type={show ? "text" : "password"}
      placeholder={isSet ? "Enter new value to replace" : "Paste your value here"}
      rightSlot={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="p-1 text-ink-muted hover:text-ink-secondary"
          tabIndex={-1}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      }
    />
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<SettingsMap>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
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
          if (row.is_secret) {
            // never pre-fill secrets — user types only when changing
            if (!(row.key in next)) next[row.key] = "";
          } else {
            const value = row.display_value === "Not set" ? "" : row.display_value;
            // If user hasn't touched it, sync to server value
            if (!(row.key in next) || next[row.key] === "" || next[row.key] === value) {
              next[row.key] = value;
            }
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

  useEffect(() => {
    load();
  }, [load]);

  function settingFor(key: string) {
    return settings.find((s) => s.key === key);
  }

  async function handleSave(sectionId: string, allKeys: string[]) {
    setSaving(sectionId);
    setError(null);
    const updates: SettingsMap = {};
    allKeys.forEach((k) => {
      const draft = drafts[k];
      const current = settingFor(k);
      if (!current) return;
      if (current.is_secret) {
        // only send if user typed something new
        if (draft && draft.length > 0) updates[k] = draft;
      } else {
        const stored = current.display_value === "Not set" ? "" : current.display_value;
        if (draft !== undefined && draft !== stored) {
          updates[k] = draft;
        }
      }
    });

    if (Object.keys(updates).length === 0) {
      setSavedFlash(sectionId);
      setSaving(null);
      setTimeout(() => setSavedFlash(null), 2500);
      return;
    }

    try {
      await saveSettings(updates);
      // reset secret drafts so they show as masked again after save
      setDrafts((prev) => {
        const next = { ...prev };
        Object.keys(updates).forEach((k) => {
          const def = settingFor(k);
          if (def?.is_secret) next[k] = "";
        });
        return next;
      });
      await load();
      setSavedFlash(sectionId);
      setTimeout(() => setSavedFlash(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
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
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card rounded-3xl h-56 animate-pulse bg-border-subtle" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {SECTIONS.map((section) => {
            const isCollapsed = !!collapsed[section.id];
            const fieldKeys = section.fields.map((f) => f.key);
            const toggleKeys = section.toggles?.map((t) => t.key) ?? [];
            const allKeys = [...fieldKeys, ...toggleKeys];
            const allSet = section.fields.every((f) => settingFor(f.key)?.is_set);

            return (
              <div key={section.id} className="card rounded-3xl">
                {/* Header */}
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: section.bg }}
                  >
                    <section.icon size={18} style={{ color: section.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2
                        className="font-display font-bold text-ink"
                        style={{ fontSize: "1rem", letterSpacing: "-0.02em" }}
                      >
                        {section.label}
                      </h2>
                      {allSet ? (
                        <span className="badge badge-green inline-flex items-center gap-1">
                          <CheckCircle2 size={10} /> Connected
                        </span>
                      ) : (
                        <span className="badge badge-gray">Not configured</span>
                      )}
                    </div>
                    <p className="font-body text-sm text-ink-muted mt-0.5">{section.description}</p>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`text-ink-muted transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                  />
                </button>

                {!isCollapsed && (
                  <>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {section.fields.map((field) => {
                        const meta = settingFor(field.key);
                        const draft = drafts[field.key] ?? "";
                        if (field.secret) {
                          return (
                            <SecretField
                              key={field.key}
                              label={field.label}
                              storedMask={meta?.display_value ?? "••••"}
                              isSet={!!meta?.is_set}
                              newValue={draft}
                              onChange={(v) =>
                                setDrafts((d) => ({ ...d, [field.key]: v }))
                              }
                            />
                          );
                        }
                        return (
                          <OutlinedField
                            key={field.key}
                            label={field.label}
                            value={draft}
                            onChange={(v) =>
                              setDrafts((d) => ({ ...d, [field.key]: v }))
                            }
                            placeholder={field.placeholder}
                          />
                        );
                      })}
                    </div>

                    {/* Toggles */}
                    {section.toggles && section.toggles.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {section.toggles.map((toggle) => {
                          const val = drafts[toggle.key];
                          const stored = settingFor(toggle.key)?.display_value;
                          const enabled =
                            val !== undefined ? val === "true" : stored !== "false";
                          return (
                            <div
                              key={toggle.key}
                              className="flex items-center justify-between p-4 rounded-2xl bg-surface-subtle border border-border-subtle"
                            >
                              <div>
                                <p className="font-body text-sm font-semibold text-ink">
                                  {toggle.label}
                                </p>
                                <p className="font-body text-xs text-ink-muted mt-0.5">
                                  {toggle.description}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setDrafts((d) => ({
                                    ...d,
                                    [toggle.key]: enabled ? "false" : "true",
                                  }))
                                }
                                className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                                  enabled ? "bg-green-600" : "bg-gray-300"
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                                    enabled ? "translate-x-5" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Save row */}
                    <div className="mt-6 flex items-center justify-between border-t border-border-subtle pt-5">
                      <div className="min-h-[20px]">
                        {savedFlash === section.id && (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 font-body text-sm font-medium">
                            <CheckCircle2 size={15} />
                            Saved successfully
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleSave(section.id, allKeys)}
                        disabled={saving === section.id}
                        className="btn-primary"
                      >
                        {saving === section.id ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Save size={14} />
                            Save Changes
                          </>
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
