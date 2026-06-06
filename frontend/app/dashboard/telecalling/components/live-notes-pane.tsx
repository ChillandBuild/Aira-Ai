"use client";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";
import { X, FileText, CalendarClock } from "lucide-react";
import type { ActiveCallCtx } from "../types";
import { createCallback, saveNote } from "../lib/notes-api";
import { api, type Disposition } from "@/lib/api";

const DISPOSITIONS: { value: Disposition; label: string }[] = [
  { value: "answered", label: "Answered" },
  { value: "no_answer", label: "No Answer" },
  { value: "busy", label: "Busy" },
  { value: "switched_off", label: "Switched Off" },
  { value: "followup_required", label: "Follow-up Required" },
];

const LIVE_NOTE_TAGS = [
  "Meeting scheduled",
  "Not interested",
  "Call back later",
  "Discussed pricing",
  "Demo planned",
  "Needs more info",
  "Send proposal",
  "Hot lead",
];

type Props = {
  ctx: ActiveCallCtx;
  onClose: () => void;
};

const CALLBACK_TAGS = new Set(["Call back later", "Meeting scheduled"]);

export default function LiveNotesPane({ ctx, onClose }: Props) {
  const [content, setContent] = useState("");
  const [disposition, setDisposition] = useState<Disposition | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showCallbackPicker, setShowCallbackPicker] = useState(false);
  const [callbackAt, setCallbackAt] = useState("");
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount to avoid stale state updates
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const hasNote = content.trim().length > 0 || selectedTags.length > 0;
  const canSave =
    (!!ctx.callLogId && !!disposition) || (!!ctx.leadId && hasNote);

  function toggleTag(tag: string) {
    const isSelected = selectedTags.includes(tag);
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    // Only open callback picker when SELECTING a callback tag, not deselecting
    if (CALLBACK_TAGS.has(tag) && !isSelected) {
      setShowCallbackPicker(true);
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (ctx.callLogId && disposition) {
        await api.calls.setDisposition(ctx.callLogId, disposition, {
          notes: content.trim() || undefined,
        });
      }
      if (ctx.leadId && hasNote) {
        await saveNote(ctx.leadId, content.trim(), pinned, selectedTags);
      }
      if (callbackAt && ctx.leadId) {
        await createCallback(ctx.leadId, new Date(callbackAt).toISOString(), content.trim());
      }
      setContent("");
      setDisposition(null);
      setSelectedTags([]);
      setPinned(false);
      setCallbackAt("");
      setShowCallbackPicker(false);
      setSavedFlash(true);
      flashTimerRef.current = setTimeout(() => {
        setSavedFlash(false);
        onClose();
      }, 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/20 p-6">
      {/* header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-base font-bold text-tertiary flex items-center gap-2">
          <FileText size={16} className="text-secondary" />
          Live Notes
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-surface-low transition-colors text-on-surface-muted"
        >
          <X size={15} />
        </button>
      </div>

      {/* lead context */}
      <div className="mb-4 pb-4 border-b border-surface-mid">
        <p className="font-body text-base font-semibold text-on-surface truncate">
          {ctx.name ?? ctx.phone ?? "Unknown"}
        </p>
        {ctx.name && ctx.phone && (
          <p className="font-label text-sm text-on-surface-muted mt-0.5">{ctx.phone}</p>
        )}
        {!ctx.leadId && (
          <p className="font-label text-sm text-amber-600 mt-1">
            Unlinked call — notes won&apos;t be saved
          </p>
        )}
      </div>

      {/* call disposition */}
      <div className="mb-4">
        <p className="font-label text-xs font-semibold text-on-surface-muted uppercase tracking-wider mb-2">
          Call result
        </p>
        <div className="flex flex-wrap gap-2">
          {DISPOSITIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => {
                const next = disposition === d.value ? null : d.value;
                setDisposition(next);
                if (next === "followup_required") setShowCallbackPicker(true);
              }}
              disabled={!ctx.callLogId}
              className={`px-3 py-1.5 rounded-lg font-label text-sm font-semibold transition-colors disabled:opacity-40 ${
                disposition === d.value
                  ? "bg-secondary text-white"
                  : "bg-surface-low hover:bg-surface-mid text-on-surface"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {!ctx.callLogId && (
          <p className="font-label text-xs text-amber-600 mt-1">
            Disposition saves once a call is initiated.
          </p>
        )}
      </div>

      {/* quick tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {LIVE_NOTE_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={`px-3 py-1.5 rounded-lg font-label text-sm font-semibold transition-colors ${
              selectedTags.includes(tag)
                ? "bg-tertiary text-white"
                : "bg-surface-low hover:bg-surface-mid text-on-surface"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* callback scheduler — always accessible */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => { setShowCallbackPicker((v) => !v); if (showCallbackPicker) setCallbackAt(""); }}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            showCallbackPicker
              ? "bg-amber-100 text-amber-800 border border-amber-300"
              : "bg-surface-low text-on-surface-muted hover:text-on-surface border border-surface-mid"
          }`}
        >
          <CalendarClock size={12} />
          {showCallbackPicker ? "Remove callback" : "Schedule callback"}
        </button>
        {showCallbackPicker && (
          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <input
              type="datetime-local"
              value={callbackAt}
              onChange={(e) => setCallbackAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        )}
      </div>

      {/* textarea */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type notes here…"
        rows={5}
        className="w-full px-4 py-3 rounded-xl bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary resize-none"
      />

      {/* pin */}
      <label className="flex items-center gap-2 mt-3 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
          className="rounded"
          disabled={!ctx.leadId}
        />
        <span className="font-label text-sm text-on-surface-muted">Pin this note (appears first in next briefing)</span>
      </label>

      <button
        onClick={handleSave}
        disabled={saving || !canSave}
        className="w-full py-3 bg-tertiary text-white rounded-xl font-label text-base font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {savedFlash ? "Saved ✓" : saving ? "Saving…" : "Save Note"}
      </button>
    </div>
  );
}
