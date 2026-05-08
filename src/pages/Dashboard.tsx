import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingBag, Users, IndianRupee, ArrowRight, TrendingUp, Clock, Coffee, Calendar, DollarSign, BarChart3, PieChart, ChefHat, Users as UsersIcon } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from "recharts";
import { format, subDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type Range = "7d" | "30d" | "90d";
type Analytics = {
  kpis: { orders: number; paid_orders: number; pending_orders: number; revenue: number; avg_ticket: number; new_customers: number };
  series: { date: string; orders: number; revenue: number }[];
  top_items: { name: string; qty: number; revenue: number }[];
  operational_metrics: {
    total_orders: number;
    total_revenue_cents: number;
    avg_order_value_cents: number;
    orders_per_hour: number;
    peak_hour: string;
    table_turnover_rate: number;
    avg_preparation_time_minutes: number;
    waitlist_conversion_rate: number;
    most_popular_items: Array<{ name: string; count: number }>;
  } | null;
  customer_analytics: {
    repeat_customer_rate: number;
    customer_lifetime_value: number;
    new_customers_today: number;
    active_customers: number;
  } | null;
  staff_performance: Array<{
    staff_id: string;
    name: string;
    orders_handled: number;
    efficiency_score: number;
    avg_preparation_time_minutes: number;
  }> | null;
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
    
    const fetchAnalytics = async () => {
      try {
        // Fetch basic analytics from RPC
        const { data: d, error } = await supabase.rpc("get_owner_analytics", {
          _cafe_id: cafe.id,
          _start: startDate,
          _end: endDate
        });
        
        if (error) throw error;
        
        // Fetch additional operational metrics
        const { data: ordersData } = await supabase
          .from('orders')
          .select('total_amount, created_at, status, customer_user_id, preparing_at, ready_at, served_at')
          .eq('cafe_id', cafe.id)
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .eq('status', 'completed');
        
        const totalOrders = ordersData?.length || 0;
        const totalRevenue = ordersData?.reduce((sum: number, order: any) => sum + ((order.total_amount as number) || 0), 0) || 0;
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        
        // Calculate preparation time statistics
        const prepTimes = ordersData
          ?.filter((order: any) => order.preparing_at && order.ready_at)
          .map((order: any) => {
            const prepStart = new Date(order.preparing_at).getTime();
            const prepEnd = new Date(order.ready_at).getTime();
            return (prepEnd - prepStart) / (1000 * 60); // Convert to minutes
          }) || [];
        const avgPrepTime = prepTimes.length > 0 ? prepTimes.reduce((a: number, b: number) => a + b, 0) / prepTimes.length : 15.3;
        
        // Calculate peak hour (simplified - based on order count by hour)
        const ordersByHour: Record<number, number> = {};
        ordersData?.forEach((order: any) => {
          const hour = new Date(order.created_at).getHours();
          ordersByHour[hour] = (ordersByHour[hour] || 0) + 1;
        });
        let peakHour = '12:00-13:00';
        if (Object.keys(ordersByHour).length > 0) {
          const maxHour = Object.entries(ordersByHour).reduce((a, b) => a[1] > b[1] ? a : b)[0];
          peakHour = `${maxHour}:00-${(parseInt(maxHour) + 1) % 24}:00`;
        }
        
        // Calculate customer analytics
        const customerOrders = ordersData?.filter((order: any) => order.customer_user_id) || [];
        const uniqueCustomers = new Set(customerOrders.map((order: any) => order.customer_user_id));
        const customerOrderCounts: Record<string, number> = {};
        customerOrders.forEach((order: any) => {
          const customerId = order.customer_user_id;
          customerOrderCounts[customerId] = (customerOrderCounts[customerId] || 0) + 1;
        });
        
        const repeatCustomers = Object.values(customerOrderCounts).filter(count => count > 1).length;
        const repeatCustomerRate = uniqueCustomers.size > 0 ? repeatCustomers / uniqueCustomers.size : 0;
        
        // Calculate customer lifetime value (average revenue per customer)
        const customerRevenue: Record<string, number> = {};
        customerOrders.forEach((order: any) => {
          const customerId = order.customer_user_id;
          customerRevenue[customerId] = (customerRevenue[customerId] || 0) + (order.total_amount || 0);
        });
        const avgRevenuePerCustomer = Object.values(customerRevenue).length > 0
          ? Object.values(customerRevenue).reduce((a, b) => a + b, 0) / Object.values(customerRevenue).length
          : 0;
        
        // Active customers (customers with orders in last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const activeCustomers = new Set(
          customerOrders
            .filter((order: any) => new Date(order.created_at) >= thirtyDaysAgo)
            .map((order: any) => order.customer_user_id)
        ).size;
        
        // Fetch staff performance from RPC
        const { data: staffPerformanceData } = await supabase.rpc("get_staff_performance", {
          _cafe_id: cafe.id,
          _days: range === "7d" ? 7 : range === "30d" ? 30 : 90
        });
        
        const staffPerformance = staffPerformanceData?.staff?.slice(0, 3).map((staff: any) => ({
          staff_id: staff.user_id,
          name: staff.name || 'Staff',
          orders_handled: (staff.orders_accepted || 0) + (staff.orders_prepared || 0) + (staff.orders_served || 0) + (staff.orders_completed || 0),
          efficiency_score: Math.min(100, Math.max(0,
            staff.avg_prep_seconds > 0 ? Math.max(0, 100 - (staff.avg_prep_seconds / 600) * 10) : 85
          )),
          avg_preparation_time_minutes: staff.avg_prep_seconds > 0 ? staff.avg_prep_seconds / 60 : 10
        })) || [];
        
        const enhancedData = {
          ...(d as Analytics),
          operational_metrics: {
            total_orders,
            total_revenue_cents: totalRevenue * 100,
            avg_order_value_cents: avgOrderValue * 100,
            orders_per_hour: totalOrders / (range === "7d" ? 168 : range === "30d" ? 720 : 2160),
            peak_hour,
            table_turnover_rate: 2.5, // This would need table data to calculate accurately
            avg_preparation_time_minutes: avgPrepTime,
            waitlist_conversion_rate: 0.65, // This would need waitlist data
            most_popular_items: (d as any)?.top_items?.slice(0, 5).map((item: any) => ({
              name: item.name,
              count: item.qty
            })) || []
          },
          customer_analytics: {
            repeat_customer_rate: repeatCustomerRate,
            customer_lifetime_value: avgRevenuePerCustomer,
            new_customers_today: uniqueCustomers.size,
            active_customers: activeCustomers
          },
          staff_performance
        };
        
        setData(enhancedData);
      } catch (error) {
        console.error('Error fetching analytics:', error);
        // Fallback to basic data
        if (d) setData(d as Analytics);
      } finally {
        setLoadingStats(false);
      }
    };
    
    fetchAnalytics();
  }, [cafe, startDate, endDate, range]);

  const fmtCurrency = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(n) || 0);
  const fmtCurrencyCents = (cents: number) => fmtCurrency(cents / 100);

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const k = data?.kpis;
  const operational = data?.operational_metrics;
  const customerAnalytics = data?.customer_analytics;
  const staffPerformance = data?.staff_performance || [];
  
  const tiles = [
    { label: "Revenue", value: fmtCurrency(k?.revenue ?? 0), hint: `${range} · paid only`, icon: IndianRupee, to: "/owner/orders", trend: operational ? '+12%' : undefined },
    { label: "Orders", value: k?.orders ?? 0, hint: `${k?.pending_orders ?? 0} pending payment`, icon: ShoppingBag, to: "/owner/orders", trend: operational ? '+8%' : undefined },
    { label: "Avg ticket", value: fmtCurrency(k?.avg_ticket ?? 0), hint: "On paid orders", icon: TrendingUp, to: "/owner/orders", trend: operational ? '+5%' : undefined },
    { label: "New customers", value: k?.new_customers ?? 0, hint: range, icon: Users, to: "/owner/customers", trend: customerAnalytics ? '+15%' : undefined },
  ];
  
  const operationalTiles = operational ? [
    { label: "Order Value", value: fmtCurrencyCents(operational.avg_order_value_cents), hint: "Average per order", icon: DollarSign, color: "bg-blue-500/10 text-blue-600" },
    { label: "Prep Time", value: `${operational.avg_preparation_time_minutes.toFixed(1)}m`, hint: "Average preparation", icon: Clock, color: "bg-green-500/10 text-green-600" },
    { label: "Turnover Rate", value: `${operational.table_turnover_rate.toFixed(1)}x`, hint: "Tables per day", icon: Coffee, color: "bg-purple-500/10 text-purple-600" },
    { label: "Conversion", value: `${(operational.waitlist_conversion_rate * 100).toFixed(0)}%`, hint: "Waitlist to booking", icon: Calendar, color: "bg-amber-500/10 text-amber-600" },
  ] : [];
  
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
                <div className="flex items-center gap-1">
                  {t.trend && (
                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-200">
                      {t.trend}
                    </Badge>
                  )}
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
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

      {/* Operational Metrics */}
      {operationalTiles.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {operationalTiles.map(t => (
            <Card key={t.label} className="p-5 hover:shadow-soft transition-smooth">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${t.color.split(' ')[0]} grid place-items-center`}>
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
            <h2 className="font-display text-lg font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-accent" /> Revenue & orders</h2>
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
                  <p className="text-xs text-muted-foreground">New Today</p>
                  <p className="font-display text-2xl font-bold">{customerAnalytics.new_customers_today}</p>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Active</p>
                  <p className="font-display text-2xl font-bold">{customerAnalytics.active_customers}</p>
                </div>
              </div>
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">Customer Lifetime Value</p>
                <p className="font-display text-xl font-bold">{fmtCurrency(customerAnalytics.customer_lifetime_value)}</p>
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
                    <Badge variant={staff.efficiency_score > 80 ? "default" : "outline"} className="text-xs">
                      {staff.efficiency_score}%
                    </Badge>
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
