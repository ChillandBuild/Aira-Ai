"use client";
import { useEffect, useState } from "react";
import { Trash2, UserPlus, Phone } from "lucide-react";
import { api, TeamMember } from "@/lib/api";

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    try {
      await api.team.invite(email.trim(), name.trim() || undefined, phone.trim() || undefined);
      setEmail(""); setName(""); setPhone("");
      setShowInvite(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member from your team?")) return;
    await api.team.remove(userId);
    await load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">Invite and manage telecallers under your account.</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary">
          <UserPlus size={14} /> Invite Telecaller
        </button>
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-md p-6">
            <h2 className="font-display font-bold text-ink mb-4" style={{ fontSize: "1.05rem" }}>
              Invite Telecaller
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
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ravi Kumar" />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="+919876543210" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowInvite(false); setError(null); }} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={inviting || !email.trim()} className="btn-primary flex-1">
                  {inviting ? "Sending…" : "Send Invite"}
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
                {["Member", "Role", "Score", "Phone", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left stat-label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {members.map((m) => (
                <tr key={m.user_id} className="hover:bg-surface-subtle transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-label font-semibold text-ink text-sm">{m.caller_profile?.name || "—"}</p>
                    <p className="font-body text-xs text-ink-muted">{m.user_id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`badge ${m.role === "owner" ? "badge-green" : "badge-yellow"}`}>{m.role}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-body text-sm text-ink">{m.caller_profile?.overall_score ?? "—"}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-body text-sm text-ink-muted flex items-center gap-1">
                      {m.caller_profile?.phone ? <><Phone size={12} />{m.caller_profile.phone}</> : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {m.role !== "owner" && (
                      <button onClick={() => handleRemove(m.user_id)} className="p-1.5 rounded-lg hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
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
