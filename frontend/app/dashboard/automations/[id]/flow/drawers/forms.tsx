"use client";
import type { BlockConfig, ConditionSubject, WaitUnit } from "../types";

export interface FormProps {
  config: BlockConfig;
  patch: (next: Partial<BlockConfig>) => void;
}

const VAR_HINT = "Use {{name}} or {{phone}} to personalize.";

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

export function ConditionForm({ config, patch }: FormProps) {
  const subject = (config.subject || "segment") as ConditionSubject;
  const operators = OPERATORS_BY_SUBJECT[subject];

  const onSubjectChange = (next: ConditionSubject) => {
    const op = OPERATORS_BY_SUBJECT[next][0].value;
    const value = next === "segment" ? "A" : "";
    patch({ subject: next, operator: op, value });
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
          options={[
            { value: "A", label: "A — Hot" },
            { value: "B", label: "B — Warm" },
            { value: "C", label: "C — Cold" },
            { value: "D", label: "D — Disqualified" },
          ]}
          onChange={(v) => patch({ value: v })}
        />
      ) : subject === "channel" ? (
        <SelectField
          label="Channel"
          value={config.value || "whatsapp"}
          options={[
            { value: "whatsapp", label: "WhatsApp" },
            { value: "instagram", label: "Instagram" },
            { value: "facebook", label: "Facebook" },
            { value: "telegram", label: "Telegram" },
          ]}
          onChange={(v) => patch({ value: v })}
        />
      ) : subject === "score" ? (
        <NumberField label="Score (1–10)" value={config.value ? Number(config.value) : undefined} min={1} placeholder="7" onChange={(v) => patch({ value: String(v) })} />
      ) : (
        <TextField label="Text" value={config.value || ""} placeholder="interested" onChange={(v) => patch({ value: v })} />
      )}
    </>
  );
}
