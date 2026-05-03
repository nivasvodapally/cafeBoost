import { useEffect, useState } from "react";
import { Award, ChefHat, ClipboardCheck, Clock, Loader2, Users } from "lucide-react";
import { StaffLayout } from "@/components/StaffLayout";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useStaffCafe } from "@/hooks/useStaffCafe";

type Stats = {
  orders_accepted: number; orders_prepared: number; orders_served: number; orders_completed: number;
  revenue_touched: number; avg_prep_seconds: number; avg_serve_seconds: number; hours_worked: number;
};

const fmtMin = (s: number) => s ? `${Math.round(s / 60)} min` : "—";
const fmtHrs = (h: number) => `${Number(h).toFixed(1)} h`;

export default function StaffMe() {
  const { cafe } = useStaffCafe();
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await (supabase as any).rpc("get_my_staff_stats", { _days: days });
      if (!cancelled) { setStats((data as Stats) ?? null); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [days]);

  if (loading || !stats) return <StaffLayout title="My stats"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></StaffLayout>;

  const cards = [
    { label: "Orders accepted", value: stats.orders_accepted, icon: ClipboardCheck },
    { label: "Orders cooked", value: stats.orders_prepared, icon: ChefHat },
    { label: "Orders served", value: stats.orders_served, icon: Users },
    { label: "Orders completed", value: stats.orders_completed, icon: Award },
  ];

  return (
    <StaffLayout title="My stats" subtitle={`Last ${days} days · ${cafe?.name ?? ""}`} action={
      <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
        <option value={1}>Today</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
      </select>
    }>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-5">
            <Icon className="w-5 h-5 text-muted-foreground mb-2" />
            <p className="text-3xl font-display font-bold">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
        <Card className="p-5"><Clock className="w-5 h-5 text-muted-foreground mb-2" /><p className="text-3xl font-display font-bold">{fmtHrs(stats.hours_worked)}</p><p className="text-xs text-muted-foreground mt-1">Hours worked</p></Card>
        <Card className="p-5"><p className="text-3xl font-display font-bold">₹{Number(stats.revenue_touched).toFixed(0)}</p><p className="text-xs text-muted-foreground mt-1">Revenue touched</p></Card>
        <Card className="p-5"><p className="text-3xl font-display font-bold">{fmtMin(stats.avg_prep_seconds)}</p><p className="text-xs text-muted-foreground mt-1">Avg prep time</p></Card>
        <Card className="p-5"><p className="text-3xl font-display font-bold">{fmtMin(stats.avg_serve_seconds)}</p><p className="text-xs text-muted-foreground mt-1">Avg serve time</p></Card>
      </div>
    </StaffLayout>
  );
}
