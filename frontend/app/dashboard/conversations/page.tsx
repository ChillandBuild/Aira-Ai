"use client";
import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders, API_URL, Lead } from "@/lib/api";
import { ConversationList } from "@/components/conversation-list";
import { ChatThread } from "@/components/chat-thread";
import { MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { usePolling } from "@/hooks/usePolling";

function getSidebarDefault(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem("sidebar_open");
  if (stored !== null) return stored === "true";
  return window.innerWidth >= 768;
}

async function fetchConversations(): Promise<Lead[]> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/v1/conversations?limit=50`, { headers: auth });
  if (!res.ok) throw new Error(`conversations fetch failed: ${res.status}`);
  const data = await res.json();
  return data.leads ?? [];
}

export default function ConversationsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [error, setError] = useState(false);
  const [platform, setPlatform] = useState<string>("whatsapp");
  const [sidebarOpen, setSidebarOpen] = useState(getSidebarDefault);

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

  return (
    <div className="-m-8 h-screen flex">
      <div className="relative flex-shrink-0 transition-all duration-300 ease-in-out" style={{ width: sidebarOpen ? 340 : 0, overflow: "hidden" }}>
        <ConversationList
          leads={leads}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          platform={platform}
          onPlatformChange={setPlatform}
          onCollapse={() => setSidebarOpen(false)}
          onDeleted={(deletedIds) => {
            setLeads((prev) => prev.filter((l) => !deletedIds.includes(l.id)));
            if (selected && deletedIds.includes(selected.id)) {
              setSelected(null);
            }
          }}
        />
      </div>
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-30 w-6 h-12 bg-surface border border-surface-mid border-l-0 rounded-r-lg flex items-center justify-center text-on-surface-muted hover:text-tertiary hover:bg-surface-low transition-colors shadow-md"
        >
          <ChevronRight size={14} />
        </button>
      )}
      {selected ? (
        <ChatThread
          lead={selected}
          onDeleted={(id) => {
            setLeads((prev) => prev.filter((l) => l.id !== id));
            setSelected(null);
          }}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-on-surface-muted gap-3">
          <MessageSquare size={48} className="opacity-20" />
          <p className="font-body text-sm">Select a conversation to view messages</p>
          {error && <p className="font-body text-sm text-red-500">Failed to load conversations. Retrying…</p>}
        </div>
      )}
    </div>
  );
}
