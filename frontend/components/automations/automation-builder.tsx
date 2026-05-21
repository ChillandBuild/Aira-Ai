"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, ChevronDown, ChevronUp, Save, Play,
  MessageSquare, Send, Users, Tag, FileText, Webhook,
  Clock, GitBranch, Zap, ArrowLeft, Loader2, type LucideIcon,
} from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutomationStep {
  id?: string;
  step_type: string;
  config: Record<string, unknown>;
  parent_step_id?: string | null;
  branch?: "yes" | "no" | null;
  position: number;
}

export interface AutomationData {
  id?: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  active: boolean;
  steps: AutomationStep[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: "lead_created", label: "Lead Created", description: "A new lead is created on any channel" },
  { value: "first_inbound_message", label: "First Inbound Message", description: "A lead sends their very first message" },
  { value: "new_message_received", label: "Any Message Received", description: "Any inbound message arrives from a lead" },
  { value: "keyword_match", label: "Keyword Match", description: "Message contains specific keywords" },
  { value: "segment_changed", label: "Segment Changed", description: "Lead's segment (A/B/C/D) changes" },
];

const STEP_OPTIONS: { value: string; label: string; icon: LucideIcon; color: string }[] = [
  { value: "send_message", label: "Send Message", icon: MessageSquare, color: "text-violet-500" },
  { value: "send_template", label: "Send Template", icon: Send, color: "text-blue-500" },
  { value: "assign_lead", label: "Assign Lead", icon: Users, color: "text-emerald-500" },
  { value: "update_segment", label: "Update Segment", icon: Tag, color: "text-amber-500" },
  { value: "add_note", label: "Add Note", icon: FileText, color: "text-pink-500" },
  { value: "send_webhook", label: "Send Webhook", icon: Webhook, color: "text-cyan-500" },
  { value: "wait", label: "Wait", icon: Clock, color: "text-slate-400" },
  { value: "condition", label: "Condition (Branch)", icon: GitBranch, color: "text-orange-500" },
];

const STEP_ICON: Record<string, LucideIcon> = {
  send_message: MessageSquare,
  send_template: Send,
  assign_lead: Users,
  update_segment: Tag,
  add_note: FileText,
  send_webhook: Webhook,
  wait: Clock,
  condition: GitBranch,
};

