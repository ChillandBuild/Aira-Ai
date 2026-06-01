"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Power, ChevronLeft, ChevronRight } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import FlowBuilderCanvas, { LOGIC_BLOCKS, SEND_BLOCKS, SidebarGroup, TOOL_BLOCKS } from "./FlowBuilderCanvas";
import TriggerCard from "./TriggerCard";
import { rfToSteps } from "./rfUtils";
import type { FlowDetail, Step, StepIn, TriggerConfig, TriggerType } from "./types";

interface FlowEditorProps {
  flowId: string;
}

export default function FlowEditor({ flowId }: FlowEditorProps) {
  const router = useRouter();

  // Flow metadata
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(false);
  const [triggerType, setTriggerType] = useState<TriggerType>("lead_created");
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfig>({});

  // Raw flat steps from last API load — used to init the canvas
  const [steps, setSteps] = useState<Step[]>([]);
  const [saving, setSaving] = useState(false);

  // Latest RF-derived steps (updated on every canvas change)
  const rfStepsRef = useRef<StepIn[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const auth = await getAuthHeaders();
        const res = await fetch(`${API_URL}/api/v1/automations/${flowId}`, { headers: auth });
        if (!res.ok) { setError("Flow not found"); return; }
        const json: { data: FlowDetail } = await res.json();
        const d = json.data;
        setName(d.name);
        setActive(d.active);
        setTriggerType(d.trigger_type);
        setTriggerConfig(d.trigger_config || {});
        setSteps((d.steps || []) as Step[]);
      } catch {
        setError("Could not load this flow");
      } finally {
        setLoading(false);
      }
    })();
  }, [flowId]);

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const auth = await getAuthHeaders();
      const body = {
        name,
        active,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        steps: rfStepsRef.current,
      };
      const res = await fetch(`${API_URL}/api/v1/automations/${flowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json: { data: FlowDetail } = await res.json();
        if (json.data.steps) setSteps(json.data.steps as Step[]);
      }
    } finally {
      setSaving(false);
    }
  }, [flowId, name, active, triggerType, triggerConfig]);

  const handleStepsChange = useCallback((s: ReturnType<typeof rfToSteps>) => {
    rfStepsRef.current = s;
  }, []);

  // ── Active toggle (save immediately) ─────────────────────────────────
  const toggleActive = useCallback(async () => {
    const next = !active;
    setActive(next);
    const auth = await getAuthHeaders();
    await fetch(`${API_URL}/api/v1/automations/${flowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ active: next }),
    });
  }, [active, flowId]);

  // ── Loading / error states ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 left-[220px] bg-slate-50 flex items-center justify-center z-40">
        <div className="space-y-3 w-64">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-white/60 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 left-[220px] bg-slate-50 flex items-center justify-center z-40">
        <div className="text-center">
          <p className="text-sm text-zinc-500 mb-3">{error}</p>
          <button onClick={() => router.push("/dashboard/automations")} className="text-sm text-primary hover:underline">
            Back to Bot Flows
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 left-[220px] z-40 flex flex-col bg-slate-50">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-4 h-14 bg-white border-b border-zinc-200 shrink-0 shadow-sm z-10">
        <button
          onClick={() => router.push("/dashboard/automations")}
          className="shrink-0 p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Untitled flow"
          className="flex-1 min-w-0 px-2 py-1 text-[15px] font-semibold text-zinc-900 bg-transparent placeholder:text-zinc-400 focus:outline-none focus:bg-zinc-50 rounded-lg transition-colors"
        />

        <button
          onClick={toggleActive}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
            active
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
          }`}
        >
          <Power size={12} />
          {active ? "Active" : "Paused"}
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {saving ? "Saving…" : "Save"}
        </button>
      </header>

      {/* ── Body: sidebar + canvas ───────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left sidebar */}
        <aside
          className={`flex flex-col bg-white border-r border-zinc-200 shrink-0 z-10 transition-all duration-200 overflow-hidden ${
            sidebarOpen ? "w-56" : "w-10"
          }`}
        >
          <div className="flex items-center justify-end px-2 py-2 border-b border-zinc-100 shrink-0">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>

          {sidebarOpen && (
            <div className="flex-1 overflow-y-auto p-3 space-y-5">
              {/* Trigger section */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 px-1">
                  Trigger
                </p>
                <TriggerCard
                  triggerType={triggerType}
                  triggerConfig={triggerConfig}
                  onChange={setTriggerConfig}
                />
              </div>

              <SidebarGroup title="Send" items={SEND_BLOCKS} />
              <SidebarGroup title="Logic" items={LOGIC_BLOCKS} />
              <SidebarGroup title="Tools" items={TOOL_BLOCKS} />

              <p className="text-[10px] text-zinc-400 px-1 pb-2">
                Drag blocks onto the canvas. Double-click to configure.
              </p>
            </div>
          )}
        </aside>

        {/* React Flow canvas */}
        <div className="flex-1 relative min-w-0">
          <FlowBuilderCanvas
            steps={steps}
            triggerType={triggerType}
            triggerConfig={triggerConfig}
            onStepsChange={handleStepsChange}
          />
        </div>
      </div>
    </div>
  );
}
