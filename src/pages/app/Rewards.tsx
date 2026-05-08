import { useEffect, useState } from "react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, Loader2, CheckCircle2, Clock, History } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useActiveCafe } from "@/lib/cafeContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Reward = { id: string; title: string; description: string | null; required_points: number };
type Redemption = { id: string; reward_title: string; code: string; status: "pending" | "redeemed" | "cancelled"; points_spent: number; created_at: string; redeemed_at: string | null };

export default function CustomerRewards() {
  const cafe = useActiveCafe();
  const { user } = useAuth();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirmReward, setConfirmReward] = useState<Reward | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [success, setSuccess] = useState<{ code: string; title: string } | null>(null);

  const load = () => {
    if (!cafe) return;
    void Promise.all([
      supabase.from("loyalty_rewards").select("id, title, description, required_points").eq("cafe_id", cafe.id).eq("active", true),
      user ? supabase.from("loyalty_memberships").select("loyalty_points").eq("cafe_id", cafe.id).eq("customer_user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      user ? supabase.from("reward_redemptions").select("id, reward_title, code, status, points_spent, created_at, redeemed_at").eq("cafe_id", cafe.id).eq("customer_user_id", user.id).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    ]).then(([r, m, h]) => {
      setRewards((r.data as Reward[]) ?? []);
      setPoints(m.data?.loyalty_points ?? 0);
      setHistory((h.data as Redemption[]) ?? []);
      setLoading(false);
    });
  };

  useEffect(load, [cafe, user]);

  const onRedeem = async () => {
    if (!confirmReward) return;
    setRedeeming(true);
    const { data, error } = await supabase.rpc("redeem_reward", { _reward_id: confirmReward.id });
    setRedeeming(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as { id: string; code: string; points_spent: number };
    setSuccess({ code: result.code, title: confirmReward.title });
    setConfirmReward(null);
    load();
  };

  if (loading) return <CustomerLayout title="Rewards"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></CustomerLayout>;

  return (
    <CustomerLayout title="Rewards" subtitle={`You have ${points} points`}>
      {rewards.length === 0 ? (
        <Card className="p-10 text-center"><Gift className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" /><p className="font-display text-xl font-bold">No rewards available</p></Card>
      ) : (
        <div className="space-y-3">{rewards.map(r => {
          const eligible = points >= r.required_points;
          return (
            <Card key={r.id} className={`p-4 flex items-center justify-between gap-3 ${eligible ? "border-accent" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{r.title}</p>
                {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">{r.required_points} pts</p>
              </div>
              {eligible ? (
                <Button size="sm" variant="hero" onClick={() => setConfirmReward(r)}>Redeem</Button>
              ) : (
                <p className="text-xs text-muted-foreground whitespace-nowrap">{r.required_points - points} more</p>
              )}
            </Card>
          );
        })}</div>
      )}

      {history.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-display text-lg font-bold">Redemption history</h2>
          </div>
          <div className="space-y-2">
            {history.map((h) => {
              const pending = h.status === "pending";
              const redeemed = h.status === "redeemed";
              return (
                <Card key={h.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{h.reward_title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(h.created_at).toLocaleDateString()} · -{h.points_spent} pts
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-bold tracking-widest">{h.code}</p>
                    <span className={`inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold mt-0.5 px-1.5 py-0.5 rounded ${
                      redeemed ? "bg-success/15 text-success" :
                      pending ? "bg-accent-soft text-accent-foreground" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {pending ? <Clock className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
                      {h.status}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <AlertDialog open={!!confirmReward} onOpenChange={(o) => !o && setConfirmReward(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redeem {confirmReward?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will use {confirmReward?.required_points} points from your balance.
              You'll get a code to show at the counter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={redeeming}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void onRedeem(); }} disabled={redeeming}>
              {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!success} onOpenChange={(o) => !o && setSuccess(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" /> Reward redeemed!
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Show this code at the counter to claim your <strong>{success?.title}</strong>.</p>
                <div className="rounded-lg bg-accent-soft p-4 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Reference</p>
                  <p className="font-display text-3xl font-bold tracking-widest mt-1">{success?.code}</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setSuccess(null)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CustomerLayout>
  );
}
