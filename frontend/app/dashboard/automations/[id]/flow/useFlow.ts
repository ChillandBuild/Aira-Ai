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
  Step,
  StepIn,
  TriggerConfig,
  TriggerType,
} from "./types";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
      yes: [],
      no: [],
    });
  }

  const roots: { node: FlowNode; position: number }[] = [];
  for (const s of steps) {
    const node = byId.get(s.id);
    if (!node) continue;
    if (s.parent_step_id == null) {
      roots.push({ node, position: s.position });
      continue;
    }
    const parent = byId.get(s.parent_step_id);
    if (!parent) {
      roots.push({ node, position: s.position });
      continue;
    }
    const lane = s.branch === "no" ? parent.no : parent.yes;
    lane.push(node);
  }

  // Sort every lane by original position. Children were pushed in array order;
  // re-sort using the source position map.
  const posOf = new Map<string, number>(steps.map((s) => [s.id, s.position]));
  const sortLane = (lane: FlowNode[]) => lane.sort((a, b) => (posOf.get(a.id) ?? 0) - (posOf.get(b.id) ?? 0));
  Array.from(byId.values()).forEach((node) => {
    sortLane(node.yes);
    sortLane(node.no);
  });
  roots.sort((a, b) => a.position - b.position);
  return roots.map((r) => r.node);
}

// Flatten the tree back to StepIn[] with correct parent/branch/position.
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
      if (node.step_type === "condition") {
        walk(node.yes, node.id, "yes");
        walk(node.no, node.id, "no");
      }
    });
  };
  walk(roots, null, null);
  return out;
}

// Immutable lane update: find the lane addressed by (parentId, branch) and replace it.
function mapLane(
  roots: FlowNode[],
  parentId: string | null,
  branch: Branch,
  fn: (lane: FlowNode[]) => FlowNode[],
): FlowNode[] {
  if (parentId == null) return fn(roots);
  const recurse = (nodes: FlowNode[]): FlowNode[] =>
    nodes.map((node) => {
      if (node.id === parentId) {
        if (branch === "no") return { ...node, no: fn(node.no) };
        return { ...node, yes: fn(node.yes) };
      }
      if (node.step_type === "condition") {
        return { ...node, yes: recurse(node.yes), no: recurse(node.no) };
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
      if (node.step_type === "condition") {
        next = { ...node, yes: recurse(node.yes), no: recurse(node.no) };
      }
      return next.id === id ? fn(next) : next;
    });
  return recurse(roots);
}

function deepCloneNode(node: FlowNode): FlowNode {
  return {
    ...node,
    id: newId(),
    sent_count: 0,
    delivered_count: 0,
    error_count: 0,
    config: { ...node.config, params: node.config.params ? [...node.config.params] : node.config.params },
    yes: node.yes.map(deepCloneNode),
    no: node.no.map(deepCloneNode),
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
  setTriggerConfig: (config: TriggerConfig) => void;
  addBlock: (type: BlockType, target: InsertTarget) => void;
  updateBlockConfig: (id: string, config: BlockConfig) => void;
  deleteBlock: (id: string) => void;
  duplicateBlock: (id: string) => void;
  moveBlock: (target: InsertTarget, dir: -1 | 1) => void;
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
      yes: [],
      no: [],
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
    setTree((prev) => mapNode(prev, id, (node) => ({ ...node, config })));
    markDirty();
  }, [markDirty]);

  const deleteBlock = useCallback((id: string) => {
    const removeFrom = (nodes: FlowNode[]): FlowNode[] =>
      nodes
        .filter((n) => n.id !== id)
        .map((n) =>
          n.step_type === "condition" ? { ...n, yes: removeFrom(n.yes), no: removeFrom(n.no) } : n,
        );
    setTree((prev) => removeFrom(prev));
    markDirty();
  }, [markDirty]);

  const duplicateBlock = useCallback((id: string) => {
    const dupeIn = (nodes: FlowNode[]): FlowNode[] => {
      const out: FlowNode[] = [];
      for (const n of nodes) {
        const node = n.step_type === "condition" ? { ...n, yes: dupeIn(n.yes), no: dupeIn(n.no) } : n;
        out.push(node);
        if (n.id === id) out.push(deepCloneNode(n));
      }
      return out;
    };
    setTree((prev) => dupeIn(prev));
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
      setTriggerConfig,
      addBlock,
      updateBlockConfig,
      deleteBlock,
      duplicateBlock,
      moveBlock,
      save,
    }),
    [
      loading, error, name, active, triggerType, triggerConfig, tree, dirty, saving,
      setName, setActive, setTriggerConfig, addBlock, updateBlockConfig, deleteBlock,
      duplicateBlock, moveBlock, save,
    ],
  );
}
