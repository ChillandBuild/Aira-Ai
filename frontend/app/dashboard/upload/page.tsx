"use client";
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Upload, Check, AlertTriangle, ChevronRight, RotateCcw, MessageSquare, Clock, Send, Download, CheckCircle2, Eye, XCircle, Calendar, Phone } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { createClient } from "@supabase/supabase-js";
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
};

type ScheduleType = "now" | "scheduled" | "drip";

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

// ─── Main Page ────────────────────────────────────────────────────────────────

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

  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  const [templates, setTemplates] = useState<{id: string; name: string; category: string}[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState(false);

  const [primaryNumber, setPrimaryNumber] = useState<{ number: string; display_name: string } | null>(null);
  const [primaryNumberLoading, setPrimaryNumberLoading] = useState(false);

  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "history">("upload");
  
  // Supabase client for realtime updates
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );
  
  // Realtime subscription for message status updates
  useEffect(() => {
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
          // Auto-refresh history when message status changes
          refreshHistory();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTab]);

  const [csvFileUrl, setCsvFileUrl] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);

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
            .then((res: { data: {id: string; name: string; status: string; category: string}[] }) => {
              setTemplates((res.data || []).filter(t => t.status === "APPROVED"));
            })
            .catch(() => setTemplatesError(true))
            .finally(() => setTemplatesLoading(false));
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
  }, [currentStep, templates.length, templatesLoading, primaryNumber, primaryNumberLoading]);

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
    if (fileInputRef.current) fileInputRef.current.value = "";
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
        return {
          phone: phoneIdx >= 0 ? cols[phoneIdx] ?? "" : "",
          name: nameIdx >= 0 ? cols[nameIdx] ?? undefined : undefined,
          opt_in_source: optInSource,
        };
      }).filter((l) => l.phone);

      const payload = {
        leads,
        template_name: templateName,
        schedule_type: scheduleType,
        schedule_at: scheduleType === "scheduled" && scheduleAt ? scheduleAt : undefined,
        drip_days: scheduleType === "drip" && dripDays ? parseInt(dripDays, 10) : undefined,
        csv_file_url: csvFileUrl,
        csv_file_name: csvFileName,
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

  const inputCls = "w-full px-4 py-3 bg-surface-low rounded-xl font-body text-sm text-on-surface border-0 focus:ring-2 focus:ring-tertiary outline-none";

  return (
    <div className={activeTab === "history" ? "max-w-7xl" : "max-w-4xl"}>
      <div className="mb-8">
        <h1 className="font-display text-4xl font-bold text-on-surface">Bulk Contact Upload</h1>
        <p className="font-body text-base text-on-surface-muted mt-2">Import a CSV and broadcast a WhatsApp campaign to all eligible leads.</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-surface-mid mb-6">
        <button 
          onClick={() => setActiveTab("upload")}
          className={cn(
            "px-6 py-3 font-label font-semibold text-sm transition-all border-b-2",
            activeTab === "upload" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"
          )}
        >
          Broadcast Message
        </button>
        <button 
          onClick={() => setActiveTab("history")}
          className={cn(
            "px-6 py-3 font-label font-semibold text-sm transition-all border-b-2",
            activeTab === "history" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"
          )}
        >
          Broadcast History
        </button>
      </div>

      {/* Upload Wizard */}
      {activeTab === "upload" && (
      <div className="bg-surface rounded-2xl p-10 shadow-lg ring-1 ring-[#c4c7c7]/20">
        <StepIndicator current={currentStep} />

        {/* ── Step 1: Upload CSV ─────────────────────────────────────────── */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl font-bold text-on-surface mb-1">Upload your CSV</h2>
              <p className="font-body text-base text-on-surface-muted">We&apos;ll detect column mappings automatically.</p>
            </div>

            <label className={`relative flex flex-col items-center justify-center gap-5 py-16 rounded-2xl border-2 border-dashed cursor-pointer transition-all group
              ${csvFile ? "border-tertiary bg-tertiary/5" : "border-tertiary/30 hover:border-tertiary/70 hover:bg-tertiary/[0.04]"}`}>
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all shadow-sm
                ${csvFile ? "bg-tertiary text-white" : "bg-tertiary/10 text-tertiary group-hover:bg-tertiary/20"}`}>
                {csvFile ? <Check size={36} /> : <Upload size={36} />}
              </div>
              <div className="text-center px-4">
                <p className="font-display text-xl font-bold text-on-surface">
                  {csvFile ? csvFile.name : "Drop your CSV file here"}
                </p>
                <p className="font-body text-sm text-on-surface-muted mt-1.5">
                  {csvFile
                    ? `${(csvFile.size / 1024).toFixed(1)} KB · click to change file`
                    : "or click to browse — .csv files only · name and phone columns required"}
                </p>
              </div>
              {!csvFile && (
                <div className="flex items-center gap-6 text-xs text-on-surface-muted font-label border-t border-dashed border-tertiary/20 w-full justify-center pt-4 mt-1">
                  <span>✓ Auto-detects columns</span>
                  <span>✓ Deduplicates existing leads</span>
                  <span>✓ Indian numbers auto-formatted</span>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
            </label>

            {parseLoading && <p className="font-body text-base text-on-surface-muted">Parsing file…</p>}
            {parseError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 text-red-700 rounded-xl font-body text-base">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
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
                      <span key={col} className={`px-2 py-0.5 rounded-md text-xs font-medium
                        ${Object.values(parsedData.suggested_mapping).includes(col) ? "bg-tertiary/10 text-tertiary" : "bg-surface-mid text-on-surface-muted"}`}>
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setCurrentStep(2)}
                disabled={!parsedData}
                className="flex items-center gap-2 px-5 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
              <p className="font-body text-base text-on-surface-muted">How did these leads consent to be contacted?</p>
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
                    <p className="font-body text-sm text-on-surface-muted mt-0.5">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {optInLoading && <p className="font-body text-base text-on-surface-muted">Validating…</p>}

            {optInValidation && (
              <div className={`flex items-start gap-2 p-3 rounded-xl font-body text-base
                ${optInValidation.allowed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {optInValidation.allowed ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
                <span>
                  <strong className="capitalize">{optInValidation.template_type}</strong> — {optInValidation.message}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2.5 rounded-xl font-label text-sm text-on-surface-muted hover:bg-surface-low transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(3)}
                disabled={!optInValidation?.allowed}
                className="flex items-center gap-2 px-5 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
              <h2 className="font-display text-2xl font-bold text-on-surface mb-1">Preview</h2>
              <p className="font-body text-base text-on-surface-muted">
                Showing first {parsedData.preview.length} of {parsedData.total_rows.toLocaleString()} rows.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl ring-1 ring-[#c4c7c7]/20">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-surface-low border-b border-surface-mid">
                    {parsedData.columns.map((col) => (
                      <th key={col} className="px-3 py-2.5 font-label font-semibold text-on-surface-muted whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedData.preview.map((row, ri) => (
                    <tr key={ri} className="border-b border-surface-mid/50 hover:bg-surface-low transition-colors">
                      {parsedData.columns.map((col) => (
                        <td key={col} className="px-3 py-2.5 font-body text-on-surface whitespace-nowrap">
                          {row[col] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2.5 rounded-xl font-label text-sm text-on-surface-muted hover:bg-surface-low transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(4)}
                className="flex items-center gap-2 px-5 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 transition-colors"
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
              <p className="font-body text-base text-on-surface-muted">Choose which template to send and when.</p>
            </div>

            <div className="bg-surface-low border border-surface-mid rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-label text-xs text-on-surface-muted uppercase tracking-wider mb-1 font-semibold">Sender Number</p>
                {primaryNumberLoading ? (
                  <p className="font-body text-sm text-on-surface-muted">Loading primary number...</p>
                ) : primaryNumber ? (
                  <p className="font-body text-base font-semibold text-on-surface">{primaryNumber.display_name} ({primaryNumber.number})</p>
                ) : (
                  <p className="font-body text-sm text-red-600">No primary number found! Broadcast may fail.</p>
                )}
              </div>
              <Link href="/dashboard/numbers" className="px-3 py-1.5 bg-white border border-surface-mid rounded-lg font-label text-xs font-semibold text-on-surface hover:bg-surface-low transition-colors">
                Change
              </Link>
            </div>

            <div>
              <label htmlFor="template-select" className="block font-label text-sm font-semibold text-on-surface uppercase tracking-widest mb-2">
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
                    {t.name} ({t.category})
                  </option>
                ))}
              </select>
              {templatesLoading && (
                <p className="font-label text-sm text-on-surface-muted mt-2">Loading templates…</p>
              )}
              {!templatesLoading && templatesError && (
                <p className="font-label text-sm text-red-600 mt-2">
                  Failed to load templates. <button onClick={() => { setTemplatesError(false); setTemplatesLoading(false); }} className="underline">Retry</button>
                </p>
              )}
              {!templatesLoading && !templatesError && templates.length === 0 && (
                <p className="font-label text-sm text-amber-600 mt-2">
                  No approved templates yet. <Link href="/dashboard/templates" className="underline">Create one →</Link>
                </p>
              )}
            </div>

            <div>
              <label className="block font-label text-sm font-semibold text-on-surface uppercase tracking-widest mb-2">
                Schedule
              </label>
              <div className="space-y-2">
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
                    <span className="font-label text-sm font-semibold text-on-surface">
                      {type === "now" ? "Send Now" : type === "scheduled" ? "Schedule for Later" : "Drip over N Days"}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {scheduleType === "scheduled" && (
              <div>
                <label className="block font-label text-sm font-semibold text-on-surface uppercase tracking-widest mb-2">
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
              <div>
                <label className="block font-label text-sm font-semibold text-on-surface uppercase tracking-widest mb-2">
                  Spread over how many days?
                </label>
                <input
                  type="number"
                  min={1}
                  value={dripDays}
                  onChange={(e) => setDripDays(e.target.value)}
                  placeholder="7"
                  className={inputCls}
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2.5 rounded-xl font-label text-sm text-on-surface-muted hover:bg-surface-low transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(5)}
                disabled={!templateName.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
              <p className="font-body text-base text-on-surface-muted">Review before dispatching.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Leads", value: parsedData.total_rows.toLocaleString() },
                { label: "Opt-in Source", value: optInSource.replace(/_/g, " ") },
                { label: "Template", value: templateName },
                { label: "Schedule", value: scheduleType === "now" ? "Send Immediately" : scheduleType === "scheduled" ? `At ${scheduleAt}` : `Drip over ${dripDays} days` },
              ].map(({ label, value }) => (
                <div key={label} className="p-4 bg-surface-low rounded-xl border border-surface-mid">
                  <p className="font-label text-xs text-on-surface-muted uppercase tracking-wider mb-1">{label}</p>
                  <p className="font-body text-base font-semibold text-on-surface capitalize truncate">{value}</p>
                </div>
              ))}
            </div>

            {sendError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 text-red-700 rounded-xl font-body text-base">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                {sendError}
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2.5 rounded-xl font-label text-sm text-on-surface-muted hover:bg-surface-low transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSend}
                disabled={sendLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Upload size={15} />
                {sendLoading ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 6: Done ──────────────────────────────────────────────── */}
        {currentStep === 6 && sendResult && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <Check size={20} className="text-green-700" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-on-surface">Campaign sent!</h2>
                <p className="font-body text-base text-on-surface-muted">Messages queued — replies will appear in Conversations.</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-5 bg-green-50 border border-green-200 rounded-xl text-center">
                <p className="font-display text-3xl font-bold text-green-700">{sendResult.queued.toLocaleString()}</p>
                <p className="font-label text-xs text-green-600 mt-1 uppercase tracking-wide">Sent</p>
              </div>
              <div className="p-5 bg-surface-low border border-surface-mid rounded-xl text-center">
                <p className="font-display text-3xl font-bold text-on-surface-muted">{sendResult.failed.toLocaleString()}</p>
                <p className="font-label text-xs text-on-surface-muted mt-1 uppercase tracking-wide">Failed</p>
              </div>
              <div className="p-5 bg-tertiary/5 border border-tertiary/15 rounded-xl text-center">
                <p className="font-display text-sm font-bold text-tertiary truncate">{sendResult.number_used}</p>
                <p className="font-label text-xs text-on-surface-muted mt-1 uppercase tracking-wide">Sender</p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Link
                href="/dashboard/conversations"
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 transition-colors"
              >
                <MessageSquare size={16} />
                View Conversations
              </Link>
              <button
                onClick={resetAll}
                className="flex items-center gap-2 px-5 py-3 bg-surface-low text-on-surface rounded-xl font-label text-sm font-semibold hover:bg-surface-mid transition-colors"
              >
                <RotateCcw size={14} />
                Upload Another
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Broadcast History */}
      {activeTab === "history" && (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-white border-b border-emerald-100 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center shadow-sm">
              <Clock size={22} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-gray-900">Broadcast History</h2>
              <p className="font-body text-sm text-gray-500 mt-0.5">Last 50 campaign dispatches for your account</p>
            </div>
          </div>
          <button 
            onClick={refreshHistory}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl font-label text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          >
            <RotateCcw size={15} />
            Refresh
          </button>
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
        ) : (
          <div className="divide-y divide-gray-100">
            {broadcastHistory.map((item, i) => (
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
                    <a 
                      href={`${API_URL}/api/v1/upload/failed-csv?broadcast_id=${item.broadcast_id}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      download
                      className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-label text-xs font-semibold transition-colors border border-red-200"
                    >
                      <AlertTriangle size={14} />
                      Download Failed CSV
                    </a>
                  ) : item.failed === 0 ? (
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg font-label text-xs font-medium border border-green-100">
                      <CheckCircle2 size={14} />
                      No failures detected
                    </span>
                  ) : null}
                </div>
                
                {/* Metrics Grid - 4 Equal Columns */}
                <div className="grid grid-cols-4 gap-4">
                  {/* Sent */}
                  <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <Send size={18} className="text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-base font-bold text-gray-900">
                          Sent <span className="text-blue-600 font-semibold">({Math.round((item.sent / item.total_leads) * 100)}%)</span>
                        </p>
                        <p className="font-body text-xs text-gray-500 mt-0.5">{item.sent} of {item.total_leads} leads</p>
                      </div>
                    </div>
                    <div className="w-full h-3 bg-blue-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out" 
                        style={{ width: `${(item.sent / item.total_leads) * 100}%` }} 
                      />
                    </div>
                  </div>
                  
                  {/* Delivered */}
                  <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={18} className="text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-base font-bold text-gray-900">
                          Delivered <span className="text-emerald-600 font-semibold">({Math.round(((item.delivered || 0) / item.total_leads) * 100)}%)</span>
                        </p>
                        <p className="font-body text-xs text-gray-500 mt-0.5">{item.delivered || 0} of {item.total_leads} leads</p>
                      </div>
                    </div>
                    <div className="w-full h-3 bg-emerald-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full transition-all duration-700 ease-out" 
                        style={{ width: `${((item.delivered || 0) / item.total_leads) * 100}%` }} 
                      />
                    </div>
                  </div>
                  
                  {/* Opened */}
                  <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-100/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <Eye size={18} className="text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-base font-bold text-gray-900">
                          Opened <span className="text-amber-600 font-semibold">({Math.round(((item.opened || 0) / item.total_leads) * 100)}%)</span>
                        </p>
                        <p className="font-body text-xs text-gray-500 mt-0.5">{item.opened || 0} of {item.total_leads} leads</p>
                      </div>
                    </div>
                    <div className="w-full h-3 bg-amber-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 rounded-full transition-all duration-700 ease-out" 
                        style={{ width: `${((item.opened || 0) / item.total_leads) * 100}%` }} 
                      />
                    </div>
                  </div>
                  
                  {/* Failed */}
                  <div className="bg-red-50/50 rounded-xl p-4 border border-red-100/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                        <XCircle size={18} className="text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-base font-bold text-gray-900">
                          Failed <span className="text-red-600 font-semibold">({Math.round(((item.failed || 0) / item.total_leads) * 100)}%)</span>
                        </p>
                        <p className="font-body text-xs text-gray-500 mt-0.5">{item.failed || 0} of {item.total_leads} leads</p>
                      </div>
                    </div>
                    <div className="w-full h-3 bg-red-100 rounded-full overflow-hidden">
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
