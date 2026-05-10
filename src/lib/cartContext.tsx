import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { placeOrder } from "@/services/orderService";
import { useActiveCafe } from "@/lib/cafeContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
type CartItem = MenuItem & { qty: number };

type CartContextType = {
  cart: CartItem[];
  add: (item: MenuItem) => void;
  inc: (id: string) => void;
  dec: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  total: number;
  count: number;
  submitOrder: (opts: { customerName: string; customerPhone?: string; notes?: string; tableNo?: string }) => Promise<{ id: string; total: number } | null>;
  ordering: boolean;
};

const CartCtx = createContext<CartContextType | null>(null);

const CART_KEY = (cafeId: string) => `cafeboost:cart:${cafeId}`;

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const cafe = useActiveCafe();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    if (!cafe) { setCart([]); return; }
    try {
      const raw = localStorage.getItem(CART_KEY(cafe.id));
      if (raw) {
        const parsed = JSON.parse(raw);
        // Ensure price is a number for each item
        const valid = parsed.map((c: any) => ({ ...c, price: Number(c.price) || 0 }));
        setCart(valid);
      } else {
        setCart([]);
      }
    } catch { setCart([]); }
  }, [cafe]);

  useEffect(() => {
    if (!cafe) return;
    try { localStorage.setItem(CART_KEY(cafe.id), JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart, cafe]);

  const add = (item: MenuItem) => {
    setCart(p => {
      const existing = p.find(c => c.id === item.id);
      if (existing) return p.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...p, { ...item, qty: 1 }];
    });
    toast.success(`${item.name} added to cart`);
  };

  const inc = (id: string) => setCart(p => p.map(c => c.id === id ? { ...c, qty: c.qty + 1 } : c));
  const dec = (id: string) => setCart(p => p.map(c => c.id === id ? { ...c, qty: c.qty - 1 } : c).filter(c => c.qty > 0));
  const remove = (id: string) => setCart(p => p.filter(c => c.id !== id));
  const clear = () => setCart([]);

  const total = cart.reduce((s, c) => s + (Number(c.price) || 0) * c.qty, 0);
  const count = cart.reduce((s, c) => s + c.qty, 0);

  const submitOrder = async (opts: { customerName: string; customerPhone?: string; notes?: string; tableNo?: string }) => {
    if (!cafe || cart.length === 0 || ordering) return null;
    setOrdering(true);
    try {
      const result = await placeOrder({
        cafeId: cafe.id,
        customerUserId: user!.id,
        customerName: opts.customerName,
        customerPhone: opts.customerPhone ?? null,
        notes: opts.notes ?? null,
        source: "app",
        tableNo: opts.tableNo ?? null,
        cart: cart.map(c => ({ id: c.id, qty: c.qty })),
      });
      setCart([]);
      toast.success(`Order placed · ₹${result.totalAmount.toFixed(2)}`);
      return { id: result.id, total: result.totalAmount };
    } catch (e: unknown) {
      toast.error((e as Error).message || "Could not place order");
      return null;
    } finally {
      setOrdering(false);
    }
  };

  return (
    <CartCtx.Provider value={{ cart, add, inc, dec, remove, clear, total, count, submitOrder, ordering }}>
      {children}
    </CartCtx.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}