import { useEffect, useState } from "react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Loader2, ShoppingBag, Check, X, RotateCcw, AlertCircle, ChefHat, Package, Utensils, ReceiptText, CheckCircle2, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { setActiveCafe } from "@/lib/cafeContext";
import { PaymentDialog } from "@/components/PaymentDialog";
import type { Database } from "@/integrations/supabase/types";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type Order = OrderRow & {
  cafe?: { name: string };
  order_items?: OrderItem[];
  refund_requested?: boolean;
  refund_workflow_status?: 'none' | 'requested' | 'refunded' | 'rejected';
  refund_rejection_reason?: string | null;
};
type OrderItem = { id: string; order_id: string; name: string; price: number; quantity: number; menu_item_id: string | null };

const TIMELINE = [
  { key: "placed", label: "Placed", icon: ShoppingBag },
  { key: "accepted", label: "Accepted", icon: CheckCircle2 },
  { key: "preparing", label: "Preparing", icon: ChefHat },
  { key: "ready", label: "Ready", icon: Package },
  { key: "completed", label: "Done", icon: Utensils },
];

export default function CustomerOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; orderId: string | null }>({ open: false, orderId: null });
  const [refundDialog, setRefundDialog] = useState<{ open: boolean; orderId: string | null }>({ open: false, orderId: null });
  const navigate = useNavigate();

  const fetchAll = async () => {
    if (!user) return;
    const { data } = await supabase.from("orders")
      .select("*, cafe:cafes(name), order_items(*)")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false }).limit(50);
    
    if (data) {
      const ordersData = data as unknown as Order[];
      setOrders(ordersData);
      const map: Record<string, OrderItem[]> = {};
      ordersData.forEach((o) => map[o.id] = o.order_items || []);
      setItems(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    void fetchAll();
    const sub = supabase.channel(`customer_orders:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `customer_user_id=eq.${user.id}` }, () => {
        void fetchAll();
      })
      .subscribe();
    return () => { void supabase.removeChannel(sub); };
  }, [user]);

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
    const { data, error } = await supabase.rpc("initiate_refund_request" as never, { _order_id: refundDialog.orderId });
    if (error) toast.error(error.message);
    else if (data && !(data as RefundResponse).success) {
      toast.error((data as RefundResponse).error || "Unknown error");
    } else toast.success("Refund request sent");
    setRefundDialog({ open: false, orderId: null });
  };

  const handleReorder = async (o: Order) => {
    setLoading(true);
    try {
      const { data: cafe } = await supabase.from("cafes").select("id, slug, name").eq("id", o.cafe_id).single();
      if (!cafe) throw new Error("Cafe not found");
      setActiveCafe({ id: cafe.id, slug: cafe.slug, name: cafe.name });
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
      toast.success(`Added items to cart`);
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
          const idx = currentIdx === -1 && (o.status === "delivered" || o.status === "completed" || o.status === "served") ? 4 : currentIdx;
          const isPaid = o.payment_status === "paid";
          
          return (
            <Card key={o.id} className="p-4 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold">Order #{o.id.slice(0, 6).toUpperCase()}</p>
                    {o.table_no && <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-medium">Table {o.table_no}</span>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-accent">₹{Number(o.total_amount).toFixed(2)}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    isPaid ? 'bg-success/10 text-success' : (o.status === 'cancelled' ? 'bg-muted text-muted-foreground' : 'bg-amber-500/10 text-amber-600')
                  }`}>
                    {o.status === 'cancelled' && !isPaid ? 'UNPAID' : o.payment_status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Status Section */}
              {o.status === "cancelled" ? (
                <div className="bg-destructive/5 border border-destructive/10 rounded-xl p-3 mb-4">
                  <div className="flex items-center gap-2 text-destructive font-bold text-xs mb-1">
                    <X className="w-4 h-4" /> Order Cancelled
                  </div>
                  {isPaid && (
                    <div className="mt-2 pt-2 border-t border-destructive/10">
                      {o.refund_workflow_status === 'requested' ? (
                        <div className="text-[10px] text-amber-600 font-bold italic animate-pulse flex items-center gap-2">
                          <RotateCcw className="w-3 h-3" /> Refund pending review
                        </div>
                      ) : o.refund_workflow_status === 'refunded' ? (
                        <div className="text-[10px] text-success font-bold flex items-center gap-2 uppercase">
                          <Check className="w-3 h-3" /> Amount Refunded
                        </div>
                      ) : o.refund_workflow_status === 'rejected' ? (
                        <div className="space-y-2">
                          <div className="text-[10px] text-destructive font-bold flex items-center gap-2 uppercase">
                            <X className="w-3 h-3" /> Refund Denied
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
                {!isPaid && o.status !== 'cancelled' && (
                  <Button variant="hero" size="sm" className="flex-1 h-8 gap-2" onClick={() => setPaymentOrder(o)}>
                    <Smartphone className="w-3 h-3" /> Pay ₹{Number(o.total_amount).toFixed(2)}
                  </Button>
                )}
                {!o.cancellation_requested && o.status !== "cancelled" && (o.status === "placed" || o.status === "accepted") && (
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
          onPaid={() => {
            setPaymentOrder(null);
            void fetchAll();
          }}
        />
      )}

      {/* Cancel Order Confirmation Dialog */}
      <AlertDialog open={cancelDialog.open} onOpenChange={(open) => setCancelDialog({ ...cancelDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request Cancellation</AlertDialogTitle>
            <AlertDialogDescription>
              Request cancellation? Staff will review your request before the order is cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelConfirm}>Request Cancellation</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refund Request Confirmation Dialog */}
      <AlertDialog open={refundDialog.open} onOpenChange={(open) => setRefundDialog({ ...refundDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Initiate Refund Request</AlertDialogTitle>
            <AlertDialogDescription>
              Initiate a refund request for this order? Staff will review your request.
            </AlertDialogDescription>
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
