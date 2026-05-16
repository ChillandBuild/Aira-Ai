"use client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import {
  Search, Plus, Trash2, Edit3, CheckCircle2, XCircle,
  Upload, FileText, Loader2, Info, AlertCircle,
  Database, HelpCircle, Sparkles, Save, Play
} from "lucide-react";
import { api, FAQ, FAQInput, AIPrompt } from "@/lib/api";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";

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
  const [tab, setTab] = useState<"faqs" | "documents" | "ai-tune">("faqs");

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
  const [analyzing, setAnalyzing] = useState(false);
  const [tuneMsg, setTuneMsg] = useState<string | null>(null);
  const [tuneSaving, setTuneSaving] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadDocuments, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (tab === "ai-tune" && prompts.length === 0) loadPrompts();
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

  async function runAnalysis() {
    setAnalyzing(true);
    setTuneMsg(null);
    try {
      const res = await api.aiTune.analyze(activeName);
      setTuneMsg(
        `Analysed ${res.analyzed_leads} conversation${res.analyzed_leads === 1 ? "" : "s"} — ${res.suggestions_created} suggestion${res.suggestions_created === 1 ? "" : "s"} created.`,
      );
    } catch (err) {
      setTuneMsg(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const activePrompt = prompts.find((p) => p.name === activeName);

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
      </div>

      {tab !== "ai-tune" && (
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
        /* AI Tune Tab */
        <div className="space-y-4">
          {tuneMsg && (
            <div className="p-3 rounded-xl bg-tertiary-bg text-tertiary font-label text-sm">
              {tuneMsg}
            </div>
          )}
          <div className="bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-tertiary">Active Prompt</h2>
                <p className="font-body text-sm text-on-surface-muted mt-0.5">
                  Edit the system prompt used by the WhatsApp AI auto-reply.
                </p>
              </div>
              <select
                value={activeName}
                onChange={(e) => setActiveName(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-surface-low border border-surface-mid font-label text-sm"
              >
                {prompts.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
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
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg font-label text-sm font-semibold hover:bg-secondary/90 disabled:opacity-40"
              >
                <Play size={14} /> {analyzing ? "Analysing…" : "Run Analysis"}
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
