"use client";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Plus, X, Pencil, Check, Trash2, PauseCircle, PlayCircle, Star, RefreshCw, Activity } from "lucide-react";
import Link from "next/link";
import { API_URL, getAuthHeaders } from "@/lib/api";

type PhoneNumber = {
  id: string;
  provider: "meta_cloud";
  number: string;
  display_name: string;
  role: "primary" | "standby" | "archived";
  status: "active" | "warming" | "restricted" | "archived";
  quality_rating: "green" | "yellow" | "red";
  messaging_tier: number;
  daily_send_count: number;
  warm_up_day: number;
  paused_outbound: boolean;
  created_at: string;
};

const QUALITY_COLOR: Record<PhoneNumber["quality_rating"], string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-red-400",
};

const QUALITY_LABEL: Record<PhoneNumber["quality_rating"], string> = {
  green: "High",
  yellow: "Medium",
  red: "Low",
};

const ROLE_STYLES: Record<PhoneNumber["role"], string> = {
  primary: "bg-blue-100 text-blue-700",
  standby: "bg-surface-mid text-on-surface-muted",
  archived: "bg-surface-low text-on-surface-muted opacity-60",
};

const STATUS_STYLES: Record<PhoneNumber["status"], string> = {
  active: "bg-green-100 text-green-700",
  warming: "bg-amber-100 text-amber-700",
  restricted: "bg-red-100 text-red-700",
  archived: "bg-surface-mid text-on-surface-muted opacity-60",
};

const WARM_UP_TARGET = 14;

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders },
    ...opts,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

