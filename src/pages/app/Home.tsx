import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, ShoppingBag, UtensilsCrossed, CalendarCheck, Star, Loader2 } from "lucide-react";
import { useActiveCafe } from "@/lib/cafeContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cartContext";

type Featured = { id: string; name: string; price: number; description: string | null; category: string };
type RecentOrder = { id: string; total_amount: number; status: string; created_at: string };

export default function CustomerHome() {
  const cafe = useActiveCafe();
  const { user, profile } = useAuth();
  const { cart, add, inc, dec } = useCart();
  const navigate = useNavigate();
  const [m, setM] = useState<{ loyalty_points: number; total_visits: number } | null>(null);
  const [featured, setFeatured] = useState<Featured[]>([]);
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!cafe) navigate("/discover"); }, [cafe, navigate]);

  useEffect(() => {
    if (!cafe) return;
    let cancelled = false;
    void (async () => {
      const [memRes, itemsRes, ordersRes] = await Promise.all([
        user ? supabase.from("loyalty_memberships").select("loyalty_points, total_visits")
          .eq("cafe_id", cafe.id).eq("customer_user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("menu_items").select("id, name, price, description, category")
          .eq("cafe_id", cafe.id).eq("available", true).limit(4),
        user ? supabase.from("orders").select("id, total_amount, status, created_at")
          .eq("customer_user_id", user.id).eq("cafe_id", cafe.id)
          .order("created_at", { ascending: false }).limit(3) : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      setM((memRes as any)?.data ?? null);
      setFeatured(((itemsRes.data as Featured[]) ?? []));
      setRecent(((ordersRes as any)?.data as RecentOrder[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [cafe, user]);

  if (!cafe) return null;
  if (loading) return <CustomerLayout><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></CustomerLayout>;

  const firstName = profile?.full_name?.split(" ")[0];

  const handleAdd = (f: Featured) => {
    add({ id: f.id, category: f.category, name: f.name, description: f.description, price: f.price, tags: null, available: true } as any);
  };

  return (
    <CustomerLayout>
      <div className="space-y-5">
        <Card className="p-6 bg-gradient-accent text-accent-foreground rounded-2xl border-0">
          <p className="text-xs uppercase tracking-wider opacity-80">Welcome to</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">{cafe.name} ☕</h1>
          <p className="mt-1 text-sm opacity-80">{firstName ? `Hi ${firstName} — ` : ""}browse the menu, book a table, or check your rewards.</p>
        </Card>

        {m && (
          <Card className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center"><Gift className="w-5 h-5 text-accent" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Loyalty Points</p>
                <p className="font-display text-xl font-bold">{m.loyalty_points} pts</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Visits</p>
              <p className="font-display text-lg font-bold">{m.total_visits}</p>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            { to: "/app/menu", label: "View Menu", icon: UtensilsCrossed },
            { to: "/app/book", label: "Book Table", icon: CalendarCheck },
            { to: "/app/rewards", label: "Rewards", icon: Gift },
            { to: "/app/orders", label: "My Orders", icon: ShoppingBag },
          ].map(t => (
            <Link key={t.to} to={t.to}>
              <Card className="p-5 text-center hover:shadow-soft transition-smooth h-full">
                <t.icon className="w-7 h-7 text-accent mx-auto mb-2" />
                <p className="font-semibold text-sm">{t.label}</p>
              </Card>
            </Link>
          ))}
        </div>

        {featured.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-bold flex items-center gap-1.5"><Star className="w-4 h-4 text-accent" /> Popular items</h2>
              <Link to="/app/menu" className="text-xs text-accent font-semibold hover:underline">See all →</Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {featured.map(f => {
                const inCart = cart.find(c => c.id === f.id);
                return (
                  <Card key={f.id} className="p-4 flex flex-col justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">{f.category}</p>
                      <p className="text-sm font-semibold mt-1 line-clamp-1">{f.name}</p>
                      {f.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.description}</p>}
                      <p className="text-sm font-bold mt-2">₹{Number(f.price).toFixed(2)}</p>
                    </div>
                    <div className="mt-2">
                      {inCart ? (
                        <div className="flex items-center justify-center gap-2 py-1">
                          <button onClick={(e) => { e.stopPropagation(); dec(f.id); }} className="w-7 h-7 rounded-full bg-muted grid place-items-center"><span className="text-sm font-bold">−</span></button>
                          <span className="text-sm font-bold">{inCart.qty}</span>
                          <button onClick={(e) => { e.stopPropagation(); inc(f.id); }} className="w-7 h-7 rounded-full bg-muted grid place-items-center"><span className="text-sm font-bold">+</span></button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => handleAdd(f)}>Add</Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <h2 className="font-display text-lg font-bold mb-3">Recent orders</h2>
            <div className="space-y-2">
              {recent.map(r => (
                <Link to="/app/orders" key={r.id}>
                  <Card className="p-3 flex items-center justify-between hover:shadow-soft transition-smooth">
                    <div>
                      <p className="text-xs font-semibold">#{r.id.slice(0, 6).toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">₹{Number(r.total_amount).toFixed(2)}</p>
                      <p className="text-xs text-accent-foreground capitalize">{r.status}</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}