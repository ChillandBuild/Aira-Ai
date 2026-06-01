"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { BlockConfig, ConditionSubject, HttpMethod, InteractiveButton, ListRow, ListSection, SingleCondition, WaitUnit } from "../types";
import { newButtonId } from "../blockMeta";
import { API_URL, getAuthHeaders } from "@/lib/api";

export interface FormProps {
  config: BlockConfig;
  patch: (next: Partial<BlockConfig>) => void;
}

const VAR_HINT = "Use {{name}}, {{phone}}, or any saved variable to personalize.";
const MAX_BUTTONS = 3;

// ── Field primitives ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-on-surface mb-1.5">{children}</label>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-on-surface-muted">{children}</p>;
}

const inputClass =
  "w-full px-3 py-2 rounded-xl bg-surface border border-surface-mid text-sm text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}

function TextField({ label, value, onChange, placeholder, hint }: TextFieldProps) {
  return (
    <div>
      <Label>{label}</Label>
      <input className={inputClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  placeholder?: string;
  min?: number;
}

function NumberField({ label, value, onChange, placeholder, min }: NumberFieldProps) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        min={min}
        className={inputClass}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
  return (
    <div>
      <Label>{label}</Label>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Per-type forms ────────────────────────────────────────────────────────────

export function TextForm({ config, patch }: FormProps) {
  return (
    <div>
      <Label>Message</Label>
      <textarea
        className={`${inputClass} min-h-[140px] resize-y`}
        value={config.message || ""}
        placeholder="Hi {{name}}, thanks for reaching out!"
        onChange={(e) => patch({ message: e.target.value })}
      />
      <Hint>{VAR_HINT}</Hint>
    </div>
  );
}

export function MediaForm({ config, patch, kind }: FormProps & { kind: "image" | "video" }) {
  return (
    <>
      <TextField
        label={`${kind === "image" ? "Image" : "Video"} URL`}
        value={config.url || ""}
        placeholder="https://…"
        onChange={(v) => patch({ url: v })}
      />
      <TextField
        label="Caption (optional)"
        value={config.caption || ""}
        placeholder="Add a caption"
        onChange={(v) => patch({ caption: v })}
        hint={VAR_HINT}
      />
    </>
  );
}

export function FileForm({ config, patch }: FormProps) {
  return (
    <>
      <TextField label="File URL" value={config.url || ""} placeholder="https://…/document.pdf" onChange={(v) => patch({ url: v })} />
      <TextField label="Filename (optional)" value={config.filename || ""} placeholder="brochure.pdf" onChange={(v) => patch({ filename: v })} />
      <TextField label="Caption (optional)" value={config.caption || ""} placeholder="Add a caption" onChange={(v) => patch({ caption: v })} hint={VAR_HINT} />
    </>
  );
}

export function LocationForm({ config, patch }: FormProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Latitude" value={config.latitude} placeholder="13.0827" onChange={(v) => patch({ latitude: v })} />
        <NumberField label="Longitude" value={config.longitude} placeholder="80.2707" onChange={(v) => patch({ longitude: v })} />
      </div>
      <TextField label="Name (optional)" value={config.name || ""} placeholder="Our office" onChange={(v) => patch({ name: v })} />
      <TextField label="Address (optional)" value={config.address || ""} placeholder="123 Main St" onChange={(v) => patch({ address: v })} />
    </>
  );
}

export function CtaForm({ config, patch }: FormProps) {
  return (
    <>
      <div>
        <Label>Message body</Label>
        <textarea
          className={`${inputClass} min-h-[100px] resize-y`}
          value={config.body || ""}
          placeholder="Check out our latest offer 👇"
          onChange={(e) => patch({ body: e.target.value })}
        />
        <Hint>{VAR_HINT}</Hint>
      </div>
      <TextField label="Button text" value={config.button_text || ""} placeholder="View offer" onChange={(v) => patch({ button_text: v })} />
      <TextField label="Button URL" value={config.button_url || ""} placeholder="https://…" onChange={(v) => patch({ button_url: v })} />
    </>
  );
}

export function TemplateForm({ config, patch }: FormProps) {
  return (
    <>
      <TextField
        label="Template name"
        value={config.template_name || ""}
        placeholder="welcome_offer"
        onChange={(v) => patch({ template_name: v })}
        hint="Must match an approved WhatsApp template name."
      />
      <SelectField
        label="Language"
        value={config.language_code || "en"}
        options={[
          { value: "en", label: "English" },
          { value: "ta", label: "Tamil" },
          { value: "hi", label: "Hindi" },
          { value: "te", label: "Telugu" },
        ]}
        onChange={(v) => patch({ language_code: v })}
      />
      <div>
        <Label>Parameters (optional)</Label>
        <input
          className={inputClass}
          value={(config.params || []).join(", ")}
          placeholder="{{name}}, 20%"
          onChange={(e) =>
            patch({ params: e.target.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0) })
          }
        />
        <Hint>Comma-separated, in order. {VAR_HINT}</Hint>
      </div>
    </>
  );
}

export function WaitForm({ config, patch }: FormProps) {
  const units: { value: WaitUnit; label: string }[] = [
    { value: "minutes", label: "Minutes" },
    { value: "hours", label: "Hours" },
    { value: "days", label: "Days" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField label="Amount" value={config.amount} min={1} placeholder="1" onChange={(v) => patch({ amount: v })} />
      <SelectField label="Unit" value={config.unit || "hours"} options={units} onChange={(v) => patch({ unit: v })} />
    </div>
  );
}

const SUBJECT_OPTIONS: { value: ConditionSubject; label: string }[] = [
  { value: "segment", label: "Lead segment" },
  { value: "score", label: "Lead score" },
  { value: "channel", label: "Channel" },
  { value: "message_content", label: "Last message" },
];

// Operator tokens must match automation_engine.py _evaluate_condition exactly.
const OPERATORS_BY_SUBJECT: Record<ConditionSubject, { value: string; label: string }[]> = {
  segment: [{ value: "equals", label: "is" }, { value: "not_equals", label: "is not" }],
  score: [
    { value: "gte", label: "is at least" },
    { value: "lte", label: "is at most" },
    { value: "eq", label: "equals" },
  ],
  channel: [{ value: "equals", label: "is" }, { value: "not_equals", label: "is not" }],
  message_content: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
  ],
};

function SingleConditionRow({
  cond,
  onChange,
}: {
  cond: SingleCondition;
  onChange: (next: Partial<SingleCondition>) => void;
}) {
  const subject = (cond.subject || "segment") as ConditionSubject;
  const operators = OPERATORS_BY_SUBJECT[subject];
  const onSubjectChange = (next: ConditionSubject) => {
    onChange({ subject: next, operator: OPERATORS_BY_SUBJECT[next][0].value, value: next === "segment" ? "A" : "" });
  };
  return (
    <div className="space-y-2">
      <SelectField label="If…" value={subject} options={SUBJECT_OPTIONS} onChange={onSubjectChange} />
      <SelectField
        label="Operator"
        value={cond.operator || operators[0].value}
        options={operators}
        onChange={(v) => onChange({ operator: v })}
      />
      {subject === "segment" ? (
        <SelectField
          label="Segment"
          value={cond.value || "A"}
          options={[{ value: "A", label: "A — Hot" }, { value: "B", label: "B — Warm" }, { value: "C", label: "C — Cold" }, { value: "D", label: "D — Disqualified" }]}
          onChange={(v) => onChange({ value: v })}
        />
      ) : subject === "channel" ? (
        <SelectField
          label="Channel"
          value={cond.value || "whatsapp"}
          options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "instagram", label: "Instagram" }, { value: "facebook", label: "Facebook" }, { value: "telegram", label: "Telegram" }]}
          onChange={(v) => onChange({ value: v })}
        />
      ) : subject === "score" ? (
        <NumberField label="Score (1–10)" value={cond.value ? Number(cond.value) : undefined} min={1} placeholder="7" onChange={(v) => onChange({ value: String(v) })} />
      ) : (
        <TextField label="Text" value={cond.value || ""} placeholder="interested" onChange={(v) => onChange({ value: v })} />
      )}
    </div>
  );
}

