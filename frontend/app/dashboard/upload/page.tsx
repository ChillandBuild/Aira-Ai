"use client";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Upload, Check, AlertTriangle, ChevronRight, ChevronDown, RotateCcw, MessageSquare, Clock, Send, Download, CheckCircle2, Eye, XCircle, Calendar, Phone, Search, Smartphone, ShieldCheck, FileSpreadsheet, PlayCircle, MapPin, Copy, Globe, Image as ImageIcon, FileText, Tag, Plus, Trash2, Palette } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedData = {
  columns: string[];
  suggested_mapping: { name: string | null; phone: string | null; email: string | null; course: string | null };
  total_rows: number;
  duplicate_count: number;
  preview: Record<string, string>[];
  csv_file_url: string | null;
  csv_file_name: string | null;
};

type OptInValidation = {
  allowed: boolean;
  template_type: string;
  message: string;
};

type SendResult = {
  queued: number;
  failed: number;
  number_used: string;
};

type BroadcastHistoryItem = {
  timestamp: string;
  broadcast_id?: string;
  template_name: string;
  opt_in_source: string;
  sent: number;
  delivered: number;
  opened: number;
  failed: number;
  total_leads: number;
  number_used: string;
  csv_file_url?: string;
  csv_file_name?: string;
  tag_id?: string;
  hot?: number;
  warm?: number;
  cold?: number;
  replied_positive?: number;
  replied_negative?: number;
  replied_neutral?: number;
};

type BroadcastTag = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

type TagStats = {
  tag_id: string;
  total_sent: number;
  hot: number;
  warm: number;
  cold: number;
};

const PRESET_COLORS = [
  "#6D28D9", "#7C3AED", "#2563EB", "#0891B2", "#059669",
  "#D97706", "#DC2626", "#DB2777", "#4F46E5", "#0D9488",
];

