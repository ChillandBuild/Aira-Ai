"use client";
import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Pencil, Copy, Trash2 } from "lucide-react";
import { BLOCK_META, blockSummary } from "../blockMeta";
import { isBranching, lanesOf } from "../types";
import type { BlockConfig, BlockType, FlowNode } from "../types";

interface BlockNodeData {
  step_type: BlockType;
  config: BlockConfig;
  sent_count: number;
  delivered_count: number;
  error_count: number;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

function BlockNode({ data, selected }: { data: BlockNodeData; selected: boolean }) {
  const [hovered, setHovered] = useState(false);
  const meta = BLOCK_META[data.step_type];
  const Icon = meta?.icon;
  const summary = meta ? blockSummary(data.step_type, data.config) : "";

  // Branching nodes have multiple output handles
  const node: FlowNode = {
    id: "dummy",
    step_type: data.step_type,
    config: data.config,
    sent_count: data.sent_count,
    delivered_count: data.delivered_count,
    error_count: data.error_count,
    branches: {},
  };
  const lanes = isBranching(data.step_type) ? lanesOf(node) : [];
  const hasStats = data.sent_count > 0 || data.delivered_count > 0 || data.error_count > 0;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative rounded-2xl bg-white shadow-md transition-all duration-150 ${
        selected
          ? "ring-2 ring-primary shadow-lg"
          : hovered
          ? "ring-1 ring-primary/30 shadow-lg"
          : "ring-1 ring-zinc-200/80"
      }`}
      style={{ width: 252, minHeight: 88 }}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="!w-3 !h-3 !bg-zinc-300 !border-2 !border-white !rounded-full !shadow-sm"
        style={{ top: -6 }}
      />

      {/* Header */}
      <div className={`drag-handle flex items-center gap-2.5 px-3 pt-3 pb-2 rounded-t-2xl cursor-grab active:cursor-grabbing`}>
        {Icon && (
          <span
            className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${meta.iconBg} ${meta.iconText}`}
          >
            <Icon size={15} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-zinc-900 leading-tight">{meta?.label}</p>
        </div>
        {/* Hover actions */}
        <div
          className={`flex items-center gap-0.5 transition-opacity duration-100 ${
            hovered ? "opacity-100" : "opacity-0"
          }`}
        >
          {data.onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); data.onEdit!(); }}
              className="p-1 rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
              aria-label="Edit"
            >
              <Pencil size={12} />
            </button>
          )}
          {data.onDuplicate && (
            <button
              onClick={(e) => { e.stopPropagation(); data.onDuplicate!(); }}
              className="p-1 rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
              aria-label="Duplicate"
            >
              <Copy size={12} />
            </button>
          )}
          {data.onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); data.onDelete!(); }}
              className="p-1 rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              aria-label="Delete"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 pb-3">
        <p className="text-[11px] text-zinc-500 leading-snug truncate">{summary || "Click to configure…"}</p>
        {hasStats && (
          <div className="mt-1.5 flex items-center gap-2 text-[10px]">
            <span className="text-zinc-400">{data.sent_count} sent</span>
            <span className="text-emerald-600">{data.delivered_count} delivered</span>
            {data.error_count > 0 && <span className="text-red-500">{data.error_count} err</span>}
          </div>
        )}
      </div>

      {/* Output handle(s) */}
      {lanes.length > 0 ? (
        <div className="absolute bottom-0 left-0 right-0 translate-y-1/2 flex justify-around px-4">
          {lanes.map((lane) => (
            <div key={lane.key} className="flex flex-col items-center gap-0.5">
              <Handle
                type="source"
                position={Position.Bottom}
                id={lane.key}
                className="!relative !w-3 !h-3 !bg-primary !border-2 !border-white !rounded-full !shadow-sm !translate-x-0 !translate-y-0 !left-auto !top-auto"
              />
              <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                {lane.label}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          id="out"
          className="!w-3 !h-3 !bg-zinc-300 !border-2 !border-white !rounded-full !shadow-sm"
          style={{ bottom: -6 }}
        />
      )}
    </div>
  );
}

export default memo(BlockNode);
