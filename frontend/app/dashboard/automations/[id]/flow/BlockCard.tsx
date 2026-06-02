"use client";
import { Pencil, Copy, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { BLOCK_META, blockSummary } from "./blockMeta";
import type { FlowNode } from "./types";

interface BlockCardProps {
  node: FlowNode;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

function StatsBadge({ node }: { node: FlowNode }) {
  if (node.sent_count === 0 && node.delivered_count === 0 && node.error_count === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium">
      <span className="text-on-surface-muted">{node.sent_count} sent</span>
      <span className="text-on-surface-muted/50">·</span>
      <span className="text-emerald-600">{node.delivered_count} delivered</span>
      {node.error_count > 0 && (
        <>
          <span className="text-on-surface-muted/50">·</span>
          <span className="text-red-500">{node.error_count} err</span>
        </>
      )}
    </div>
  );
}

function MoveControls({ canMoveUp, canMoveDown, onMoveUp, onMoveDown }: Pick<BlockCardProps, "canMoveUp" | "canMoveDown" | "onMoveUp" | "onMoveDown">) {
  return (
    <div className="flex flex-col">
      <button
        onClick={onMoveUp}
        disabled={!canMoveUp}
        className="p-0.5 rounded text-on-surface-muted hover:bg-surface-mid hover:text-on-surface disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
        aria-label="Move up"
      >
        <ChevronUp size={14} />
      </button>
      <button
        onClick={onMoveDown}
        disabled={!canMoveDown}
        className="p-0.5 rounded text-on-surface-muted hover:bg-surface-mid hover:text-on-surface disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
        aria-label="Move down"
      >
        <ChevronDown size={14} />
      </button>
    </div>
  );
}

function HoverActions({ onEdit, onDuplicate, onDelete }: Pick<BlockCardProps, "onEdit" | "onDuplicate" | "onDelete">) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <button onClick={onEdit} className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors" aria-label="Edit block">
        <Pencil size={14} />
      </button>
      <button onClick={onDuplicate} className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors" aria-label="Duplicate block">
        <Copy size={14} />
      </button>
      <button onClick={onDelete} className="p-1.5 rounded-lg text-on-surface-muted hover:bg-red-50 hover:text-red-500 transition-colors" aria-label="Delete block">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function BlockCard(props: BlockCardProps) {
  const { node, canMoveUp, canMoveDown, onEdit, onMoveUp, onMoveDown, dragHandleProps } = props;
  const meta = BLOCK_META[node.step_type];
  const Icon = meta.icon;
  const summary = blockSummary(node.step_type, node.config);

  // Wait renders as a slim pill.
  if (node.step_type === "wait") {
    return (
      <div className="group flex items-center justify-center gap-2">
        {dragHandleProps && (
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-on-surface-muted opacity-0 group-hover:opacity-100 transition-opacity touch-none">
            <GripVertical size={14} />
          </div>
        )}
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-mid border border-surface-mid text-on-surface-muted hover:text-on-surface hover:border-primary/30 transition-colors"
        >
          <Icon size={13} />
          <span className="text-xs font-medium">{summary}</span>
        </button>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
          <HoverActions onEdit={onEdit} onDuplicate={props.onDuplicate} onDelete={props.onDelete} />
          {!dragHandleProps && (
            <MoveControls canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex items-start gap-3 p-3.5 rounded-2xl bg-surface border border-surface-mid hover:border-primary/30 hover:shadow-sm transition-all">
      {dragHandleProps && (
        <div {...dragHandleProps} className="shrink-0 self-center cursor-grab active:cursor-grabbing text-on-surface-muted opacity-0 group-hover:opacity-100 transition-opacity touch-none">
          <GripVertical size={15} />
        </div>
      )}
      <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${meta.iconBg} ${meta.iconText}`}>
        <Icon size={17} />
      </span>
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <span className="block text-sm font-semibold text-on-surface">{meta.label}</span>
        <span className="block text-xs text-on-surface-muted truncate mt-0.5">{summary}</span>
        <StatsBadge node={node} />
      </button>
      <div className="flex items-start gap-1">
        <HoverActions onEdit={onEdit} onDuplicate={props.onDuplicate} onDelete={props.onDelete} />
        {!dragHandleProps && (
          <MoveControls canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />
        )}
      </div>
    </div>
  );
}
