"use client";
import { useState } from "react";
import { X, FileText } from "lucide-react";
import type { ActiveCallCtx } from "../types";
import { saveNote } from "../lib/notes-api";

const LIVE_NOTE_TAGS = [
  "Meeting scheduled",
  "Not interested",
  "Call back later",
  "Discussed fees",
  "Campus visit planned",
  "Needs more info",
];

type Props = {
  ctx: ActiveCallCtx;
  onClose: () => void;
};

export default function LiveNotesPane({ ctx, onClose }: Props) {
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const canSave = !!ctx.leadId && content.trim().length > 0;

  function appendTag(tag: string) {
    setContent((prev) => (prev.trim() ? `${prev.trim()}\n${tag}` : tag));
  }

  async function handleSave() {
    if (!ctx.leadId || !content.trim()) return;
    setSaving(true);
    try {
      await saveNote(ctx.leadId, content.trim(), pinned);
      setContent("");
      setPinned(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed right-4 top-20 z-40 w-80 bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/20 p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-sm font-bold text-tertiary flex items-center gap-2">
          <FileText size={14} className="text-secondary" />
          Live Notes
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-surface-low transition-colors text-on-surface-muted"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mb-3 pb-3 border-b border-surface-mid">
        <p className="font-body text-xs font-semibold text-on-surface truncate">
          {ctx.name ?? ctx.phone ?? "Unknown"}
        </p>
        {ctx.name && ctx.phone && (
          <p className="font-label text-[10px] text-on-surface-muted">{ctx.phone}</p>
        )}
        {!ctx.leadId && (
          <p className="font-label text-[10px] text-amber-600 mt-0.5">
            Unlinked call — notes won&apos;t be saved
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {LIVE_NOTE_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => appendTag(tag)}
            className="px-2 py-1 bg-surface-low hover:bg-surface-mid rounded-lg font-label text-[10px] font-semibold text-on-surface transition-colors"
          >
            {tag}
          </button>
        ))}
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type notes here…"
        rows={4}
        className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary resize-none"
      />

      <label className="flex items-center gap-2 mt-2 mb-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
          className="rounded"
          disabled={!ctx.leadId}
        />
        <span className="font-label text-xs text-on-surface-muted">Pin this note</span>
      </label>

      <button
        onClick={handleSave}
        disabled={saving || !canSave}
        className="w-full py-2 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {savedFlash ? "Saved ✓" : saving ? "Saving…" : "Save Note"}
      </button>
    </div>
  );
}
