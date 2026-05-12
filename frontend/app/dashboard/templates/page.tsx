"use client";
import { useEffect, useState } from "react";
import { Plus, X, Trash2, Check, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

type Template = {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  body_text: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAUSED";
  rejection_reason: string | null;
  rejection_reason: string | null;
  created_at: string;
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
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
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
          <a href="/dashboard/templates/create" className="btn-primary"><Plus size={14} />New Template</a>
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
          <a href="/dashboard/templates/create" className="btn-primary mx-auto w-fit"><Plus size={14} />Create Template</a>
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
                      <p className="font-body text-sm text-ink-secondary truncate">
                        {t.components?.find((c: any) => c.type === 'BODY')?.text || t.body_text || "No body text"}
                      </p>
                      {t.rejection_reason && (
                        <p className="font-body text-xs text-red-500 mt-0.5 truncate">{t.rejection_reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={sc.class}><sc.icon size={10} />{sc.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-body text-xs text-ink-muted">
                        {new Date(t.created_at || t.submitted_at || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
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

      )}
    </div>
  );
}
