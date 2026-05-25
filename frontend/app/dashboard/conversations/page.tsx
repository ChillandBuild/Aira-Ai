"use client";
import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders, API_URL, Lead } from "@/lib/api";
import { ConversationList } from "@/components/conversation-list";
import { ChatThread } from "@/components/chat-thread";
import { MessageSquare } from "lucide-react";
import { usePolling } from "@/hooks/usePolling";

async function fetchConversations(source?: string): Promise<Lead[]> {
  const auth = await getAuthHeaders();
  const qs = source ? `?limit=50&source=${source}` : "?limit=50";
  const res = await fetch(`${API_URL}/api/v1/conversations${qs}`, { headers: auth });
  if (!res.ok) throw new Error(`conversations fetch failed: ${res.status}`);
  const data = await res.json();
  return data.leads ?? [];
}

export default function ConversationsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [error, setError] = useState(false);
  const [platform, setPlatform] = useState<string>("whatsapp");

  const load = useCallback(() => {
    fetchConversations(platform === "all" ? undefined : platform)
      .then((leads) => { setLeads(leads); setError(false); })
      .catch(() => setError(true));
  }, [platform]);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 20000);

  return (
    <div className="-m-8 h-screen flex">
      <ConversationList
        leads={leads}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        platform={platform}
        onPlatformChange={setPlatform}
        onDeleted={(deletedIds) => {
          setLeads((prev) => prev.filter((l) => !deletedIds.includes(l.id)));
          if (selected && deletedIds.includes(selected.id)) {
            setSelected(null);
          }
        }}
      />
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
