"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, Check, X, GitBranch } from "lucide-react";
import { Lane, type LaneCallbacks } from "./FlowCanvas";
import { lanesOf, type FlowNode, type LaneSpec } from "./types";

interface BranchGroupProps extends LaneCallbacks {
  node: FlowNode;
}

// Visual treatment per lane. Condition keeps the yes=green / no=grey semantics;
// interactive button lanes share a neutral indigo accent.
function laneStyle(node: FlowNode, spec: LaneSpec) {
  if (node.step_type === "condition") {
    const isYes = spec.key === "yes";
    return {
      wrap: isYes
        ? "rounded-2xl bg-emerald-50/40 border border-emerald-100 p-2.5"
        : "rounded-2xl bg-surface-low border border-surface-mid p-2.5",
      chip: isYes ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500",
      icon: isYes ? <Check size={11} /> : <X size={11} />,
    };
  }
  return {
    wrap: "rounded-2xl bg-indigo-50/40 border border-indigo-100 p-2.5",
    chip: "bg-indigo-100 text-indigo-700",
    icon: <GitBranch size={11} />,
  };
}

export default function BranchGroup({ node, ...cb }: BranchGroupProps) {
  const lanes = lanesOf(node);
  const total = lanes.reduce((n, l) => n + (node.branches[l.key]?.length ?? 0), 0);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="my-1 ml-3 pl-4 border-l-2 border-orange-200">
      {total > 0 && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 mb-1 text-[11px] font-medium text-on-surface-muted hover:text-on-surface transition-colors"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          {collapsed ? `${total} block${total === 1 ? "" : "s"} in branches` : "Branches"}
        </button>
      )}

      {!collapsed && (
        <div className="flex flex-col gap-3">
          {lanes.map((spec) => {
            const nodes = node.branches[spec.key] ?? [];
            const s = laneStyle(node, spec);
            return (
              <div key={spec.key} className={s.wrap}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.chip}`}>
                    {s.icon}
                    {spec.label}
                  </span>
                  {nodes.length > 0 && (
                    <span className="text-[10px] text-on-surface-muted">
                      {nodes.length} block{nodes.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <Lane
                  nodes={nodes}
                  parentId={node.id}
                  branch={spec.key}
                  emptyLabel={`Add to “${spec.label}”`}
                  {...cb}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
