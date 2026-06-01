"use client";
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Zap } from "lucide-react";
import { TRIGGER_LABELS } from "../blockMeta";
import type { TriggerConfig, TriggerType } from "../types";

interface TriggerNodeData {
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
}

function TriggerNode({ data }: { data: TriggerNodeData }) {
  const { triggerType, triggerConfig } = data;

  let subtitle = "";
  if (triggerType === "keyword_match") {
    const kws = (triggerConfig.keywords || []).join(", ");
    subtitle = kws ? `"${kws}"` : "No keywords set";
  } else if (triggerType === "segment_changed") {
    subtitle = triggerConfig.to_segment ? `Segment → ${triggerConfig.to_segment}` : "Any segment";
  } else if (triggerType === "score_threshold") {
    subtitle = triggerConfig.threshold != null ? `Score ≥ ${triggerConfig.threshold}` : "Score threshold";
  }

  return (
    <div
      className="drag-handle rounded-2xl shadow-md cursor-grab active:cursor-grabbing"
      style={{
        width: 252,
        background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
      }}
    >
      <div className="flex items-center gap-2.5 px-3 py-3">
        <span className="shrink-0 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <Zap size={15} className="text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">
            Trigger
          </p>
          <p className="text-[13px] font-bold text-white leading-tight truncate">
            {TRIGGER_LABELS[triggerType] ?? triggerType}
          </p>
          {subtitle && (
            <p className="text-[11px] text-indigo-200 truncate mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="!w-3 !h-3 !bg-white !border-2 !border-indigo-400 !rounded-full !shadow-sm"
        style={{ bottom: -6 }}
      />
    </div>
  );
}

export default memo(TriggerNode);
