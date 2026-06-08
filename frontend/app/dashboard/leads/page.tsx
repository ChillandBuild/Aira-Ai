"use client";
import { toast } from "sonner";
import { useEffect, useState, useCallback } from "react";
import { api, Lead, Caller, SegmentTemplate, BroadcastResult, BroadcastHistoryItem, ReengagementStep, getAuthHeaders, API_URL } from "@/lib/api";
import { Download, Send, Save, Pencil, Plus, X, Loader2, Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo, formatPhone } from "@/lib/utils";
import { useAuthRole } from "../contexts/AuthRoleContext";
import { AssignButton } from "./AssignButton";

interface WabaTemplate {
  id: string;
  name: string;
  category: string;
  status: string;
}

function NameCell({ lead, onUpdate }: { lead: Lead; onUpdate: (l: Lead) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(lead.name || "");

  async function save() {
    setEditing(false);
    const trimmed = value.trim();
    if (!trimmed || trimmed === (lead.name || "")) return;
    try {
      const updated = await api.leads.update(lead.id, { name: trimmed });
      onUpdate(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
      setValue(lead.name || "");
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(lead.name || "");
            setEditing(false);
          }
        }}
        className="font-body text-sm text-on-surface bg-surface-low px-2 py-0.5 rounded border border-tertiary focus:outline-none focus:ring-1 focus:ring-tertiary w-40"
      />
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setValue(lead.name || "");
        setEditing(true);
      }}
      className="group flex items-center gap-1.5 font-body text-sm text-on-surface"
      title="Click to rename"
    >
      <span className={lead.name ? "" : "text-on-surface-muted italic"}>
        {lead.name || "Add name"}
      </span>
      <Pencil size={11} className="opacity-0 group-hover:opacity-60 text-on-surface-muted" />
    </button>
  );
}

const SEGMENTS = ["A", "B", "C", "D"] as const;

const SEGMENT_LABELS: Record<string, string> = {
  A: "Hot",
  B: "Warm",
  C: "Cold",
  D: "Disqualified",
};

function ComposeModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!phone.trim() || !message.trim()) {
      setError("Phone and message are required");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.leads.compose(phone.trim(), message.trim(), name.trim() || undefined);
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-surface rounded-card shadow-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg font-bold text-tertiary">New WhatsApp Message</h3>
          <button onClick={onClose} className="text-on-surface-muted hover:text-on-surface">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="font-label text-xs font-semibold text-on-surface-muted uppercase tracking-wider">
              Phone Number
            </label>
            <input
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
              className="mt-1 w-full px-4 py-2.5 bg-surface-low rounded-xl font-body text-sm border border-surface-mid focus:ring-2 focus:ring-tertiary focus:outline-none"
            />
          </div>

          <div>
            <label className="font-label text-xs font-semibold text-on-surface-muted uppercase tracking-wider">
              Name <span className="text-on-surface-muted/60 normal-case">(optional)</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lead name"
              className="mt-1 w-full px-4 py-2.5 bg-surface-low rounded-xl font-body text-sm border border-surface-mid focus:ring-2 focus:ring-tertiary focus:outline-none"
            />
          </div>

          <div>
            <label className="font-label text-xs font-semibold text-on-surface-muted uppercase tracking-wider">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Hello! ..."
              className="mt-1 w-full px-4 py-2.5 bg-surface-low rounded-xl font-body text-sm border border-surface-mid focus:ring-2 focus:ring-tertiary focus:outline-none resize-none"
            />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
            <p className="font-label text-xs text-amber-800 leading-relaxed">
              <strong>Heads up:</strong> If this person hasn&apos;t messaged you in the last 24 hours, WhatsApp requires an <strong>approved template message</strong> — freeform text will fail. Use the Templates page to send templated outreach.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100">
              <p className="font-label text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-surface-low text-on-surface-muted rounded-xl font-label text-sm font-semibold hover:bg-surface-mid"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const { role } = useAuthRole();
  const [tab, setTab] = useState<typeof SEGMENTS[number]>("A");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Record<string, SegmentTemplate>>({});
  const [draft, setDraft] = useState("");
  const [savingTpl, setSavingTpl] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [lastResult, setLastResult] = useState<BroadcastResult | null>(null);
  const [composing, setComposing] = useState(false);
  const [callers, setCallers] = useState<Caller[]>([]);

  // Filtering states
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedBroadcastId, setSelectedBroadcastId] = useState("");
  const [campaigns, setCampaigns] = useState<{ id: string; campaign_name: string; platform: string }[]>([]);
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastHistoryItem[]>([]);

  // Re-engagement states
  const [reengagementSteps, setReengagementSteps] = useState<ReengagementStep[]>([]);
  const [wabaTemplates, setWabaTemplates] = useState<WabaTemplate[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);

  // Form states
  const [stepDelayHours, setStepDelayHours] = useState<number>(6);
  const [stepTargetSegments, setStepTargetSegments] = useState<string[]>(["C"]);
  const [stepMessageType, setStepMessageType] = useState<"freeform" | "template">("freeform");
  const [stepMessageContent, setStepMessageContent] = useState("");
  const [stepTemplateName, setStepTemplateName] = useState("");
  const [stepTemplateVariables, setStepTemplateVariables] = useState<string[]>([]);

  useEffect(() => {
    api.callers.list().then((data: Caller[]) => setCallers(data.filter((c) => c.active))).catch(() => {});
    api.inboundLeads.campaigns().then(setCampaigns).catch(() => {});
    api.broadcasts.history().then(setBroadcastHistory).catch(() => {});

    // Fetch WABA templates
    getAuthHeaders().then(auth => {
      fetch(`${API_URL}/api/v1/templates`, { headers: auth })
        .then(r => r.json())
        .then((res: { data: WabaTemplate[] }) => {
          setWabaTemplates((res.data || []).filter((t: WabaTemplate) => t.status === "APPROVED"));
        })
        .catch(() => {});
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Parameters<typeof api.leads.list>[0] = { segment: tab, limit: 200 };
    if (sourceFilter !== "ALL") {
      params.source_filter = sourceFilter.toLowerCase();
      if (sourceFilter === "META_ADS" && selectedCampaignId) {
        params.ad_campaign_id = selectedCampaignId;
      } else if (sourceFilter === "BROADCAST" && selectedBroadcastId) {
        params.broadcast_id = selectedBroadcastId;
      }
    }
    api.leads.list(params).then(setLeads).finally(() => setLoading(false));
    setLastResult(null);
  }, [tab, sourceFilter, selectedCampaignId, selectedBroadcastId]);

  // Re-engagement side effects
  const fetchReengagementSteps = useCallback(async () => {
    if (sourceFilter === "BROADCAST" && selectedBroadcastId) {
      setLoadingSteps(true);
      try {
        const steps = await api.reengagement.listSteps({ type: "broadcast", broadcast_id: selectedBroadcastId });
        setReengagementSteps(steps);
      } catch {
        toast.error("Failed to load re-engagement steps");
      } finally {
        setLoadingSteps(false);
      }
    } else if (sourceFilter === "INBOUND") {
      setLoadingSteps(true);
      try {
        const steps = await api.reengagement.listSteps({ type: "inbound" });
        setReengagementSteps(steps);
      } catch {
        toast.error("Failed to load re-engagement steps");
      } finally {
        setLoadingSteps(false);
      }
    } else {
      setReengagementSteps([]);
    }
  }, [sourceFilter, selectedBroadcastId]);

  useEffect(() => {
    fetchReengagementSteps();
  }, [fetchReengagementSteps]);

  async function handleAddStep() {
    if (stepTargetSegments.length === 0) {
      toast.error("Select at least one target segment");
      return;
    }
    if (stepMessageType === "freeform" && !stepMessageContent.trim()) {
      toast.error("Message content is required for freeform messages");
      return;
    }
    if (stepMessageType === "template" && !stepTemplateName) {
      toast.error("Select a template");
      return;
    }

    try {
      const payload: Parameters<typeof api.reengagement.createStep>[0] = {
        type: sourceFilter === "INBOUND" ? "inbound" : "broadcast",
        delay_hours: stepDelayHours,
        target_segments: stepTargetSegments,
        message_type: stepMessageType,
        message_content: stepMessageType === "freeform" ? stepMessageContent : null,
        template_name: stepMessageType === "template" ? stepTemplateName : null,
        template_variables: stepMessageType === "template" ? stepTemplateVariables.filter(Boolean) : null,
        broadcast_id: sourceFilter === "BROADCAST" ? selectedBroadcastId : null,
      };

      await api.reengagement.createStep(payload);
      toast.success("Re-engagement step added");
      setShowAddStep(false);
      
      // Reset form
      setStepDelayHours(6);
      setStepTargetSegments(["C"]);
      setStepMessageType("freeform");
      setStepMessageContent("");
      setStepTemplateName("");
      setStepTemplateVariables([]);

      fetchReengagementSteps();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create re-engagement step");
    }
  }

  async function handleDeleteStep(stepId: string) {
    if (!confirm("Are you sure you want to delete this re-engagement step?")) return;
    try {
      await api.reengagement.deleteStep(stepId);
      toast.success("Re-engagement step deleted");
      fetchReengagementSteps();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete step");
    }
  }

  useEffect(() => {
    api.segments.templates().then((rows) => {
      const map: Record<string, SegmentTemplate> = {};
      rows.forEach((r) => (map[r.segment] = r));
      setTemplates(map);
    });
  }, []);

  useEffect(() => {
    setDraft(templates[tab]?.message ?? "");
  }, [tab, templates]);

  async function saveTemplate() {
    setSavingTpl(true);
    try {
      const updated = await api.segments.saveTemplate(tab, draft);
      setTemplates((prev) => ({ ...prev, [tab]: updated }));
    } finally {
      setSavingTpl(false);
    }
  }

  async function broadcast() {
    if (!draft.trim()) return;
    const targetLabel = sourceFilter !== "ALL" ? "filtered" : `${SEGMENT_LABELS[tab]}`;
    if (!confirm(`Send this message to all ${targetLabel} leads?`)) return;
    setBroadcasting(true);
    setLastResult(null);
    try {
      if (sourceFilter !== "ALL") {
        const payload: Parameters<typeof api.leads.broadcast>[0] = {
          message: draft,
          segment: tab,
          source_filter: sourceFilter.toLowerCase(),
        };
        if (sourceFilter === "META_ADS" && selectedCampaignId) {
          payload.ad_campaign_id = selectedCampaignId;
        } else if (sourceFilter === "BROADCAST" && selectedBroadcastId) {
          payload.broadcast_id = selectedBroadcastId;
        }
        const result = await api.leads.broadcast(payload);
        setLastResult(result);
      } else {
        if (draft !== templates[tab]?.message) await saveTemplate();
        const result = await api.segments.broadcast(tab);
        setLastResult(result);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setBroadcasting(false);
    }
  }

  function format24hWindow(lastInboundAt?: string | null) {
    if (!lastInboundAt) return <span className="text-on-surface-muted/50">—</span>;
    const lastInbound = new Date(lastInboundAt).getTime();
    const now = new Date().getTime();
    const diffMs = now - lastInbound;
    const hoursLeft = 24 - diffMs / (1000 * 60 * 60);

    if (hoursLeft <= 0) {
      return (
        <span className="inline-flex items-center font-label text-[10px] font-bold text-red-600 bg-red-50/50 px-2 py-0.5 rounded-full border border-red-100">
          Expired
        </span>
      );
    }

    const h = Math.floor(hoursLeft);
    const m = Math.floor((hoursLeft - h) * 60);
    if (h === 0) {
      return (
        <span className="inline-flex items-center font-label text-[10px] font-bold text-amber-600 bg-amber-50/50 px-2 py-0.5 rounded-full border border-amber-100 animate-pulse">
          {m}m left
        </span>
      );
    }
    return (
      <span className="inline-flex items-center font-label text-[10px] font-bold text-emerald-600 bg-emerald-50/50 px-2 py-0.5 rounded-full border border-emerald-100">
        {h}h {m}m left
      </span>
    );
  }

  function getBroadcastWindowText(timestamp: string): string {
    const lastBroadcast = new Date(timestamp).getTime();
    const now = new Date().getTime();
    const diffMs = now - lastBroadcast;
    const hoursLeft = 24 - diffMs / (1000 * 60 * 60);

    if (hoursLeft <= 0) {
      return "Expired";
    }

    const h = Math.floor(hoursLeft);
    const m = Math.floor((hoursLeft - h) * 60);
    if (h === 0) {
      return `${m}m left`;
    }
    return `${h}h ${m}m left`;
  }

  function formatIndianTime(dateInput: Date | string | number): string {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return "Invalid Date";
    
    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    
    try {
      const formatter = new Intl.DateTimeFormat("en-IN", options);
      return formatter.format(date) + " IST";
    } catch {
      return date.toLocaleString() + " IST";
    }
  }

  function getSimulatedInboundTrigger(delayHours: number): { timeStr: string; windowStr: string; isOpen: boolean } {
    const mockInbound = new Date();
    mockInbound.setHours(10, 0, 0, 0); // 10:00 AM Today
    const triggerTime = new Date(mockInbound.getTime() + delayHours * 60 * 60 * 1000);
    const isOpen = delayHours < 24;
    
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    
    let timeStr = "";
    try {
      timeStr = new Intl.DateTimeFormat("en-IN", options).format(triggerTime);
    } catch {
      timeStr = triggerTime.toLocaleString();
    }
    
    const relativeDay = triggerTime.getDate() === mockInbound.getDate() ? "Today" : "Tomorrow";
    const formattedTime = `${relativeDay}, ${timeStr.split(",")[1]?.trim() || timeStr}`;
    
    return {
      timeStr: formattedTime,
      windowStr: isOpen ? `Open (${24 - delayHours}h left)` : "Expired (Must use Template)",
      isOpen,
    };
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-tertiary">Segments</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setComposing(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-white rounded-xl font-label text-sm font-semibold hover:bg-secondary/90 transition-colors"
          >
            <Plus size={16} />
            New Message
          </button>
          <button
            onClick={async () => {
              try {
                await api.leads.exportLeads(tab);
                toast.success("Export downloaded");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Export failed");
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 transition-colors"
          >
            <Download size={16} />
            Export {SEGMENT_LABELS[tab]}
          </button>
        </div>
      </div>

      {composing && (
        <ComposeModal
          onClose={() => setComposing(false)}
          onSent={() => {
            const params: Parameters<typeof api.leads.list>[0] = { segment: tab, limit: 200 };
            if (sourceFilter !== "ALL") {
              params.source_filter = sourceFilter.toLowerCase();
              if (sourceFilter === "META_ADS" && selectedCampaignId) {
                params.ad_campaign_id = selectedCampaignId;
              } else if (sourceFilter === "BROADCAST" && selectedBroadcastId) {
                params.broadcast_id = selectedBroadcastId;
              }
            }
            api.leads.list(params).then(setLeads);
          }}
        />
      )}

      <div>
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {/* Segment tabs */}
          <div className="flex gap-1 bg-surface-mid p-1 rounded-xl w-fit">
            {SEGMENTS.map((seg) => (
              <button
                key={seg}
                onClick={() => setTab(seg)}
                className={`px-5 py-2 rounded-lg font-label text-sm font-semibold transition-all ${
                  tab === seg ? "bg-surface shadow-card text-tertiary" : "text-on-surface-muted hover:text-on-surface"
                }`}
              >
                {SEGMENT_LABELS[seg]}
              </button>
            ))}
          </div>

          {/* Source Filter Dropdown */}
          <div className="flex items-center gap-2 bg-surface p-2.5 rounded-xl border border-surface-mid/80 shadow-sm">
            <span className="font-label text-xs text-on-surface-muted font-bold uppercase tracking-wider">Source:</span>
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setSelectedCampaignId("");
                setSelectedBroadcastId("");
              }}
              className="bg-transparent font-body text-xs font-semibold text-tertiary focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Leads</option>
              <option value="INBOUND">Inbound Leads</option>
              <option value="ORGANIC">Organic Inbound</option>
              <option value="META_ADS">Meta Ads</option>
              <option value="BROADCAST">Broadcast Specific</option>
            </select>
          </div>

          {/* Conditional Campaign Dropdown */}
          {sourceFilter === "META_ADS" && campaigns.length > 0 && (
            <div className="flex items-center gap-2 bg-surface p-2.5 rounded-xl border border-surface-mid/80 shadow-sm animate-slide-up">
              <span className="font-label text-xs text-on-surface-muted font-bold uppercase tracking-wider shrink-0">Campaign:</span>
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="bg-transparent font-body text-xs font-semibold text-tertiary focus:outline-none max-w-[300px] pr-6 cursor-pointer"
              >
                <option value="">Select Campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaign_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Conditional Broadcast Dropdown */}
          {sourceFilter === "BROADCAST" && broadcastHistory.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 animate-slide-up">
              <div className="flex items-center gap-2 bg-surface p-2.5 rounded-xl border border-surface-mid/80 shadow-sm">
                <span className="font-label text-xs text-on-surface-muted font-bold uppercase tracking-wider shrink-0">Broadcast:</span>
                <select
                  value={selectedBroadcastId}
                  onChange={(e) => setSelectedBroadcastId(e.target.value)}
                  className="bg-transparent font-body text-xs font-semibold text-tertiary focus:outline-none max-w-[340px] pr-6 cursor-pointer"
                >
                  <option value="">Select Broadcast</option>
                  {broadcastHistory.map((h) => (
                    <option key={h.broadcast_id} value={h.broadcast_id}>
                      {h.template_name} ({new Date(h.timestamp).toLocaleDateString()} · {getBroadcastWindowText(h.timestamp)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Broadcast 24h Window Badge */}
              {(() => {
                const selectedBroadcast = broadcastHistory.find(h => h.broadcast_id === selectedBroadcastId);
                if (!selectedBroadcast) return null;
                const windowText = getBroadcastWindowText(selectedBroadcast.timestamp);
                return (
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl border font-label text-xs font-bold shadow-sm",
                    windowText === "Expired"
                      ? "bg-red-50 text-red-600 border-red-100"
                      : "bg-emerald-50 text-emerald-600 border-emerald-100"
                  )}>
                    <Clock size={12} />
                    <span>Broadcast Window: {windowText}</span>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Re-engagement Panel */}
        {(sourceFilter === "INBOUND" || (sourceFilter === "BROADCAST" && selectedBroadcastId)) && (
          <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 mb-6">
            <div className="flex items-center justify-between mb-4 border-b border-surface-mid pb-3">
              <div>
                <h2 className="font-display text-base font-bold text-tertiary">
                  {sourceFilter === "INBOUND" ? "Inbound Automated Re-engagement" : "Broadcast Re-engagement Workflow"}
                </h2>
                <p className="font-body text-xs text-on-surface-muted mt-0.5">
                  {sourceFilter === "INBOUND"
                    ? "Trigger automatic messages after a lead's last inbound reply"
                    : "Trigger automatic follow-ups at custom intervals relative to the broadcast send time"}
                </p>
              </div>
              <button
                onClick={() => setShowAddStep(!showAddStep)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 transition-colors shadow-sm"
              >
                {showAddStep ? <X size={13} /> : <Plus size={13} />}
                {showAddStep ? "Cancel" : "Add Step"}
              </button>
            </div>

            {showAddStep && (
              <div className="bg-surface-low border border-surface-mid/85 rounded-xl p-5 mb-5 space-y-4 animate-slide-up">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Delay Hours */}
                  <div>
                    <label className="block font-label text-xs font-bold text-on-surface-muted uppercase tracking-wider mb-2">
                      Trigger Delay (Hours)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={stepDelayHours}
                      onChange={(e) => setStepDelayHours(parseInt(e.target.value) || 1)}
                      className="w-full px-4 py-2 bg-surface rounded-xl font-body text-sm text-on-surface border border-surface-mid focus:ring-2 focus:ring-tertiary outline-none"
                    />
                  </div>

                  {/* Target Segments */}
                  <div>
                    <label className="block font-label text-xs font-bold text-on-surface-muted uppercase tracking-wider mb-2">
                      Target Segments
                    </label>
                    <div className="flex flex-wrap gap-2.5 mt-1">
                      {["A", "B", "C", "D"].map((seg) => (
                        <label
                          key={seg}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer font-label text-xs font-semibold select-none transition-colors ${
                            stepTargetSegments.includes(seg)
                              ? "bg-tertiary/10 border-tertiary text-tertiary"
                              : "bg-surface border-surface-mid text-on-surface-muted hover:border-tertiary/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={stepTargetSegments.includes(seg)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setStepTargetSegments([...stepTargetSegments, seg]);
                              } else {
                                setStepTargetSegments(stepTargetSegments.filter((s) => s !== seg));
                              }
                            }}
                            className="hidden"
                          />
                          {SEGMENT_LABELS[seg]}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Dynamic Timing Assistant & Safety Alert */}
                {(() => {
                  const isFreeformOutOfWindow = stepDelayHours >= 24 && stepMessageType === "freeform";
                  
                  if (sourceFilter === "BROADCAST") {
                    const selectedBroadcast = broadcastHistory.find(h => h.broadcast_id === selectedBroadcastId);
                    if (!selectedBroadcast) {
                      return (
                        <div className="bg-surface border border-surface-mid rounded-xl p-4 text-xs font-semibold text-on-surface-muted italic">
                          💡 Please select a broadcast to view scheduled IST trigger times.
                        </div>
                      );
                    }
                    
                    const triggerDate = new Date(new Date(selectedBroadcast.timestamp).getTime() + stepDelayHours * 60 * 60 * 1000);
                    return (
                      <div className="bg-surface border border-surface-mid rounded-xl p-4 space-y-3 shadow-sm ring-1 ring-black/5 animate-slide-up">
                        <div className="text-xs font-bold text-on-surface-muted uppercase tracking-wider">
                          ⏱️ Timing Assistant (India Standard Time)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-semibold">
                          <div>
                            <span className="text-on-surface-muted block">Broadcast Sent:</span>
                            <span className="text-on-surface font-mono">{formatIndianTime(selectedBroadcast.timestamp)}</span>
                          </div>
                          <div>
                            <span className="text-on-surface-muted block">Scheduled Trigger:</span>
                            <span className="text-tertiary font-bold font-mono">{formatIndianTime(triggerDate)}</span>
                          </div>
                          <div>
                            <span className="text-on-surface-muted block">24h Session Window:</span>
                            {stepDelayHours < 24 ? (
                              <span className="text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 inline-block mt-0.5">
                                Open ({24 - stepDelayHours}h left)
                              </span>
                            ) : (
                              <span className="text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-100 inline-block mt-0.5">
                                Expired (Must use Template)
                              </span>
                            )}
                          </div>
                        </div>
                        {isFreeformOutOfWindow && (
                          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs font-semibold text-red-700">
                            ⚠️ Error: You have configured a Freeform message at the {stepDelayHours}th hour, which is past the 24-hour WhatsApp session window. Please change the Message Type below to an &quot;Approved Template&quot; or reduce the Trigger Delay to less than 24 hours.
                          </div>
                        )}
                      </div>
                    );
                  } else if (sourceFilter === "INBOUND") {
                    const sim = getSimulatedInboundTrigger(stepDelayHours);
                    return (
                      <div className="bg-surface border border-surface-mid rounded-xl p-4 space-y-3 shadow-sm ring-1 ring-black/5 animate-slide-up">
                        <div className="text-xs font-bold text-on-surface-muted uppercase tracking-wider">
                          ⏱️ Timing Assistant (India Standard Time)
                        </div>
                        <p className="text-[11px] text-on-surface-muted leading-relaxed">
                          Since Inbound follow-ups run relative to each lead&apos;s last reply, here is a mock scenario:
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-semibold">
                          <div>
                            <span className="text-on-surface-muted block">If Lead replies at:</span>
                            <span className="text-on-surface font-mono">Today, 10:00 AM</span>
                          </div>
                          <div>
                            <span className="text-on-surface-muted block">Expected Trigger:</span>
                            <span className="text-tertiary font-bold font-mono">{sim.timeStr}</span>
                          </div>
                          <div>
                            <span className="text-on-surface-muted block">24h Session Window:</span>
                            {sim.isOpen ? (
                              <span className="text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 inline-block mt-0.5">
                                Open ({24 - stepDelayHours}h left)
                              </span>
                            ) : (
                              <span className="text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-100 inline-block mt-0.5">
                                Expired (Must use Template)
                              </span>
                            )}
                          </div>
                        </div>
                        {isFreeformOutOfWindow && (
                          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs font-semibold text-red-700">
                            ⚠️ Error: You have configured a Freeform message at the {stepDelayHours}th hour, which is past the 24-hour WhatsApp session window. Please change the Message Type below to an &quot;Approved Template&quot; or reduce the Trigger Delay to less than 24 hours.
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Message Type */}
                <div>
                  <label className="block font-label text-xs font-bold text-on-surface-muted uppercase tracking-wider mb-2">
                    Message Type
                  </label>
                  <div className="flex gap-2">
                    {(["freeform", "template"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setStepMessageType(type)}
                        className={`px-4 py-2 rounded-lg font-label text-xs font-semibold capitalize transition-all border ${
                          stepMessageType === type
                            ? "bg-secondary border-secondary text-white"
                            : "bg-surface border-surface-mid text-on-surface-muted hover:border-surface-mid/80"
                        }`}
                      >
                        {type === "freeform" ? "Freeform Text (Window only)" : "Approved Template (Always sent)"}
                      </button>
                    ))}
                  </div>
                  {stepMessageType === "freeform" && (
                    <p className="font-body text-[10px] text-amber-600 mt-1.5 font-semibold">
                      ⚠ Note: Freeform messages will be automatically skipped if the lead&apos;s 24-hour window has expired.
                    </p>
                  )}
                </div>

                {/* Conditional Fields based on Message Type */}
                {stepMessageType === "freeform" ? (
                  <div>
                    <label className="block font-label text-xs font-bold text-on-surface-muted uppercase tracking-wider mb-2">
                      Message Content
                    </label>
                    <textarea
                      value={stepMessageContent}
                      onChange={(e) => setStepMessageContent(e.target.value)}
                      rows={3}
                      placeholder="Hi! We noticed you haven't booked a time yet. Let us know if you have questions!"
                      className="w-full px-4 py-3 bg-surface rounded-xl font-body text-sm text-on-surface border border-surface-mid focus:ring-2 focus:ring-tertiary outline-none resize-none"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block font-label text-xs font-bold text-on-surface-muted uppercase tracking-wider mb-2">
                        WhatsApp Template
                      </label>
                      <select
                        value={stepTemplateName}
                        onChange={(e) => {
                          setStepTemplateName(e.target.value);
                          setStepTemplateVariables([]);
                        }}
                        className="w-full px-4 py-2 bg-surface rounded-xl font-body text-sm text-on-surface border border-surface-mid focus:ring-2 focus:ring-tertiary outline-none cursor-pointer"
                      >
                        <option value="">Select an approved template...</option>
                        {wabaTemplates.map((t) => (
                          <option key={t.id} value={t.name}>
                            {t.name} ({t.category.toLowerCase()})
                          </option>
                        ))}
                      </select>
                    </div>

                    {stepTemplateName && (
                      <div className="bg-surface border border-surface-mid rounded-xl p-4 space-y-3">
                        <p className="font-label text-xs font-bold text-on-surface uppercase tracking-wider">
                          Variable Mapping
                        </p>
                        <p className="font-body text-xs text-on-surface-muted">
                          Define custom column keys or variables for the template parameters (e.g. `name`).
                        </p>
                        <div className="space-y-2">
                          {stepTemplateVariables.map((val, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-surface-low p-2 rounded-lg border border-surface-mid/60">
                              <span className="font-mono text-xs text-on-surface-muted w-10 shrink-0 font-bold">{`{{${idx + 1}}}`}</span>
                              <select
                                value={val}
                                onChange={(e) => {
                                  const next = [...stepTemplateVariables];
                                  next[idx] = e.target.value;
                                  setStepTemplateVariables(next);
                                }}
                                className="flex-1 bg-surface rounded-lg px-2.5 py-1.5 font-body text-xs text-on-surface border border-surface-mid focus:outline-none focus:ring-1 focus:ring-tertiary"
                              >
                                <option value="">— pick a field —</option>
                                <option value="name">Lead Name</option>
                                <option value="phone">Lead Phone</option>
                                <option value="course">Course</option>
                                <option value="city">City</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => setStepTemplateVariables(stepTemplateVariables.filter((_, i) => i !== idx))}
                                className="text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded hover:bg-red-50 transition-colors font-semibold"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => setStepTemplateVariables([...stepTemplateVariables, ""])}
                            className="text-xs font-bold text-tertiary hover:underline flex items-center gap-1 mt-1 pl-1"
                          >
                            + Add variable mapping
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowAddStep(false)}
                    className="px-4 py-2 bg-surface text-on-surface-muted rounded-xl font-label text-xs font-semibold border border-surface-mid hover:bg-surface-low transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddStep}
                    disabled={stepDelayHours >= 24 && stepMessageType === "freeform"}
                    className="flex items-center gap-2 px-4 py-2 bg-tertiary text-white rounded-xl font-label text-xs font-semibold hover:bg-tertiary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save Step
                  </button>
                </div>
              </div>
            )}

            {/* List of current steps */}
            {loadingSteps ? (
              <div className="text-center py-4 font-body text-xs text-on-surface-muted">Loading steps...</div>
            ) : reengagementSteps.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-surface-mid rounded-xl bg-surface-low/30 font-body text-xs text-on-surface-muted">
                No automatic re-engagement steps configured yet. Click &quot;Add Step&quot; above to create one.
              </div>
            ) : (
              <div className="relative border-l-2 border-surface-mid ml-3 pl-6 space-y-5 py-2">
                {(() => {
                  const sortedSteps = [...reengagementSteps].sort((a, b) => a.delay_hours - b.delay_hours);
                  return sortedSteps.map((step, idx) => {
                    const segLabels = (step.target_segments || []).map(s => SEGMENT_LABELS[s] || s).join(", ");
                    const stepIndexLabel = `${idx + 1}${
                      ["st", "nd", "rd"][((idx + 1) % 100 - 20) % 10] || 
                      ["st", "nd", "rd"][idx] || 
                      "th"
                    } Follow-up`;
                    
                    let triggerDetailText = "";
                    let windowDetailText = "";
                    const isWindowOpen = step.delay_hours < 24;
                    
                    if (step.type === "broadcast" && selectedBroadcastId) {
                      const selectedBroadcast = broadcastHistory.find(h => h.broadcast_id === selectedBroadcastId);
                      if (selectedBroadcast) {
                        const triggerDate = new Date(new Date(selectedBroadcast.timestamp).getTime() + step.delay_hours * 60 * 60 * 1000);
                        triggerDetailText = `Scheduled: ${formatIndianTime(triggerDate)}`;
                        windowDetailText = isWindowOpen ? `(${24 - step.delay_hours}h left in window)` : "(Window Expired)";
                      } else {
                        triggerDetailText = `Triggers: ${step.delay_hours}h after broadcast sent`;
                        windowDetailText = isWindowOpen ? `(${24 - step.delay_hours}h left in window)` : "(Window Expired)";
                      }
                    } else {
                      triggerDetailText = `Triggers: ${step.delay_hours}h after last inbound message`;
                      windowDetailText = isWindowOpen ? `(${24 - step.delay_hours}h left in window)` : "(Window Expired)";
                    }

                    return (
                      <div key={step.id}>
                        {/* Boundary Line Marker */}
                        {((idx === 0 && step.delay_hours >= 24) || (idx > 0 && sortedSteps[idx - 1].delay_hours < 24 && step.delay_hours >= 24)) && (
                          <div className="relative my-6 -ml-6 mr-2 flex items-center justify-center">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                              <div className="w-full border-t border-dashed border-red-300" />
                            </div>
                            <div className="relative flex justify-center">
                              <span className="bg-red-50 text-red-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border border-red-200 shadow-sm flex items-center gap-1">
                                <Clock size={10} />
                                24-Hour WhatsApp Session Window Ends Here
                              </span>
                            </div>
                          </div>
                        )}
                        
                        <div className="relative group mt-3">
                          {/* Timeline dot */}
                          <div className={cn(
                            "absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white",
                            isWindowOpen ? "bg-emerald-500" : "bg-red-500"
                          )} />
                          
                          <div className="bg-surface-low border border-surface-mid/60 rounded-xl p-4 flex items-center justify-between hover:shadow-sm transition-all">
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-display text-[10px] font-bold text-tertiary px-2 py-0.5 bg-tertiary/10 rounded-md">
                                  {stepIndexLabel}
                                </span>
                                <span className="font-display text-sm font-bold text-on-surface">
                                  {step.delay_hours} Hours Delay
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-surface border border-surface-mid font-label text-[10px] font-bold text-on-surface-muted">
                                  Targets: {segLabels}
                                </span>
                              </div>
                              <p className="font-body text-xs text-on-surface mt-1">
                                {step.message_type === "freeform" ? (
                                  <span className="italic">Freeform: &quot;{step.message_content}&quot;</span>
                                ) : (
                                  <span>Template: <strong className="font-semibold text-zinc-900">{step.template_name}</strong></span>
                                )}
                              </p>
                              
                              <div className="flex flex-wrap items-center gap-2 mt-1.5 font-mono text-[10px]">
                                <span className="text-on-surface-muted font-semibold">{triggerDetailText}</span>
                                <span className={cn(
                                  "font-bold px-1.5 py-0.5 rounded border text-[9px] uppercase",
                                  isWindowOpen 
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                                    : "bg-red-50 text-red-600 border-red-100"
                                )}>
                                  {windowDetailText}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteStep(step.id)}
                              className="p-1.5 text-on-surface-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}

        <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm font-bold text-tertiary">
              {sourceFilter !== "ALL" ? `Action Box — Filtered Leads` : `Action Box — ${SEGMENT_LABELS[tab]} Leads`}
            </h2>
            {lastResult && (
              <p className="font-label text-xs text-on-surface-muted">
                Sent {lastResult.sent} · Failed {lastResult.failed} · Outside 24h window{" "}
                {lastResult.skipped_window}
              </p>
            )}
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder={sourceFilter !== "ALL" ? "Message to broadcast to filtered leads…" : `Message to broadcast to ${SEGMENT_LABELS[tab]} leads…`}
            className="w-full px-4 py-3 bg-surface-low rounded-xl font-body text-sm text-on-surface border-0 focus:ring-2 focus:ring-tertiary resize-none"
          />
          <div className="flex gap-2 mt-3">
            {sourceFilter === "ALL" && (
              <button
                onClick={saveTemplate}
                disabled={savingTpl || draft === (templates[tab]?.message ?? "")}
                className="flex items-center gap-2 px-4 py-2 bg-surface-low text-on-surface rounded-xl font-label text-xs font-semibold hover:bg-surface-mid transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {savingTpl ? "Saving…" : "Save"}
              </button>
            )}
            <button
              onClick={broadcast}
              disabled={broadcasting || !draft.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl font-label text-xs font-semibold hover:bg-secondary/90 transition-colors disabled:opacity-50"
            >
              <Send size={14} />
              {broadcasting ? "Sending…" : sourceFilter !== "ALL" ? "Send to Filtered Leads" : `Send to ${SEGMENT_LABELS[tab]}`}
            </button>
          </div>
        </div>

        <div className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15">
          {loading ? (
            <div className="p-8 text-center font-body text-on-surface-muted">Loading…</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center font-body text-on-surface-muted">No leads found for these filters</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-mid">
                  <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Contact/ID</th>
                  <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Name</th>
                  <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Score</th>
                  <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Assigned To</th>
                  <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Source</th>
                  {sourceFilter === "BROADCAST" && (
                    <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Broadcast Sent</th>
                  )}
                  <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">24h Window</th>
                  <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Added</th>
                  {role === "owner" && (
                    <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => (
                  <tr
                    key={lead.id}
                    className={`border-b border-surface-mid/50 hover:bg-surface-low transition-colors ${
                      i % 2 === 0 ? "" : "bg-surface-low/30"
                    }`}
                  >
                    <td className="px-6 py-4 font-body text-sm text-on-surface">
                      {lead.phone ? formatPhone(lead.phone) : (lead.source === "telegram" ? `@${lead.tg_username || "unknown"}` : (lead.source === "instagram" ? lead.ig_user_id : (lead.source === "facebook" ? lead.fb_user_id : "No Contact")))}
                    </td>
                    <td className="px-6 py-4">
                      <NameCell
                        lead={lead}
                        onUpdate={(updated) =>
                          setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
                        }
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-surface-mid overflow-hidden">
                          <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${lead.score * 10}%` }} />
                        </div>
                        <span className="font-label text-xs text-on-surface-muted">{lead.score}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {lead.assigned_to ? (
                        <span className="font-label text-xs font-semibold text-ink">
                          {callers.find((c) => c.id === lead.assigned_to)?.name ?? "Caller"}
                        </span>
                      ) : (
                        <span className="font-label text-xs text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-label text-xs text-on-surface-muted capitalize">{lead.source}</td>
                    {sourceFilter === "BROADCAST" && (
                      <td className="px-6 py-4 font-label text-xs text-on-surface-muted">{lead.broadcast_sent_at ? timeAgo(lead.broadcast_sent_at) : "—"}</td>
                    )}
                    <td className="px-6 py-4">
                      {format24hWindow(lead.last_inbound_at)}
                    </td>
                    <td className="px-6 py-4 font-label text-xs text-on-surface-muted">{timeAgo(lead.created_at)}</td>
                    {role === "owner" && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <AssignButton
                            leadId={lead.id}
                            currentAssignedTo={lead.assigned_to}
                            callers={callers}
                            onAssigned={(callerId) =>
                              setLeads((prev) =>
                                prev.map((l) =>
                                  l.id === lead.id ? { ...l, assigned_to: callerId } : l
                                )
                              )
                            }
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
