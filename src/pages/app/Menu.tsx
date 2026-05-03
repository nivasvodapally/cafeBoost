import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Minus, Search, UtensilsCrossed, Trash2, Lock } from "lucide-react";
import { useActiveCafe, setActiveTable } from "@/lib/cafeContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { placeOrder } from "@/services/orderService";

type MenuItem = { id: string; category: string; name: string; description: string | null; price: number; tags: string[] | null; available: boolean };
type CartItem = MenuItem & { qty: number };

const CART_KEY = (cafeId: string) => `cafeboost:cart:${cafeId}`;

export default function CustomerMenu() {
  const cafe = useActiveCafe();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string>("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [ordering, setOrdering] = useState(false);
  // Table number — locked if customer scanned a per-table QR.
  const lockedTable = cafe?.table ?? null;
  const [tableNo, setTableNo] = useState<string>(lockedTable ?? "");
  useEffect(() => { if (lockedTable) setTableNo(lockedTable); }, [lockedTable]);

  useEffect(() => { if (!cafe) { navigate("/discover"); } }, [cafe, navigate]);

  useEffect(() => {
    if (!cafe) return;
    let cancelled = false;
    setLoading(true);
    void supabase.from("menu_items").select("id, category, name, description, price, tags, available")
      .eq("cafe_id", cafe.id).order("category").order("name")
      .then(({ data }) => { if (!cancelled) { setItems((data as MenuItem[]) ?? []); setLoading(false); } });
    try {
      const raw = localStorage.getItem(CART_KEY(cafe.id));
      if (raw) setCart(JSON.parse(raw));
    } catch { /* ignore */ }
    return () => { cancelled = true; };
  }, [cafe]);

  useEffect(() => {
    if (!cafe) return;
    try { localStorage.setItem(CART_KEY(cafe.id), JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart, cafe]);

  const add = (it: MenuItem) => {
    if (!it.available) { toast.error(`${it.name} is unavailable`); return; }
    setCart(p => {
      const ex = p.find(c => c.id === it.id);
      return ex ? p.map(c => c.id === it.id ? { ...c, qty: c.qty + 1 } : c) : [...p, { ...it, qty: 1 }];
    });
  };
  const dec = (id: string) => setCart(p => p.map(c => c.id === id ? { ...c, qty: c.qty - 1 } : c).filter(c => c.qty > 0));
  const removeLine = (id: string) => setCart(p => p.filter(c => c.id !== id));
  const clearCart = () => setCart([]);

  const submitOrder = async () => {
    if (!cafe || !user || cart.length === 0 || ordering) return;
    setOrdering(true);
    try {
      const customerName = profile?.full_name ?? user.email ?? "Guest";
      const result = await placeOrder({
        cafeId: cafe.id,
        customerUserId: user.id,
        customerName,
        customerPhone: profile?.phone ?? null,
        cart: cart.map(c => ({ id: c.id, qty: c.qty })),
        source: lockedTable ? "table" : "qr",
        tableNo: tableNo.trim() || null,
      });
      setCart([]);
      try { localStorage.removeItem(CART_KEY(cafe.id)); } catch { /* ignore */ }
      toast.success(`Order placed · ₹${result.totalAmount.toFixed(2)}`);
      navigate("/app/orders");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not place order");
    } finally {
      setOrdering(false);
    }
  };

  const clearTable = () => { setTableNo(""); setActiveTable(null); };

  const filtered = useMemo(() => {
    return items.filter(i => {
      const matchCat = activeCat === "All" || i.category === activeCat;
      const matchSearch = !search ||
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.category.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
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
  const subtotal = cart.reduce((s, c) => s + Number(c.price) * c.qty, 0);

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
            <button
              key={c}
              type="button"
              onClick={() => setActiveCat(c)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-smooth ${
                activeCat === c
                  ? "bg-accent text-accent-foreground shadow-soft"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >{c}</button>
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
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => add(item)} disabled={!item.available}><Plus className="w-3 h-3" /></Button>
                    </div>
                  ) : <Button variant="outline" size="sm" onClick={() => add(item)} disabled={!item.available}><Plus className="w-3 h-3 mr-1" /> Add</Button>}
                </div>
              </Card>
            );
          })}</div>
        </div>
      ))}

      {cart.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 lg:bottom-4 z-20 px-4">
          <Card className="max-w-3xl mx-auto p-4 shadow-elegant bg-card">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{cart.reduce((s, c) => s + c.qty, 0)} items in cart</p>
                <p className="font-display text-lg font-bold">₹{subtotal.toFixed(2)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={clearCart} aria-label="Clear cart"><Trash2 className="w-4 h-4 text-muted-foreground" /></Button>
                <Button variant="hero" onClick={submitOrder} disabled={ordering}>
                  {ordering ? <Loader2 className="w-4 h-4 animate-spin" /> : "Place Order"}
                </Button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <label htmlFor="table-no" className="text-xs font-semibold text-muted-foreground shrink-0">Table</label>
              <Input
                id="table-no"
                value={tableNo}
                onChange={(e) => setTableNo(e.target.value)}
                placeholder={lockedTable ? "" : "Optional · e.g. 5"}
                disabled={!!lockedTable}
                maxLength={10}
                className="h-8 text-sm"
              />
              {lockedTable ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent-foreground bg-accent-soft px-2 py-1 rounded-full shrink-0" title="Set by table QR">
                  <Lock className="w-3 h-3" /> from QR
                </span>
              ) : tableNo ? (
                <button onClick={clearTable} className="text-[10px] text-muted-foreground hover:text-foreground shrink-0">Clear</button>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cart.map(c => (
                <button key={c.id} onClick={() => removeLine(c.id)} className="text-[10px] bg-muted hover:bg-muted/70 px-2 py-0.5 rounded-full text-muted-foreground">
                  {c.qty}× {c.name}
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </CustomerLayout>
  );
}
