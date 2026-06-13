"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Trash2, UserPlus, Phone, Pencil, Check, X, Loader2, Users,
  TrendingUp, ClipboardList, LayoutGrid, List, Search, UserCircle,
} from "lucide-react";
import { api, TeamMember, Caller } from "@/lib/api";
import { useAuthRole } from "../contexts/AuthRoleContext";
import { useTeamList, useCallers } from "@/hooks/useApi";
import { initials } from "./helpers";

import AssignmentLog from "../telecalling/components/assignment-log";
import PerformanceView from "../telecalling/components/performance-view";

// Heavy (recharts + date-fns); only rendered when a member is selected, so
// load it lazily to keep it out of the Team page's initial bundle.
const TeamProfilePanel = dynamic(() => import("./TeamProfilePanel"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <Loader2 className="animate-spin text-primary" size={24} />
    </div>
  ),
});

/* ──────────────────────────── InlineEditCell ──────────────────────────── */
function InlineEditCell({
  callerId,
  initial,
  field,
  placeholder,
  onUpdate
}: {
  callerId: string;
  initial: string | null;
  field: "name" | "phone" | "telecmi_agent_id";
  placeholder?: string;
  onUpdate?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.callers.update(callerId, { [field]: value.trim() || null });
      setEditing(false);
      onUpdate?.();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
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
    <div className="flex items-center gap-1.5 group" onClick={e => e.stopPropagation()}>
      <span className={`font-body text-sm ${value ? "text-ink" : "text-ink-muted"}`}>
        {value || "—"}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-subtle text-ink-muted transition-opacity"
      >
        <Pencil size={11} />
      </button>
    </div>
  );
}

/* ──────────────────────────── Main Client Component ──────────────────────────── */
interface TeamClientProps {
  fallbackTeam: { data: TeamMember[] } | null;
  fallbackCallers: Caller[] | null;
}

