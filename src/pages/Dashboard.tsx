import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IndianRupee, ShoppingBag, TrendingUp, Users, ArrowRight, Clock, Coffee, Calendar, BarChart3, Users as UsersIcon, ChefHat, Loader2 } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { format, subDays } from "date-fns";
import { Progress } from "@/components/ui/progress";

type Range = "7d" | "30d" | "90d";

type SeriesEntry = { date: string; orders: number; revenue: number };
type TopItem = { name: string; qty: number; revenue: number };

type DashboardData = {
  kpis: {
    orders: number;
    paid_orders: number;
    pending_orders: number;
    revenue: number;
    avg_ticket: number;
    new_customers: number;
  };
  series: SeriesEntry[];
  top_items: TopItem[];
  operational_metrics: {
    orders_per_hour: number;
    peak_hour: string;
    table_turnover_rate: number;
    avg_preparation_time_minutes: number;
    waitlist_conversion_rate: number;
    most_popular_items: Array<{ name: string; count: number }>;
  } | null;
  customer_analytics: {
    repeat_customer_rate: number;
    new_customers_today: number;
    active_customers: number;
  } | null;
  staff_performance: Array<{
    staff_id: string;
    name: string;
    orders_handled: number;
    efficiency_score: number;
    avg_preparation_time_minutes: number;
  }>;
};

