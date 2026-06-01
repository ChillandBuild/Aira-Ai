/**
 * Utilities to convert between the backend flat-steps format and React Flow nodes/edges.
 *
 * Backend model  →  flat list of steps with parent_step_id / branch / position
 * React Flow     →  nodes (each with x/y) + edges (each with source/target/sourceHandle)
 *
 * Sequential relationships within a lane are represented as edges with no sourceHandle.
 * Branch relationships are edges where sourceHandle = branch key.
 */
import type { Edge, Node } from "@xyflow/react";
import type {
  BlockConfig,
  BlockType,
  FlowNode,
  Step,
  StepIn,
  TriggerConfig,
  TriggerType,
} from "./types";
import { isBranching, lanesOf } from "./types";
import { defaultConfig } from "./blockMeta";

export const TRIGGER_NODE_ID = "__trigger__";

// ── Layout constants ──────────────────────────────────────────────────────────
const NODE_W = 252;
const NODE_H = 96;
const V_GAP = 72;     // vertical gap between rows
const H_GAP = 80;     // horizontal gap between branch columns
const BRANCH_EXTRA_Y = 40; // extra space before branches fan out

// ── Build tree from flat steps (same logic as useFlow.ts) ─────────────────────
export function buildTreeFromSteps(steps: Step[]): FlowNode[] {
  const byId = new Map<string, FlowNode>();
  for (const s of steps) {
    byId.set(s.id, {
      id: s.id,
      step_type: s.step_type,
      config: s.config || {},
      sent_count: s.sent_count || 0,
      delivered_count: s.delivered_count || 0,
      error_count: s.error_count || 0,
      branches: {},
    });
  }

  const roots: { node: FlowNode; position: number }[] = [];
  for (const s of steps) {
    const node = byId.get(s.id)!;
    const parent = s.parent_step_id != null ? byId.get(s.parent_step_id) : undefined;
    if (!parent || s.branch == null) {
      roots.push({ node, position: s.position });
      continue;
    }
    const lane = parent.branches[s.branch] ?? [];
    lane.push(node);
    parent.branches[s.branch] = lane;
  }

  const posOf = new Map<string, number>(steps.map((s) => [s.id, s.position]));
  byId.forEach((node) => {
    for (const k of Object.keys(node.branches)) {
      node.branches[k].sort((a, b) => (posOf.get(a.id) ?? 0) - (posOf.get(b.id) ?? 0));
    }
  });
  roots.sort((a, b) => a.position - b.position);
  return roots.map((r) => r.node);
}