export function ConditionForm({ config, patch }: FormProps) {
  const isMulti = !!(config.conditions && config.conditions.length > 0);
  const conds: SingleCondition[] = config.conditions || [];
  const mode = config.condition_mode || "all";

  const switchToMulti = () => {
    const existing: SingleCondition = {
      subject: (config.subject || "segment") as ConditionSubject,
      operator: config.operator || "equals",
      value: config.value || "A",
    };
    patch({ conditions: [existing], condition_mode: "all", subject: undefined, operator: undefined, value: undefined });
  };

  const switchToSingle = () => {
    const first = conds[0];
    patch({
      conditions: undefined,
      condition_mode: undefined,
      subject: (first?.subject || "segment") as ConditionSubject,
      operator: first?.operator || "equals",
      value: first?.value || "A",
    });
  };

  const updateCond = (i: number, next: Partial<SingleCondition>) =>
    patch({ conditions: conds.map((c, idx) => idx === i ? { ...c, ...next } : c) });

  const addCond = () =>
    patch({ conditions: [...conds, { subject: "segment" as ConditionSubject, operator: "equals", value: "A" }] });

  const removeCond = (i: number) =>
    patch({ conditions: conds.filter((_, idx) => idx !== i) });

  if (isMulti) {
    return (
      <>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <SelectField
              label="Match mode"
              value={mode}
              options={[
                { value: "all", label: "All conditions must match" },
                { value: "any", label: "Any condition must match" },
              ]}
              onChange={(v) => patch({ condition_mode: v as "all" | "any" })}
            />
          </div>
          <button type="button" onClick={switchToSingle} className="mb-1 px-3 py-2 text-xs text-on-surface-muted hover:text-primary transition-colors rounded-lg hover:bg-surface-low">
            Simple
          </button>
        </div>
        {conds.map((c, i) => (
          <div key={i} className="border border-surface-mid rounded-xl p-3 space-y-2">
            <SingleConditionRow cond={c} onChange={(next) => updateCond(i, next)} />
            <button
              type="button"
              onClick={() => removeCond(i)}
              disabled={conds.length <= 1}
              className="text-xs text-red-500 disabled:opacity-30 hover:underline"
            >
              Remove condition
            </button>
          </div>
        ))}
        <button type="button" onClick={addCond} className={`${ghostBtnClass} mt-1`}>
          <Plus size={14} /> Add condition
        </button>
      </>
    );
  }

  // Single-condition mode (legacy)
  const subject = (config.subject || "segment") as ConditionSubject;
  const operators = OPERATORS_BY_SUBJECT[subject];
  const onSubjectChange = (next: ConditionSubject) => {
    patch({ subject: next, operator: OPERATORS_BY_SUBJECT[next][0].value, value: next === "segment" ? "A" : "" });
  };

  return (
    <>
      <SelectField label="If…" value={subject} options={SUBJECT_OPTIONS} onChange={onSubjectChange} />
      <SelectField
        label="Operator"
        value={config.operator || operators[0].value}
        options={operators}
        onChange={(v) => patch({ operator: v })}
      />
      {subject === "segment" ? (
        <SelectField
          label="Segment"
          value={config.value || "A"}
          options={[{ value: "A", label: "A — Hot" }, { value: "B", label: "B — Warm" }, { value: "C", label: "C — Cold" }, { value: "D", label: "D — Disqualified" }]}
          onChange={(v) => patch({ value: v })}
        />
      ) : subject === "channel" ? (
        <SelectField
          label="Channel"
          value={config.value || "whatsapp"}
          options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "instagram", label: "Instagram" }, { value: "facebook", label: "Facebook" }, { value: "telegram", label: "Telegram" }]}
          onChange={(v) => patch({ value: v })}
        />
      ) : subject === "score" ? (
        <NumberField label="Score (1–10)" value={config.value ? Number(config.value) : undefined} min={1} placeholder="7" onChange={(v) => patch({ value: String(v) })} />
      ) : (
        <TextField label="Text" value={config.value || ""} placeholder="interested" onChange={(v) => patch({ value: v })} />
      )}
      <button type="button" onClick={switchToMulti} className={`${ghostBtnClass} mt-1`}>
        <Plus size={14} /> Add another condition
      </button>
    </>
  );
}

