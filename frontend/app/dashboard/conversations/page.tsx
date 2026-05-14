"use client";
import { useEffect, useState } from "react";
import { getAuthHeaders, API_URL, Lead } from "@/lib/api";
import { ConversationList } from "@/components/conversation-list";
import { ChatThread } from "@/components/chat-thread";
import { MessageSquare } from "lucide-react";

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

  useEffect(() => {
    fetchConversations().then(leads => { setLeads(leads); setError(false); }).catch(() => setError(true));
    const interval = setInterval(() => {
      fetchConversations().then(leads => { setLeads(leads); setError(false); }).catch(() => setError(true));
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="-m-8 h-screen flex">
      <ConversationList leads={leads} selectedId={selected?.id ?? null} onSelect={setSelected} />
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
