import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cartContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, ShoppingBag, Check, X, RotateCcw, AlertCircle, ChefHat, Package, Utensils, ReceiptText, CheckCircle2, Smartphone, Star, Clock, Zap, Crown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { setActiveCafe } from "@/lib/cafeContext";
import { PaymentDialog } from "@/components/PaymentDialog";
import type { Database } from "@/integrations/supabase/types";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type Order = OrderRow & {
  cafe?: { name: string };
  order_items?: OrderItem[];
  refund_workflow_status?: 'none' | 'requested' | 'refunded' | 'rejected';
  refund_rejection_reason?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'vip';
  split_parent_id?: string | null;
  split_sequence?: number | null;
  split_total_count?: number | null;
};
type OrderItem = { id: string; order_id: string; name: string; price: number; quantity: number; menu_item_id: string | null };

const TIMELINE = [
  { key: "placed", label: "Placed", icon: ShoppingBag },
  { key: "accepted", label: "Accepted", icon: CheckCircle2 },
  { key: "preparing", label: "Preparing", icon: ChefHat },
  { key: "ready", label: "Ready", icon: Package },
  { key: "completed", label: "Done", icon: Utensils },
];

const getPriorityBadge = (priority: Order['priority']) => {
  switch (priority) {
    case 'low': return { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock, label: 'Low' };
    case 'normal': return { bg: 'bg-blue-100', text: 'text-blue-700', icon: Star, label: 'Normal' };
    case 'high': return { bg: 'bg-amber-100', text: 'text-amber-700', icon: Zap, label: 'High' };
    case 'vip': return { bg: 'bg-purple-100', text: 'text-purple-700', icon: Crown, label: 'VIP' };
    default: return { bg: 'bg-blue-100', text: 'text-blue-700', icon: Star, label: 'Normal' };
  }
};

