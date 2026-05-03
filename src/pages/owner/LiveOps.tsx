import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, AlertTriangle, X, ChefHat, CheckCircle2, Smartphone, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import { PaymentDialog } from "@/components/PaymentDialog";

type Order = { id: string; customer_name: string; table_no: string|null; source: string; status: string; payment_status: string;
  total_amount: number; created_at: string; age_seconds: number; stuck_reason: string|null;
  assignee_name: string|null; assignee_role: string|null; wait_eta_minutes: number|null };
type Staff = { user_id: string; role: string; name: string; on_shift: boolean; on_break: boolean; orders_today: number };
type Board = { orders: Order[]; staff: Staff[]; config: { stuck_unaccepted_minutes: number; stuck_kitchen_minutes: number; stuck_ready_minutes: number } };

const stagePill: Record<string, string> = {
  placed: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  accepted: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  preparing: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ready: "bg-green-500/15 text-green-700 dark:text-green-300",
  served: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

export default function OwnerLiveOps() {
  const { cafe, loading: cafeLoading } = useOwnerCafe();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [pay, setPay] = useState<Order | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    if (!cafe) return;
    const { data, error } = await (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Board | null; error: { message: string } | null }> })
      .rpc("get_live_ops_board", { _cafe_id: cafe.id });
    if (error) toast.error(error.message); else setBoard(data);
    setLoading(false);
  }, [cafe]);

  useEffect(() => {
    if (!cafe) return;
    void load();
    if (channelRef.current) void supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`live-ops:${cafe.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `cafe_id=eq.${cafe.id}` }, () => void load())
      .subscribe();
    channelRef.current = ch;
    const t = setInterval(() => void load(), 30_000);
    return () => { clearInterval(t); if (channelRef.current) void supabase.removeChannel(channelRef.current); };
  }, [cafe, load]);

  const advance = async (id: string, next: string) => {
    const { error } = await (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> })
      .rpc("advance_order_workflow", { _order_id: id, _next_status: next });
    if (error) toast.error(error.message); else toast.success(`→ ${next}`);
  };
  const cancel = async (id: string) => {
    if (!confirm("Cancel this order?")) return;
    const { error } = await (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> })
      .rpc("cancel_order_by_staff", { _order_id: id });
    if (error) toast.error(error.message); else toast.success("Cancelled");
  };

  if (cafeLoading || loading) return <OwnerLayout title="Live Ops"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></OwnerLayout>;

  const orders = board?.orders ?? [];
  const stuck = orders.filter(o => o.stuck_reason);

  return (
    <OwnerLayout title="Live Ops" subtitle={`${orders.length} active orders · ${board?.staff.filter(s => s.on_shift).length ?? 0} staff on shift`} action={
      <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
    }>
      {stuck.length > 0 && (
        <Card className="p-4 mb-4 border-destructive bg-destructive/5">
          <p className="font-semibold text-destructive flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {stuck.length} order{stuck.length > 1 ? "s" : ""} need attention</p>
        </Card>
      )}

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <div className="space-y-2">
          {orders.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">No active orders right now.</Card>
          ) : orders.map(o => (
            <Card key={o.id} className={`p-4 ${o.stuck_reason ? "border-destructive" : ""}`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${stagePill[o.status] ?? "bg-muted"}`}>{o.status}</span>
                    <p className="font-semibold">{o.customer_name}</p>
                    {o.table_no && <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">T{o.table_no}</span>}
                    {o.payment_status === "paid"
                      ? <span className="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full font-semibold">PAID</span>
                      : <span className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold">UNPAID</span>}
                    {o.stuck_reason && <span className="text-[10px] bg-destructive/15 text-destructive px-2 py-0.5 rounded-full font-bold">STUCK · {o.stuck_reason}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    #{o.id.slice(0,6).toUpperCase()} · {Math.floor(o.age_seconds/60)}m old · {o.assignee_name ? `→ ${o.assignee_name}` : "unassigned"}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <p className="font-bold">₹{Number(o.total_amount).toFixed(2)}</p>
                  {o.status === "placed" && <Button size="sm" variant="hero" onClick={() => void advance(o.id, "accepted")}><ClipboardCheck className="w-3 h-3 mr-1" /> Accept</Button>}
                  {o.status === "accepted" && <Button size="sm" variant="outline" onClick={() => void advance(o.id, "preparing")}><ChefHat className="w-3 h-3 mr-1" /> Force prep</Button>}
                  {o.status === "preparing" && <Button size="sm" variant="outline" onClick={() => void advance(o.id, "ready")}><CheckCircle2 className="w-3 h-3 mr-1" /> Mark ready</Button>}
                  {o.status === "ready" && <Button size="sm" variant="outline" onClick={() => void advance(o.id, "served")}>Serve</Button>}
                  {o.status === "served" && o.payment_status !== "paid" && cafe && (
                    <Button size="sm" variant="hero" onClick={() => setPay(o)}><Smartphone className="w-3 h-3 mr-1" /> Collect</Button>
                  )}
                  {o.status === "served" && o.payment_status === "paid" && <Button size="sm" variant="hero" onClick={() => void advance(o.id, "completed")}>Complete</Button>}
                  <Button size="sm" variant="ghost" onClick={() => void cancel(o.id)}><X className="w-3 h-3" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

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
      </div>

      {pay && cafe && (
        <PaymentDialog
          open={!!pay}
          onOpenChange={(v) => !v && setPay(null)}
          orderId={pay.id}
          cafeId={cafe.id}
          cafeName={cafe.name}
          amount={Number(pay.total_amount)}
          customerName={pay.customer_name}
          runnerMode
          onPaid={() => { setPay(null); void load(); }}
        />
      )}
    </OwnerLayout>
  );
}
