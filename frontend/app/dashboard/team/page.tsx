"use client";
import { useEffect, useState } from "react";
import { Trash2, UserPlus, Phone, Pencil, Check, X, Loader2, Activity } from "lucide-react";
import Link from "next/link";
import { api, TeamMember } from "@/lib/api";
import { useAuthRole } from "../contexts/AuthRoleContext";
import WinnerBanner from "./WinnerBanner";

function InlineEditCell({
  callerId,
  initial,
  field,
  placeholder,
}: {
  callerId: string;
  initial: string | null;
  field: "name" | "phone" | "telecmi_agent_id";
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.callers.update(callerId, { [field]: value.trim() || null });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setValue(initial ?? ""); setEditing(false); }
          }}
          className="w-32 px-2 py-1 text-xs border border-border-subtle rounded-lg font-body focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={placeholder}
        />
        <button onClick={save} disabled={saving} className="p-1 rounded text-green-600 hover:bg-green-50">
          <Check size={13} />
        </button>
        <button onClick={() => { setValue(initial ?? ""); setEditing(false); }} className="p-1 rounded text-ink-muted hover:bg-surface-subtle">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 group">
      <span className={`font-body text-sm ${value ? "text-ink" : "text-ink-muted"}`}>
        {value || "—"}
      </span>
      <button
        onClick={() => setEditing(true)}
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-subtle text-ink-muted transition-opacity"
      >
        <Pencil size={11} />
      </button>
    </div>
  );
}

export default function TeamPage() {
  const { role, loading: roleLoading } = useAuthRole();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telecmiAgentId, setTelecmiAgentId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.team.list();
      setMembers(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "owner") {
    return (
      <div className="text-center py-20">
        <p className="text-ink-muted font-body">
          This section is only available for owners/admins.
        </p>
      </div>
    );
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setInviting(true);
    setError(null);
    try {
      await api.team.invite(email.trim(), password.trim(), name.trim() || undefined, phone.trim() || undefined, telecmiAgentId.trim() || undefined);
      setEmail(""); setPassword(""); setName(""); setPhone(""); setTelecmiAgentId("");
      setShowInvite(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create telecaller");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member from your team?")) return;
    await api.team.remove(userId);
    await load();
  }

  // Owner row first, then callers
  const sorted = [...members].sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">Add and manage telecallers under your account.</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary">
          <UserPlus size={14} /> Add Telecaller
        </button>
      </div>

      <WinnerBanner />

      {showInvite && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-md p-6">
            <h2 className="font-display font-bold text-ink mb-4" style={{ fontSize: "1.05rem" }}>
              Add Telecaller
            </h2>
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 font-body text-sm">{error}</div>
            )}
            <form onSubmit={handleInvite} className="space-y-3">
              <div>
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" placeholder="telecaller@example.com" />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">Password *</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="input" placeholder="Set a password for them" />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ravi Kumar" />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="+919876543210" />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">TeleCMI Agent ID</label>
                <input type="text" value={telecmiAgentId} onChange={(e) => setTelecmiAgentId(e.target.value)} className="input" placeholder="e.g. 102_33335739" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowInvite(false); setError(null); }} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={inviting || !email.trim()} className="btn-primary flex-1">
                  {inviting ? "Adding…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card rounded-3xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center font-body text-sm text-ink-muted">Loading…</div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-display font-bold text-ink mb-2">No team members yet</p>
            <p className="font-body text-sm text-ink-muted">Invite your first telecaller to get started.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                {["Member", "Role", "Score", "Phone", "Agent ID", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left stat-label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {sorted.map((m) => (
                <tr key={m.user_id} className="hover:bg-surface-subtle transition-colors">
                  <td className="px-5 py-4">
                    {m.caller_profile?.id ? (
                      <InlineEditCell
                        callerId={m.caller_profile.id}
                        initial={m.caller_profile.name ?? null}
                        field="name"
                        placeholder="Name"
                      />
                    ) : (
                      <>
                        <p className="font-label font-semibold text-ink text-sm">—</p>
                        <p className="font-body text-xs text-ink-muted">{m.user_id.slice(0, 8)}…</p>
                      </>
                    )}
                    <p className="font-body text-xs text-ink-muted mt-0.5">{m.user_id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`badge ${m.role === "owner" ? "badge-green" : "badge-yellow"}`}>
                      {m.role === "owner" ? "admin" : "caller"}
                    </span>
                    {m.role === "owner" && (
                      <p className="font-body text-xs text-ink-muted mt-1">global fallback</p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-body text-sm text-ink">{m.caller_profile?.overall_score ?? "—"}</span>
                  </td>
                  <td className="px-5 py-4">
                    {m.caller_profile?.id ? (
                      <InlineEditCell
                        callerId={m.caller_profile.id}
                        initial={m.caller_profile.phone ?? null}
                        field="phone"
                        placeholder="+91xxxxxxxxxx"
                      />
                    ) : (
                      <span className="font-body text-sm text-ink-muted flex items-center gap-1">
                        <Phone size={12} /> —
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {m.caller_profile?.id ? (
                      <InlineEditCell
                        callerId={m.caller_profile.id}
                        initial={m.caller_profile.telecmi_agent_id ?? null}
                        field="telecmi_agent_id"
                        placeholder="e.g. 102_33335739"
                      />
                    ) : "—"}
                  </td>
                  <td className="px-5 py-4 flex items-center justify-end gap-2">
                    {m.caller_profile?.id && (
                      <Link href={`/dashboard/team/${m.caller_profile.id}`} className="p-1.5 rounded-lg hover:bg-surface-subtle text-ink-muted hover:text-primary transition-colors" title="View Timeline">
                        <Activity size={16} />
                      </Link>
                    )}
                    {m.role !== "owner" && (
                      <button onClick={() => handleRemove(m.user_id)} className="p-1.5 rounded-lg hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors" title="Remove Telecaller">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
