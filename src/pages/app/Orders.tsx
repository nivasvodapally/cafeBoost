import { useEffect, useState } from "react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingBag, Check, X, RotateCcw, AlertCircle, ChefHat, Package, Utensils } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { setActiveCafe } from "@/lib/cafeContext";

type Order = { 
  id: string; status: string; total_amount: number; subtotal: number; tax_amount: number; created_at: string; customer_name: string; customer_phone: string | null; cafe_id: string; payment_status: string; source: string;
  wait_eta_minutes?: number | null; eta_updated_at?: string | null; cancellation_requested: boolean;
  refund_requested: boolean; refunded_at?: string | null;
  refund_workflow_status?: 'none' | 'requested' | 'refunded' | 'rejected';
  refund_rejection_reason?: string | null;
};
type OrderItem = { id: string; order_id: string; name: string; price: number; quantity: number; menu_item_id: string | null };

const TIMELINE = [
  { key: "placed", label: "Placed", icon: ShoppingBag },
  { key: "accepted", label: "Preparing", icon: ChefHat },
  { key: "ready", label: "Ready", icon: Package },
  { key: "completed", label: "Enjoy", icon: Utensils },
];

export default function CustomerOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchAll = async () => {
    if (!user) return;
    const { data } = await supabase.from("orders")
      .select("*, order_items(*)")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false }).limit(50);
    
    if (data) {
      setOrders(data as any[]);
      const map: Record<string, OrderItem[]> = {};
      data.forEach((o: any) => map[o.id] = o.order_items || []);
      setItems(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchAll();
    const sub = supabase.channel(`customer_orders:${user?.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `customer_user_id=eq.${user?.id}` }, () => {
        void fetchAll();
      })
      .subscribe();
    return () => { void supabase.removeChannel(sub); };
  }, [user]);

  const cancelByCustomer = async (id: string) => {
    if (!confirm("Request cancellation?")) return;
    const { error } = await supabase.rpc("cancel_order_by_customer", { _order_id: id });
    if (error) toast.error(error.message);
    else toast.success("Request sent");
  };

  const requestRefund = async (id: string) => {
    if (!confirm("Initiate a refund request?")) return;
    const { data, error } = await supabase.rpc("initiate_refund_request", { _order_id: id });
    if (error) toast.error(error.message);
    else if (data && !(data as any).success) toast.error((data as any).error);
    else toast.success("Refund request sent");
  };

  const handleReorder = async (o: Order) => {
    setLoading(true);
    try {
      // 1. Get cafe details to set context
      const { data: cafe } = await supabase.from("cafes").select("id, slug, name").eq("id", o.cafe_id).single();
      if (!cafe) throw new Error("Cafe not found");

      setActiveCafe({ id: cafe.id, slug: cafe.slug, name: cafe.name });

      // 2. Populate cart
      const orderItems = items[o.id] || [];
      const cart = orderItems.map(i => ({
        id: i.menu_item_id || i.id,
        name: i.name,
        price: Number(i.price),
        qty: i.quantity,
        category: "Order History",
        available: true
      }));
      
      localStorage.setItem(`cafeboost:cart:${o.cafe_id}`, JSON.stringify(cart));
      
      // 3. Go to menu
      toast.success(`Items from ${cafe.name} added to cart`);
      navigate("/app/menu");
    } catch (e) {
      toast.error("Could not reorder");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <CustomerLayout title="My Orders"><div className="grid place-items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></CustomerLayout>;

  return (
    <CustomerLayout title="My Orders">
      <div className="space-y-4 pb-20 px-4">
        {orders.length === 0 ? (
          <div className="text-center py-20 bg-muted/30 rounded-3xl border border-dashed border-border px-6">
            <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="font-display text-xl font-bold">No orders yet</p>
          </div>
        ) : orders.map(o => {
          const currentIdx = TIMELINE.findIndex(t => t.key === o.status);
          const idx = currentIdx === -1 && o.status === "delivered" ? 3 : currentIdx;
          
          return (
            <Card key={o.id} className="p-4 overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-bold">Order #{o.id.slice(0, 6).toUpperCase()}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-accent">₹{Number(o.total_amount).toFixed(2)}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${o.payment_status === 'paid' ? 'bg-success/10 text-success' : 'bg-amber-500/10 text-amber-600'}`}>{o.payment_status.toUpperCase()}</span>
                </div>
              </div>

              {/* Status Section */}
              {o.status === "cancelled" ? (
                <div className="bg-destructive/5 border border-destructive/10 rounded-xl p-3 mb-4">
                  <div className="flex items-center gap-2 text-destructive font-bold text-xs mb-1">
                    <X className="w-4 h-4" /> Order Cancelled
                  </div>
                  
                  {o.payment_status === "paid" && (
                    <div className="mt-2 pt-2 border-t border-destructive/10">
                      {o.refund_workflow_status === 'requested' ? (
                        <div className="text-[10px] text-amber-600 font-bold italic animate-pulse flex items-center gap-2">
                          <RotateCcw className="w-3 h-3" /> Refund pending manager review
                        </div>
                      ) : o.refund_workflow_status === 'refunded' ? (
                        <div className="text-[10px] text-success font-bold flex items-center gap-2 uppercase">
                          <Check className="w-3 h-3" /> Amount Refunded
                        </div>
                      ) : o.refund_workflow_status === 'rejected' ? (
                        <div className="space-y-2">
                          <div className="text-[10px] text-destructive font-bold flex items-center gap-2 uppercase">
                            <X className="w-3 h-3" /> Refund Request Denied
                          </div>
                          {o.refund_rejection_reason && <p className="text-[10px] text-muted-foreground italic px-2 py-1 bg-white/50 rounded text-center border border-destructive/5">"{o.refund_rejection_reason}"</p>}
                          <Button variant="outline" size="sm" className="w-full h-7 text-[10px]" onClick={() => requestRefund(o.id)}>Request Again</Button>
                        </div>
                      ) : (
                        <Button variant="hero" size="sm" className="w-full h-8" onClick={() => requestRefund(o.id)}>
                          <RotateCcw className="w-3 h-3 mr-1" /> Request Refund
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : o.cancellation_requested ? (
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 mb-4 flex items-center gap-2 text-amber-600 font-bold text-xs">
                  <AlertCircle className="w-4 h-4" /> Cancellation Pending
                </div>
              ) : (
                <div className="flex justify-between mb-4 px-2">
                  {TIMELINE.map((step, i) => {
                    const reached = i <= idx;
                    const Icon = step.icon;
                    return (
                      <div key={step.key} className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full grid place-items-center ${reached ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20" : "bg-muted text-muted-foreground"}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={`text-[8px] mt-1 font-bold uppercase ${reached ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Items List */}
              <div className="space-y-1 mb-4 border-t border-border/50 pt-3">
                {(items[o.id] || []).map(item => (
                  <div key={item.id} className="flex justify-between text-xs text-muted-foreground">
                    <span>{item.quantity}× {item.name}</span>
                    <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Bottom Actions */}
              <div className="flex gap-2">
                {!o.cancellation_requested && o.status !== "cancelled" && (o.status === "placed" || o.status === "accepted") && (
                  <Button variant="outline" size="sm" className="flex-1 text-destructive border-destructive/20 h-8" onClick={() => cancelByCustomer(o.id)}>Cancel</Button>
                )}
                <Button variant="outline" size="sm" className="flex-1 h-8" onClick={() => handleReorder(o)}><RotateCcw className="w-3 h-3 mr-1" /> Reorder</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </CustomerLayout>
  );
}
