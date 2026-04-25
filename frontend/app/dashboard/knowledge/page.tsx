"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Save, X, BookOpen, Flame } from "lucide-react";
import { api, FAQ, FAQInput } from "@/lib/api";

const EMPTY: FAQInput = { question: "", answer: "", keywords: [], active: true };

export default function KnowledgePage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<FAQInput>(EMPTY);
  const [draftKeywords, setDraftKeywords] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBuf, setEditBuf] = useState<FAQInput>(EMPTY);
  const [editKeywords, setEditKeywords] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.knowledge.list();
      setFaqs(data);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to load FAQs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function parseKeywords(raw: string): string[] {
    return raw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  }

  async function createFaq() {
    if (!draft.question.trim() || !draft.answer.trim()) {
      setMsg("Question and answer are required.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await api.knowledge.create({
        ...draft,
        keywords: parseKeywords(draftKeywords),
      });
      setDraft(EMPTY);
      setDraftKeywords("");
      setMsg("FAQ added.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(faq: FAQ) {
    setEditing(faq.id);
    setEditBuf({
      question: faq.question,
      answer: faq.answer,
      keywords: faq.keywords,
      active: faq.active,
    });
    setEditKeywords(faq.keywords.join(", "));
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      await api.knowledge.update(id, {
        ...editBuf,
        keywords: parseKeywords(editKeywords),
      });
      setEditing(null);
      await load();
      setMsg("Saved.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeFaq(id: string) {
    if (!confirm("Delete this FAQ permanently?")) return;
    try {
      await api.knowledge.remove(id);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function toggleActive(faq: FAQ) {
    try {
      await api.knowledge.update(faq.id, { active: !faq.active });
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Toggle failed");
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-tertiary flex items-center gap-3">
          <BookOpen size={28} /> Knowledge Base
        </h1>
        <p className="font-body text-on-surface-muted mt-1">
          FAQs the AI checks first before generating a reply. Cheap, deterministic, and trainable by you.
        </p>
      </div>

      {msg && (
        <div className="mb-4 p-3 rounded-xl bg-tertiary-bg text-tertiary font-label text-sm flex justify-between items-center">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Create card */}
      <div className="mb-8 bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
        <h2 className="font-display text-lg font-bold text-tertiary mb-4 flex items-center gap-2">
          <Plus size={18} /> Add New FAQ
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-label text-xs text-on-surface-muted mb-1 block">Question</label>
            <input
              type="text"
              value={draft.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              placeholder="e.g. What are the fees for B.Tech?"
              className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
            />
          </div>
          <div>
            <label className="font-label text-xs text-on-surface-muted mb-1 block">
              Keywords (comma-separated — inbound messages match on these)
            </label>
            <input
              type="text"
              value={draftKeywords}
              onChange={(e) => setDraftKeywords(e.target.value)}
              placeholder="e.g. fees, tuition, cost, btech fees"
              className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
            />
          </div>
          <div className="col-span-2">
            <label className="font-label text-xs text-on-surface-muted mb-1 block">Answer</label>
            <textarea
              value={draft.answer}
              onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
              rows={3}
              placeholder="The exact reply the AI will send when keywords match."
              className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={createFaq}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40"
          >
            <Save size={14} /> {saving ? "Saving…" : "Save FAQ"}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15 overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-mid flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-tertiary">
            {loading ? "Loading…" : `${faqs.length} FAQ${faqs.length === 1 ? "" : "s"}`}
          </h2>
          <span className="font-label text-xs text-on-surface-muted">Sorted by hits</span>
        </div>
        {!loading && faqs.length === 0 && (
          <div className="px-6 py-10 text-center font-body text-sm text-on-surface-muted">
            No FAQs yet. Add your first one above — every one you add saves the AI a Gemini call.
          </div>
        )}
        <div className="divide-y divide-surface-mid">
          {faqs.map((faq) => (
            <div key={faq.id} className="px-6 py-4">
              {editing === faq.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editBuf.question}
                    onChange={(e) => setEditBuf({ ...editBuf, question: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
                  />
                  <input
                    type="text"
                    value={editKeywords}
                    onChange={(e) => setEditKeywords(e.target.value)}
                    placeholder="comma-separated keywords"
                    className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
                  />
                  <textarea
                    value={editBuf.answer}
                    onChange={(e) => setEditBuf({ ...editBuf, answer: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(faq.id)}
                      disabled={saving}
                      className="flex items-center gap-1 px-3 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-40"
                    >
                      <Save size={12} /> {saving ? "…" : "Save"}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-surface border border-surface-mid text-on-surface-muted rounded-lg font-label text-xs hover:bg-surface-mid"
                    >
                      <X size={12} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-body text-sm font-semibold text-on-surface">{faq.question}</p>
                      {!faq.active && (
                        <span className="px-2 py-0.5 rounded-full bg-surface-mid text-on-surface-muted font-label text-[10px]">
                          Disabled
                        </span>
                      )}
                      {faq.hit_count > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-label text-[10px] font-semibold">
                          <Flame size={10} /> {faq.hit_count} hit{faq.hit_count === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="font-body text-sm text-on-surface-muted whitespace-pre-wrap">{faq.answer}</p>
                    {faq.keywords.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {faq.keywords.map((k) => (
                          <span key={k} className="px-2 py-0.5 rounded-md bg-tertiary-bg text-tertiary font-mono text-[11px]">
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(faq)}
                      className="px-3 py-1 rounded-md bg-surface-low border border-surface-mid font-label text-xs text-on-surface hover:bg-surface-mid"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(faq)}
                      className="px-3 py-1 rounded-md bg-surface-low border border-surface-mid font-label text-xs text-on-surface-muted hover:bg-surface-mid"
                    >
                      {faq.active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => removeFaq(faq.id)}
                      className="flex items-center justify-center gap-1 px-3 py-1 rounded-md bg-red-50 border border-red-100 text-red-600 font-label text-xs hover:bg-red-100"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
