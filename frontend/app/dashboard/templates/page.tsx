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
  return text
    .replace(/\{\{1\}\}/g, "[Variable 1]")
    .replace(/\{\{2\}\}/g, "[Variable 2]")
    .replace(/\{\{3\}\}/g, "[Variable 3]")
    .replace(/\{\{(\d+)\}\}/g, "[Variable $1]");
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
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("UTILITY");
  const [language, setLanguage] = useState("en");
  const [bodyText, setBodyText] = useState("");

  const generatedName = toTemplateName(title);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ data: Template[] }>("/api/v1/templates/");
      setTemplates(data.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function resetModal() {
    setTitle(""); setBodyText(""); setCategory("UTILITY"); setLanguage("en");
    setError(null); setShowModal(false);
  }

  async function handleSubmit() {
    if (!title.trim() || !bodyText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/v1/templates/", {
        method: "POST",
        body: JSON.stringify({ name: generatedName, category, language, body_text: bodyText.trim() }),
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
    await apiFetch(`/api/v1/templates/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleSync(id: string) {
    setSyncingId(id);
    try {
      const updated = await apiFetch<Template>(`/api/v1/templates/${id}/sync`, { method: "POST" });
      setTemplates(prev => prev.map(t => t.id === id ? updated : t));
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
                  <tr key={t.id} className="hover:bg-surface-subtle transition-colors">
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
                    <td className="px-4 py-3">
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

      {/* ── New Template Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-ink" style={{ fontSize: "1.05rem" }}>
                New WhatsApp Template
              </h2>
              <button onClick={resetModal} className="p-1.5 rounded-xl hover:bg-surface-subtle text-ink-muted">
                <X size={16} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-2xl bg-red-50 text-red-700 font-body text-sm flex items-center gap-2">
                <AlertCircle size={14} />{error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              {/* Left: Form */}
              <div className="space-y-4">
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
                    <p className="font-body text-xs text-ink-muted mt-1">
                      Will be submitted as: <span className="font-mono text-ink">{generatedName}</span>
                    </p>
                  )}
                </div>

                {/* Category cards */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-2 block">
                    Message Type
                  </label>
                  <div className="space-y-2">
                    {CATEGORY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCategory(opt.value)}
                        className={`w-full text-left p-3 rounded-2xl border-2 transition-colors ${
                          category === opt.value
                            ? "border-primary bg-primary/5"
                            : "border-border-subtle hover:border-border bg-white"
                        }`}
                      >
                        <p className="font-body text-sm font-medium text-ink">{opt.label}</p>
                        <p className="font-body text-xs text-ink-muted mt-0.5">{opt.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">Language</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="input">
                    {LANGUAGE_OPTIONS.map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>

                {/* Body text */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">Message Body</label>
                  <textarea
                    value={bodyText}
                    onChange={e => setBodyText(e.target.value)}
                    placeholder={"🙏 Namaskaram {{1}},\n\nWe are performing the Guru Peyarchi Homam on your behalf.\n\nReply YES to book your spot. 🙏"}
                    rows={5}
                    className="input resize-none"
                  />
                  <p className="font-body text-xs text-ink-muted mt-1">
                    Use {"{{1}}"}, {"{{2}}"} etc. for personalised values like name, date.
                  </p>
                </div>
              </div>

              {/* Right: Live Preview */}
              <div>
                <label className="font-body text-sm font-medium text-ink mb-2 block">
                  Preview
                </label>
                <div className="bg-[#ECE5DD] rounded-2xl p-4 min-h-40">
                  <div className="bg-white rounded-2xl rounded-tl-none px-3 py-2 max-w-[85%] shadow-sm">
                    <p className="font-body text-sm text-[#111B21] whitespace-pre-wrap break-words">
                      {bodyText ? renderPreview(bodyText) : (
                        <span className="text-gray-400 italic">Your message will appear here…</span>
                      )}
                    </p>
                    <p className="font-body text-[10px] text-gray-400 text-right mt-1">12:00 PM ✓✓</p>
                  </div>
                </div>
                <p className="font-body text-xs text-ink-muted mt-2">
                  This is how your message will look on WhatsApp.
                </p>
                <div className="mt-4 p-3 rounded-2xl bg-amber-50 border border-amber-200">
                  <p className="font-body text-xs text-amber-800">
                    ⏱ WhatsApp reviews new templates within <strong>24–72 hours</strong>. You will see the status update automatically here once approved.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={resetModal} className="btn-ghost flex-1">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || !bodyText.trim()}
                className="btn-primary flex-1"
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
