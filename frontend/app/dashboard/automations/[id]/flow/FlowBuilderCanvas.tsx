"use client";
import "@xyflow/react/dist/style.css";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import BlockNode from "./nodes/BlockNode";
import TriggerNode from "./nodes/TriggerNode";
import BlockConfigDrawer from "./drawers/BlockConfigDrawer";
import { TRIGGER_NODE_ID, newBlockNode, rfToSteps, stepsToRF } from "./rfUtils";
import { isBranching } from "./types";
import type { BlockConfig, BlockType, FlowNode, Step, TriggerConfig, TriggerType } from "./types";

// ── Node type registry ────────────────────────────────────────────────────────
const NODE_TYPES: NodeTypes = {
  blockNode: BlockNode as unknown as NodeTypes[string],
  triggerNode: TriggerNode as unknown as NodeTypes[string],
};

// ── Sidebar block type groups ─────────────────────────────────────────────────
const SEND_BLOCKS: { type: BlockType; label: string; color: string }[] = [
  { type: "send_message", label: "Text", color: "#10b981" },
  { type: "send_image", label: "Image", color: "#3b82f6" },
  { type: "send_audio", label: "Audio", color: "#ec4899" },
  { type: "send_video", label: "Video", color: "#8b5cf6" },
  { type: "send_file", label: "File", color: "#f59e0b" },
  { type: "send_location", label: "Location", color: "#ef4444" },
  { type: "cta_url", label: "Button URL", color: "#6366f1" },
  { type: "send_template", label: "Template", color: "#06b6d4" },
  { type: "send_list", label: "List Menu", color: "#10b981" },
  { type: "send_catalog", label: "Catalog", color: "#0891b2" },
];

const LOGIC_BLOCKS: { type: BlockType; label: string; color: string }[] = [
  { type: "condition", label: "Condition", color: "#f97316" },
  { type: "wait", label: "Delay", color: "#71717a" },
  { type: "user_input", label: "Ask Question", color: "#14b8a6" },
  { type: "interactive", label: "Buttons", color: "#d946ef" },
  { type: "ai_agent", label: "AI Agent", color: "#8b5cf6" },
];

const TOOL_BLOCKS: { type: BlockType; label: string; color: string }[] = [
  { type: "add_label", label: "Add Label", color: "#f59e0b" },
  { type: "http_api", label: "API Call", color: "#0ea5e9" },
  { type: "random", label: "Random", color: "#84cc16" },
];

interface DraggableSidebarItem {
  type: BlockType;
  label: string;
  color: string;
}

function SidebarItem({ type, label, color }: DraggableSidebarItem) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/reactflow-blocktype", type);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-zinc-200 cursor-grab active:cursor-grabbing hover:border-zinc-300 hover:shadow-sm transition-all select-none"
    >
      <span
        className="shrink-0 w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[12px] font-medium text-zinc-700 truncate">{label}</span>
    </div>
  );
}

function SidebarGroup({
  title,
  items,
}: {
  title: string;
  items: DraggableSidebarItem[];
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 px-1">
        {title}
      </p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <SidebarItem key={item.type} {...item} />
        ))}
      </div>
    </div>
  );
}

