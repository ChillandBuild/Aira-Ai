"use client";
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Zap, Plus, Minus, Maximize2 } from "lucide-react";
import { BLOCK_META, blockSummary, TRIGGER_LABELS } from "./blockMeta";
import { computeMapLayout, NODE_W, NODE_H, type MapNode, type MapEdge } from "./mapLayout";
import type { FlowNode, TriggerType, TriggerConfig } from "./types";

interface MapViewProps {
  nodes: FlowNode[];
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  onEdit?: (nodeId: string) => void;
}

interface Pan {
  x: number;
  y: number;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 1.6;

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

// Elbow path: down out of parent, across, down into child.
function edgePath(edge: MapEdge): string {
  const midY = edge.fromY + (edge.toY - edge.fromY) / 2;
  return `M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${midY}, ${edge.toX} ${midY}, ${edge.toX} ${edge.toY}`;
}

function TriggerNodeCard({ node, triggerType }: { node: MapNode; triggerType: TriggerType }) {
  return (
    <div
      className="absolute rounded-2xl bg-primary-light border-2 border-primary/30 px-4 py-3 shadow-sm"
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
    >
      <div className="flex items-center gap-3 h-full">
        <span className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-primary text-white">
          <Zap size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-muted">When this happens</p>
          <p className="text-sm font-semibold text-on-surface truncate">{TRIGGER_LABELS[triggerType]}</p>
        </div>
      </div>
    </div>
  );
}

function BlockNodeCard({ node, active, onSelect, onEdit }: { node: MapNode; active: boolean; onSelect: () => void; onEdit?: (id: string) => void }) {
  if (!node.stepType) return null;
  const meta = BLOCK_META[node.stepType];
  const Icon = meta.icon;
  const summary = blockSummary(node.stepType, node.config ?? {});
  const hasStats = (node.sentCount ?? 0) > 0 || (node.deliveredCount ?? 0) > 0 || (node.errorCount ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={() => { onSelect(); onEdit?.(node.key); }}
      className={`absolute text-left rounded-2xl bg-surface border p-3.5 transition-colors ${
        active ? "border-primary shadow-md ring-2 ring-primary/20" : "border-surface-mid hover:border-primary/30 hover:shadow-sm"
      }`}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
    >
      <div className="flex items-start gap-3">
        <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${meta.iconBg} ${meta.iconText}`}>
          <Icon size={17} />
        </span>
        <div className="flex-1 min-w-0">
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
  );
}

function EdgeLabelChip({ edge }: { edge: MapEdge }) {
  if (!edge.label) return null;
  const isYes = edge.label === "yes";
  const cx = edge.fromX + (edge.toX - edge.fromX) / 2;
  const cy = edge.fromY + (edge.toY - edge.fromY) / 2;
  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        isYes ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
      }`}
      style={{ left: cx, top: cy }}
    >
      {isYes ? "yes" : "no"}
    </div>
  );
}

export default function MapView({ nodes, triggerType, onEdit }: MapViewProps) {
  const reducedMotion = usePrefersReducedMotion();
  const layout = useMemo(() => computeMapLayout(nodes, triggerType), [nodes, triggerType]);

  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const resetView = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setScale(1);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pan],
  );

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

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-mid bg-surface-low py-16 text-center">
        <span className="w-12 h-12 rounded-2xl bg-surface-mid flex items-center justify-center mb-3">
          <Maximize2 size={20} className="text-on-surface-muted" />
        </span>
        <p className="text-sm font-medium text-on-surface">Nothing to map yet</p>
        <p className="text-xs text-on-surface-muted mt-1">Add blocks in the editor to see the map.</p>
      </div>
    );
  }

  const transition = reducedMotion || dragging ? "none" : "transform 120ms ease-out";

  return (
    <div className="relative h-[70vh] w-full overflow-hidden rounded-2xl border border-surface-mid bg-surface-low">
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 rounded-xl bg-surface border border-surface-mid p-1 shadow-sm">
        <button
          type="button"
          onClick={() => zoomBy(0.2)}
          className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors"
          aria-label="Zoom in"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-0.2)}
          className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors"
          aria-label="Zoom out"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors"
          aria-label="Reset view"
        >
          <Maximize2 size={15} />
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3 z-10 text-[10px] text-on-surface-muted">
        Drag to pan · ⌘/Ctrl + scroll to zoom · read-only
      </p>

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
          {/* Edge layer */}
          <svg
            className="absolute left-0 top-0 pointer-events-none"
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            {layout.edges.map((edge) => (
              <path
                key={edge.key}
                d={edgePath(edge)}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={edge.label === "yes" ? "text-emerald-300" : edge.label === "no" ? "text-zinc-300" : "text-surface-mid"}
              />
            ))}
          </svg>

          {/* Edge labels */}
          {layout.edges.map((edge) => (
            <EdgeLabelChip key={`lbl-${edge.key}`} edge={edge} />
          ))}

          {/* Node layer */}
          {layout.nodes.map((node) =>
            node.kind === "trigger" ? (
              <TriggerNodeCard key={node.key} node={node} triggerType={triggerType} />
            ) : (
              <BlockNodeCard
                key={node.key}
                node={node}
                active={selected === node.key}
                onSelect={() => setSelected((cur) => (cur === node.key ? null : node.key))}
                onEdit={onEdit}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
