import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Printer, ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type Order = {
  id: string; created_at: string; paid_at: string | null;
  customer_name: string; customer_phone: string | null;
  status: string; payment_status: string; payment_method: string | null;
  source: string; table_no: string | null;
  subtotal: number; tax_amount: number; total_amount: number;
  earned_points: number; notes: string | null; cafe_id: string;
  invoice_number: string | null; discount_amount: number;
};
type Item = { id: string; name: string; price: number; quantity: number };
type Cafe = { name: string; address: string | null; city: string | null; phone: string | null; email: string | null; currency: string | null; tax_rate: number | null; gstin: string | null; };

export default function CustomerInvoice() {
  const { id } = useParams();

  useEffect(() => { document.title = "Invoice — CafeBoost"; }, []);

  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      if (!id) return null;
      const { data: o } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
      if (!o) return null;
      const [{ data: oi }, { data: c }] = await Promise.all([
        supabase.from("order_items").select("id, name, price, quantity").eq("order_id", id),
        supabase.from("cafes").select("name, address, city, phone, email, currency, tax_rate, gstin").eq("id", o.cafe_id).maybeSingle(),
      ]);
      return {
        order: o as Order,
        items: (oi as Item[]) ?? [],
        cafe: (c as Cafe) ?? null,
      };
    },
    enabled: !!id,
  });

  const order = invoiceData?.order ?? null;
  const items = invoiceData?.items ?? [];
  const cafe = invoiceData?.cafe ?? null;

  if (isLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!order) return <div className="min-h-screen grid place-items-center text-muted-foreground">Invoice not found.</div>;

  if (order.payment_status !== "paid") {
    return (
      <div className="min-h-screen grid place-items-center text-center px-4">
        <div>
          <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-display text-xl font-bold">Invoice not available yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Your invoice will be available here once payment is confirmed.
          </p>
          <Link to="/app/orders">
            <Button variant="outline" className="mt-6">Back to orders</Button>
          </Link>
        </div>
      </div>
    );
  }

  /* ── Print styles injected inline for a crisp, clean print layout ── */
  const printStyles = `
@media print {
  @page { margin: 12mm 10mm; }
  html, body {
    background: #fff !important;
    color: #000 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /* Hide everything outside the invoice card */
  body > *:not(#invoice-print-area),
  nav, header, footer, .sidebar,
  button:not(#print-trigger), .btn, a[class*="Button"] {
    display: none !important;
  }
  #invoice-print-area {
    display: block !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    box-shadow: none !important;
    border: none !important;
  }
  #invoice-card {
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
  }
  /* Typography — ensure black text on white, keep print-friendly colours */
  #invoice-card * {
    color: #000 !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
  /* Keep background colours for badges and accent elements */
  #invoice-card [class*="bg-success"],
  #invoice-card [class*="bg-accent-soft"] {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /* Table borders */
  #invoice-card table th,
  #invoice-card table td,
  #invoice-card [class*="border"] {
    border-color: #ccc !important;
  }
  /* Page-break safety */
  #invoice-card table,
  #invoice-card tbody tr,
  #invoice-card footer {
    page-break-inside: avoid;
  }
  /* Links — no underline decoration on print */
  #invoice-card a {
    text-decoration: none !important;
  }
}
`;

  const currency = cafe?.currency ?? "INR";
  const fmt = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(n) || 0);
  const isPaid = order.payment_status === "paid";

  // Sanity check — tax can never exceed subtotal
  const safeTaxAmount = Math.min(Number(order.tax_amount), Number(order.subtotal));
  const computedTotal = Number(order.subtotal) + safeTaxAmount - Number(order.discount_amount || 0);
  // Use order.total_amount but sanity check it matches computed
  const displayTotal = Math.abs(Number(order.total_amount) - computedTotal) < 1
    ? Number(order.total_amount)  // DB value is correct, use it
    : computedTotal;               // DB value is wrong, use computed

  return (
    <>
      <style>{printStyles}</style>
      <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0" id="invoice-print-area">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link to="/app/orders"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back to orders</Button></Link>
          <Button variant="hero" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Print invoice</Button>
        </div>

        <Card className="p-8 print:shadow-none print:border-0" id="invoice-card">
          <header className="flex items-start justify-between gap-4 pb-6 border-b border-border">
            <div>
              <h1 className="font-display text-2xl font-bold">{cafe?.name ?? "Cafe"}</h1>
              {cafe?.address && <p className="text-xs text-muted-foreground mt-1">{cafe.address}{cafe.city ? `, ${cafe.city}` : ""}</p>}
              {cafe?.phone && <p className="text-xs text-muted-foreground">📞 {cafe.phone}</p>}
              {cafe?.gstin && <p className="text-xs text-muted-foreground">GSTIN: {cafe.gstin}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {cafe?.gstin ? "Tax Invoice" : "Receipt"}
              </p>
              <p className="font-mono text-sm font-bold">
                {order.invoice_number ?? `#${order.id.slice(0, 8).toUpperCase()}`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{new Date(order.created_at).toLocaleString()}</p>
              <span className={`inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold mt-2 px-2 py-1 rounded-full ${isPaid ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
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
              {cafe?.gstin && (
                <p className="text-xs text-muted-foreground">
                  SAC Code: <span className="text-foreground">996331</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">Status: <span className="text-foreground">{order.status}</span></p>
              <p className="text-xs text-muted-foreground">
                Payment: <span className="text-foreground capitalize">
                  {order.payment_method === "upi" ? "UPI" : order.payment_method === "cash" ? "Cash" : "Pending"}
                </span>
              </p>
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
            {safeTaxAmount > 0 && (
              cafe?.gstin && cafe?.tax_rate ? (
                /* GST registered cafe — show proper CGST + SGST split */
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      CGST @ {((cafe.tax_rate) / 2).toFixed(1)}%
                    </span>
                    <span>{fmt(safeTaxAmount / 2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      SGST @ {((cafe.tax_rate) / 2).toFixed(1)}%
                    </span>
                    <span>{fmt(safeTaxAmount / 2)}</span>
                  </div>
                </>
              ) : (
                /* Non-GST cafe — just show as taxes & charges */
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Taxes & charges</span>
                  <span>{fmt(safeTaxAmount)}</span>
                </div>
              )
            )}
            {Number(order.discount_amount) > 0 && (
              <div className="flex justify-between text-xs text-success">
                <span>Discount</span>
                <span>− {fmt(Number(order.discount_amount))}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-2 border-t border-border mt-2"><span>Total</span><span>{fmt(displayTotal)}</span></div>
            {cafe?.gstin && (
              <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                GSTIN: {cafe.gstin}
              </p>
            )}
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
  </>
  );
}
