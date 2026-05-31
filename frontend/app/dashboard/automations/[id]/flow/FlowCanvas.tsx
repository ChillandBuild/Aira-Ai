"use client";
import { Fragment } from "react";
import BlockCard from "./BlockCard";
import AddButton from "./AddButton";
import BranchGroup from "./BranchGroup";
import type { BlockConfig, BlockType, Branch, FlowNode, InsertTarget } from "./types";

export interface LaneCallbacks {
  onAdd: (type: BlockType, target: InsertTarget) => void;
  onEdit: (node: FlowNode) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (target: InsertTarget, dir: -1 | 1) => void;
  updateBlockConfig: (id: string, config: BlockConfig) => void;
}

interface LaneProps extends LaneCallbacks {
  nodes: FlowNode[];
  parentId: string | null;
  branch: Branch;
  emptyLabel?: string;
}

// Renders one ordered lane of blocks with insert affordances between each.
export function Lane({ nodes, parentId, branch, emptyLabel, ...cb }: LaneProps) {
  if (nodes.length === 0) {
    return (
      <div className="py-1">
        <AddButton
          target={{ parentId, branch, position: 0 }}
          onAdd={cb.onAdd}
          variant="first"
          firstLabel={emptyLabel || "Add block"}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <AddButton target={{ parentId, branch, position: 0 }} onAdd={cb.onAdd} />
      {nodes.map((node, idx) => (
        <Fragment key={node.id}>
          <BlockCard
            node={node}
            canMoveUp={idx > 0}
            canMoveDown={idx < nodes.length - 1}
            onEdit={() => cb.onEdit(node)}
            onDuplicate={() => cb.onDuplicate(node.id)}
            onDelete={() => cb.onDelete(node.id)}
            onMoveUp={() => cb.onMove({ parentId, branch, position: idx }, -1)}
            onMoveDown={() => cb.onMove({ parentId, branch, position: idx }, 1)}
          />
          {node.step_type === "condition" && <BranchGroup node={node} {...cb} />}
          <AddButton target={{ parentId, branch, position: idx + 1 }} onAdd={cb.onAdd} />
        </Fragment>
      ))}
    </div>
  );
}

interface FlowCanvasProps extends LaneCallbacks {
  tree: FlowNode[];
}

export default function FlowCanvas({ tree, ...cb }: FlowCanvasProps) {
  return <Lane nodes={tree} parentId={null} branch={null} emptyLabel="Add first block" {...cb} />;
}
