import { useEffect, useRef, useState } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingBag, X, AlertCircle, Banknote } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { PaymentDialog } from "@/components/PaymentDialog";
import { PayWithUpiButton } from "@/components/PayWithUpiButton";

type OrderItem = { id: string; name: string; price: number; quantity: number };
type Status = Database["public"]["Enums"]["order_status"];
type LiveOrder = { id: string; customer_name: string; table_no: string|null; source: string; status: string; payment_status: string; payment_method: string;
  total_amount: number; created_at: string; age_seconds: number; stuck_reason: string|null; cancellation_requested: boolean;
  assignee_name: string|null; assignee_role: string|null; wait_eta_minutes: number|null; order_items?: OrderItem[]; collector_name: string|null };
type Staff = { user_id: string; role: string; name: string; on_shift: boolean; on_break: boolean; orders_today: number };
type Board = { orders: LiveOrder[]; staff: Staff[]; config: { stuck_unaccepted_minutes: number; stuck_kitchen_minutes: number; stuck_ready_minutes: number } };

type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & { 
  order_items: OrderItem[];
  stuck_reason?: string | null;
  assignee_name?: string | null;
  collector_name?: string | null;
};

const FLOW: { from: Status[]; to: Status; label: string; variant: "outline" | "hero" }[] = [
  { from: ["placed"],            to: "accepted",  label: "Accept",         variant: "hero" },
  { from: ["accepted"],          to: "preparing", label: "Start preparing", variant: "outline" },
  { from: ["preparing"],         to: "ready",     label: "Mark ready",     variant: "outline" },
  { from: ["ready"],             to: "completed", label: "Complete",       variant: "outline" },
];

const TABS: { key: "live" | "completed" | "cancelled"; label: string; statuses?: Status[] }[] = [
  { key: "live",      label: "Live Board" },
  { key: "completed", label: "Completed",   statuses: ["completed"] },
  { key: "cancelled", label: "Cancelled",   statuses: ["cancelled"] },
];

