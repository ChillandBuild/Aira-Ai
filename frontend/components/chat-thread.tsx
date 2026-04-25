"use client";
import { useEffect, useRef, useState } from "react";
import { api, Lead, Message } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Bot, User, CheckCircle2, Send, PowerOff, Power, AlertTriangle, Pencil, MessageCircle } from "lucide-react";

function IgIcon({ size = 10, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChatThread({ lead }: { lead: Lead }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<Lead>(lead);
  const [converting, setConverting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setCurrent(lead);
    setDraft("");
    setSendError(null);
    setEditingName(false);
  }, [lead.id]);

  async function saveName() {
    const trimmed = nameDraft.trim();
    setEditingName(false);
    if (!trimmed || trimmed === current.name) return;
    try {
      const updated = await api.leads.update(lead.id, { name: trimmed });
      setCurrent(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rename failed");
    }
  }

  async function markConverted() {
    if (!confirm(`Mark ${lead.name || lead.phone} as converted? This feeds AI Auto-Tune.`)) return;
    setConverting(true);
    try {
      const updated = await api.leads.convert(lead.id);
      setCurrent(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setConverting(false);
    }
  }

  async function toggleAI() {
    setToggling(true);
    try {
      const updated = await api.leads.toggleAI(lead.id, !current.ai_enabled);
      setCurrent(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setToggling(false);
    }
  }

  async function sendReply() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await api.leads.sendMessage(lead.id, text);
      setDraft("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    api.leads.messages(lead.id).then((msgs) => {
      setMessages(msgs);
      setLoading(false);
    });

    const channel = supabase
      .channel(`messages:${lead.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `lead_id=eq.${lead.id}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message])
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lead.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const aiEnabled = current.ai_enabled !== false;
  const converted = Boolean(current.converted_at);
  const isInstagram = current.source === "instagram";

  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const hoursSinceInbound = lastInbound
    ? (Date.now() - new Date(lastInbound.created_at).getTime()) / 3_600_000
    : Infinity;
  const outsideWindow = hoursSinceInbound > 24;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="px-6 py-4 border-b border-surface-mid bg-surface flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-tertiary-bg flex items-center justify-center">
          <User size={16} className="text-tertiary" />
        </div>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setEditingName(false);
              }}
              placeholder="Add a name"
              className="font-body text-sm font-semibold text-on-surface bg-surface-low px-2 py-0.5 rounded border border-tertiary focus:outline-none focus:ring-1 focus:ring-tertiary w-56"
            />
          ) : (
            <button
              onClick={() => {
                setNameDraft(current.name || "");
                setEditingName(true);
              }}
              className="group flex items-center gap-1.5 text-left"
              title="Click to rename"
            >
              <span className="font-body text-sm font-semibold text-on-surface truncate">
                {current.name || current.phone || "Unknown"}
              </span>
              <Pencil size={11} className="opacity-0 group-hover:opacity-60 text-on-surface-muted" />
            </button>
          )}
          <p className="font-label text-xs text-on-surface-muted flex items-center gap-1.5">
            {isInstagram ? (
              <span className="inline-flex items-center gap-1 text-pink-500 font-semibold">
                <IgIcon size={10} /> Instagram
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                <MessageCircle size={10} /> WhatsApp
              </span>
            )}
            · {current.name && current.phone ? `${current.phone} · ` : ""}Score {current.score}/10 · Segment {current.segment}
            {!aiEnabled && <span className="ml-2 text-amber-600 font-semibold">· You are handling this thread</span>}
          </p>
        </div>

        <button
          onClick={toggleAI}
          disabled={toggling}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-label text-xs font-semibold transition-colors disabled:opacity-40",
            aiEnabled
              ? "bg-surface-low text-on-surface-muted hover:bg-surface-mid border border-surface-mid"
              : "bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200"
          )}
          title={aiEnabled ? "Pause AI and take over" : "Resume AI auto-reply"}
        >
          {aiEnabled ? <Power size={13} /> : <PowerOff size={13} />}
          {toggling ? "…" : aiEnabled ? "AI On" : "AI Paused"}
        </button>

        {converted ? (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 text-green-700 font-label text-xs font-semibold">
            <CheckCircle2 size={13} /> Converted
          </span>
        ) : (
          <button
            onClick={markConverted}
            disabled={converting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tertiary text-white font-label text-xs font-semibold hover:bg-tertiary/90 disabled:opacity-40"
          >
            <CheckCircle2 size={13} /> {converting ? "Saving…" : "Mark Converted"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-background">
        {loading ? (
          <div className="flex items-center justify-center h-full text-on-surface-muted font-body text-sm">
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-on-surface-muted font-body text-sm">
            No messages yet
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn("flex gap-2", msg.direction === "outbound" && "flex-row-reverse")}
            >
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                msg.direction === "outbound"
                  ? (msg.is_ai_generated ? "bg-secondary/10" : "bg-tertiary/10")
                  : "bg-surface-mid"
              )}>
                {msg.direction === "outbound" ? (
                  msg.is_ai_generated ? (
                    <Bot size={14} className="text-secondary" />
                  ) : (
                    <User size={14} className="text-tertiary" />
                  )
                ) : (
                  <User size={14} className="text-on-surface-muted" />
                )}
              </div>
              <div
                className={cn(
                  "max-w-[70%] px-4 py-2.5 rounded-2xl font-body text-sm",
                  msg.direction === "outbound"
                    ? "bg-tertiary text-white rounded-tr-sm"
                    : "bg-surface text-on-surface shadow-card rounded-tl-sm"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.direction === "outbound" && (
                  <p className="mt-1 text-[10px] opacity-60">
                    {msg.is_ai_generated ? "AI generated" : "Sent by you"}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-surface-mid bg-surface px-6 py-3">
        {outsideWindow && !aiEnabled && !isInstagram && (
          <div className="mb-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <p className="font-label text-[11px] leading-snug">
              Outside 24-hour session window
              {lastInbound ? ` (last inbound ${Math.round(hoursSinceInbound)}h ago)` : " (no inbound yet)"}
              . Free-form messages may be blocked by WhatsApp — only approved templates go through reliably.
            </p>
          </div>
        )}
        {!aiEnabled && !outsideWindow && (
          <p className="font-label text-[11px] text-amber-700 mb-2">
            AI is paused — your replies go directly to the lead.
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendReply();
              }
            }}
            placeholder={aiEnabled ? "Take over: pause AI first, then type…" : `Type a message via ${isInstagram ? "Instagram DM" : "WhatsApp"} (Enter to send, Shift+Enter for newline)`}
            rows={2}
            disabled={aiEnabled || sending}
            className="flex-1 px-3 py-2 rounded-lg bg-surface-low border border-surface-mid font-body text-sm resize-none focus:outline-none focus:ring-2 focus:ring-tertiary disabled:opacity-50"
          />
          <button
            onClick={sendReply}
            disabled={aiEnabled || sending || !draft.trim()}
            className="px-4 py-2 h-[56px] rounded-lg bg-tertiary text-white font-label text-sm font-semibold hover:bg-tertiary/90 disabled:opacity-40 flex items-center gap-1.5"
          >
            <Send size={14} /> {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {sendError && <p className="mt-2 font-label text-xs text-red-600">{sendError}</p>}
      </div>
    </div>
  );
}
