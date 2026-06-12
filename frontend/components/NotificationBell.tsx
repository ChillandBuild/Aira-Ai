"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Bell, X, Clock, Info, CheckCircle2 } from "lucide-react";
import { useAuthRole } from "@/app/dashboard/contexts/AuthRoleContext";
import { usePolling } from "@/hooks/usePolling";
import { useNotifications } from "@/hooks/useNotifications";
import { fetchTodayCallbacks } from "@/app/dashboard/telecalling/lib/notes-api";
import type { CallbackJob } from "@/app/dashboard/telecalling/types";
import { useRouter } from "next/navigation";

export function NotificationBell() {
  const { role, callerId } = useAuthRole();
  const router = useRouter();
  const { notifications, markRead } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"alerts" | "callbacks">("alerts");

  const [callbacks, setCallbacks] = useState<CallbackJob[]>([]);
  const notifiedSet = useRef<Set<string>>(new Set());

  const loadCallbacks = useCallback(async () => {
    if (role !== "caller" || !callerId) return;

    try {
      const todayJobs = await fetchTodayCallbacks();
      const now = new Date();
      const due = todayJobs.filter((job) => {
        if (job.lead?.assigned_to !== callerId) return false;
        return new Date(job.scheduled_for) <= now;
      });

      due.forEach((cb) => {
        if (!notifiedSet.current.has(cb.id)) {
          notifiedSet.current.add(cb.id);
          toast("Callback Due!", {
            description: `Time to call ${cb.lead?.name || "Lead"}`,
            icon: <Clock className="text-amber-500" size={16} />,
          });
        }
      });
      setCallbacks(due);
    } catch (err) {
      console.error("Failed to load due callbacks", err);
    }
  }, [role, callerId]);

  useEffect(() => {
    loadCallbacks();
  }, [loadCallbacks]);

  usePolling(loadCallbacks, 30_000, !!role);

  const handleMarkRead = (id: string) => {
    markRead(id);
  };

  const handleCallbackClick = () => {
    setIsOpen(false);
    router.push("/dashboard/telecalling");
  };

  const totalUnread = notifications.length + callbacks.length;

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 bg-slate-800/60 border border-slate-600/40 rounded-xl hover:bg-slate-700/60 hover:border-indigo-400 transition-all group"
        title="Notification Center"
      >
        <Bell size={18} className="text-slate-300 group-hover:text-indigo-300 transition-colors" />
        {totalUnread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 bg-gradient-to-r from-rose-500 to-pink-600 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-4 ring-background shadow-sm animate-bounce-short">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-3 w-80 md:w-96 bg-white border border-slate-200/80 rounded-3xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in slide-in-from-top-4 duration-200">

            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-br from-indigo-50 to-purple-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display text-sm font-black text-slate-800 uppercase tracking-wider">
                Notification Center
              </h3>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-white/60 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100">
              <button
                onClick={() => setActiveTab("alerts")}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors relative ${
                  activeTab === "alerts" ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Alerts {notifications.length > 0 && `(${notifications.length})`}
                {activeTab === "alerts" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("callbacks")}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors relative ${
                  activeTab === "callbacks" ? "text-amber-600" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Due Callbacks {callbacks.length > 0 && `(${callbacks.length})`}
                {activeTab === "callbacks" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />
                )}
              </button>
            </div>

            {/* Content List */}
            <div className="overflow-y-auto flex-1 p-2">
              {activeTab === "alerts" && (
                <div className="space-y-1">
                  {notifications.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-400 font-body">No new alerts</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="p-4 rounded-2xl hover:bg-slate-50 transition-colors flex gap-3 group">
                        <div className="mt-0.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                            <Info size={14} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-sm font-bold text-slate-800">{n.title}</p>
                          <p className="font-body text-xs text-slate-600 mt-0.5 leading-relaxed">{n.message}</p>
                          <p className="font-label text-[10px] text-slate-400 mt-2">
                            {new Date(n.created_at).toLocaleString()}
                          </p>
                        </div>
                        <button
                          onClick={() => handleMarkRead(n.id)}
                          className="shrink-0 self-center p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                          title="Mark as read"
                        >
                          <CheckCircle2 size={18} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "callbacks" && (
                <div className="space-y-1">
                  {callbacks.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-400 font-body">No due callbacks</div>
                  ) : (
                    callbacks.map((cb) => (
                      <div key={cb.id} className="p-4 rounded-2xl hover:bg-amber-50 transition-colors flex gap-3">
                        <div className="mt-0.5">
                          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                            <Clock size={14} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-sm font-bold text-slate-800 truncate">{cb.lead?.name || "Unnamed Lead"}</p>
                          <p className="font-body text-xs text-slate-600 mt-0.5 truncate">{cb.lead?.phone}</p>
                          {cb.message_preview && (
                            <p className="font-body text-xs text-amber-700/70 mt-1 italic line-clamp-2">
                              &quot;{cb.message_preview}&quot;
                            </p>
                          )}
                        </div>
                        <button
                          onClick={handleCallbackClick}
                          className="shrink-0 self-center px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-label text-[10px] font-bold rounded-lg transition-colors shadow-sm"
                        >
                          View
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  );
}
