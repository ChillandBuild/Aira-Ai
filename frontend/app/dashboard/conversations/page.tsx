"use client";
import { useEffect, useState } from "react";
import { api, Lead } from "@/lib/api";
import { ConversationList } from "@/components/conversation-list";
import { ChatThread } from "@/components/chat-thread";
import { MessageSquare } from "lucide-react";

export default function ConversationsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);

  useEffect(() => {
    api.leads.list({ limit: 100 }).then(setLeads);
    const interval = setInterval(() => {
      api.leads.list({ limit: 100 }).then(setLeads);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="-m-8 h-screen flex">
      <ConversationList leads={leads} selectedId={selected?.id ?? null} onSelect={setSelected} />
      {selected ? (
        <ChatThread lead={selected} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-on-surface-muted gap-3">
          <MessageSquare size={48} className="opacity-20" />
          <p className="font-body text-sm">Select a conversation to view messages</p>
        </div>
      )}
    </div>
  );
}
