"use client";
import { useEffect, useState } from "react";
import { Sparkles, Check, X, Play, Save } from "lucide-react";
import { api, AIPrompt, TuneSuggestion } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

export default function AiTunePage() {
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [activeName, setActiveName] = useState<string>("whatsapp_reply");
  const [draft, setDraft] = useState<string>("");
  const [suggestions, setSuggestions] = useState<TuneSuggestion[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadAll() {
    const [p, s] = await Promise.all([api.aiTune.prompts(), api.aiTune.suggestions("pending")]);
    setPrompts(p);
    setSuggestions(s);
    const cur = p.find((x) => x.name === activeName) ?? p[0];
    if (cur) {
      setActiveName(cur.name);
      setDraft(cur.content);
    }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cur = prompts.find((x) => x.name === activeName);
    if (cur) setDraft(cur.content);
  }, [activeName, prompts]);

  async function runAnalysis() {
    setAnalyzing(true);
    setMsg(null);
    try {
      const res = await api.aiTune.analyze(activeName);
      setMsg(
        `Analysed ${res.analyzed_leads} conversation${res.analyzed_leads === 1 ? "" : "s"} \u2014 ${res.suggestions_created} suggestion${res.suggestions_created === 1 ? "" : "s"} created.`,
      );
      await loadAll();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function savePrompt() {
    setSaving(true);
    try {
      await api.aiTune.updatePrompt(activeName, draft);
      setMsg("Prompt saved.");
      await loadAll();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function apply(id: string) {
    try {
      await api.aiTune.apply(id);
      setMsg("Suggestion applied to active prompt.");
      await loadAll();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Apply failed");
    }
  }

  async function reject(id: string) {
    try {
      await api.aiTune.reject(id);
      await loadAll();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Reject failed");
    }
  }

  const activePrompt = prompts.find((p) => p.name === activeName);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-tertiary">AI Auto-Tune</h1>
        <p className="font-body text-on-surface-muted mt-1">
          Analyse closed-deal conversations and refine the reply prompt.
        </p>
      </div>

      {msg && (
        <div className="mb-4 p-3 rounded-xl bg-tertiary-bg text-tertiary font-label text-sm">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-tertiary">Active Prompt</h2>
            <select
              value={activeName}
              onChange={(e) => setActiveName(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-surface-low border border-surface-mid font-label text-sm"
            >
              {prompts.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {activePrompt && (
            <p className="font-label text-sm text-on-surface-muted mb-3">
              Updated {timeAgo(activePrompt.updated_at)} \u2014 {activePrompt.content.length} chars
            </p>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={18}
            spellCheck={false}
            className="w-full px-5 py-4 rounded-xl bg-surface-low border border-surface-mid font-mono text-base leading-7 focus:outline-none focus:ring-2 focus:ring-tertiary"
            style={{ fontSize: "15px", lineHeight: "1.7" }}
          />
          <div className="mt-4 flex gap-3">
            <button
              onClick={savePrompt}
              disabled={saving || draft === activePrompt?.content}
              className="flex items-center gap-2 px-4 py-2 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40"
            >
              <Save size={14} /> {saving ? "Saving\u2026" : "Save"}
            </button>
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg font-label text-sm font-semibold hover:bg-secondary/90 disabled:opacity-40"
            >
              <Play size={14} /> {analyzing ? "Analysing\u2026" : "Run Analysis"}
            </button>
          </div>
        </div>

        <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15">
          <h2 className="font-display text-base font-bold text-tertiary flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-secondary" />
            Pending Suggestions ({suggestions.length})
          </h2>
          {suggestions.length === 0 ? (
            <p className="font-body text-sm text-on-surface-muted leading-relaxed">
              No pending suggestions. Mark leads as converted then run analysis.
            </p>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s) => (
                <div key={s.id} className="p-4 bg-surface-low rounded-xl">
                  <p className="font-body text-sm text-on-surface leading-relaxed">{s.suggestion}</p>
                  {s.rationale && (
                    <p className="mt-2 font-label text-sm text-on-surface-muted italic leading-relaxed">
                      {s.rationale}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => apply(s.id)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-tertiary text-white rounded-md font-label text-xs font-semibold hover:bg-tertiary/90"
                    >
                      <Check size={12} /> Apply
                    </button>
                    <button
                      onClick={() => reject(s.id)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-surface border border-surface-mid text-on-surface-muted rounded-md font-label text-xs hover:bg-surface-mid"
                    >
                      <X size={12} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
