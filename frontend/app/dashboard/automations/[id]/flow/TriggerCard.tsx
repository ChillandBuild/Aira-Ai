"use client";
import { Zap } from "lucide-react";
import { TRIGGER_LABELS } from "./blockMeta";
import type { TriggerConfig, TriggerType } from "./types";

interface TriggerCardProps {
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  onChange: (config: TriggerConfig) => void;
}

const inputClass =
  "w-full px-3 py-2 rounded-xl bg-surface border border-surface-mid text-sm text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors";

export default function TriggerCard({ triggerType, triggerConfig, onChange }: TriggerCardProps) {
  return (
    <div className="rounded-2xl bg-primary-light border-2 border-primary/20 p-4">
      <div className="flex items-center gap-3">
        <span className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-primary text-white">
          <Zap size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-muted">When this happens</p>
          <p className="text-sm font-semibold text-on-surface">{TRIGGER_LABELS[triggerType]}</p>
        </div>
      </div>

      {triggerType === "keyword_match" && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-on-surface mb-1.5">Keywords (comma-separated)</label>
          <input
            className={inputClass}
            value={(triggerConfig.keywords || []).join(", ")}
            placeholder="price, demo, buy"
            onChange={(e) =>
              onChange({
                ...triggerConfig,
                keywords: e.target.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
              })
            }
          />
        </div>
      )}

      {triggerType === "segment_changed" && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-on-surface mb-1.5">When segment becomes</label>
          <select
            className={inputClass}
            value={triggerConfig.to_segment || "A"}
            onChange={(e) => onChange({ ...triggerConfig, to_segment: e.target.value as "A" | "B" | "C" | "D" })}
          >
            <option value="A">A — Hot</option>
            <option value="B">B — Warm</option>
            <option value="C">C — Cold</option>
            <option value="D">D — Disqualified</option>
          </select>
        </div>
      )}

      {triggerType === "score_threshold" && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-on-surface mb-1.5">Score is at least</label>
          <input
            type="number"
            min={1}
            max={10}
            className={inputClass}
            value={triggerConfig.threshold ?? ""}
            placeholder="7"
            onChange={(e) => onChange({ ...triggerConfig, threshold: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </div>
      )}
    </div>
  );
}
