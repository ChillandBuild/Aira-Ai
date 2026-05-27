"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Camera, Eye, EyeOff, Save, AlertCircle, Loader2,
  CheckCircle2, Copy, Check, Zap, XCircle, Activity, RefreshCw,
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
  required?: boolean;
  hint?: string;
};

type ActivateResult = {
  success: boolean;
  message: string;
  detail?: string;
};

type ChannelHealth = {
  last_event: string | null;
};

type TokenAlert = {
  channel: string;
  error: string;
  created_at: string;
};

type WebhookHealth = {
  health: Record<string, ChannelHealth>;
  token_alerts: TokenAlert[];
};

const FIELDS: FieldDef[] = [
  { key: "instagram_page_id", label: "Instagram Page ID / Business Account ID", secret: false, required: true, hint: "Meta Business Manager Page ID or Instagram Business Account ID" },
  { key: "instagram_access_token", label: "Instagram Page Access Token", secret: true, required: true, hint: "Permanent page access token with instagram_manage_messages scope" },
];

async function fetchSettings(): Promise<Setting[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/settings`, { headers: auth });
  if (!res.ok) throw new Error("Failed to load settings");
  return (await res.json()).settings;
}

async function saveSettings(updates: SettingsMap): Promise<void> {
  const auth = await getAuthHeaders();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${API_URL}/api/v1/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return;
    } catch {
      if (attempt === 2) throw new Error("Server unreachable — please try again");
    }
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {}
      }}
      title="Copy to clipboard"
      className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-label font-semibold transition-all border border-border bg-white text-ink-muted hover:text-primary hover:border-primary/40"
    >
      {copied ? <><Check size={11} className="text-emerald-600" />Copied</> : <><Copy size={11} />Copy</>}
    </button>
  );
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

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function HealthBadge({ lastEvent, tokenAlert }: { lastEvent: string | null; tokenAlert?: TokenAlert }) {
  if (tokenAlert) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-label font-semibold bg-red-100 text-red-700 border border-red-200">
        <XCircle size={12} /> Token invalid
      </span>
    );
  }
  if (lastEvent) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-label font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Activity size={12} /> Live: {timeAgo(lastEvent)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-label font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <Activity size={12} /> No events yet
    </span>
  );
}

function WebhookGuide({ tenantId }: { tenantId: string | null }) {
  const url = tenantId ? `${API_URL}/webhook/instagram/${tenantId}` : null;
  return (
    <div className="p-5 rounded-2xl bg-surface-subtle border border-border-subtle font-body text-xs text-ink-secondary space-y-2.5">
      <p className="font-semibold text-ink text-sm">Meta Webhook Configuration Guide:</p>
      <p>1. In your Meta Developer App, add the <strong>Instagram Graph API</strong> product.</p>
      <p>2. Set the Webhook Callback URL to:</p>
      <div className="flex items-center gap-2">
        <div className="flex-grow p-3 rounded-xl bg-white border border-border font-mono text-xs select-all break-all text-primary font-medium">
          {url ?? "Retrieving webhook URL…"}
        </div>
        {url && <CopyButton text={url} />}
      </div>
      <p>3. Use the verify token you set in your WhatsApp integration (meta_webhook_verify_token).</p>
      <p>4. Subscribe to <strong>messages</strong> Webhook event fields.</p>
      <p>5. After saving credentials, click <strong>Validate &amp; Activate</strong> to auto-subscribe the webhook.</p>
    </div>
  );
}

type SaveState = "idle" | "dirty" | "saving" | "saved";

export default function InstagramConnectPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<SettingsMap>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<ActivateResult | null>(null);
  const [webhookHealth, setWebhookHealth] = useState<WebhookHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchSettings();
      setSettings(s);
      setDrafts((prev) => {
        const next: SettingsMap = { ...prev };
        s.forEach((row) => {
          if (FIELDS.some(f => f.key === row.key)) {
            if (!row.is_secret) {
              const value = row.display_value === "Not set" ? "" : row.display_value;
              if (!(row.key in next) || next[row.key] === "") next[row.key] = value;
            } else {
              if (!(row.key in next)) next[row.key] = "";
            }
          }
        });
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/settings/webhook-health`, { headers: auth });
      if (res.ok) setWebhookHealth(await res.json());
    } catch {} finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadHealth();
    async function fetchTenantStatus() {
      try {
        const auth = await getAuthHeaders();
        const res = await fetch(`${API_URL}/api/v1/onboarding/status`, { headers: auth });
        if (res.ok) {
          const data = await res.json();
          if (data.tenant_id) setTenantId(data.tenant_id);
        }
      } catch {}
    }
    fetchTenantStatus();
  }, [load, loadHealth]);

  function settingFor(key: string) {
    return settings.find(s => s.key === key);
  }

  const isDirty = useMemo(() => {
    return FIELDS.some(f => {
      const meta = settingFor(f.key);
      const draft = drafts[f.key] ?? "";
      if (f.secret) return draft.length > 0;
      const stored = meta?.display_value === "Not set" ? "" : (meta?.display_value ?? "");
      return draft !== stored;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, settings]);

  const isConfigured = useMemo(() => {
    return FIELDS.every(f => settingFor(f.key)?.is_set);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  async function handleSave() {
    setSaveState("saving");
    setError(null);
    const updates: SettingsMap = {};
    FIELDS.forEach(f => {
      const draft = drafts[f.key];
      const current = settingFor(f.key);
      if (!current) return;
      if (current.is_secret) {
        if (draft && draft.length > 0) updates[f.key] = draft;
      } else {
        const stored = current.display_value === "Not set" ? "" : current.display_value;
        if (draft !== undefined && draft !== stored) updates[f.key] = draft;
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
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaveState("idle");
    }
  }

  async function handleActivate() {
    setActivating(true);
    setActivateResult(null);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/settings/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ channel: "instagram" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActivateResult({ success: false, message: data.detail ?? "Activation failed" });
      } else {
        const detail = [
          data.page_name,
          data.page_id ? `ID: ${data.page_id}` : null,
          data.subscribed ? "Webhook subscribed ✓" : "Webhook subscription failed — check token scopes",
        ].filter(Boolean).join(" · ");
        setActivateResult({ success: true, message: "Validated & connected", detail });
      }
    } catch {
      setActivateResult({ success: false, message: "Network error — please try again" });
    } finally {
      setActivating(false);
    }
  }

  const channelHealth = webhookHealth?.health?.instagram;
  const tokenAlert = webhookHealth?.token_alerts?.find(a => a.channel === "instagram");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Connect Instagram</h1>
          <p className="page-subtitle">Configure page IDs and access tokens for Instagram Messaging.</p>
        </div>
        {isConfigured && channelHealth !== undefined && (
          <HealthBadge lastEvent={channelHealth.last_event} tokenAlert={tokenAlert} />
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-100">
          <AlertCircle size={15} />
          <span className="font-body text-sm">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="card rounded-3xl h-96 animate-pulse bg-border-subtle" />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <WebhookGuide tenantId={tenantId} />

          <div className="card rounded-3xl p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-pink-100">
                <Camera size={18} className="text-pink-600" />
              </div>
              <div>
                <h2 className="font-display font-bold text-ink" style={{ fontSize: "1rem" }}>
                  Instagram API Credentials
                </h2>
                <p className="font-body text-xs text-ink-muted">Enter Page ID and Instagram Access Token.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FIELDS.map((field) => {
                const meta = settingFor(field.key);
                const draft = drafts[field.key] ?? "";
                if (field.secret) {
                  return (
                    <SecretField
                      key={field.key}
                      label={field.label}
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
                    label={field.label}
                    value={draft}
                    onChange={v => setDrafts(d => ({ ...d, [field.key]: v }))}
                    placeholder={field.placeholder}
                    hint={field.hint}
                  />
                );
              })}
            </div>

            {tokenAlert && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-2xl border bg-red-50 border-red-200 text-red-800 text-xs font-body">
                <XCircle size={14} className="flex-shrink-0 mt-0.5 text-red-500" />
                <div>
                  <p className="font-semibold">Token invalid — connection broken</p>
                  <p className="mt-0.5 opacity-80">{tokenAlert.error} · Detected {timeAgo(tokenAlert.created_at)}</p>
                  <p className="mt-1 opacity-70">Update your page access token above, click Save Changes, then click Validate &amp; Activate.</p>
                </div>
              </div>
            )}

            {activateResult && (
              <div className={`flex items-start gap-2.5 p-3.5 rounded-2xl border text-xs font-body ${
                activateResult.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}>
                {activateResult.success
                  ? <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5 text-emerald-600" />
                  : <XCircle size={14} className="flex-shrink-0 mt-0.5 text-red-500" />
                }
                <div>
                  <p className="font-semibold">{activateResult.message}</p>
                  {activateResult.detail && <p className="mt-0.5 opacity-80">{activateResult.detail}</p>}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border-subtle pt-5 gap-3 flex-wrap">
              <div>
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadHealth}
                  disabled={healthLoading}
                  title="Refresh health status"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-label text-sm font-medium border border-border text-ink-muted hover:text-ink-secondary hover:border-border transition-all bg-white"
                >
                  <RefreshCw size={13} className={healthLoading ? "animate-spin" : ""} />
                </button>
                <button
                  type="button"
                  onClick={handleActivate}
                  disabled={activating || !isConfigured}
                  title={!isConfigured ? "Save required fields first" : "Validate and register subscription"}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-label text-sm font-semibold transition-all border ${
                    isConfigured
                      ? "border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100"
                      : "border-border text-ink-muted bg-surface-subtle cursor-not-allowed opacity-50"
                  }`}
                >
                  {activating ? (
                    <><Loader2 size={14} className="animate-spin" />Validating…</>
                  ) : (
                    <><Zap size={14} />Validate &amp; Activate</>
                  )}
                </button>
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
          </div>
        </div>
      )}
    </div>
  );
}