export function TeamClient({ fallbackTeam, fallbackCallers }: TeamClientProps) {
  const { role, loading: roleLoading } = useAuthRole();
  const [tab, setTab] = useState<"members" | "log" | "performance">("members");

  // controls
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "break" | "offline">("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // invite
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telecmiAgentId, setTelecmiAgentId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = role === "owner" || fallbackTeam !== null;

  const { data: teamData, mutate: mutateTeam, error: teamError } = useTeamList(
    isOwner,
    fallbackTeam ?? undefined
  );
  const { data: callersData, mutate: mutateCallers, error: callersError } = useCallers(
    isOwner,
    fallbackCallers ?? undefined
  );

  const members = teamData?.data ?? [];
  const callers = callersData ?? [];
  const loading = (!teamData && !teamError) || (!callersData && !callersError);

  async function load() {
    await Promise.all([mutateTeam(), mutateCallers()]);
  }

  if (roleLoading && !fallbackTeam) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="text-center py-20">
        <p className="text-ink-muted font-body">This section is only available for owners/admins.</p>
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
    if (selectedMemberId === userId) setSelectedMemberId(null);
    await load();
  }

  // merge members with caller status
  const mergedMembers = members.map(m => {
    const caller = m.caller_profile ? callers.find(c => c.id === m.caller_profile!.id) : null;
    let computedStatus = "offline";
    if (caller?.status === "active") computedStatus = "active";
    else if (caller?.status === "break") computedStatus = "break";

    return {
      ...m,
      computedStatus,
      displayName: m.caller_profile?.name || m.user_id.slice(0, 8),
    };
  });

  const filteredMembers = mergedMembers
    .filter(m => {
      if (statusFilter !== "all" && m.computedStatus !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!m.displayName.toLowerCase().includes(q) &&
            !m.caller_profile?.phone?.includes(q) &&
            !m.caller_profile?.telecmi_agent_id?.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));

  const selectedMember = mergedMembers.find(m => m.user_id === selectedMemberId);

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

      {/* View tabs */}
      <div className="mb-6 flex border-b border-border-subtle">
        <button onClick={() => setTab("members")}
          className={`flex items-center gap-1.5 px-6 py-3 font-label font-semibold text-sm transition-all border-b-2 ${tab === "members" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"}`}>
          <Users size={14} /> Team Members
        </button>
        <button onClick={() => setTab("log")}
          className={`flex items-center gap-1.5 px-6 py-3 font-label font-semibold text-sm transition-all border-b-2 ${tab === "log" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"}`}>
          <ClipboardList size={14} /> Assignment Log
        </button>
        <button onClick={() => setTab("performance")}
          className={`flex items-center gap-1.5 px-6 py-3 font-label font-semibold text-sm transition-all border-b-2 ${tab === "performance" ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-muted hover:text-on-surface"}`}>
          <TrendingUp size={14} /> Performance
        </button>
      </div>

      {tab === "log" ? (
        <AssignmentLog callers={callers} />
      ) : tab === "performance" ? (
        <PerformanceView callers={callers} />
      ) : (
      <>
      {showInvite && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-md p-6">
            <h2 className="font-display font-bold text-ink mb-4" style={{ fontSize: "1.05rem" }}>Add Telecaller</h2>
            {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 font-body text-sm">{error}</div>}
            <form onSubmit={handleInvite} className="space-y-3">
              <div><label className="font-body text-sm font-medium text-ink mb-1.5 block">Email *</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" placeholder="telecaller@example.com" /></div>
              <div><label className="font-body text-sm font-medium text-ink mb-1.5 block">Password *</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="input" placeholder="Set a password for them" /></div>
              <div><label className="font-body text-sm font-medium text-ink mb-1.5 block">Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ravi Kumar" /></div>
              <div><label className="font-body text-sm font-medium text-ink mb-1.5 block">Phone</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="+919876543210" /></div>
              <div><label className="font-body text-sm font-medium text-ink mb-1.5 block">TeleCMI Agent ID</label><input type="text" value={telecmiAgentId} onChange={(e) => setTelecmiAgentId(e.target.value)} className="input" placeholder="e.g. 102_33335739" /></div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowInvite(false); setError(null); }} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={inviting || !email.trim()} className="btn-primary flex-1">{inviting ? "Adding…" : "Add"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Layout Split */}
      <div className="flex flex-col lg:flex-row gap-6 relative">
        {/* Left Side: List/Grid */}
        <div className="w-full lg:w-[55%] flex-shrink-0 flex flex-col space-y-4">

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-border-subtle shadow-sm">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" size={16} />
              <input
                type="text"
                placeholder="Search team..."
                className="input !pl-10 h-10 w-full"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                className="input h-10 w-32"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as "all" | "active" | "break" | "offline")}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="break">On Break</option>
                <option value="offline">Offline</option>
              </select>
              <div className="flex bg-surface-subtle p-1 rounded-xl">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-white shadow-sm text-primary" : "text-ink-muted hover:text-ink"}`}
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-lg transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-primary" : "text-ink-muted hover:text-ink"}`}
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Render Members */}
          {loading ? (
            <div className="card p-8 text-center font-body text-sm text-ink-muted">Loading…</div>
          ) : filteredMembers.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="font-display font-bold text-ink mb-2">No team members found</p>
              <p className="font-body text-sm text-ink-muted">Adjust your filters or invite new members.</p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredMembers.map(m => (
                <div
                  key={m.user_id}
                  onClick={() => setSelectedMemberId(m.user_id)}
                  className={`card p-3 cursor-pointer transition-all border-2 ${selectedMemberId === m.user_id ? "border-primary bg-primary/5" : "border-transparent hover:border-primary/30"}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-display text-xs font-bold">
                          {initials(m.displayName)}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${m.computedStatus === 'active' ? 'bg-emerald-500' : m.computedStatus === 'break' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                      </div>
                      <div>
                        {m.caller_profile?.id ? (
                          <div className="font-label font-semibold text-ink text-xs" onClick={e => e.stopPropagation()}>
                            <InlineEditCell callerId={m.caller_profile.id} initial={m.caller_profile.name ?? null} field="name" placeholder="Name" onUpdate={load} />
                          </div>
                        ) : (
                          <p className="font-label font-semibold text-ink text-xs">{m.displayName}</p>
                        )}
                        <span className={`mt-0.5 inline-block badge text-[9px] py-0 ${m.role === "owner" ? "badge-green" : "badge-yellow"}`}>
                          {m.role === "owner" ? "admin" : "caller"}
                        </span>
                      </div>
                    </div>
                    {m.role !== "owner" && (
                      <button onClick={(e) => { e.stopPropagation(); handleRemove(m.user_id); }} className="p-1 rounded-lg hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors" title="Remove Telecaller">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 mt-2">
                    <div className="flex items-center justify-between text-[11px] font-body">
                      <span className="text-ink-muted">Score</span>
                      <span className="font-semibold text-ink">{m.caller_profile?.overall_score ?? "—"}/10</span>
                    </div>
                    <div className="w-full bg-surface-subtle h-1 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(m.caller_profile?.overall_score || 0) * 10}%` }}
                      />
                    </div>
                    <div className="pt-1 flex items-center gap-1.5 text-[11px] font-body">
                      <Phone size={11} className="text-ink-muted" />
                      {m.caller_profile?.id ? (
                        <div onClick={e => e.stopPropagation()}>
                          <InlineEditCell callerId={m.caller_profile.id} initial={m.caller_profile.phone ?? null} field="phone" placeholder="+91xxxxxxxxxx" onUpdate={load} />
                        </div>
                      ) : <span className="text-ink-muted">—</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card rounded-3xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-subtle/50">
                    <th className="px-5 py-3 text-left stat-label">Telecaller</th>
                    <th className="px-5 py-3 text-left stat-label">Contact</th>
                    <th className="px-5 py-3 text-left stat-label">Status</th>
                    <th className="px-5 py-3 text-left stat-label">Role</th>
                    <th className="px-5 py-3 text-left stat-label">Score</th>
                    <th className="px-5 py-3 text-right stat-label">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredMembers.map((m) => (
                    <tr
                      key={m.user_id}
                      onClick={() => setSelectedMemberId(m.user_id)}
                      className={`cursor-pointer transition-colors ${selectedMemberId === m.user_id ? "bg-primary/5" : "hover:bg-surface-subtle"}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-display text-sm font-bold flex-shrink-0">
                            {initials(m.displayName)}
                          </div>
                          <div>
                            {m.caller_profile?.id ? (
                              <div className="font-label font-semibold text-ink text-sm" onClick={e => e.stopPropagation()}>
                                <InlineEditCell callerId={m.caller_profile.id} initial={m.caller_profile.name ?? null} field="name" placeholder="Name" onUpdate={load} />
                              </div>
                            ) : (
                              <p className="font-label font-semibold text-ink text-sm">{m.displayName}</p>
                            )}
                            <p className="font-body text-[10px] text-ink-muted mt-0.5">{m.user_id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1 text-xs font-body">
                          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <Phone size={11} className="text-ink-muted" />
                            {m.caller_profile?.id ? (
                              <InlineEditCell callerId={m.caller_profile.id} initial={m.caller_profile.phone ?? null} field="phone" placeholder="+91xxxxxxxxxx" onUpdate={load} />
                            ) : <span className="text-ink-muted">—</span>}
                          </div>
                          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <span className="text-[10px] font-label text-ink-muted bg-surface-subtle px-1 rounded">ID</span>
                            {m.caller_profile?.id ? (
                              <InlineEditCell callerId={m.caller_profile.id} initial={m.caller_profile.telecmi_agent_id ?? null} field="telecmi_agent_id" placeholder="e.g. 102_33335739" onUpdate={load} />
                            ) : <span className="text-ink-muted">—</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${m.computedStatus === 'active' ? 'bg-emerald-500' : m.computedStatus === 'break' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                          <span className="text-xs font-body text-ink capitalize">{m.computedStatus}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`badge ${m.role === "owner" ? "badge-green" : "badge-yellow"}`}>
                          {m.role === "owner" ? "admin" : "caller"}
                        </span>
                      </td>
                      <td className="px-5 py-4 w-32">
                        <div className="flex items-center justify-between text-xs font-body mb-1">
                          <span className="font-semibold text-ink">{m.caller_profile?.overall_score ?? "—"}/10</span>
                        </div>
                        <div className="w-full bg-surface-subtle h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${(m.caller_profile?.overall_score || 0) * 10}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4 flex items-center justify-end gap-2">
                        {m.role !== "owner" && (
                          <button onClick={(e) => { e.stopPropagation(); handleRemove(m.user_id); }} className="p-1.5 rounded-lg hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Side: Profile Panel */}
        <div className="w-full lg:w-[45%] flex-shrink-0 lg:sticky lg:top-6 lg:h-[calc(100vh-100px)]">
          {selectedMember ? (
            selectedMember.caller_profile?.id ? (
              <TeamProfilePanel
                key={selectedMember.caller_profile.id}
                callerId={selectedMember.caller_profile.id}
                callerName={selectedMember.displayName}
              />
            ) : (
              <div className="card p-12 text-center h-full flex flex-col justify-center items-center">
                <UserCircle size={48} className="text-ink-muted/30 mb-4" />
                <p className="font-display font-bold text-ink mb-2">No Caller Profile</p>
                <p className="font-body text-sm text-ink-muted">This user does not have a telecaller profile attached.</p>
              </div>
            )
          ) : (
            <div className="card p-12 text-center h-full flex flex-col justify-center items-center border-dashed border-2 bg-surface-subtle/30">
              <Users size={48} className="text-primary/20 mb-4" />
              <p className="font-display font-bold text-ink mb-2">Select a Team Member</p>
              <p className="font-body text-sm text-ink-muted">Click on a member from the list to view their detailed performance and activity.</p>
            </div>
          )}
        </div>

      </div>
      </>
      )}
    </div>
  );
}
