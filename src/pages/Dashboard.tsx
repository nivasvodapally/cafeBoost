import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IndianRupee, ShoppingBag, TrendingUp, Users, ArrowRight, Clock, Coffee, Calendar, BarChart3, ChefHat, Loader2, TrendingDown, Minus, DollarSign, Zap, Award } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, ComposedChart, Legend
} from "recharts";
import { format, subDays } from "date-fns";
import { Progress } from "@/components/ui/progress";

type Range = "7d" | "30d" | "90d";

type SeriesEntry = { date: string; orders: number; revenue: number };
type TopItem = { name: string; qty: number; revenue: number };
type StaffEntry = { role: string; staff_name: string; orders_handled: number; avg_prep_minutes: number };
type PeakSlot = { slot: string; hour: number; orders: number; revenue: number };
type DowEntry = { day: number; day_name: string; revenue: number; orders: number };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACCENT = "hsl(var(--accent))";
const MUTED = "hsl(var(--muted-foreground))";
const BORDER = "hsl(var(--border))";

const fmtCurrency = (n: number, currency = "INR") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(n) || 0);

function GrowthChip({ pct, label }: { pct: number; label?: string }) {
  if (pct === 0) return <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground"><Minus className="w-3 h-3" />{label ?? 'flat'}</span>;
  if (pct > 0) return <span className="flex items-center gap-1 text-xs font-bold text-success"><TrendingUp className="w-3 h-3" />+{pct}% {label ?? ''}</span>;
  return <span className="flex items-center gap-1 text-xs font-bold text-destructive"><TrendingDown className="w-3 h-3" />{pct}% {label ?? ''}</span>;
}

function KpiTile({ label, value, sub, icon: Icon, to, pending, growthPct }: {
  label: string; value: React.ReactNode; sub: string;
  icon: React.ElementType; to?: string; pending?: number; growthPct?: number;
}) {
  const inner = (
    <Card className="p-5 group hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-200 border-border/60 bg-gradient-to-br from-card to-muted/20 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full -translate-y-8 translate-x-8" />
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-accent/10 grid place-items-center shrink-0">
          <Icon className="w-5 h-5 text-accent" />
        </div>
        {growthPct !== undefined && <GrowthChip pct={growthPct} />}
        {!growthPct && to && <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />}
      </div>
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-4 mb-1">{label}</p>
      <div className="font-display text-2xl font-bold tracking-tight">{value}</div>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      {pending !== undefined && (
        <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
          <Zap className="w-3 h-3" />{pending} pending
        </div>
      )}
    </Card>
  );
  if (to) return <Link to={to}>{inner}</Link>;
  return inner;
}

// Custom tooltip for revenue chart
function RevTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-xl shadow-xl p-3 text-xs">
      <p className="font-bold mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="capitalize">{p.dataKey}:</span>
          <span className="font-bold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// Staff performance row with mini bar
function StaffRow({ s }: { s: StaffEntry }) {
  const maxOrders = 50;
  const barW = Math.min(100, (s.orders_handled / maxOrders) * 100);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent/10 grid place-items-center shrink-0">
            <span className="text-[10px] font-bold text-accent">{s.staff_name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{s.staff_name}</p>
            <p className="text-[11px] text-muted-foreground">{s.role} · {s.orders_handled} orders</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden hidden sm:block">
          <div className="h-full bg-accent rounded-full transition-all duration-700" style={{ width: `${barW}%` }} />
        </div>
        <div className="text-right min-w-[52px]">
          <p className="font-bold text-sm">{s.avg_prep_minutes > 0 ? `${s.avg_prep_minutes.toFixed(1)}m` : '—'}</p>
          <p className="text-[10px] text-muted-foreground">avg prep</p>
        </div>
      </div>
    </div>
  );
}

// Top item row with rank badge
function TopItemRow({ t, rank }: { t: TopItem; rank: number }) {
  const colors = ['text-amber-500', 'text-slate-400', 'text-orange-400', 'text-muted-foreground', 'text-muted-foreground'];
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`text-sm font-black w-5 text-center shrink-0 ${colors[rank - 1] ?? 'text-muted-foreground'}`}>#{rank}</span>
        <span className="font-medium text-sm truncate">{t.name}</span>
      </div>
      <div className="text-right shrink-0 ml-3">
        <span className="text-xs text-muted-foreground font-medium">{t.qty} sold</span>
      </div>
    </div>
  );
}

// Day of week label

