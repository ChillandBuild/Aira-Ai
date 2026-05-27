"use client";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Trash2, Edit3, CheckCircle2, XCircle,
  Upload, FileText, Loader2, Info, AlertCircle,
  Database, HelpCircle, Sparkles, Save, MessageCircle, Target
} from "lucide-react";
import { api, FAQ, FAQInput, AIPrompt } from "@/lib/api";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { usePolling } from "@/hooks/usePolling";

function IgIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TgIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function FbIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

interface KnowledgeDoc {
  id: string;
  name: string;
  size_bytes: number;
  file_type: string;
  status: string;
  created_at: string;
  chunk_count?: number;
  error_message?: string;
}

export default function KnowledgePage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"faqs" | "documents" | "ai-tune" | "scoring">("faqs");

  // FAQ Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQ | null>(null);
  const [faqForm, setFaqForm] = useState<FAQInput>({ question: "", answer: "", keywords: [] });
  const [keywordInput, setKeywordInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Document Upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // AI Tune
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [activeName, setActiveName] = useState<string>("whatsapp_reply");
  const [draft, setDraft] = useState<string>("");
  const [tuneMsg, setTuneMsg] = useState<string | null>(null);
  const [tuneSaving, setTuneSaving] = useState(false);

  // Scoring config
  const [scoringRubric, setScoringRubric] = useState("");
  const [scoringThresholds, setScoringThresholds] = useState({ A: 9, B: 7, C: 5 });
  const [scoringSaving, setScoringSaving] = useState(false);
  const [scoringMsg, setScoringMsg] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const hasProcessing = useMemo(
    () => documents.some((d) => d.status === "processing"),
    [documents]
  );
  usePolling(loadDocuments, 5000, hasProcessing);

  useEffect(() => {
    if (tab === "ai-tune" && prompts.length === 0) loadPrompts();
    if (tab === "scoring") loadScoringConfig();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cur = prompts.find((x) => x.name === activeName);
    if (cur) setDraft(cur.content);
  }, [activeName, prompts]);

  async function loadData() {
    setLoading(true);
    try {
      const [faqData, docData] = await Promise.all([
        api.knowledge.list(),
        api.knowledge.listDocuments()
      ]);
      setFaqs(faqData);
      setDocuments(docData);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function loadDocuments() {
    try {
      const docData = await api.knowledge.listDocuments();
      setDocuments(docData);
    } catch {}
  }

  async function loadPrompts() {
    try {
      const p = await api.aiTune.prompts();
      setPrompts(p);
      const cur = p.find((x: AIPrompt) => x.name === activeName) ?? p[0];
      if (cur) {
        setActiveName(cur.name);
        setDraft(cur.content);
      }
    } catch {}
  }

  const filteredFaqs = faqs.filter(f =>
    f.question.toLowerCase().includes(search.toLowerCase()) ||
    f.answer.toLowerCase().includes(search.toLowerCase()) ||
    f.keywords.some(k => k.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredDocs = documents.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  // FAQ Handlers
  async function saveFaq() {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) return;
    setSaving(true);
    try {
      if (editingFaq) {
        await api.knowledge.update(editingFaq.id, faqForm);
      } else {
        await api.knowledge.create(faqForm);
      }
      setIsModalOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save FAQ");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFaq(id: string) {
    if (!confirm("Delete this FAQ?")) return;
    try {
      await api.knowledge.remove(id);
      loadData();
    } catch {
      toast.error("Delete failed");
    }
  }

  // Document Handlers
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      await api.knowledge.uploadDocument(file);
      loadDocuments();
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(id: string) {
    if (!confirm("Delete this document and all its indexed knowledge?")) return;
    try {
      await api.knowledge.deleteDocument(id);
      loadDocuments();
    } catch {
      toast.error("Delete failed");
    }
  }

  // AI Tune Handlers
  function handleChannelSwitch(channelId: string) {
    if (draft !== activePrompt?.content) {
      if (!confirm("You have unsaved changes. Switch channel anyway?")) {
        return;
      }
    }
    setActiveName(channelId);
  }

  async function savePrompt() {
    setTuneSaving(true);
    try {
      await api.aiTune.updatePrompt(activeName, draft);
      setTuneMsg("Prompt saved.");
      await loadPrompts();
    } catch (err) {
      setTuneMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setTuneSaving(false);
    }
  }

  const activePrompt = prompts.find((p) => p.name === activeName);

  async function loadScoringConfig() {
    try {
      const { API_URL, getAuthHeaders } = await import("@/lib/api");
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/settings`, { headers: auth });
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, string> = {};
      for (const s of (data.settings ?? [])) map[s.key] = s.display_value ?? "";
      if (map.scoring_rubric && map.scoring_rubric !== "Not set") setScoringRubric(map.scoring_rubric);
      if (map.scoring_segment_thresholds && map.scoring_segment_thresholds !== "Not set") {
        try {
          const t = JSON.parse(map.scoring_segment_thresholds);
          setScoringThresholds({ A: t.A ?? 9, B: t.B ?? 7, C: t.C ?? 5 });
        } catch { /* ignore parse error */ }
      }
    } catch { /* silent */ }
  }

  async function saveScoringConfig() {
    setScoringSaving(true);
    setScoringMsg(null);
    try {
      const { API_URL, getAuthHeaders } = await import("@/lib/api");
      const auth = await getAuthHeaders();
      const updates: Record<string, string> = {
        scoring_segment_thresholds: JSON.stringify(scoringThresholds),
      };
      if (scoringRubric.trim()) updates.scoring_rubric = scoringRubric.trim();
      const res = await fetch(`${API_URL}/api/v1/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error("Save failed");
      setScoringMsg("Scoring config saved.");
      setTimeout(() => setScoringMsg(null), 3000);
    } catch (err) {
      setScoringMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setScoringSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-tertiary">Knowledge Base</h1>
          <p className="font-body text-on-surface-muted mt-1">
            Train your AI agent with FAQs and documents to answer lead queries accurately.
          </p>
        </div>
        {tab === "faqs" && (
          <button
            onClick={() => { setEditingFaq(null); setFaqForm({ question: "", answer: "", keywords: [] }); setIsModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-tertiary text-white rounded-xl font-label font-semibold shadow-card hover:bg-tertiary/90 transition-all shrink-0"
          >
            <Plus size={18} /> Add FAQ
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-mid">
        <button
          onClick={() => setTab("faqs")}
          className={cn(
            "px-6 py-3 font-label font-semibold text-sm transition-all border-b-2",
            tab === "faqs" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"
          )}
        >
          <div className="flex items-center gap-2">
            <HelpCircle size={16} /> FAQs
          </div>
        </button>
        <button
          onClick={() => setTab("documents")}
          className={cn(
            "px-6 py-3 font-label font-semibold text-sm transition-all border-b-2",
            tab === "documents" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"
          )}
        >
          <div className="flex items-center gap-2">
            <Database size={16} /> Documents (RAG)
          </div>
        </button>
        <button
          onClick={() => setTab("ai-tune")}
          className={cn(
            "px-6 py-3 font-label font-semibold text-sm transition-all border-b-2",
            tab === "ai-tune" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"
          )}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} /> AI Tune
          </div>
        </button>
        <button
          onClick={() => setTab("scoring")}
          className={cn(
            "px-6 py-3 font-label font-semibold text-sm transition-all border-b-2",
            tab === "scoring" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"
          )}
        >
          <div className="flex items-center gap-2">
            <Target size={16} /> Scoring
          </div>
        </button>
      </div>

      {tab !== "ai-tune" && tab !== "scoring" && (
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted" />
          <input
            type="text"
            placeholder={tab === "faqs" ? "Search FAQs..." : "Search documents..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface border border-surface-mid focus:outline-none focus:ring-2 focus:ring-tertiary font-body text-sm"
          />
        </div>
      )}

      {tab === "faqs" ? (
        <div className="grid grid-cols-1 gap-4">
          {loading ? (
            <div className="flex flex-col items-center py-12 text-on-surface-muted">
              <Loader2 size={32} className="animate-spin mb-2" />
              <p>Loading knowledge base...</p>
            </div>
          ) : filteredFaqs.length === 0 ? (
            <div className="text-center py-12 bg-surface rounded-card border border-dashed border-surface-mid">
              <p className="text-on-surface-muted">No FAQs found. Start by adding one!</p>
            </div>
          ) : (
            filteredFaqs.map(faq => (
              <div key={faq.id} className="bg-surface rounded-card p-5 border border-surface-mid shadow-sm hover:shadow-md transition-all group">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-2">
                    <h3 className="font-display font-bold text-lg text-tertiary">{faq.question}</h3>
                    <p className="font-body text-on-surface leading-relaxed whitespace-pre-wrap">{faq.answer}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {faq.keywords.map(kw => (
                        <span key={kw} className="px-2 py-0.5 bg-tertiary-bg text-tertiary rounded-lg text-[10px] font-label font-semibold border border-tertiary/10">
                          {kw}
                        </span>
                      ))}
                      <span className="ml-auto text-[10px] font-label text-on-surface-muted">
                        Hits: {faq.hit_count || 0}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditingFaq(faq); setFaqForm({ question: faq.question, answer: faq.answer, keywords: faq.keywords }); setIsModalOpen(true); }}
                      className="p-2 text-on-surface-muted hover:text-tertiary hover:bg-tertiary/10 rounded-lg transition-all"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button
                      onClick={() => deleteFaq(faq.id)}
                      className="p-2 text-on-surface-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === "documents" ? (
        <div className="space-y-6">
          {/* Upload Section */}
          <div className="bg-surface rounded-card p-6 border border-dashed border-tertiary/30 bg-tertiary/5 text-center space-y-4">
            <div className="w-12 h-12 bg-tertiary/10 rounded-full flex items-center justify-center mx-auto">
              <Upload size={24} className="text-tertiary" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-tertiary">Upload Knowledge Documents</h3>
              <p className="font-body text-sm text-on-surface-muted">
                Supports PDF, DOCX, PPTX, XLSX, CSV, and Images. AI will extract and index the content.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 px-6 py-3 bg-tertiary text-white rounded-xl font-label font-semibold shadow-card hover:bg-tertiary/90 transition-all cursor-pointer disabled:opacity-50">
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              {uploading ? "Uploading & Indexing..." : "Choose File"}
              <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
            {uploadError && (
              <p className="text-red-500 text-sm flex items-center justify-center gap-1">
                <AlertCircle size={14} /> {uploadError}
              </p>
            )}
          </div>

          {/* Document List */}
          <div className="bg-surface rounded-card border border-surface-mid overflow-hidden">
            <table className="w-full text-left font-body text-sm">
              <thead className="bg-surface-low border-b border-surface-mid">
                <tr>
                  <th className="px-6 py-4 font-label font-semibold text-xs text-on-surface-muted uppercase">Document</th>
                  <th className="px-6 py-4 font-label font-semibold text-xs text-on-surface-muted uppercase">Type</th>
                  <th className="px-6 py-4 font-label font-semibold text-xs text-on-surface-muted uppercase">Status</th>
                  <th className="px-6 py-4 font-label font-semibold text-xs text-on-surface-muted uppercase">Created</th>
                  <th className="px-6 py-4 font-label font-semibold text-xs text-on-surface-muted uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-mid">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-on-surface-muted">
                      <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                      Loading documents...
                    </td>
                  </tr>
                ) : filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-on-surface-muted">
                      No documents uploaded yet.
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map(doc => (
                    <tr key={doc.id} className="hover:bg-surface-low transition-all group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-tertiary/5 rounded-lg">
                            <FileText size={18} className="text-tertiary" />
                          </div>
                          <div>
                            <p className="font-semibold text-on-surface">{doc.name}</p>
                            <p className="text-xs text-on-surface-muted">{(doc.size_bytes / 1024).toFixed(1)} KB</p>
                            {doc.status === "failed" && (
                              <p className="text-xs text-red-500 mt-0.5 max-w-xs" title={doc.error_message || undefined}>
                                {doc.error_message ? doc.error_message.slice(0, 80) + (doc.error_message.length > 80 ? "…" : "") : "Indexing failed — delete and re-upload"}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-on-surface-muted">
                        {doc.file_type.split("/")[1]?.toUpperCase() || "FILE"}
                      </td>
                      <td className="px-6 py-4">
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-label font-bold uppercase",
                          doc.status === "indexed" ? "bg-green-100 text-green-700" :
                          doc.status === "processing" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        )}>
                          {doc.status === "indexed" ? <CheckCircle2 size={12} /> :
                           doc.status === "processing" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                          {doc.status}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-on-surface-muted text-xs">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => deleteDocument(doc.id)}
                          className="p-2 text-on-surface-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-800">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              <strong>How RAG works:</strong> When a user asks a question, the system searches these documents for the most relevant information.
              The AI then uses those specific snippets to form an accurate, non-hallucinated answer.
            </p>
          </div>
        </div>
      ) : (
        /* Scoring Tab */
        tab === "scoring" ? (
          <div className="space-y-6 animate-in fade-in duration-200">
            {scoringMsg && (
              <div className="p-3 rounded-xl bg-tertiary-bg text-tertiary font-label text-sm">
                {scoringMsg}
              </div>
            )}

            {/* Rubric */}
            <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
              <div className="mb-4">
                <h2 className="font-display text-lg font-bold text-tertiary flex items-center gap-2">
                  <Target size={18} /> Custom Scoring Rubric
                </h2>
                <p className="font-body text-sm text-on-surface-muted mt-1">
                  Describe what each score range means for your business. Leave blank to use the default rubric.
                </p>
              </div>
              <div className="mb-3 p-3 rounded-xl bg-surface-low border border-surface-mid font-label text-xs text-on-surface-muted leading-5">
                <strong>Default rubric (used when blank):</strong><br />
                9–10: Asked for pricing/demo, ready to buy, completed booking<br />
                7–8: Detailed questions, comparing options, multiple follow-ups<br />
                5–6: General inquiry, first contact, acknowledgment without commitment<br />
                1–4: Not interested, irrelevant, dismissive
              </div>
              <textarea
                value={scoringRubric}
                onChange={(e) => setScoringRubric(e.target.value)}
                rows={8}
                spellCheck={false}
                placeholder={"- 9-10: Asked about course fees or demo class, confirmed slot\n- 7-8: Asking about syllabus, comparing with other institutes\n- 5-6: General enquiry, first contact\n- 1-4: Not interested, wrong number"}
                className="w-full px-4 py-3 rounded-xl bg-surface-low border border-surface-mid font-mono text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-tertiary resize-none"
              />
            </div>

            {/* Thresholds */}
            <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
              <div className="mb-5">
                <h2 className="font-display text-lg font-bold text-tertiary flex items-center gap-2">
                  <Target size={18} /> Segment Thresholds
                </h2>
                <p className="font-body text-sm text-on-surface-muted mt-1">
                  A lead moves to a segment when its score is ≥ the threshold. Default: A≥9, B≥7, C≥5, D&lt;5.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {(["A", "B", "C"] as const).map((seg) => {
                  const colors: Record<string, string> = { A: "text-red-600 bg-red-50 border-red-200", B: "text-amber-600 bg-amber-50 border-amber-200", C: "text-blue-600 bg-blue-50 border-blue-200" };
                  const labels: Record<string, string> = { A: "A — Hot", B: "B — Warm", C: "C — Cold" };
                  return (
                    <div key={seg} className={`rounded-2xl border p-4 ${colors[seg]}`}>
                      <label className="block font-label text-xs font-bold uppercase mb-2">{labels[seg]}</label>
                      <div className="flex items-center gap-2">
                        <span className="font-label text-sm font-semibold">Score ≥</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={scoringThresholds[seg]}
                          onChange={(e) => {
                            const v = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                            setScoringThresholds(prev => ({ ...prev, [seg]: v }));
                          }}
                          className="w-16 px-2 py-1 rounded-lg border bg-white font-mono text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-current"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Ordering validation */}
              {!(scoringThresholds.A > scoringThresholds.B && scoringThresholds.B > scoringThresholds.C) && (
                <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-label text-xs font-semibold">
                  <AlertCircle size={13} /> Thresholds must be in order: A &gt; B &gt; C. Current values will be rejected and defaults (9/7/5) will be used.
                </div>
              )}
              <p className="mt-2 font-label text-xs text-on-surface-muted">
                D (Disqualified) = score below C threshold ({scoringThresholds.C - 1} or less).
              </p>
            </div>

            <button
              onClick={saveScoringConfig}
              disabled={scoringSaving || !(scoringThresholds.A > scoringThresholds.B && scoringThresholds.B > scoringThresholds.C)}
              className="flex items-center gap-2 px-5 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40 transition-all shadow-card"
            >
              <Save size={15} /> {scoringSaving ? "Saving…" : "Save Scoring Config"}
            </button>
          </div>
        ) :

        /* AI Tune Tab */
        <div className="space-y-4 animate-in fade-in duration-200">
          {tuneMsg && (
            <div className="p-3 rounded-xl bg-tertiary-bg text-tertiary font-label text-sm">
              {tuneMsg}
            </div>
          )}

          {/* Channel Selector Pills */}
          <div className="flex flex-wrap gap-2 p-1.5 bg-surface-low rounded-2xl border border-surface-mid/60 w-fit">
            {[
              { id: "whatsapp_reply", label: "WhatsApp", icon: <MessageCircle size={14} className="shrink-0" />, colorClass: "hover:bg-surface-mid text-on-surface-muted hover:text-on-surface", activeClass: "bg-green-600 text-white shadow-sm" },
              { id: "telegram_reply", label: "Telegram", icon: <TgIcon size={14} className="shrink-0" />, colorClass: "hover:bg-surface-mid text-on-surface-muted hover:text-on-surface", activeClass: "bg-sky-600 text-white shadow-sm" },
              { id: "instagram_reply", label: "Instagram", icon: <IgIcon size={14} className="shrink-0" />, colorClass: "hover:bg-surface-mid text-on-surface-muted hover:text-on-surface", activeClass: "bg-pink-600 text-white shadow-sm" },
              { id: "facebook_reply", label: "Facebook Messenger", icon: <FbIcon size={14} className="shrink-0" />, colorClass: "hover:bg-surface-mid text-on-surface-muted hover:text-on-surface", activeClass: "bg-blue-600 text-white shadow-sm" },
            ].map((chan) => {
              const isActive = activeName === chan.id;
              return (
                <button
                  key={chan.id}
                  onClick={() => handleChannelSwitch(chan.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold font-label transition-all duration-200",
                    isActive ? chan.activeClass : chan.colorClass
                  )}
                >
                  {chan.icon}
                  <span>{chan.label}</span>
                </button>
              );
            })}
          </div>

          <div className="bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-tertiary">
                Active Prompt: {activeName === "whatsapp_reply" ? "WhatsApp" : activeName === "telegram_reply" ? "Telegram" : activeName === "instagram_reply" ? "Instagram" : "Facebook Messenger"}
              </h2>
              <p className="font-body text-sm text-on-surface-muted mt-0.5">
                {activeName === "whatsapp_reply" && "Edit the system prompt used by the WhatsApp AI auto-reply."}
                {activeName === "telegram_reply" && "Edit the system prompt used by the Telegram AI auto-reply."}
                {activeName === "instagram_reply" && "Edit the system prompt used by the Instagram AI auto-reply."}
                {activeName === "facebook_reply" && "Edit the system prompt used by the Facebook Messenger AI auto-reply."}
              </p>
            </div>
            {activePrompt && (
              <p className="font-label text-sm text-on-surface-muted mb-3">
                Updated {timeAgo(activePrompt.updated_at)} — {activePrompt.content.length} chars
              </p>
            )}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={18}
              spellCheck={false}
              className="w-full px-5 py-4 rounded-xl bg-surface-low border border-surface-mid font-mono text-base leading-7 focus:outline-none focus:ring-2 focus:ring-tertiary"
              style={{ fontSize: "15px", lineHeight: "1.7" }}
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={savePrompt}
                disabled={tuneSaving || draft === activePrompt?.content}
                className="flex items-center gap-2 px-4 py-2 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40"
              >
                <Save size={14} /> {tuneSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAQ Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-2xl rounded-card shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-surface-mid flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-tertiary">
                {editingFaq ? "Edit FAQ" : "Add New FAQ"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-surface-low rounded-lg transition-all">
                <XCircle size={20} className="text-on-surface-muted" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="font-label text-xs font-semibold text-on-surface-muted uppercase">Question</label>
                <input
                  type="text"
                  value={faqForm.question}
                  onChange={e => setFaqForm({ ...faqForm, question: e.target.value })}
                  placeholder="e.g. What are your college hours?"
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-low border border-surface-mid focus:outline-none focus:ring-2 focus:ring-tertiary font-body text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-label text-xs font-semibold text-on-surface-muted uppercase">Answer</label>
                <textarea
                  rows={4}
                  value={faqForm.answer}
                  onChange={e => setFaqForm({ ...faqForm, answer: e.target.value })}
                  placeholder="Provide the answer the AI should give..."
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-low border border-surface-mid focus:outline-none focus:ring-2 focus:ring-tertiary font-body text-sm resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-label text-xs font-semibold text-on-surface-muted uppercase">Keywords (Enter to add)</label>
                <div className="flex flex-wrap gap-2 p-2 bg-surface-low border border-surface-mid rounded-xl min-h-[44px]">
                  {faqForm.keywords.map(kw => (
                    <span key={kw} className="flex items-center gap-1 px-2 py-0.5 bg-tertiary text-white rounded-lg text-xs font-label font-semibold">
                      {kw}
                      <button onClick={() => setFaqForm({ ...faqForm, keywords: faqForm.keywords.filter(k => k !== kw) })}>
                        <XCircle size={12} />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={e => setKeywordInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && keywordInput.trim()) {
                        e.preventDefault();
                        if (!faqForm.keywords.includes(keywordInput.trim())) {
                          setFaqForm({ ...faqForm, keywords: [...faqForm.keywords, keywordInput.trim()] });
                        }
                        setKeywordInput("");
                      }
                    }}
                    placeholder="type keyword, press Enter..."
                    className="flex-1 bg-transparent border-none focus:outline-none text-sm px-2 min-w-[120px]"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 bg-surface-low border-t border-surface-mid flex items-center justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2.5 rounded-xl font-label font-semibold text-on-surface-muted hover:bg-surface-mid transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (keywordInput.trim() && !faqForm.keywords.includes(keywordInput.trim())) {
                    setFaqForm(f => ({ ...f, keywords: [...f.keywords, keywordInput.trim()] }));
                    setKeywordInput("");
                  }
                  saveFaq();
                }}
                disabled={saving || !faqForm.question.trim() || !faqForm.answer.trim()}
                className="px-8 py-2.5 bg-tertiary text-white rounded-xl font-label font-semibold shadow-card hover:bg-tertiary/90 transition-all disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save FAQ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
