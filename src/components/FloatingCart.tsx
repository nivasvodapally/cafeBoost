import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, ShoppingBag, X, Lock, Loader2, ChevronUp, Minus, Plus, UtensilsCrossed, Receipt, ChefHat } from "lucide-react";
import { useCart } from "@/lib/cartContext";
import { useActiveCafe } from "@/lib/cafeContext";
import { useAuth } from "@/hooks/useAuth";
import { PaymentDialog } from "@/components/PaymentDialog";
import { placeOrder } from "@/services/orderService";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];

const ORDER_DONE_STATUSES = ["served", "completed", "cancelled"];

export function FloatingCart() {
  const { cart, total, count, remove, clear, inc, dec, add } = useCart();
  const { user, profile, loginSession } = useAuth();
  const cafe = useActiveCafe();
  const navigate = useNavigate();
  const location = useLocation();

  const [tableNo, setTableNo] = useState("");
  const [lockedTable] = useState(cafe?.table ?? "");
  const [expanded, setExpanded] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [paidOrder, setPaidOrder] = useState<{ id: string; total: number } | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const prevCount = useRef(count);

  // Track last cleared order to handle transition
  const [justPlacedOrder, setJustPlacedOrder] = useState<{ id: string; total: number } | null>(null);
  const justPlacedOrderRef = useRef(justPlacedOrder);

  const [activeOrder, setActiveOrder] = useState<OrderRow | null>(null);
  const [orderItems, setOrderItems] = useState<{ name: string; qty: number }[]>([]);

  // Sync ref with latest justPlacedOrder value
  useEffect(() => {
    justPlacedOrderRef.current = justPlacedOrder;
  }, [justPlacedOrder]);

  // Expose showCart method for external triggers (like reorder)
  useEffect(() => {
    (window as any).__showCartFloating = () => setExpanded(true);
    return () => { delete (window as any).__showCartFloating; };
  }, []);

  // Auto-open cart when navigating from reorder
  useEffect(() => {
    if (sessionStorage.getItem("cafeboost:autoOpenCart") === "true" && cart.length > 0) {
      sessionStorage.removeItem("cafeboost:autoOpenCart");
      setExpanded(true);
    }
  }, [cart.length]);

  useEffect(() => {
    if (cafe?.table) setTableNo(cafe.table);
  }, [cafe]);

  useEffect(() => {
    if (count > prevCount.current) {
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 600);
    }
    prevCount.current = count;
  }, [count]);

  // Initial fetch of active order (runs once when user/cafe changes)
  useEffect(() => {
    if (!user || !cafe || justPlacedOrderRef.current) return;

    const fetchActiveOrder = async () => {
      try {
        const { data } = await supabase
          .from("orders")
          .select("*, order_items(name, quantity)")
          .eq("customer_user_id", user.id)
          .eq("cafe_id", cafe.id)
          .not("status", "in", "(served,completed,cancelled)")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setActiveOrder(data as OrderRow);
          setOrderItems((data as any).order_items?.map((i: { name: string; quantity: number }) => ({ name: i.name, qty: i.quantity })) ?? []);
        } else if (count === 0) {
          setActiveOrder(null);
          setOrderItems([]);
        }
      } catch (err) {
        console.error("Failed to fetch active order:", err);
      }
    };

    void fetchActiveOrder();
  }, [user, cafe]);

  // Subscribe to active order updates (skip if we just placed an order)
  useEffect(() => {
    if (!user || !cafe || justPlacedOrderRef.current) return;

    const sub = supabase.channel(`fc_order_${user.id}_${cafe.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "orders",
        filter: `customer_user_id=eq.${user.id}`,
      }, async (payload) => {
        const o = payload.new as OrderRow;
        if (o.cafe_id !== cafe.id) return;

        // If payment marked as paid, clear the justPlacedOrder so it doesn't block future subscriptions
        if (justPlacedOrderRef.current && o.payment_status === 'paid' && o.id === justPlacedOrderRef.current.id) {
          setJustPlacedOrder(null);
        }

        if (ORDER_DONE_STATUSES.includes(o.status)) {
          setActiveOrder(null);
          setOrderItems([]);
          if (expanded) setExpanded(false);
        } else {
          try {
            const { data } = await supabase.from("order_items").select("name, quantity").eq("order_id", o.id);
            setActiveOrder(o);
            setOrderItems(data?.map(i => ({ name: i.name, qty: i.quantity })) ?? []);
          } catch (err) {
            console.error("Failed to load order items from subscription:", err);
          }
        }
      })
      .subscribe();

    return () => { void supabase.removeChannel(sub); };
  }, [user, cafe, expanded]);

  const hasCart = count > 0;
  const hasActiveOrder = !!activeOrder;
  const showOrderBar = (activeOrder && !hasCart) || justPlacedOrder;

  if (!hasCart && !showOrderBar) return null;

  // Hide cart bar on orders page
  if (location.pathname === "/app/orders") return null;

  // Show order bar for just placed order (waiting for payment)
  if (justPlacedOrder && !hasCart) {
    return (
      <div className="fixed bottom-20 left-0 right-0 z-30 px-3 pointer-events-none flex items-center">
        <div className="pointer-events-auto w-full bg-background/95 backdrop-blur-md border border-border rounded-2xl shadow-lg flex items-center justify-between h-12">
          <div className="flex items-center gap-2 pl-3">
            <div className="w-7 h-7 rounded-md bg-accent grid place-items-center">
              <Receipt className="w-3.5 h-3.5 text-accent-foreground" />
            </div>
            <div className="flex flex-col">
              <p className="text-xs font-medium text-muted-foreground">Order placed</p>
              <p className="text-sm font-bold">₹{justPlacedOrder.total.toFixed(0)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pr-3">
            <button
              onClick={() => setPaidOrder({ id: justPlacedOrder.id, total: justPlacedOrder.total })}
              className="px-4 py-1.5 rounded-md bg-accent text-accent-foreground text-sm font-semibold shadow-sm hover:bg-accent/90 transition-colors"
            >
              Pay Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show order bar for already paid order
  if (hasActiveOrder && !hasCart) {
    const isDone = ORDER_DONE_STATUSES.includes(activeOrder.status);
    return (
      <div className="fixed bottom-20 left-0 right-0 z-30 px-3 pointer-events-none flex items-center">
        <div className="pointer-events-auto w-full bg-background/95 backdrop-blur-md border border-border rounded-2xl shadow-lg flex items-center justify-between h-12">
          <div className="flex items-center gap-2 pl-3">
            <div className="w-7 h-7 rounded-md bg-accent grid place-items-center">
              {isDone ? (
                <UtensilsCrossed className="w-3.5 h-3.5 text-accent-foreground" />
              ) : (
                <ChefHat className="w-3.5 h-3.5 text-accent-foreground animate-pulse" />
              )}
            </div>
            <div className="flex flex-col">
              <p className="text-xs font-medium text-muted-foreground">Order #{activeOrder.id.slice(0, 6).toUpperCase()}</p>
              <p className="text-sm font-bold capitalize">{activeOrder.status}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pr-3">
            <button onClick={() => navigate("/app/orders")} className="px-4 py-1.5 rounded-md bg-accent text-accent-foreground text-sm font-semibold shadow-sm hover:bg-accent/90 transition-colors">
              View
            </button>
            <button onClick={() => { setActiveOrder(null); setOrderItems([]); }} className="w-7 h-7 rounded-md bg-muted grid place-items-center">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Cart UI
  return (
    <>
      {/* Collapsed bar */}
      {!expanded && (
        <div className="fixed bottom-20 left-0 right-0 z-30 px-3 pointer-events-none flex items-center">
          <button
            onClick={() => setExpanded(true)}
            className={`pointer-events-auto w-full flex items-center justify-between h-12 px-3 rounded-2xl shadow-lg transition-all duration-200 bg-background/95 backdrop-blur-md border border-border ${
              justAdded ? "animate-[wiggle_0.6s_ease-in-out]" : ""
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-accent grid place-items-center">
                <ShoppingBag className="w-3.5 h-3.5 text-accent-foreground" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-xs font-medium text-muted-foreground">{count} item{count !== 1 ? 's' : ''}</span>
                <span className="text-sm font-bold">₹{total.toFixed(0)}</span>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              className="px-4 py-1.5 rounded-md bg-accent text-accent-foreground text-sm font-semibold shadow-sm hover:bg-accent/90 transition-colors"
            >
              View Cart
            </button>
          </button>
        </div>
      )}

      {/* Expanded sheet - slim and compact */}
      {expanded && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setExpanded(false)} />
          <div className="relative bg-background rounded-t-2xl shadow-xl border-t border-border max-w-md w-full mx-auto flex flex-col max-h-[70vh] animate-in slide-in-from-bottom-2">

            {/* Slim handle */}
            <div className="flex justify-center pt-2 pb-0.5 shrink-0">
              <div className="w-8 h-1 bg-muted rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-accent grid place-items-center">
                  <ShoppingBag className="w-4 h-4 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-sm font-bold">{cafe?.name}</p>
                  <p className="text-xs text-muted-foreground">{count} items · ₹{total.toFixed(2)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-accent">₹{total.toFixed(2)}</span>
                <button onClick={() => setExpanded(false)} className="w-7 h-7 rounded-full bg-muted grid place-items-center">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Items - compact */}
            <div className="flex-1 overflow-y-auto px-2 py-1">
              {cart.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 px-1.5 rounded-lg hover:bg-muted/30">
                  <div className="min-w-0 flex-1 mr-2">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">₹{Number(c.price).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => dec(c.id)} className="w-7 h-7 rounded-full bg-muted grid place-items-center">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-bold w-5 text-center">{c.qty}</span>
                    <button onClick={() => inc(c.id)} className="w-7 h-7 rounded-full bg-muted grid place-items-center">
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-bold min-w-[50px] text-right">₹{(Number(c.price) * c.qty).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer - compact */}
            <div className="px-3 pt-2 pb-4 border-t border-border/50 shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Table</label>
                <Input value={tableNo} onChange={e => setTableNo(e.target.value)}
                  placeholder="Optional" disabled={!!lockedTable} maxLength={10} className="h-8 text-sm flex-1" />
                {lockedTable && (
                  <span className="text-xs font-medium bg-accent text-accent-foreground px-2 py-1 rounded-full">T{lockedTable}</span>
                )}
              </div>

              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={() => { setExpanded(false); navigate("/app/menu"); }}>
                  + Add More
                </Button>
                {count > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 h-9 text-xs font-bold bg-accent text-accent-foreground hover:bg-accent/90"
                    onClick={user ? handleCheckout : () => { setExpanded(false); navigate("/auth?mode=signin&returnTo=/app"); }}
                    disabled={placing}
                  >
                    {placing ? <Loader2 className="w-3 h-3 animate-spin" /> : user ? `Pay ₹${total.toFixed(0)}` : "Sign in to Pay"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment dialog */}
      {paidOrder && (
        <PaymentDialog
          open={!!paidOrder}
          onOpenChange={v => {
            if (!v) {
              setPaidOrder(null);
              setExpanded(false);
              clear();
              navigate("/app/orders");
            }
          }}
          orderId={paidOrder.id}
          cafeId={cafe!.id}
          cafeName={cafe!.name}
          amount={paidOrder.total}
          customerName={profile?.full_name ?? user?.email ?? "Guest"}
          customerPhone={profile?.phone}
          onPaid={() => {
            setPaidOrder(null);
            clear();
            navigate("/app/orders");
          }}
        />
      )}
    </>
  );

  async function handleCheckout() {
    if (!user || placing || !cafe) return;
    setPlacing(true);
    try {
      const result = await placeOrder({
        cafeId: cafe.id,
        customerUserId: user.id,
        customerName: profile?.full_name ?? user.email ?? "Guest",
        customerPhone: profile?.phone ?? null,
        cart: cart.map(c => ({ id: c.id, qty: c.qty })),
        source: lockedTable ? "table" : "app",
        tableNo: tableNo.trim() || null,
        loginSession,
      });
      if (result) {
        // Save cart items before clearing, then show payment dialog
        const orderTotal = result.totalAmount;
        setExpanded(false);
        setPaidOrder({ id: result.id, total: orderTotal });
      }
    } catch (e: unknown) {
      toast.error((e as Error).message || "Could not place order");
    } finally {
      setPlacing(false);
    }
  }
}