// ── Phase-2 forms ─────────────────────────────────────────────────────────────

const ghostBtnClass =
  "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-surface-mid text-xs font-medium text-on-surface-muted hover:text-on-surface hover:border-primary/40 transition-colors";

export function UserInputForm({ config, patch }: FormProps) {
  const mode = config.mode || "text";
  const choices: string[] = config.choices || [];

  return (
    <>
      <SelectField
        label="Input type"
        value={mode}
        options={[
          { value: "text", label: "Free text" },
          { value: "multiple_choice", label: "Multiple choice" },
        ]}
        onChange={(v) => patch({ mode: v as "text" | "multiple_choice" })}
      />
      <div>
        <Label>Question to ask</Label>
        <textarea
          className={`${inputClass} min-h-[100px] resize-y`}
          value={config.prompt || ""}
          placeholder={mode === "multiple_choice" ? "Please choose one of the options:" : "What's your budget range?"}
          onChange={(e) => patch({ prompt: e.target.value })}
        />
        <Hint>{VAR_HINT}</Hint>
      </div>
      {mode === "multiple_choice" && (
        <div>
          <Label>Choices</Label>
          <div className="space-y-2">
            {choices.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={inputClass}
                  value={c}
                  placeholder={`Option ${i + 1}`}
                  onChange={(e) => patch({ choices: choices.map((x, j) => j === i ? e.target.value : x) })}
                />
                <button
                  type="button"
                  onClick={() => patch({ choices: choices.filter((_, j) => j !== i) })}
                  disabled={choices.length <= 1}
                  className="shrink-0 p-2 rounded-lg text-on-surface-muted hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  aria-label="Remove choice"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => patch({ choices: [...choices, ""] })} className={`${ghostBtnClass} mt-2`}>
            <Plus size={14} /> Add choice
          </button>
          <Hint>The lead&apos;s reply (a number or the text) is saved to the variable below.</Hint>
        </div>
      )}
      <TextField
        label="Save reply as"
        value={config.save_as || ""}
        placeholder="budget"
        onChange={(v) => patch({ save_as: v })}
        hint={`The lead's reply is stored in this variable — reference it later as {{${config.save_as || "budget"}}}.`}
      />
    </>
  );
}

export function InteractiveForm({ config, patch }: FormProps) {
  const buttons: InteractiveButton[] = config.buttons || [];

  const setButton = (id: string, title: string) =>
    patch({ buttons: buttons.map((b) => (b.id === id ? { ...b, title } : b)) });

  const addButton = () => {
    if (buttons.length >= MAX_BUTTONS) return;
    patch({ buttons: [...buttons, { id: newButtonId(), title: "" }] });
  };

  const removeButton = (id: string) =>
    patch({ buttons: buttons.filter((b) => b.id !== id) });

  return (
    <>
      <div>
        <Label>Message body</Label>
        <textarea
          className={`${inputClass} min-h-[100px] resize-y`}
          value={config.body || ""}
          placeholder="How can we help you today?"
          onChange={(e) => patch({ body: e.target.value })}
        />
        <Hint>{VAR_HINT}</Hint>
      </div>

      <div>
        <Label>Buttons</Label>
        <div className="space-y-2">
          {buttons.map((b, i) => (
            <div key={b.id} className="flex items-center gap-2">
              <input
                className={inputClass}
                value={b.title}
                placeholder={`Button ${i + 1}`}
                maxLength={20}
                onChange={(e) => setButton(b.id, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeButton(b.id)}
                disabled={buttons.length <= 1}
                className="shrink-0 p-2 rounded-lg text-on-surface-muted hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                aria-label="Remove button"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        {buttons.length < MAX_BUTTONS && (
          <button type="button" onClick={addButton} className={`${ghostBtnClass} mt-2`}>
            <Plus size={14} />
            Add button
          </button>
        )}
        <Hint>Each button opens its own branch lane. WhatsApp allows up to {MAX_BUTTONS} buttons (max 20 chars each).</Hint>
      </div>

      <TextField
        label="Save choice as (optional)"
        value={config.save_as || ""}
        placeholder="menu_choice"
        onChange={(v) => patch({ save_as: v })}
        hint="Stores which button the lead tapped, e.g. {{menu_choice}}."
      />
    </>
  );
}

const HTTP_METHODS: { value: HttpMethod; label: string }[] = [
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "PATCH", label: "PATCH" },
  { value: "DELETE", label: "DELETE" },
];

export function HttpApiForm({ config, patch }: FormProps) {
  const method = config.method || "GET";
  const headers = config.headers || {};
  const headerRows = Object.entries(headers);
  const hasBody = method !== "GET" && method !== "DELETE";

  const setHeaders = (next: [string, string][]) => {
    const obj: Record<string, string> = {};
    for (const [k, v] of next) if (k.trim()) obj[k] = v;
    patch({ headers: obj });
  };

  const updateHeader = (idx: number, key: string, value: string) => {
    const next = headerRows.map((row, i) => (i === idx ? ([key, value] as [string, string]) : row));
    setHeaders(next);
  };
  const addHeader = () => setHeaders([...headerRows, ["", ""]]);
  const removeHeader = (idx: number) => setHeaders(headerRows.filter((_, i) => i !== idx));

  return (
    <>
      <div className="grid grid-cols-[110px_1fr] gap-3">
        <SelectField label="Method" value={method} options={HTTP_METHODS} onChange={(v) => patch({ method: v })} />
        <TextField label="URL" value={config.url || ""} placeholder="https://api.example.com/lookup" onChange={(v) => patch({ url: v })} hint={VAR_HINT} />
      </div>

      <div>
        <Label>Headers (optional)</Label>
        <div className="space-y-2">
          {headerRows.map(([k, v], i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={inputClass} value={k} placeholder="Authorization" onChange={(e) => updateHeader(i, e.target.value, v)} />
              <input className={inputClass} value={v} placeholder="Bearer …" onChange={(e) => updateHeader(i, k, e.target.value)} />
              <button
                type="button"
                onClick={() => removeHeader(i)}
                className="shrink-0 p-2 rounded-lg text-on-surface-muted hover:bg-red-50 hover:text-red-500 transition-colors"
                aria-label="Remove header"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addHeader} className={`${ghostBtnClass} mt-2`}>
          <Plus size={14} />
          Add header
        </button>
      </div>

      {hasBody && (
        <div>
          <Label>Request body (optional)</Label>
          <textarea
            className={`${inputClass} min-h-[90px] resize-y font-mono text-xs`}
            value={config.body || ""}
            placeholder='{"phone": "{{phone}}"}'
            onChange={(e) => patch({ body: e.target.value })}
          />
          <Hint>{VAR_HINT}</Hint>
        </div>
      )}

      <TextField
        label="Extract field (optional)"
        value={config.json_path || ""}
        placeholder="data.score"
        onChange={(v) => patch({ json_path: v })}
        hint="Dot path into the JSON response. Leave blank to save the whole response."
      />
      <TextField
        label="Save result as"
        value={config.save_as || ""}
        placeholder="api_result"
        onChange={(v) => patch({ save_as: v })}
        hint="Reference the result later as {{api_result}}."
      />
    </>
  );
}

export function RandomForm({ config, patch }: FormProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Min" value={config.min} placeholder="1" onChange={(v) => patch({ min: v })} />
        <NumberField label="Max" value={config.max} placeholder="100" onChange={(v) => patch({ max: v })} />
      </div>
      <TextField
        label="Save number as"
        value={config.save_as || ""}
        placeholder="lucky_number"
        onChange={(v) => patch({ save_as: v })}
        hint="Reference the number later as {{lucky_number}}."
      />
    </>
  );
}

// ── BotBiz forms ──────────────────────────────────────────────────────────────

export function AudioForm({ config, patch }: FormProps) {
  return (
    <TextField
      label="Audio URL"
      value={config.url || ""}
      placeholder="https://…/voice.ogg"
      onChange={(v) => patch({ url: v })}
      hint="WhatsApp supports OGG, AAC, MP3, AMR. Use a public https URL. Captions are not supported for audio."
    />
  );
}

function newRowId(): string {
  return `row_${Math.random().toString(36).slice(2, 7)}`;
}

export function ListMenuForm({ config, patch }: FormProps) {
  const sections: ListSection[] = config.sections || [];
  const totalRows = sections.reduce((n, s) => n + (s.rows?.length || 0), 0);

  const updateSection = (si: number, next: Partial<ListSection>) =>
    patch({ sections: sections.map((s, i) => i === si ? { ...s, ...next } : s) });

  const addSection = () =>
    patch({ sections: [...sections, { title: "", rows: [{ id: newRowId(), title: "", description: "" }] }] });

  const removeSection = (si: number) =>
    patch({ sections: sections.filter((_, i) => i !== si) });

  const addRow = (si: number) => {
    if (totalRows >= 10) return;
    patch({
      sections: sections.map((s, i) =>
        i === si ? { ...s, rows: [...(s.rows || []), { id: newRowId(), title: "", description: "" }] } : s
      ),
    });
  };

  const updateRow = (si: number, ri: number, next: Partial<ListRow>) =>
    patch({
      sections: sections.map((s, i) =>
        i === si ? { ...s, rows: (s.rows || []).map((r, j) => j === ri ? { ...r, ...next } : r) } : s
      ),
    });

  const removeRow = (si: number, ri: number) =>
    patch({
      sections: sections.map((s, i) =>
        i === si ? { ...s, rows: (s.rows || []).filter((_, j) => j !== ri) } : s
      ),
    });

  return (
    <>
      <div>
        <Label>Message body</Label>
        <textarea
          className={`${inputClass} min-h-[100px] resize-y`}
          value={config.body || ""}
          placeholder="Please choose an option below:"
          onChange={(e) => patch({ body: e.target.value })}
        />
        <Hint>{VAR_HINT}</Hint>
      </div>
      <TextField
        label="Button label"
        value={config.button_text || "Choose"}
        placeholder="Choose"
        onChange={(v) => patch({ button_text: v })}
        hint="The tap-to-open button text (max 20 chars)."
      />
      <div>
        <Label>Options ({totalRows}/10)</Label>
        <div className="space-y-3">
          {sections.map((sec, si) => (
            <div key={si} className="border border-surface-mid rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  className={inputClass}
                  value={sec.title}
                  placeholder={`Section ${si + 1} heading (optional)`}
                  onChange={(e) => updateSection(si, { title: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeSection(si)}
                  disabled={sections.length <= 1}
                  className="shrink-0 p-2 rounded-lg text-on-surface-muted hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  aria-label="Remove section"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {(sec.rows || []).map((row, ri) => (
                <div key={row.id} className="flex items-start gap-2 ml-2">
                  <div className="flex-1 space-y-1">
                    <input
                      className={inputClass}
                      value={row.title}
                      placeholder={`Option ${ri + 1}`}
                      onChange={(e) => updateRow(si, ri, { title: e.target.value })}
                    />
                    <input
                      className={inputClass}
                      value={row.description || ""}
                      placeholder="Description (optional)"
                      onChange={(e) => updateRow(si, ri, { description: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(si, ri)}
                    disabled={(sec.rows || []).length <= 1}
                    className="shrink-0 mt-1 p-2 rounded-lg text-on-surface-muted hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    aria-label="Remove option"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {totalRows < 10 && (
                <button type="button" onClick={() => addRow(si)} className={`${ghostBtnClass} ml-2 mt-1`}>
                  <Plus size={14} /> Add option
                </button>
              )}
            </div>
          ))}
        </div>
        {sections.length < 5 && totalRows < 10 && (
          <button type="button" onClick={addSection} className={`${ghostBtnClass} mt-2`}>
            <Plus size={14} /> Add section
          </button>
        )}
        <Hint>Up to 10 options total. The selected option&apos;s ID is saved to the variable below.</Hint>
      </div>
      <TextField
        label="Optional header"
        value={config.header || ""}
        placeholder="Choose a plan"
        onChange={(v) => patch({ header: v })}
      />
      <TextField
        label="Optional footer"
        value={config.footer || ""}
        placeholder="Tap to see options"
        onChange={(v) => patch({ footer: v })}
      />
      <TextField
        label="Save selection as"
        value={config.save_as || ""}
        placeholder="menu_choice"
        onChange={(v) => patch({ save_as: v })}
        hint="Reference as {{menu_choice}} in later steps."
      />
    </>
  );
}

export function AddLabelForm({ config, patch }: FormProps) {
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    getAuthHeaders().then((auth) =>
      fetch(`${API_URL}/api/v1/broadcast-tags/`, { headers: auth })
        .then((r) => r.json())
        .then((d) => setTags(d.data || []))
        .catch(() => {})
    );
  }, []);

  return (
    <>
      <div>
        <Label>Label</Label>
        <select
          className={inputClass}
          value={config.tag_id || ""}
          onChange={(e) => patch({ tag_id: e.target.value })}
        >
          <option value="">Select a label…</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <Hint>Manage labels in the Broadcast Tags section.</Hint>
      </div>
      <SelectField
        label="Action"
        value={(config.action as "add" | "remove") || "add"}
        options={[
          { value: "add", label: "Add label to lead" },
          { value: "remove", label: "Remove label from lead" },
        ]}
        onChange={(v) => patch({ action: v as "add" | "remove" })}
      />
    </>
  );
}

export function CatalogForm({ config, patch }: FormProps) {
  const ids = (config.product_ids || []).join(", ");
  return (
    <>
      <div>
        <Label>Message body</Label>
        <textarea
          className={`${inputClass} min-h-[80px] resize-y`}
          value={config.body || ""}
          placeholder="Check out our products!"
          onChange={(e) => patch({ body: e.target.value })}
        />
        <Hint>{VAR_HINT}</Hint>
      </div>
      <TextField
        label="Catalog ID"
        value={config.catalog_id || ""}
        placeholder="123456789"
        onChange={(v) => patch({ catalog_id: v })}
        hint="Find this in your Meta Commerce Manager settings."
      />
      <TextField
        label="Section title"
        value={config.section_title || "Products"}
        placeholder="Products"
        onChange={(v) => patch({ section_title: v })}
      />
      <div>
        <Label>Product IDs (comma-separated)</Label>
        <input
          className={inputClass}
          value={ids}
          placeholder="SKU-001, SKU-002, SKU-003"
          onChange={(e) =>
            patch({ product_ids: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
          }
        />
        <Hint>Retailer product IDs from your catalog. Up to 30.</Hint>
      </div>
    </>
  );
}

const AGENT_TOOLS: { id: string; label: string; desc: string }[] = [
  { id: "update_segment", label: "Re-segment lead", desc: "Move the lead to A/B/C/D" },
  { id: "add_note", label: "Add a note", desc: "Log context for a human" },
  { id: "assign_to_caller", label: "Assign to caller", desc: "Route to a telecaller" },
];
const MAX_OUTCOMES = 5;

export function AgentForm({ config, patch }: FormProps) {
  const outcomes: string[] = config.outcomes && config.outcomes.length ? config.outcomes : [""];
  const tools: string[] = config.tools || [];

  const setOutcome = (i: number, v: string) =>
    patch({ outcomes: outcomes.map((o, idx) => (idx === i ? v : o)) });
  const addOutcome = () => {
    if (outcomes.length >= MAX_OUTCOMES) return;
    patch({ outcomes: [...outcomes, ""] });
  };
  const removeOutcome = (i: number) =>
    patch({ outcomes: outcomes.filter((_, idx) => idx !== i) });
  const toggleTool = (id: string) =>
    patch({ tools: tools.includes(id) ? tools.filter((t) => t !== id) : [...tools, id] });

  return (
    <>
      <div>
        <Label>Goal</Label>
        <textarea
          className={`${inputClass} min-h-[90px] resize-y`}
          value={config.goal || ""}
          placeholder="Qualify the lead, answer their questions, and decide if they're ready to buy."
          onChange={(e) => patch({ goal: e.target.value })}
        />
        <Hint>Describe what the AI should achieve in plain language. It converses until it reaches an outcome.</Hint>
      </div>

      <div>
        <Label>Outcomes (each becomes a branch)</Label>
        <div className="space-y-2">
          {outcomes.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={inputClass}
                value={o}
                placeholder={i === 0 ? "qualified" : "not_interested"}
                onChange={(e) => setOutcome(i, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeOutcome(i)}
                disabled={outcomes.length <= 1}
                className="shrink-0 p-2 rounded-lg text-on-surface-muted hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                aria-label="Remove outcome"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        {outcomes.length < MAX_OUTCOMES && (
          <button type="button" onClick={addOutcome} className={`${ghostBtnClass} mt-2`}>
            <Plus size={14} />
            Add outcome
          </button>
        )}
        <Hint>The AI must end on one of these. Each opens its own branch lane below the block.</Hint>
      </div>

      <div>
        <Label>Tools the AI may use</Label>
        <div className="space-y-1.5">
          {AGENT_TOOLS.map((t) => (
            <label key={t.id} className="flex items-start gap-2.5 p-2.5 rounded-xl border border-surface-mid cursor-pointer hover:border-primary/40 transition-colors">
              <input
                type="checkbox"
                checked={tools.includes(t.id)}
                onChange={() => toggleTool(t.id)}
                className="mt-0.5 accent-primary"
              />
              <span>
                <span className="block text-xs font-medium text-on-surface">{t.label}</span>
                <span className="block text-[11px] text-on-surface-muted">{t.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-surface-mid">
        <span>
          <span className="block text-xs font-medium text-on-surface">Use knowledge base</span>
          <span className="block text-[11px] text-on-surface-muted">Let the AI answer questions from your KB</span>
        </span>
        <input
          type="checkbox"
          checked={config.use_knowledge !== false}
          onChange={(e) => patch({ use_knowledge: e.target.checked })}
          className="accent-primary w-4 h-4"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Max turns"
          value={config.max_turns}
          placeholder="6"
          min={1}
          onChange={(v) => patch({ max_turns: v })}
        />
        <TextField
          label="Save outcome as"
          value={config.output_var || ""}
          placeholder="agent_outcome"
          onChange={(v) => patch({ output_var: v })}
        />
      </div>
      <Hint>Max turns caps the back-and-forth (safety). The chosen outcome is saved as {`{{${config.output_var || "agent_outcome"}}}`}.</Hint>
    </>
  );
}
