"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Trash2, Check, Clock, AlertCircle, RefreshCw, Send } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Template = {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  body_text: string;
  header_text?: string | null;
  footer_text?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAUSED";
  rejection_reason: string | null;
  submitted_at: string;
  approved_at: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  APPROVED: { label: "Approved",       badgeClass: "bg-emerald-100 text-emerald-700", icon: Check },
  PENDING:  { label: "Pending Review", badgeClass: "bg-amber-100 text-amber-700",    icon: Clock },
  REJECTED: { label: "Rejected",       badgeClass: "bg-red-100 text-red-700",        icon: AlertCircle },
  PAUSED:   { label: "Paused",         badgeClass: "bg-gray-100 text-gray-500",      icon: AlertCircle },
} as const;

const CATEGORY_OPTIONS = [
  {
    value: "MARKETING" as const,
    label: "📣 Promotional",
    description: "Event invites, offers, campaign messages",
  },
  {
    value: "UTILITY" as const,
    label: "🔔 Service Update",
    description: "Booking confirmations, reminders, alerts",
  },
  {
    value: "AUTHENTICATION" as const,
    label: "🔐 Verification",
    description: "OTP codes, login verification",
  },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ta", label: "Tamil" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTemplateName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function renderPreview(text: string): string {
  return text.replace(/\{\{(\d+)\}\}/g, "[Variable $1]");
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [viewTemplate, setViewTemplate] = useState<Template | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("UTILITY");
  const [language, setLanguage] = useState("en");
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<string[]>([]);

  const generatedName = toTemplateName(title);

  function addButton() {
    if (buttons.length < 3) setButtons(prev => [...prev, ""]);
  }
  function updateButton(index: number, value: string) {
    setButtons(prev => prev.map((b, i) => i === index ? value.slice(0, 25) : b));
  }
  function removeButton(index: number) {
    setButtons(prev => prev.filter((_, i) => i !== index));
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ data: Template[] }>("/api/v1/templates/");
      setTemplates(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function resetModal() {
    setTitle(""); setBodyText(""); setHeaderText(""); setFooterText(""); setCategory("UTILITY"); setLanguage("en");
    setButtons([]);
    setError(null); setShowModal(false);
  }

  async function handleSyncFromMeta() {
    setSyncing(true);
    try {
      const result = await apiFetch<{ added: number; updated: number; total: number }>(
        "/api/v1/templates/sync-from-meta",
        { method: "POST" }
      );
      await load();
      // Show result inline — simple alert for now
      alert(`Synced ${result.total} templates from Meta — ${result.added} new, ${result.updated} updated.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSubmit() {
    if (!title.trim() || !bodyText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/v1/templates/", {
        method: "POST",
        body: JSON.stringify({
          name: generatedName,
          category,
          language,
          body_text: bodyText.trim(),
          header_text: headerText.trim() || null,
          footer_text: footerText.trim() || null,
          buttons: buttons.filter(b => b.trim()).length > 0 ? buttons.filter(b => b.trim()) : undefined,
        }),
      });
      resetModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      await apiFetch(`/api/v1/templates/${id}`, { method: "DELETE" });
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete template. Please try again.");
    }
  }

  async function handleSync(id: string) {
    setSyncingId(id);
    try {
      const updated = await apiFetch<Template>(`/api/v1/templates/${id}/sync`, { method: "POST" });
      if (updated?.id) {
        setTemplates(prev => prev.map(t => t.id === id ? updated : t));
      }
    } catch {
      /* silent — status unchanged if sync fails */
    } finally {
      setSyncingId(null);
    }
  }

  function handleBulkSend(templateName: string) {
    router.push(`/dashboard/upload?template=${encodeURIComponent(templateName)}`);
  }

  const approved = templates.filter(t => t.status === "APPROVED");
  const pending  = templates.filter(t => t.status === "PENDING");
  const rejected = templates.filter(t => t.status === "REJECTED" || t.status === "PAUSED");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="page-title">Message Templates</h1>
          <p className="page-subtitle">
            Create templates and submit them to WhatsApp for approval. Once approved, use them for bulk sending.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} />Refresh</button>
          <button
            onClick={handleSyncFromMeta}
            disabled={syncing}
            className="btn-ghost disabled:opacity-50"
            title="Import all templates from Meta into the dashboard"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync from Meta"}
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={14} />New Template</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Approved",       count: approved.length, color: "#059669", bg: "#d1fae5" },
          { label: "Pending Review", count: pending.length,  color: "#d97706", bg: "#fef3c7" },
          { label: "Rejected",       count: rejected.length, color: "#dc2626", bg: "#fee2e2" },
        ].map(s => (
          <div key={s.label} className="card rounded-3xl flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>
              <span className="stat-num" style={{ fontSize: "1.1rem", color: s.color }}>{s.count}</span>
            </div>
            <div>
              <p className="font-body font-medium text-ink text-sm">{s.label}</p>
              <p className="stat-label">templates</p>
            </div>
          </div>
        ))}
      </div>

      {/* Template list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card rounded-3xl h-20 animate-pulse bg-border-subtle" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="card rounded-3xl text-center py-16">
          <p className="font-display font-bold text-ink text-lg mb-2">No templates yet</p>
          <p className="font-body text-sm text-ink-muted mb-5">
            Create your first template — WhatsApp will review it within 24–72 hours
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary mx-auto">
            <Plus size={14} />Create Template
          </button>
        </div>
      ) : (
        <div className="card rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                {["Name", "Category", "Message", "Status", "Submitted", "Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left stat-label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {templates.map(t => {
                const sc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.PENDING;
                const catOption = CATEGORY_OPTIONS.find(c => c.value === t.category);
                return (
                  <tr key={t.id} className="hover:bg-surface-subtle transition-colors cursor-pointer" onClick={() => setViewTemplate(t)}>
                    <td className="px-4 py-3">
                      <p className="font-label font-semibold text-ink text-sm">{t.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-body text-xs text-ink-secondary">
                        {catOption?.label ?? t.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-body text-sm text-ink-secondary truncate">{t.body_text}</p>
                      {t.rejection_reason && (
                        <p className="font-body text-xs text-red-500 mt-0.5 truncate">
                          Rejected: {t.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${sc.badgeClass}`}>
                        <sc.icon size={10} />{sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-body text-xs text-ink-muted">
                        {new Date(t.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {t.status === "APPROVED" ? (
                          <button
                            onClick={() => handleBulkSend(t.name)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium transition-colors"
                          >
                            <Send size={11} />Use for Bulk Send
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSync(t.id)}
                            disabled={syncingId === t.id}
                            className="p-1.5 rounded-lg hover:bg-surface-subtle text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
                            title="Check approval status"
                          >
                            <RefreshCw size={13} className={syncingId === t.id ? "animate-spin" : ""} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── View Template Modal ────────────────────────────────────────────── */}
      {viewTemplate && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="font-body text-xs text-ink-muted mb-1">Template Name</p>
                <h2 className="font-mono font-semibold text-ink text-sm">{viewTemplate.name}</h2>
              </div>
              <button
                onClick={() => setViewTemplate(null)}
                className="p-1.5 rounded-xl hover:bg-surface-subtle text-ink-muted"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Status + category row */}
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[viewTemplate.status]?.badgeClass ?? "bg-gray-100 text-gray-500"}`}>
                  {(() => { const sc = STATUS_CONFIG[viewTemplate.status]; return sc ? <sc.icon size={10} /> : null; })()}
                  {STATUS_CONFIG[viewTemplate.status]?.label ?? viewTemplate.status}
                </span>
                <span className="font-body text-xs text-ink-secondary">
                  {CATEGORY_OPTIONS.find(c => c.value === viewTemplate.category)?.label ?? viewTemplate.category}
                </span>
                <span className="font-body text-xs text-ink-muted ml-auto">
                  {new Date(viewTemplate.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>

              {/* Full message body */}
              <div>
                <p className="font-body text-xs text-ink-muted mb-1.5">Message Body</p>
                <div className="bg-[#ECE5DD] rounded-2xl p-4">
                  <div className="bg-white rounded-2xl rounded-tl-none px-3 py-2 max-w-[90%] shadow-sm">
                    <p className="font-body text-sm text-[#111B21] whitespace-pre-wrap break-words">
                      {viewTemplate.body_text}
                    </p>
                    <p className="font-body text-[10px] text-gray-400 text-right mt-1">
                      {new Date(viewTemplate.submitted_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} ✓✓
                    </p>
                  </div>
                </div>
              </div>

              {/* Rejection reason */}
              {viewTemplate.rejection_reason && (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-100">
                  <p className="font-body text-xs text-red-700">
                    <span className="font-semibold">Rejection reason:</span> {viewTemplate.rejection_reason}
                  </p>
                </div>
              )}

              {/* Meta ID */}
              <div>
                <p className="font-body text-xs text-ink-muted mb-1">Meta Template ID</p>
                <p className="font-mono text-xs text-ink-secondary">{viewTemplate.id}</p>
              </div>
            </div>

            <button
              onClick={() => setViewTemplate(null)}
              className="w-full mt-5 py-2 rounded-2xl bg-surface-subtle hover:bg-border-subtle text-sm font-medium text-ink-secondary transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── New Template Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-4xl p-7 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display font-bold text-ink" style={{ fontSize: "1.2rem" }}>
                  New WhatsApp Template
                </h2>
                <p className="font-body text-sm text-ink-muted mt-1">Design and submit a new message template for Meta approval.</p>
              </div>
              <button onClick={resetModal} className="p-2 rounded-xl hover:bg-surface-subtle text-ink-muted transition-colors">
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 text-red-700 font-body text-sm flex items-center gap-2">
                <AlertCircle size={16} />{error}
              </div>
            )}

            <div className="grid grid-cols-5 gap-10">
              {/* Left: Form */}
              <div className="col-span-3 space-y-5">
                {/* Title */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">
                    Template Title
                  </label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Guru Peyarchi Homam Invite"
                    className="input"
                  />
                  {generatedName && (
                    <p className="font-body text-[11px] text-ink-muted mt-1.5">
                      Will be submitted as: <span className="font-mono text-ink bg-surface-subtle px-1.5 py-0.5 rounded">{generatedName}</span>
                    </p>
                  )}
                </div>

                {/* Category cards */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-2 block">
                    Message Type
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {CATEGORY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCategory(opt.value)}
                        className={`w-full text-left p-3 rounded-2xl border-2 transition-all ${
                          category === opt.value
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border-subtle hover:border-border bg-white"
                        }`}
                      >
                        <p className="font-body text-sm font-medium text-ink">{opt.label.split(' ')[0]} {opt.label.split(' ').slice(1).join(' ')}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">Language</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="input w-full sm:w-1/2">
                    {LANGUAGE_OPTIONS.map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>

                {/* Header text */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">
                    Header Text <span className="text-ink-muted font-normal">(optional, max 60 chars)</span>
                  </label>
                  <input
                    value={headerText}
                    onChange={e => setHeaderText(e.target.value)}
                    maxLength={60}
                    placeholder="e.g. Special Offer"
                    className="input"
                  />
                </div>

                {/* Body text */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">Message Body</label>
                  <textarea
                    value={bodyText}
                    onChange={e => setBodyText(e.target.value)}
                    placeholder={"🙏 Namaskaram {{1}},\n\nWe are performing the Guru Peyarchi Homam on your behalf.\n\nReply YES to book your spot. 🙏"}
                    rows={5}
                    className="input resize-y min-h-[120px]"
                  />
                  <p className="font-body text-xs text-ink-muted mt-1.5">
                    Use {"{{1}}"}, {"{{2}}"} etc. for personalised values like name, date.
                  </p>
                </div>

                {/* Footer text */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">
                    Footer Text <span className="text-ink-muted font-normal">(optional, max 60 chars)</span>
                  </label>
                  <input
                    value={footerText}
                    onChange={e => setFooterText(e.target.value)}
                    maxLength={60}
                    placeholder="e.g. Terms and conditions apply."
                    className="input"
                  />
                </div>

                {/* Quick Reply Buttons */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-body text-sm font-medium text-ink">
                      Quick Reply Buttons <span className="text-ink-muted font-normal">(optional, max 3)</span>
                    </label>
                    {buttons.length < 3 && (
                      <button
                        type="button"
                        onClick={addButton}
                        className="text-xs text-primary hover:underline font-semibold bg-primary/5 px-2 py-1 rounded-md"
                      >
                        + Add button
                      </button>
                    )}
                  </div>
                  {buttons.length === 0 && (
                    <p className="font-body text-xs text-ink-muted">
                      Add buttons like &quot;Book Now&quot; or &quot;Not Interested&quot; so users can reply with one tap.
                    </p>
                  )}
                  <div className="space-y-2.5">
                    {buttons.map((btn, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={btn}
                          onChange={e => updateButton(i, e.target.value)}
                          placeholder={i === 0 ? "Book Now" : i === buttons.length - 1 && i > 0 ? "வேண்டாம் (Not Interested)" : "Button text"}
                          maxLength={25}
                          className="input flex-1 text-sm bg-surface-subtle border-transparent focus:bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => removeButton(i)}
                          className="p-2 rounded-xl hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {buttons.length > 0 && (
                    <p className="font-body text-[11px] text-ink-muted mt-2">
                      Tip: Add &quot;வேண்டாம்&quot; or &quot;Not Interested&quot; as the last button so users can opt out with one tap.
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Live Preview */}
              <div className="col-span-2 flex flex-col">
                <label className="font-body text-sm font-medium text-ink mb-2 block">
                  Preview
                </label>
                <div className="bg-[#EFEAE2] rounded-3xl p-5 flex-1 relative overflow-hidden flex flex-col">
                  {/* WhatsApp chat background pattern overlay (optional, subtle) */}
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('https://static.whatsapp.net/rsrc.php/v3/yl/r/r_Q1kFPEKdt.png')", backgroundSize: "400px" }}></div>
                  
                  <div className="relative z-10 w-full">
                    <div className="bg-white rounded-[18px] rounded-tl-sm px-3.5 py-2.5 shadow-sm w-[92%] float-left clear-both relative">
                      {headerText && (
                        <p className="font-body text-[13px] font-bold text-[#111B21] mb-1 break-words">
                          {headerText}
                        </p>
                      )}
                      
                      <p className="font-body text-[13.5px] text-[#111B21] whitespace-pre-wrap break-words leading-relaxed">
                        {bodyText ? renderPreview(bodyText) : (
                          <span className="text-gray-400 italic">Your message will appear here…</span>
                        )}
                      </p>
                      
                      {footerText && (
                        <p className="font-body text-[11.5px] text-gray-500 mt-1.5 break-words">
                          {footerText}
                        </p>
                      )}
                      
                      <div className="flex justify-end items-center gap-1 mt-0.5">
                        <p className="font-body text-[10px] text-gray-400">12:00 PM</p>
                        <svg viewBox="0 0 16 11" height="11" width="16" preserveAspectRatio="xMidYMid meet" className="text-[#53bdeb]"><path d="M11.832 0 4.887 6.945 1.79 3.848.376 5.263l4.511 4.511L13.246 1.414zM16 1.414l-1.414-1.414-3.414 3.414 1.414 1.414zM10.22 6.946l1.414-1.414 3.414 3.414-1.414 1.414z" fill="currentColor"></path></svg>
                      </div>
                    </div>
                    
                    {buttons.filter(b => b.trim()).length > 0 && (
                      <div className="mt-1.5 space-y-1.5 w-[92%] float-left clear-both">
                        {buttons.filter(b => b.trim()).map((btn, i) => (
                          <div key={i} className="bg-white rounded-xl px-4 py-2.5 text-center text-[13.5px] text-[#00a884] font-medium shadow-sm w-full truncate border border-white">
                            {btn}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <p className="font-body text-xs text-ink-muted mt-3 text-center">
                  This is how your message will look on WhatsApp.
                </p>
                <div className="mt-5 p-3.5 rounded-2xl bg-amber-50/80 border border-amber-100 flex gap-3 items-start">
                  <Clock size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="font-body text-xs text-amber-800 leading-relaxed">
                    WhatsApp reviews new templates within <strong>24–72 hours</strong>. You will see the status update automatically here once approved.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8 pt-5 border-t border-border-subtle justify-end">
              <button onClick={resetModal} className="btn-ghost px-6">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || !bodyText.trim()}
                className="btn-primary px-8"
              >
                {submitting ? "Submitting…" : "Submit to WhatsApp"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
