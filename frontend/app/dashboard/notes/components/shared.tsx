"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Tag, X } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { CallLog } from "@/lib/api";

// ─── Tag system ───────────────────────────────────────────────────────────────
export const PRESET_TAGS = [
  { label: "Follow-up", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { label: "Important", color: "bg-red-100 text-red-700 border-red-200" },
  { label: "Callback", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { label: "Pricing", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { label: "Visit", color: "bg-green-100 text-green-700 border-green-200" },
  { label: "Brochure", color: "bg-teal-100 text-teal-700 border-teal-200" },
  { label: "Not interested", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { label: "Hot lead", color: "bg-orange-100 text-orange-700 border-orange-200" },
];

export function tagStyle(label: string): string {
  const found = PRESET_TAGS.find((t) => t.label.toLowerCase() === label.toLowerCase());
  return found?.color ?? "bg-indigo-100 text-indigo-700 border-indigo-200";
}

// Keep-style pastel card backgrounds, keyed by a note's first tag
const TAG_CARD_BG: Record<string, string> = {
  "Follow-up": "bg-blue-50/70 border-blue-100",
  "Important": "bg-red-50/70 border-red-100",
  "Callback": "bg-amber-50/70 border-amber-100",
  "Pricing": "bg-purple-50/70 border-purple-100",
  "Visit": "bg-green-50/70 border-green-100",
  "Brochure": "bg-teal-50/70 border-teal-100",
  "Not interested": "bg-slate-100/70 border-slate-200",
  "Hot lead": "bg-orange-50/70 border-orange-100",
};
const DEFAULT_CARD_BG = "bg-white border-slate-200";
const PINNED_CARD_BG = "bg-amber-50/60 border-amber-200";

export function cardBgFor(note: { tags?: string[]; is_pinned: boolean }): string {
  if (note.is_pinned) return PINNED_CARD_BG;
  const tag = note.tags?.[0];
  if (tag && TAG_CARD_BG[tag]) return TAG_CARD_BG[tag];
  return DEFAULT_CARD_BG;
}

// ─── Segment badges ────────────────────────────────────────────────────────────
export const SEGMENT_COLORS: Record<string, string> = {
  A: "bg-rose-100 text-rose-600",
  B: "bg-indigo-50 text-indigo-700",
  C: "bg-blue-50 text-blue-600",
  D: "bg-slate-100 text-slate-500",
};
export const SEGMENT_LABELS: Record<string, string> = {
  A: "Hot", B: "Warm", C: "Cold", D: "Disqualified",
};

// ─── Tag chip + selector ────────────────────────────────────────────────────────
export function TagChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-label text-[10px] font-semibold ${tagStyle(label)}`}>
      {label}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70 transition-opacity">
          <X size={9} />
        </button>
      )}
    </span>
  );
}

export function TagSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  function toggle(label: string) {
    if (selected.includes(label)) {
      onChange(selected.filter((t) => t !== label));
    } else {
      onChange([...selected, label]);
    }
  }

  function addCustom() {
    const t = custom.trim();
    if (t && !selected.includes(t)) onChange([...selected, t]);
    setCustom("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 font-label text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
      >
        <Tag size={11} />
        {selected.length > 0 ? `${selected.length} tag${selected.length > 1 ? "s" : ""}` : "Add tags"}
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-30 w-56 bg-white rounded-xl shadow-lg border border-slate-200 p-3 space-y-2">
          <p className="font-label text-[10px] text-slate-400 uppercase tracking-wider">Select tags</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_TAGS.map((t) => (
              <button
                key={t.label}
                onClick={() => toggle(t.label)}
                className={`px-2 py-0.5 rounded-full border font-label text-[10px] font-semibold transition-all ${
                  selected.includes(t.label)
                    ? t.color + " ring-2 ring-offset-1 ring-current"
                    : "bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              placeholder="Custom tag…"
              className="flex-1 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 font-label text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button onClick={addCustom} className="px-2 py-1 rounded-lg bg-indigo-600 text-white font-label text-xs hover:bg-indigo-700">
              <Plus size={11} />
            </button>
          </div>
          <button onClick={() => setOpen(false)} className="w-full text-center font-label text-[10px] text-slate-400 hover:text-slate-700">Done</button>
        </div>
      )}
    </div>
  );
}

// ─── AI Call Summary card ───────────────────────────────────────────────────────
export function AiSummaryCard({ log }: { log: CallLog }) {
  const [open, setOpen] = useState(false);
  const s = log.ai_summary;
  if (!s) return null;
  const fields = Object.entries(s).filter(([, v]) => v);
  return (
    <div className="p-4 bg-white rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-label text-xs font-semibold text-slate-700">
            {timeAgo(log.created_at)}
            {log.duration_seconds != null && ` · ${log.duration_seconds}s`}
          </p>
          <p className="font-label text-xs text-slate-400 capitalize mt-0.5">
            {log.status}{log.outcome ? ` · ${log.outcome.replace("_", " ")}` : ""}
          </p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="p-1 rounded hover:bg-slate-100 transition-colors text-slate-400">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-1.5">
          {fields.map(([k, v]) => (
            <p key={k} className="font-body text-xs text-slate-600">
              <span className="font-semibold text-slate-800 capitalize">{k.replace("_", " ")}:</span> {v}
            </p>
          ))}
          {log.recording_url && (
            <audio controls src={log.recording_url} className="mt-2 w-full h-8" />
          )}
        </div>
      )}
    </div>
  );
}