export function flattenTreeToSteps(roots: FlowNode[]): StepIn[] {
  const out: StepIn[] = [];
  const walk = (lane: FlowNode[], parentId: string | null, branch: string | null) => {
    lane.forEach((node, idx) => {
      out.push({
        id: node.id,
        step_type: node.step_type,
        config: node.config,
        parent_step_id: parentId,
        branch,
        position: idx,
      });
      if (isBranching(node.step_type)) {
        for (const spec of lanesOf(node)) {
          walk(node.branches[spec.key] ?? [], node.id, spec.key);
        }
      }
    });
  };
  walk(roots, null, null);
  return out;
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function branchColumnWidth(nodes: FlowNode[]): number {
  if (nodes.length === 0) return NODE_W;
  let w = NODE_W;
  for (const node of nodes) {
    if (isBranching(node.step_type)) {
      const lanes = lanesOf(node);
      if (lanes.length > 0) {
        const total = lanes.reduce(
          (sum, lane) => sum + branchColumnWidth(node.branches[lane.key] ?? []) + H_GAP,
          -H_GAP,
        );
        w = Math.max(w, Math.max(NODE_W, total));
      }
    }
  }
  return w;
}

type PosMap = Record<string, { x: number; y: number }>;

function layoutLane(
  nodes: FlowNode[],
  centerX: number,
  startY: number,
  posMap: PosMap,
): number {
  let curY = startY;
  for (const node of nodes) {
    posMap[node.id] = { x: centerX - NODE_W / 2, y: curY };
    curY += NODE_H + V_GAP;

    if (isBranching(node.step_type)) {
      const lanes = lanesOf(node);
      if (lanes.length > 0) {
        curY += BRANCH_EXTRA_Y;
        const laneWidths = lanes.map((l) =>
          branchColumnWidth(node.branches[l.key] ?? []),
        );
        const totalW = laneWidths.reduce((s, w) => s + w + H_GAP, -H_GAP);
        let lx = centerX - totalW / 2;
        let maxEndY = curY;
        for (let i = 0; i < lanes.length; i++) {
          const kids = node.branches[lanes[i].key] ?? [];
          const laneCenterX = lx + laneWidths[i] / 2;
          if (kids.length > 0) {
            const endY = layoutLane(kids, laneCenterX, curY, posMap);
            maxEndY = Math.max(maxEndY, endY);
          }
          lx += laneWidths[i] + H_GAP;
        }
        curY = maxEndY;
      }
    }
  }
  return curY;
}

// ── Steps → RF ────────────────────────────────────────────────────────────────

export interface RFGraph {
  nodes: Node[];
  edges: Edge[];
}

const EDGE_STYLE = { stroke: "#94a3b8", strokeWidth: 1.5 };
const ARROW = { type: "arrowclosed" as const, color: "#94a3b8", width: 11, height: 11 };

function addEdge(
  edges: Edge[],
  source: string,
  target: string,
  sourceHandle?: string,
  label?: string,
) {
  edges.push({
    id: `${source}--${sourceHandle ?? "out"}--${target}`,
    source,
    target,
    sourceHandle: sourceHandle ?? "out",
    targetHandle: "in",
    type: "smoothstep",
    style: EDGE_STYLE,
    markerEnd: ARROW,
    ...(label
      ? {
          label,
          labelStyle: { fontSize: 10, fontWeight: 600, fill: "#475569" },
          labelBgStyle: { fill: "#f1f5f9", fillOpacity: 0.95, rx: 4 },
          labelBgPadding: [4, 6] as [number, number],
        }
      : {}),
  });
}

function collectNodes(nodes: FlowNode[], rfNodes: Node[], posMap: PosMap) {
  for (const node of nodes) {
    rfNodes.push({
      id: node.id,
      type: "blockNode",
      position: posMap[node.id] ?? { x: 0, y: 200 },
      data: {
        step_type: node.step_type,
        config: { ...node.config },
        sent_count: node.sent_count,
        delivered_count: node.delivered_count,
        error_count: node.error_count,
      },
      dragHandle: ".drag-handle",
    });
    for (const branchNodes of Object.values(node.branches)) {
      collectNodes(branchNodes, rfNodes, posMap);
    }
  }
}

function collectEdges(
  lane: FlowNode[],
  parentSource: string,
  sourceHandle: string,
  edges: Edge[],
  branchLabel?: string,
) {
  for (let i = 0; i < lane.length; i++) {
    const node = lane[i];
    const prevSource = i === 0 ? parentSource : lane[i - 1].id;
    const prevHandle = i === 0 ? sourceHandle : "out";
    const label = i === 0 ? branchLabel : undefined;
    addEdge(edges, prevSource, node.id, prevHandle, label);

    if (isBranching(node.step_type)) {
      for (const spec of lanesOf(node)) {
        const kids = node.branches[spec.key] ?? [];
        if (kids.length > 0) {
          collectEdges(kids, node.id, spec.key, edges, spec.label);
        }
      }
    }
  }
}

export function stepsToRF(
  steps: Step[],
  triggerType: TriggerType,
  triggerConfig: TriggerConfig,
): RFGraph {
  const tree = buildTreeFromSteps(steps);

  // Calculate layout
  const posMap: PosMap = {};
  const totalW = tree.reduce(
    (sum, n) => sum + branchColumnWidth([n]) + H_GAP,
    -H_GAP,
  );
  const centerX = Math.max(NODE_W, totalW) / 2;
  layoutLane(tree, centerX, NODE_H + V_GAP + 20, posMap);

  const trigX = centerX - NODE_W / 2;

  const rfNodes: Node[] = [
    {
      id: TRIGGER_NODE_ID,
      type: "triggerNode",
      position: { x: trigX, y: 0 },
      data: { triggerType, triggerConfig },
      dragHandle: ".drag-handle",
    },
  ];
  collectNodes(tree, rfNodes, posMap);

  const rfEdges: Edge[] = [];
  collectEdges(tree, TRIGGER_NODE_ID, "out", rfEdges);

  return { nodes: rfNodes, edges: rfEdges };
}

// ── RF → Steps ────────────────────────────────────────────────────────────────

export function rfToSteps(rfNodes: Node[], rfEdges: Edge[]): StepIn[] {
  // Build incoming edge map (each node has one incoming edge)
  const incoming = new Map<string, Edge>();
  for (const e of rfEdges) incoming.set(e.target, e);

  // Build outgoing edge map keyed by source+sourceHandle
  const outgoingByHandle = new Map<string, Edge[]>();
  for (const e of rfEdges) {
    const key = `${e.source}::${e.sourceHandle ?? "out"}`;
    const list = outgoingByHandle.get(key) ?? [];
    list.push(e);
    outgoingByHandle.set(key, list);
  }

  // Determine (parentId, branch) for each node by walking up the edge chain
  // Rules:
  //   - If incoming edge sourceHandle is a branch key (non-"out"), it's a branch child
  //   - If incoming edge sourceHandle is "out" (or missing), it's in the same lane as source
  const branchingNodeIds = new Set<string>(
    rfNodes
      .filter((n) => n.id !== TRIGGER_NODE_ID && isBranching((n.data as { step_type: BlockType }).step_type))
      .map((n) => n.id),
  );

  function getParentLane(nodeId: string): { parentId: string | null; branch: string | null } {
    const edge = incoming.get(nodeId);
    if (!edge) return { parentId: null, branch: null };
    const sh = edge.sourceHandle;
    if (edge.source === TRIGGER_NODE_ID || !sh || sh === "out") {
      // Sequential continuation — same lane as source
      if (edge.source === TRIGGER_NODE_ID) return { parentId: null, branch: null };
      return getParentLane(edge.source);
    }
    // Branch edge: source is the branching node, sh is the branch key
    return { parentId: edge.source, branch: sh };
  }

  // Group nodes by lane and determine position by y-coordinate
  const laneGroups = new Map<string, string[]>(); // key → [nodeId]

  const nonTriggerNodes = rfNodes.filter((n) => n.id !== TRIGGER_NODE_ID);
  for (const node of nonTriggerNodes) {
    const { parentId, branch } = getParentLane(node.id);
    const key = `${parentId ?? "root"}::${branch ?? "null"}`;
    const group = laneGroups.get(key) ?? [];
    group.push(node.id);
    laneGroups.set(key, group);
  }

  // Sort each group by y position to determine step order
  const nodeY = new Map<string, number>(rfNodes.map((n) => [n.id, n.position.y]));
  laneGroups.forEach((group) => group.sort((a, b) => (nodeY.get(a) ?? 0) - (nodeY.get(b) ?? 0)));

  // Build StepIn array
  const steps: StepIn[] = [];
  for (const node of nonTriggerNodes) {
    const { parentId, branch } = getParentLane(node.id);
    const key = `${parentId ?? "root"}::${branch ?? "null"}`;
    const group = laneGroups.get(key) ?? [];
    const position = group.indexOf(node.id);
    const data = node.data as { step_type: BlockType; config: BlockConfig };
    steps.push({
      id: node.id,
      step_type: data.step_type,
      config: data.config,
      parent_step_id: parentId,
      branch,
      position,
    });
  }

  return steps;
}

// ── New node factory ──────────────────────────────────────────────────────────

export function newBlockNode(
  type: BlockType,
  position: { x: number; y: number },
): Node {
  const id = crypto.randomUUID();
  return {
    id,
    type: "blockNode",
    position,
    data: {
      step_type: type,
      config: defaultConfig(type),
      sent_count: 0,
      delivered_count: 0,
      error_count: 0,
    },
    dragHandle: ".drag-handle",
  };
}
