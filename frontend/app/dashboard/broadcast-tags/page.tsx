"use client";
import { useEffect, useState } from "react";
import { Plus, Download, Trash2, Tag, Loader2 } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type BroadcastTag = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

type TagStats = {
  tag_id: string;
  total_sent: number;
  hot: number;
  warm: number;
  cold: number;
};

async function fetchTags(): Promise<BroadcastTag[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/broadcast-tags`, { headers: auth });
  if (!res.ok) return [];
  return (await res.json()).data ?? [];
}

async function fetchTagStats(): Promise<TagStats[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/broadcast-tags/stats`, { headers: auth });
  if (!res.ok) return [];
  return (await res.json()).data ?? [];
}

async function createTag(name: string, color: string): Promise<BroadcastTag | null> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/broadcast-tags`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail || "Failed to create tag");
  }
  return (await res.json()).data;
}

async function deleteTag(id: string): Promise<void> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/broadcast-tags/${id}`, {
    method: "DELETE",
    headers: auth,
  });
  if (!res.ok) throw new Error("Failed to delete tag");
}

const PRESET_COLORS = [
  "#6D28D9", "#7C3AED", "#2563EB", "#0891B2", "#059669",
  "#D97706", "#DC2626", "#DB2777", "#4F46E5", "#0D9488",
  "#1D4ED8", "#047857", "#B45309", "#BE123C", "#4338CA",
  "#0E7490", "#15803D", "#A16207", "#9F1239", "#7E22CE",
  "#0284C7", "#EA580C", "#9333EA", "#E11D48",
];

export default function BroadcastTagsPage() {
  const [tags, setTags] = useState<BroadcastTag[]>([]);
  const [stats, setStats] = useState<Record<string, TagStats>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [ts, ss] = await Promise.all([fetchTags(), fetchTagStats()]);
    setTags(ts);
    const statMap: Record<string, TagStats> = {};
    for (const s of ss) statMap[s.tag_id] = s;
    setStats(statMap);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createTag(newName.trim(), newColor);
      toast.success(`Tag "${newName}" created`);
      setNewName("");
      setShowCreate(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tag");
    }
    setCreating(false);
  }

  async function handleDelete(tag: BroadcastTag) {
    if (!confirm(`Delete tag "${tag.name}"? This won't delete broadcasts or interest data.`)) return;
    setDeleting(tag.id);
    try {
      await deleteTag(tag.id);
      toast.success(`Tag "${tag.name}" deleted`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete tag");
    }
    setDeleting(null);
  }

  function downloadTagCsv(tagId: string) {
    window.open(`${API_URL}/api/v1/uploads/tag-csv?tag_id=${tagId}`, "_blank");
  }

  function downloadTagCsvHotOnly(tagId: string) {
    window.open(`${API_URL}/api/v1/uploads/tag-csv?tag_id=${tagId}&hot_only=true`, "_blank");
  }

  function downloadAllTagsCsv() {
    window.open(`${API_URL}/api/v1/uploads/all-tags-csv`, "_blank");
  }

  return (
    <div>
      <div className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="page-title">Broadcast Tags</h1>
          <p className="page-subtitle">Tag each bulk send by product. Download CSVs to see which customers are Hot, Warm, or Cold per product.</p>
        </div>
        <button
          onClick={() => setShowCreate(prev => !prev)}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl font-label text-sm font-semibold transition-colors border",
            showCreate
              ? "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100"
              : "bg-white border-surface-mid text-on-surface hover:text-violet-600 hover:border-violet-300"
          )}
        >
          <Plus size={16} />
          {showCreate ? "Cancel" : "New Tag"}
        </button>
      </div>

      {showCreate && (
        <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 mb-6">
          <h3 className="font-label text-sm font-semibold text-on-surface mb-4">Create Tag</h3>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="flex-1">
              <label className="font-label text-xs text-on-surface-muted mb-1 block">Tag Name</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder="e.g. Biscuits, Ice Cream"
                className="w-full px-3 py-2 rounded-lg border border-surface-mid bg-surface-low font-label text-sm text-on-surface placeholder:text-on-surface-muted/50 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div>
              <label className="font-label text-xs text-on-surface-muted mb-1 block">Color</label>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={cn(
                      "w-7 h-7 rounded-full transition-transform",
                      newColor === c ? "ring-2 ring-offset-2 ring-violet-500 scale-110" : "hover:scale-110"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="mt-5 px-5 py-2 rounded-xl bg-violet-600 text-white font-label text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {creating && <Loader2 size={14} className="animate-spin" />}
              Create
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card rounded-card p-8 text-center font-body text-sm text-on-surface-muted">Loading…</div>
      ) : tags.length === 0 ? (
        <div className="bg-surface rounded-card p-12 shadow-card ring-1 ring-[#c4c7c7]/15 text-center">
          <Tag size={32} className="text-on-surface-muted/30 mx-auto mb-3" />
          <p className="font-display font-bold text-on-surface">No tags yet</p>
          <p className="font-body text-sm text-on-surface-muted mt-1">Create your first tag to start tracking product-wise interest.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-mid">
                  <th className="font-label text-xs font-semibold text-on-surface-muted text-left px-5 py-3">Tag</th>
                  <th className="font-label text-xs font-semibold text-on-surface-muted text-center px-3 py-3">Sent</th>
                  <th className="font-label text-xs font-semibold text-on-surface-muted text-center px-3 py-3">Hot</th>
                  <th className="font-label text-xs font-semibold text-on-surface-muted text-center px-3 py-3">Warm</th>
                  <th className="font-label text-xs font-semibold text-on-surface-muted text-center px-3 py-3">Cold</th>
                  <th className="font-label text-xs font-semibold text-on-surface-muted text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-mid/50">
                {tags.map(tag => {
                  const s = stats[tag.id];
                  return (
                    <tr key={tag.id} className="hover:bg-surface-subtle/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                          <span className="font-label text-sm font-semibold text-on-surface">{tag.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-label text-sm text-on-surface-muted">{s?.total_sent ?? 0}</td>
                      <td className="px-3 py-3 text-center font-label text-sm font-semibold text-green-600">{s?.hot ?? 0}</td>
                      <td className="px-3 py-3 text-center font-label text-sm font-semibold text-amber-600">{s?.warm ?? 0}</td>
                      <td className="px-3 py-3 text-center font-label text-sm text-on-surface-muted">{s?.cold ?? 0}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => downloadTagCsv(tag.id)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-surface-mid text-on-surface-muted hover:text-on-surface hover:border-violet-300 transition-colors flex items-center gap-1"
                            title="Download full CSV (Hot + Warm + Cold)"
                          >
                            <Download size={12} /> All
                          </button>
                          <button
                            onClick={() => downloadTagCsvHotOnly(tag.id)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition-colors flex items-center gap-1"
                            title="Download Hot leads only"
                          >
                            <Download size={12} /> Hot only
                          </button>
                          <button
                            onClick={() => handleDelete(tag)}
                            disabled={deleting === tag.id}
                            className="p-1.5 rounded-lg text-on-surface-muted/50 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Delete tag"
                          >
                            {deleting === tag.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={downloadAllTagsCsv}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white font-label text-sm font-semibold hover:bg-violet-700 transition-colors shadow-sm"
            >
              <Download size={16} />
              Download All Tags CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
