import { useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, ClipboardCheck, Loader2, ShoppingBag, Users, X, Smartphone, Banknote, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StaffLayout } from "@/components/StaffLayout";
import { EtaBadge } from "@/components/EtaBadge";
import { EtaPicker } from "@/components/EtaPicker";
import { PayWithUpiButton } from "@/components/PayWithUpiButton";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useStaffCafe } from "@/hooks/useStaffCafe";

type Status = Database["public"]["Enums"]["order_status"];
type OrderItem = { id: string; name: string; price: number; quantity: number };
type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & { order_items: OrderItem[]; collector_name?: string | null; payment_method?: string | null };

const SELECT = "*, order_items(id, name, price, quantity)";

/** What each role sees in their queue. */
const visibleByRole: Record<"chef" | "runner", Status[]> = {
  chef:   ["accepted", "preparing"],
  runner: ["placed", "ready"],
};

function pillClass(status: Status) {
  if (status === "completed") return "bg-success/15 text-success";
  if (status === "cancelled") return "bg-destructive/15 text-destructive";
  if (status === "ready") return "bg-accent text-accent-foreground";
  return "bg-accent-soft text-accent-foreground";
}

export default function StaffDashboard() {
  const { cafe, assignment, loading: staffLoading } = useStaffCafe();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; orderId: string | null }>({ open: false, orderId: null });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const role = (assignment?.role ?? "") as "chef" | "runner" | "";
  const presets = cafe?.eta_presets?.length ? cafe.eta_presets : [5, 10, 15, 20, 30];

  useEffect(() => {
    if (!cafe) return;
    let cancelled = false;
    setLoading(true);

    const fetchOrders = async () => {
      const { data } = await supabase.from("orders").select(SELECT).eq("cafe_id", cafe.id)
        .not("payment_method", "is", null)
        .in("status", ["placed", "accepted", "preparing", "ready"])
        .order("created_at", { ascending: false }).limit(150);
      
      if (!cancelled && data) {
        // Resolve collector names manually to avoid schema cache join errors
        const collectorIds = Array.from(new Set(data?.map(o => o.paid_collected_by).filter(Boolean) as string[]));
        const collectorMap: Record<string, string> = {};
        if (collectorIds.length > 0) {
          const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", collectorIds);
          profiles?.forEach(p => collectorMap[p.user_id] = p.full_name || "Staff");
        }

        setOrders(((data as unknown as OrderRow[]) ?? []).map((o) => ({
          ...o,
          order_items: o.order_items ?? [],
          collector_name: collectorMap[o.paid_collected_by] || null
        })));
      }
    };

    void fetchOrders().finally(() => { if (!cancelled) setLoading(false); });

    if (channelRef.current) void supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`staff-orders:${cafe.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `cafe_id=eq.${cafe.id}` }, () => void fetchOrders())
      .subscribe();
    channelRef.current = ch;

    // Refresh every 15s as a realtime safety net + tick age displays.
    const tick = setInterval(() => void fetchOrders(), 15_000);
    return () => { cancelled = true; clearInterval(tick); if (channelRef.current) void supabase.removeChannel(channelRef.current); };
  }, [cafe]);

  const visible = useMemo(() => {
    const allowed = role ? visibleByRole[role] : [];
    return orders.filter((o) => allowed.includes(o.status));
  }, [orders, role]);

  const advance = async (order: OrderRow, next: Status) => {
    const { error } = await supabase.rpc("advance_order_workflow", { _order_id: order.id, _next_status: next });
    if (error) toast.error(error.message); else toast.success(`Order → ${next}`);
  };
  const cancel = async (id: string) => {
    setCancelDialog({ open: true, orderId: id });
  };

  const handleCancelConfirm = async () => {
    if (!cancelDialog.orderId) return;
    const { error } = await supabase.rpc("cancel_order_by_staff", { _order_id: cancelDialog.orderId });
    if (error) toast.error(error.message); else toast.success("Order cancelled");
    setCancelDialog({ open: false, orderId: null });
  };

  if (staffLoading || loading) return <StaffLayout title="Orders"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></StaffLayout>;

  const title = role === "chef" ? "Kitchen display" : "Runner queue";
  const subtitle = `${cafe?.name ?? "Cafe"} · ${visible.length} active`;

  const renderOrder = (o: OrderRow) => (
    <Card key={o.id} className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
            <p className="text-sm font-bold text-accent">#{o.id.slice(0, 6).toUpperCase()}</p>
            <p className="text-sm font-semibold truncate">{o.customer_name}</p>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">via {o.source}</span>
            {o.table_no && <span className="text-xs bg-muted px-2 py-1 rounded-full">Table {o.table_no}</span>}
            <EtaBadge minutes={o.wait_eta_minutes} etaUpdatedAt={o.eta_updated_at} status={o.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{new Date(o.created_at).toLocaleTimeString()}</p>
          {o.notes && <p className="text-xs text-muted-foreground mt-1 font-medium bg-muted/50 p-1.5 rounded border border-border/50">📝 {o.notes}</p>}
        <div className="flex flex-col items-end gap-1">
          <p className="text-sm font-bold">₹{Number(o.total_amount).toFixed(2)}</p>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
            o.payment_status === 'paid' 
              ? "bg-success/15 text-success"
              : (o.status === 'cancelled' ? "bg-muted text-muted-foreground" : "bg-amber-500 text-white animate-pulse shadow-lg")
          }`}>
            {o.payment_status === 'paid' ? 'PAID' : (o.status === 'cancelled' ? 'UNPAID' : (o.payment_method === 'cash' ? 'COLLECT CASH' : 'PAYMENT PENDING'))}
          </span>
          {o.payment_status === 'paid' && o.payment_method === 'cash' && o.collector_name && (
            <span className="text-xs text-muted-foreground italic">Collected by {o.collector_name}</span>
          )}
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${pillClass(o.status)}`}>{o.status}</span>
        </div>
      </div>
      <div className="pt-2 border-t border-border space-y-1">
        {o.order_items.map((item) => (
          <div key={item.id} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{item.quantity}× {item.name}</span>
            <span>{Number(item.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-end flex-wrap">
        {/* Chef actions */}
        {role === "chef" && (
          <>
            {["accepted", "preparing"].includes(o.status) && (
              <EtaPicker orderId={o.id} presets={presets} currentMinutes={o.wait_eta_minutes ?? undefined} />
            )}
            {o.status === "accepted" && (
              <Button variant="hero" size="sm" onClick={() => advance(o, "preparing")}><ChefHat className="w-3 h-3 mr-1" /> Start prep</Button>
            )}
            {o.status === "preparing" && (
              <Button variant="hero" size="sm" onClick={() => advance(o, "ready")}><ChefHat className="w-3 h-3 mr-1" /> Mark ready</Button>
            )}
          </>
        )}

        {/* Runner actions */}
        {role === "runner" && (
          <>
            <Button variant="ghost" size="sm" onClick={() => cancel(o.id)}><X className="w-3 h-3 mr-1" /> Cancel</Button>
            {o.status === "placed" && (
              <Button variant="hero" size="sm" onClick={() => advance(o, "accepted")}><ClipboardCheck className="w-3 h-3 mr-1" /> Accept &amp; send to kitchen</Button>
            )}
            {o.payment_status === "pending" && cafe && (
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
                   // Refresh locally if needed, but the realtime channel will catch it
                }}
              />
            )}
            {o.status === "ready" && (
              <Button 
                variant="hero" 
                size="sm" 
                onClick={() => advance(o, "completed")}
                disabled={o.payment_status !== "paid"}
                title={o.payment_status !== "paid" ? "Collect payment before completing" : ""}
              >
                <ClipboardCheck className="w-3 h-3 mr-1" /> Complete
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );

  // Group by stage for display
  const groups: Record<string, OrderRow[]> = {};
  for (const o of visible) {
    const key = o.status === "placed" ? "new"
      : o.status === "accepted" ? "accepted"
      : o.status === "preparing" ? "preparing"
      : "ready";
    (groups[key] ??= []).push(o);
  }

  const labels: Record<string, string> = {
    new: "New orders", accepted: "Sent to kitchen", preparing: "In the kitchen",
    ready: "Ready for runner / Awaiting collection",
  };
  const order = role === "chef"
    ? (["accepted", "preparing"] as const)
    : (["new", "ready"] as const);

  return (
    <StaffLayout title={title} subtitle={subtitle}>
      {visible.length === 0 ? (
        <Card className="p-10 text-center">
          <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-display text-xl font-bold">All caught up</p>
          <p className="text-sm text-muted-foreground mt-2">
            {role === "chef" ? "New tickets appear here once the runner sends them in." : "New orders, ready dishes & payments appear here in real time."}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {order.map((stage) => {
            const list = groups[stage]; if (!list?.length) return null;
            return (
              <section key={stage}>
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  {stage === "served" && <Smartphone className="w-3.5 h-3.5" />}
                  {labels[stage]} · {list.length}
                </h2>
                <div className="grid gap-3 md:grid-cols-2">{list.map(renderOrder)}</div>
              </section>
            );
          })}
        </div>
      )}

      {/* Cancel Order Confirmation Dialog */}
      <AlertDialog open={cancelDialog.open} onOpenChange={(open) => setCancelDialog({ ...cancelDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm}>Cancel Order</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StaffLayout>
  );
}
