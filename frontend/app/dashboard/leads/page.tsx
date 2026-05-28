"use client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { api, Lead, Caller, SegmentTemplate, BroadcastResult, API_URL, getAuthHeaders } from "@/lib/api";
import { Download, Send, Save, Pencil, Plus, X, Loader2, Settings, AlertCircle } from "lucide-react";
import { timeAgo, formatPhone, cn } from "@/lib/utils";
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

function ScoringPanel({
  onClose,
  scoringRubric,
  setScoringRubric,
  scoringThresholds,
  setScoringThresholds,
  scoringSaving,
  saveScoringConfig,
  scoringMsg,
}: {
  onClose: () => void;
  scoringRubric: string;
  setScoringRubric: (s: string) => void;
  scoringThresholds: { A: number; B: number; C: number };
  setScoringThresholds: React.Dispatch<React.SetStateAction<{ A: number; B: number; C: number }>>;
  scoringSaving: boolean;
  saveScoringConfig: () => Promise<void>;
  scoringMsg: string | null;
}) {
  const isOrderValid = scoringThresholds.A > scoringThresholds.B && scoringThresholds.B > scoringThresholds.C;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-surface-mid">
        <div>
          <h3 className="font-display text-lg font-bold text-tertiary flex items-center gap-2">
            <Settings size={18} /> Lead Scoring Rules
          </h3>
          <p className="font-body text-xs text-on-surface-muted mt-0.5">
            Configure custom rubric and segmentation thresholds.
          </p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-surface-low rounded-lg transition-all text-on-surface-muted hover:text-on-surface" title="Close configuration">
          <X size={18} />
        </button>
      </div>

      {scoringMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-label text-sm animate-fade-in">
          {scoringMsg}
        </div>
      )}

      {/* Rubric */}
      <div className="space-y-2">
        <label className="block font-label text-xs font-semibold text-on-surface-muted uppercase">Custom Scoring Rubric</label>
        <div className="p-3 rounded-xl bg-surface-low border border-surface-mid font-label text-[11px] text-on-surface-muted leading-4">
          <strong>Default rubric (used when blank):</strong><br />
          9–10: High intent — asked for pricing/booking/payment, completed booking steps<br />
          7–8: Warm — detailed questions, comparing options, providing requested info<br />
          5–6: Neutral — general enquiry, first contact, short acknowledgments<br />
          3–4: Lukewarm — vague replies, no follow-up, low engagement<br />
          1–2: Low intent — unresponsive, dismissive, wrong number
        </div>
        <textarea
          value={scoringRubric}
          onChange={(e) => setScoringRubric(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={"- 9-10: Asked about fees or demo, confirmed slot\n- 7-8: Asking about syllabus or schedules\n- 5-6: General enquiry\n- 1-4: Wrong number or opt-out"}
          className="w-full px-4 py-3 rounded-xl bg-surface-low border border-surface-mid font-mono text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-tertiary resize-none"
        />
      </div>

      {/* Thresholds */}
      <div className="space-y-3">
        <label className="block font-label text-xs font-semibold text-on-surface-muted uppercase">Segment Thresholds</label>
        <p className="font-body text-xs text-on-surface-muted">
          Leads are grouped when score is ≥ threshold. Default: A≥9, B≥7, C≥5, D&lt;5.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {(["A", "B", "C"] as const).map((seg) => {
            const colors: Record<string, string> = {
              A: "text-red-700 bg-red-50 border-red-200",
              B: "text-amber-700 bg-amber-50 border-amber-200",
              C: "text-blue-700 bg-blue-50 border-blue-200"
            };
            const labels: Record<string, string> = { A: "A — Hot", B: "B — Warm", C: "C — Cold" };
            return (
              <div key={seg} className={`rounded-xl border p-3 flex items-center justify-between ${colors[seg]}`}>
                <label className="font-label text-xs font-bold uppercase">{labels[seg]}</label>
                <div className="flex items-center gap-1.5">
                  <span className="font-label text-xs">Score ≥</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={scoringThresholds[seg]}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                      setScoringThresholds(prev => ({ ...prev, [seg]: v }));
                    }}
                    className="w-12 px-1.5 py-0.5 rounded border bg-white font-mono text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-current text-ink"
                  />
                </div>
              </div>
            );
          })}
        </div>
        {!isOrderValid && (
          <div className="flex items-start gap-1.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-label text-xs font-semibold">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>Thresholds must be in order: A &gt; B &gt; C. Otherwise, defaults (9/7/5) will be used.</span>
          </div>
        )}
        <p className="font-label text-[10px] text-on-surface-muted">
          D (Disqualified) = score below C threshold ({scoringThresholds.C - 1} or less).
        </p>
      </div>

      <div className="pt-4 border-t border-surface-mid">
        <button
          onClick={saveScoringConfig}
          disabled={scoringSaving || !isOrderValid}
          className="w-full py-2.5 bg-tertiary text-white rounded-xl font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40 transition-all shadow-card flex items-center justify-center gap-2"
        >
          {scoringSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {scoringSaving ? "Saving…" : "Save Configuration"}
        </button>
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

  // Scoring config states
  const [showScoringDrawer, setShowScoringDrawer] = useState(false);
  const [scoringRubric, setScoringRubric] = useState("");
  const [scoringThresholds, setScoringThresholds] = useState({ A: 9, B: 7, C: 5 });
  const [scoringSaving, setScoringSaving] = useState(false);
  const [scoringMsg, setScoringMsg] = useState<string | null>(null);

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

  useEffect(() => {
    if (showScoringDrawer) loadScoringConfig();
  }, [showScoringDrawer]);

  async function loadScoringConfig() {
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/settings`, { headers: auth });
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, string> = {};
      for (const s of (data.settings ?? [])) map[s.key] = s.display_value ?? "";
      if (map.scoring_rubric && map.scoring_rubric !== "Not set") setScoringRubric(map.scoring_rubric);
      if (map.scoring_segment_thresholds && map.scoring_segment_thresholds !== "Not set") {
        try {
          const t = JSON.parse(map.scoring_segment_thresholds);
          setScoringThresholds({ A: t.A ?? 9, B: t.B ?? 7, C: t.C ?? 5 });
        } catch { /* ignore parse error */ }
      }
    } catch { /* silent */ }
  }

  async function saveScoringConfig() {
    setScoringSaving(true);
    setScoringMsg(null);
    try {
      const auth = await getAuthHeaders();
      const updates: Record<string, string> = {
        scoring_segment_thresholds: JSON.stringify(scoringThresholds),
      };
      if (scoringRubric.trim()) updates.scoring_rubric = scoringRubric.trim();
      const res = await fetch(`${API_URL}/api/v1/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error("Save failed");
      setScoringMsg("Scoring config saved.");
      setTimeout(() => setScoringMsg(null), 3000);
    } catch (err) {
      setScoringMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setScoringSaving(false);
    }
  }

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
    if (!confirm(`Send this message to all ${SEGMENT_LABELS[tab]} leads?`)) return;
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
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-tertiary">Leads</h1>
          </div>
          <p className="font-body text-on-surface-muted mt-1">Hot · Warm · Cold · Disqualified</p>
        </div>
        <div className="flex items-center gap-2">
          {role === "owner" && (
            <button
              onClick={() => setShowScoringDrawer((prev) => !prev)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl font-label text-sm font-semibold transition-colors border",
                showScoringDrawer
                  ? "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100"
                  : "bg-white border-surface-mid text-on-surface hover:text-violet-600 hover:border-violet-300"
              )}
            >
              <Settings size={16} />
              {showScoringDrawer ? "Hide Rules" : "Scoring Rules"}
            </button>
          )}
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
          onSent={() => api.leads.list({ segment: tab, limit: 200 }).then(setLeads)}
        />
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-grow flex-1 min-w-0 w-full">
          <div className="flex gap-1 mb-6 bg-surface-mid p-1 rounded-xl w-fit">
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

          <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-sm font-bold text-tertiary">
                Action Box — {SEGMENT_LABELS[tab]} Leads
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
              placeholder={`Message to broadcast to ${SEGMENT_LABELS[tab]} leads…`}
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
                {broadcasting ? "Sending…" : `Send to ${SEGMENT_LABELS[tab]}`}
              </button>
            </div>
          </div>

          <div className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15">
            {loading ? (
              <div className="p-8 text-center font-body text-on-surface-muted">Loading…</div>
            ) : leads.length === 0 ? (
              <div className="p-8 text-center font-body text-on-surface-muted">No {SEGMENT_LABELS[tab]} leads</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-mid">
                    <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Contact/ID</th>
                    <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Name</th>
                    <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Score</th>
                    <th className="px-6 py-4 text-left font-label text-xs text-on-surface-muted uppercase tracking-widest">Assigned To</th>
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

        <div className={cn(
          "w-full lg:w-[420px] shrink-0 sticky top-4 rounded-3xl transition-all duration-300 ease-in-out origin-right transform",
          showScoringDrawer
            ? "opacity-100 translate-x-0 scale-100 max-w-[420px] p-6 bg-surface shadow-card ring-1 ring-[#c4c7c7]/15"
            : "opacity-0 translate-x-4 scale-95 max-w-0 overflow-hidden pointer-events-none p-0 bg-transparent shadow-none ring-0 border-0"
        )}>
          <ScoringPanel
            onClose={() => setShowScoringDrawer(false)}
            scoringRubric={scoringRubric}
            setScoringRubric={setScoringRubric}
            scoringThresholds={scoringThresholds}
            setScoringThresholds={setScoringThresholds}
            scoringSaving={scoringSaving}
            saveScoringConfig={saveScoringConfig}
            scoringMsg={scoringMsg}
          />
        </div>
      </div>
    </div>
  );
}
