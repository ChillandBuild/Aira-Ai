"use client";
import { useEffect, useState } from "react";
import { Plus, X, Trash2, Check, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { API_URL } from "@/lib/api";

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

const STATUS_CONFIG = {
  APPROVED: { label: "Approved", class: "badge badge-green", icon: Check },
  PENDING:  { label: "Pending",  class: "badge badge-yellow", icon: Clock },
  REJECTED: { label: "Rejected", class: "badge badge-red", icon: AlertCircle },
  PAUSED:   { label: "Paused",   class: "badge badge-gray", icon: AlertCircle },
};

const CATEGORY_CONFIG = {
  MARKETING:      { label: "Marketing",      bg: "#dbeafe", color: "#1e40af" },
  UTILITY:        { label: "Utility",        bg: "#d1fae5", color: "#065f46" },
  AUTHENTICATION: { label: "Authentication", bg: "#ede9fe", color: "#5b21b6" },
};

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("UTILITY");
  const [language, setLanguage] = useState("en");
  const [bodyText, setBodyText] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ data: Template[] }>("/api/v1/templates");
      setTemplates(data.data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit() {
    if (!name.trim() || !bodyText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/v1/templates", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), category, language, body_text: bodyText.trim() }),
      });
      setShowModal(false);
      setName(""); setBodyText(""); setCategory("UTILITY"); setLanguage("en");
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

  const approved = templates.filter(t => t.status === "APPROVED");
  const pending  = templates.filter(t => t.status === "PENDING");
  const rejected = templates.filter(t => t.status === "REJECTED" || t.status === "PAUSED");

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="page-title">Message Templates</h1>
          <p className="page-subtitle">Submit templates to Meta for approval. Only approved templates can be used in bulk sends.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} />Refresh</button>
          <button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={14} />New Template</button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Approved", count: approved.length, color: "#059669", bg: "#d1fae5" },
          { label: "Pending Review", count: pending.length, color: "#d97706", bg: "#fef3c7" },
          { label: "Rejected", count: rejected.length, color: "#dc2626", bg: "#fee2e2" },
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
        <div className="space-y-3">{[...Array(3)].map((_, i) => (
          <div key={i} className="card rounded-3xl h-20 animate-pulse bg-border-subtle" />
        ))}</div>
      ) : templates.length === 0 ? (
        <div className="card rounded-3xl text-center py-16">
          <p className="font-display font-bold text-ink text-lg mb-2">No templates yet</p>
          <p className="font-body text-sm text-ink-muted mb-5">Submit your first template to Meta for approval</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mx-auto"><Plus size={14} />Create Template</button>
        </div>
      ) : (
        <div className="card rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                {["Name", "Category", "Body", "Status", "Submitted", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left stat-label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {templates.map(t => {
                const sc = STATUS_CONFIG[t.status];
                const cc = CATEGORY_CONFIG[t.category];
                return (
                  <tr key={t.id} className="hover:bg-surface-subtle transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-label font-semibold text-ink text-sm">{t.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge" style={{ background: cc.bg, color: cc.color }}>{cc.label}</span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-body text-sm text-ink-secondary truncate">{t.body_text}</p>
                      {t.rejection_reason && (
                        <p className="font-body text-xs text-red-500 mt-0.5 truncate">{t.rejection_reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={sc.class}><sc.icon size={10} />{sc.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-body text-xs text-ink-muted">
                        {new Date(t.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Template Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-ink" style={{ fontSize: "1.05rem" }}>New Template</h2>
              <button onClick={() => { setShowModal(false); setError(null); }} className="p-1.5 rounded-xl hover:bg-surface-subtle text-ink-muted">
                <X size={16} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-2xl bg-red-50 text-red-700 font-body text-sm flex items-center gap-2">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">Template Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. admission_reminder" className="input" />
                <p className="font-body text-xs text-ink-muted mt-1">Lowercase, underscores only. This is permanent once submitted.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value as typeof category)} className="input">
                    <option value="UTILITY">Utility</option>
                    <option value="MARKETING">Marketing</option>
                    <option value="AUTHENTICATION">Authentication</option>
                  </select>
                </div>
                <div>
                  <label className="font-body text-sm font-medium text-ink mb-1.5 block">Language</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="input">
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="ta">Tamil</option>
                    <option value="te">Telugu</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">Message Body</label>
                <textarea
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  placeholder="Hi {{1}}, your admission counselling is scheduled for {{2}} at {{3}}."
                  rows={4}
                  className="input resize-none"
                />
                <p className="font-body text-xs text-ink-muted mt-1">Use {"{{1}}"}, {"{{2}}"} etc. for variables (name, date, etc.)</p>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => { setShowModal(false); setError(null); }} className="btn-ghost flex-1">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting || !name.trim() || !bodyText.trim()} className="btn-primary flex-1">
                {submitting ? "Submitting…" : "Submit to Meta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
