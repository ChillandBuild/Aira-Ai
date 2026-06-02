"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { defaultConfig } from "./blockMeta";
import type {
  BlockConfig,
  BlockType,
  Branch,
  FlowDetail,
  FlowNode,
  InsertTarget,
  InteractiveButton,
  Step,
  StepIn,
  TriggerConfig,
  TriggerType,
} from "./types";
import { isBranching, lanesOf } from "./types";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Apply fn to every child lane of a node, returning a new branches map.
// Empty result lanes are pruned so the map only holds live lanes.
function mapBranches(
  node: FlowNode,
  fn: (lane: FlowNode[]) => FlowNode[],
): Record<string, FlowNode[]> {
  const next: Record<string, FlowNode[]> = {};
  for (const key of Object.keys(node.branches)) {
    const lane = fn(node.branches[key]);
    if (lane.length > 0) next[key] = lane;
  }
  return next;
}

// Build the in-memory tree from flat backend steps.
function buildTree(steps: Step[]): FlowNode[] {
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
    const node = byId.get(s.id);
    if (!node) continue;
    const parent = s.parent_step_id != null ? byId.get(s.parent_step_id) : undefined;
    if (!parent || s.branch == null) {
      roots.push({ node, position: s.position });
      continue;
    }
    // Bucket the child under its branch label (condition: yes/no; interactive: button id).
    const lane = parent.branches[s.branch] ?? [];
    lane.push(node);
    parent.branches[s.branch] = lane;
  }

  // Sort every lane by original position. Children were pushed in array order;
  // re-sort using the source position map.
  const posOf = new Map<string, number>(steps.map((s) => [s.id, s.position]));
  const sortLane = (lane: FlowNode[]) => lane.sort((a, b) => (posOf.get(a.id) ?? 0) - (posOf.get(b.id) ?? 0));
  Array.from(byId.values()).forEach((node) => {
    for (const key of Object.keys(node.branches)) sortLane(node.branches[key]);
  });
  roots.sort((a, b) => a.position - b.position);
  return roots.map((r) => r.node);
}

// Flatten the tree back to StepIn[] with correct parent/branch/position.
// Each child is emitted with branch = its lane key (condition: yes/no;
// interactive: the button id), matching the backend interactive contract.
function flattenTree(roots: FlowNode[]): StepIn[] {
  const out: StepIn[] = [];
  const walk = (lane: FlowNode[], parentId: string | null, branch: Branch) => {
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
        // Emit lanes in config-derived order so positions stay deterministic.
        for (const spec of lanesOf(node)) {
          walk(node.branches[spec.key] ?? [], node.id, spec.key);
        }
      }
    });
  };
  walk(roots, null, null);
  return out;
}

// Recurse into every branch lane of a node, returning a new branches map.
function recurseBranches(node: FlowNode, recurse: (nodes: FlowNode[]) => FlowNode[]): Record<string, FlowNode[]> {
  const next: Record<string, FlowNode[]> = {};
  for (const key of Object.keys(node.branches)) next[key] = recurse(node.branches[key]);
  return next;
}

// Immutable lane update: find the lane addressed by (parentId, branch) and replace it.
function mapLane(
  roots: FlowNode[],
  parentId: string | null,
  branch: Branch,
  fn: (lane: FlowNode[]) => FlowNode[],
): FlowNode[] {
  if (parentId == null || branch == null) return fn(roots);
  const recurse = (nodes: FlowNode[]): FlowNode[] =>
    nodes.map((node) => {
      if (node.id === parentId) {
        return { ...node, branches: { ...node.branches, [branch]: fn(node.branches[branch] ?? []) } };
      }
      if (isBranching(node.step_type)) {
        return { ...node, branches: recurseBranches(node, recurse) };
      }
      return node;
    });
  return recurse(roots);
}

// Walk all lanes, transforming any node matching id.
function mapNode(roots: FlowNode[], id: string, fn: (node: FlowNode) => FlowNode): FlowNode[] {
  const recurse = (nodes: FlowNode[]): FlowNode[] =>
    nodes.map((node) => {
      let next = node;
      if (isBranching(node.step_type)) {
        next = { ...node, branches: recurseBranches(node, recurse) };
      }
      return next.id === id ? fn(next) : next;
    });
  return recurse(roots);
}

