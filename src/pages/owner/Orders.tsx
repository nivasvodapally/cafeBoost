import { useEffect, useRef, useState, useCallback } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingBag, X, AlertCircle } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { PaymentDialog } from "@/components/PaymentDialog";
import { PayWithUpiButton } from "@/components/PayWithUpiButton";

type OrderItem = { id: string; name: string; price: number; quantity: number };
type Status = Database["public"]["Enums"]["order_status"];
type LiveOrder = { 
  id: string; customer_name: string; table_no: string|null; source: string; status: string; payment_status: string; payment_method: string;
  total_amount: number; created_at: string; age_seconds: number; stuck_reason: string|null; cancellation_requested: boolean;
  assignee_name: string|null; assignee_role: string|null; wait_eta_minutes: number|null; order_items?: OrderItem[]; collector_name: string|null 
};
type Staff = { user_id: string; role: string; name: string; on_shift: boolean; on_break: boolean; orders_today: number };
type Board = { orders: LiveOrder[]; staff: Staff[]; config: { stuck_unaccepted_minutes: number; stuck_kitchen_minutes: number; stuck_ready_minutes: number } };

type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & { 
  order_items: OrderItem[];
  stuck_reason?: string | null;
  assignee_name?: string | null;
  collector_name?: string | null;
  refunded_by_name?: string | null;
  refund_requested?: boolean;
  refund_workflow_status?: 'none' | 'requested' | 'refunded' | 'rejected';
  refund_rejection_reason?: string | null;
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

export default function OwnerOrders() {
  const { cafe, loading: cafeLoading } = useOwnerCafe();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"live" | "completed" | "cancelled">("live");
  const [counts, setCounts] = useState<Record<string, number>>({ live: 0, completed: 0, cancelled: 0 });
  const [payOrder, setPayOrder] = useState<OrderRow | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchAll = useCallback(async (quiet = false) => {
    if (!cafe) return;
    if (!quiet) setLoading(true);
    try {
      if (tab === "live") {
        const { data, error } = await supabase.rpc("get_live_ops_board", { _cafe_id: cafe.id });
        if (error) { toast.error(error.message); return; }
        const b = data as Board;
        setBoard(b);
        const { data: items } = await supabase.from("order_items").select("id, order_id, name, price, quantity").in("order_id", b.orders.map(o => o.id));
        const itemMap: Record<string, OrderItem[]> = {};
        (items ?? []).forEach(i => (itemMap[i.order_id] ||= []).push(i));
        
        const localToday = new Date();
        localToday.setHours(0, 0, 0, 0);
        const todayStr = localToday.toISOString();

        const filteredOrders = b.orders
          .filter(o => o.created_at >= todayStr)
          .map(o => ({ ...o, order_items: itemMap[o.id] || [] } as LiveOrder));
          
        setOrders(filteredOrders);
      } else {
        const { data, error } = await supabase.from("orders").select(SELECT)
          .eq("cafe_id", cafe.id)
          .in("status", TABS.find(t => t.key === tab)?.statuses || [])
          .order("created_at", { ascending: false }).limit(150);
        if (error) { toast.error(error.message); return; }
        
        const orderData = data as unknown as OrderRow[];
        const personIds = Array.from(new Set([
          ...(orderData?.map(o => o.paid_collected_by) ?? []),
          ...(orderData?.map(o => o.refunded_by) ?? [])
        ].filter(Boolean) as string[]));
        
        const personMap: Record<string, string> = {};
        if (personIds.length > 0) {
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", personIds);
          profiles?.forEach(p => personMap[p.user_id] = p.full_name || "Staff");
        }

        setOrders((orderData ?? []).map(o => ({
          ...o,
          order_items: o.order_items ?? [],
          collector_name: personMap[o.paid_collected_by] || null,
          refunded_by_name: personMap[o.refunded_by] || null
        })) as OrderRow[]);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [cafe, tab]);

  const fetchCounts = useCallback(async () => {
    if (!cafe) return;
    const localToday = new Date();
    localToday.setHours(0, 0, 0, 0);
    const today = localToday.toISOString();

    // Use more efficient count queries with filters
    const [
      { count: liveCount, error: liveError },
      { count: completedCount, error: completedError },
      { count: cancelledCount, error: cancelledError }
    ] = await Promise.all([
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .in("status", ["placed", "accepted", "preparing", "ready", "served"])
        .gte("created_at", today),
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .eq("status", "completed"),
      supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .eq("status", "cancelled"),
    ]);

    if (liveError || completedError || cancelledError) {
      console.error("Error fetching counts:", { liveError, completedError, cancelledError });
      return;
    }

    setCounts({
      live: liveCount || 0,
      completed: completedCount || 0,
      cancelled: cancelledCount || 0,
    });
  }, [cafe]);

  useEffect(() => {
    if (!cafe) return;
    void fetchAll(); void fetchCounts();
    const poll = setInterval(() => { void fetchAll(true); void fetchCounts(); }, 30000);
    const ch = supabase.channel(`orders:${cafe.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `cafe_id=eq.${cafe.id}` }, () => {
        void fetchAll(true); void fetchCounts();
      })
      .subscribe();
    channelRef.current = ch;
    return () => { clearInterval(poll); if (channelRef.current) void supabase.removeChannel(channelRef.current); };
  }, [cafe, tab, fetchAll, fetchCounts]);

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await supabase.rpc("advance_order_workflow", { _order_id: id, _next_status: status });
    if (error) toast.error(error.message);
    else void fetchAll(true);
  };
  const cancelOrder = async (id: string) => {
    if (!confirm("Cancel this order?")) return;
    const { error } = await supabase.rpc("cancel_order_by_staff", { _order_id: id });
    if (error) toast.error(error.message);
    else void fetchAll(true);
  };
  const denyCancellation = async (id: string) => {
    const { error } = await supabase.rpc("deny_order_cancellation", { _order_id: id });
    if (error) toast.error(error.message);
    else void fetchAll(true);
  };
  const handleRefund = async (orderId: string, label: string) => {
    if (!window.confirm(`${label}?`)) return;
    try {
      type RpcResponse = { success?: boolean; error?: string };
      const { data, error } = await supabase.rpc('finalize_order_refund', { _order_id: orderId });
      if (error) throw error;
      if (data && !(data as RpcResponse).success) throw new Error((data as RpcResponse).error || "Refund failed");
      toast.success("Refund processed successfully");
      void fetchAll(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refund failed");
    }
  };
  const denyRefund = async (orderId: string) => {
    const reason = window.prompt("Reason for rejecting the refund request?");
    if (reason === null) return;
    try {
      type RpcResponse = { success?: boolean; error?: string };
      const { data, error } = await supabase.rpc('deny_refund_request', { _order_id: orderId, _reason: reason });
      if (error) throw error;
      if (data && !(data as RpcResponse).success) throw new Error((data as RpcResponse).error || "Failed to reject refund");
      toast.success("Refund request rejected");
      void fetchAll(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rejection failed");
    }
  };

  if (cafeLoading || loading) return <OwnerLayout title="Orders"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></OwnerLayout>;

  return (
    <OwnerLayout title="Orders">
      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border/50 mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label} <span className="ml-1 opacity-50 text-[10px]">({counts[t.key]})</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {orders.length === 0 ? (
          <Card className="p-10 text-center"><ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" /><p className="font-display text-xl font-bold">No {tab} orders</p></Card>
        ) : (
          orders.map(o => {
            const next = FLOW.find(f => f.from.includes(o.status));
            return (
              <Card key={o.id} className={`p-4 ${o.stuck_reason ? "border-destructive ring-1 ring-destructive/20" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-accent">#{o.id.slice(0, 6).toUpperCase()}</p>
                      <p className="text-sm font-semibold truncate">{o.customer_name}</p>
                      {o.table_no && <span className="text-xs bg-muted px-2 py-1 rounded-full">Table {o.table_no}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(o.created_at).toLocaleString()} {o.assignee_name && <span className="text-accent font-medium">→ {o.assignee_name}</span>}</p>
                    {o.notes && <p className="text-xs text-muted-foreground mt-1 bg-muted/30 p-1 rounded italic">"{o.notes}"</p>}
                  </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-sm font-bold">₹{Number(o.total_amount).toFixed(2)}</p>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                          o.payment_status === 'paid' ? "bg-success/15 text-success" : (o.status === 'cancelled' ? "bg-muted text-muted-foreground" : "bg-amber-500 text-white animate-pulse shadow-lg")
                        }`}>
                          {o.payment_status === 'paid' ? 'PAID' : (o.status === 'cancelled' ? 'UNPAID' : (o.payment_method === 'cash' ? 'COLLECT CASH' : 'PAYMENT PENDING'))}
                        </span>
                        {o.payment_status === 'paid' && (
                          <span className="text-xs text-muted-foreground italic">
                            {o.collector_name ? `Collected by ${o.collector_name}` : (o.payment_method === 'cash' ? 'Cash Collection' : 'Online Payment')}
                          </span>
                        )}
                        <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full ${pillClass(o.status as Status)}`}>{o.status}</span>
                      </div>
                    </div>
                </div>

                <div className="mt-3 space-y-1">
                  {o.order_items.map(l => (
                    <div key={l.id} className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{l.quantity}× {l.name}</span>
                      <span>₹{(Number(l.price) * l.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Refund Section - Contextual Logic */}
                {o.status === 'cancelled' && o.payment_status === 'paid' && !o.refunded_at && (
                  <div className="mt-4 p-3 bg-destructive/5 border border-destructive/10 rounded-lg">
                    {o.refund_workflow_status === 'requested' ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-amber-600 animate-pulse">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase">Customer Requested Refund</span>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="hero" size="sm" className="flex-1" onClick={() => handleRefund(o.id, "Approve Refund")}>Approve Refund</Button>
                          <Button variant="outline" size="sm" className="flex-1 border-destructive/20 text-destructive" onClick={() => denyRefund(o.id)}>Reject Request</Button>
                        </div>
                      </div>
                    ) : o.refund_workflow_status === 'rejected' ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-muted-foreground opacity-60">
                          <X className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase">Refund Request Rejected</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground italic mb-2">Reason: "{o.refund_rejection_reason}"</p>
                        <Button variant="outline" size="sm" className="w-full text-[10px]" onClick={() => handleRefund(o.id, "Override rejection and Refund anyway")}>Override & Refund Anyway</Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground mb-2 italic text-center">No refund request initiated by customer yet.</p>
                        <Button variant="outline" size="sm" className="w-full gap-2 border-destructive/20 text-destructive hover:bg-destructive hover:text-white" onClick={() => handleRefund(o.id, "Manually Process Refund")}>
                          <AlertCircle className="w-3.5 h-3.5" /> Record Manual Refund
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {o.refunded_at && (
                  <div className="mt-3 p-2 bg-destructive/10 rounded flex items-center justify-between">
                    <span className="text-[10px] font-bold text-destructive uppercase">Refunded</span>
                    <span className="text-xs text-muted-foreground italic">by {o.refunded_by_name || 'Staff'} on {new Date(o.refunded_at).toLocaleDateString()}</span>
                  </div>
                )}

                <div className="mt-4 flex gap-2 justify-end flex-wrap">
                  {o.payment_status === "pending" && o.status !== "cancelled" && (
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
                      onPaid={() => { void fetchAll(true); }}
                    />
                  )}
                  {o.cancellation_requested && o.status !== 'cancelled' && (
                    <div className="flex-1 flex gap-2 items-center bg-amber-500/10 p-2 rounded border border-amber-500/20">
                      <span className="text-[10px] font-bold text-amber-600 uppercase flex-1">Cancellation Requested</span>
                      <Button variant="hero" size="sm" className="h-7 text-[10px]" onClick={() => cancelOrder(o.id)}>Approve</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => denyCancellation(o.id)}>Deny</Button>
                    </div>
                  )}
                  {next && !o.cancellation_requested && (
                    <Button variant={next.variant} size="sm" onClick={() => updateStatus(o.id, next.to)} disabled={next.to === "completed" && o.payment_status !== "paid"}>
                      {next.label}
                    </Button>
                  )}
                  {o.status !== 'completed' && o.status !== 'cancelled' && !o.cancellation_requested && (
                    <Button variant="ghost" size="sm" onClick={() => cancelOrder(o.id)}><X className="w-3 h-3 mr-1" /> Cancel</Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
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
          onPaid={() => { void fetchAll(true); setPayOrder(null); }}
        />
      )}
    </OwnerLayout>
  );
}
