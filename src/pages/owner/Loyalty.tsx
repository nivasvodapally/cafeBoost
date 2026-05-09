import { useEffect, useState, useCallback } from "react";
import { OwnerLayout } from "@/components/OwnerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Gift, Check, Users, Star, TrendingUp, Calendar, Filter } from "lucide-react";
import { useOwnerCafe } from "@/hooks/useOwnerCafe";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { rewardSchema } from "@/lib/validation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Reward = { id: string; title: string; description: string | null; required_points: number; active: boolean };
type Redemption = {
  id: string; reward_title: string; points_spent: number; code: string;
  customer_user_id: string; created_at: string; status: "pending" | "redeemed" | "cancelled";
  customer_name?: string | null;
};
type LoyaltyMember = {
  id: string;
  customer_user_id: string;
  loyalty_points: number;
  total_visits: number;
  last_visit_at: string;
  created_at: string;
  customer_name?: string | null;
  customer_email?: string | null;
};

export default function OwnerLoyalty() {
  const { cafe, loading: cafeLoading } = useOwnerCafe();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [members, setMembers] = useState<LoyaltyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ title: "", description: "", required_points: 100 });
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("rewards");
  const [pointsAdjustment, setPointsAdjustment] = useState<Record<string, number>>({});

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

  const loadMembers = useCallback(async (cafeId: string) => {
    const { data: membersData } = await supabase
      .from("loyalty_memberships")
      .select("id, customer_user_id, loyalty_points, total_visits, last_visit_at, created_at")
      .eq("cafe_id", cafeId)
      .order("loyalty_points", { ascending: false });
    
    const list = (membersData as LoyaltyMember[]) ?? [];
    if (list.length) {
      const ids = Array.from(new Set(list.map(m => m.customer_user_id)));
      const { data: profiles } = await supabase.from("profiles")
        .select("user_id, full_name, email").in("user_id", ids);
      const profileMap = new Map((profiles ?? []).map(p => [p.user_id, { name: p.full_name, email: p.email }]));
      list.forEach(m => {
        const profile = profileMap.get(m.customer_user_id);
        m.customer_name = profile?.name || "Guest";
        m.customer_email = profile?.email || null;
      });
    }
    setMembers(list);
  }, []);

  useEffect(() => {
    if (!cafe) return;
    void Promise.all([
      supabase.from("loyalty_rewards").select("id, title, description, required_points, active").eq("cafe_id", cafe.id),
      loadRedemptions(cafe.id),
      loadMembers(cafe.id),
    ]).then(([r]) => { setRewards((r.data as Reward[]) ?? []); setLoading(false); });
  }, [cafe, loadRedemptions, loadMembers]);

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

  const adjustPoints = async (memberId: string, adjustment: number, note: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member || !cafe) return;
    
    try {
      const { error } = await supabase.rpc("adjust_loyalty_points", {
        _cafe_id: cafe.id,
        _customer_user_id: member.customer_user_id,
        _points: adjustment,
        _note: note
      });
      
      if (error) throw error;
      
      // Update local state
      setMembers(prev => prev.map(m =>
        m.id === memberId
          ? { ...m, loyalty_points: Math.max(0, m.loyalty_points + adjustment) }
          : m
      ));
      
      toast.success(`Points ${adjustment >= 0 ? 'added' : 'deducted'} successfully`);
      setPointsAdjustment(prev => ({ ...prev, [memberId]: 0 }));
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to adjust points");
    }
  };

  const refreshMembers = () => {
    if (cafe) loadMembers(cafe.id);
  };

  if (cafeLoading || loading) return <OwnerLayout title="Loyalty"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></OwnerLayout>;

  const pending = redemptions.filter(r => r.status === "pending");
  const past = redemptions.filter(r => r.status !== "pending");
  const totalPoints = members.reduce((sum, m) => sum + m.loyalty_points, 0);
  const totalVisits = members.reduce((sum, m) => sum + m.total_visits, 0);
  const avgVisits = members.length > 0 ? (totalVisits / members.length).toFixed(1) : "0";

  return (
    <OwnerLayout title="Loyalty Program" subtitle="Manage rewards and customer loyalty points">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-md mb-6">
          <TabsTrigger value="rewards" className="gap-2"><Gift className="w-4 h-4" /> Rewards</TabsTrigger>
          <TabsTrigger value="members" className="gap-2"><Users className="w-4 h-4" /> Members</TabsTrigger>
          <TabsTrigger value="redemptions" className="gap-2"><Check className="w-4 h-4" /> Redemptions</TabsTrigger>
        </TabsList>

        <TabsContent value="rewards" className="space-y-6">
          <Card className="p-4">
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
            <div className="space-y-3">
              <h3 className="font-display text-lg font-bold">Available Rewards</h3>
              {rewards.map(r => (
                <Card key={r.id} className="p-4 flex items-center justify-between">
                  <div><p className="font-medium text-sm">{r.title}</p>{r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}<p className="text-xs text-accent-foreground/70 mt-1">{r.required_points} points</p></div>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="members" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 grid place-items-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Members</p>
                  <p className="font-display text-2xl font-bold">{members.length}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-600 grid place-items-center">
                  <Star className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Points</p>
                  <p className="font-display text-2xl font-bold">{totalPoints}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 grid place-items-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Visits</p>
                  <p className="font-display text-2xl font-bold">{avgVisits}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Loyalty Members</h3>
            <Button variant="outline" size="sm" onClick={refreshMembers} className="gap-2">
              <Filter className="w-4 h-4" /> Refresh
            </Button>
          </div>

          {members.length === 0 ? (
            <Card className="p-10 text-center">
              <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-display text-xl font-bold">No loyalty members yet</p>
              <p className="text-sm text-muted-foreground mt-2">Customers will appear here after their first order</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {members.map(member => (
                <Card key={member.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-sm">{member.customer_name || "Guest"}</p>
                      {member.customer_email && <p className="text-xs text-muted-foreground">{member.customer_email}</p>}
                      <div className="flex items-center gap-3 mt-2">
                        <Badge variant="outline" className="gap-1">
                          <Star className="w-3 h-3" /> {member.loyalty_points} points
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <Calendar className="w-3 h-3" /> {member.total_visits} visits
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Last visit: {new Date(member.last_visit_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 pt-3 border-t border-border">
                    <Input
                      type="number"
                      placeholder="Points adjustment"
                      className="w-32"
                      value={pointsAdjustment[member.id] || ""}
                      onChange={e => setPointsAdjustment(prev => ({
                        ...prev,
                        [member.id]: parseInt(e.target.value) || 0
                      }))}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => adjustPoints(member.id, pointsAdjustment[member.id] || 0, "Manual adjustment")}
                      disabled={!pointsAdjustment[member.id]}
                    >
                      Apply
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => adjustPoints(member.id, 10, "Bonus for visit")}
                    >
                      +10 Bonus
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => adjustPoints(member.id, -10, "Deduction")}
                    >
                      -10 Deduct
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="redemptions" className="space-y-6">
          <h3 className="font-display text-lg font-bold">Redemptions</h3>
          {pending.length === 0 && past.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No redemptions yet.</Card>
          ) : (
            <>
              {pending.length > 0 && (
                <div className="space-y-3 mb-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Pending Approval</p>
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
        </TabsContent>
      </Tabs>
    </OwnerLayout>
  );
}
