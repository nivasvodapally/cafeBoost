import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingBag, Users, IndianRupee, ArrowRight, TrendingUp, Clock } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { format, subDays } from "date-fns";

type Range = "7d" | "30d" | "90d";
type Analytics = {
  kpis: { orders: number; paid_orders: number; pending_orders: number; revenue: number; avg_ticket: number; new_customers: number };
  series: { date: string; orders: number; revenue: number }[];
  top_items: { name: string; qty: number; revenue: number }[];
};

export default function Dashboard() {
  const { cafe, loading } = useOwnerCafe();
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<Analytics | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const navigate = useNavigate();
  const currency = cafe?.currency ?? "INR";

  useEffect(() => { document.title = "Dashboard — CafeBoost"; }, []);
  useEffect(() => {
    if (!loading && !cafe) navigate("/owner-setup", { replace: true });
  }, [cafe, loading, navigate]);

  const { startDate, endDate } = useMemo(() => {
    const days = range === "7d" ? 6 : range === "30d" ? 29 : 89;
    const end = new Date();
    return { startDate: format(subDays(end, days), "yyyy-MM-dd"), endDate: format(end, "yyyy-MM-dd") };
  }, [range]);

  useEffect(() => {
    if (!cafe) return;
    setLoadingStats(true);
    void supabase.rpc("get_owner_analytics", { _cafe_id: cafe.id, _start: startDate, _end: endDate })
      .then(({ data: d, error }) => {
        if (!error && d) setData(d as Analytics);
        setLoadingStats(false);
      });
  }, [cafe, startDate, endDate]);

  const fmtCurrency = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(n) || 0);

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const k = data?.kpis;
  const tiles = [
    { label: "Revenue", value: fmtCurrency(k?.revenue ?? 0), hint: `${range} · paid only`, icon: IndianRupee, to: "/owner/orders" },
    { label: "Orders", value: k?.orders ?? 0, hint: `${k?.pending_orders ?? 0} pending payment`, icon: ShoppingBag, to: "/owner/orders" },
    { label: "Avg ticket", value: fmtCurrency(k?.avg_ticket ?? 0), hint: "On paid orders", icon: TrendingUp, to: "/owner/orders" },
    { label: "New customers", value: k?.new_customers ?? 0, hint: range, icon: Users, to: "/owner/customers" },
  ];
  const chartData = (data?.series ?? []).map(s => ({ ...s, label: format(new Date(s.date), "MMM d") }));

  return (
    <OwnerLayout title={`Welcome back${cafe?.name ? `, ${cafe.name}` : ""}`} subtitle="Here's what's happening across your cafe.">
      <div className="flex items-center gap-2 mb-5">
        {(["7d","30d","90d"] as Range[]).map(r => (
          <button
            key={r} type="button" onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-smooth ${range === r ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
          >Last {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "90 days"}</button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map(t => (
          <Link key={t.label} to={t.to}>
            <Card className="p-6 hover:shadow-elegant hover:-translate-y-1 transition-smooth h-full border-border/60">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-2xl bg-accent-soft grid place-items-center">
                  <t.icon className="w-5 h-5 text-accent-foreground" />
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-5">{t.label}</p>
              <p className="font-display text-3xl font-bold mt-1 tracking-tight">
                {loadingStats ? <span className="inline-block w-16 h-7 bg-muted/60 rounded animate-pulse" /> : t.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{t.hint}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-bold">Revenue & orders</h2>
          <span className="text-xs text-muted-foreground">{startDate} → {endDate}</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, key) => key === "revenue" ? fmtCurrency(v) : v}
              />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--accent))" fill="url(#rev)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <Card className="p-6 lg:col-span-2">
          <h2 className="font-display text-base font-bold flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Top selling items</h2>
          {(data?.top_items ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground mt-4">No sales in this period yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {data!.top_items.map(t => (
                <div key={t.name} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-muted-foreground">{t.qty} sold · {fmtCurrency(Number(t.revenue))}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="font-display text-base font-bold">Quick actions</h2>
          <div className="mt-4 space-y-2">
            <Link to="/owner/orders"><Button variant="outline" className="w-full justify-start">Manage orders</Button></Link>
            <Link to="/owner/menu"><Button variant="outline" className="w-full justify-start">Edit menu</Button></Link>
            <Link to="/owner/qr"><Button variant="outline" className="w-full justify-start">Get cafe QR</Button></Link>
            <Link to="/owner/loyalty"><Button variant="outline" className="w-full justify-start">Rewards & redemptions</Button></Link>
          </div>
        </Card>
      </div>
    </OwnerLayout>
  );
}
