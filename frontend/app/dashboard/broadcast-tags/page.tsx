"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Download, Trash2, Tag, Loader2, ChevronDown, Palette, RefreshCw } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePolling } from "@/hooks/usePolling";
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
  disqualified: number;
  opted_out: number;
  failed: number;
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
  "#FFFFFF", "#FBBF24", "#22C55E", "#EF4444", "#3B82F6",
  "#F97316", "#8B5CF6", "#1F2937", "#EC4899", "#14B8A6",
  "#6366F1", "#84CC16",
];

function hexToLightTint(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.07)`;
}

const SEGMENT_OPTIONS = [
  { label: "All Leads", value: "", color: "text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100" },
  { label: "Hot", value: "A", color: "text-green-700 bg-green-50 border-green-200 hover:bg-green-100" },
  { label: "Warm", value: "B", color: "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100" },
  { label: "Cold", value: "C", color: "text-gray-700 bg-gray-50 border-gray-200 hover:bg-gray-100" },
  { label: "Disqualified", value: "D", color: "text-red-700 bg-red-50 border-red-200 hover:bg-red-100" },
  { label: "Opted Out", value: "opted_out", color: "text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100" },
];

function SegmentDropdown({ tagId }: { tagId: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        btnRef.current && !btnRef.current.contains(t) &&
        dropdownRef.current && !dropdownRef.current.contains(t)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function download(segment: string) {
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/upload/tag-csv?tag_id=${tagId}&segment=${segment}`, { headers: auth });
      if (!res.ok) throw new Error("failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tag_leads_${segment ? segment.toLowerCase() : "all"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    }
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="text-xs px-2.5 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 transition-colors flex items-center gap-1 font-medium"
      >
        <Download size={12} /> Segment Leads
        <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-40 bg-white rounded-xl shadow-xl border border-surface-mid z-[9999] overflow-hidden"
          style={{ top: position.top, right: position.right }}
        >
          {SEGMENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => download(opt.value)}
              className={cn("w-full text-left text-xs px-3 py-2.5 font-label font-semibold transition-colors border-b border-surface-mid/30 last:border-0", opt.color)}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function ExportAllDropdown({ tagCount }: { tagCount: number }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function download(mode: string) {
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v1/upload/all-tags-combined?mode=${mode}`, { headers: auth });
      if (!res.ok) throw new Error("failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `all_tags_combined_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    }
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-surface-mid text-on-surface font-label text-sm font-semibold hover:border-violet-300 hover:text-violet-600 transition-colors"
      >
        <Download size={16} />
        Export All
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && createPortal(
        <div
          className="fixed w-56 bg-white rounded-xl shadow-xl border border-surface-mid z-[9999] overflow-hidden"
          style={{ top: position.top, right: position.right }}
        >
          <button
            onClick={() => download("all")}
            className="w-full text-left text-xs px-4 py-3 font-label transition-colors border-b border-surface-mid/30 hover:bg-violet-50"
          >
            <p className="font-semibold text-on-surface">All Tags</p>
            <p className="text-on-surface-muted mt-0.5">Combine all {tagCount} tags — {tagCount > 0 ? "no dedup" : "empty"}</p>
          </button>
          <button
            onClick={() => download("cross")}
            className="w-full text-left text-xs px-4 py-3 font-label transition-colors hover:bg-violet-50"
          >
            <p className="font-semibold text-on-surface">Cross-Tag</p>
            <p className="text-on-surface-muted mt-0.5">Best segment per lead across all tags</p>
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

export default function BroadcastTagsPage() {
  const [tags, setTags] = useState<BroadcastTag[]>([]);
  const [stats, setStats] = useState<Record<string, TagStats>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [customColor, setCustomColor] = useState("");
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

  usePolling(load, 30000);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const colorToUse = customColor || newColor;
      await createTag(newName.trim(), colorToUse);
      toast.success(`Tag "${newName}" created`);
      setNewName("");
      setCustomColor("");
      setShowCreate(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tag");
    }
    setCreating(false);
  }

  function handleCustomColor(val: string) {
    setCustomColor(val);
    setNewColor(val);
  }

  function handlePresetColor(c: string) {
    setCustomColor("");
    setNewColor(c);
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

  return (
    <div>
      <div className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="page-title">Tags</h1>
          <p className="page-subtitle">Tag each broadcast by product to track interest per audience segment.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportAllDropdown tagCount={tags.length} />
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-surface-mid text-on-surface hover:border-violet-300 font-label text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn("transition-transform", loading && "animate-spin")} />
            Refresh
          </button>
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
      </div>

      {showCreate && (
        <div className="bg-surface rounded-card p-4 shadow-card ring-1 ring-[#c4c7c7]/15 mb-4">
          <h3 className="font-label text-sm font-semibold text-on-surface mb-3">Create Tag</h3>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
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
              <div className="flex items-center gap-1.5 flex-wrap max-w-[420px]">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => handlePresetColor(c)}
                    className={cn(
                      "w-6 h-6 rounded-full transition-transform border border-surface-mid shrink-0",
                      newColor === c && !customColor ? "ring-2 ring-offset-1 ring-violet-500 scale-110" : "hover:scale-110"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <div className="w-px h-6 bg-surface-mid mx-1 shrink-0" />
                <Palette size={12} className="text-on-surface-muted shrink-0" />
                <input
                  type="color"
                  value={customColor || newColor}
                  onChange={e => handleCustomColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border border-surface-mid shrink-0"
                  title="Custom color"
                />
                <span className="font-mono text-xs text-on-surface-muted shrink-0">{customColor || newColor}</span>
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 rounded-xl bg-violet-600 text-white font-label text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
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
                  <th className="font-label text-xs font-semibold text-red-500 text-center px-3 py-3">DQ</th>
                  <th className="font-label text-xs font-semibold text-orange-500 text-center px-3 py-3">Opted Out</th>
                  <th className="font-label text-xs font-semibold text-on-surface-muted text-center px-3 py-3">Failed</th>
                  <th className="font-label text-xs font-semibold text-on-surface-muted text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-mid/50">
                {tags.map(tag => {
                  const s = stats[tag.id];
                  return (
                    <tr key={tag.id} className="hover:brightness-95 transition-all" style={{ backgroundColor: hexToLightTint(tag.color) }}>
                      <td className="px-5 py-3">
                        <span className="font-label text-sm font-semibold text-on-surface">{tag.name}</span>
                      </td>
                      <td className="px-3 py-3 text-center font-label text-sm text-on-surface-muted">{s?.total_sent ?? 0}</td>
                      <td className="px-3 py-3 text-center font-label text-sm font-semibold text-green-600">{s?.hot ?? 0}</td>
                      <td className="px-3 py-3 text-center font-label text-sm font-semibold text-amber-600">{s?.warm ?? 0}</td>
                      <td className="px-3 py-3 text-center font-label text-sm text-on-surface-muted">{s?.cold ?? 0}</td>
                      <td className="px-3 py-3 text-center font-label text-sm font-semibold text-red-500">{s?.disqualified ?? 0}</td>
                      <td className="px-3 py-3 text-center font-label text-sm font-semibold text-orange-500">{s?.opted_out ?? 0}</td>
                      <td className="px-3 py-3 text-center font-label text-sm text-on-surface-muted">{s?.failed ?? 0}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <SegmentDropdown tagId={tag.id} />
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
        </div>
      )}
    </div>
  );
}