function deepCloneNode(node: FlowNode): FlowNode {
  const branches: Record<string, FlowNode[]> = {};
  for (const key of Object.keys(node.branches)) branches[key] = node.branches[key].map(deepCloneNode);
  return {
    ...node,
    id: newId(),
    sent_count: 0,
    delivered_count: 0,
    error_count: 0,
    config: cloneConfig(node.config),
    branches,
  };
}

// Keep an interactive node's branch lanes in sync with its current buttons:
// retain lanes whose button id still exists, drop lanes whose button was removed
// (along with all their children). New buttons get no lane here — lanesOf derives
// an empty lane from config so it renders, and a lane is only stored once a child
// is added to it.
function reconcileButtonLanes(
  branches: Record<string, FlowNode[]>,
  buttons: InteractiveButton[] | undefined,
): Record<string, FlowNode[]> {
  const live = new Set((buttons || []).map((b) => b.id));
  const next: Record<string, FlowNode[]> = {};
  for (const key of Object.keys(branches)) {
    if (live.has(key)) next[key] = branches[key];
  }
  return next;
}

// ai_agent lanes are keyed by the outcome string (the LLM emits the outcome, the
// backend follows branch==outcome). Keep lanes whose outcome still exists; drop the
// rest. Renaming an outcome resets its lane (outcomes are usually set before building).
function reconcileOutcomeLanes(
  branches: Record<string, FlowNode[]>,
  outcomes: string[] | undefined,
): Record<string, FlowNode[]> {
  const live = new Set(outcomes || []);
  const next: Record<string, FlowNode[]> = {};
  for (const key of Object.keys(branches)) {
    if (live.has(key)) next[key] = branches[key];
  }
  return next;
}

// Deep-copy a config's nested collections. Button ids are kept as-is: they are
// branch labels scoped under their own parent, so a duplicate's lanes (keyed by
// the same ids in deepCloneNode) stay linked to the copied buttons.
function cloneConfig(config: BlockConfig): BlockConfig {
  return {
    ...config,
    params: config.params ? [...config.params] : config.params,
    headers: config.headers ? { ...config.headers } : config.headers,
    buttons: config.buttons ? config.buttons.map((b) => ({ ...b })) : config.buttons,
  };
}

export interface FlowState {
  loading: boolean;
  error: string | null;
  name: string;
  active: boolean;
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  tree: FlowNode[];
  dirty: boolean;
  saving: boolean;
  setName: (name: string) => void;
  setActive: (active: boolean) => void;
  setTriggerType: (type: TriggerType) => void;
  setTriggerConfig: (config: TriggerConfig) => void;
  addBlock: (type: BlockType, target: InsertTarget) => void;
  updateBlockConfig: (id: string, config: BlockConfig) => void;
  deleteBlock: (id: string) => void;
  duplicateBlock: (id: string) => void;
  moveBlock: (target: InsertTarget, dir: -1 | 1) => void;
  reorderBlock: (parentId: string | null, branch: Branch, from: number, to: number) => void;
  save: () => Promise<boolean>;
}