export default function Dashboard() {
  const { cafe, loading } = useOwnerCafe();
  const [range, setRange] = useState<Range>("7d");
  const [loadingStats, setLoadingStats] = useState(true);
  const [rpcData, setRpcData] = useState<any>(null);
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
      const { data, error } = await supabase.rpc("get_owner_analytics", {
        _cafe_id: cafe.id,
        _start: startDate,
        _end: endDate,
      });
      if (error) { console.error("[Dashboard] analytics error:", error); }
      else { setRpcData(data); }
      setLoadingStats(false);
    };
    void fetchAnalytics();
  }, [cafe, startDate, endDate]);

  const k = rpcData?.kpis ?? {};
  const series: SeriesEntry[] = (rpcData?.series ?? []).map((s: any) => ({
    date: String(s.date).slice(0, 10),
    orders: s.orders ?? 0,
    revenue: s.revenue ?? 0,
  }));
  const topItems: TopItem[] = (rpcData?.top_items ?? []).map((t: any) => ({
    name: t.name, qty: t.qty ?? 0, revenue: t.revenue ?? 0,
  }));
  const staffPerf: StaffEntry[] = (rpcData?.staff_performance ?? []);
  const peakHours: PeakSlot[] = (rpcData?.peak_hours ?? []);
  const dowData: DowEntry[] = (rpcData?.dow_pattern ?? []).map((d: any) => ({
    ...d,
    day_name: DOW[d.day] ?? String(d.day),
  }));

  const avgPrep = Number(rpcData?.avg_prep_time_minutes ?? 0);
  const cancelRate = Number(rpcData?.cancellation_rate ?? 0);
  const ltv = Number(rpcData?.customer_ltv ?? 0);
  const weekGrowth = Number(rpcData?.week_growth ?? 0);

  // Pending orders
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!cafe) return;
    void supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("cafe_id", cafe.id)
      .not("status", "in", "('completed','cancelled')")
      .then(({ count }) => setPendingCount(count ?? 0));
  }, [cafe]);

  const chartData = series.map((s) => ({ ...s, label: format(new Date(s.date), range === "7d" ? "EEE" : "MMM d") }));

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <OwnerLayout title={`Welcome back${cafe?.name ? `, ${cafe.name}` : ""}`} subtitle="Here's what's happening across your cafe.">
      {/* Period selector */}
      <div className="flex items-center gap-2 mb-5">
        {(["7d", "30d", "90d"] as Range[]).map(r => (
          <button key={r} type="button" onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-smooth ${range === r ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
            Last {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "90 days"}
          </button>
        ))}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Revenue" value={loadingStats ? <span className="inline-block w-16 h-7 bg-muted/60 rounded animate-pulse" /> : fmtCurrency(k.revenue ?? 0, currency)} sub={`paid orders · ${range}`} icon={IndianRupee} to="/owner/orders" pending={k.pending_orders} />
        <KpiTile label="Orders" value={loadingStats ? <span className="inline-block w-10 h-7 bg-muted/60 rounded animate-pulse" /> : k.orders ?? 0} sub={`${k.pending_orders ?? 0} pending`} icon={ShoppingBag} to="/owner/orders" growthPct={weekGrowth} />
        <KpiTile label="Avg ticket" value={loadingStats ? <span className="inline-block w-16 h-7 bg-muted/60 rounded animate-pulse" /> : fmtCurrency(k.avg_ticket ?? 0, currency)} sub="vs last week" icon={TrendingUp} growthPct={weekGrowth} />
        <KpiTile label="New customers" value={loadingStats ? <span className="inline-block w-10 h-7 bg-muted/60 rounded animate-pulse" /> : k.new_customers ?? 0} sub={range} icon={Users} to="/owner/customers" />
      </div>

      {/* Revenue + Orders combo chart + Quick metrics */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card className="p-5 lg:col-span-2 border-border/60 bg-gradient-to-br from-card to-muted/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-accent" /> Revenue &amp; Orders</h2>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-accent rounded inline-block" />Revenue</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 rounded inline-block" />Orders</span>
            </div>
          </div>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No orders in this period yet.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={MUTED} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="revenue" orientation="left" tick={{ fontSize: 11 }} stroke={MUTED} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 11 }} stroke={MUTED} tickLine={false} axisLine={false} />
                  <Tooltip content={<RevTooltip />} />
                  <Area yAxisId="revenue" type="monotone" dataKey="revenue" stroke={ACCENT} fill="url(#revG)" strokeWidth={2.5} dot={false} />
                  <Line yAxisId="orders" type="monotone" dataKey="orders" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3, fill: '#f97316' }} activeDot={{ r: 5 }} strokeLinecap="round" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5 border-border/60 bg-gradient-to-br from-card to-muted/10">
          <h2 className="font-display text-sm font-bold mb-4">Quick metrics</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">Avg prep time</span>
                <span className="text-xs font-bold">{avgPrep > 0 ? `${avgPrep.toFixed(1)}m` : '—'}</span>
              </div>
              <Progress value={avgPrep > 0 ? Math.min(100, (avgPrep / 30) * 100) : 0} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">Cancellation rate</span>
                <span className="text-xs font-bold text-destructive">{cancelRate > 0 ? `${cancelRate}%` : '—'}</span>
              </div>
              <Progress value={cancelRate} className="h-2 [&>div]:bg-destructive" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">Customer LTV</span>
                <span className="text-xs font-bold">{ltv > 0 ? fmtCurrency(ltv, currency) : '—'}</span>
              </div>
              <Progress value={ltv > 0 ? Math.min(100, (ltv / 2000) * 100) : 0} className="h-2" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-2 gap-2">
            <div className="bg-accent/5 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Orders/day</p>
              <p className="text-base font-bold font-display mt-0.5">{chartData.length > 0 ? ((k.orders ?? 0) / chartData.length).toFixed(1) : '—'}</p>
            </div>
            <div className="bg-accent/5 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Revenue/day</p>
              <p className="text-base font-bold font-display mt-0.5">{chartData.length > 0 ? fmtCurrency((k.revenue ?? 0) / chartData.length, currency) : '—'}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Peak Hours + Day-of-week */}
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card className="p-5 border-border/60 bg-gradient-to-br from-card to-muted/10">
          <h2 className="font-display text-sm font-bold mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Peak hours</h2>
          {peakHours.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data for this period.</p>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={peakHours} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="barG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={1} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="slot" tick={{ fontSize: 9 }} stroke={MUTED} tickLine={false} axisLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} stroke={MUTED} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => v} />
                  <Bar dataKey="orders" fill="url(#barG)" radius={[6, 6, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5 border-border/60 bg-gradient-to-br from-card to-muted/10">
          <h2 className="font-display text-sm font-bold mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-accent" /> Revenue by day of week</h2>
          {dowData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data for this period.</p>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dowData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="dowG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={1} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day_name" tick={{ fontSize: 11 }} stroke={MUTED} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} stroke={MUTED} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => fmtCurrency(v, currency)} />
                  <Bar dataKey="revenue" fill="url(#dowG)" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Staff Performance + Top Items */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card className="p-5 lg:col-span-2 border-border/60 bg-gradient-to-br from-card to-muted/10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm font-bold flex items-center gap-2"><ChefHat className="w-4 h-4 text-accent" /> Staff Performance</h2>
            {staffPerf.length > 0 && (
              <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{staffPerf.length} active</span>
            )}
          </div>
          {staffPerf.length === 0 ? (
            <div className="py-6 text-center">
              <ChefHat className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No staff performance data for this period.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {staffPerf.map((s, i) => <StaffRow key={i} s={s} />)}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-border/50">
            <Link to="/owner/staff"><Button variant="outline" className="w-full justify-start text-xs h-8">View all staff →</Button></Link>
          </div>
        </Card>

        <Card className="p-5 border-border/60 bg-gradient-to-br from-card to-muted/10">
          <h2 className="font-display text-sm font-bold mb-3 flex items-center gap-2"><Award className="w-4 h-4 text-accent" /> Top selling items</h2>
          {topItems.length === 0 ? (
            <div className="py-6 text-center">
              <Coffee className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {topItems.map((t, i) => <TopItemRow key={i} t={t} rank={i + 1} />)}
            </div>
          )}
        </Card>
      </div>

      {/* Quick actions */}
      <Card className="p-5 mt-4 border-border/60">
        <h2 className="font-display text-sm font-bold mb-3">Quick actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Link to="/owner/orders"><Button variant="outline" className="w-full justify-start text-xs h-9">Manage orders</Button></Link>
          <Link to="/owner/menu"><Button variant="outline" className="w-full justify-start text-xs h-9">Edit menu</Button></Link>
          <Link to="/owner/qr"><Button variant="outline" className="w-full justify-start text-xs h-9">Get cafe QR</Button></Link>
          <Link to="/owner/loyalty"><Button variant="outline" className="w-full justify-start text-xs h-9">Rewards</Button></Link>
        </div>
      </Card>
    </OwnerLayout>
  );
}
