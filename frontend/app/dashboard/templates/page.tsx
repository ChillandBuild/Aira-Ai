"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Trash2, Check, Clock, AlertCircle, RefreshCw, Send, Upload, Image as ImageIcon, ChevronDown } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Button = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "WHATSAPP_CALL" | "COPY_CODE";
  text: string;
  url?: string;
  phone?: string;
  country?: string;
  offer_code?: string;
  active_for_days?: number;
};

type Template = {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  body_text: string;
  header_text?: string | null;
  header_media_type?: string | null;
  header_media_url?: string | null;
  header_media_id?: string | null;
  footer_text?: string | null;
  buttons?: Button[] | null;
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
  const [headerMediaType, setHeaderMediaType] = useState<string>("NONE");
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [headerMediaId, setHeaderMediaId] = useState<string>("");
  const [headerMediaFile, setHeaderMediaFile] = useState<File | null>(null);
  const [headerMediaPreview, setHeaderMediaPreview] = useState<string>("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<Button[]>([]);
  const [showButtonTypePicker, setShowButtonTypePicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generatedName = toTemplateName(title);

  function addButton(type: Button["type"]) {
    if (buttons.length < 3) {
      const newButton: Button = { type, text: "" };
      if (type === "URL") {
        newButton.url = "";
      } else if (type === "PHONE_NUMBER" || type === "WHATSAPP_CALL") {
        newButton.phone = "";
        newButton.country = "+91";
        if (type === "WHATSAPP_CALL") {
          newButton.active_for_days = 7;
        }
      } else if (type === "COPY_CODE") {
        newButton.offer_code = "";
      }
      setButtons(prev => [...prev, newButton]);
      setShowButtonTypePicker(false);
    }
  }
  function updateButton(index: number, field: keyof Button, value: string | number) {
    setButtons(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b));
  }
  function removeButton(index: number) {
    setButtons(prev => prev.filter((_, i) => i !== index));
  }

  async function handleMediaUpload(file: File) {
    setUploadingMedia(true);
    try {
      const authHeaders = await getAuthHeaders();
      const formData = new FormData();
      formData.append("file", file);
      
      const res = await fetch(`${API_URL}/api/v1/templates/upload-media`, {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      
      if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
      
      const data = await res.json();
      setHeaderMediaId(data.media_id);
      setHeaderMediaUrl(data.media_id);
      
      const previewUrl = URL.createObjectURL(file);
      setHeaderMediaPreview(previewUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload media");
    } finally {
      setUploadingMedia(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setHeaderMediaFile(file);
      const previewUrl = URL.createObjectURL(file);
      setHeaderMediaPreview(previewUrl);
    }
  }

  function clearMedia() {
    setHeaderMediaFile(null);
    setHeaderMediaPreview("");
    setHeaderMediaId("");
    setHeaderMediaUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    setTitle(""); setBodyText(""); setHeaderText(""); setHeaderMediaType("NONE"); setHeaderMediaUrl(""); setHeaderMediaId(""); setHeaderMediaFile(null); setHeaderMediaPreview(""); setFooterText(""); setCategory("UTILITY"); setLanguage("en");
    setButtons([]); setShowButtonTypePicker(false);
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
      if (headerMediaFile && headerMediaType === "IMAGE" && !headerMediaId) {
        await handleMediaUpload(headerMediaFile);
      }
      
      await apiFetch("/api/v1/templates/", {
        method: "POST",
        body: JSON.stringify({
          name: generatedName,
          category,
          language,
          body_text: bodyText.trim(),
          header_text: headerText.trim() || null,
          header_media_type: headerMediaType !== "NONE" ? headerMediaType : null,
          header_media_url: headerMediaId || headerMediaUrl.trim() || null,
          footer_text: footerText.trim() || null,
          buttons: buttons.filter(b => b.text.trim()).length > 0 ? buttons.filter(b => b.text.trim()) : undefined,
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl p-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display font-bold text-ink text-xl">
                  New WhatsApp Template
                </h2>
                <p className="font-body text-sm text-ink-muted mt-1">Design and submit a new message template for Meta approval.</p>
              </div>
              <button onClick={resetModal} className="p-2 rounded-xl hover:bg-surface-subtle text-ink-muted transition-colors">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 text-red-700 font-body text-sm flex items-center gap-2">
                <AlertCircle size={16} />{error}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              {/* Left: Form */}
              <div className="lg:col-span-3 space-y-5">
                {/* Title */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">
                    Template Title
                  </label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Welcome Message"
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

                {/* Media support */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">
                    Media Header <span className="text-ink-muted font-normal">(optional)</span>
                  </label>
                  <select
                    value={headerMediaType}
                    onChange={e => setHeaderMediaType(e.target.value)}
                    className="input w-full sm:w-1/2 mb-3"
                  >
                    <option value="NONE">None</option>
                    <option value="IMAGE">Image</option>
                    <option value="VIDEO">Video</option>
                    <option value="DOCUMENT">Document</option>
                    <option value="LOCATION">Location</option>
                  </select>
                  
                  {headerMediaType === "IMAGE" && (
                    <div className="space-y-2">
                      {headerMediaPreview ? (
                        <div className="relative rounded-xl overflow-hidden border border-border-subtle">
                          <img src={headerMediaPreview} alt="Preview" className="w-full h-32 object-cover" />
                          <button
                            type="button"
                            onClick={clearMedia}
                            className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-lg hover:bg-white shadow-sm"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-border-subtle rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                          <Upload size={24} className="mx-auto text-ink-muted mb-2" />
                          <p className="font-body text-sm text-ink-secondary">
                            {uploadingMedia ? "Uploading..." : "Click to upload image"}
                          </p>
                          <p className="font-body text-xs text-ink-muted mt-1">
                            JPEG, PNG, WebP • Max 5MB
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {headerMediaType !== "NONE" && headerMediaType !== "IMAGE" && (
                    <input
                      value={headerMediaUrl}
                      onChange={e => setHeaderMediaUrl(e.target.value)}
                      placeholder={
                        headerMediaType === "LOCATION"
                          ? "https://maps.google.com/?q=..."
                          : "https://example.com/media.mp4"
                      }
                      className="input"
                    />
                  )}
                </div>

                {/* Body text */}
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">Message Body</label>
                  <textarea
                    value={bodyText}
                    onChange={e => setBodyText(e.target.value)}
                    placeholder={"Hi {{1}},\n\nThank you for your interest. Reply YES to confirm your booking."}
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

                {/* Buttons */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-body text-sm font-medium text-ink">
                      Buttons <span className="text-ink-muted font-normal">(optional, max 3)</span>
                    </label>
                    {buttons.length < 3 && !showButtonTypePicker && (
                      <button
                        type="button"
                        onClick={() => setShowButtonTypePicker(true)}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-semibold bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Plus size={14} /> Add button
                      </button>
                    )}
                  </div>
                  
                  {/* Button type picker dropdown */}
                  {showButtonTypePicker && buttons.length < 3 && (
                    <div className="mb-3 p-3 rounded-xl bg-surface-subtle border border-border-subtle">
                      <p className="font-body text-xs text-ink-muted mb-2">Select button type:</p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {[
                          { type: "QUICK_REPLY" as const, label: "Quick Reply", icon: "💬", desc: "Custom reply text" },
                          { type: "URL" as const, label: "Visit Website", icon: "🔗", desc: "Open a URL" },
                          { type: "WHATSAPP_CALL" as const, label: "Call on WhatsApp", icon: "📞", desc: "WhatsApp call button" },
                          { type: "PHONE_NUMBER" as const, label: "Call Phone Number", icon: "📱", desc: "Phone call button" },
                          { type: "COPY_CODE" as const, label: "Copy Offer Code", icon: "📋", desc: "Copy code to clipboard" },
                        ].map(opt => (
                          <button
                            key={opt.type}
                            type="button"
                            onClick={() => addButton(opt.type)}
                            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-left"
                          >
                            <span className="text-lg">{opt.icon}</span>
                            <div>
                              <p className="font-body text-sm font-medium text-ink">{opt.label}</p>
                              <p className="font-body text-xs text-ink-muted">{opt.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowButtonTypePicker(false)}
                        className="mt-2 text-xs text-ink-muted hover:text-ink-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  
                  {buttons.length === 0 && !showButtonTypePicker && (
                    <p className="font-body text-xs text-ink-muted">
                      Add buttons so users can respond or take action with one tap.
                    </p>
                  )}
                  
                  <div className="space-y-3">
                    {buttons.map((btn, i) => (
                      <div key={i} className="p-4 rounded-xl bg-white border border-border-subtle shadow-sm space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <p className="font-body text-xs text-ink-muted mb-1">Button type</p>
                            <div className="flex items-center gap-2">
                              <span className="text-base">
                                {btn.type === "QUICK_REPLY" && "💬"}
                                {btn.type === "URL" && "🔗"}
                                {btn.type === "WHATSAPP_CALL" && "📞"}
                                {btn.type === "PHONE_NUMBER" && ""}
                                {btn.type === "COPY_CODE" && "📋"}
                              </span>
                              <select
                                value={btn.type}
                                onChange={e => updateButton(i, "type", e.target.value)}
                                className="input text-sm py-1.5 flex-1"
                              >
                                <option value="QUICK_REPLY">Quick Reply</option>
                                <option value="URL">Visit Website</option>
                                <option value="WHATSAPP_CALL">Call on WhatsApp</option>
                                <option value="PHONE_NUMBER">Call Phone Number</option>
                                <option value="COPY_CODE">Copy Offer Code</option>
                              </select>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeButton(i)}
                            className="p-2 rounded-lg hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors flex-shrink-0 mt-5"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        
                        {/* Button text (all types) */}
                        <div>
                          <p className="font-body text-xs text-ink-muted mb-1">Button text</p>
                          <input
                            value={btn.text}
                            onChange={e => updateButton(i, "text", e.target.value.slice(0, 25))}
                            placeholder={
                              btn.type === "QUICK_REPLY" ? "e.g. Book Now" :
                              btn.type === "URL" ? "e.g. Visit Website" :
                              btn.type === "WHATSAPP_CALL" ? "e.g. Call on WhatsApp" :
                              btn.type === "PHONE_NUMBER" ? "e.g. Call Us" :
                              "e.g. Copy Code"
                            }
                            maxLength={25}
                            className="input text-sm"
                          />
                        </div>
                        
                        {/* URL fields */}
                        {btn.type === "URL" && (
                          <div>
                            <p className="font-body text-xs text-ink-muted mb-1">Website URL</p>
                            <input
                              value={btn.url || ""}
                              onChange={e => updateButton(i, "url", e.target.value)}
                              placeholder="https://www.example.com"
                              className="input text-sm"
                            />
                          </div>
                        )}
                        
                        {/* Phone number fields */}
                        {(btn.type === "PHONE_NUMBER" || btn.type === "WHATSAPP_CALL") && (
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <p className="font-body text-xs text-ink-muted mb-1">Country</p>
                              <select
                                value={btn.country || "+91"}
                                onChange={e => updateButton(i, "country", e.target.value)}
                                className="input text-sm"
                              >
                                <option value="+91">IN +91</option>
                                <option value="+1">US +1</option>
                                <option value="+44">UK +44</option>
                                <option value="+61">AU +61</option>
                                <option value="+81">JP +81</option>
                              </select>
                            </div>
                            <div className="col-span-2">
                              <p className="font-body text-xs text-ink-muted mb-1">Phone number</p>
                              <input
                                value={btn.phone || ""}
                                onChange={e => updateButton(i, "phone", e.target.value)}
                                placeholder="9876543210"
                                className="input text-sm"
                              />
                            </div>
                          </div>
                        )}
                        
                        {/* WhatsApp call active for */}
                        {btn.type === "WHATSAPP_CALL" && (
                          <div>
                            <p className="font-body text-xs text-ink-muted mb-1">Active for</p>
                            <select
                              value={btn.active_for_days || 7}
                              onChange={e => updateButton(i, "active_for_days", parseInt(e.target.value))}
                              className="input text-sm"
                            >
                              <option value={7}>7 days</option>
                              <option value={30}>30 days</option>
                              <option value={90}>90 days</option>
                            </select>
                          </div>
                        )}
                        
                        {/* Copy offer code */}
                        {btn.type === "COPY_CODE" && (
                          <div>
                            <p className="font-body text-xs text-ink-muted mb-1">Offer code</p>
                            <input
                              value={btn.offer_code || ""}
                              onChange={e => updateButton(i, "offer_code", e.target.value.slice(0, 20))}
                              placeholder="e.g. SAVE20"
                              maxLength={20}
                              className="input text-sm"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Live Preview */}
              <div className="lg:col-span-2 flex flex-col">
                <label className="font-body text-sm font-medium text-ink mb-2 block">
                  Preview
                </label>
                <div className="bg-[#EFEAE2] rounded-3xl p-5 flex-1 relative overflow-hidden flex flex-col min-h-[500px]">
                  {/* WhatsApp chat background pattern overlay */}
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('https://static.whatsapp.net/rsrc.php/v3/yl/r/r_Q1kFPEKdt.png')", backgroundSize: "400px" }}></div>
                  
                  <div className="relative z-10 w-full">
                    {/* Media header preview */}
                    {headerMediaType !== "NONE" && (headerMediaPreview || headerMediaUrl) && (
                      <div className="mb-2 w-[92%] float-left clear-both">
                        {headerMediaType === "IMAGE" && headerMediaPreview && (
                          <img src={headerMediaPreview} alt="Header" className="w-full h-32 object-cover rounded-t-[18px]" />
                        )}
                        {headerMediaType === "IMAGE" && !headerMediaPreview && (
                          <div className="bg-gray-200 rounded-t-[18px] h-32 flex items-center justify-center">
                            <ImageIcon size={24} className="text-gray-400" />
                          </div>
                        )}
                        {headerMediaType === "VIDEO" && (
                          <div className="bg-gray-200 rounded-t-[18px] h-32 flex items-center justify-center">
                            <span className="text-gray-500 text-xs">▶ Video</span>
                          </div>
                        )}
                        {headerMediaType === "DOCUMENT" && (
                          <div className="bg-gray-200 rounded-t-[18px] h-20 flex items-center justify-center gap-2">
                            <span className="text-gray-500 text-xs">📄 Document</span>
                          </div>
                        )}
                        {headerMediaType === "LOCATION" && (
                          <div className="bg-gray-200 rounded-t-[18px] h-32 flex items-center justify-center">
                            <span className="text-gray-500 text-xs">📍 Location</span>
                          </div>
                        )}
                      </div>
                    )}
                    
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
                    
                    {buttons.filter(b => b.text.trim()).length > 0 && (
                      <div className="mt-1.5 space-y-1.5 w-[92%] float-left clear-both">
                        {buttons.filter(b => b.text.trim()).map((btn, i) => (
                          <div key={i} className="bg-white rounded-xl px-4 py-2.5 text-center text-[13.5px] font-medium shadow-sm w-full truncate border border-white hover:bg-gray-50 transition-colors">
                            {btn.type === "QUICK_REPLY" && (
                              <span className="text-[#00a884]">{btn.text}</span>
                            )}
                            {btn.type === "URL" && (
                              <span className="text-[#00a884]">🔗 {btn.text}</span>
                            )}
                            {btn.type === "WHATSAPP_CALL" && (
                              <span className="text-[#00a884]">📞 {btn.text}</span>
                            )}
                            {btn.type === "PHONE_NUMBER" && (
                              <span className="text-[#00a884]">📱 {btn.text}</span>
                            )}
                            {btn.type === "COPY_CODE" && (
                              <span className="text-[#00a884]">📋 {btn.text}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <p className="font-body text-xs text-ink-muted mt-3 text-center">
                  This is how your message will look on WhatsApp.
                </p>
                <div className="mt-4 p-3.5 rounded-2xl bg-amber-50/80 border border-amber-100 flex gap-3 items-start">
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
