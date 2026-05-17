"use client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { api, Lead, Caller, SegmentTemplate, BroadcastResult } from "@/lib/api";
import { SegmentBadge } from "@/components/segment-badge";
import { Download, Send, Save, Pencil, Plus, X, Loader2, Phone } from "lucide-react";
import { timeAgo, formatPhone } from "@/lib/utils";
import { useAuthRole } from "../contexts/AuthRoleContext";
import { AssignButton } from "./AssignButton";

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

function AdminCallButton({ leadId }: { leadId: string }) {
  const [calling, setCalling] = useState(false);

  async function handleCall() {
    setCalling(true);
    try {
      await api.calls.initiate({ leadId });
      toast.success("Call initiated — your phone will ring shortly");
    } catch {
      toast.error("Call failed — check TeleCMI settings");
    } finally {
      setCalling(false);
    }
  }

  return (
    <button
      onClick={handleCall}
      disabled={calling}
      title="Call this lead"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors font-label text-xs font-semibold"
    >
      {calling ? <Loader2 size={12} className="animate-spin" /> : <Phone size={12} />}
      {calling ? "Calling…" : "Call"}
    </button>
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

  useEffect(() => {
    api.callers.list().then((data: Caller[]) => setCallers(data.filter((c) => c.active))).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.leads.list({ segment: tab, limit: 200 }).then(setLeads).finally(() => setLoading(false));
    setLastResult(null);
  }, [tab]);

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
    if (!confirm(`Send this message to every lead in Segment ${tab}?`)) return;
    setBroadcasting(true);
    setLastResult(null);
    try {
      if (draft !== templates[tab]?.message) await saveTemplate();
      const result = await api.segments.broadcast(tab);
      setLastResult(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setBroadcasting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-tertiary">Leads</h1>
          <p className="font-body text-on-surface-muted mt-1">Priority segments A → D</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setComposing(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-white rounded-xl font-label text-sm font-semibold hover:bg-secondary/90 transition-colors"
          >
            <Plus size={16} />
            New Message
          </button>
          <a
            href={api.leads.exportUrl(tab)}
            download
            className="flex items-center gap-2 px-4 py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 transition-colors"
          >
            <Download size={16} />
            Export Segment {tab}
          </a>
        </div>
      </div>

      {composing && (
        <ComposeModal
          onClose={() => setComposing(false)}
          onSent={() => api.leads.list({ segment: tab, limit: 200 }).then(setLeads)}
        />
      )}

      <div className="flex gap-1 mb-6 bg-surface-mid p-1 rounded-xl w-fit">
        {SEGMENTS.map((seg) => (
          <button
            key={seg}
            onClick={() => setTab(seg)}
            className={`px-5 py-2 rounded-lg font-label text-sm font-semibold transition-all ${
              tab === seg ? "bg-surface shadow-card text-tertiary" : "text-on-surface-muted hover:text-on-surface"
            }`}
          >
            Segment {seg}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-sm font-bold text-tertiary">
            Action Box — Segment {tab}
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
          placeholder={`Message to broadcast to Segment ${tab} leads…`}
          className="w-full px-4 py-3 bg-surface-low rounded-xl font-body text-sm text-on-surface border-0 focus:ring-2 focus:ring-tertiary resize-none"
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={saveTemplate}
            disabled={savingTpl || draft === (templates[tab]?.message ?? "")}
            className="flex items-center gap-2 px-4 py-2 bg-surface-low text-on-surface rounded-xl font-label text-xs font-semibold hover:bg-surface-mid transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            {savingTpl ? "Saving…" : "Save"}
          </button>
          <button
            onClick={broadcast}
            disabled={broadcasting || !draft.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl font-label text-xs font-semibold hover:bg-secondary/90 transition-colors disabled:opacity-50"
          >
            <Send size={14} />
            {broadcasting ? "Sending…" : `Send to Segment ${tab}`}
          </button>
        </div>
      </div>

      <div className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15">
        {loading ? (
          <div className="p-8 text-center font-body text-on-surface-muted">Loading…</div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center font-body text-on-surface-muted">No leads in Segment {tab}</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-mid">
                <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Phone</th>
                <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Name</th>
                <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Score</th>
                <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Segment</th>
                <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Source</th>
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
                  <td className="px-6 py-4 font-body text-sm text-on-surface">{formatPhone(lead.phone)}</td>
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
                        <div
                          className="h-full rounded-full bg-secondary"
                          style={{ width: `${lead.score * 10}%` }}
                        />
                      </div>
                      <span className="font-label text-xs text-on-surface-muted">{lead.score}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4"><SegmentBadge segment={lead.segment} /></td>
                  <td className="px-6 py-4 font-label text-xs text-on-surface-muted capitalize">{lead.source}</td>
                  <td className="px-6 py-4 font-label text-xs text-on-surface-muted">{timeAgo(lead.created_at)}</td>
                  {role === "owner" && (
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <AdminCallButton leadId={lead.id} />
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
  );
}
