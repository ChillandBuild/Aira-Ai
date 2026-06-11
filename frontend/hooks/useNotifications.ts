"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, AppNotification, PoolItem } from "@/lib/api";
import { useAuthRole } from "@/app/dashboard/contexts/AuthRoleContext";
import { usePolling } from "@/hooks/usePolling";

export function useNotifications() {
  const { role } = useAuthRole();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pool, setPool] = useState<PoolItem[]>([]);
  const notifiedSet = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (role !== "caller" && role !== "owner") return;
    try {
      const notifsRes = await api.notifications.list();
      const unread = notifsRes.data || [];
      unread.forEach((n) => {
        if (!notifiedSet.current.has(n.id)) {
          notifiedSet.current.add(n.id);
          toast(n.title, { description: n.message });
        }
      });
      setNotifications(unread);
    } catch (err) {
      console.error("notifications load failed", err);
    }
    if (role === "caller") {
      try {
        const poolRes = await api.notifications.pool();
        setPool(poolRes.data || []);
      } catch (err) {
        console.error("pool load failed", err);
        setPool([]);
      }
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 30_000, !!role);

  const markRead = useCallback(async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("markRead failed", err);
    }
  }, []);

  return { notifications, pool, markRead, reload: load };
}