function hexToLightTint(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.07)`;
}

type ScheduleType = "now" | "scheduled" | "drip";

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
  category: string;
  body_text: string;
  header_text?: string | null;
  header_media_type?: string | null;
  header_media_url?: string | null;
  header_media_id?: string | null;
  footer_text?: string | null;
  buttons?: Button[] | null;
  status: string;
};

const OPT_IN_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "click_to_wa_ad", label: "Click-to-WhatsApp Ad", description: "Lead clicked a Meta ad that opened WhatsApp directly." },
  { value: "website_form", label: "Website Form (with WA consent)", description: "Lead submitted a form that explicitly asked for WhatsApp contact." },
  { value: "offline_event", label: "Offline Event (signed consent)", description: "Lead signed a physical or digital consent at an event." },
  { value: "previous_enquiry", label: "Previous Enquiry", description: "Lead previously contacted us through any channel." },
  { value: "imported", label: "Imported from another tool", description: "Data migrated from a CRM or spreadsheet with consent on record." },
  { value: "manual", label: "No explicit consent (call only)", description: "No WhatsApp consent — this batch will be call-only outreach." },
];

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEPS = ["Upload", "Opt-in", "Preview", "Template", "Confirm", "Done"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-start w-full mb-10">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={label} className="flex-1 flex flex-col items-center relative">
            {i > 0 && (
              <div className={`absolute top-5 right-1/2 w-full h-0.5 -translate-y-1/2 transition-colors ${done ? "bg-tertiary" : "bg-surface-mid"}`} />
            )}
            <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all
              ${done ? "bg-tertiary text-white" : active ? "bg-tertiary text-white ring-4 ring-tertiary/20 shadow-md" : "bg-surface text-on-surface-muted border-2 border-surface-mid"}`}>
              {done ? <Check size={16} /> : step}
            </div>
            <span className={`mt-2 font-label text-xs text-center whitespace-nowrap ${active ? "text-tertiary font-semibold" : done ? "text-tertiary/50" : "text-on-surface-muted"}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Segment Dropdown ─────────────────────────────────────────────────────────

const SEGMENT_OPTIONS = [
  { label: "Hot", value: "A", color: "text-green-700 bg-green-50 border-green-200 hover:bg-green-100" },
  { label: "Warm", value: "B", color: "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100" },
  { label: "Cold", value: "C", color: "text-gray-700 bg-gray-50 border-gray-200 hover:bg-gray-100" },
  { label: "Disqualified", value: "D", color: "text-red-700 bg-red-50 border-red-200 hover:bg-red-100" },
];

function SegmentDropdown({ tagId }: { tagId: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function download(segment: string) {
    window.open(`${API_URL}/api/v1/uploads/tag-csv?tag_id=${tagId}&segment=${segment}`, "_blank");
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="text-xs px-2.5 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors flex items-center gap-1 font-medium"
      >
        <Download size={12} /> Segment Leads
        <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && createPortal(
        <div
          className="fixed w-40 bg-white rounded-xl shadow-xl border border-surface-mid z-[9999] overflow-hidden"
          style={{ top: position.top, right: position.right }}
        >
          {SEGMENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => download(opt.value)}
              className={cn("w-full text-left text-xs px-3 py-2.5 font-label font-semibold transition-colors border-b border-surface-mid/30 last:border-0", opt.color)}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Export All Dropdown ──────────────────────────────────────────────────────

function ExportAllDropdown({ tagCount }: { tagCount: number }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function download(mode: string) {
    window.open(`${API_URL}/api/v1/uploads/all-tags-combined?mode=${mode}`, "_blank");
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-surface-mid text-on-surface-muted hover:text-on-surface hover:border-violet-300 font-label text-sm font-semibold transition-colors"
      >
        <Download size={14} /> Export All
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && createPortal(
        <div
          className="fixed w-56 bg-white rounded-xl shadow-xl border border-surface-mid z-[9999] overflow-hidden"
          style={{ top: position.top, right: position.right }}
        >
          <button
            onClick={() => download("all")}
            className="w-full text-left text-xs px-4 py-3 font-label transition-colors border-b border-surface-mid/30 hover:bg-violet-50"
          >
            <p className="font-semibold text-on-surface">All Tags</p>
            <p className="text-on-surface-muted mt-0.5">Combine all {tagCount} tags — no dedup</p>
          </button>
          <button
            onClick={() => download("cross")}
            className="w-full text-left text-xs px-4 py-3 font-label transition-colors hover:bg-violet-50"
          >
            <p className="font-semibold text-on-surface">Cross-Tag</p>
            <p className="text-on-surface-muted mt-0.5">Best segment per lead across all tags</p>
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [currentStep, setCurrentStep] = useState(1);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [optInSource, setOptInSource] = useState("");
  const [optInValidation, setOptInValidation] = useState<OptInValidation | null>(null);
  const [optInLoading, setOptInLoading] = useState(false);

  const searchParams = useSearchParams();
  const [templateName, setTemplateName] = useState(searchParams.get("template") ?? "");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [dripDays, setDripDays] = useState("");
  const [dripSendTime, setDripSendTime] = useState("");
  const [variableMapping, setVariableMapping] = useState<string[]>([]); // column name per {{N}}

  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState(false);

  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState("");

  const [primaryNumber, setPrimaryNumber] = useState<{ number: string; display_name: string } | null>(null);
  const [primaryNumberLoading, setPrimaryNumberLoading] = useState(false);

  const [riskSummary, setRiskSummary] = useState<{
    total: number;
    negative_reply_count: number;
    high_no_reply_count: number;
    opted_out_count: number;
    safe_count: number;
  } | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [excludeNegativeReplies, setExcludeNegativeReplies] = useState(false);
  const [unflagging, setUnflagging] = useState(false);

  // Tags management state
  const [tagsList, setTagsList] = useState<BroadcastTag[]>([]);
  const [tagStats, setTagStats] = useState<Record<string, TagStats>>({});
  const [tagsListLoading, setTagsListLoading] = useState(false);
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
  const [customTagColor, setCustomTagColor] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);

  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"all" | "failures" | "clean">("all");
  const [activeTab, setActiveTab] = useState<"upload" | "history" | "tags">("upload");

  const filteredHistory = broadcastHistory.filter(item => {
    const s = historySearch.toLowerCase();
    const matchesSearch = !s ||
      item.template_name.toLowerCase().includes(s) ||
      (item.number_used || "").toLowerCase().includes(s);
    const matchesFilter = historyStatusFilter === "all" ||
      (historyStatusFilter === "failures" && item.failed > 0) ||
      (historyStatusFilter === "clean" && item.failed === 0);
    return matchesSearch && matchesFilter;
  });
  
  // Supabase client for realtime updates
  // Realtime subscription for message status updates
  useEffect(() => {
    if (activeTab === "tags" && tagsList.length === 0 && !tagsListLoading) {
      loadTags();
    }
    if (activeTab !== "history") return;

    const channel = supabase
      .channel("messages_status_updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: "delivery_status=in.(delivered,read,failed)",
        },
        () => {
          refreshHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTab, tagsList.length, tagsListLoading]);

  const [csvFileUrl, setCsvFileUrl] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);

  async function downloadFailedCsv(broadcastId: string) {
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/upload/failed-csv?broadcast_id=${broadcastId}`, { headers: auth });
      if (!res.ok) throw new Error("Download failed");
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/csv")) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.message || "No failure data available for this broadcast.");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `failed_${broadcastId.slice(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download CSV");
    }
  }

  async function downloadBroadcastTagCsv(broadcastId: string, tagId?: string) {
    try {
      const auth = await getAuthHeaders();
      const params = new URLSearchParams({ broadcast_id: broadcastId });
      if (tagId) params.set("tag_id", tagId);
      const res = await fetch(
        `${API_URL}/api/v1/upload/broadcast-tag-csv?${params.toString()}`,
        { headers: auth }
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `broadcast_${broadcastId.slice(0, 8)}_interests.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download interest CSV");
    }
  }

  async function downloadHistoryCsv() {
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/upload/history-csv`, { headers: auth });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `broadcast_history_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Broadcast history downloaded");
    } catch {
      toast.error("Failed to download broadcast history");
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch broadcast history once on mount
  useEffect(() => {
    setHistoryLoading(true);
    getAuthHeaders().then(auth => {
      fetch(`${API_URL}/api/v1/upload/history`, { headers: auth })
        .then(r => r.json())
        .then((res: { data: BroadcastHistoryItem[] }) => setBroadcastHistory(res.data || []))
        .catch(() => {})
        .finally(() => setHistoryLoading(false));
    });
  }, []);

  async function refreshHistory() {
    // First call the backend refresh endpoint
    try {
      const auth = await getAuthHeaders();
      await fetch(`${API_URL}/api/v1/upload/history/refresh`, { 
        method: "POST", 
        headers: auth 
      });
    } catch (e) {
      console.error("Failed to refresh metrics:", e);
    }
    
    // Then fetch the updated history
    getAuthHeaders().then(auth => {
      fetch(`${API_URL}/api/v1/upload/history`, { headers: auth })
        .then(r => r.json())
        .then((res: { data: BroadcastHistoryItem[] }) => setBroadcastHistory(res.data || []))
        .catch(() => {});
    });
  }

  useEffect(() => {
    if (currentStep === 4) {
      if (templates.length === 0 && !templatesLoading) {
        setTemplatesLoading(true);
        setTemplatesError(false);
        getAuthHeaders().then(auth => {
          fetch(`${API_URL}/api/v1/templates`, { headers: auth })
            .then(r => r.json())
            .then((res: { data: Template[] }) => {
              setTemplates((res.data || []).filter(t => t.status === "APPROVED"));
            })
            .catch(() => setTemplatesError(true))
            .finally(() => setTemplatesLoading(false));
        });
      }

      if (tags.length === 0 && !tagsLoading) {
        setTagsLoading(true);
        getAuthHeaders().then(auth => {
          fetch(`${API_URL}/api/v1/broadcast-tags`, { headers: auth })
            .then(r => r.json())
            .then((res: { data: { id: string; name: string; color: string }[] }) => {
              setTags(res.data || []);
            })
            .catch(() => {})
            .finally(() => setTagsLoading(false));
        });
      }

      if (!primaryNumber && !primaryNumberLoading) {
        setPrimaryNumberLoading(true);
        getAuthHeaders().then(auth => {
          fetch(`${API_URL}/api/v1/numbers`, { headers: auth })
            .then(r => r.json())
            .then((data: { data: { role: string; number: string; display_name: string }[] }) => {
              const primary = (data.data || []).find(n => n.role === "primary");
              setPrimaryNumber(primary || null);
            })
            .catch(() => {})
            .finally(() => setPrimaryNumberLoading(false));
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, templates.length, templatesLoading, tags.length, tagsLoading, primaryNumber, primaryNumberLoading]);

  function resetAll() {
    setCurrentStep(1);
    setCsvFile(null);
    setParsedData(null);
    setParseError(null);
    setCsvFileUrl(null);
    setCsvFileName(null);
    setOptInSource("");
    setOptInValidation(null);
    setTemplateName("");
    setScheduleType("now");
    setScheduleAt("");
    setDripDays("");
    setSendError(null);
    setSendResult(null);
    setTemplatesLoading(false);
    setTemplatesError(false);
    setPrimaryNumber(null);
    setRiskSummary(null);
    setRiskLoading(false);
    setExcludeNegativeReplies(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function loadTags() {
    setTagsListLoading(true);
    try {
      const auth = await getAuthHeaders();
      const [tagsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/broadcast-tags`, { headers: auth }),
        fetch(`${API_URL}/api/v1/broadcast-tags/stats`, { headers: auth }),
      ]);
      const tagsData = tagsRes.ok ? ((await tagsRes.json()).data ?? []) : [];
      const statsData = statsRes.ok ? ((await statsRes.json()).data ?? []) : [];
      setTagsList(tagsData);
      const sm: Record<string, TagStats> = {};
      for (const s of statsData) sm[s.tag_id] = s;
      setTagStats(sm);
    } catch { /* best-effort */ } finally {
      setTagsListLoading(false);
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/broadcast-tags`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim(), color: customTagColor || newTagColor }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      toast.success(`Tag "${newTagName}" created`);
      setNewTagName("");
      setShowCreateTag(false);
      await loadTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setCreatingTag(false);
    }
  }

  async function handleDeleteTag(tag: BroadcastTag) {
    if (!confirm(`Delete tag "${tag.name}"?`)) return;
    setDeletingTagId(tag.id);
    try {
      const auth = await getAuthHeaders();
      await fetch(`${API_URL}/api/v1/broadcast-tags/${tag.id}`, { method: "DELETE", headers: auth });
      toast.success(`Tag "${tag.name}" deleted`);
      await loadTags();
    } catch { toast.error("Failed to delete tag"); } finally {
      setDeletingTagId(null);
    }
  }

  async function handleUnflagAll() {
    if (!parsedData || !csvFile) return;
    setUnflagging(true);
    try {
      const text = await csvFile.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const mapping = parsedData.suggested_mapping;
      const phoneIdx = mapping.phone ? headers.indexOf(mapping.phone) : -1;
      const leads = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        return { phone: phoneIdx >= 0 ? cols[phoneIdx] ?? "" : "", opt_in_source: optInSource, extra_cols: {} };
      }).filter((l) => l.phone);
      const auth = await getAuthHeaders();
      await fetch(`${API_URL}/api/v1/upload/clear-negative-reply`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ leads }),
      });
      toast.success("Leads un-flagged — they'll be included in future broadcasts");
      await fetchRiskAudit();
    } catch { toast.error("Failed to un-flag leads"); } finally {
      setUnflagging(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setCsvFile(f);
    setParsedData(null);
    setParseError(null);
    setCsvFileUrl(null);
    setCsvFileName(null);
    if (!f) return;

    setParseLoading(true);
    try {
      const auth = await getAuthHeaders();
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`${API_URL}/api/v1/upload/parse`, { method: "POST", body: fd, headers: auth });
      if (!res.ok) throw new Error(await res.text());
      const data: ParsedData = await res.json();
      setParsedData(data);
      setCsvFileUrl(data.csv_file_url ?? null);
      setCsvFileName(data.csv_file_name ?? null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParseLoading(false);
    }
  }

  async function handleOptInSelect(value: string) {
    setOptInSource(value);
    setOptInValidation(null);
    setOptInLoading(true);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/upload/validate-optin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ opt_in_source: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: OptInValidation = await res.json();
      setOptInValidation(data);
    } catch {
      setOptInValidation(null);
    } finally {
      setOptInLoading(false);
    }
  }

  async function fetchRiskAudit() {
    if (!parsedData || !csvFile) return;
    setRiskLoading(true);
    setRiskSummary(null);
    try {
      const text = await csvFile.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const mapping = parsedData.suggested_mapping;
      const phoneIdx = mapping.phone ? headers.indexOf(mapping.phone) : -1;
      const nameIdx = mapping.name ? headers.indexOf(mapping.name) : -1;
      const leads = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const extra_cols: Record<string, string> = {};
        headers.forEach((h, i) => { extra_cols[h] = cols[i] ?? ""; });
        return {
          phone: phoneIdx >= 0 ? cols[phoneIdx] ?? "" : "",
          name: nameIdx >= 0 ? cols[nameIdx] ?? undefined : undefined,
          opt_in_source: optInSource,
          extra_cols,
        };
      }).filter((l) => l.phone);

      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/upload/risk-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ leads }),
      });
      if (res.ok) setRiskSummary(await res.json());
    } catch {
      // risk audit is best-effort; don't block the flow
    } finally {
      setRiskLoading(false);
    }
  }

  async function handleSend() {
    if (!parsedData || !csvFile) return;
    setSendLoading(true);
    setSendError(null);

    try {
      const text = await csvFile.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const mapping = parsedData.suggested_mapping;

      const phoneIdx = mapping.phone ? headers.indexOf(mapping.phone) : -1;
      const nameIdx = mapping.name ? headers.indexOf(mapping.name) : -1;

      const leads = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const extra_cols: Record<string, string> = {};
        headers.forEach((h, i) => { extra_cols[h] = cols[i] ?? ""; });
        return {
          phone: phoneIdx >= 0 ? cols[phoneIdx] ?? "" : "",
          name: nameIdx >= 0 ? cols[nameIdx] ?? undefined : undefined,
          opt_in_source: optInSource,
          extra_cols,
        };
      }).filter((l) => l.phone);

      const payload = {
        leads,
        template_name: templateName,
        schedule_type: scheduleType,
        schedule_at: scheduleType === "scheduled" && scheduleAt ? scheduleAt : undefined,
        drip_days: scheduleType === "drip" && dripDays ? parseInt(dripDays, 10) : undefined,
        drip_send_time: scheduleType === "drip" && dripSendTime ? dripSendTime : undefined,
        csv_file_url: csvFileUrl,
        csv_file_name: csvFileName,
        variable_mapping: variableMapping.filter(Boolean),
        tag_id: selectedTag || undefined,
        exclude_negative_replies: excludeNegativeReplies,
      };

      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/upload/bulk-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const result: SendResult = await res.json();
      setSendResult(result);
      setCurrentStep(6);
      setActiveTab("history");
      refreshHistory();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSendLoading(false);
    }
  }

  function downloadSampleCSV() {
    const csvContent = "data:text/csv;charset=utf-8,phone,name,course,city\n919876543210,John Doe,Full Stack Development,Chennai\n919988776655,Jane Smith,Data Science,Bangalore\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "aira_sample_contacts.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const formatPreviewText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\{\{\d+\}\})/g);
    return parts.map((part, i) => {
      const match = part.match(/\{\{(\d+)\}\}/);
      if (match) {
        const num = parseInt(match[1], 10);
        const mappedVal = variableMapping[num - 1];
        return (
          <span key={i} className="inline-block px-1.5 py-0.5 rounded bg-tertiary/10 text-tertiary font-bold text-[10px] mx-0.5 border border-tertiary/20">
            {mappedVal ? `[${mappedVal}]` : `{{${num}}}`}
          </span>
        );
      }
      return part;
    });
  };

  const inputCls = "w-full px-4 py-3 bg-surface-low rounded-xl font-body text-sm text-on-surface border-0 focus:ring-2 focus:ring-tertiary outline-none";

  return (
    <div className="max-w-7xl">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-bold text-on-surface">Bulk Contact Upload</h1>
        <p className="font-body text-base text-on-surface-muted mt-2">Import a CSV and broadcast a WhatsApp campaign to all eligible leads.</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-surface-mid mb-6">
        {(["upload", "history", "tags"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-6 py-3 font-label font-semibold text-sm transition-all border-b-2",
              activeTab === tab ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"
            )}
          >
            {tab === "upload" ? "Broadcast Message" : tab === "history" ? "Broadcast History" : "Tags"}
          </button>
        ))}
      </div>

      {/* Upload Wizard */}
      {activeTab === "upload" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start animate-slide-up">
          {/* Left Column: Wizard Steps */}
          <div className="lg:col-span-2 bg-surface rounded-[2rem] p-8 shadow-lg ring-1 ring-[#c4c7c7]/20 flex flex-col justify-between min-h-[600px]">
            <div>
              <StepIndicator current={currentStep} />

              {/* ── Step 1: Upload CSV ─────────────────────────────────────────── */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-on-surface mb-1">Upload your CSV</h2>
                    <p className="font-body text-sm text-on-surface-muted">We&apos;ll detect column mappings automatically.</p>
                  </div>

                  <label className={`relative flex flex-col items-center justify-center gap-5 py-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all group
                    ${csvFile ? "border-tertiary bg-tertiary/5" : "border-tertiary/30 hover:border-tertiary/70 hover:bg-tertiary/[0.04]"}`}>
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-sm
                      ${csvFile ? "bg-tertiary text-white" : "bg-tertiary/10 text-tertiary group-hover:bg-tertiary/20"}`}>
                      {csvFile ? <Check size={28} /> : <Upload size={28} />}
                    </div>
                    <div className="text-center px-4">
                      <p className="font-display text-lg font-bold text-on-surface truncate max-w-md mx-auto">
                        {csvFile ? csvFile.name : "Drop your CSV file here"}
                      </p>
                      <p className="font-body text-xs text-on-surface-muted mt-1.5">
                        {csvFile
                          ? `${(csvFile.size / 1024).toFixed(1)} KB · click to change file`
                          : "or click to browse — .csv files only · name and phone columns required"}
                      </p>
                    </div>
                    {!csvFile && (
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] text-on-surface-muted font-label border-t border-dashed border-tertiary/20 w-full justify-center pt-4 mt-1">
                        <span>✓ Auto-detects columns</span>
                        <span>✓ Deduplicates leads</span>
                        <span>✓ Indian numbers formatted</span>
                      </div>
                    )}
                    <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
                  </label>

                  {parseLoading && (
                    <div className="flex items-center gap-2 py-2">
                      <div className="w-4 h-4 border-2 border-tertiary border-t-transparent rounded-full animate-spin" />
                      <p className="font-body text-sm text-on-surface-muted">Parsing file…</p>
                    </div>
                  )}
                  {parseError && (
                    <div className="flex items-start gap-2 p-3.5 bg-red-50 text-red-700 rounded-xl font-body text-sm">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      {parseError}
                    </div>
                  )}

                  {parsedData && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-4 bg-tertiary/5 border border-tertiary/15 rounded-xl text-center">
                        <p className="font-display text-2xl font-bold text-tertiary">{parsedData.total_rows.toLocaleString()}</p>
                        <p className="font-label text-xs text-on-surface-muted mt-1">Total Rows</p>
                      </div>
                      <div className={`p-4 rounded-xl text-center border ${parsedData.duplicate_count > 0 ? "bg-amber-50 border-amber-200" : "bg-surface-low border-surface-mid"}`}>
                        <p className={`font-display text-2xl font-bold ${parsedData.duplicate_count > 0 ? "text-amber-700" : "text-on-surface-muted"}`}>{parsedData.duplicate_count}</p>
                        <p className="font-label text-xs text-on-surface-muted mt-1">Duplicates</p>
                      </div>
                      <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-center">
                        <p className="font-display text-2xl font-bold text-green-700">{(parsedData.total_rows - parsedData.duplicate_count).toLocaleString()}</p>
                        <p className="font-label text-xs text-on-surface-muted mt-1">New Leads</p>
                      </div>
                      <div className="col-span-3 p-3 bg-surface-low rounded-xl">
                        <p className="font-label text-xs text-on-surface-muted mb-1.5">Columns detected</p>
                        <div className="flex flex-wrap gap-1.5">
                          {parsedData.columns.map(col => (
                            <span key={col} className={`px-2.5 py-0.5 rounded-md text-[10px] font-semibold tracking-wide
                              ${Object.values(parsedData.suggested_mapping).includes(col) ? "bg-tertiary/10 text-tertiary border border-tertiary/10" : "bg-surface-mid text-on-surface-muted"}`}>
                              {col}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-4 border-t border-surface-mid/30">
                    <button
                      onClick={() => setCurrentStep(2)}
                      disabled={!parsedData}
                      className="flex items-center gap-2 px-5 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 2: Opt-in Source ──────────────────────────────────────── */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-on-surface mb-1">Opt-in Source</h2>
                    <p className="font-body text-sm text-on-surface-muted">How did these leads consent to be contacted?</p>
                  </div>

                  <div className="space-y-2">
                    {OPT_IN_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors
                          ${optInSource === opt.value ? "border-tertiary bg-tertiary/5" : "border-surface-mid bg-surface-low hover:border-tertiary/40"}`}
                      >
                        <input
                          type="radio"
                          name="opt_in_source"
                          value={opt.value}
                          checked={optInSource === opt.value}
                          onChange={() => handleOptInSelect(opt.value)}
                          className="mt-0.5 accent-[var(--color-tertiary)]"
                        />
                        <div>
                          <p className="font-label text-sm font-semibold text-on-surface">{opt.label}</p>
                          <p className="font-body text-xs text-on-surface-muted mt-0.5">{opt.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {optInLoading && (
                    <div className="flex items-center gap-2 py-2">
                      <div className="w-4 h-4 border-2 border-tertiary border-t-transparent rounded-full animate-spin" />
                      <p className="font-body text-sm text-on-surface-muted">Validating consent rule…</p>
                    </div>
                  )}

                  {optInValidation && (
                    <div className={`flex items-start gap-2.5 p-3.5 rounded-xl font-body text-sm border
                      ${optInValidation.allowed ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"}`}>
                      {optInValidation.allowed ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                      <span>
                        <strong className="capitalize">{optInValidation.template_type}</strong> — {optInValidation.message}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-surface-mid/30">
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="px-4 py-2.5 rounded-xl font-label text-sm text-on-surface-muted hover:bg-surface-low transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setCurrentStep(3)}
                      disabled={!optInValidation?.allowed}
                      className="flex items-center gap-2 px-5 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 3: Preview ───────────────────────────────────────────── */}
              {currentStep === 3 && parsedData && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-on-surface mb-1">Preview Data</h2>
                    <p className="font-body text-sm text-on-surface-muted">
                      Showing first {parsedData.preview.length} of {parsedData.total_rows.toLocaleString()} rows.
                    </p>
                  </div>

                  <div className="overflow-x-auto rounded-xl ring-1 ring-[#c4c7c7]/20 bg-white max-h-[350px]">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 z-20">
                        <tr className="bg-surface-low border-b border-surface-mid">
                          {parsedData.columns.map((col) => (
                            <th key={col} className="px-3.5 py-3 font-label font-bold text-on-surface-muted whitespace-nowrap bg-surface-low">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.preview.map((row, ri) => (
                          <tr key={ri} className="border-b border-surface-mid/50 hover:bg-surface-low transition-colors">
                            {parsedData.columns.map((col) => (
                              <td key={col} className="px-3.5 py-3 font-body text-on-surface whitespace-nowrap">
                                {row[col] ?? "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-surface-mid/30">
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="px-4 py-2.5 rounded-xl font-label text-sm text-on-surface-muted hover:bg-surface-low transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setCurrentStep(4)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 transition-colors shadow-sm"
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 4: Template & Schedule ───────────────────────────────── */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-on-surface mb-1">Template & Schedule</h2>
                    <p className="font-body text-sm text-on-surface-muted">Choose which template to send and when.</p>
                  </div>

                  <div className="bg-surface-low border border-surface-mid rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-label text-[10px] text-on-surface-muted uppercase tracking-wider mb-1 font-bold">Sender Number</p>
                      {primaryNumberLoading ? (
                        <p className="font-body text-xs text-on-surface-muted">Loading primary number...</p>
                      ) : primaryNumber ? (
                        <p className="font-body text-sm font-semibold text-on-surface">{primaryNumber.display_name} ({primaryNumber.number})</p>
                      ) : (
                        <p className="font-body text-xs text-red-600 font-semibold">No primary number found! Broadcast may fail.</p>
                      )}
                    </div>
                    <Link href="/dashboard/numbers" className="px-3 py-1.5 bg-white border border-surface-mid rounded-lg font-label text-xs font-semibold text-on-surface hover:bg-surface-low transition-colors shadow-sm">
                      Change
                    </Link>
                  </div>

                  <div>
                    <label htmlFor="template-select" className="block font-label text-xs font-bold text-on-surface-muted uppercase tracking-wider mb-2">
                      Template Name
                    </label>
                    <select
                      id="template-select"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Select a template…</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.name}>
                          {t.name} ({t.category.toLowerCase()})
                        </option>
                      ))}
                    </select>
                    {templatesLoading && (
                      <p className="font-label text-xs text-on-surface-muted mt-2">Loading templates…</p>
                    )}
                    {!templatesLoading && templatesError && (
                      <p className="font-label text-xs text-red-600 mt-2 font-semibold">
                        Failed to load templates. <button onClick={() => { setTemplatesError(false); setTemplatesLoading(false); }} className="underline">Retry</button>
                      </p>
                    )}
                    {!templatesLoading && !templatesError && templates.length === 0 && (
                      <p className="font-label text-xs text-amber-600 mt-2 font-semibold">
                        No approved templates yet. <Link href="/dashboard/templates" className="underline">Create one →</Link>
                      </p>
                    )}
                  </div>

                  {/* ── Broadcast Tag ─────────────────────────────────────── */}
                  <div>
                    <label htmlFor="tag-select" className="block font-label text-xs font-bold text-on-surface-muted uppercase tracking-wider mb-2">
                      Broadcast Tag <span className="normal-case font-normal text-on-surface-muted">(optional)</span>
                    </label>
                    <select
                      id="tag-select"
                      value={selectedTag}
                      onChange={(e) => setSelectedTag(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">No tag — skip interest tracking</option>
                      {tags.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {tagsLoading && (
                      <p className="font-label text-xs text-on-surface-muted mt-2">Loading tags…</p>
                    )}
                    {!tagsLoading && tags.length === 0 && (
                      <p className="font-label text-xs text-on-surface-muted mt-2">
                        No tags yet. <Link href="/dashboard/broadcast-tags" className="underline text-violet-600">Create one →</Link>
                      </p>
                    )}
                  </div>

                  {/* ── Template Variable Mapping ─────────────────────────── */}
                  {templateName && parsedData && parsedData.columns.length > 0 && (
                    <div className="bg-surface-low border border-surface-mid rounded-xl p-4 space-y-4">
                      <div>
                        <p className="font-label text-xs font-bold text-on-surface uppercase tracking-wider">
                          Template Variables <span className="normal-case font-normal text-on-surface-muted font-body text-xs">(optional)</span>
                        </p>
                        <p className="font-body text-xs text-on-surface-muted mt-0.5">
                          If your template uses <code className="bg-surface-mid px-1.5 py-0.5 rounded font-mono text-[10px]">{"{{1}}"}</code>, <code className="bg-surface-mid px-1.5 py-0.5 rounded font-mono text-[10px]">{"{{2}}"}</code> placeholders, map them to your CSV columns.
                        </p>
                      </div>
                      <div className="space-y-2">
                        {variableMapping.map((col, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-surface-mid/60">
                            <span className="font-mono text-xs text-on-surface-muted w-10 shrink-0 font-bold">{`{{${idx + 1}}}`}</span>
                            <select
                              value={col}
                              onChange={(e) => {
                                const next = [...variableMapping];
                                next[idx] = e.target.value;
                                setVariableMapping(next);
                              }}
                              className="flex-1 bg-surface-low rounded-lg px-2.5 py-1.5 font-body text-xs text-on-surface border-0 focus:outline-none focus:ring-1 focus:ring-tertiary"
                            >
                              <option value="">— pick a column —</option>
                              {parsedData.columns.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setVariableMapping(variableMapping.filter((_, i) => i !== idx))}
                              className="text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded hover:bg-red-50 transition-colors font-semibold"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setVariableMapping([...variableMapping, ""])}
                          className="text-xs font-bold text-tertiary hover:underline flex items-center gap-1 mt-1 pl-1"
                        >
                          + Add variable mapping
                        </button>
                      </div>
                    </div>
                  )}
                  {/* ──────────────────────────────────────────────────────── */}

                  <div>
                    <label className="block font-label text-xs font-bold text-on-surface-muted uppercase tracking-wider mb-2">
                      Schedule Type
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {(["now", "scheduled", "drip"] as ScheduleType[]).map((type) => (
                        <label
                          key={type}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors
                            ${scheduleType === type ? "border-tertiary bg-tertiary/5" : "border-surface-mid bg-surface-low hover:border-tertiary/40"}`}
                        >
                          <input
                            type="radio"
                            name="schedule_type"
                            value={type}
                            checked={scheduleType === type}
                            onChange={() => setScheduleType(type)}
                            className="accent-[var(--color-tertiary)]"
                          />
                          <span className="font-label text-xs font-bold text-on-surface">
                            {type === "now" ? "Send Now" : type === "scheduled" ? "Later" : "Drip Days"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {scheduleType === "scheduled" && (
                    <div>
                      <label className="block font-label text-xs font-bold text-on-surface-muted uppercase tracking-wider mb-2">
                        Send At
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  )}

                  {scheduleType === "drip" && (
                    <div className="space-y-4">
                      <div>
                        <label className="block font-label text-xs font-bold text-on-surface-muted uppercase tracking-wider mb-2">
                          Spread over how many days?
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={dripDays}
                          onChange={(e) => setDripDays(e.target.value)}
                          placeholder="e.g. 7"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="block font-label text-xs font-bold text-on-surface-muted uppercase tracking-wider mb-2">
                          Send time each day (IST) <span className="text-on-surface-muted/60 normal-case font-normal">— optional, leave blank to send at upload time</span>
                        </label>
                        <input
                          type="time"
                          value={dripSendTime}
                          onChange={(e) => setDripSendTime(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-surface-mid/30">
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="px-4 py-2.5 rounded-xl font-label text-sm text-on-surface-muted hover:bg-surface-low transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={async () => { setCurrentStep(5); await fetchRiskAudit(); }}
                      disabled={!templateName.trim()}
                      className="flex items-center gap-2 px-5 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 5: Confirm & Send ────────────────────────────────────── */}
              {currentStep === 5 && parsedData && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-on-surface mb-1">Confirm & Send</h2>
                    <p className="font-body text-sm text-on-surface-muted">Review campaign configurations before dispatches.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Leads Count", value: parsedData.total_rows.toLocaleString() },
                      { label: "Consent Source", value: optInSource.replace(/_/g, " ") },
                      { label: "Active Template", value: templateName },
                      { label: "Dispatch Plan", value: scheduleType === "now" ? "Send Immediately" : scheduleType === "scheduled" ? `At ${scheduleAt}` : `Drip over ${dripDays} days${dripSendTime ? ` · ${dripSendTime} IST daily` : ""}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-4 bg-surface-low rounded-xl border border-surface-mid">
                        <p className="font-label text-[10px] text-on-surface-muted uppercase tracking-wider mb-1 font-bold">{label}</p>
                        <p className="font-body text-sm font-bold text-on-surface capitalize truncate">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* ── Risk Audit Card ─────────────────────────────────── */}
                  {riskLoading && (
                    <div className="flex items-center gap-2 p-3.5 bg-surface-low rounded-xl border border-surface-mid font-body text-sm text-on-surface-muted">
                      <div className="w-4 h-4 border-2 border-tertiary border-t-transparent rounded-full animate-spin" />
                      Checking audience health…
                    </div>
                  )}
                  {!riskLoading && riskSummary && (riskSummary.negative_reply_count > 0 || riskSummary.high_no_reply_count > 0) && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                        <p className="font-label text-sm font-semibold text-amber-800">Audience Risk Summary</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2.5 bg-white rounded-lg border border-amber-100">
                          <p className="font-display text-xl font-bold text-red-600">{riskSummary.negative_reply_count}</p>
                          <p className="font-label text-[9px] text-on-surface-muted uppercase font-bold mt-0.5">Said No</p>
                        </div>
                        <div className="p-2.5 bg-white rounded-lg border border-amber-100">
                          <p className="font-display text-xl font-bold text-amber-600">{riskSummary.high_no_reply_count}</p>
                          <p className="font-label text-[9px] text-on-surface-muted uppercase font-bold mt-0.5">Silent 2+</p>
                        </div>
                        <div className="p-2.5 bg-white rounded-lg border border-amber-100">
                          <p className="font-display text-xl font-bold text-green-600">{riskSummary.safe_count}</p>
                          <p className="font-label text-[9px] text-on-surface-muted uppercase font-bold mt-0.5">Safe</p>
                        </div>
                      </div>
                      {riskSummary.negative_reply_count > 0 && (
                        <div className="space-y-2">
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={excludeNegativeReplies}
                              onChange={(e) => setExcludeNegativeReplies(e.target.checked)}
                              className="w-4 h-4 rounded border-amber-300 text-amber-600 accent-amber-600"
                            />
                            <span className="font-body text-sm text-amber-800">
                              Exclude {riskSummary.negative_reply_count} lead{riskSummary.negative_reply_count !== 1 ? "s" : ""} who previously said no
                            </span>
                          </label>
                          <button
                            onClick={handleUnflagAll}
                            disabled={unflagging}
                            className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50 font-label font-semibold"
                          >
                            {unflagging ? "Un-flagging…" : "Un-flag all — give them another chance"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {sendError && (
                    <div className="flex items-start gap-2 p-3.5 bg-red-50 text-red-700 rounded-xl font-body text-sm border border-red-100">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      {sendError}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-surface-mid/30">
                    <button
                      onClick={() => setCurrentStep(4)}
                      className="px-4 py-2.5 rounded-xl font-label text-sm text-on-surface-muted hover:bg-surface-low transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={sendLoading}
                      className="flex items-center gap-2 px-6 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      <Upload size={14} />
                      {sendLoading ? "Sending…" : "Confirm & Dispatch"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 6: Done ──────────────────────────────────────────────── */}
              {currentStep === 6 && sendResult && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 bg-green-50 border border-green-100 p-4 rounded-2xl">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0 border border-green-200">
                      <Check size={20} className="text-green-700" />
                    </div>
                    <div>
                      <h2 className="font-display text-xl font-bold text-green-950">Campaign sent successfully!</h2>
                      <p className="font-body text-xs text-green-700 mt-0.5">Leads queued — replies will appear in Conversations.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 bg-green-50/50 border border-green-200/50 rounded-xl text-center">
                      <p className="font-display text-3xl font-bold text-green-700">{sendResult.queued.toLocaleString()}</p>
                      <p className="font-label text-[10px] text-green-600 mt-1 uppercase tracking-wide font-bold">Sent</p>
                    </div>
                    <div className="p-4 bg-surface-low border border-surface-mid rounded-xl text-center">
                      <p className="font-display text-3xl font-bold text-on-surface-muted">{sendResult.failed.toLocaleString()}</p>
                      <p className="font-label text-[10px] text-on-surface-muted mt-1 uppercase tracking-wide font-bold">Failed</p>
                    </div>
                    <div className="p-4 bg-tertiary/5 border border-tertiary/15 rounded-xl text-center">
                      <p className="font-display text-sm font-bold text-tertiary truncate leading-10">{sendResult.number_used}</p>
                      <p className="font-label text-[10px] text-on-surface-muted mt-1 uppercase tracking-wide font-bold">Sender Line</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-4 border-t border-surface-mid/30">
                    <Link
                      href="/dashboard/conversations"
                      className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 transition-colors shadow-sm"
                    >
                      <MessageSquare size={16} />
                      View Conversations
                    </Link>
                    <button
                      onClick={resetAll}
                      className="flex items-center gap-2 px-5 py-3 bg-surface-low text-on-surface rounded-xl font-label text-sm font-semibold hover:bg-surface-mid transition-colors border border-surface-mid/60"
                    >
                      <RotateCcw size={14} />
                      Upload Another
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Dynamic Helper Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Widget 1: Sender Stats */}
            <div className="bg-surface rounded-[2rem] p-6 shadow-lg ring-1 ring-[#c4c7c7]/20 animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-tertiary/10 flex items-center justify-center text-tertiary">
                    <Phone size={16} />
                  </div>
                  <h3 className="font-display font-bold text-on-surface text-base">Sender Line</h3>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </div>
              </div>

              {primaryNumberLoading ? (
                <div className="py-4 text-center">
                  <div className="w-5 h-5 border-2 border-tertiary border-t-transparent rounded-full animate-spin mx-auto mb-1" />
                  <p className="font-body text-xs text-on-surface-muted">Fetching line details...</p>
                </div>
              ) : primaryNumber ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-label text-[10px] text-on-surface-muted uppercase tracking-wider font-bold">Display Name</p>
                    <p className="font-body text-sm font-semibold text-on-surface">{primaryNumber.display_name}</p>
                  </div>
                  <div>
                    <p className="font-label text-[10px] text-on-surface-muted uppercase tracking-wider font-bold">WhatsApp Number</p>
                    <p className="font-body text-sm font-semibold text-on-surface">{primaryNumber.number}</p>
                  </div>
                  <div className="pt-2.5 border-t border-surface-mid grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 bg-surface-low rounded-xl">
                      <p className="font-label text-[9px] text-on-surface-muted uppercase font-bold">Daily Limit</p>
                      <p className="font-display text-xs font-bold text-on-surface mt-0.5">1k / day</p>
                    </div>
                    <div className="p-2 bg-surface-low rounded-xl">
                      <p className="font-label text-[9px] text-on-surface-muted uppercase font-bold">Quality Score</p>
                      <p className="font-display text-xs font-bold text-emerald-600 mt-0.5">High</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 text-amber-700 rounded-xl text-xs font-body flex items-start gap-2 border border-amber-100">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>No primary sender configured. Broadcasts will fail until you map a primary sender.</span>
                </div>
              )}
            </div>

            {/* Widget 2: Live WhatsApp Preview */}
            <div className="bg-surface rounded-[2rem] p-6 shadow-lg ring-1 ring-[#c4c7c7]/20">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                  <Smartphone size={16} />
                </div>
                <h3 className="font-display font-bold text-on-surface text-base">Live Preview</h3>
              </div>

              {/* Phone Mockup */}
              <div className="border border-surface-mid rounded-[24px] overflow-hidden bg-[#efeae2] shadow-inner relative max-w-sm mx-auto">
                {/* Phone Header */}
                <div className="bg-[#075e54] text-white px-3 py-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center font-display text-[10px] font-bold shrink-0">
                    A
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-label text-[10px] font-semibold truncate leading-tight">Aira Assistant</p>
                    <p className="font-body text-[8px] text-white/80 leading-none">Online</p>
                  </div>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                </div>

                {/* Chat Container */}
                <div className="p-3 space-y-3 min-h-[180px] flex flex-col justify-end">
                  {templateName ? (
                    (() => {
                      const activeTemplate = templates.find(t => t.name === templateName);
                      if (!activeTemplate) return (
                        <p className="font-body text-xs text-on-surface-muted text-center py-8">Loading template structure...</p>
                      );

                      return (
                        <div className="space-y-1.5 max-w-[90%] self-start w-full">
                          {/* Message Bubble */}
                          <div className="bg-white rounded-2xl rounded-tl-none p-2.5 shadow-sm text-[#111B21] relative border border-white/5 w-full">
                            {/* Header Media */}
                            {activeTemplate.header_media_type && activeTemplate.header_media_type !== "NONE" && (
                              <div className="mb-2 bg-surface-low rounded-lg p-3 flex flex-col items-center justify-center border border-surface-mid text-on-surface-muted gap-1">
                                {activeTemplate.header_media_type === "IMAGE" && <ImageIcon size={20} className="text-on-surface-muted" />}
                                {activeTemplate.header_media_type === "VIDEO" && <PlayCircle size={20} className="text-on-surface-muted" />}
                                {activeTemplate.header_media_type === "DOCUMENT" && <FileText size={20} className="text-on-surface-muted" />}
                                {activeTemplate.header_media_type === "LOCATION" && <MapPin size={20} className="text-on-surface-muted" />}
                                <span className="font-label text-[9px] font-bold tracking-wide uppercase mt-0.5 text-on-surface-muted">
                                  {activeTemplate.header_media_type} Header
                                </span>
                              </div>
                            )}

                            {/* Header Text */}
                            {activeTemplate.header_text && (
                              <p className="font-label text-xs font-bold text-[#111b21] mb-1 leading-tight">
                                {activeTemplate.header_text}
                              </p>
                            )}

                            {/* Body Text */}
                            <p className="font-body text-[11px] whitespace-pre-wrap break-words leading-relaxed text-[#111b21]">
                              {formatPreviewText(activeTemplate.body_text)}
                            </p>

                            {/* Footer Text */}
                            {activeTemplate.footer_text && (
                              <p className="font-body text-[9px] text-gray-500 mt-1 leading-tight border-t border-surface-mid/40 pt-1.5">
                                {activeTemplate.footer_text}
                              </p>
                            )}

                            {/* Timestamp & checkmarks */}
                            <div className="text-right mt-1 leading-none">
                              <span className="font-body text-[8px] text-gray-400">12:30 PM</span>
                              <span className="text-[#53bdeb] ml-1 font-body text-[9px] font-bold">✓✓</span>
                            </div>
                          </div>

                          {/* Action Buttons underneath bubble */}
                          {activeTemplate.buttons && activeTemplate.buttons.length > 0 && (
                            <div className="space-y-1 w-full">
                              {activeTemplate.buttons.map((btn, bidx) => (
                                <button
                                  key={bidx}
                                  type="button"
                                  className="w-full bg-white/95 hover:bg-white text-[#008069] font-label text-[10px] font-bold py-2 px-2.5 rounded-lg shadow-sm border border-white/5 flex items-center justify-center gap-1.5 transition-colors"
                                >
                                  {btn.type === "URL" && <Globe size={10} />}
                                  {btn.type === "PHONE_NUMBER" && <Phone size={10} />}
                                  {btn.type === "WHATSAPP_CALL" && <Phone size={10} />}
                                  {btn.type === "COPY_CODE" && <Copy size={10} />}
                                  {btn.text}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-on-surface-muted/60 w-full">
                      <MessageSquare size={20} className="opacity-40" />
                      <p className="font-body text-xs">Select a template in step 4 to view live message layout</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Widget 3: CSV Format Guidance */}
            <div className="bg-surface rounded-[2rem] p-6 shadow-lg ring-1 ring-[#c4c7c7]/20">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <FileSpreadsheet size={16} />
                </div>
                <h3 className="font-display font-bold text-on-surface text-base">CSV Template</h3>
              </div>

              {parsedData ? (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-surface-low rounded-xl">
                    <p className="font-label text-[10px] text-on-surface-muted uppercase font-bold">Uploaded File</p>
                    <p className="font-body font-semibold text-on-surface truncate mt-0.5">{csvFile?.name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 bg-green-50 border border-green-100 rounded-xl">
                      <p className="font-label text-[9px] text-green-700 uppercase font-bold">Leads</p>
                      <p className="font-display font-bold text-green-700 mt-0.5">{(parsedData.total_rows - parsedData.duplicate_count).toLocaleString()}</p>
                    </div>
                    <div className="p-2 bg-surface-low rounded-xl">
                      <p className="font-label text-[9px] text-on-surface-muted uppercase font-bold">Headers</p>
                      <p className="font-display font-bold text-on-surface mt-0.5">{parsedData.columns.length}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="font-body text-xs text-on-surface-muted leading-relaxed">
                    Make sure your CSV file includes these headers. Match additional variables with custom columns.
                  </p>

                  <div className="divide-y divide-surface-mid border-t border-b border-surface-mid">
                    <div className="py-2 flex justify-between text-xs font-body">
                      <span className="font-mono text-on-surface font-semibold">phone</span>
                      <span className="text-red-700 font-bold bg-red-50 px-1.5 py-0.5 rounded text-[9px]">Required</span>
                    </div>
                    <div className="py-2 flex justify-between text-xs font-body">
                      <span className="font-mono text-on-surface font-semibold">name</span>
                      <span className="text-on-surface-muted bg-surface-low px-1.5 py-0.5 rounded text-[9px]">Optional</span>
                    </div>
                    <div className="py-2 flex justify-between text-xs font-body">
                      <span className="font-mono text-on-surface font-semibold">course / other</span>
                      <span className="text-on-surface-muted bg-surface-low px-1.5 py-0.5 rounded text-[9px]">Optional</span>
                    </div>
                  </div>

                  <button
                    onClick={downloadSampleCSV}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-surface-low hover:bg-surface-mid rounded-xl font-label text-xs font-bold text-on-surface transition-colors border border-surface-mid/60"
                  >
                    <Download size={13} />
                    Download Sample CSV
                  </button>
                </div>
              )}
            </div>

            {/* Widget 4: Compliance & Limits */}
            <div className="bg-surface rounded-[2rem] p-6 shadow-lg ring-1 ring-[#c4c7c7]/20 text-xs">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                  <ShieldCheck size={16} />
                </div>
                <h3 className="font-display font-bold text-on-surface text-base">Policy Guide</h3>
              </div>
              <ul className="space-y-2 font-body text-on-surface-muted">
                <li className="flex gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span><strong>Opt-in rule</strong>: Only send messages to leads who explicitly agreed to receive updates.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span><strong>Limits</strong>: Keep dispatches below your tier limits to protect WABA quality rating.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span><strong>24h rule</strong>: Users can reply to template broadcasts to open a 24h custom chat session.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast History */}
      {/* Tags Tab */}
      {activeTab === "tags" && (
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-on-surface">Tags</h2>
              <p className="font-body text-sm text-on-surface-muted mt-0.5">Tag each broadcast by product to track interest per audience segment.</p>
            </div>
            <div className="flex items-center gap-3">
              <ExportAllDropdown tagCount={tagsList.length} />
              <button
                onClick={() => setShowCreateTag((p) => !p)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl font-label text-sm font-semibold transition-colors border",
                  showCreateTag ? "bg-violet-50 border-violet-200 text-violet-700" : "bg-surface border-surface-mid text-on-surface hover:border-violet-300"
                )}
              >
                <Plus size={16} />{showCreateTag ? "Cancel" : "New Tag"}
              </button>
            </div>
          </div>

          {showCreateTag && (
            <div className="bg-surface rounded-2xl p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
              <p className="font-label text-sm font-semibold text-on-surface mb-4">Create Tag</p>
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1">
                  <label className="font-label text-xs text-on-surface-muted mb-1 block">Name</label>
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                    placeholder="e.g. Biscuits, Ice Cream"
                    className="w-full px-3 py-2 rounded-lg border border-surface-mid bg-surface-low font-label text-sm text-on-surface placeholder:text-on-surface-muted/50 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
                <div>
                  <label className="font-label text-xs text-on-surface-muted mb-1 block">Color</label>
                  <div className="flex gap-1.5 flex-wrap max-w-[320px]">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => { setCustomTagColor(""); setNewTagColor(c); }}
                        className={cn("w-7 h-7 rounded-full transition-transform", newTagColor === c && !customTagColor ? "ring-2 ring-offset-2 ring-violet-500 scale-110" : "hover:scale-110")}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Palette size={14} className="text-on-surface-muted" />
                    <input
                      type="color"
                      value={customTagColor || newTagColor}
                      onChange={(e) => { setCustomTagColor(e.target.value); setNewTagColor(e.target.value); }}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-surface-mid"
                      title="Custom color"
                    />
                    <span className="font-mono text-xs text-on-surface-muted">{customTagColor || newTagColor}</span>
                  </div>
                </div>
                <button onClick={handleCreateTag} disabled={creatingTag || !newTagName.trim()} className="px-5 py-2 rounded-xl bg-violet-600 text-white font-label text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 flex items-center gap-2">
                  {creatingTag && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}Create
                </button>
              </div>
            </div>
          )}

          {tagsListLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tagsList.length === 0 ? (
            <div className="bg-surface rounded-2xl p-12 shadow-card ring-1 ring-[#c4c7c7]/15 text-center">
              <Tag size={32} className="text-on-surface-muted/30 mx-auto mb-3" />
              <p className="font-display font-bold text-on-surface">No tags yet</p>
              <p className="font-body text-sm text-on-surface-muted mt-1">Create your first tag to start tracking product-wise interest.</p>
            </div>
          ) : (
            <div className="bg-surface rounded-2xl shadow-card ring-1 ring-[#c4c7c7]/15">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-mid">
                    {["Tag", "Sent", "Hot", "Warm", "Cold", "Actions"].map((h) => (
                      <th key={h} className={cn("font-label text-xs font-semibold text-on-surface-muted py-3", h === "Tag" || h === "Actions" ? "px-5" : "px-3 text-center", h === "Actions" ? "text-right" : "")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-mid/50">
                  {tagsList.map((tag) => {
                    const s = tagStats[tag.id];
                    return (
                      <tr key={tag.id} className="hover:brightness-95 transition-all" style={{ backgroundColor: hexToLightTint(tag.color) }}>
                        <td className="px-5 py-3">
                          <span className="font-label text-sm font-semibold text-on-surface">{tag.name}</span>
                        </td>
                        <td className="px-3 py-3 text-center font-label text-sm text-on-surface-muted">{s?.total_sent ?? 0}</td>
                        <td className="px-3 py-3 text-center font-label text-sm font-semibold text-green-600">{s?.hot ?? 0}</td>
                        <td className="px-3 py-3 text-center font-label text-sm font-semibold text-amber-600">{s?.warm ?? 0}</td>
                        <td className="px-3 py-3 text-center font-label text-sm text-on-surface-muted">{s?.cold ?? 0}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => window.open(`${API_URL}/api/v1/uploads/tag-csv?tag_id=${tag.id}`, "_blank")}
                              className="text-xs px-2.5 py-1.5 rounded-lg border border-surface-mid text-on-surface-muted hover:text-on-surface hover:border-violet-300 hover:bg-violet-50 transition-all flex items-center gap-1.5 font-medium"
                              title="Download all leads for this tag"
                            >
                              <Download size={12} /> All Leads
                            </button>
                            <SegmentDropdown tagId={tag.id} />
                            <button onClick={() => handleDeleteTag(tag)} disabled={deletingTagId === tag.id} className="p-1.5 rounded-lg text-on-surface-muted/50 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                              {deletingTagId === tag.id ? <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={14} />}
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
        </div>
      )}

      {activeTab === "history" && (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-white border-b border-emerald-100 px-8 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center shadow-sm">
                <Clock size={22} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-gray-900">Broadcast History</h2>
                <p className="font-body text-sm text-gray-500 mt-0.5">Last 50 campaign dispatches for your account</p>
              </div>
            </div>
            {!historyLoading && broadcastHistory.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search…"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-44 pl-9 pr-3 py-2 font-body text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 transition-all"
                  />
                </div>
                <button
                  onClick={downloadHistoryCsv}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg font-label text-sm font-semibold hover:bg-emerald-600 transition-all shadow-sm"
                >
                  <Download size={14} />
                  Download CSV
                </button>
                <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
                  {(["all", "failures", "clean"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setHistoryStatusFilter(f)}
                      className={cn(
                        "px-3 py-2 font-label text-xs font-semibold transition-all",
                        historyStatusFilter === f
                          ? "bg-emerald-500 text-white"
                          : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      {f === "all" ? "All" : f === "failures" ? "Failures" : "Clean"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={refreshHistory}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg font-label text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                >
                  <RotateCcw size={14} />
                  Refresh
                </button>
              </div>
            )}
          </div>
        </div>

        {historyLoading ? (
          <div className="py-12 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : broadcastHistory.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Send size={24} className="text-gray-400" />
            </div>
            <div className="text-center">
              <p className="font-display text-sm font-semibold text-gray-700">No broadcasts yet</p>
              <p className="font-body text-xs text-gray-500 mt-1">Send your first campaign to see history here</p>
            </div>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Search size={24} className="text-gray-400" />
            </div>
            <div className="text-center">
              <p className="font-display text-sm font-semibold text-gray-700">No matches found</p>
              <p className="font-body text-xs text-gray-500 mt-1">Try a different search or filter</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredHistory.map((item, i) => (
              <div key={i} className="p-6 first:pt-4 last:pb-4">
                {/* Campaign Info Bar */}
                <div className="flex items-center gap-4 mb-5 pb-4 border-b border-gray-100">
                  {/* Date */}
                  <div className="flex items-center gap-2 min-w-[160px]">
                    <Calendar size={16} className="text-gray-400 shrink-0" />
                    <span className="font-display text-sm font-semibold text-gray-800">
                      {new Date(item.timestamp).toLocaleString("en-IN", { 
                        day: "numeric", 
                        month: "short", 
                        year: "numeric",
                        hour: "2-digit", 
                        minute: "2-digit",
                        hour12: false 
                      })}
                    </span>
                  </div>
                  
                  {/* Template Badge */}
                  <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 font-label text-xs font-semibold border border-emerald-100">
                    {item.template_name}
                  </span>
                  
                  {/* Spacer */}
                  <div className="flex-1" />
                  
                  {/* Phone Number */}
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-gray-400" />
                    <span className="font-body text-sm text-gray-600 font-medium">{item.number_used || "—"}</span>
                  </div>
                  
                  {/* CSV Download */}
                  {item.csv_file_url && (
                    <a 
                      href={item.csv_file_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      download={item.csv_file_name || "broadcast.csv"}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg font-label text-xs font-semibold transition-colors border border-gray-200"
                    >
                      <Download size={14} />
                      Download CSV
                    </a>
                  )}
                  
                  {/* Failed CSV Download */}
                  {item.failed > 0 && item.broadcast_id ? (
                    <button
                      onClick={() => downloadFailedCsv(item.broadcast_id!)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-label text-xs font-semibold transition-colors border border-red-200"
                    >
                      <Download size={14} />
                      Download Failed CSV
                    </button>
                  ) : item.failed === 0 ? (
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg font-label text-xs font-medium border border-green-100">
                      <CheckCircle2 size={14} />
                      No failures detected
                    </span>
                  ) : null}

                  {/* Interest CSV Download */}
                  {item.broadcast_id && (
                    <button
                      onClick={() => downloadBroadcastTagCsv(item.broadcast_id!, item.tag_id)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg font-label text-xs font-semibold transition-colors border border-violet-200"
                    >
                      <Tag size={14} />
                      Download Interest CSV
                    </button>
                  )}
                </div>
                
                {/* Reply Sentiment + Interest row */}
                {((item.replied_positive ?? 0) + (item.replied_negative ?? 0) + (item.replied_neutral ?? 0) > 0 || (item.hot ?? 0) + (item.warm ?? 0) > 0) && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(item.replied_positive ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 rounded-full font-label text-xs font-semibold text-green-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />{item.replied_positive} positive repl{item.replied_positive === 1 ? "y" : "ies"}
                      </span>
                    )}
                    {(item.replied_negative ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 border border-red-200 rounded-full font-label text-xs font-semibold text-red-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{item.replied_negative} said no
                      </span>
                    )}
                    {(item.replied_neutral ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-200 rounded-full font-label text-xs font-semibold text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />{item.replied_neutral} neutral
                      </span>
                    )}
                    {(item.hot ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 border border-orange-200 rounded-full font-label text-xs font-semibold text-orange-700">
                        🔥 {item.hot} hot
                      </span>
                    )}
                    {(item.warm ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full font-label text-xs font-semibold text-amber-700">
                        ✦ {item.warm} warm
                      </span>
                    )}
                  </div>
                )}

                {/* Metrics Grid - 4 Equal Columns */}
                <div className="grid grid-cols-4 gap-3">
                  {/* Sent */}
                  <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <Send size={16} className="text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-sm font-bold text-gray-900">
                          Sent <span className="text-blue-600 font-semibold">({Math.round((item.sent / item.total_leads) * 100)}%)</span>
                        </p>
                        <p className="font-body text-[11px] text-gray-500 mt-0.5">{item.sent} of {item.total_leads} leads</p>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out" 
                        style={{ width: `${(item.sent / item.total_leads) * 100}%` }} 
                      />
                    </div>
                  </div>
                  
                  {/* Delivered */}
                  <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-sm font-bold text-gray-900">
                          Delivered <span className="text-emerald-600 font-semibold">({Math.round(((item.delivered || 0) / item.total_leads) * 100)}%)</span>
                        </p>
                        <p className="font-body text-[11px] text-gray-500 mt-0.5">{item.delivered || 0} of {item.total_leads} leads</p>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full transition-all duration-700 ease-out" 
                        style={{ width: `${((item.delivered || 0) / item.total_leads) * 100}%` }} 
                      />
                    </div>
                  </div>
                  
                  {/* Opened */}
                  <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <Eye size={16} className="text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-sm font-bold text-gray-900">
                          Opened <span className="text-amber-600 font-semibold">({Math.round(((item.opened || 0) / item.total_leads) * 100)}%)</span>
                        </p>
                        <p className="font-body text-[11px] text-gray-500 mt-0.5">{item.opened || 0} of {item.total_leads} leads</p>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 rounded-full transition-all duration-700 ease-out" 
                        style={{ width: `${((item.opened || 0) / item.total_leads) * 100}%` }} 
                      />
                    </div>
                  </div>
                  
                  {/* Failed */}
                  <div className="bg-red-50/50 rounded-xl p-3 border border-red-100/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                        <XCircle size={16} className="text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-sm font-bold text-gray-900">
                          Failed <span className="text-red-600 font-semibold">({Math.round(((item.failed || 0) / item.total_leads) * 100)}%)</span>
                        </p>
                        <p className="font-body text-[11px] text-gray-500 mt-0.5">{item.failed || 0} of {item.total_leads} leads</p>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-red-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-500 rounded-full transition-all duration-700 ease-out" 
                        style={{ width: `${((item.failed || 0) / item.total_leads) * 100}%` }} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
