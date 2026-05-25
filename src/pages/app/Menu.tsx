import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Minus, Search, UtensilsCrossed } from "lucide-react";
import { useActiveCafe, setActiveTable } from "@/lib/cafeContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCart } from "@/lib/cartContext";

type MenuItem = { id: string; category: string; name: string; description: string | null; price: number; tags: string[] | null; available: boolean };

export default function CustomerMenu() {
  const cafe = useActiveCafe();
  const { user } = useAuth();
  const { cart, add, inc, dec, total } = useCart();
  const navigate = useNavigate();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("All");

  useEffect(() => { if (!cafe) navigate("/discover"); }, [cafe, navigate]);

  useEffect(() => {
    if (!cafe) return;
    setLoading(true);
    void supabase.from("menu_items")
      .select("id, category, name, description, price, tags, available")
      .eq("cafe_id", cafe.id).order("category").order("name")
      .then(({ data }) => { setItems((data as MenuItem[]) ?? []); setLoading(false); })
      .catch((err) => { console.error("Failed to load menu items:", err); setLoading(false); toast.error("Failed to load menu"); });
  }, [cafe]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => (activeCat === "All" || i.category === activeCat) && (!q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)));
  }, [items, search, activeCat]);
  const cats = useMemo(() => ["All", ...Array.from(new Set(items.map(i => i.category)))], [items]);
  const grouped = useMemo(() => {
    const g = new Map<string, MenuItem[]>();
    filtered.forEach(i => {
      if (!g.has(i.category)) g.set(i.category, []);
      g.get(i.category)!.push(i);
    });
    return g;
  }, [filtered]);

  const handleAdd = (item: MenuItem) => {
    if (!item.available) { toast.error(`${item.name} is unavailable`); return; }
    add(item as any);
  };

  if (loading) return <CustomerLayout title="Menu"><div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div></CustomerLayout>;

  return (
    <CustomerLayout title="Menu" subtitle={cafe?.name}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search menu..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>
      {items.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-3 -mx-4 px-4 scrollbar-none">
          {cats.map(c => (
            <button key={c} type="button" onClick={() => setActiveCat(c)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-smooth ${activeCat === c ? "bg-accent text-accent-foreground shadow-soft" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
              {c}
            </button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <Card className="p-10 text-center"><UtensilsCrossed className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" /><p className="font-display text-xl font-bold">No items yet</p><p className="text-sm text-muted-foreground mt-2">The cafe hasn't added their menu yet.</p></Card>
      ) : Array.from(grouped.entries()).map(([cat, list]) => (
        <div key={cat} className="mb-6">
          <h3 className="font-display text-lg font-bold mb-3">{cat}</h3>
          <div className="space-y-2">{list.map(item => {
            const inCart = cart.find(c => c.id === item.id);
            return (
              <Card key={item.id} className={`p-4 flex items-center justify-between ${!item.available ? "opacity-50" : ""}`}>
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-sm font-medium">{item.name}{!item.available && <span className="text-xs text-destructive ml-2">Unavailable</span>}</p>
                  {item.description && <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-sm font-semibold">₹{Number(item.price).toFixed(2)}</p>
                  {inCart ? (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => dec(item.id)}><Minus className="w-3 h-3" /></Button>
                      <span className="text-sm font-bold w-5 text-center">{inCart.qty}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => inc(item.id)} disabled={!item.available}><Plus className="w-3 h-3" /></Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => handleAdd(item)} disabled={!item.available}>
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}</div>
        </div>
      ))}
    </CustomerLayout>
  );
}