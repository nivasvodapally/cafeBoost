import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Printer, ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Order = {
  id: string; created_at: string; paid_at: string | null;
  customer_name: string; customer_phone: string | null;
  status: string; payment_status: string; source: string; table_no: string | null;
  subtotal: number; tax_amount: number; total_amount: number; earned_points: number; notes: string | null;
  cafe_id: string;
};
type Item = { id: string; name: string; price: number; quantity: number };
type Cafe = { name: string; address: string | null; city: string | null; phone: string | null; email: string | null; currency: string | null; tax_rate: number | null };

export default function CustomerInvoice() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = "Invoice — CafeBoost"; }, []);
  useEffect(() => {
    if (!id) return;
    void (async () => {
      const { data: o } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
      if (!o) { setLoading(false); return; }
      setOrder(o);
      const [{ data: oi }, { data: c }] = await Promise.all([
        supabase.from("order_items").select("id, name, price, quantity").eq("order_id", id),
        supabase.from("cafes").select("name, address, city, phone, email, currency, tax_rate").eq("id", o.cafe_id).maybeSingle(),
      ]);
      setItems((oi as Item[]) ?? []);
      setCafe((c as Cafe) ?? null);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!order) return <div className="min-h-screen grid place-items-center text-muted-foreground">Invoice not found.</div>;

  const currency = cafe?.currency ?? "INR";
  const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(n) || 0);
  const isPaid = order.payment_status === "paid";

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link to="/app/orders"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back to orders</Button></Link>
          <Button variant="hero" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Print invoice</Button>
        </div>

        <Card className="p-8 print:shadow-none print:border-0">
          <header className="flex items-start justify-between gap-4 pb-6 border-b border-border">
            <div>
              <h1 className="font-display text-2xl font-bold">{cafe?.name ?? "Cafe"}</h1>
              {cafe?.address && <p className="text-xs text-muted-foreground mt-1">{cafe.address}{cafe.city ? `, ${cafe.city}` : ""}</p>}
              {cafe?.phone && <p className="text-xs text-muted-foreground">📞 {cafe.phone}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Invoice</p>
              <p className="font-mono text-sm font-bold">#{order.id.slice(0, 8).toUpperCase()}</p>
              <p className="text-xs text-muted-foreground mt-1">{new Date(order.created_at).toLocaleString()}</p>
              <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold mt-2 px-2 py-1 rounded-full ${isPaid ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {order.payment_status}
              </span>
            </div>
          </header>

          <section className="grid sm:grid-cols-2 gap-6 py-6 border-b border-border text-sm">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Billed to</p>
              <p className="font-medium">{order.customer_name}</p>
              {order.customer_phone && <p className="text-muted-foreground text-xs">{order.customer_phone}</p>}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Order info</p>
              <p className="text-xs text-muted-foreground">Source: <span className="text-foreground">{order.source}</span></p>
              {order.table_no && <p className="text-xs text-muted-foreground">Table: <span className="text-foreground">{order.table_no}</span></p>}
              <p className="text-xs text-muted-foreground">Status: <span className="text-foreground">{order.status}</span></p>
              <p className="text-xs text-muted-foreground">Payment: <span className="text-foreground">Cash</span></p>
            </div>
          </section>

          <table className="w-full text-sm my-6">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left py-2 font-semibold">Item</th>
                <th className="text-center py-2 font-semibold w-16">Qty</th>
                <th className="text-right py-2 font-semibold w-24">Price</th>
                <th className="text-right py-2 font-semibold w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-t border-border">
                  <td className="py-2.5">{it.name}</td>
                  <td className="text-center py-2.5">{it.quantity}</td>
                  <td className="text-right py-2.5">{fmt(Number(it.price))}</td>
                  <td className="text-right py-2.5 font-medium">{fmt(Number(it.price) * it.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-auto w-full sm:w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(Number(order.subtotal))}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmt(Number(order.tax_amount))}</span></div>
            <div className="flex justify-between font-bold text-base pt-2 border-t border-border mt-2"><span>Total</span><span>{fmt(Number(order.total_amount))}</span></div>
            {order.earned_points > 0 && (
              <div className="flex justify-between text-xs text-accent-foreground bg-accent-soft px-2 py-1.5 rounded mt-3">
                <span>Loyalty points {isPaid ? "earned" : "pending"}</span><span className="font-bold">+{order.earned_points} pts</span>
              </div>
            )}
          </div>

          {order.notes && (
            <div className="mt-6 pt-4 border-t border-border text-xs">
              <p className="text-muted-foreground uppercase tracking-wider font-semibold mb-1">Notes</p>
              <p className="whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          <footer className="mt-8 pt-4 border-t border-border text-center text-[11px] text-muted-foreground">
            Thank you for visiting {cafe?.name ?? "us"} · Powered by CafeBoost
          </footer>
        </Card>
      </div>
    </div>
  );
}
