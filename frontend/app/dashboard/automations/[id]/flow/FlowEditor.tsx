"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, Loader2, Power, X,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { useFlow } from "./useFlow";
import MapView from "./MapView";
import TriggerCard from "./TriggerCard";
import BlockConfigDrawer from "./drawers/BlockConfigDrawer";
import { BLOCK_META } from "./blockMeta";
import type { BlockConfig, BlockType, FlowNode } from "./types";

// ── Block palette groups ──────────────────────────────────────────────────────
const SEND_BLOCKS: BlockType[] = [
  "send_message", "send_image", "send_video", "send_audio",
  "send_file", "send_location", "cta_url", "send_template",
  "send_list", "send_catalog",
];
const LOGIC_BLOCKS: BlockType[] = ["wait", "condition", "user_input", "interactive", "ai_agent"];
const TOOLS_BLOCKS: BlockType[] = ["add_label", "http_api", "random"];

function PaletteItem({
  type, collapsed, onAdd,
}: { type: BlockType; collapsed: boolean; onAdd: (t: BlockType) => void }) {
  const meta = BLOCK_META[type];
  const Icon = meta.icon;
  return (
    <button
      onClick={() => onAdd(type)}
      title={collapsed ? meta.label : undefined}
      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-all hover:bg-surface-mid active:scale-95 ${collapsed ? "justify-center" : ""}`}
    >
      <span className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ${meta.iconBg} ${meta.iconText}`}>
        <Icon size={15} />
      </span>
      {!collapsed && (
        <span className="text-[13px] font-semibold text-on-surface truncate">{meta.label}</span>
      )}
    </button>
  );
}

function PaletteGroup({
  title, types, collapsed, onAdd,
}: { title: string; types: BlockType[]; collapsed: boolean; onAdd: (t: BlockType) => void }) {
  return (
    <div>
      {!collapsed && (
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-primary/70 mb-1.5 px-2.5">{title}</p>
      )}
      <div className="space-y-0.5">
        {types.map((t) => <PaletteItem key={t} type={t} collapsed={collapsed} onAdd={onAdd} />)}
      </div>
    </div>
  );
}

function findNodeById(nodes: FlowNode[], id: string): FlowNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    for (const lane of Object.values(n.branches)) {
      const found = findNodeById(lane, id);
      if (found) return found;
    }
  }
  return null;
}

interface FlowEditorProps {
  flowId: string;
}

export default function FlowEditor({ flowId }: FlowEditorProps) {
  const router = useRouter();
  const flow = useFlow(flowId);
  const [editing, setEditing] = useState<FlowNode | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const addToEnd = useCallback((type: BlockType) => {
    flow.addBlock(type, { parentId: null, branch: null, position: flow.tree.length });
  }, [flow]);

  const handleSaveConfig = (config: BlockConfig) => {
    if (editing) flow.updateBlockConfig(editing.id, config);
  };

  const handleMapEdit = useCallback((nodeId: string) => {
    const node = findNodeById(flow.tree, nodeId);
    if (node) {
      setEditing(node);
      setTriggerOpen(false);
    }
  }, [flow.tree]);

  const handleEditTrigger = useCallback(() => {
    setTriggerOpen(true);
    setEditing(null);
  }, []);

  if (flow.loading) {
    return (
      <div className="fixed inset-0 z-50 bg-surface flex items-center justify-center">
        <div className="space-y-3 w-64">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-surface-mid animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (flow.error && !flow.name) {
    return (
      <div className="fixed inset-0 z-50 bg-surface flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-on-surface-muted mb-3">{flow.error}</p>
          <button onClick={() => router.push("/dashboard/automations")} className="text-sm text-primary hover:underline">
            Back to Bot Flows
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-4 h-14 bg-surface border-b border-surface-mid shrink-0 z-10">
        <button
          onClick={() => router.push("/dashboard/automations")}
          className="shrink-0 p-2 rounded-xl text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>

        <input
          value={flow.name}
          onChange={(e) => flow.setName(e.target.value)}
          placeholder="Untitled flow"
          className="flex-1 min-w-0 px-2 py-1 text-[15px] font-semibold text-on-surface bg-transparent placeholder:text-on-surface-muted focus:outline-none focus:bg-surface-mid rounded-lg transition-colors"
        />

        <button
          onClick={() => flow.setActive(!flow.active)}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
            flow.active
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              : "bg-surface-mid text-on-surface-muted hover:bg-surface-mid/70"
          }`}
        >
          <Power size={12} />
          {flow.active ? "Active" : "Paused"}
        </button>

        <button
          onClick={flow.save}
          disabled={!flow.dirty || flow.saving}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
            flow.dirty && !flow.saving
              ? "bg-primary text-white hover:bg-primary/90"
              : "bg-surface-mid text-on-surface-muted cursor-default"
          }`}
        >
          {flow.saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {flow.saving ? "Saving" : flow.dirty ? "Save" : "Saved"}
        </button>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 relative">

        {/* Left palette sidebar */}
        <aside
          className={`flex flex-col bg-surface border-r border-surface-mid shrink-0 transition-all duration-200 overflow-hidden z-10 ${
            sidebarOpen ? "w-64" : "w-12"
          }`}
        >
          <div className={`flex items-center h-12 px-3 border-b border-surface-mid shrink-0 ${sidebarOpen ? "justify-between" : "justify-center"}`}>
            {sidebarOpen && (
              <span className="text-[13px] font-bold text-on-surface tracking-tight">Blocks</span>
            )}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors"
              title={sidebarOpen ? "Collapse" : "Expand"}
            >
              {sidebarOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
            <PaletteGroup title="Send" types={SEND_BLOCKS} collapsed={!sidebarOpen} onAdd={addToEnd} />
            <PaletteGroup title="Logic" types={LOGIC_BLOCKS} collapsed={!sidebarOpen} onAdd={addToEnd} />
            <PaletteGroup title="Tools" types={TOOLS_BLOCKS} collapsed={!sidebarOpen} onAdd={addToEnd} />
          </div>
        </aside>

        {/* Main canvas — always the map view */}
        <div className="flex-1 overflow-hidden relative">
          <MapView
            nodes={flow.tree}
            triggerType={flow.triggerType}
            triggerConfig={flow.triggerConfig}
            onEdit={handleMapEdit}
            onDelete={flow.deleteBlock}
            onInsert={flow.addBlock}
            onAddFirst={addToEnd}
            onEditTrigger={handleEditTrigger}
            className="absolute inset-0 bg-surface-low"
          />
        </div>

        {/* Trigger settings panel — slides in from right */}
        {triggerOpen && (
          <div className="absolute inset-y-0 right-0 z-20 w-80 bg-surface border-l border-surface-mid shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-mid shrink-0">
              <span className="text-sm font-semibold text-on-surface">Trigger</span>
              <button
                onClick={() => setTriggerOpen(false)}
                className="p-1.5 rounded-lg text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <TriggerCard
                triggerType={flow.triggerType}
                triggerConfig={flow.triggerConfig}
                onChange={flow.setTriggerConfig}
              />
            </div>
          </div>
        )}
      </div>

      {editing && (
        <BlockConfigDrawer node={editing} onSave={handleSaveConfig} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
