import { useEffect, useRef, useState } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingBag, X } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

type OrderItem = { id: string; name: string; price: number; quantity: number };
type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & { order_items: OrderItem[] };
type Status = Database["public"]["Enums"]["order_status"];

const FLOW: { from: Status[]; to: Status; label: string; variant: "outline" | "hero" }[] = [
  { from: ["placed"],            to: "accepted",  label: "Accept",         variant: "hero" },
  { from: ["accepted"],          to: "preparing", label: "Start preparing", variant: "outline" },
  { from: ["preparing"],         to: "ready",     label: "Mark ready",     variant: "outline" },
  { from: ["ready"],             to: "completed", label: "Complete",       variant: "outline" },
];

const TABS: { key: "active" | "completed" | "cancelled"; label: string; statuses: Status[] }[] = [
  { key: "active",    label: "Active",    statuses: ["placed","accepted","preparing","ready","served"] },
  { key: "completed", label: "Completed", statuses: ["completed","delivered"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

function pillClass(status: Status) {
  if (["completed","delivered"].includes(status)) return "bg-success/15 text-success";
  if (status === "cancelled") return "bg-destructive/15 text-destructive";
  if (["ready","served"].includes(status)) return "bg-accent text-accent-foreground";
  return "bg-accent-soft text-accent-foreground";
}

const SELECT = "*, order_items(id, name, price, quantity)";

/** Programmatic short beep — replaces the broken empty WAV data URI.
 *  Browsers block AudioContext until a user gesture, so we lazily create
 *  the context on first user interaction and reuse it.
 */
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    const warmed = (window as unknown as { __cafeboost_audio_ctx?: AudioContext }).__cafeboost_audio_ctx;
    if (warmed) { if (warmed.state === "suspended") void warmed.resume(); return warmed; }
    type W = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctx = window.AudioContext || (window as W).webkitAudioContext;
    if (!Ctx) return null;
    if (!_audioCtx) _audioCtx = new Ctx();
    if (_audioCtx.state === "suspended") void _audioCtx.resume();
    return _audioCtx;
  } catch { return null; }
}
function playBeep() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.value = 0.18;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    // Two-tone: short high then low for a recognisable chime.
    setTimeout(() => { try { osc.frequency.value = 660; } catch { /* */ } }, 120);
    setTimeout(() => { try { osc.stop(); } catch { /* */ } }, 280);
  } catch {
    /* ignore — beep is best-effort */
  }
}

