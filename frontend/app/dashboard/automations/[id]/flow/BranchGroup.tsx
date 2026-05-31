"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, Check, X } from "lucide-react";
import { Lane, type LaneCallbacks } from "./FlowCanvas";
import type { FlowNode } from "./types";

interface BranchGroupProps extends LaneCallbacks {
  node: FlowNode;
}

interface LaneHeaderProps {
  kind: "yes" | "no";
  count: number;
}

function LaneHeader({ kind, count }: LaneHeaderProps) {
  const isYes = kind === "yes";
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
          isYes ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
        }`}
      >
        {isYes ? <Check size={11} /> : <X size={11} />}
        {isYes ? "if yes" : "if no"}
      </span>
      {count > 0 && <span className="text-[10px] text-on-surface-muted">{count} block{count === 1 ? "" : "s"}</span>}
    </div>
  );
}

export default function BranchGroup({ node, ...cb }: BranchGroupProps) {
  const hasChildren = node.yes.length > 0 || node.no.length > 0;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="my-1 ml-3 pl-4 border-l-2 border-orange-200">
      {hasChildren && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 mb-1 text-[11px] font-medium text-on-surface-muted hover:text-on-surface transition-colors"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          {collapsed
            ? `${node.yes.length + node.no.length} block${node.yes.length + node.no.length === 1 ? "" : "s"} in branches`
            : "Branches"}
        </button>
      )}

      {!collapsed && (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl bg-emerald-50/40 border border-emerald-100 p-2.5">
            <LaneHeader kind="yes" count={node.yes.length} />
            <Lane nodes={node.yes} parentId={node.id} branch="yes" emptyLabel="Add to “if yes”" {...cb} />
          </div>
          <div className="rounded-2xl bg-surface-low border border-surface-mid p-2.5">
            <LaneHeader kind="no" count={node.no.length} />
            <Lane nodes={node.no} parentId={node.id} branch="no" emptyLabel="Add to “if no”" {...cb} />
          </div>
        </div>
      )}
    </div>
  );
}
