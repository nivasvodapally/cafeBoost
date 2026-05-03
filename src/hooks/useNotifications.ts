import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/services/notificationService";
import { toast } from "sonner";

/**
 * useNotifications — owner-side realtime notification hook.
 *
 * Section 1.2 / 1.4 / 6.1 — wires up:
 *  - initial load of recent notifications for the signed-in owner
 *  - a single Supabase realtime subscription filtered to this owner
 *  - toast on new notifications
 *  - read/unread state with markRead / markAllRead helpers
 *
 * Subscription cleanup is critical to prevent duplicate listeners across
 * route changes (Section 3.4).
 */
export function useNotifications(ownerUserId: string | undefined) {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refresh = useCallback(async () => {
    if (!ownerUserId) return;
    const list = await fetchNotifications(ownerUserId);
    setItems(list);
  }, [ownerUserId]);

  useEffect(() => {
    if (!ownerUserId) { setItems([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void fetchNotifications(ownerUserId).then((list) => {
      if (!cancelled) { setItems(list); setLoading(false); }
    });

    // Tear down any previous subscription before opening a new one.
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`notif:${ownerUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `owner_user_id=eq.${ownerUserId}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => [n, ...prev].slice(0, 50));
          toast(n.title, { description: n.body ?? undefined });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `owner_user_id=eq.${ownerUserId}` },
        (payload) => {
          const n = payload.new as Notification;
          setItems((prev) => prev.map((x) => (x.id === n.id ? n : x)));
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [ownerUserId]);

  const markRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAll = useCallback(async () => {
    if (!ownerUserId) return;
    await markAllNotificationsRead(ownerUserId);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [ownerUserId]);

  const unreadCount = items.filter((n) => !n.read).length;

  return { items, unreadCount, loading, markRead, markAll, refresh };
}
