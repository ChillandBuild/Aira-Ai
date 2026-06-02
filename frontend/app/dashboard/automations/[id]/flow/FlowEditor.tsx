"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, List, Map, Power } from "lucide-react";
import { useFlow } from "./useFlow";
import FlowCanvas from "./FlowCanvas";
import MapView from "./MapView";
import TriggerCard from "./TriggerCard";
import BlockConfigDrawer from "./drawers/BlockConfigDrawer";
import type { BlockConfig, FlowNode } from "./types";

interface FlowEditorProps {
  flowId: string;
}

export default function FlowEditor({ flowId }: FlowEditorProps) {
  const router = useRouter();
  const flow = useFlow(flowId);
  const [editing, setEditing] = useState<FlowNode | null>(null);
  const [view, setView] = useState<"stack" | "map">("stack");

  if (flow.loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-3">
        <div className="h-12 rounded-2xl bg-surface-subtle animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-surface-subtle animate-pulse" />
        ))}
      </div>
    );
  }

  if (flow.error && !flow.name) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-on-surface-muted">{flow.error}</p>
        <button onClick={() => router.push("/dashboard/automations")} className="mt-3 text-sm text-primary hover:underline">
          Back to Bot Flows
        </button>
      </div>
    );
  }

  const handleSaveConfig = (config: BlockConfig) => {
    if (editing) flow.updateBlockConfig(editing.id, config);
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-surface-mid">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <button
            onClick={() => router.push("/dashboard/automations")}
            className="shrink-0 p-2 rounded-xl text-on-surface-muted hover:bg-surface-mid hover:text-on-surface transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <input
            value={flow.name}
            onChange={(e) => flow.setName(e.target.value)}
            placeholder="Untitled flow"
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-transparent text-base font-semibold text-on-surface placeholder:text-on-surface-muted focus:outline-none focus:bg-surface-mid transition-colors"
          />

          <button
            onClick={() => flow.setActive(!flow.active)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              flow.active
                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                : "bg-surface-mid text-on-surface-muted hover:bg-surface-mid/70"
            }`}
            title={flow.active ? "Flow is live" : "Flow is paused"}
          >
            <Power size={13} />
            {flow.active ? "Active" : "Paused"}
          </button>

          <button
            onClick={() => setView((v) => (v === "stack" ? "map" : "stack"))}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              view === "map"
                ? "bg-primary-light text-primary"
                : "bg-surface-mid text-on-surface-muted hover:bg-surface-mid/70 hover:text-on-surface"
            }`}
            title={view === "map" ? "Switch to editor" : "View flow map"}
          >
            {view === "map" ? <List size={13} /> : <Map size={13} />}
            <span className="hidden sm:inline">{view === "map" ? "Editor" : "Map"}</span>
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
            {flow.saving ? <Loader2 size={13} className="animate-spin" /> : flow.dirty ? <Check size={13} /> : <Check size={13} />}
            {flow.saving ? "Saving" : flow.dirty ? "Save" : "Saved"}
          </button>
        </div>
        {flow.dirty && (
          <div className="max-w-2xl mx-auto px-4 pb-2">
            <span className="text-[11px] text-amber-600">Unsaved changes</span>
          </div>
        )}
      </header>

      {/* Canvas */}
      {view === "map" ? (
        <main className="max-w-5xl mx-auto px-4 py-6">
          <MapView nodes={flow.tree} triggerType={flow.triggerType} triggerConfig={flow.triggerConfig} />
        </main>
      ) : (
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-1">
          <TriggerCard triggerType={flow.triggerType} triggerConfig={flow.triggerConfig} onChange={flow.setTriggerConfig} />

          {flow.tree.length === 0 ? (
            <div className="pt-2">
              <p className="text-center text-xs text-on-surface-muted mb-3 mt-4">Then the bot will…</p>
              <FlowCanvas
                tree={flow.tree}
                onAdd={flow.addBlock}
                onEdit={setEditing}
                onDuplicate={flow.duplicateBlock}
                onDelete={flow.deleteBlock}
                onMove={flow.moveBlock}
                updateBlockConfig={flow.updateBlockConfig}
              />
            </div>
          ) : (
            <FlowCanvas
              tree={flow.tree}
              onAdd={flow.addBlock}
              onEdit={setEditing}
              onDuplicate={flow.duplicateBlock}
              onDelete={flow.deleteBlock}
              onMove={flow.moveBlock}
              updateBlockConfig={flow.updateBlockConfig}
            />
          )}
        </main>
      )}

      {editing && <BlockConfigDrawer node={editing} onSave={handleSaveConfig} onClose={() => setEditing(null)} />}
    </div>
  );
}