// ── Canvas inner (needs useReactFlow) ─────────────────────────────────────────
function CanvasInner({
  initialNodes,
  initialEdges,
  triggerType,
  triggerConfig,
  onChange,
}: {
  initialNodes: Node[];
  initialEdges: Edge[];
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  onChange: (nodes: Node[], edges: Edge[]) => void;
}) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Re-init when initial data changes (on load)
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  // Sync to parent on every change
  useEffect(() => {
    onChangeRef.current(nodes, edges);
  }, [nodes, edges]);

  // Update trigger node when trigger config changes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === TRIGGER_NODE_ID
          ? { ...n, data: { ...n.data, triggerType, triggerConfig } }
          : n,
      ),
    );
  }, [triggerType, triggerConfig]);

  // Inject callbacks into block nodes
  const nodesWithCallbacks = nodes.map((n) => {
    if (n.id === TRIGGER_NODE_ID) return n;
    return {
      ...n,
      data: {
        ...n.data,
        onEdit: () => setEditingNode(n),
        onDuplicate: () => duplicateNode(n.id),
        onDelete: () => deleteNode(n.id),
      },
    };
  });

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)),
    [],
  );
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((es) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            style: { stroke: "#94a3b8", strokeWidth: 1.5 },
            markerEnd: { type: "arrowclosed", color: "#94a3b8", width: 11, height: 11 },
          },
          es,
        ),
      ),
    [],
  );

  // Double-click node to edit
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id !== TRIGGER_NODE_ID) setEditingNode(node);
  }, []);

  // Drag-drop from sidebar
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/reactflow-blocktype") as BlockType;
      if (!type) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const newNode = newBlockNode(type, position);
      setNodes((ns) => [...ns, newNode]);
    },
    [screenToFlowPosition],
  );

  // Delete node + its downstream edges
  const deleteNode = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  }, []);

  // Duplicate node (keeps position offset)
  const duplicateNode = useCallback((id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const newNode = newBlockNode(
      (node.data as { step_type: BlockType }).step_type,
      { x: node.position.x + 40, y: node.position.y + 40 },
    );
    newNode.data = { ...node.data, ...newNode.data, sent_count: 0, delivered_count: 0, error_count: 0 };
    setNodes((ns) => [...ns, newNode]);
  }, [nodes]);

  // Save config from drawer
  const handleSaveConfig = useCallback(
    (config: BlockConfig) => {
      if (!editingNode) return;
      setNodes((ns) =>
        ns.map((n) =>
          n.id === editingNode.id ? { ...n, data: { ...n.data, config } } : n,
        ),
      );
      setEditingNode(null);
    },
    [editingNode],
  );

  // Build a FlowNode for the drawer (needs branches from current edges)
  const editingFlowNode: FlowNode | null = editingNode
    ? {
        id: editingNode.id,
        step_type: (editingNode.data as { step_type: BlockType }).step_type,
        config: (editingNode.data as { config: BlockConfig }).config,
        sent_count: (editingNode.data as { sent_count: number }).sent_count ?? 0,
        delivered_count: (editingNode.data as { delivered_count: number }).delivered_count ?? 0,
        error_count: (editingNode.data as { error_count: number }).error_count ?? 0,
        branches: {},
      }
    : null;

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        className="bg-slate-50"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
        <Controls className="!shadow-md !rounded-xl !border !border-zinc-200 !bg-white" />
        <MiniMap
          nodeColor={(n) => {
            if (n.id === TRIGGER_NODE_ID) return "#6366f1";
            return "#e2e8f0";
          }}
          className="!rounded-xl !border !border-zinc-200 !shadow-md"
        />
      </ReactFlow>

      {editingFlowNode && (
        <BlockConfigDrawer
          node={editingFlowNode}
          onSave={handleSaveConfig}
          onClose={() => setEditingNode(null)}
        />
      )}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
interface FlowBuilderCanvasProps {
  steps: Step[];
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  onStepsChange: (steps: ReturnType<typeof rfToSteps>) => void;
}

import { ReactFlowProvider } from "@xyflow/react";
import { useMemo } from "react";

export default function FlowBuilderCanvas({
  steps,
  triggerType,
  triggerConfig,
  onStepsChange,
}: FlowBuilderCanvasProps) {
  // Only recompute RF layout when steps array reference changes (on load / save)
  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => stepsToRF(steps, triggerType, triggerConfig),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps],
  );

  const handleChange = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      onStepsChange(rfToSteps(nodes, edges));
    },
    [onStepsChange],
  );

  return (
    <ReactFlowProvider>
      <CanvasInner
        initialNodes={initNodes}
        initialEdges={initEdges}
        triggerType={triggerType}
        triggerConfig={triggerConfig}
        onChange={handleChange}
      />
    </ReactFlowProvider>
  );
}

export { SidebarGroup, SEND_BLOCKS, LOGIC_BLOCKS, TOOL_BLOCKS };