export function useFlow(flowId: string): FlowState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setNameState] = useState("");
  const [active, setActiveState] = useState(false);
  const [triggerType, setTriggerType] = useState<TriggerType>("lead_created");
  const [triggerConfig, setTriggerConfigState] = useState<TriggerConfig>({});
  const [tree, setTree] = useState<FlowNode[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/automations/${flowId}`, { headers: auth });
      if (!res.ok) {
        setError("Flow not found");
        return;
      }
      const json: { data: FlowDetail } = await res.json();
      const data = json.data;
      setNameState(data.name);
      setActiveState(data.active);
      setTriggerType(data.trigger_type);
      setTriggerConfigState(data.trigger_config || {});
      setTree(buildTree(data.steps || []));
      loadedRef.current = true;
    } catch {
      setError("Could not load this flow");
    } finally {
      setLoading(false);
    }
  }, [flowId]);

  useEffect(() => {
    load();
  }, [load]);

  const markDirty = useCallback(() => setDirty(true), []);

  const setName = useCallback((next: string) => {
    setNameState(next);
    markDirty();
  }, [markDirty]);

  const setActive = useCallback((next: boolean) => {
    setActiveState(next);
    markDirty();
  }, [markDirty]);

  const setTriggerTypeWrapped = useCallback((next: TriggerType) => {
    setTriggerType(next);
    markDirty();
  }, [markDirty]);

  const setTriggerConfig = useCallback((next: TriggerConfig) => {
    setTriggerConfigState(next);
    markDirty();
  }, [markDirty]);

  const addBlock = useCallback((type: BlockType, target: InsertTarget) => {
    const node: FlowNode = {
      id: newId(),
      step_type: type,
      config: defaultConfig(type),
      sent_count: 0,
      delivered_count: 0,
      error_count: 0,
      branches: {},
    };
    setTree((prev) =>
      mapLane(prev, target.parentId, target.branch, (lane) => {
        const next = [...lane];
        const at = Math.min(Math.max(target.position, 0), next.length);
        next.splice(at, 0, node);
        return next;
      }),
    );
    markDirty();
  }, [markDirty]);

  const updateBlockConfig = useCallback((id: string, config: BlockConfig) => {
    setTree((prev) =>
      mapNode(prev, id, (node) => ({
        ...node,
        config,
        // For interactive nodes, keep child lanes linked to buttons by id:
        // drop lanes whose button was removed; seed nothing for new buttons
        // (lanesOf derives empty lanes from config).
        branches:
          node.step_type === "interactive"
            ? reconcileButtonLanes(node.branches, config.buttons)
            : node.step_type === "ai_agent"
              ? reconcileOutcomeLanes(node.branches, config.outcomes)
              : node.branches,
      })),
    );
    markDirty();
  }, [markDirty]);

  const deleteBlock = useCallback((id: string) => {
    const removeFrom = (nodes: FlowNode[]): FlowNode[] =>
      nodes
        .filter((n) => n.id !== id)
        .map((n) =>
          isBranching(n.step_type) ? { ...n, branches: mapBranches(n, removeFrom) } : n,
        );
    setTree((prev) => removeFrom(prev));
    markDirty();
  }, [markDirty]);

  const duplicateBlock = useCallback((id: string) => {
    const dupeIn = (nodes: FlowNode[]): FlowNode[] => {
      const out: FlowNode[] = [];
      for (const n of nodes) {
        const node = isBranching(n.step_type) ? { ...n, branches: mapBranches(n, dupeIn) } : n;
        out.push(node);
        if (n.id === id) out.push(deepCloneNode(n));
      }
      return out;
    };
    setTree((prev) => dupeIn(prev));
    markDirty();
  }, [markDirty]);

  const reorderBlock = useCallback((parentId: string | null, branch: Branch, from: number, to: number) => {
    setTree((prev) =>
      mapLane(prev, parentId, branch, (lane) => {
        if (from === to || from < 0 || to < 0 || from >= lane.length || to >= lane.length) return lane;
        const next = [...lane];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      }),
    );
    markDirty();
  }, [markDirty]);

  // Reorder the block at target within its own lane by dir (-1 up, +1 down).
  const moveBlock = useCallback((target: InsertTarget, dir: -1 | 1) => {
    setTree((prev) =>
      mapLane(prev, target.parentId, target.branch, (lane) => {
        const from = target.position;
        const to = from + dir;
        if (to < 0 || to >= lane.length) return lane;
        const next = [...lane];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      }),
    );
    markDirty();
  }, [markDirty]);

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const auth = await getAuthHeaders();
      const body = {
        name,
        active,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        steps: flattenTree(tree),
      };
      const res = await fetch(`${API_URL}/api/v1/automations/${flowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError("Save failed");
        return false;
      }
      const json: { data: FlowDetail } = await res.json();
      if (json?.data?.steps) {
        setTree(buildTree(json.data.steps));
      }
      setDirty(false);
      setError(null);
      return true;
    } catch {
      setError("Save failed — could not reach server");
      return false;
    } finally {
      setSaving(false);
    }
  }, [flowId, name, active, triggerType, triggerConfig, tree]);

  return useMemo(
    () => ({
      loading,
      error,
      name,
      active,
      triggerType,
      triggerConfig,
      tree,
      dirty,
      saving,
      setName,
      setActive,
      setTriggerType: setTriggerTypeWrapped,
      setTriggerConfig,
      addBlock,
      updateBlockConfig,
      deleteBlock,
      duplicateBlock,
      moveBlock,
      reorderBlock,
      save,
    }),
    [
      loading, error, name, active, triggerType, triggerConfig, tree, dirty, saving,
      setName, setActive, setTriggerTypeWrapped, setTriggerConfig, addBlock, updateBlockConfig, deleteBlock,
      duplicateBlock, moveBlock, reorderBlock, save,
    ],
  );
}
