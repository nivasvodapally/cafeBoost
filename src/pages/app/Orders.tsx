import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, Loader2, RotateCcw, Check, ChefHat, PackageCheck, X, Receipt, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EtaBadge } from "@/components/EtaBadge";
import { PayWithUpiButton } from "@/components/PayWithUpiButton";

type Status = "placed" | "accepted" | "preparing" | "ready" | "completed" | "cancelled";
type Order = {
  id: string; status: Status; total_amount: number; subtotal: number; tax_amount: number;
  created_at: string; customer_name: string; customer_phone: string | null; cafe_id: string; payment_status: string; source: string;
  wait_eta_minutes?: number | null; eta_updated_at?: string | null; cancellation_requested: boolean;
};
type OrderItem = { id: string; order_id: string; name: string; price: number; quantity: number; menu_item_id: string | null };

const TIMELINE: { key: Status; label: string; icon: typeof Check }[] = [
  { key: "placed", label: "Placed", icon: ClipboardList },
  { key: "accepted", label: "Accepted", icon: Check },
  { key: "preparing", label: "Preparing", icon: ChefHat },
  { key: "ready", label: "Ready", icon: PackageCheck },
  { key: "completed", label: "Done", icon: Check },
];

function statusIndex(s: Status) {
  const order: Status[] = ["placed", "accepted", "preparing", "ready", "completed"];
  return order.indexOf(s);
}

export default function CustomerOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchAll = async () => {
      const { data } = await supabase.from("orders")
        .select("id, status, total_amount, subtotal, tax_amount, created_at, customer_name, customer_phone, cafe_id, payment_status, source, wait_eta_minutes, eta_updated_at")
        .eq("customer_user_id", user.id)
        .order("created_at", { ascending: false }).limit(50);
      if (cancelled) return;
      const list = (data as Order[]) ?? [];
      setOrders(list);
      if (list.length) {
        const { data: oi } = await supabase.from("order_items")
          .select("id, order_id, name, price, quantity, menu_item_id")
          .in("order_id", list.map(o => o.id));
        const map: Record<string, OrderItem[]> = {};
        (oi ?? []).forEach((r) => { (map[r.order_id] ||= []).push(r as OrderItem); });
        if (!cancelled) setItems(map);
      }
      if (!cancelled) setLoading(false);
    };
    void fetchAll();
    const poll = setInterval(() => void fetchAll(), 15_000);

    if (channelRef.current) { void supabase.removeChannel(channelRef.current); channelRef.current = null; }
    const ch = supabase
      .channel(`my-orders:${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `customer_user_id=eq.${user.id}` },
        (p) => {
          const updated = p.new as Order;
          setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
          if (updated.status === "ready") toast.success(`Your order is ready!`);
          else if (updated.status === "accepted") toast(`Order accepted by the cafe.`);
        })
      .subscribe();
    channelRef.current = ch;

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channelRef.current) { void supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [user]);

  const reorder = async (o: Order) => {
    const lines = items[o.id] ?? [];
    if (!lines.length) { toast.error("Order details not loaded yet"); return; }
    const cartKey = `cafeboost:cart:${o.cafe_id}`;
    const cart = lines.map(l => ({
      id: l.menu_item_id ?? "", category: "Reorder", name: l.name,
      description: null, price: Number(l.price), tags: [], available: true, qty: l.quantity,
    })).filter(l => l.id);
    if (!cart.length) { toast.error("These items are no longer available"); return; }
    try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch { /* ignore */ }
    toast.success("Cart filled with previous order");
    navigate("/app/menu");
  };

  const cancelByCustomer = async (id: string) => {
    if (!confirm("Request cancellation for this order? Staff will confirm shortly.")) return;
    const { error } = await supabase.rpc("cancel_order_by_customer", { _order_id: id });
    if (error) {
      toast.error(error.message || "Could not request cancellation");
    } else {
      toast.success("Cancellation request sent to staff");
      setOrders(prev => prev.map(o => o.id === id ? { ...o, cancellation_requested: true } : o));
    }
  };

  if (loading) return <CustomerLayout title="My Orders"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></CustomerLayout>;

  return (
    <CustomerLayout title="My Orders">
      {orders.length === 0 ? (
        <Card className="p-10 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-display text-xl font-bold">No orders yet</p>
          <p className="text-sm text-muted-foreground mt-2">Order from the menu and your live status will show here.</p>
          <Button variant="hero" className="mt-6" onClick={() => navigate("/app/menu")}>Browse menu</Button>
        </Card>
      ) : (
        <div className="space-y-4">{orders.map(o => {
          const idx = statusIndex(o.status);
          const cancelled = o.status === "cancelled";
          return (
            <Card key={o.id} className="p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold">Order #{o.id.slice(0, 6).toUpperCase()}</p>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">₹{Number(o.total_amount).toFixed(2)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{o.payment_status}</p>
                  <EtaBadge minutes={o.wait_eta_minutes} etaUpdatedAt={o.eta_updated_at} status={o.status} className="mt-1" />
                </div>
              </div>
              {cancelled ? (
                <div className="flex items-center gap-2 text-destructive text-xs font-medium bg-destructive/10 rounded-lg px-3 py-2">
                  <X className="w-3.5 h-3.5" /> Order cancelled
                </div>
              ) : o.cancellation_requested ? (
                <div className="flex items-center gap-2 text-amber-600 text-xs font-medium bg-amber-500/10 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5" /> Cancellation pending staff approval
                </div>
              ) : (
                <div className="flex items-center justify-between gap-1 mb-3">
                  {TIMELINE.map((step, i) => {
                    const reached = i <= idx;
                    const Icon = step.icon;
                    return (
                      <div key={step.key} className="flex-1 flex flex-col items-center">
                        <div className={`w-7 h-7 rounded-full grid place-items-center text-[10px] ${reached ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className={`text-[10px] mt-1 ${reached ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {(items[o.id] ?? []).length > 0 && (
                <div className="border-t border-border pt-3 mt-2 space-y-1">
                  {items[o.id].map(li => (
                    <div key={li.id} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{li.quantity}× {li.name}</span>
                      <span>₹{(Number(li.price) * li.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex justify-end gap-2">
                {!cancelled && o.payment_status === "pending" && (
                  <PayWithUpiButton
                    orderId={o.id}
                    cafeId={o.cafe_id}
                    customerName={o.customer_name}
                    customerPhone={o.customer_phone}
                    amount={Number(o.total_amount)}
                    size="sm"
                    variant="hero"
                  />
                )}
                {o.payment_status === "paid" && (
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/app/orders/${o.id}/invoice`)}>
                    <Receipt className="w-3 h-3 mr-1" /> Invoice
                  </Button>
                )}
                {!cancelled && !o.cancellation_requested && (o.status === "placed" || o.status === "accepted") && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => cancelByCustomer(o.id)}>
                    <X className="w-3 h-3 mr-1" /> Cancel
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => reorder(o)}><RotateCcw className="w-3 h-3 mr-1" /> Reorder</Button>
              </div>
            </Card>
          );
        })}</div>
      )}
    </CustomerLayout>
  );
}
