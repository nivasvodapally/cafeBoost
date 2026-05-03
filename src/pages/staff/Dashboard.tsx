import { useEffect, useMemo, useRef, useState } from "react";
import { ChefHat, ClipboardCheck, Loader2, ShoppingBag, Users, X, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StaffLayout } from "@/components/StaffLayout";
import { EtaBadge } from "@/components/EtaBadge";
import { EtaPicker } from "@/components/EtaPicker";
import { PayWithUpiButton } from "@/components/PayWithUpiButton";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useStaffCafe } from "@/hooks/useStaffCafe";

type Status = Database["public"]["Enums"]["order_status"];
type OrderItem = { id: string; name: string; price: number; quantity: number };
type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & { order_items: OrderItem[] };

const SELECT = "*, order_items(id, name, price, quantity)";

/** What each role sees in their queue. */
const visibleByRole: Record<"chef" | "runner", Status[]> = {
  chef:   ["accepted", "preparing"],
  runner: ["placed", "ready", "served"],
};

function pillClass(status: Status) {
  if (["completed", "delivered"].includes(status)) return "bg-success/15 text-success";
  if (status === "cancelled") return "bg-destructive/15 text-destructive";
  if (["ready", "served"].includes(status)) return "bg-accent text-accent-foreground";
  return "bg-accent-soft text-accent-foreground";
}

export default function StaffDashboard() {
  const { cafe, assignment, loading: staffLoading } = useStaffCafe();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [presets, setPresets] = useState<number[]>([5, 10, 15, 20, 30]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const role = (assignment?.role ?? "") as "chef" | "runner" | "";

  useEffect(() => {
    if (!cafe) return;
    void (async () => {
      const { data } = await (supabase as any).from("cafes").select("eta_presets").eq("id", cafe.id).maybeSingle();
      if (data?.eta_presets?.length) setPresets(data.eta_presets);
    })();
  }, [cafe]);

  useEffect(() => {
    if (!cafe) return;
    let cancelled = false;
    setLoading(true);

    const fetchOrders = async () => {
      const { data } = await supabase.from("orders").select(SELECT).eq("cafe_id", cafe.id)
        .in("status", ["placed", "accepted", "preparing", "ready", "served"])
        .order("created_at", { ascending: false }).limit(150);
      if (!cancelled) setOrders(((data as unknown as OrderRow[]) ?? []).map((o) => ({ ...o, order_items: o.order_items ?? [] })));
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
    const { error } = await (supabase as any).rpc("advance_order_workflow", { _order_id: order.id, _next_status: next });
    if (error) toast.error(error.message); else toast.success(`Order → ${next}`);
  };
  const cancel = async (id: string) => {
    if (!confirm("Cancel this order?")) return;
    const { error } = await (supabase as any).rpc("cancel_order_by_staff", { _order_id: id });
    if (error) toast.error(error.message); else toast.success("Order cancelled");
  };

  if (staffLoading || loading) return <StaffLayout title="Orders"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></StaffLayout>;

  const title = role === "chef" ? "Kitchen display" : "Runner queue";
  const subtitle = `${cafe?.name ?? "Cafe"} · ${visible.length} active`;

  const renderOrder = (o: OrderRow) => (
    <Card key={o.id} className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">{o.customer_name}</p>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">via {o.source}</span>
            {o.table_no && <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">Table {o.table_no}</span>}
            {o.payment_status === "paid" && <span className="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full font-semibold">PAID</span>}
            {o.payment_status === "pending" && <span className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold">UNPAID</span>}
            <EtaBadge minutes={(o as any).wait_eta_minutes} etaUpdatedAt={(o as any).eta_updated_at} status={o.status} />
          </div>
          <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleTimeString()} · #{o.id.slice(0, 6)}</p>
          {o.notes && <p className="text-xs text-muted-foreground mt-1">📝 {o.notes}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <p className="text-sm font-bold">₹{Number(o.total_amount).toFixed(2)}</p>
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
              <EtaPicker orderId={o.id} presets={presets} currentMinutes={(o as any).wait_eta_minutes ?? undefined} />
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
            {o.status === "ready" && (
              <Button variant="hero" size="sm" onClick={() => advance(o, "served")}><Users className="w-3 h-3 mr-1" /> Serve</Button>
            )}
            {o.status === "served" && o.payment_status !== "paid" && cafe && (
              <PayWithUpiButton
                orderId={o.id}
                cafeId={cafe.id}
                cafeName={cafe.name}
                customerName={o.customer_name}
                customerPhone={o.customer_phone}
                amount={Number(o.total_amount)}
                size="sm"
                runnerMode
                onPaid={() => advance(o, "completed")}
              />
            )}
            {o.status === "served" && o.payment_status === "paid" && (
              <Button variant="hero" size="sm" onClick={() => advance(o, "completed")}><ClipboardCheck className="w-3 h-3 mr-1" /> Complete</Button>
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
      : o.status === "ready" ? "ready"
      : "served";
    (groups[key] ??= []).push(o);
  }

  const labels: Record<string, string> = {
    new: "New orders", accepted: "Sent to kitchen", preparing: "In the kitchen",
    ready: "Ready for pickup", served: "Awaiting payment",
  };
  const order = role === "chef"
    ? (["accepted", "preparing"] as const)
    : (["new", "ready", "served"] as const);

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
    </StaffLayout>
  );
}