function pillClass(status: Status) {
  if (status === "completed") return "bg-success/15 text-success";
  if (status === "cancelled") return "bg-destructive/15 text-destructive";
  if (status === "ready") return "bg-accent text-accent-foreground";
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
    const warmed = window.__cafeboost_audio_ctx;
    if (warmed) { if (warmed.state === "suspended") void warmed.resume(); return warmed; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
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
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"live" | "completed" | "cancelled">("live");
  const [counts, setCounts] = useState<Record<string, number>>({ live: 0, completed: 0, cancelled: 0 });
  const [payOrder, setPayOrder] = useState<OrderRow | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const seenOrderIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!cafe) return;
    let cancelled = false;
    setLoading(true);
    const fetchAll = async () => {
      if (tab === "live") {
        const { data, error } = await supabase.rpc("get_live_ops_board", { _cafe_id: cafe.id });
        if (error) { toast.error(error.message); return; }
        if (cancelled) return;
        const b = data as Board;
        setBoard(b);
        // Sync items for live orders
        const { data: items } = await supabase.from("order_items")
          .select("id, order_id, name, price, quantity")
          .in("order_id", b.orders.map(o => o.id));
        const itemMap: Record<string, OrderItem[]> = {};
        (items ?? []).forEach(i => (itemMap[i.order_id] ||= []).push(i));
        
        setOrders(b.orders.map(o => ({ ...o, order_items: itemMap[o.id] || [] } as any)));
      } else {
        const { data, error } = await supabase.from("orders").select(SELECT)
          .eq("cafe_id", cafe.id)
          .in("status", TABS.find(t => t.key === tab)?.statuses || [])
          .order("created_at", { ascending: false }).limit(150);
        
        if (error) {
          console.error("Fetch history error:", error);
          toast.error("Could not load history: " + error.message);
          return;
        }
        if (cancelled) return;
        
        // Resolve collector names manually to avoid schema cache join errors
        const collectorIds = Array.from(new Set(data?.map(o => o.paid_collected_by).filter(Boolean) as string[]));
        let collectorMap: Record<string, string> = {};
        if (collectorIds.length > 0) {
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", collectorIds);
          profiles?.forEach(p => collectorMap[p.user_id] = p.full_name || "Staff");
        }

        const list = (data as any[] ?? []).map(o => ({
          ...o,
          order_items: o.order_items ?? [],
          collector_name: collectorMap[o.paid_collected_by] || null
        })) as OrderRow[];
        setOrders(list);
      }
      setLoading(false);
    };
    const fetchCounts = async () => {
      if (!cafe) return;
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, payment_status, created_at, cancellation_requested")
        .eq("cafe_id", cafe.id)
        .not("payment_method", "is", null)
        .gte("created_at", today);
      
      if (!error && data) {
        const c = { live: 0, completed: 0, cancelled: 0 };
        data.forEach(o => {
          if (["placed", "accepted", "preparing", "ready", "served"].includes(o.status)) c.live++;
          else if (o.status === "completed") c.completed++;
          else if (o.status === "cancelled") c.cancelled++;
        });
        setCounts(c);
      }
    };

    void fetchAll();
    void fetchCounts();
    const poll = setInterval(() => { void fetchAll(); void fetchCounts(); }, tab === "live" ? 30_000 : 60_000);

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
          const full = (data as OrderRow | null) ?? { ...fresh, order_items: [] };
          setOrders(prev => [full, ...prev]);
          toast.success(`New order from ${fresh.customer_name}`, { description: `₹${Number(fresh.total_amount).toFixed(2)}` });
          if (cafe.sound_alerts_enabled !== false) playBeep();
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `cafe_id=eq.${cafe.id}` },
        (p) => {
          const updated = p.new as Database["public"]["Tables"]["orders"]["Row"];
          setOrders(prev => {
            const mapped = prev.map(o => o.id === updated.id ? { ...o, ...updated } : o);
            // If tab is 'live', remove if status is completed/cancelled
            if (tab === "live") {
              return mapped.filter(o => !["completed", "cancelled"].includes(o.status));
            }
            // For other tabs, ensure the status still matches the tab's filter
            const allowed = TABS.find(t => t.key === tab)?.statuses || [];
            if (allowed.length > 0) {
              return mapped.filter(o => allowed.includes(o.status as Status));
            }
            return mapped;
          });
          void fetchCounts();
        })
      .subscribe();
    channelRef.current = ch;
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channelRef.current) { void supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [cafe, tab]);

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await supabase.rpc("advance_order_workflow", { _order_id: id, _next_status: status });
    if (error) toast.error(error.message);
    else setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };
  const cancelOrder = async (id: string) => {
    if (!confirm("Cancel this order?")) return;
    const { error } = await supabase.rpc("cancel_order_by_staff", { _order_id: id });
    if (error) toast.error(error.message);
    else setOrders(prev => prev.map(o => o.id === id ? { ...o, status: "cancelled" } : o));
  };
  const denyCancellation = async (id: string) => {
    const { error } = await supabase.rpc("deny_order_cancellation", { _order_id: id });
    if (error) toast.error(error.message);
    else {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, cancellation_requested: false } : o));
      toast.success("Cancellation request denied");
    }
  };
  const collectCash = async (id: string) => {
    const { error } = await supabase.rpc("mark_order_paid", { _order_id: id });
    if (error) toast.error(error.message);
    else {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, payment_status: "paid", payment_method: "cash" } : o));
      toast.success("Payment recorded");
    }
  };

  if (cafeLoading || loading) {
    return <OwnerLayout title="Orders"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></OwnerLayout>;
  }

  const visible = tab === "live" ? orders : orders.filter(o => TABS.find(t => t.key === tab)?.statuses?.includes(o.status));

  const TeamSidebar = () => (
    <Card className="p-4 h-fit lg:sticky lg:top-24">
      <h3 className="font-display font-bold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Team today</h3>
      {(board?.staff ?? []).length === 0 ? <p className="text-xs text-muted-foreground">No staff yet.</p> : (
        <div className="space-y-2">
          {(board?.staff ?? []).map(s => (
            <div key={s.user_id} className="flex items-center justify-between text-sm rounded-lg border border-border p-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{s.name}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{s.role}</p>
              </div>
              <div className="text-right">
                {s.on_break ? <span className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-bold">BREAK</span>
                  : s.on_shift ? <span className="text-[10px] bg-success/15 text-success px-1.5 py-0.5 rounded font-bold">ON</span>
                  : <span className="text-[10px] text-muted-foreground">off</span>}
                <p className="text-xs font-bold mt-0.5">{s.orders_today} today</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <OwnerLayout title="Orders" subtitle={`${orders.length} total · live`}>
      <div className="flex gap-2 mb-5 border-b border-border">
        {TABS.map(t => {
          const count = counts[t.key] ?? 0;
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
      <div className={tab === "live" ? "grid lg:grid-cols-[1fr_280px] gap-4" : ""}>
        <div className="space-y-3">
          {visible.length === 0 ? (
            <Card className="p-10 text-center">
              <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-display text-xl font-bold">No {tab} orders</p>
              <p className="text-sm text-muted-foreground mt-2">New orders appear here in real time with a sound alert.</p>
            </Card>
          ) : (
            visible.map(o => {
              const next = FLOW.find(f => f.from.includes(o.status));
              const lines = o.order_items ?? [];
              return (
                <Card key={o.id} className={`p-4 ${o.stuck_reason ? "border-destructive ring-1 ring-destructive/20" : ""}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-accent">#{o.id.slice(0, 6).toUpperCase()}</p>
                        <p className="text-sm font-semibold truncate">{o.customer_name}</p>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">via {o.source}</span>
                        {o.table_no && <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">Table {o.table_no}</span>}
                        {o.stuck_reason && <span className="text-[10px] bg-destructive/15 text-destructive px-2 py-0.5 rounded-full font-bold uppercase">STUCK · {o.stuck_reason}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(o.created_at).toLocaleString()}
                        {o.assignee_name && <span className="ml-2 text-accent font-medium">→ {o.assignee_name}</span>}
                      </p>
                      {o.customer_phone && <p className="text-xs text-muted-foreground">📞 {o.customer_phone}</p>}
                      {o.notes && <p className="text-xs text-muted-foreground mt-1 font-medium bg-muted/50 p-1.5 rounded border border-border/50">📝 {o.notes}</p>}
                    </div>
                    <div className="flex items-center gap-3 justify-end">
                      <p className="text-sm font-bold">₹{Number(o.total_amount).toFixed(2)}</p>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                          o.payment_status === 'paid' 
                            ? "bg-success/15 text-success"
                            : "bg-amber-500 text-white animate-pulse shadow-lg"
                        }`}>
                          {o.payment_status === 'paid' ? 'PAID' : (o.payment_method === 'cash' ? 'COLLECT CASH' : 'PAYMENT PENDING')}
                        </span>
                        {o.payment_status === 'paid' && (
                          <span className="text-[9px] text-muted-foreground italic">
                            {o.collector_name ? `Collected by ${o.collector_name}` : (o.payment_method === 'cash' ? 'Cash Collection' : 'Online Payment')}
                          </span>
                        )}
                        <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full ${pillClass(o.status as Status)}`}>{o.status}</span>
                      </div>
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
                  {o.cancellation_requested && o.status !== "cancelled" && (
                    <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">Customer requested cancellation</span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-[10px] border-destructive/50 text-destructive hover:bg-destructive hover:text-white" onClick={() => cancelOrder(o.id)}>Approve</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => denyCancellation(o.id)}>Deny</Button>
                      </div>
                    </div>
                  )}
                  {(next || (o.status !== "completed" && o.status !== "cancelled")) && (
                    <div className="mt-3 flex gap-2 justify-end">
                      {o.status !== "cancelled" && o.status !== "completed" && !o.cancellation_requested && (
                        <Button variant="ghost" size="sm" onClick={() => cancelOrder(o.id)}>
                          <X className="w-3 h-3 mr-1" /> Cancel
                        </Button>
                      )}
                      {o.payment_status === "pending" && (
                        <PayWithUpiButton
                          orderId={o.id}
                          cafeId={cafe.id}
                          cafeName={cafe.name}
                          customerName={o.customer_name}
                          customerPhone={o.customer_phone}
                          amount={Number(o.total_amount)}
                          size="sm"
                          variant="hero"
                          runnerMode={true}
                          label="Collect Payment"
                          onPaid={() => {
                            setOrders(prev => prev.map(old => old.id === o.id ? { ...old, payment_status: "paid" } : old));
                          }}
                        />
                      )}
                      {next && (
                        <Button 
                          variant={next.variant} 
                          size="sm" 
                          onClick={() => updateStatus(o.id, next.to)}
                          disabled={next.to === "completed" && o.payment_status !== "paid"}
                          title={next.to === "completed" && o.payment_status !== "paid" ? "Collect payment before completing" : ""}
                        >
                          {o.status === 'placed' && o.payment_method === 'cash' ? 'Verify & Accept' : next.label}
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
        {tab === "live" && <TeamSidebar />}
      </div>
      {payOrder && (
        <PaymentDialog
          open={!!payOrder}
          onOpenChange={(v) => !v && setPayOrder(null)}
          orderId={payOrder.id}
          cafeId={payOrder.cafe_id}
          amount={Number(payOrder.total_amount)}
          customerName={payOrder.customer_name}
          customerPhone={payOrder.customer_phone}
          runnerMode={true}
          onPaid={() => {
            setOrders(prev => prev.map(o => o.id === payOrder.id ? { ...o, payment_status: "paid", status: o.status === "placed" ? "accepted" : o.status } : o));
            setPayOrder(null);
          }}
        />
      )}
    </OwnerLayout>
  );
}
