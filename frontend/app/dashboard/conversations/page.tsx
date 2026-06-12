"use client";
import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders, API_URL, Lead, api } from "@/lib/api";
import { ConversationList } from "@/components/conversation-list";
import { ChatThread } from "@/components/chat-thread";
import { LeadDetailsPanel } from "@/components/lead-details-panel";
import { MessageSquare, ChevronRight, ChevronLeft } from "lucide-react";
import { usePolling } from "@/hooks/usePolling";
import { toast } from "sonner";

function getSidebarDefault(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem("sidebar_open");
  if (stored !== null) return stored === "true";
  return window.innerWidth >= 768;
}

function getDetailsPanelDefault(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem("lead_details_open");
  if (stored !== null) return stored === "true";
  return window.innerWidth >= 1280;
}

async function fetchConversations(): Promise<Lead[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/conversations?limit=50`, { headers: auth });
  if (!res.ok) throw new Error(`conversations fetch failed: ${res.status}`);
  const data = await res.json();
  return data.leads ?? [];
}

function togglePinInList(leads: Lead[], leadId: string): Lead[] {
  return leads.map((l) =>
    l.id === leadId ? { ...l, pinned_at: l.pinned_at ? null : new Date().toISOString() } : l
  );
}

export default function ConversationsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [error, setError] = useState(false);
  const [platform, setPlatform] = useState<string>("all");
  const [sidebarOpen, setSidebarOpen] = useState(getSidebarDefault);
  const [detailsOpen, setDetailsOpen] = useState(getDetailsPanelDefault);

  const load = useCallback(() => {
    fetchConversations()
      .then((leads) => { setLeads(leads); setError(false); })
      .catch(() => setError(true));
  }, []);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 20000);

  useEffect(() => {
    localStorage.setItem("sidebar_open", String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem("lead_details_open", String(detailsOpen));
  }, [detailsOpen]);

  function handleSelect(lead: Lead) {
    setSelected(lead);
  }

  function handlePin(id: string) {
    setLeads((prev) => {
      const current = prev.find((l) => l.id === id);
      if (!current) return prev;
      const toggled = togglePinInList(prev, id);
      api.leads.pin(id).catch(() => {
        setLeads((rollback) => togglePinInList(rollback, id));
        toast.error("Failed to pin/unpin contact");
      });
      return toggled;
    });
  }

  function handlePinSelected(ids: string[]) {
    setLeads((prev) => {
      let next = prev;
      for (const id of ids) {
        next = togglePinInList(next, id);
      }
      return next;
    });
    for (const id of ids) {
      api.leads.pin(id).catch(() => {
        setLeads((rollback) => togglePinInList(rollback, id));
        toast.error("Failed to pin/unpin contact");
      });
    }
  }

  return (
    <div className="-m-8 h-screen flex relative">
      {/* ── Left: Conversation list ── */}
      <div
        className="relative flex-shrink-0 transition-all duration-300 ease-in-out"
        style={{ width: sidebarOpen ? 340 : 0, overflow: "hidden" }}
      >
        <ConversationList
          leads={leads}
          selectedId={selected?.id ?? null}
          onSelect={handleSelect}
          platform={platform}
          onPlatformChange={setPlatform}
          onCollapse={() => setSidebarOpen(false)}
          onRefresh={load}
          onPin={handlePin}
          onPinSelected={handlePinSelected}
          onDeleted={(deletedIds) => {
            setLeads((prev) => prev.filter((l) => !deletedIds.includes(l.id)));
            if (selected && deletedIds.includes(selected.id)) {
              setSelected(null);
            }
          }}
        />
      </div>

      {/* Left collapse toggle */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-30 w-6 h-12 bg-surface border border-surface-mid border-l-0 rounded-r-lg flex items-center justify-center text-on-surface-muted hover:text-tertiary hover:bg-surface-low transition-colors shadow-md"
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* ── Center: Chat thread ── */}
      {selected ? (
        <ChatThread
          lead={selected}
          onDeleted={(id) => {
            setLeads((prev) => prev.filter((l) => l.id !== id));
            setSelected(null);
          }}
          onLeadUpdate={(updated) => setSelected(updated)}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-on-surface-muted gap-4 bg-zinc-50/20">
          <div className="w-16 h-16 rounded-2xl bg-white border border-zinc-200/60 shadow-sm flex items-center justify-center text-zinc-400">
            <MessageSquare size={26} className="opacity-80" />
          </div>
          <div className="text-center max-w-sm px-4">
            <p className="font-display font-semibold text-[15px] text-zinc-800">No conversation selected</p>
            <p className="font-body text-xs mt-1.5 text-zinc-500 leading-relaxed">Select a conversation from the left panel to view the chat history and start managing lead interactions.</p>
          </div>
          {error && <p className="font-body text-xs text-red-500 mt-2 bg-red-50 px-3 py-1 rounded-full border border-red-100">Failed to load conversations. Retrying…</p>}
        </div>
      )}

      {/* ── Right: Lead details panel ── */}
      {selected && (
        <>
          {detailsOpen ? (
            <LeadDetailsPanel
              lead={selected}
              onCollapse={() => setDetailsOpen(false)}
              onLeadUpdate={(updated) => setSelected(updated)}
            />
          ) : (
            <button
              onClick={() => setDetailsOpen(true)}
              title="Show contact details"
              className="absolute right-0 top-1/2 -translate-y-1/2 z-30 w-6 h-12 bg-surface border border-surface-mid border-r-0 rounded-l-lg flex items-center justify-center text-on-surface-muted hover:text-tertiary hover:bg-surface-low transition-colors shadow-md"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
