"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Users, Search, Loader2 } from "lucide-react";
import { api, type Caller, type Lead } from "@/lib/api";
import { formatPhone } from "@/lib/utils";

interface BulkAssignmentProps {
  callers: Caller[];
}

export default function BulkAssignment({ callers }: BulkAssignmentProps) {
  const [leadList, setLeadList] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkAssigneeId, setBulkAssigneeId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.leads.list({ limit: 50 });
      setLeadList(res);
    } catch (err) {
      console.error("Failed to load leads for assignment:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredLeads = leadList.filter((l) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (l.name && l.name.toLowerCase().includes(q)) ||
      (l.phone && l.phone.includes(q)) ||
      (l.segment && l.segment.toLowerCase().includes(q))
    );
  });

  const toggleSelectLead = (leadId: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredLeads.map((l) => l.id);
    const allSelected = visibleIds.every((id) => selectedLeadIds.includes(id));
    if (allSelected) {
      setSelectedLeadIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedLeadIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkAssign = async () => {
    if (selectedLeadIds.length === 0 || !bulkAssigneeId) return;
    setAssigning(true);
    try {
      const res = await api.leads.bulkAssign(selectedLeadIds, bulkAssigneeId);
      toast.success(`Successfully assigned ${res.updated || selectedLeadIds.length} leads`);
      setSelectedLeadIds([]);
      setBulkAssigneeId("");
      load();
    } catch (err) {
      console.error("Failed bulk assign:", err);
      toast.error("Failed to bulk assign leads");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="bg-surface rounded-card p-6 shadow-card ring-1 ring-[#c4c7c7]/15 flex flex-col">
      <h2 className="font-display text-base font-bold text-tertiary mb-1 flex items-center gap-2">
        <Users size={16} className="text-sky-600" /> Lead Bulk Assignment
      </h2>
      <p className="font-label text-xs text-on-surface-muted mb-4">Select multiple leads to dispatch or hand off to another agent queue.</p>

      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl mb-4 text-xs">
        <Search size={14} className="text-slate-400 shrink-0 ml-1" />
        <input
          type="text"
          placeholder="Search leads name, phone, segment..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent w-full focus:outline-none placeholder-slate-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto max-h-[350px] border border-slate-100 rounded-2xl pr-1 mb-4">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-slate-400" size={20} />
          </div>
        ) : filteredLeads.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-12">No leads matching search query.</p>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 sticky top-0 font-label text-[10px] text-slate-400 uppercase font-bold">
                <th className="py-2.5 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={filteredLeads.length > 0 && filteredLeads.every((l) => selectedLeadIds.includes(l.id))}
                    onChange={toggleSelectAll}
                    className="rounded text-primary focus:ring-primary"
                  />
                </th>
                <th className="py-2.5 px-2">Lead</th>
                <th className="py-2.5 px-2">Phone</th>
                <th className="py-2.5 px-2">Seg</th>
                <th className="py-2.5 px-2">Status</th>
                <th className="py-2.5 px-2">Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const isSelected = selectedLeadIds.includes(lead.id);
                const assignedCaller = callers.find((c) => c.id === lead.assigned_to);
                return (
                  <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50/20 transition-colors">
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectLead(lead.id)}
                        className="rounded text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="py-2 px-2 font-bold text-slate-800">{lead.name || "Unnamed"}</td>
                    <td className="py-2 px-2 text-slate-500 font-medium">{formatPhone(lead.phone)}</td>
                    <td className="py-2 px-2">
                      <span className="bg-slate-100 px-1 py-0.5 rounded font-black text-[9px] uppercase">{lead.segment || "—"}</span>
                    </td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded font-label text-[9px] font-black uppercase ${
                        lead.call_status === "converted" ? "bg-emerald-100 text-emerald-800" :
                        lead.call_status === "dnc" ? "bg-red-100 text-red-800" :
                        lead.call_status === "unreachable" ? "bg-rose-100 text-rose-800" :
                        "bg-slate-100 text-slate-650"
                      }`}>
                        {lead.call_status || "new"}
                        {lead.do_not_call ? " (DNC)" : ""}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-slate-500 font-semibold truncate">
                      {assignedCaller ? assignedCaller.name : <span className="text-amber-500">Unassigned</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-auto">
        <div className="flex-1">
          <span className="font-label text-[10px] text-slate-400 uppercase font-extrabold block">Reassign To:</span>
          <select
            value={bulkAssigneeId}
            onChange={(e) => setBulkAssigneeId(e.target.value)}
            className="w-full bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary mt-1"
          >
            <option value="">Select Caller...</option>
            {callers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="shrink-0 pt-4">
          <button
            onClick={handleBulkAssign}
            disabled={assigning || selectedLeadIds.length === 0 || !bulkAssigneeId}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/95 disabled:opacity-50 font-label text-xs font-bold transition-all shadow-sm"
          >
            {assigning ? <Loader2 className="animate-spin" size={12} /> : null}
            Assign ({selectedLeadIds.length})
          </button>
        </div>
      </div>
    </div>
  );
}
