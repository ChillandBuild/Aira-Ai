"use client";
import { Fragment } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import BlockCard from "./BlockCard";
import AddButton from "./AddButton";
import BranchGroup from "./BranchGroup";
import { isBranching, type BlockConfig, type BlockType, type Branch, type FlowNode, type InsertTarget } from "./types";

export interface LaneCallbacks {
  onAdd: (type: BlockType, target: InsertTarget) => void;
  onEdit: (node: FlowNode) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (target: InsertTarget, dir: -1 | 1) => void;
  onReorder: (parentId: string | null, branch: Branch, from: number, to: number) => void;
  updateBlockConfig: (id: string, config: BlockConfig) => void;
}

// ── Sortable wrapper for a single lane item ───────────────────────────────────
function SortableLaneItem({
  node,
  idx,
  total,
  parentId,
  branch,
  cb,
}: {
  node: FlowNode;
  idx: number;
  total: number;
  parentId: string | null;
  branch: Branch;
  cb: LaneCallbacks;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: "relative",
        zIndex: isDragging ? 50 : undefined,
      }}
    >
      <BlockCard
        node={node}
        canMoveUp={idx > 0}
        canMoveDown={idx < total - 1}
        onEdit={() => cb.onEdit(node)}
        onDuplicate={() => cb.onDuplicate(node.id)}
        onDelete={() => cb.onDelete(node.id)}
        onMoveUp={() => cb.onMove({ parentId, branch, position: idx }, -1)}
        onMoveDown={() => cb.onMove({ parentId, branch, position: idx }, 1)}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLDivElement>}
      />
      {isBranching(node.step_type) && <BranchGroup node={node} {...cb} />}
    </div>
  );
}

// ── Lane ─────────────────────────────────────────────────────────────────────
interface LaneProps extends LaneCallbacks {
  nodes: FlowNode[];
  parentId: string | null;
  branch: Branch;
  emptyLabel?: string;
}

export function Lane({ nodes, parentId, branch, emptyLabel, ...cb }: LaneProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = nodes.findIndex((n) => n.id === active.id);
    const to = nodes.findIndex((n) => n.id === over.id);
    if (from !== -1 && to !== -1) cb.onReorder(parentId, branch, from, to);
  };

  if (nodes.length === 0) {
    // Root empty state — sidebar handles adding; branch empty state still needs the button.
    if (parentId === null) return null;
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

  // Root lane uses sidebar for adding — hide + buttons to reduce noise.
  // Branch lanes keep + buttons since sidebar only targets root.
  const showAddButtons = parentId !== null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={nodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col">
          {showAddButtons && <AddButton target={{ parentId, branch, position: 0 }} onAdd={cb.onAdd} />}
          {nodes.map((node, idx) => (
            <Fragment key={node.id}>
              <SortableLaneItem
                node={node}
                idx={idx}
                total={nodes.length}
                parentId={parentId}
                branch={branch}
                cb={cb}
              />
              {showAddButtons && <AddButton target={{ parentId, branch, position: idx + 1 }} onAdd={cb.onAdd} />}
            </Fragment>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ── Root canvas ───────────────────────────────────────────────────────────────
interface FlowCanvasProps extends LaneCallbacks {
  tree: FlowNode[];
}

export default function FlowCanvas({ tree, ...cb }: FlowCanvasProps) {
  return <Lane nodes={tree} parentId={null} branch={null} emptyLabel="Add first block" {...cb} />;
}
