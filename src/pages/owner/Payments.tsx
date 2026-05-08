import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Download, RefreshCcw, Wallet, TrendingUp, Receipt, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";

type Range = "today" | "week" | "month";
type Kpis = {
  gross_revenue: number; refunded: number; net_revenue: number;
  paid_orders: number; pending_orders: number; refund_count: number; avg_ticket: number;
};
type SeriesPoint = { date: string; revenue: number; orders: number };
type Method = { method: string; amount: number; count: number };
type PendingRow = { id: string; customer_name: string; total_amount: number; created_at: string; source: string; table_no: string | null };
type RefundRow = { id: string; customer_name: string; total_amount: number; refunded_amount: number; refunded_at: string; refund_id: string };
type Dashboard = { kpis: Kpis; series: SeriesPoint[]; by_method: Method[]; pending: PendingRow[]; refunds: RefundRow[] };

function rangeDates(r: Range): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (r === "today") start.setHours(0, 0, 0, 0);
  if (r === "week") start.setDate(end.getDate() - 6);
  if (r === "month") start.setDate(end.getDate() - 29);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export default function OwnerPayments() {
  const { cafe, loading: cafeLoading } = useOwnerCafe();
  const [range, setRange] = useState<Range>("week");
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const cur = "₹";

  const load = useCallback(async () => {
    if (!cafe) return;
    setLoading(true);
    const { start, end } = rangeDates(range);
    const { data: res, error } = await supabase.rpc("get_payments_dashboard", { _cafe_id: cafe.id, _start: start, _end: end });
    if (error) toast.error(error.message);
    else setData(res as Dashboard);
    setLoading(false);
  }, [cafe, range]);

  useEffect(() => { void load(); }, [load]);

  const maxRevenue = useMemo(() => Math.max(1, ...(data?.series ?? []).map((s) => Number(s.revenue))), [data]);

  const refund = async (orderId: string) => {
    if (!confirm("Refund this order via Razorpay? Loyalty points earned on it will be reversed.")) return;
    setRefundingId(orderId);
    try {
      const { error } = await supabase.functions.invoke("razorpay-refund", { body: { order_id: orderId } });
      if (error) throw error;
      toast.success("Refund initiated");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefundingId(null);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ["Date", "Orders", "Revenue"],
      ...data.series.map((s) => [s.date, s.orders, s.revenue]),
      [],
      ["Method", "Amount", "Count"],
      ...data.by_method.map((m) => [m.method, m.amount, m.count]),
      [],
      ["KPIs"],
      ["Gross revenue", data.kpis.gross_revenue],
      ["Refunded", data.kpis.refunded],
      ["Net revenue", data.kpis.net_revenue],
      ["Paid orders", data.kpis.paid_orders],
      ["Pending orders", data.kpis.pending_orders],
      ["Avg ticket", Number(data.kpis.avg_ticket).toFixed(2)],
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `payments-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Settlement CSV downloaded");
  };

  if (cafeLoading || loading || !data) {
    return <OwnerLayout title="Payments"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></OwnerLayout>;
  }

  return (
    <OwnerLayout
      title="Payments"
      subtitle="Revenue, UPI captures, refunds & settlements"
      action={
        <div className="flex items-center gap-2">
          <select value={range} onChange={(e) => setRange(e.target.value as Range)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="today">Today</option>
            <option value="week">7 days</option>
            <option value="month">30 days</option>
          </select>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> CSV</Button>
        </div>
      }
    >
      {/* KPI strip */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <Wallet className="w-4 h-4 text-muted-foreground mb-1" />
          <p className="text-2xl font-display font-bold">{cur} {Number(data.kpis.gross_revenue).toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">Gross revenue</p>
        </Card>
        <Card className="p-4">
          <TrendingUp className="w-4 h-4 text-muted-foreground mb-1" />
          <p className="text-2xl font-display font-bold">{cur} {Number(data.kpis.net_revenue).toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">Net (after refunds)</p>
        </Card>
        <Card className="p-4">
          <Receipt className="w-4 h-4 text-muted-foreground mb-1" />
          <p className="text-2xl font-display font-bold">{data.kpis.paid_orders}</p>
          <p className="text-xs text-muted-foreground">Paid orders · avg {cur} {Number(data.kpis.avg_ticket).toFixed(0)}</p>
        </Card>
        <Card className="p-4">
          <AlertCircle className="w-4 h-4 text-muted-foreground mb-1" />
          <p className="text-2xl font-display font-bold">{data.kpis.pending_orders}</p>
          <p className="text-xs text-muted-foreground">Awaiting payment</p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-display text-xl font-bold mb-4">Revenue trend</h2>
          <div className="flex items-end gap-1.5 h-48">
            {data.series.map((s) => {
              const h = Math.max(2, (Number(s.revenue) / maxRevenue) * 100);
              return (
                <div key={s.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${s.date} · ${cur} ${Number(s.revenue).toFixed(0)} · ${s.orders} orders`}>
                  <div className="w-full bg-accent/30 group-hover:bg-accent transition-smooth rounded-t" style={{ height: `${h}%` }} />
                  <span className="text-xs text-muted-foreground">{s.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Method split */}
        <Card className="p-5">
          <h2 className="font-display text-xl font-bold mb-4">Payment methods</h2>
          {data.by_method.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet in this range.</p>
          ) : (
            <div className="space-y-3">
              {data.by_method.map((m) => {
                const pct = data.kpis.gross_revenue > 0 ? (Number(m.amount) / Number(data.kpis.gross_revenue)) * 100 : 0;
                return (
                  <div key={m.method}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize font-semibold">{m.method || "manual"}</span>
                      <span className="text-muted-foreground">{cur} {Number(m.amount).toFixed(0)} · {m.count}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        {/* Pending */}
        <Card className="p-5">
          <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Pending UPI / unpaid orders</h2>
          {data.pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">All orders are settled. 🎉</p>
          ) : (
            <div className="space-y-2">
              {data.pending.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{p.customer_name} <span className="text-xs text-muted-foreground">· #{p.id.slice(0, 6)}</span></p>
                    <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()} · {p.source}{p.table_no ? ` · Table ${p.table_no}` : ""}</p>
                  </div>
                  <p className="text-sm font-bold">{cur} {Number(p.total_amount).toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Refunds */}
        <Card className="p-5">
          <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2"><RefreshCcw className="w-5 h-5" /> Recent refunds</h2>
          {data.refunds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No refunds in this range.</p>
          ) : (
            <div className="space-y-2">
              {data.refunds.map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-3">
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{r.customer_name}</p>
                    <p className="text-sm font-bold text-destructive">- {cur} {Number(r.refunded_amount).toFixed(2)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(r.refunded_at).toLocaleString()} · {r.refund_id?.slice(0, 16)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Refund actions on paid orders */}
      <Card className="p-5 mt-6">
        <h2 className="font-display text-xl font-bold mb-3">Issue a refund</h2>
        <p className="text-sm text-muted-foreground mb-4">Search recent paid orders in the Orders page, or paste an order ID below.</p>
        <RefundByIdForm onRefund={refund} loading={refundingId} />
      </Card>
    </OwnerLayout>
  );
}

function RefundByIdForm({ onRefund, loading }: { onRefund: (id: string) => void; loading: string | null }) {
  const [id, setId] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (id.trim()) onRefund(id.trim()); }}
      className="flex gap-2 max-w-xl"
    >
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="Order ID (UUID)"
        className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm font-mono"
      />
      <Button type="submit" variant="outline" disabled={!!loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-1" />}
        Refund
      </Button>
    </form>
  );
}