function LiveETABox({ orderId, etaMinutes, updatedAt }: { orderId: string; etaMinutes: number; updatedAt: string | null }) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!updatedAt) return;
    const calcRemaining = () => {
      const setAt = new Date(updatedAt).getTime();
      const elapsed = (Date.now() - setAt) / 1000 / 60;
      const remaining = Math.max(0, etaMinutes - elapsed);
      return remaining;
    };
    setCountdown(calcRemaining());
    timerRef.current = setInterval(() => setCountdown(calcRemaining()), 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [updatedAt, etaMinutes]);

  if (countdown === null) return (
    <div className="mb-4 px-2">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          <div>
            <p className="text-xs font-bold text-blue-800">Estimated Ready Time</p>
            <p className="text-xs text-blue-600">{etaMinutes} minute{etaMinutes !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <p className="text-xs text-blue-500/70">Updated {updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
      </div>
    </div>
  );
  const isUrgent = countdown <= 2;
  return (
    <div className="mb-4 px-2">
      <div className={`rounded-xl p-3 flex items-center justify-between border ${isUrgent ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${isUrgent ? 'text-amber-600 animate-pulse' : 'text-blue-600'}`} />
          <div>
            <p className={`text-xs font-bold ${isUrgent ? 'text-amber-800' : 'text-blue-800'}`}>Estimated Ready</p>
            {countdown > 0 ? (
              <p className={`text-xs font-bold ${isUrgent ? 'text-amber-600' : 'text-blue-600'}`}>
                ~{countdown.toFixed(0)} min remaining
              </p>
            ) : (
              <p className="text-xs font-bold text-success">Ready now!</p>
            )}
          </div>
        </div>
        {updatedAt && (
          <p className={`text-xs ${isUrgent ? 'text-amber-500/70' : 'text-blue-500/70'}`}>
            Set {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}

export default function CustomerOrders() {
  const { user } = useAuth();
  const { add } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; orderId: string | null }>({ open: false, orderId: null });
  const [refundDialog, setRefundDialog] = useState<{ open: boolean; orderId: string | null }>({ open: false, orderId: null });
  const navigate = useNavigate();

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("orders")
      .select("*, cafe:cafes(name), order_items(*)")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false }).limit(50);
    if (data) {
      setOrders(data as unknown as Order[]);
      const map: Record<string, OrderItem[]> = {};
      (data as unknown as Order[]).forEach((o) => map[o.id] = (o as any).order_items || []);
      setItems(map);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchAll();
    const sub = supabase.channel(`customer_orders:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `customer_user_id=eq.${user.id}` }, () => {
        void fetchAll();
      })
      .subscribe();
    return () => { void supabase.removeChannel(sub); };
  }, [user, fetchAll]);

  const cancelByCustomer = async (id: string) => {
    setCancelDialog({ open: true, orderId: id });
  };

  const handleCancelConfirm = async () => {
    if (!cancelDialog.orderId) return;
    const { error } = await supabase.rpc("cancel_order_by_customer", { _order_id: cancelDialog.orderId });
    if (error) toast.error(error.message);
    else toast.success("Request sent");
    setCancelDialog({ open: false, orderId: null });
  };

  const requestRefund = async (id: string) => {
    setRefundDialog({ open: true, orderId: id });
  };

  const handleRefundConfirm = async () => {
    if (!refundDialog.orderId) return;
    type RefundResponse = { success?: boolean; error?: string };
    const { data, error } = await supabase.rpc("initiate_refund_request", { _order_id: refundDialog.orderId });
    if (error) toast.error(error.message);
    else if (data && !(data as RefundResponse).success) {
      toast.error((data as RefundResponse).error || "Unknown error");
    } else toast.success("Refund request sent");
    setRefundDialog({ open: false, orderId: null });
  };

  const handleReorder = async (o: Order) => {
    try {
      // Get cafe info first
      const { data: cafe, error: cafeError } = await supabase.from("cafes").select("id, slug, name").eq("id", o.cafe_id).single();
      if (cafeError || !cafe) throw new Error("Cafe not found");

      // Get order items
      const orderItems = items[o.id] || [];
      if (orderItems.length === 0) {
        toast.error("No items to reorder");
        return;
      }

      // Use setActiveCafe to properly update the context (this emits to listeners)
      setActiveCafe(cafe);

      // Prepare cart items with qty
      const cartItems = orderItems.map(i => ({
        id: i.menu_item_id || i.id,
        name: i.name,
        price: Number(i.price) || 0,
        qty: i.quantity || 1,
      }));

      // Save to localStorage
      const cartKey = `cafeboost:cart:${cafe.id}`;
      localStorage.setItem(cartKey, JSON.stringify(cartItems));

      // Set flag to auto-open cart after navigation
      sessionStorage.setItem("cafeboost:autoOpenCart", "true");

      // Navigate to menu page
      navigate(`/app/menu?cafe=${cafe.slug}`);
    } catch (err) {
      toast.error("Could not reorder");
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
          const idx = currentIdx === -1 && ["delivered", "completed", "served"].includes(o.status) ? 4 : currentIdx;
          const isPaid = o.payment_status === "paid";

          return (
            <Card key={o.id} className="p-4 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold">Order #{o.id.slice(0, 6).toUpperCase()}</p>
                    {o.table_no && <span className="text-xs bg-muted px-2 py-1 rounded-full font-medium">Table {o.table_no}</span>}
                    {o.priority && o.priority !== 'normal' && (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${getPriorityBadge(o.priority).bg} ${getPriorityBadge(o.priority).text}`}>
                        {(() => { const Icon = getPriorityBadge(o.priority).icon; return <Icon className="w-3 h-3" />; })()}
                        {getPriorityBadge(o.priority).label}
                      </span>
                    )}
                    {o.split_parent_id && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                        Split
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                  {o.split_total_count && o.split_total_count > 1 && (
                    <p className="text-xs text-green-600 mt-1">Part {o.split_sequence} of {o.split_total_count}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-accent">₹{Number(o.total_amount).toFixed(2)}</p>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${
                    isPaid ? 'bg-success/10 text-success' : (o.status === 'cancelled' ? 'bg-muted text-muted-foreground' : 'bg-amber-500/10 text-amber-600')
                  }`}>
                    {o.status === 'cancelled' && !isPaid ? 'UNPAID' : o.payment_status.toUpperCase()}
                  </span>
                </div>
              </div>

              {o.status === "cancelled" ? (
                <div className="bg-destructive/5 border border-destructive/10 rounded-xl p-3 mb-4">
                  <div className="flex items-center gap-2 text-destructive font-bold text-xs mb-1">
                    <X className="w-4 h-4" /> Order Cancelled
                  </div>
                  {isPaid && (
                    <div className="mt-2 pt-2 border-t border-destructive/10">
                      {o.refund_workflow_status === 'requested' ? (
                        <div className="text-xs text-amber-600 font-bold italic animate-pulse flex items-center gap-2">
                          <RotateCcw className="w-3 h-3" /> Refund pending review
                        </div>
                      ) : o.refund_workflow_status === 'refunded' ? (
                        <div className="text-xs text-success font-bold flex items-center gap-2 uppercase">
                          <Check className="w-3 h-3" /> Amount Refunded
                        </div>
                      ) : o.refund_workflow_status === 'rejected' ? (
                        <div className="space-y-2">
                          <div className="text-xs text-destructive font-bold flex items-center gap-2 uppercase">
                            <X className="w-3 h-3" /> Refund Denied
                          </div>
                          {o.refund_rejection_reason && <p className="text-xs text-muted-foreground italic px-2 py-1 bg-white/50 rounded text-center border border-destructive/5">"{o.refund_rejection_reason}"</p>}
                          <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => requestRefund(o.id)}>Request Again</Button>
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
                <>
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

                  {o.wait_eta_minutes != null && o.status !== 'completed' && (
                    <LiveETABox orderId={o.id} etaMinutes={o.wait_eta_minutes} updatedAt={o.eta_updated_at} />
                  )}
                </>
              )}

              <div className="space-y-1 mb-4 border-t border-border/50 pt-3">
                {(items[o.id] || []).map(item => (
                  <div key={item.id} className="flex justify-between text-xs text-muted-foreground">
                    <span>{item.quantity}× {item.name}</span>
                    <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 flex-wrap">
                {!isPaid && o.status !== 'cancelled' && (
                  <Button variant="hero" size="sm" className="flex-1 h-8 gap-2" onClick={() => setPaymentOrder(o)}>
                    <Smartphone className="w-3 h-3" /> Pay ₹{Number(o.total_amount).toFixed(2)}
                  </Button>
                )}
                {!o.cancellation_requested && o.status !== "cancelled" && ["placed", "accepted"].includes(o.status) && (
                  <Button variant="outline" size="sm" className="flex-1 text-destructive border-destructive/20 h-8" onClick={() => cancelByCustomer(o.id)}>Cancel</Button>
                )}
                {isPaid && (
                  <Button variant="outline" size="sm" className="flex-1 h-8 gap-2" onClick={() => navigate(`/app/orders/${o.id}/invoice`)}>
                    <ReceiptText className="w-3 h-3" /> Invoice
                  </Button>
                )}
                <Button variant="outline" size="sm" className="flex-1 h-8 gap-1" onClick={() => handleReorder(o)}>
                  <RotateCcw className="w-3 h-3" /> Reorder
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {paymentOrder && (
        <PaymentDialog
          open={!!paymentOrder}
          onOpenChange={(v) => { if (!v) setPaymentOrder(null); }}
          orderId={paymentOrder.id}
          cafeId={paymentOrder.cafe_id}
          cafeName={paymentOrder.cafe?.name}
          amount={paymentOrder.total_amount}
          customerName={paymentOrder.customer_name}
          customerPhone={paymentOrder.customer_phone}
          onPaid={() => { setPaymentOrder(null); void fetchAll(); }}
        />
      )}

      <AlertDialog open={cancelDialog.open} onOpenChange={(open) => setCancelDialog({ ...cancelDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request Cancellation</AlertDialogTitle>
            <AlertDialogDescription>Request cancellation? Staff will review your request before the order is cancelled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm}>Request Cancellation</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={refundDialog.open} onOpenChange={(open) => setRefundDialog({ ...refundDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Initiate Refund Request</AlertDialogTitle>
            <AlertDialogDescription>Initiate a refund request for this order? Staff will review your request.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRefundConfirm}>Request Refund</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CustomerLayout>
  );
}