function stepSummary(step: AutomationStep): string {
  const c = step.config as Record<string, string>;
  switch (step.step_type) {
    case "send_message": return c.message ? `"${String(c.message).slice(0, 40)}${String(c.message).length > 40 ? "…" : ""}"` : "(no message set)";
    case "send_template": return c.template_name ? `Template: ${c.template_name}` : "(no template)";
    case "assign_lead": return c.mode === "specific" ? `Assign to caller` : "Round-robin assign";
    case "update_segment": return c.segment ? `→ Segment ${c.segment}` : "(no segment)";
    case "add_note": return c.note ? `"${String(c.note).slice(0, 40)}"` : "(empty note)";
    case "send_webhook": return c.url ? String(c.url).replace(/^https?:\/\//, "") : "(no URL)";
    case "wait": return c.amount ? `Wait ${c.amount} ${c.unit || "minutes"}` : "(no duration)";
    case "condition": return c.subject ? `If ${c.subject} ${c.operator} "${c.value}"` : "(no condition)";
    default: return "";
  }
}

// ─── Step config editor ───────────────────────────────────────────────────────

function StepConfigEditor({
  step,
  onChange,
}: {
  step: AutomationStep;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const c = step.config as Record<string, string>;

  if (step.step_type === "send_message") return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-on-surface-muted">Message text</label>
      <textarea
        className="w-full rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        rows={3}
        placeholder="Hello {{name}}, thanks for reaching out!"
        value={c.message || ""}
        onChange={e => onChange({ ...c, message: e.target.value })}
      />
      <p className="text-[11px] text-on-surface-muted">Use {"{{name}}"} and {"{{phone}}"} as placeholders.</p>
    </div>
  );

  if (step.step_type === "send_template") return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-on-surface-muted">Template name (exact match)</label>
      <input
        className="w-full rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="e.g. welcome_message"
        value={c.template_name || ""}
        onChange={e => onChange({ ...c, template_name: e.target.value })}
      />
      <p className="text-[11px] text-on-surface-muted">WhatsApp leads only. Template must be approved in Meta.</p>
    </div>
  );

  if (step.step_type === "assign_lead") return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-on-surface-muted">Assignment mode</label>
      <select
        className="w-full rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
        value={c.mode || "round_robin"}
        onChange={e => onChange({ ...c, mode: e.target.value })}
      >
        <option value="round_robin">Round-robin (auto-assign to next available caller)</option>
        <option value="specific">Specific caller (by ID)</option>
      </select>
      {c.mode === "specific" && (
        <input
          className="w-full rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Caller user ID"
          value={c.caller_id || ""}
          onChange={e => onChange({ ...c, caller_id: e.target.value })}
        />
      )}
    </div>
  );

  if (step.step_type === "update_segment") return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-on-surface-muted">Set segment to</label>
      <div className="flex gap-2">
        {(["A", "B", "C", "D"] as const).map(seg => (
          <button
            key={seg}
            onClick={() => onChange({ ...c, segment: seg })}
            className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-colors ${
              c.segment === seg
                ? "border-primary bg-primary/10 text-primary"
                : "border-surface-mid bg-surface-subtle text-on-surface-muted hover:bg-surface"
            }`}
          >
            {seg} {seg === "A" ? "🔥" : seg === "B" ? "🌡️" : seg === "C" ? "❄️" : "❌"}
          </button>
        ))}
      </div>
    </div>
  );

  if (step.step_type === "add_note") return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-on-surface-muted">Note content</label>
      <textarea
        className="w-full rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        rows={2}
        placeholder="e.g. Lead came from Facebook campaign"
        value={c.note || ""}
        onChange={e => onChange({ ...c, note: e.target.value })}
      />
    </div>
  );

  if (step.step_type === "send_webhook") return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-on-surface-muted">Webhook URL</label>
      <input
        className="w-full rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-mono"
        placeholder="https://hooks.zapier.com/..."
        value={c.url || ""}
        onChange={e => onChange({ ...c, url: e.target.value })}
      />
      <p className="text-[11px] text-on-surface-muted">We&apos;ll POST lead_id, name, phone, segment, score, message to this URL.</p>
    </div>
  );

  if (step.step_type === "wait") return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-on-surface-muted">Wait duration</label>
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          className="w-24 rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="1"
          value={c.amount || ""}
          onChange={e => onChange({ ...c, amount: e.target.value })}
        />
        <select
          className="flex-1 rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
          value={c.unit || "minutes"}
          onChange={e => onChange({ ...c, unit: e.target.value })}
        >
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
      </div>
    </div>
  );

  if (step.step_type === "condition") return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-on-surface-muted">If…</label>
      <select
        className="w-full rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
        value={c.subject || "segment"}
        onChange={e => onChange({ ...c, subject: e.target.value })}
      >
        <option value="segment">Segment</option>
        <option value="score">Lead Score</option>
        <option value="channel">Channel (WhatsApp / Telegram / etc.)</option>
        <option value="message_content">Message Content</option>
      </select>
      <select
        className="w-full rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
        value={c.operator || "equals"}
        onChange={e => onChange({ ...c, operator: e.target.value })}
      >
        {c.subject === "score" ? (
          <>
            <option value="gte">is ≥</option>
            <option value="lte">is ≤</option>
            <option value="equals">equals</option>
          </>
        ) : c.subject === "message_content" ? (
          <>
            <option value="contains">contains</option>
            <option value="not_contains">does not contain</option>
          </>
        ) : (
          <>
            <option value="equals">equals</option>
            <option value="not_equals">does not equal</option>
          </>
        )}
      </select>
      <input
        className="w-full rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder={c.subject === "segment" ? "A, B, C, or D" : c.subject === "score" ? "7" : "value…"}
        value={c.value || ""}
        onChange={e => onChange({ ...c, value: e.target.value })}
      />
      <p className="text-[11px] text-on-surface-muted">Steps below will split into a YES branch and a NO branch.</p>
    </div>
  );

  return null;
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({
  step,
  onDelete,
  onUpdate,
}: {
  step: AutomationStep;
  onDelete: () => void;
  onUpdate: (s: AutomationStep) => void;
}) {
  const [expanded, setExpanded] = useState(!step.config || Object.keys(step.config).length === 0);
  const Icon = STEP_ICON[step.step_type] || Zap;
  const opt = STEP_OPTIONS.find(o => o.value === step.step_type);

  return (
    <div className={`rounded-2xl border bg-surface overflow-hidden ${step.branch === "yes" ? "border-emerald-200" : step.branch === "no" ? "border-red-200" : "border-surface-mid"}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center bg-surface-subtle`}>
          <Icon size={14} className={opt?.color || "text-on-surface-muted"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {step.branch && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${step.branch === "yes" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                {step.branch.toUpperCase()}
              </span>
            )}
            <span className="text-sm font-semibold text-on-surface">{opt?.label || step.step_type}</span>
          </div>
          {!expanded && (
            <p className="text-[11px] text-on-surface-muted truncate mt-0.5">{stepSummary(step)}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg hover:bg-red-50 text-on-surface-muted hover:text-red-500 transition-colors"
          >
            <Trash2 size={13} />
          </button>
          {expanded ? <ChevronUp size={14} className="text-on-surface-muted" /> : <ChevronDown size={14} className="text-on-surface-muted" />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-mid pt-3">
          <StepConfigEditor
            step={step}
            onChange={config => onUpdate({ ...step, config })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Add-step button ──────────────────────────────────────────────────────────

function AddStepButton({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-surface-mid text-on-surface-muted hover:border-primary hover:text-primary transition-colors text-sm"
      >
        <Plus size={14} /> Add Step
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 right-0 bg-surface border border-surface-mid rounded-2xl shadow-xl overflow-hidden">
          {STEP_OPTIONS.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => { onAdd(opt.value); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-subtle text-sm text-on-surface transition-colors text-left"
              >
                <Icon size={15} className={opt.color} />
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Trigger config ───────────────────────────────────────────────────────────

function TriggerConfig({
  trigger_type,
  trigger_config,
  onChange,
}: {
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  // useState must always be at the top — never inside a conditional
  const [kw, setKw] = useState("");

  if (trigger_type === "keyword_match") {
    const keywords: string[] = (trigger_config.keywords as string[]) || [];
    return (
      <div className="mt-3 space-y-2 border-t border-surface-mid pt-3">
        <label className="text-xs font-medium text-on-surface-muted">Keywords (any of these trigger the automation)</label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. pricing"
            value={kw}
            onChange={e => setKw(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && kw.trim()) {
                onChange({ ...trigger_config, keywords: [...keywords, kw.trim()] });
                setKw("");
              }
            }}
          />
          <button
            onClick={() => { if (kw.trim()) { onChange({ ...trigger_config, keywords: [...keywords, kw.trim()] }); setKw(""); } }}
            className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20"
          >Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((k, i) => (
            <span key={i} className="flex items-center gap-1 text-xs bg-surface-subtle border border-surface-mid rounded-full px-2.5 py-1">
              {k}
              <button onClick={() => onChange({ ...trigger_config, keywords: keywords.filter((_, j) => j !== i) })} className="text-on-surface-muted hover:text-red-500">×</button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <label className="text-xs text-on-surface-muted">Match type:</label>
          {["any", "all"].map(m => (
            <button
              key={m}
              onClick={() => onChange({ ...trigger_config, match_type: m })}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                (trigger_config.match_type || "any") === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-surface-mid text-on-surface-muted"
              }`}
            >{m === "any" ? "Any keyword" : "All keywords"}</button>
          ))}
        </div>
      </div>
    );
  }

  if (trigger_type === "segment_changed") {
    const segs = ["A", "B", "C", "D"];
    return (
      <div className="mt-3 border-t border-surface-mid pt-3 space-y-2">
        <label className="text-xs font-medium text-on-surface-muted">Fire when segment changes to (leave blank = any segment)</label>
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ ...trigger_config, to_segment: undefined })}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${!trigger_config.to_segment ? "border-primary bg-primary/10 text-primary" : "border-surface-mid text-on-surface-muted"}`}
          >Any</button>
          {segs.map(s => (
            <button
              key={s}
              onClick={() => onChange({ ...trigger_config, to_segment: s })}
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${trigger_config.to_segment === s ? "border-primary bg-primary/10 text-primary" : "border-surface-mid text-on-surface-muted"}`}
            >{s}</button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export default function AutomationBuilder({ initial }: { initial?: AutomationData }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name || "");
  const [triggerType, setTriggerType] = useState(initial?.trigger_type || "first_inbound_message");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(initial?.trigger_config || {});
  const [steps, setSteps] = useState<AutomationStep[]>(initial?.steps || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStep = useCallback((type: string, parent_step_id?: string, branch?: "yes" | "no") => {
    setSteps(prev => {
      const siblings = prev.filter(s => s.parent_step_id === (parent_step_id || null) && s.branch === (branch || null));
      return [...prev, {
        step_type: type,
        config: {},
        parent_step_id: parent_step_id || null,
        branch: branch || null,
        position: siblings.length,
      }];
    });
  }, []);

  const updateStep = useCallback((index: number, updated: AutomationStep) => {
    setSteps(prev => prev.map((s, i) => i === index ? updated : s));
  }, []);

  const deleteStep = useCallback((index: number) => {
    setSteps(prev => prev.filter((_, i) => i !== index));
  }, []);

  const save = async (activate: boolean) => {
    if (!name.trim()) { setError("Give this automation a name"); return; }
    setSaving(true);
    setError(null);
    try {
      const auth = await getAuthHeaders();
      const method = initial?.id ? "PATCH" : "POST";
      const url = initial?.id
        ? `${API_URL}/api/v1/automations/${initial.id}`
        : `${API_URL}/api/v1/automations/`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({
          name,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          active: activate,
          steps: steps.map((s, i) => ({ ...s, position: i })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const detail = json.detail;
        setError(Array.isArray(detail) ? detail.join("; ") : detail || "Failed to save");
        return;
      }
      router.push("/dashboard/automations");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // Render steps (root + condition branches inline)
  const rootSteps = steps.filter(s => !s.parent_step_id);
  const conditionSteps = steps.filter(s => s.parent_step_id);

  const renderStepList = (stepList: AutomationStep[], parentId?: string, branch?: "yes" | "no") => (
    <div className={`space-y-2 ${branch ? `pl-4 border-l-2 ${branch === "yes" ? "border-emerald-200" : "border-red-200"}` : ""}`}>
      {branch && (
        <p className={`text-[11px] font-bold uppercase tracking-wide ${branch === "yes" ? "text-emerald-600" : "text-red-500"}`}>
          {branch === "yes" ? "✓ Yes" : "✗ No"}
        </p>
      )}
      {stepList.map((step) => {
        const globalIndex = steps.indexOf(step);
        const isCondition = step.step_type === "condition";
        const yesChildren = conditionSteps.filter(s => s.parent_step_id === step.id && s.branch === "yes");
        const noChildren = conditionSteps.filter(s => s.parent_step_id === step.id && s.branch === "no");
        return (
          <div key={globalIndex} className="space-y-2">
            <StepCard
              step={step}
              onDelete={() => deleteStep(globalIndex)}
              onUpdate={updated => updateStep(globalIndex, updated)}
            />
            {isCondition && (
              <div className="ml-4 grid grid-cols-2 gap-3">
                {renderStepList(yesChildren, step.id || String(globalIndex), "yes")}
                {renderStepList(noChildren, step.id || String(globalIndex), "no")}
              </div>
            )}
          </div>
        );
      })}
      <AddStepButton onAdd={type => addStep(type, parentId, branch)} />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-surface-subtle text-on-surface-muted transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <input
            className="w-full text-xl font-bold bg-transparent text-on-surface border-b border-transparent hover:border-surface-mid focus:border-primary focus:outline-none pb-1 transition-colors"
            placeholder="Automation name…"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
      </div>

      {/* Trigger */}
      <div className="mb-6 p-4 rounded-2xl bg-surface border border-surface-mid">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
            <Zap size={14} className="text-violet-600" />
          </div>
          <span className="text-sm font-semibold text-on-surface">Trigger</span>
          <span className="text-[11px] text-on-surface-muted ml-1">— when does this run?</span>
        </div>
        <select
          className="w-full rounded-xl border border-surface-mid bg-surface-subtle px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
          value={triggerType}
          onChange={e => { setTriggerType(e.target.value); setTriggerConfig({}); }}
        >
          {TRIGGER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label} — {o.description}</option>
          ))}
        </select>
        <TriggerConfig
          trigger_type={triggerType}
          trigger_config={triggerConfig}
          onChange={setTriggerConfig}
        />
      </div>

      {/* Arrow */}
      <div className="flex justify-center mb-3">
        <div className="w-px h-6 bg-surface-mid" />
      </div>

      {/* Steps */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-on-surface-muted uppercase tracking-wide mb-3">Steps</p>
        {renderStepList(rootSteps)}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => save(false)}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-surface-mid text-sm font-medium text-on-surface hover:bg-surface-subtle transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save as Draft
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          Save & Activate
        </button>
      </div>
    </div>
  );
}
