// Pure layout math for the read-only Map view.
//
// FlowNode is NOT a generic children-tree. Blocks within a lane form a
// sequential chain (block[i] → block[i+1]); only `condition` nodes fan out
// into yes[]/no[] branch lanes. The trigger is a synthetic head whose single
// child is the first root block.
import { lanesOf, isBranching, type FlowNode, type TriggerType, type BlockType, type BlockConfig } from "./types";

export const NODE_W = 240;
export const NODE_H = 96;
export const GAP_X = 40;
export const GAP_Y = 64;
export const PAD = 48;

export type MapNodeKind = "trigger" | "block";

export interface MapNode {
  key: string;
  kind: MapNodeKind;
  x: number;
  y: number;
  // Block-only fields (undefined for the trigger node).
  stepType?: BlockType;
  config?: BlockConfig;
  sentCount?: number;
  deliveredCount?: number;
  errorCount?: number;
  // Trigger-only field.
  triggerType?: TriggerType;
}

// Branch label shown on a fan-out edge ("if yes" / a button title), or null for a
// plain sequential edge.
export type EdgeLabel = string | null;

export interface MapEdge {
  key: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label: EdgeLabel;
}

export interface MapLayout {
  nodes: MapNode[];
  edges: MapEdge[];
  width: number;
  height: number;
}

// Internal layout record before pixel projection.
interface Slot {
  key: string;
  depth: number;
  xUnit: number;
  parentKey: string | null;
  label: EdgeLabel;
  node: FlowNode | null; // null = synthetic trigger
}

interface BuildState {
  slots: Slot[];
  nextLeaf: { value: number };
}

// Returns the ordered set of (child, label) edges emanating from a position.
// Combines sequential lane continuation with condition branch fan-out.
function laneChildren(lane: FlowNode[], index: number): { node: FlowNode; label: EdgeLabel }[] {
  const current = lane[index];
  const next = lane[index + 1];
  if (isBranching(current.step_type)) {
    const out: { node: FlowNode; label: EdgeLabel }[] = [];
    for (const spec of lanesOf(current)) {
      const first = (current.branches[spec.key] ?? [])[0];
      if (first) out.push({ node: first, label: spec.label });
    }
    // A block placed after the branching node in the same lane hangs off it.
    if (next) out.push({ node: next, label: null });
    return out;
  }
  if (next) return [{ node: next, label: null }];
  return [];
}

// Locate a node inside its owning lane so we can continue the sequential chain.
function findInLane(node: FlowNode, lanes: FlowNode[][]): { lane: FlowNode[]; index: number } | null {
  for (const lane of lanes) {
    const index = lane.findIndex((n) => n.id === node.id);
    if (index !== -1) return { lane, index };
  }
  return null;
}

// DFS that assigns leaf slots left-to-right and internal nodes the midpoint of
// their children. Each call places one node and recurses into its children.
function placeNode(
  node: FlowNode,
  lane: FlowNode[],
  index: number,
  depth: number,
  parentKey: string,
  label: EdgeLabel,
  state: BuildState,
): number {
  const key = node.id;
  const children = laneChildren(lane, index);

  if (children.length === 0) {
    const xUnit = state.nextLeaf.value;
    state.nextLeaf.value += 1;
    state.slots.push({ key, depth, xUnit, parentKey, label, node });
    return xUnit;
  }

  const childUnits: number[] = [];
  for (const child of children) {
    const owner =
      child.label === null
        ? { lane, index: index + 1 } // sequential continuation in same lane
        : findInLane(child.node, Object.values(node.branches));
    if (!owner) continue;
    const xUnit = placeNode(
      child.node,
      owner.lane,
      owner.index,
      depth + 1,
      key,
      child.label,
      state,
    );
    childUnits.push(xUnit);
  }

  const xUnit =
    childUnits.length > 0
      ? (Math.min(...childUnits) + Math.max(...childUnits)) / 2
      : (() => {
          const v = state.nextLeaf.value;
          state.nextLeaf.value += 1;
          return v;
        })();
  state.slots.push({ key, depth, xUnit, parentKey, label, node });
  return xUnit;
}

export function computeMapLayout(roots: FlowNode[], triggerType: TriggerType): MapLayout {
  const TRIGGER_KEY = "__trigger__";
  const state: BuildState = { slots: [], nextLeaf: { value: 0 } };

  let triggerXUnit = 0;
  if (roots[0]) {
    triggerXUnit = placeNode(roots[0], roots, 0, 1, TRIGGER_KEY, null, state);
  }

  // Project unit coordinates → pixels.
  const stepX = NODE_W + GAP_X;
  const stepY = NODE_H + GAP_Y;
  const centerX = (xUnit: number): number => PAD + xUnit * stepX + NODE_W / 2;
  const centerYTop = (depth: number): number => PAD + depth * stepY;

  const nodes: MapNode[] = [];
  nodes.push({
    key: TRIGGER_KEY,
    kind: "trigger",
    x: centerX(triggerXUnit) - NODE_W / 2,
    y: centerYTop(0),
    triggerType,
  });
  for (const slot of state.slots) {
    if (!slot.node) continue;
    nodes.push({
      key: slot.key,
      kind: "block",
      x: centerX(slot.xUnit) - NODE_W / 2,
      y: centerYTop(slot.depth),
      stepType: slot.node.step_type,
      config: slot.node.config,
      sentCount: slot.node.sent_count,
      deliveredCount: slot.node.delivered_count,
      errorCount: slot.node.error_count,
    });
  }

  // Edges from each slot to its parent.
  const byKey = new Map<string, MapNode>(nodes.map((n) => [n.key, n]));
  const edges: MapEdge[] = [];
  for (const slot of state.slots) {
    const child = byKey.get(slot.key);
    const parent = byKey.get(slot.parentKey ?? "");
    if (!child || !parent) continue;
    edges.push({
      key: `${slot.parentKey}->${slot.key}-${slot.label ?? "seq"}`,
      fromX: parent.x + NODE_W / 2,
      fromY: parent.y + NODE_H,
      toX: child.x + NODE_W / 2,
      toY: child.y,
      label: slot.label,
    });
  }

  // Bounds.
  let maxXUnit = triggerXUnit;
  let maxDepth = 0;
  for (const slot of state.slots) {
    maxXUnit = Math.max(maxXUnit, slot.xUnit);
    maxDepth = Math.max(maxDepth, slot.depth);
  }
  const width = PAD * 2 + (maxXUnit + 1) * stepX - GAP_X;
  const height = PAD * 2 + (maxDepth + 1) * stepY - GAP_Y;

  return { nodes, edges, width, height };
}
