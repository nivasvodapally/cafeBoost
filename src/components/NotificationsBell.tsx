import { Bell, Check, ShoppingBag, CalendarCheck, UserPlus, Gift, Info } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import type { Database } from "@/integrations/supabase/types";
import { formatDistanceToNow } from "date-fns";

type Kind = Database["public"]["Enums"]["notification_kind"];

const ICONS: Record<Kind, typeof Bell> = {
  new_order: ShoppingBag,
  new_booking: CalendarCheck,
  new_customer: UserPlus,
  reward_redeemed: Gift,
  order_update: ShoppingBag,
  info: Info,
};

export function NotificationsBell() {
  const { user, profile } = useAuth();
  const ownerId = profile?.role === "owner" ? user?.id : undefined;
  const { items, unreadCount, markRead, markAll } = useNotifications(ownerId);

  if (!ownerId) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="font-semibold text-sm">Notifications</p>
          {unreadCount > 0 && (
            <button onClick={() => void markAll()} className="text-xs text-accent hover:underline inline-flex items-center gap-1">
              <Check className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10 px-4">No notifications yet.</p>
          ) : (
            items.map((n) => {
              const Icon = ICONS[n.kind] ?? Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => void markRead(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border last:border-0 transition-smooth hover:bg-muted ${
                    !n.read ? "bg-accent-soft/40" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${!n.read ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.read && <span className="shrink-0 w-2 h-2 rounded-full bg-accent mt-2" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
