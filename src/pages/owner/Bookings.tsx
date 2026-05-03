import { useEffect, useRef, useState } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarCheck, Phone, X } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Status = Database["public"]["Enums"]["booking_status"];

const TABS: { key: "upcoming" | "past" | "all"; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];

function statusPill(s: Status) {
  if (s === "confirmed" || s === "checked_in") return "bg-success/15 text-success";
  if (s === "cancelled" || s === "no_show") return "bg-destructive/15 text-destructive";
  if (s === "completed") return "bg-muted text-muted-foreground";
  return "bg-accent-soft text-accent-foreground";
}

export default function OwnerBookings() {
  const { cafe, loading: cafeLoading } = useOwnerCafe();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past" | "all">("upcoming");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!cafe) return;
    let cancelled = false;
    setLoading(true);
    void supabase.from("bookings").select("*").eq("cafe_id", cafe.id)
      .order("booking_date", { ascending: false }).order("booking_time", { ascending: false }).limit(200)
      .then(({ data }) => { if (!cancelled) { setBookings((data as Booking[]) ?? []); setLoading(false); } });

    if (channelRef.current) { void supabase.removeChannel(channelRef.current); channelRef.current = null; }
    const ch = supabase
      .channel(`bookings:${cafe.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bookings", filter: `cafe_id=eq.${cafe.id}` },
        (p) => {
          const fresh = p.new as Booking;
          setBookings(prev => prev.find(b => b.id === fresh.id) ? prev : [fresh, ...prev]);
          toast.success(`New booking from ${fresh.customer_name}`, { description: `${fresh.booking_date} · ${fresh.booking_time} · ${fresh.persons} ppl` });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `cafe_id=eq.${cafe.id}` },
        (p) => setBookings(prev => prev.map(b => b.id === (p.new as Booking).id ? (p.new as Booking) : b)))
      .subscribe();
    channelRef.current = ch;
    return () => {
      cancelled = true;
      if (channelRef.current) { void supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [cafe]);

  const update = async (id: string, status: Status, extra: Partial<Booking> = {}) => {
    const { error } = await supabase.from("bookings").update({ status, ...extra }).eq("id", id);
    if (error) toast.error(error.message);
    else setBookings(prev => prev.map(b => b.id === id ? { ...b, status, ...extra } : b));
  };

  if (cafeLoading || loading) return <OwnerLayout title="Bookings"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></OwnerLayout>;

  const today = new Date().toISOString().slice(0, 10);
  const visible = bookings.filter(b => {
    if (tab === "all") return true;
    const isFuture = b.booking_date >= today;
    return tab === "upcoming" ? isFuture : !isFuture;
  });

  return (
    <OwnerLayout title="Bookings" subtitle={`${bookings.length} total`}>
      <div className="flex gap-2 mb-5 border-b border-border">
        {TABS.map(t => {
          const isActive = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-smooth ${isActive ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          );
        })}
      </div>
      {visible.length === 0 ? (
        <Card className="p-10 text-center">
          <CalendarCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-display text-xl font-bold">No {tab} bookings</p>
        </Card>
      ) : (
        <div className="space-y-3">{visible.map(b => (
          <Card key={b.id} className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{b.customer_name}</p>
                <p className="text-xs text-muted-foreground">{b.booking_date} · {b.booking_time} · {b.persons} {b.persons === 1 ? "person" : "people"}</p>
                {b.customer_phone && <p className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" /> {b.customer_phone}</p>}
                {b.notes && <p className="text-xs text-muted-foreground mt-1">📝 {b.notes}</p>}
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusPill(b.status)}`}>{b.status.replace("_", " ")}</span>
            </div>
            <div className="mt-3 flex gap-2 justify-end flex-wrap">
              {b.status === "pending" && <Button variant="hero" size="sm" onClick={() => update(b.id, "confirmed")}>Confirm</Button>}
              {(b.status === "pending" || b.status === "confirmed") && (
                <Button variant="outline" size="sm" onClick={() => update(b.id, "checked_in", { checked_in_at: new Date().toISOString() })}>Check in</Button>
              )}
              {b.status === "checked_in" && <Button variant="outline" size="sm" onClick={() => update(b.id, "completed")}>Complete</Button>}
              {(b.status === "pending" || b.status === "confirmed") && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => update(b.id, "no_show")}>No-show</Button>
                  <Button variant="ghost" size="sm" onClick={() => update(b.id, "cancelled")}><X className="w-3 h-3 mr-1" /> Cancel</Button>
                </>
              )}
            </div>
          </Card>
        ))}</div>
      )}
    </OwnerLayout>
  );
}