export default function OwnerOrders() {
  const { cafe, loading: cafeLoading } = useOwnerCafe();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "completed" | "cancelled">("active");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const seenOrderIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!cafe) return;
    let cancelled = false;
    setLoading(true);
    const fetchAll = async () => {
      // Single relational query — items come back in the same round-trip.
      const { data } = await supabase.from("orders").select(SELECT)
        .eq("cafe_id", cafe.id)
        .order("created_at", { ascending: false }).limit(150);
      if (cancelled) return;
      const list = ((data as unknown as OrderRow[]) ?? []).map(o => ({ ...o, order_items: o.order_items ?? [] }));
      list.forEach(o => seenOrderIds.current.add(o.id));
      setOrders(list);
      setLoading(false);
    };
    void fetchAll();
    const poll = setInterval(() => void fetchAll(), 15_000);

    if (channelRef.current) { void supabase.removeChannel(channelRef.current); channelRef.current = null; }
    const ch = supabase
      .channel(`orders:${cafe.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `cafe_id=eq.${cafe.id}` },
        async (p) => {
          const fresh = p.new as Database["public"]["Tables"]["orders"]["Row"];
          if (seenOrderIds.current.has(fresh.id)) return;
          seenOrderIds.current.add(fresh.id);
          // Re-fetch with items in one shot.
          const { data } = await supabase.from("orders").select(SELECT).eq("id", fresh.id).maybeSingle();
          const full = (data as unknown as OrderRow | null) ?? { ...fresh, order_items: [] };
          setOrders(prev => [full, ...prev]);
          toast.success(`New order from ${fresh.customer_name}`, { description: `₹${Number(fresh.total_amount).toFixed(2)}` });
          if (cafe.sound_alerts_enabled !== false) playBeep();
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `cafe_id=eq.${cafe.id}` },
        (p) => {
          const updated = p.new as Database["public"]["Tables"]["orders"]["Row"];
          setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
        })
      .subscribe();
    channelRef.current = ch;
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channelRef.current) { void supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [cafe]);

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };
  const cancelOrder = async (id: string) => {
    if (!confirm("Cancel this order?")) return;
    await updateStatus(id, "cancelled");
  };
  const togglePaid = async (o: OrderRow) => {
    if (o.payment_status === "paid") {
      if (!confirm("Refund this paid order? Loyalty points will be reversed.")) return;
      const { error } = await supabase.rpc("refund_order", { _order_id: o.id });
      if (error) { toast.error(error.message); return; }
      setOrders(prev => prev.map(x => x.id === o.id ? { ...x, payment_status: "refunded", status: "cancelled" } : x));
      toast.success("Order refunded");
    } else {
      const { data, error } = await supabase.rpc("mark_order_paid", { _order_id: o.id });
      if (error) { toast.error(error.message); return; }
      const r = data as { awarded_points?: number };
      setOrders(prev => prev.map(x => x.id === o.id ? { ...x, payment_status: "paid", status: x.status === "placed" ? "accepted" : x.status } : x));
      toast.success(r?.awarded_points ? `Marked paid · ${r.awarded_points} points awarded` : "Marked paid");
    }
  };

  if (cafeLoading || loading) {
    return <OwnerLayout title="Orders"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></OwnerLayout>;
  }

  const activeTab = TABS.find(t => t.key === tab)!;
  const visible = orders.filter(o => activeTab.statuses.includes(o.status));

  return (
    <OwnerLayout title="Orders" subtitle={`${orders.length} total · live`}>
      <div className="flex gap-2 mb-5 border-b border-border">
        {TABS.map(t => {
          const count = orders.filter(o => t.statuses.includes(o.status)).length;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-smooth ${
                isActive ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label} <span className="ml-1 text-xs text-muted-foreground">({count})</span>
            </button>
          );
        })}
      </div>
      {visible.length === 0 ? (
        <Card className="p-10 text-center">
          <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-display text-xl font-bold">No {tab} orders</p>
          <p className="text-sm text-muted-foreground mt-2">New orders appear here in real time with a sound alert.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map(o => {
            const next = FLOW.find(f => f.from.includes(o.status));
            const lines = o.order_items ?? [];
            return (
              <Card key={o.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{o.customer_name}</p>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">via {o.source}</span>
                      {o.table_no && <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">Table {o.table_no}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                    {o.customer_phone && <p className="text-xs text-muted-foreground">📞 {o.customer_phone}</p>}
                    {o.notes && <p className="text-xs text-muted-foreground mt-1">📝 {o.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <p className="text-sm font-bold">₹{Number(o.total_amount).toFixed(2)}</p>
                    <button onClick={() => togglePaid(o)} className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${o.payment_status === "paid" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                      {o.payment_status}
                    </button>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${pillClass(o.status)}`}>{o.status}</span>
                  </div>
                </div>
                {lines.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border space-y-1">
                    {lines.map(l => (
                      <div key={l.id} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{l.quantity}× {l.name}</span>
                        <span>₹{(Number(l.price) * l.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(next || (o.status !== "completed" && o.status !== "cancelled")) && (
                  <div className="mt-3 flex gap-2 justify-end">
                    {o.status !== "cancelled" && o.status !== "completed" && (
                      <Button variant="ghost" size="sm" onClick={() => cancelOrder(o.id)}>
                        <X className="w-3 h-3 mr-1" /> Cancel
                      </Button>
                    )}
                    {next && (
                      <Button variant={next.variant} size="sm" onClick={() => updateStatus(o.id, next.to)}>{next.label}</Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </OwnerLayout>
  );
}
