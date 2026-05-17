"use client";
import { toast } from "sonner";
import { useState } from "react";
import { X, FileText, CalendarClock } from "lucide-react";
import type { ActiveCallCtx } from "../types";
import { createCallback, saveNote } from "../lib/notes-api";

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
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showCallbackPicker, setShowCallbackPicker] = useState(false);
  const [callbackAt, setCallbackAt] = useState("");

  const canSave = !!ctx.leadId && content.trim().length > 0;

  function appendTag(tag: string) {
    setContent((prev) => (prev.trim() ? `${prev.trim()}\n${tag}` : tag));
    if (CALLBACK_TAGS.has(tag)) {
      setShowCallbackPicker(true);
    }
  }

  async function handleSave() {
    if (!ctx.leadId || !content.trim()) return;
    setSaving(true);
    try {
      await saveNote(ctx.leadId, content.trim(), pinned);
      if (callbackAt) {
        await createCallback(ctx.leadId, new Date(callbackAt).toISOString(), content.trim());
      }
      setContent("");
      setPinned(false);
      setCallbackAt("");
      setShowCallbackPicker(false);
      setSavedFlash(true);
      setTimeout(() => {
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

      {/* quick tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {LIVE_NOTE_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => appendTag(tag)}
            className="px-3 py-1.5 bg-surface-low hover:bg-surface-mid rounded-lg font-label text-sm font-semibold text-on-surface transition-colors"
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
