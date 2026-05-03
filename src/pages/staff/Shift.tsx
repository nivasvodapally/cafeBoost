import { useCallback, useEffect, useState } from "react";
import { Coffee, Loader2, LogIn, LogOut, Pause, Play, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StaffLayout } from "@/components/StaffLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStaffCafe } from "@/hooks/useStaffCafe";

type ShiftRow = { id: string; clock_in_at: string; clock_out_at: string | null; total_break_seconds: number };
type OpenInfo = { open_shift: { id: string; clock_in_at: string } | null; open_break: { id: string; started_at: string } | null };
type StaffStats = OpenInfo;
type ShiftRpc = "clock_in" | "clock_out" | "start_break" | "end_break";

const fmtDur = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function StaffShift() {
  const { user } = useAuth();
  const { cafe } = useStaffCafe();
  const [info, setInfo] = useState<OpenInfo | null>(null);
  const [history, setHistory] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: stats }, { data: hist }] = await Promise.all([
      supabase.rpc("get_my_staff_stats", { _days: 30 }),
      supabase.from("staff_shifts").select("id, clock_in_at, clock_out_at, total_break_seconds")
        .eq("user_id", user.id).order("clock_in_at", { ascending: false }).limit(20),
    ]);
    const typedStats = stats as StaffStats | null;
    setInfo({ open_shift: typedStats?.open_shift ?? null, open_break: typedStats?.open_break ?? null });
    setHistory((hist as ShiftRow[] | null) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(i); }, []);

  const call = async (rpc: ShiftRpc, ok: string) => {
    setBusy(true);
    const { error } = await supabase.rpc(rpc);
    if (error) toast.error(error.message); else toast.success(ok);
    await load(); setBusy(false);
  };

  if (loading) return <StaffLayout title="Shift"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></StaffLayout>;

  const onShift = !!info?.open_shift;
  const onBreak = !!info?.open_break;
  const elapsed = onShift ? Math.floor((Date.now() + tick * 0 - new Date(info!.open_shift!.clock_in_at).getTime()) / 1000) : 0;
  const breakElapsed = onBreak ? Math.floor((Date.now() - new Date(info!.open_break!.started_at).getTime()) / 1000) : 0;

  return (
    <StaffLayout title="Shift" subtitle={`${cafe?.name ?? ""} · clock in & out, take breaks`}>
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Timer className="w-4 h-4" /> Status</div>
            <p className="font-display text-3xl font-bold mt-1">
              {onBreak ? "On break" : onShift ? "On shift" : "Off duty"}
            </p>
            {onShift && <p className="text-sm text-muted-foreground mt-1">Clocked in {fmtDur(elapsed)} ago{onBreak ? ` · break ${fmtDur(breakElapsed)}` : ""}</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {!onShift && <Button variant="hero" size="lg" disabled={busy} onClick={() => call("clock_in", "Clocked in")}><LogIn className="w-4 h-4 mr-2" /> Clock in</Button>}
            {onShift && !onBreak && <Button variant="outline" disabled={busy} onClick={() => call("start_break", "Break started")}><Pause className="w-4 h-4 mr-2" /> Start break</Button>}
            {onShift && onBreak && <Button variant="outline" disabled={busy} onClick={() => call("end_break", "Break ended")}><Play className="w-4 h-4 mr-2" /> End break</Button>}
            {onShift && <Button variant="destructive" disabled={busy} onClick={() => call("clock_out", "Clocked out")}><LogOut className="w-4 h-4 mr-2" /> Clock out</Button>}
          </div>
        </div>
      </Card>

      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2"><Coffee className="w-4 h-4" /> Recent shifts</h2>
      {history.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No shifts logged yet.</Card>
      ) : (
        <div className="space-y-2">
          {history.map((s) => {
            const start = new Date(s.clock_in_at);
            const end = s.clock_out_at ? new Date(s.clock_out_at) : null;
            const total = end ? Math.floor((end.getTime() - start.getTime()) / 1000) - s.total_break_seconds : 0;
            return (
              <Card key={s.id} className="p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{start.toLocaleDateString()} · {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} → {end ? end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "open"}</p>
                  <p className="text-xs text-muted-foreground">Break: {fmtDur(s.total_break_seconds)}</p>
                </div>
                <p className="text-sm font-bold">{end ? fmtDur(total) : "—"}</p>
              </Card>
            );
          })}
        </div>
      )}
    </StaffLayout>
  );
}
