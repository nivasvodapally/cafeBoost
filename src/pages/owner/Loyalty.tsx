import { useEffect, useState, useCallback } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Gift, Check } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { rewardSchema } from "@/lib/validation";

type Reward = { id: string; title: string; description: string | null; required_points: number; active: boolean };
type Redemption = {
  id: string; reward_title: string; points_spent: number; code: string;
  customer_user_id: string; created_at: string; status: "pending" | "redeemed" | "cancelled";
  customer_name?: string | null;
};

export default function OwnerLoyalty() {
  const { cafe, loading: cafeLoading } = useOwnerCafe();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ title: "", description: "", required_points: 100 });
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadRedemptions = useCallback(async (cafeId: string) => {
    const { data: rows } = await supabase
      .from("reward_redemptions")
      .select("id, reward_title, points_spent, code, customer_user_id, created_at, status")
      .eq("cafe_id", cafeId)
      .order("created_at", { ascending: false })
      .limit(50);
    const list = (rows as Redemption[]) ?? [];
    if (list.length) {
      const ids = Array.from(new Set(list.map(r => r.customer_user_id)));
      const { data: profiles } = await supabase.from("profiles")
        .select("user_id, full_name").in("user_id", ids);
      const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.full_name]));
      list.forEach(r => { r.customer_name = nameMap.get(r.customer_user_id) ?? "Guest"; });
    }
    setRedemptions(list);
  }, []);

  useEffect(() => {
    if (!cafe) return;
    void Promise.all([
      supabase.from("loyalty_rewards").select("id, title, description, required_points, active").eq("cafe_id", cafe.id),
      loadRedemptions(cafe.id),
    ]).then(([r]) => { setRewards((r.data as Reward[]) ?? []); setLoading(false); });
  }, [cafe, loadRedemptions]);

  const add = async () => {
    if (!cafe) return;
    const parsed = rewardSchema.safeParse(draft);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    const { data, error } = await supabase.from("loyalty_rewards").insert({
      cafe_id: cafe.id, title: parsed.data.title, description: parsed.data.description || null, required_points: parsed.data.required_points,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setRewards(p => [...p, data as Reward]);
    setDraft({ title: "", description: "", required_points: 100 });
    toast.success("Reward added");
  };

  const remove = async (id: string) => {
    await supabase.from("loyalty_rewards").delete().eq("id", id);
    setRewards(p => p.filter(r => r.id !== id));
  };

  const approve = async (id: string) => {
    setApprovingId(id);
    const { error } = await supabase.rpc("approve_redemption", { _redemption_id: id });
    setApprovingId(null);
    if (error) { toast.error(error.message); return; }
    setRedemptions(prev => prev.map(r => r.id === id ? { ...r, status: "redeemed" } : r));
    toast.success("Redemption approved");
  };

  if (cafeLoading || loading) return <OwnerLayout title="Loyalty"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></OwnerLayout>;

  const pending = redemptions.filter(r => r.status === "pending");
  const past = redemptions.filter(r => r.status !== "pending");

  return (
    <OwnerLayout title="Loyalty Program" subtitle="Rewards your customers can redeem with points">
      <Card className="p-4 mb-6">
        <p className="font-semibold text-sm mb-3">Add reward</p>
        <div className="grid sm:grid-cols-4 gap-3">
          <Input placeholder="Title" value={draft.title} onChange={e => setDraft(p => ({ ...p, title: e.target.value }))} />
          <Input placeholder="Description" value={draft.description} onChange={e => setDraft(p => ({ ...p, description: e.target.value }))} />
          <Input type="number" placeholder="Points" value={draft.required_points} onChange={e => setDraft(p => ({ ...p, required_points: parseInt(e.target.value) || 0 }))} />
          <Button variant="hero" onClick={add}><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </div>
      </Card>
      {rewards.length === 0 ? (
        <Card className="p-10 text-center"><Gift className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" /><p className="font-display text-xl font-bold">No rewards yet</p></Card>
      ) : (
        <div className="space-y-3 mb-8">{rewards.map(r => (
          <Card key={r.id} className="p-4 flex items-center justify-between">
            <div><p className="font-medium text-sm">{r.title}</p>{r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}<p className="text-xs text-accent-foreground/70 mt-1">{r.required_points} points</p></div>
            <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </Card>
        ))}</div>
      )}

      <h2 className="font-display text-xl font-bold mb-3">Redemptions</h2>
      {pending.length === 0 && past.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No redemptions yet.</Card>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-3 mb-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Pending</p>
              {pending.map(r => (
                <Card key={r.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{r.customer_name} · {r.reward_title}</p>
                    <p className="text-xs text-muted-foreground">{r.points_spent} pts · {new Date(r.created_at).toLocaleString()}</p>
                    <p className="text-xs font-mono mt-1">Code: <span className="font-bold tracking-widest">{r.code}</span></p>
                  </div>
                  <Button variant="hero" size="sm" onClick={() => approve(r.id)} disabled={approvingId === r.id}>
                    {approvingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" /> Approve</>}
                  </Button>
                </Card>
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">History</p>
              {past.map(r => (
                <Card key={r.id} className="p-3 flex items-center justify-between gap-3 opacity-80">
                  <div className="min-w-0">
                    <p className="text-sm">{r.customer_name} · {r.reward_title}</p>
                    <p className="text-xs text-muted-foreground">{r.points_spent} pts · {new Date(r.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${r.status === "redeemed" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{r.status}</span>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </OwnerLayout>
  );
}
