"use client";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Trash2, CheckCircle2, XCircle,
  Upload, FileText, Loader2, Info, AlertCircle,
  Database, Sparkles, Save, MessageCircle
} from "lucide-react";
import { api, AIPrompt } from "@/lib/api";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { usePolling } from "@/hooks/usePolling";
import { useAuthRole } from "../contexts/AuthRoleContext";

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
  const { role, loading: roleLoading } = useAuthRole();
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"documents" | "ai-tune">("documents");

  // Document Upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // AI Tune
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [activeName, setActiveName] = useState<string>("whatsapp_reply");
  const [draft, setDraft] = useState<string>("");
  const [tuneMsg, setTuneMsg] = useState<string | null>(null);
  const [tuneSaving, setTuneSaving] = useState(false);

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
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cur = prompts.find((x) => x.name === activeName);
    if (cur) setDraft(cur.content);
  }, [activeName, prompts]);

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "owner") {
    return (
      <div className="text-center py-20">
        <p className="text-on-surface-muted font-body">
          This section is only available for owners/admins.
        </p>
      </div>
    );
  }

  async function loadData() {
    setLoading(true);
    try {
      const docData = await api.knowledge.listDocuments();
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

  const filteredDocs = documents.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-tertiary">Knowledge Base</h1>
          <p className="font-body text-on-surface-muted mt-1">
            Upload documents and tune AI prompts to answer lead queries accurately.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-surface-mid">
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
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface border border-surface-mid focus:outline-none focus:ring-2 focus:ring-tertiary font-body text-sm"
          />
        </div>
      )}

      {tab === "documents" ? (
        <div className="space-y-6">
          {/* Upload Section */}
          <div className="bg-surface rounded-card p-6 border border-dashed border-tertiary/30 bg-tertiary/5 text-center space-y-4">
            <div className="w-12 h-12 bg-tertiary/10 rounded-full flex items-center justify-center mx-auto">
              <Upload size={24} className="text-tertiary" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-tertiary">Upload Knowledge Documents</h3>
              <p className="font-body text-sm text-on-surface-muted">
                Supports PDF, DOCX, PPTX, XLSX, CSV, TXT, and Images. AI will extract and index the content.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 px-6 py-3 bg-tertiary text-white rounded-xl font-label font-semibold shadow-card hover:bg-tertiary/90 transition-all cursor-pointer disabled:opacity-50">
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              {uploading ? "Uploading & Indexing..." : "Choose File"}
              <input type="file" className="hidden" accept=".pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt,image/*" onChange={handleFileUpload} disabled={uploading} />
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
    </div>
  );
}
