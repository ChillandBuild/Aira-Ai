"use client";
import { useEffect, useState } from "react";
import {
  MessageSquare, Phone, Sparkles, Check, Eye, EyeOff, Save, AlertCircle, Loader2
} from "lucide-react";
import { API_URL } from "@/lib/api";

type Setting = {
  key: string;
  display_value: string;
  is_secret: boolean;
  is_set: boolean;
  updated_at: string;
};

type SettingsMap = Record<string, string>;

async function fetchSettings(): Promise<Setting[]> {
  const res = await fetch(`${API_URL}/api/v1/settings`);
  if (!res.ok) throw new Error("Failed to load settings");
  const data = await res.json();
  return data.settings;
}

async function saveSettings(updates: SettingsMap): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) throw new Error("Failed to save settings");
}

const SECTIONS = [
  {
    id: "whatsapp",
    label: "WhatsApp (Meta Cloud API)",
    icon: MessageSquare,
    color: "#059669",
    bg: "#d1fae5",
    description: "Connect your WhatsApp Business Account to send and receive messages.",
    fields: [
      { key: "meta_phone_number_id", label: "Phone Number ID", placeholder: "From Meta Business Manager → WhatsApp → API Setup", secret: false },
      { key: "meta_access_token", label: "Permanent Access Token", placeholder: "System User token — never expires", secret: true },
      { key: "meta_webhook_verify_token", label: "Webhook Verify Token", placeholder: "A secret string you choose for webhook verification", secret: true },
    ],
  },
  {
    id: "voice",
    label: "Voice Calling (Twilio)",
    icon: Phone,
    color: "#d97706",
    bg: "#fef3c7",
    description: "Twilio credentials for click-to-call telecalling functionality.",
    fields: [
      { key: "twilio_account_sid", label: "Account SID", placeholder: "From Twilio console → Account Info", secret: false },
      { key: "twilio_auth_token", label: "Auth Token", placeholder: "From Twilio console → Account Info", secret: true },
    ],
  },
  {
    id: "ai",
    label: "AI Configuration",
    icon: Sparkles,
    color: "#7c3aed",
    bg: "#ede9fe",
    description: "Gemini AI settings for auto-reply, lead scoring, and call summarisation.",
    fields: [
      { key: "gemini_api_key", label: "Gemini API Key", placeholder: "From Google AI Studio — aistudio.google.com", secret: true },
      { key: "faq_match_threshold", label: "FAQ Match Threshold", placeholder: "0.85 (85% similarity required before using FAQ)", secret: false },
    ],
    toggles: [
      { key: "ai_auto_reply_enabled", label: "AI Auto-Reply", description: "Automatically reply to inbound WhatsApp messages using AI" },
    ],
  },
];

function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-secondary transition-colors"
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<SettingsMap>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setSettings(s);
        const initial: SettingsMap = {};
        s.forEach((row) => {
          initial[row.key] = row.is_secret && row.is_set ? "" : (row.display_value === "Not set" ? "" : row.display_value);
        });
        setDrafts(initial);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(sectionId: string, keys: string[]) {
    setSaving(sectionId);
    setError(null);
    const updates: SettingsMap = {};
    keys.forEach((k) => {
      if (drafts[k] !== undefined && drafts[k] !== "") {
        updates[k] = drafts[k];
      }
    });
    try {
      await saveSettings(updates);
      setSaved(sectionId);
      setTimeout(() => setSaved(null), 2500);
      const refreshed = await fetchSettings();
      setSettings(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function getDisplayValue(key: string): string {
    const s = settings.find((r) => r.key === key);
    if (!s) return "";
    if (s.is_secret) return s.is_set ? "" : "";
    return s.display_value === "Not set" ? "" : s.display_value;
  }

  function isSet(key: string): boolean {
    return settings.find((r) => r.key === key)?.is_set ?? false;
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Connect your services and configure AI behaviour.</p>
      </div>

      {error && (
        <div className="mb-5 flex items-center gap-2 p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-100">
          <AlertCircle size={15} className="flex-shrink-0" />
          <span className="font-body text-sm">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card rounded-3xl h-48 animate-pulse bg-border-subtle" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {SECTIONS.map((section) => {
            const allKeys = [
              ...section.fields.map((f) => f.key),
              ...(section.toggles?.map((t) => t.key) ?? []),
            ];
            const allSet = section.fields.every((f) => isSet(f.key));

            return (
              <div key={section.id} className="card rounded-3xl">
                {/* Section header */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: section.bg }}
                    >
                      <section.icon size={18} style={{ color: section.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display font-bold text-ink" style={{ fontSize: "1rem", letterSpacing: "-0.02em" }}>
                          {section.label}
                        </h2>
                        {allSet && (
                          <span className="badge badge-green">
                            <Check size={10} /> Connected
                          </span>
                        )}
                        {!allSet && (
                          <span className="badge badge-gray">Not configured</span>
                        )}
                      </div>
                      <p className="font-body text-sm text-ink-muted mt-0.5">{section.description}</p>
                    </div>
                  </div>
                </div>

                {/* Fields */}
                <div className="space-y-4">
                  {section.fields.map((field) => (
                    <div key={field.key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-body text-sm font-medium text-ink">{field.label}</label>
                        {isSet(field.key) && (
                          <span className="font-label text-xs text-primary font-semibold" style={{ fontSize: "0.65rem", letterSpacing: "0.04em" }}>
                            ✓ SET
                          </span>
                        )}
                      </div>
                      {field.secret ? (
                        <SecretInput
                          value={drafts[field.key] ?? ""}
                          onChange={(v) => setDrafts((d) => ({ ...d, [field.key]: v }))}
                          placeholder={isSet(field.key) ? "Enter new value to update" : field.placeholder}
                        />
                      ) : (
                        <input
                          type="text"
                          value={drafts[field.key] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          className="input"
                        />
                      )}
                    </div>
                  ))}

                  {/* Toggles */}
                  {section.toggles?.map((toggle) => {
                    const val = drafts[toggle.key];
                    const enabled = val === "true" || val === undefined;
                    return (
                      <div key={toggle.key} className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-subtle border border-border-subtle">
                        <div>
                          <p className="font-body text-sm font-medium text-ink">{toggle.label}</p>
                          <p className="font-body text-xs text-ink-muted mt-0.5">{toggle.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDrafts((d) => ({ ...d, [toggle.key]: enabled ? "false" : "true" }))}
                          className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
                            enabled ? "bg-primary" : "bg-border"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                              enabled ? "translate-x-5" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Save button */}
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={() => handleSave(section.id, allKeys)}
                    disabled={saving === section.id}
                    className="btn-primary"
                  >
                    {saving === section.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : saved === section.id ? (
                      <Check size={14} />
                    ) : (
                      <Save size={14} />
                    )}
                    {saved === section.id ? "Saved!" : "Save Changes"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
