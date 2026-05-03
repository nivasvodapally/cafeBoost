import { useEffect, useState } from "react";
import { Loader2, History as HistoryIcon } from "lucide-react";
import { StaffLayout } from "@/components/StaffLayout";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStaffCafe } from "@/hooks/useStaffCafe";

type Row = {
  id: string; customer_name: string; total_amount: number; status: string;
  payment_status: string; created_at: string; table_no: string | null;
  accepted_by: string | null; prepared_by: string | null; served_by: string | null; completed_by: string | null;
};

export default function StaffHistory() {
  const { user } = useAuth();
  const { cafe } = useStaffCafe();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cafe || !user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("orders")
        .select("id, customer_name, total_amount, status, payment_status, created_at, table_no, accepted_by, prepared_by, served_by, completed_by")
        .eq("cafe_id", cafe.id)
        .or(`accepted_by.eq.${user.id},prepared_by.eq.${user.id},served_by.eq.${user.id},completed_by.eq.${user.id}`)
        .order("created_at", { ascending: false }).limit(100);
      if (!cancelled) { setRows((data as Row[]) ?? []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [cafe, user]);

  const myRoles = (r: Row) => [
    r.accepted_by === user?.id && "accepted",
    r.prepared_by === user?.id && "prepared",
    r.served_by === user?.id && "served",
    r.completed_by === user?.id && "completed",
  ].filter(Boolean).join(" · ");

  if (loading) return <StaffLayout title="My history"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></StaffLayout>;

  return (
    <StaffLayout title="My history" subtitle="Orders you've personally handled">
      {rows.length === 0 ? (
        <Card className="p-10 text-center">
          <HistoryIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-display text-xl font-bold">No history yet</p>
          <p className="text-sm text-muted-foreground mt-2">Orders you accept, cook, or serve will show here.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{r.customer_name} {r.table_no && <span className="text-xs text-muted-foreground">· Table {r.table_no}</span>}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {myRoles(r)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-1 rounded-full bg-muted">{r.status}</span>
                <p className="text-sm font-bold">₹{Number(r.total_amount).toFixed(2)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </StaffLayout>
  );
}
