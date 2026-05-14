"use client";
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Upload, FileText, Check, AlertTriangle, ChevronRight, RotateCcw, MessageSquare } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedData = {
  columns: string[];
  suggested_mapping: { name: string | null; phone: string | null; email: string | null; course: string | null };
  total_rows: number;
  duplicate_count: number;
  preview: Record<string, string>[];
};

type OptInValidation = {
  allowed: boolean;
  template_type: string;
  message: string;
};

type SendResult = {
  queued: number;
  rejected: number;
  number_used: string;
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
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-label text-xs font-bold transition-colors
                  ${done ? "bg-tertiary text-white" : active ? "bg-tertiary text-white ring-4 ring-tertiary/20" : "bg-surface-mid text-on-surface-muted"}`}
              >
                {done ? <Check size={14} /> : step}
              </div>
              <span className={`font-label text-xs whitespace-nowrap ${active ? "text-tertiary font-semibold" : "text-on-surface-muted"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-10 mx-1 mb-5 ${step < current ? "bg-tertiary" : "bg-surface-mid"}`} />
            )}
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentStep === 4 && templates.length === 0) {
      getAuthHeaders().then(auth => {
        fetch(`${API_URL}/api/v1/templates`, { headers: auth })
          .then(r => r.json())
          .then((data: {id: string; name: string; status: string; category: string}[]) => {
            setTemplates((data || []).filter(t => t.status === "APPROVED"));
          })
          .catch(() => {});
      });
    }
  }, [currentStep]);

  function resetAll() {
    setCurrentStep(1);
    setCsvFile(null);
    setParsedData(null);
    setParseError(null);
    setOptInSource("");
    setOptInValidation(null);
    setTemplateName("");
    setScheduleType("now");
    setScheduleAt("");
    setDripDays("");
    setSendError(null);
    setSendResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setCsvFile(f);
    setParsedData(null);
    setParseError(null);
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
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSendLoading(false);
    }
  }

  const inputCls = "w-full px-4 py-3 bg-surface-low rounded-xl font-body text-sm text-on-surface border-0 focus:ring-2 focus:ring-tertiary outline-none";

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-tertiary">Bulk Contact Upload</h1>
        <p className="font-body text-base text-on-surface-muted mt-1">Import contacts and send a WhatsApp campaign in six steps.</p>
      </div>

      <div className="bg-surface rounded-card p-10 shadow-card ring-1 ring-[#c4c7c7]/15 max-w-3xl">
        <StepIndicator current={currentStep} />

        {/* ── Step 1: Upload CSV ─────────────────────────────────────────── */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-xl font-bold text-tertiary mb-1">Upload your CSV</h2>
              <p className="font-body text-base text-on-surface-muted">We&apos;ll detect column mappings automatically.</p>
            </div>

            <label className="flex flex-col items-center justify-center gap-4 p-16 bg-surface-low rounded-2xl border-2 border-dashed border-surface-mid cursor-pointer hover:border-tertiary hover:bg-tertiary/5 transition-all group">
              <div className="w-16 h-16 rounded-2xl bg-tertiary/10 flex items-center justify-center group-hover:bg-tertiary/20 transition-colors">
                <FileText size={28} className="text-tertiary" />
              </div>
              <div className="text-center">
                <p className="font-body text-base font-semibold text-on-surface">{csvFile?.name ?? "Drop your CSV here"}</p>
                <p className="font-label text-sm text-on-surface-muted mt-1">or click to browse · .csv files only</p>
                {csvFile && <p className="font-label text-xs text-tertiary mt-1">{(csvFile.size / 1024).toFixed(1)} KB</p>}
              </div>
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
              <div className="space-y-3 p-4 bg-surface-low rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="font-label text-sm text-on-surface-muted uppercase tracking-widest">Total rows</span>
                  <span className="font-label text-sm font-semibold text-on-surface">{parsedData.total_rows.toLocaleString()}</span>
                </div>
                {parsedData.duplicate_count > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="font-label text-sm text-on-surface-muted uppercase tracking-widest">Duplicates</span>
                    <span className="font-label text-sm font-semibold text-amber-700">{parsedData.duplicate_count} already in system</span>
                  </div>
                )}
                <div className="flex items-start justify-between">
                  <span className="font-label text-sm text-on-surface-muted uppercase tracking-widest">Detected columns</span>
                  <span className="font-label text-sm text-on-surface text-right max-w-xs">{parsedData.columns.join(", ")}</span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="font-label text-sm text-on-surface-muted uppercase tracking-widest">Suggested mapping</span>
                  <div className="text-right font-label text-sm text-on-surface space-y-0.5">
                    {Object.entries(parsedData.suggested_mapping).map(([k, v]) => (
                      <div key={k}><span className="text-on-surface-muted">{k}:</span> {v ?? <span className="italic text-on-surface-muted">none</span>}</div>
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
              <h2 className="font-display text-xl font-bold text-tertiary mb-1">Opt-in Source</h2>
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
              <h2 className="font-display text-xl font-bold text-tertiary mb-1">Preview</h2>
              <p className="font-body text-base text-on-surface-muted">
                Showing first {parsedData.preview.length} of {parsedData.total_rows.toLocaleString()} rows.
              </p>
            </div>

            {parsedData.duplicate_count > 0 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-700 rounded-xl font-body text-base">
                <AlertTriangle size={15} className="shrink-0" />
                {parsedData.duplicate_count} duplicate{parsedData.duplicate_count !== 1 ? "s" : ""} detected — they will be skipped on import.
              </div>
            )}

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
              <h2 className="font-display text-xl font-bold text-tertiary mb-1">Template & Schedule</h2>
              <p className="font-body text-base text-on-surface-muted">Choose which template to send and when.</p>
            </div>

            <div>
              <label className="block font-label text-sm font-semibold text-on-surface uppercase tracking-widest mb-2">
                Template Name
              </label>
              <select
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
              {templates.length === 0 && (
                <p className="font-label text-sm text-amber-600 mt-2">
                  No approved templates yet. <a href="/dashboard/templates" className="underline">Create one →</a>
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
              <h2 className="font-display text-xl font-bold text-tertiary mb-1">Confirm & Send</h2>
              <p className="font-body text-base text-on-surface-muted">Review before dispatching.</p>
            </div>

            <dl className="space-y-3 p-5 bg-surface-low rounded-xl ring-1 ring-[#c4c7c7]/15">
              <div className="flex justify-between">
                <dt className="font-label text-sm text-on-surface-muted uppercase tracking-widest">Leads</dt>
                <dd className="font-label text-sm font-semibold text-on-surface">{parsedData.total_rows.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-label text-sm text-on-surface-muted uppercase tracking-widest">Opt-in Source</dt>
                <dd className="font-label text-sm font-semibold text-on-surface capitalize">{optInSource.replace(/_/g, " ")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-label text-sm text-on-surface-muted uppercase tracking-widest">Template</dt>
                <dd className="font-label text-sm font-semibold text-on-surface">{templateName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-label text-sm text-on-surface-muted uppercase tracking-widest">Schedule</dt>
                <dd className="font-label text-sm font-semibold text-on-surface capitalize">
                  {scheduleType === "now" ? "Send Immediately" : scheduleType === "scheduled" ? `At ${scheduleAt}` : `Drip over ${dripDays} days`}
                </dd>
              </div>
            </dl>

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
                <h2 className="font-display text-xl font-bold text-tertiary">Campaign Queued</h2>
                <p className="font-body text-base text-on-surface-muted">Your messages are on their way.</p>
              </div>
            </div>

            <dl className="space-y-3 p-5 bg-surface-low rounded-xl ring-1 ring-[#c4c7c7]/15">
              <div className="flex justify-between">
                <dt className="font-label text-sm text-on-surface-muted uppercase tracking-widest">Queued</dt>
                <dd className="font-label text-sm font-semibold text-green-700">{sendResult.queued.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-label text-sm text-on-surface-muted uppercase tracking-widest">Rejected (no consent)</dt>
                <dd className="font-label text-sm font-semibold text-on-surface-muted">{sendResult.rejected.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-label text-sm text-on-surface-muted uppercase tracking-widest">Sender Number</dt>
                <dd className="font-label text-sm font-semibold text-tertiary">{sendResult.number_used}</dd>
              </div>
            </dl>

            <div className="flex items-center gap-3">
              <a
                href="/dashboard/conversations"
                className="flex items-center gap-2 px-5 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 transition-colors"
              >
                <MessageSquare size={14} />
                View Conversations
              </a>
              <button
                onClick={resetAll}
                className="flex items-center gap-2 px-5 py-2.5 bg-surface-low text-on-surface rounded-xl font-label text-sm font-semibold hover:bg-surface-mid transition-colors"
              >
                <RotateCcw size={14} />
                Upload Another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