const numbersApi = {
  list: () =>
    apiFetch<{ data: PhoneNumber[] }>("/api/v1/numbers").then((r) => r.data ?? []),
  create: (payload: {
    provider: string;
    number: string;
    display_name: string;
    meta_phone_number_id?: string;
    api_key?: string;
  }) =>
    apiFetch<PhoneNumber>("/api/v1/numbers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, data: Partial<Pick<PhoneNumber, "role" | "status" | "display_name" | "paused_outbound">>) =>
    apiFetch<PhoneNumber>(`/api/v1/numbers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/v1/numbers/${id}`, { method: "DELETE" }),
  syncMeta: (id: string) =>
    apiFetch<PhoneNumber>(`/api/v1/numbers/${id}/sync-meta`, { method: "POST" }),
};

export default function NumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addNumber, setAddNumber] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [addMetaId, setAddMetaId] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);

  async function reload() {
    const rows = await numbersApi.list();
    setNumbers(rows);
  }

  useEffect(() => {
    setLoading(true);
    numbersApi.list().then((rows) => {
      setNumbers(rows);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  function startRename(num: PhoneNumber) {
    setEditingId(num.id);
    setEditName(num.display_name);
  }

  async function saveRename(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await numbersApi.update(id, { display_name: editName.trim() });
      await reload();
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!addNumber.trim() || !addDisplayName.trim()) return;
    setAdding(true);
    try {
      await numbersApi.create({
        provider: "meta_cloud",
        number: addNumber.trim(),
        display_name: addDisplayName.trim(),
        ...(addMetaId.trim() ? { meta_phone_number_id: addMetaId.trim() } : {}),
      });
      await reload();
      setShowAddModal(false);
      setAddNumber("");
      setAddDisplayName("");
      setAddMetaId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add number");
    } finally {
      setAdding(false);
    }
  }

  async function handleSetPrimary(id: string) {
    try {
      await numbersApi.update(id, { role: "primary" });
      await reload();
      toast.success("Set as primary number");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleTogglePause(num: PhoneNumber) {
    setPausingId(num.id);
    try {
      await numbersApi.update(num.id, { paused_outbound: !num.paused_outbound });
      await reload();
      toast.success(num.paused_outbound ? "Outbound resumed" : "Outbound paused");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPausingId(null);
    }
  }

  async function handleSyncMeta(id: string) {
    setSyncingId(id);
    try {
      await numbersApi.syncMeta(id);
      await reload();
      toast.success("Synced from Meta");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this number? It will no longer send or receive messages.")) return;
    try {
      await numbersApi.remove(id);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const activeCount = numbers.filter((n) => n.status === "active").length;
  const visible = numbers.filter((n) => n.status !== "archived");

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-tertiary">WhatsApp Numbers</h1>
          <p className="font-body text-on-surface-muted mt-1">Manage sender numbers, warm-up, and outbound routing</p>
        </div>
        <Link
          href="/dashboard/numbers/health"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-surface-mid hover:bg-surface-low transition-colors font-label text-xs text-on-surface-muted hover:text-on-surface"
        >
          <Activity size={13} />
          Health Dashboard
        </Link>
      </div>

      <div className="bg-surface rounded-card shadow-card ring-1 ring-[#c4c7c7]/15 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-lg font-bold text-tertiary">Number Pool</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 transition-colors"
          >
            <Plus size={13} />
            Add Number
          </button>
        </div>

        {loading ? (
          <p className="font-body text-sm text-on-surface-muted">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="font-body text-sm text-on-surface-muted">
            No numbers yet. Click &quot;Add Number&quot; to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((num) => {
              const isEditing = editingId === num.id;
              const isSyncing = syncingId === num.id;
              const isPausing = pausingId === num.id;
              const sendPct = num.messaging_tier > 0
                ? Math.min((num.daily_send_count / num.messaging_tier) * 100, 100)
                : 0;

              return (
                <div
                  key={num.id}
                  className="rounded-xl border border-surface-mid bg-surface-low/40 p-4 hover:bg-surface-low transition-colors"
                >
                  {/* Row 1: name + role + status + quality */}
                  <div className="flex items-center gap-3 mb-3">
                    {/* Inline-editable name */}
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(num.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-surface border border-tertiary font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary min-w-0 w-48"
                        />
                        <button
                          onClick={() => saveRename(num.id)}
                          disabled={saving}
                          className="p-1.5 rounded-lg bg-tertiary text-white hover:bg-tertiary/90 disabled:opacity-50 transition-colors"
                          title="Save"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 rounded-lg hover:bg-surface-mid transition-colors text-on-surface-muted"
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startRename(num)}
                        className="flex items-center gap-1.5 group min-w-0"
                        title="Click to rename"
                      >
                        <span className="font-body text-sm font-semibold text-on-surface group-hover:text-tertiary transition-colors truncate">
                          {num.display_name}
                        </span>
                        <Pencil size={11} className="text-on-surface-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </button>
                    )}

                    <span className="font-label text-xs text-on-surface-muted whitespace-nowrap">{num.number}</span>

                    {/* Role */}
                    <span className={`px-2 py-0.5 rounded-full font-label text-[11px] font-semibold capitalize ${ROLE_STYLES[num.role]}`}>
                      {num.role}
                    </span>

                    {/* Status */}
                    <span className={`px-2 py-0.5 rounded-full font-label text-[11px] font-semibold ${STATUS_STYLES[num.status]}`}>
                      {num.status === "warming" ? `Warming · Day ${num.warm_up_day}/${WARM_UP_TARGET}` : num.status}
                    </span>

                    {/* Quality */}
                    <span className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${QUALITY_COLOR[num.quality_rating]}`} />
                      <span className="font-label text-[11px] text-on-surface-muted">{QUALITY_LABEL[num.quality_rating]}</span>
                    </span>

                    {/* Paused badge */}
                    {num.paused_outbound && (
                      <span className="px-2 py-0.5 rounded-full font-label text-[11px] bg-amber-100 text-amber-700 font-semibold">
                        Paused
                      </span>
                    )}
                  </div>

                  {/* Row 2: sends bar + warm-up + actions */}
                  <div className="flex items-center gap-4">
                    {/* Daily sends bar */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-label text-[11px] text-on-surface-muted whitespace-nowrap">
                        {num.daily_send_count.toLocaleString()} / {num.messaging_tier.toLocaleString()} today
                      </span>
                      <div className="w-24 h-1.5 rounded-full bg-surface-mid overflow-hidden flex-shrink-0">
                        <div
                          className={`h-full rounded-full transition-all ${sendPct > 80 ? "bg-red-400" : sendPct > 50 ? "bg-amber-400" : "bg-emerald-400"}`}
                          style={{ width: `${sendPct}%` }}
                        />
                      </div>
                      <span className="font-label text-[11px] text-on-surface-muted">{Math.round(sendPct)}%</span>
                    </div>

                    {/* Warm-up bar */}
                    {num.status === "warming" && (
                      <div className="flex items-center gap-2">
                        <span className="font-label text-[11px] text-on-surface-muted whitespace-nowrap">Warm-up</span>
                        <div className="w-20 h-1.5 rounded-full bg-surface-mid overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${Math.min((num.warm_up_day / WARM_UP_TARGET) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Action buttons — always visible, never in a dropdown */}

                    {/* Set as Primary */}
                    {num.role !== "primary" && num.role !== "archived" && (
                      <button
                        onClick={() => handleSetPrimary(num.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-600 font-label text-[11px] font-semibold transition-colors"
                        title="Set as primary number"
                      >
                        <Star size={11} />
                        Set Primary
                      </button>
                    )}

                    {/* Pause / Resume — prominent */}
                    <button
                      onClick={() => handleTogglePause(num)}
                      disabled={isPausing}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-label text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                        num.paused_outbound
                          ? "border-green-200 bg-green-50 hover:bg-green-100 text-green-700"
                          : "border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700"
                      }`}
                      title={num.paused_outbound ? "Resume outbound messaging" : "Pause outbound messaging"}
                    >
                      {num.paused_outbound
                        ? <><PlayCircle size={12} /> Resume</>
                        : <><PauseCircle size={12} /> Pause</>
                      }
                    </button>

                    {/* Sync from Meta */}
                    <button
                      onClick={() => handleSyncMeta(num.id)}
                      disabled={isSyncing}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-surface-mid bg-surface hover:bg-surface-low text-on-surface-muted hover:text-on-surface font-label text-[11px] font-semibold transition-colors disabled:opacity-50"
                      title="Pull latest quality rating and tier from Meta"
                    >
                      <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} />
                      {isSyncing ? "Syncing…" : "Sync Meta"}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(num.id)}
                      disabled={activeCount === 1 && num.status === "active"}
                      title={activeCount === 1 && num.status === "active" ? "Cannot delete last active number" : "Delete number"}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-on-surface-muted hover:text-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Number Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface rounded-card p-8 shadow-card w-full max-w-md ring-1 ring-[#c4c7c7]/20">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-lg font-bold text-tertiary">Add Number</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg hover:bg-surface-low transition-colors text-on-surface-muted"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block font-label text-xs font-semibold text-on-surface-muted mb-1.5">Provider</label>
                <div className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm text-on-surface-muted">
                  Meta Cloud API
                </div>
              </div>
              <div>
                <label className="block font-label text-xs font-semibold text-on-surface-muted mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  placeholder="+919876543210"
                  value={addNumber}
                  onChange={(e) => setAddNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
                />
              </div>
              <div>
                <label className="block font-label text-xs font-semibold text-on-surface-muted mb-1.5">Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Aira Main"
                  value={addDisplayName}
                  onChange={(e) => setAddDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
                />
              </div>
              <div>
                <label className="block font-label text-xs font-semibold text-on-surface-muted mb-1.5">Meta Phone Number ID</label>
                <input
                  type="text"
                  placeholder="From Meta Business Manager"
                  value={addMetaId}
                  onChange={(e) => setAddMetaId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={adding || !addNumber.trim() || !addDisplayName.trim()}
                className="w-full py-2.5 bg-tertiary text-white rounded-lg font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {adding ? "Adding…" : "Add Number"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
