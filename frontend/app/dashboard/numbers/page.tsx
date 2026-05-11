"use client";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Plus, X, Pencil, Trash2, ChevronDown, PauseCircle, PlayCircle, Star } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

type PhoneNumber = {
  id: string;
  provider: "meta_cloud";
  number: string;
  display_name: string;
  role: "primary" | "standby" | "archived";
  status: "active" | "warming" | "restricted" | "archived";
  quality_rating: "green" | "yellow" | "red";
  messaging_tier: 1000 | 10000 | 100000;
  daily_send_count: number;
  warm_up_day: number;
  paused_outbound: boolean;
  created_at: string;
};

const QUALITY_DOT: Record<PhoneNumber["quality_rating"], string> = {
  green: "🟢",
  yellow: "🟡",
  red: "🔴",
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
};

function ActionMenu({
  num,
  activeCount,
  onSetPrimary,
  onTogglePause,
  onRename,
  onDelete,
}: {
  num: PhoneNumber;
  activeCount: number;
  onSetPrimary: () => void;
  onTogglePause: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isLastActive = activeCount === 1 && num.status === "active";
  const canSetPrimary = num.role === "standby" && num.status === "active";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-surface-mid transition-colors font-label text-xs text-on-surface-muted hover:text-on-surface"
      >
        Actions
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-surface rounded-xl shadow-card ring-1 ring-[#c4c7c7]/20 py-1">
          {canSetPrimary && (
            <button
              onClick={() => { setOpen(false); onSetPrimary(); }}
              className="w-full flex items-center gap-2 px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low transition-colors"
            >
              <Star size={12} className="text-blue-500" />
              Set as Primary
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onTogglePause(); }}
            className="w-full flex items-center gap-2 px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low transition-colors"
          >
            {num.paused_outbound
              ? <PlayCircle size={12} className="text-green-600" />
              : <PauseCircle size={12} className="text-amber-600" />}
            {num.paused_outbound ? "Resume Outbound" : "Pause Outbound"}
          </button>
          <button
            onClick={() => { setOpen(false); onRename(); }}
            className="w-full flex items-center gap-2 px-3 py-2 font-label text-xs text-on-surface hover:bg-surface-low transition-colors"
          >
            <Pencil size={12} className="text-on-surface-muted" />
            Rename
          </button>
          <div className="my-1 border-t border-surface-mid" />
          <button
            onClick={() => { if (!isLastActive) { setOpen(false); onDelete(); } }}
            disabled={isLastActive}
            title={isLastActive ? "Cannot delete last active number" : undefined}
            className="w-full flex items-center gap-2 px-3 py-2 font-label text-xs hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-red-500"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function NumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addNumber, setAddNumber] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [addMetaId, setAddMetaId] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleTogglePause(num: PhoneNumber) {
    try {
      await numbersApi.update(num.id, { paused_outbound: !num.paused_outbound });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

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

  async function handleDelete(id: string) {
    if (!confirm("This will archive the number. It will no longer send or receive messages.")) return;
    try {
      await numbersApi.remove(id);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const activeCount = numbers.filter((n) => n.status === "active").length;
  const visible = numbers.filter((n) => showArchived || n.status !== "archived");

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-tertiary">WhatsApp Numbers</h1>
        <p className="font-body text-on-surface-muted mt-1">Manage sender numbers, warm-up, and outbound routing</p>
      </div>

      <div className="bg-surface rounded-card p-8 shadow-card ring-1 ring-[#c4c7c7]/15">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="font-display text-lg font-bold text-tertiary">Number Pool</h2>
            <label className="flex items-center gap-1.5 font-label text-xs text-on-surface-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded"
              />
              Show archived
            </label>
          </div>
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
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-mid">
                  {["Display Name", "Number", "Provider", "Role", "Status", "Quality", "Sends Today / Limit", "Warm-up", "Actions"].map((h) => (
                    <th key={h} className="pb-3 pr-4 font-label text-xs font-semibold text-on-surface-muted whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((num) => {
                  const isEditing = editingId === num.id;
                  return (
                    <tr key={num.id} className="border-b border-surface-mid/50 hover:bg-surface-low transition-colors">
                      <td className="py-3 pr-4">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRename(num.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              autoFocus
                              className="px-2 py-1 rounded-lg bg-surface border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary w-36"
                            />
                            <button
                              onClick={() => saveRename(num.id)}
                              disabled={saving}
                              className="px-2 py-1 bg-tertiary text-white rounded-lg font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-50 transition-colors"
                            >
                              {saving ? "…" : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 rounded-lg hover:bg-surface-mid transition-colors text-on-surface-muted"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="font-body text-sm font-semibold text-on-surface">
                              {num.display_name}
                            </span>
                            {num.paused_outbound && (
                              <span className="px-1.5 py-0.5 rounded font-label text-[10px] bg-amber-100 text-amber-700">
                                paused
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-label text-xs text-on-surface-muted whitespace-nowrap">
                        {num.number}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-label text-xs text-on-surface capitalize">
                          Meta Cloud
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`px-2.5 py-1 rounded-full font-label text-xs font-semibold capitalize ${ROLE_STYLES[num.role]}`}>
                          {num.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {num.status === "warming" ? (
                          <span className={`px-2.5 py-1 rounded-full font-label text-xs font-semibold ${STATUS_STYLES.warming}`}>
                            Day {num.warm_up_day}/{WARM_UP_TARGET}
                          </span>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-full font-label text-xs font-semibold capitalize ${STATUS_STYLES[num.status]}`}>
                            {num.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-center font-label text-sm">
                        {QUALITY_DOT[num.quality_rating]}
                      </td>
                      <td className="py-3 pr-4 font-label text-xs text-on-surface whitespace-nowrap">
                        {num.daily_send_count.toLocaleString()} / {num.messaging_tier.toLocaleString()}
                      </td>
                      <td className="py-3 pr-4">
                        {num.status === "warming" ? (
                          <div className="w-20">
                            <div className="h-1.5 rounded-full bg-surface-mid overflow-hidden">
                              <div
                                className="h-full rounded-full bg-amber-400"
                                style={{ width: `${Math.min((num.warm_up_day / WARM_UP_TARGET) * 100, 100)}%` }}
                              />
                            </div>
                            <p className="font-label text-[10px] text-on-surface-muted mt-0.5">
                              Day {num.warm_up_day}/{WARM_UP_TARGET}
                            </p>
                          </div>
                        ) : (
                          <span className="font-label text-xs text-on-surface-muted">—</span>
                        )}
                      </td>
                      <td className="py-3">
                        {!isEditing && (
                          <ActionMenu
                            num={num}
                            activeCount={activeCount}
                            onSetPrimary={() => handleSetPrimary(num.id)}
                            onTogglePause={() => handleTogglePause(num)}
                            onRename={() => startRename(num)}
                            onDelete={() => handleDelete(num.id)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                <label className="block font-label text-xs font-semibold text-on-surface-muted mb-1.5">
                  Provider
                </label>
                <div className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm text-on-surface-muted">
                  Meta Cloud API
                </div>
              </div>

              <div>
                <label className="block font-label text-xs font-semibold text-on-surface-muted mb-1.5">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="+919876543210"
                  value={addNumber}
                  onChange={(e) => setAddNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
                />
              </div>

              <div>
                <label className="block font-label text-xs font-semibold text-on-surface-muted mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Aira Main"
                  value={addDisplayName}
                  onChange={(e) => setAddDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm focus:outline-none focus:ring-2 focus:ring-tertiary"
                />
              </div>

              <div>
                <label className="block font-label text-xs font-semibold text-on-surface-muted mb-1.5">
                  Meta Phone Number ID
                </label>
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