export default function Dashboard() {
  const { cafe, loading } = useOwnerCafe();
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<DashboardData | null>(null);
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

  const daysInPeriod = range === "7d" ? 7 : range === "30d" ? 30 : 90;

  useEffect(() => {
    if (!cafe) return;
    setLoadingStats(true);

    const fetchAnalytics = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        console.log("[Dashboard] cafe:", cafe.id, "user:", sessionData?.session?.user?.id);

        // Use get_owner_analytics RPC — SECURITY DEFINER bypasses RLS on orders
        const { data: rpcData, error: rpcError } = await supabase.rpc("get_owner_analytics", {
          _cafe_id: cafe.id,
          _start: startDate,
          _end: endDate,
        });
        if (rpcError) {
          console.error("[Dashboard] get_owner_analytics error:", rpcError);
        } else {
          console.log("[Dashboard] analytics:", rpcData);
        }
        const kpis = rpcData?.kpis ?? {};
        const seriesFromRpc: SeriesEntry[] = (rpcData?.series ?? []).map((s: { date: string | number; orders?: number; revenue?: number }) => ({
          date: String(s.date).slice(0, 10),
          orders: s.orders ?? 0,
          revenue: s.revenue ?? 0,
        }));
        const topItems: TopItem[] = (rpcData?.top_items ?? []).map((t: { name: string; qty?: number; revenue?: number }) => ({
          name: t.name, qty: t.qty ?? 0, revenue: t.revenue ?? 0,
        }));

        // Pending orders count
        const pendingResult = await supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("cafe_id", cafe.id)
          .not("status", "in", "('completed','cancelled')");

        // Bookings for table turnover
        const bookingsResult = await supabase
          .from("bookings")
          .select("checked_in_at")
          .eq("cafe_id", cafe.id)
          .in("status", ["confirmed", "checked_in", "completed"]);
        const completedBookings = (bookingsResult.data ?? []).filter((b: { checked_in_at: string | null }) => b.checked_in_at).length;
        const tableTurnoverRate = daysInPeriod > 0 ? completedBookings / daysInPeriod : 0;

        const hoursInPeriod = range === "7d" ? 168 : range === "30d" ? 720 : 2160;

        setData({
          kpis: {
            orders: kpis.orders ?? 0,
            paid_orders: kpis.paid_orders ?? 0,
            pending_orders: pendingResult.count ?? 0,
            revenue: kpis.revenue ?? 0,
            avg_ticket: kpis.avg_ticket ?? 0,
            new_customers: kpis.new_customers ?? 0,
          },
          series: seriesFromRpc,
          top_items: topItems,
          operational_metrics: {
            orders_per_hour: (kpis.orders ?? 0) / hoursInPeriod,
            peak_hour: "12:00",
            table_turnover_rate: tableTurnoverRate,
            avg_preparation_time_minutes: 0,
            waitlist_conversion_rate: 0,
            most_popular_items: topItems.map(t => ({ name: t.name, count: t.qty })),
          },
          customer_analytics: {
            repeat_customer_rate: 0,
            new_customers_today: kpis.new_customers ?? 0,
            active_customers: 0,
          },
          staff_performance: [],
        });
      } catch (error) {
        console.error("[Dashboard] fetch error:", error);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchAnalytics();
  }, [cafe, startDate, endDate, range, daysInPeriod]);

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(n) || 0);

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const k = data?.kpis;
  const operational = data?.operational_metrics;
  const customerAnalytics = data?.customer_analytics;
  const staffPerformance = data?.staff_performance || [];

  const tiles = [
    { label: "Revenue", value: fmtCurrency(k?.revenue ?? 0), hint: `${range} · paid only`, icon: IndianRupee, to: "/owner/orders" },
    { label: "Orders", value: k?.orders ?? 0, hint: `${k?.pending_orders ?? 0} pending payment`, icon: ShoppingBag, to: "/owner/orders" },
    { label: "Avg ticket", value: fmtCurrency(k?.avg_ticket ?? 0), hint: "On paid orders", icon: TrendingUp, to: "/owner/orders" },
    { label: "New customers", value: k?.new_customers ?? 0, hint: range, icon: Users, to: "/owner/customers" },
  ];

  const operationalTiles = operational ? [
    { label: "Orders/hr", value: `${operational.orders_per_hour.toFixed(1)}x`, hint: "Rate", icon: TrendingUp, color: "bg-blue-500/10 text-blue-600" },
    { label: "Turnover", value: `${operational.table_turnover_rate.toFixed(1)}x`, hint: "Tables/day", icon: Coffee, color: "bg-purple-500/10 text-purple-600" },
  ] : [];

  const chartData = (data?.series ?? []).map((s: SeriesEntry) => ({ ...s, label: format(new Date(s.date), "MMM d") }));

  return (
    <OwnerLayout title={`Welcome back${cafe?.name ? `, ${cafe.name}` : ""}`} subtitle="Here's what's happening across your cafe.">
      <div className="flex items-center gap-2 mb-5">
        {(["7d", "30d", "90d"] as Range[]).map(r => (
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

      {operationalTiles.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {operationalTiles.map(t => (
            <Card key={t.label} className="p-5 hover:shadow-soft transition-smooth">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${t.color.split(" ")[0]} grid place-items-center`}>
                  <t.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.label}</p>
                  <p className="font-display text-2xl font-bold mt-1">{t.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.hint}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-accent" /> Revenue &amp; orders</h2>
            <span className="text-xs text-muted-foreground">{startDate} → {endDate}</span>
          </div>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No orders in this period yet.</p>
          ) : (
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
                    formatter={(v: number, key: string) => key === "revenue" ? fmtCurrency(v) : v}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--accent))" fill="url(#rev)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-base font-bold flex items-center gap-2"><UsersIcon className="w-4 h-4 text-accent" /> Customer Analytics</h2>
          {customerAnalytics ? (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Repeat Rate</span>
                  <span className="font-semibold">{(customerAnalytics.repeat_customer_rate * 100).toFixed(0)}%</span>
                </div>
                <Progress value={customerAnalytics.repeat_customer_rate * 100} className="h-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">New</p>
                  <p className="font-display text-2xl font-bold">{customerAnalytics.new_customers_today}</p>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Active</p>
                  <p className="font-display text-2xl font-bold">{customerAnalytics.active_customers}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4">No customer data available.</p>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <Card className="p-6 lg:col-span-2">
          <h2 className="font-display text-base font-bold flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Top selling items</h2>
          {(data?.top_items ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground mt-4">No sales in this period yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {data!.top_items.map((t: TopItem, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-muted-foreground">{t.qty} sold · {fmtCurrency(Number(t.revenue))}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-base font-bold flex items-center gap-2"><ChefHat className="w-4 h-4 text-accent" /> Staff Performance</h2>
          {staffPerformance.length > 0 ? (
            <div className="mt-4 space-y-3">
              {staffPerformance.map(staff => (
                <div key={staff.staff_id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{staff.name}</p>
                    <p className="text-xs text-muted-foreground">{staff.orders_handled} orders</p>
                  </div>
                  <div className="text-right">
                    <Progress value={staff.efficiency_score} className="h-2 w-16 mt-1" />
                    <p className="text-xs text-muted-foreground mt-1">{staff.avg_preparation_time_minutes.toFixed(0)}m avg</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4">No staff performance data.</p>
          )}
          <div className="mt-4 pt-4 border-t border-border">
            <Link to="/owner/staff">
              <Button variant="outline" className="w-full justify-start">View all staff</Button>
            </Link>
          </div>
        </Card>
      </div>

      <Card className="p-6 mt-6">
        <h2 className="font-display text-base font-bold">Quick actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Link to="/owner/orders"><Button variant="outline" className="w-full justify-start">Manage orders</Button></Link>
          <Link to="/owner/menu"><Button variant="outline" className="w-full justify-start">Edit menu</Button></Link>
          <Link to="/owner/qr"><Button variant="outline" className="w-full justify-start">Get cafe QR</Button></Link>
          <Link to="/owner/loyalty"><Button variant="outline" className="w-full justify-start">Rewards</Button></Link>
        </div>
      </Card>
    </OwnerLayout>
  );
}
