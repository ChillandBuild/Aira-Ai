"use client";
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Zap, Plus, Minus, Maximize2, Pencil, Trash2, Copy, X } from "lucide-react";
import { BLOCK_META, blockSummary, TRIGGER_LABELS } from "./blockMeta";
import { computeMapLayout, NODE_W, NODE_H, GAP_Y, type MapNode, type MapEdge } from "./mapLayout";
import { isBranching, lanesOf, type BlockType, type Branch, type FlowNode, type InsertTarget, type TriggerType, type TriggerConfig } from "./types";

// ── Block groups (shared by add pickers) ─────────────────────────────────────
const SEND_BLOCKS: BlockType[] = [
  "send_message", "send_image", "send_video", "send_audio", "send_file",
  "send_location", "cta_url", "send_template", "send_list", "send_catalog",
];
const LOGIC_BLOCKS: BlockType[] = ["wait", "condition", "user_input", "interactive", "ai_agent"];
const TOOLS_BLOCKS: BlockType[] = ["add_label", "http_api", "random"];
const BLOCK_GROUPS = [
  { title: "Send", types: SEND_BLOCKS },
  { title: "Logic", types: LOGIC_BLOCKS },
  { title: "Tools", types: TOOLS_BLOCKS },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface AddButton {
  key: string;
  x: number;
  y: number;
  target: InsertTarget;
}

interface CanvasProps {
  nodes: FlowNode[];
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  onEdit?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
  onInsert?: (type: BlockType, target: InsertTarget) => void;
  onAddFirst?: (type: BlockType) => void;
  onEditTrigger?: () => void;
  className?: string;
}

interface Pan { x: number; y: number; }

const MIN_SCALE = 0.4;
const MAX_SCALE = 1.6;

// ── Compute + button midpoints for every edge ─────────────────────────────────
function computeAddButtons(roots: FlowNode[], layout: MapLayout): AddButton[] {
  const byId = new Map<string, MapNode>(layout.nodes.map((n) => [n.key, n]));
  const trigger = byId.get("__trigger__");
  const buttons: AddButton[] = [];

  function walkLane(lane: FlowNode[], parentId: string | null, branch: Branch, head: MapNode | null) {
    let prev = head;
    lane.forEach((node, idx) => {
      const cur = byId.get(node.id);
      if (!cur) { return; }

      if (prev) {
        buttons.push({
          key: `add-${parentId ?? "root"}-${branch ?? "seq"}-${idx}`,
          x: (prev.x + cur.x) / 2 + NODE_W / 2,
          y: (prev.y + NODE_H + cur.y) / 2,
          target: { parentId, branch, position: idx },
        });
      }

      if (isBranching(node.step_type)) {
        for (const spec of lanesOf(node)) {
          walkLane(node.branches[spec.key] ?? [], node.id, spec.key, cur);
        }
      }

      prev = cur;
    });

    // Trailing + after last node in lane
    if (prev && prev !== head) {
      const trailY = prev.y + NODE_H + GAP_Y / 2;
      buttons.push({
        key: `add-${parentId ?? "root"}-${branch ?? "seq"}-${lane.length}`,
        x: prev.x + NODE_W / 2,
        y: trailY,
        target: { parentId, branch, position: lane.length },
      });
    }
  }

  if (trigger && roots.length > 0) walkLane(roots, null, null, trigger);
  return buttons;
}

// Tiny shim so we can call computeAddButtons before the full MapLayout type is imported
type MapLayout = ReturnType<typeof computeMapLayout>;

// ── Reusable block picker ─────────────────────────────────────────────────────
function BlockPicker({ onSelect }: { onSelect: (type: BlockType) => void }) {
  return (
    <div className="max-h-72 overflow-y-auto py-2 px-2 space-y-3">
      {BLOCK_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-primary/70 mb-1 px-1">
            {group.title}
          </p>
          {group.types.map((type) => {
            const meta = BLOCK_META[type];
            const Icon = meta.icon;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onSelect(type)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-left hover:bg-surface-mid transition-colors"
              >
                <span className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${meta.iconBg} ${meta.iconText}`}>
                  <Icon size={12} />
                </span>
                <span className="text-[13px] font-semibold text-on-surface truncate">{meta.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Node cards ────────────────────────────────────────────────────────────────
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function edgePath(edge: MapEdge): string {
  const midY = edge.fromY + (edge.toY - edge.fromY) / 2;
  return `M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${midY}, ${edge.toX} ${midY}, ${edge.toX} ${edge.toY}`;
}

function TriggerNodeCard({
  node, triggerType, onEdit,
}: {
  node: MapNode; triggerType: TriggerType; onEdit?: () => void;
}) {
  return (
    <div
      className={`absolute group rounded-2xl bg-primary-light border-2 border-primary/30 px-4 py-3 shadow-sm ${onEdit ? "cursor-pointer hover:border-primary/50 transition-colors" : ""}`}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      onClick={onEdit}
      onPointerDown={(e) => e.stopPropagation()}
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
    >
      <div className="flex items-center gap-3 h-full">
        <span className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-primary text-white">
          <Zap size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-muted">When this happens</p>
          <p className="text-sm font-semibold text-on-surface truncate">{TRIGGER_LABELS[triggerType]}</p>
        </div>
        {onEdit && (
          <Pencil size={12} className="shrink-0 text-on-surface-muted opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
}

function BlockNodeCard({
  node, active, onSelect, onEdit, onDuplicate, onDelete,
}: {
  node: MapNode;
  active: boolean;
  onSelect: () => void;
  onEdit?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  if (!node.stepType) return null;
  const meta = BLOCK_META[node.stepType];
  const Icon = meta.icon;
  const summary = blockSummary(node.stepType, node.config ?? {});
  const hasStats = (node.sentCount ?? 0) > 0 || (node.deliveredCount ?? 0) > 0 || (node.errorCount ?? 0) > 0;

  return (
    <div
      className="absolute group"
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => { onSelect(); onEdit?.(node.key); }}
        className={`w-full h-full text-left rounded-2xl bg-surface border p-3.5 transition-colors ${
          active
            ? "border-primary shadow-md ring-2 ring-primary/20"
            : "border-surface-mid hover:border-primary/30 hover:shadow-sm"
        }`}
      >
        <div className="flex items-start gap-3">
          <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${meta.iconBg} ${meta.iconText}`}>
            <Icon size={17} />
          </span>
          <div className="flex-1 min-w-0 pr-14">
            <span className="block text-sm font-semibold text-on-surface truncate">{meta.label}</span>
            <span className="block text-xs text-on-surface-muted truncate mt-0.5">{summary}</span>
            {hasStats && (
              <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium">
                <span className="text-on-surface-muted">{node.sentCount} sent</span>
                <span className="text-on-surface-muted/50">·</span>
                <span className="text-emerald-600">{node.deliveredCount} delivered</span>
                {(node.errorCount ?? 0) > 0 && (
                  <>
                    <span className="text-on-surface-muted/50">·</span>
                    <span className="text-red-500">{node.errorCount} err</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Hover toolbar */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-10">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit?.(node.key); }}
          className="p-1.5 rounded-lg bg-surface border border-surface-mid shadow-sm text-on-surface-muted hover:text-on-surface transition-colors"
          aria-label="Edit"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDuplicate?.(node.key); }}
          className="p-1.5 rounded-lg bg-surface border border-surface-mid shadow-sm text-on-surface-muted hover:text-on-surface transition-colors"
          aria-label="Duplicate"
        >
          <Copy size={12} />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete?.(node.key); }}
          className="p-1.5 rounded-lg bg-surface border border-surface-mid shadow-sm text-on-surface-muted hover:text-red-500 transition-colors"
          aria-label="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

const LANE_CHIP: Record<string, { bg: string; text: string; display: string }> = {
  yes: { bg: "bg-emerald-100", text: "text-emerald-700", display: "yes" },
  no:  { bg: "bg-zinc-100",    text: "text-zinc-600",    display: "no" },
};

function EdgeLabelChip({ edge }: { edge: MapEdge }) {
  if (!edge.label) return null;
  const chip = LANE_CHIP[edge.label] ?? { bg: "bg-violet-100", text: "text-violet-600", display: edge.label };
  const cx = edge.fromX + (edge.toX - edge.fromX) / 2;
  const cy = edge.fromY + (edge.toY - edge.fromY) / 2;
  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-[10px] font-semibold pointer-events-none ${chip.bg} ${chip.text}`}
      style={{ left: cx, top: cy }}
    >
      {chip.display}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Canvas({
  nodes,
  triggerType,
  onEdit,
  onDelete,
  onDuplicate,
  onInsert,
  onAddFirst,
  onEditTrigger,
  className,
}: CanvasProps) {
  const reducedMotion = usePrefersReducedMotion();
  const layout = useMemo(() => computeMapLayout(nodes, triggerType), [nodes, triggerType]);
  const addButtons = useMemo(() => computeAddButtons(nodes, layout), [nodes, layout]);

  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Active inline + button: stores layout coords (picker rendered as fixed overlay)
  const [activeAdd, setActiveAdd] = useState<{ key: string; screenX: number; screenY: number; target: InsertTarget } | null>(null);

  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const outerClass = className ?? "relative h-[70vh] w-full overflow-hidden rounded-2xl border border-surface-mid bg-surface-low";

  const resetView = useCallback(() => { setPan({ x: 0, y: 0 }); setScale(1); }, []);

  // Convert layout-space coords to screen-space for the fixed picker
  const toScreen = useCallback((lx: number, ly: number) => {
    const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return {
      sx: rect.left + pan.x + lx * scale,
      sy: rect.top + pan.y + ly * scale,
    };
  }, [pan, scale]);

  const closeAdd = useCallback(() => setActiveAdd(null), []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    closeAdd();
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan, closeAdd]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s - e.deltaY * 0.0015)));
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta)));
  }, []);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (nodes.length === 0) {
    return (
      <div className={outerClass}>
        <div className="flex flex-col items-center justify-start pt-16">
          <div
            className={`rounded-2xl bg-primary-light border-2 border-primary/30 px-4 py-3 shadow-sm group ${onEditTrigger ? "cursor-pointer hover:border-primary/50 transition-colors" : ""}`}
            style={{ width: NODE_W }}
            onClick={onEditTrigger}
            role={onEditTrigger ? "button" : undefined}
            tabIndex={onEditTrigger ? 0 : undefined}
          >
            <div className="flex items-center gap-3">
              <span className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-primary text-white">
                <Zap size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-muted">When this happens</p>
                <p className="text-sm font-semibold text-on-surface truncate">{TRIGGER_LABELS[triggerType]}</p>
              </div>
              {onEditTrigger && (
                <Pencil size={12} className="shrink-0 text-on-surface-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>

          <div className="w-px h-10 bg-surface-mid" />

          {onAddFirst && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="w-9 h-9 rounded-full border-2 border-dashed border-surface-mid text-on-surface-muted hover:border-primary hover:text-primary transition-colors flex items-center justify-center"
                aria-label="Add first block"
              >
                {pickerOpen ? <X size={15} /> : <Plus size={16} />}
              </button>
              {pickerOpen && (
                <div className="absolute top-11 left-1/2 -translate-x-1/2 w-56 bg-surface border border-surface-mid rounded-2xl shadow-xl z-20 overflow-hidden">
                  <BlockPicker onSelect={(type) => { onAddFirst(type); setPickerOpen(false); }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const transition = reducedMotion || dragging ? "none" : "transform 120ms ease-out";

  return (
    <div className={outerClass} ref={containerRef}>
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 rounded-xl bg-surface border border-surface-mid p-1 shadow-sm">
        <button type="button" onClick={() => zoomBy(0.2)} className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors" aria-label="Zoom in">
          <Plus size={15} />
        </button>
        <button type="button" onClick={() => zoomBy(-0.2)} className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors" aria-label="Zoom out">
          <Minus size={15} />
        </button>
        <button type="button" onClick={resetView} className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors" aria-label="Reset view">
          <Maximize2 size={15} />
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3 z-10 text-[10px] text-on-surface-muted">
        Drag to pan · ⌘/Ctrl + scroll to zoom
      </p>

      {/* Pan + zoom canvas */}
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        role="presentation"
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transition,
          }}
        >
          {/* Edges */}
          <svg className="absolute left-0 top-0 pointer-events-none" width={layout.width} height={layout.height} aria-hidden="true">
            {layout.edges.map((edge) => (
              <path
                key={edge.key}
                d={edgePath(edge)}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={edge.label === "yes" ? "text-emerald-300" : edge.label === "no" ? "text-zinc-400" : edge.label ? "text-violet-300" : "text-surface-mid"}
              />
            ))}
          </svg>

          {/* Edge labels */}
          {layout.edges.map((edge) => (
            <EdgeLabelChip key={`lbl-${edge.key}`} edge={edge} />
          ))}

          {/* Inline + buttons between nodes */}
          {onInsert && addButtons.map((btn) => {
            const isActive = activeAdd?.key === btn.key;
            return (
              <div
                key={btn.key}
                className="absolute z-20 group/add"
                style={{ left: btn.x - 10, top: btn.y - 10, width: 20, height: 20 }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isActive) { closeAdd(); return; }
                    const { sx, sy } = toScreen(btn.x, btn.y);
                    setActiveAdd({ key: btn.key, screenX: sx, screenY: sy, target: btn.target });
                  }}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150 ${
                    isActive
                      ? "bg-primary border-primary text-white shadow-lg scale-125"
                      : "bg-surface border-surface-mid text-on-surface-muted opacity-0 group-hover/add:opacity-100 hover:border-primary hover:text-primary hover:scale-125 shadow-sm"
                  }`}
                  aria-label="Insert block"
                >
                  <Plus size={10} />
                </button>
              </div>
            );
          })}

          {/* Nodes */}
          {layout.nodes.map((node) =>
            node.kind === "trigger" ? (
              <TriggerNodeCard key={node.key} node={node} triggerType={triggerType} onEdit={onEditTrigger} />
            ) : (
              <BlockNodeCard
                key={node.key}
                node={node}
                active={selected === node.key}
                onSelect={() => setSelected((cur) => (cur === node.key ? null : node.key))}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            ),
          )}
        </div>
      </div>

      {/* Fixed picker overlay — outside transform div so it's not zoom-scaled */}
      {activeAdd && onInsert && (
        <div
          className="fixed z-50 w-56 bg-surface border border-surface-mid rounded-2xl shadow-xl overflow-hidden"
          style={{
            left: Math.max(8, activeAdd.screenX - 112),
            top: activeAdd.screenY + 14,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <BlockPicker
            onSelect={(type) => {
              onInsert(type, activeAdd.target);
              closeAdd();
            }}
          />
        </div>
      )}
    </div>
  );
}
