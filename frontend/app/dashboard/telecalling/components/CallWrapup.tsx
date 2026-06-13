"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Check, RefreshCw, Star } from "lucide-react";
import { api, CallLog } from "@/lib/api";
import { formatPhone } from "@/lib/utils";
import { QUICK_NOTE_TAGS } from "./LeadDetailPanel";
import { saveNote } from "../lib/notes-api";

interface WrapTarget {
  leadId: string | null;
  callLogId: string;
  name: string | null;
  phone: string | null;
}

const POLL_MS = 5000;

/**
 * Self-contained mandatory call wrap-up. Polls the server for the current user's
 * pending wrap-ups (completed calls with no outcome) and forces feedback before
 * the dashboard can be used. Identical flow to the telecaller cockpit — both
 * submit via api.calls.setOutcome — so admin-initiated calls get wrapped up the
 * same way. Drop into any caller surface (admin dialer / telecaller view).
 */
export default function CallWrapup() {
  const [pendingWrapups, setPendingWrapups] = useState<CallLog[]>([]);
  const [target, setTarget] = useState<WrapTarget | null>(null);
  const [outcome, setOutcome] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);
  const [quality, setQuality] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadPending = useCallback(async () => {
    try {
      setPendingWrapups(await api.calls.getPendingWrapups());
    } catch {
      // transient — next poll retries
    }
  }, []);

  useEffect(() => {
    loadPending();
    const id = setInterval(loadPending, POLL_MS);
    return () => clearInterval(id);
  }, [loadPending]);

  function resetForm() {
    setTarget(null);
    setOutcome("");
    setNotes("");
    setTags([]);
    setQuality(0);
  }

  const toggleTag = (tag: string) =>
    setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));

  async function handleSubmit() {
    if (!target) return;
    if (!outcome) {
      toast.error("Outcome is required");
      return;
    }
    setSaving(true);
    try {
      await api.calls.setOutcome(target.callLogId, outcome as NonNullable<CallLog["outcome"]>, {
        notes: notes.trim() || undefined,
        qualityRating: quality || undefined,
      });
      if (outcome === "converted" && target.leadId) {
        await api.leads.convert(target.leadId, notes);
      } else if (outcome !== "converted" && target.leadId && (notes.trim() || tags.length > 0)) {
        await saveNote(target.leadId, notes, false, tags);
      }
      toast.success("Wrap-up completed");
      resetForm();
      await loadPending();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit wrap-up");
    } finally {
      setSaving(false);
    }
  }

  const OUTCOMES: { value: string; label: string; danger?: boolean }[] = [
    { value: "converted", label: "Converted" },
    { value: "in_progress", label: "In Progress" },
    { value: "not_interested", label: "Not Interested (Nurture)" },
    { value: "no_answer", label: "No Answer" },
    { value: "do_not_call", label: "Do Not Call", danger: true },
    { value: "do_not_contact", label: "Do Not Contact at All", danger: true },
  ];

  return (
    <>
      {/* Mandatory Wrap-Up Form */}
      {target && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-7 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-label text-[10px] font-black uppercase tracking-wider">
                Call Completed
              </span>
              <h3 className="font-display text-xl font-bold text-slate-900 mt-2">Mandatory Call Wrap-up</h3>
              <p className="font-body text-xs text-slate-400 mt-1">
                Please log feedback for the call with{" "}
                <span className="font-semibold text-slate-700">{target.name || target.phone}</span>.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="font-label text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block mb-2">
                  Call Outcome / Disposition *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {OUTCOMES.map((o) => {
                    const selected = outcome === o.value;
                    const base = "px-3 py-2.5 rounded-xl font-label text-xs font-bold border transition-all text-center";
                    const cls = selected
                      ? o.danger
                        ? "bg-red-600 border-red-600 text-white"
                        : "bg-indigo-600 border-indigo-600 text-white"
                      : o.danger
                        ? "bg-slate-50 hover:bg-red-50 text-red-700 border-red-200"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200";
                    return (
                      <button key={o.value} type="button" onClick={() => setOutcome(o.value)} className={`${base} ${cls}`}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="font-label text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block mb-1.5">
                  Interaction Note / Comments
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Summarize customer feedback and key discussion points..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 resize-none shadow-inner"
                />
              </div>

              <div>
                <label className="font-label text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block mb-1.5">
                  Tags
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_NOTE_TAGS.map((tag) => {
                    const selected = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                          selected
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="font-label text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block mb-1.5">
                  How did this call go?
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setQuality(quality === n ? 0 : n)} className="p-1 transition-transform hover:scale-110">
                      <Star size={20} className={n <= quality ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || !outcome}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-label text-xs font-black shadow-md hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
              >
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Complete Wrap-up</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocking Pending-Wrapups list */}
      {pendingWrapups.length > 0 && !target && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full max-h-[80vh] shadow-2xl flex flex-col border border-slate-200">
            <div className="text-center mb-6 shrink-0">
              <div className="w-12 h-12 bg-amber-50 border border-amber-200 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle size={24} />
              </div>
              <h2 className="font-display text-xl font-extrabold text-slate-900">Action Required: Pending Call Wrap-ups</h2>
              <p className="font-body text-xs text-slate-400 mt-1.5">
                You have {pendingWrapups.length} completed call(s) that require outcome feedback. Please submit feedback to unlock the dashboard.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-2 pr-1">
              {pendingWrapups.map((log) => (
                <div key={log.id} className="border border-slate-150 rounded-2xl p-4 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-body text-sm font-bold text-slate-800 truncate">
                      {log.leads?.name || "Unnamed Lead"} ({formatPhone(log.leads?.phone || "")})
                    </p>
                    <p className="font-label text-xs text-slate-500 mt-1">
                      Duration: {log.duration_seconds || 0}s · Completed {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setTarget({
                        leadId: log.lead_id,
                        callLogId: log.id,
                        name: log.leads?.name || null,
                        phone: log.leads?.phone || null,
                      })
                    }
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-label text-xs font-bold transition-all shadow-sm shrink-0"
                  >
                    Wrap Up
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
