import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShoppingBag, Check, X, RotateCcw, AlertCircle, ChefHat, Package, Utensils, ReceiptText, CheckCircle2, Smartphone, Star, Edit, Split, Clock, Zap, Crown, Plus, Minus, Info, Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { setActiveCafe } from "@/lib/cafeContext";
import { PaymentDialog } from "@/components/PaymentDialog";
import { OrderModificationService } from "@/services/orderModificationService";
import type { Database } from "@/integrations/supabase/types";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type Order = OrderRow & {
  cafe?: { name: string };
  order_items?: OrderItem[];
  refund_requested?: boolean;
  refund_workflow_status?: 'none' | 'requested' | 'refunded' | 'rejected';
  refund_rejection_reason?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'vip';
  original_order_id?: string | null;
  modification_reason?: string | null;
  modified_by?: string | null;
  modified_at?: string | null;
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

// Helper function to get priority badge styling
const getPriorityBadge = (priority: Order['priority']) => {
  switch (priority) {
    case 'low':
      return { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock, label: 'Low' };
    case 'normal':
      return { bg: 'bg-blue-100', text: 'text-blue-700', icon: Star, label: 'Normal' };
    case 'high':
      return { bg: 'bg-amber-100', text: 'text-amber-700', icon: Zap, label: 'High' };
    case 'vip':
      return { bg: 'bg-purple-100', text: 'text-purple-700', icon: Crown, label: 'VIP' };
    default:
      return { bg: 'bg-blue-100', text: 'text-blue-700', icon: Star, label: 'Normal' };
  }
};

export default function CustomerOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; orderId: string | null }>({ open: false, orderId: null });
  const [refundDialog, setRefundDialog] = useState<{ open: boolean; orderId: string | null }>({ open: false, orderId: null });
  const [splitDialog, setSplitDialog] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [splitCount, setSplitCount] = useState(2);
  const [customSplits, setCustomSplits] = useState<Record<string, number>>({});
  const [splitLoading, setSplitLoading] = useState(false);
  const [callDialog, setCallDialog] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null });
  const [callLoading, setCallLoading] = useState(false);
  const navigate = useNavigate();

  const fetchAll = useCallback(async () => {
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

  const handleSplitOrder = async (o: Order) => {
    try {
      // Check if order can be split (has multiple items)
      const orderItems = items[o.id] || [];
      if (orderItems.length <= 1) {
        toast.error("Order must have at least 2 items to split.");
        return;
      }
      
      setSplitDialog({ open: true, order: o });
      setSplitType('equal');
      setSplitCount(2);
      setCustomSplits({});
    } catch (error) {
      console.error('Error preparing split:', error);
      toast.error("Unable to prepare order split. Please try again.");
    }
  };

  const handleSplitSubmit = async () => {
    if (!splitDialog.order) {
      toast.error("No order selected for splitting.");
      return;
    }

    setSplitLoading(true);
    try {
      const orderItems = items[splitDialog.order.id] || [];
      const totalAmount = splitDialog.order.total_amount;
      
      let splits;
      if (splitType === 'equal') {
        // Calculate equal split amounts
        const splitAmount = Math.floor(totalAmount / splitCount);
        splits = Array.from({ length: splitCount }, (_, i) => ({
          name: `Split ${i + 1}`,
          amount: i === splitCount - 1 ? totalAmount - (splitAmount * (splitCount - 1)) : splitAmount
        }));
      } else {
        // Use custom splits
        const totalCustom = Object.values(customSplits).reduce((sum, amount) => sum + amount, 0);
        if (Math.abs(totalCustom - totalAmount) > 1) { // Allow 1 cent rounding difference
          toast.error(`Custom split amounts (${totalCustom}) must equal order total (${totalAmount}).`);
          setSplitLoading(false);
          return;
        }
        splits = Object.entries(customSplits).map(([name, amount]) => ({
          name,
          amount
        }));
      }

      const result = await OrderModificationService.splitOrder({
        orderId: splitDialog.order.id,
        splits: splits.map((split, index) => ({
          name: split.name,
          amount: split.amount,
          sequence: index + 1,
        })),
      });

      if (result.success) {
        toast.success(`Order split into ${splits.length} parts successfully!`);
        setSplitDialog({ open: false, order: null });
        void fetchAll(); // Refresh orders
      } else {
        toast.error(result.error || "Failed to split order.");
      }
    } catch (error) {
      console.error('Error splitting order:', error);
      toast.error("An error occurred while splitting the order.");
    } finally {
      setSplitLoading(false);
    }
  };

  const handleCallStaff = async () => {
    if (!callDialog.order || !user) return;
    setCallLoading(true);
    try {
      const { error } = await supabase.rpc('call_staff', {
        _order_id: callDialog.order.id,
        _cafe_id: callDialog.order.cafe_id,
        _customer_name: callDialog.order.customer_name,
        _table_no: callDialog.order.table_no,
        _message: null,
      });
      if (error) throw error;
      toast.success("Staff called — they'll be with you shortly");
      setCallDialog({ open: false, order: null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not call staff");
    } finally {
      setCallLoading(false);
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
                    {o.table_no && <span className="text-xs bg-muted px-2 py-1 rounded-full font-medium">Table {o.table_no}</span>}
                    {/* Priority Badge */}
                    {o.priority && o.priority !== 'normal' && (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${getPriorityBadge(o.priority).bg} ${getPriorityBadge(o.priority).text}`}>
                        {(() => {
                          const Icon = getPriorityBadge(o.priority).icon;
                          return <Icon className="w-3 h-3" />;
                        })()}
                        {getPriorityBadge(o.priority).label}
                      </span>
                    )}
                    {/* Modification Indicator */}
                    {o.original_order_id && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                        <Edit className="w-3 h-3" /> Modified
                      </span>
                    )}
                    {/* Split Order Indicator */}
                    {o.split_parent_id && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                        <Split className="w-3 h-3" /> Split
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                  {/* Modification details */}
                  {o.modification_reason && (
                    <p className="text-xs text-blue-600 mt-1 italic">"{o.modification_reason}"</p>
                  )}
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

              {/* Status Section */}
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
                  
                  {/* ETA Display */}
                  {o.wait_eta_minutes !== null && o.wait_eta_minutes !== undefined && o.status !== 'completed' && (
                    <div className="mb-4 px-2">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-600" />
                          <div>
                            <p className="text-xs font-bold text-blue-800">Estimated Ready Time</p>
                            <p className="text-xs text-blue-600">
                              {o.wait_eta_minutes} minute{o.wait_eta_minutes !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        {o.eta_updated_at && (
                          <p className="text-xs text-blue-500/70">
                            Updated {new Date(o.eta_updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
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
                {/* Call Staff Button — only for in-progress orders with a table */}
                {o.table_no && !["completed", "cancelled"].includes(o.status) && (
                  <Button variant="outline" size="sm" className="flex-1 h-8 gap-1" onClick={() => setCallDialog({ open: true, order: o })}>
                    <Bell className="w-3 h-3" /> Call Staff
                  </Button>
                )}
                {!o.cancellation_requested && o.status !== "cancelled" && (o.status === "placed" || o.status === "accepted") && (
                  <Button variant="outline" size="sm" className="flex-1 text-destructive border-destructive/20 h-8" onClick={() => cancelByCustomer(o.id)}>Cancel</Button>
                )}
                {/* Order Split Button - only for orders with multiple items */}
                {!o.split_parent_id && (o.status === "placed" || o.status === "accepted") && (items[o.id]?.length || 0) > 1 && (
                  <Button variant="outline" size="sm" className="flex-1 h-8 gap-1" onClick={() => handleSplitOrder(o)}>
                    <Split className="w-3 h-3" /> Split
                  </Button>
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
 
 
      {/* Order Split Dialog */}
      <Dialog open={splitDialog.open} onOpenChange={(open) => setSplitDialog({ ...splitDialog, open })}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Split Order</DialogTitle>
            <DialogDescription>
              Split order #{splitDialog.order?.id.slice(0, 6).toUpperCase()} into multiple parts for separate payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Split Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={splitType === 'equal' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSplitType('equal')}
                >
                  Equal Split
                </Button>
                <Button
                  type="button"
                  variant={splitType === 'custom' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSplitType('custom')}
                >
                  Custom Split
                </Button>
              </div>
            </div>
 
            {splitType === 'equal' ? (
              <div className="space-y-2">
                <Label htmlFor="split-count">Number of splits</Label>
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
                    disabled={splitCount <= 2}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <div className="text-center flex-1">
                    <span className="text-2xl font-bold">{splitCount}</span>
                    <p className="text-xs text-muted-foreground">parts</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setSplitCount(Math.min(10, splitCount + 1))}
                    disabled={splitCount >= 10}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Each part: ₹{splitDialog.order ? (splitDialog.order.total_amount / splitCount).toFixed(2) : '0.00'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Custom Split Amounts</Label>
                <div className="space-y-2">
                  {splitDialog.order && (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span>Split 1</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">₹</span>
                          <Input
                            type="number"
                            className="w-24"
                            value={customSplits['Split 1'] || ''}
                            onChange={(e) => setCustomSplits({ ...customSplits, 'Split 1': Number(e.target.value) })}
                            placeholder="Amount"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Split 2</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">₹</span>
                          <Input
                            type="number"
                            className="w-24"
                            value={customSplits['Split 2'] || ''}
                            onChange={(e) => setCustomSplits({ ...customSplits, 'Split 2': Number(e.target.value) })}
                            placeholder="Amount"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          const nextSplit = Object.keys(customSplits).length + 1;
                          setCustomSplits({ ...customSplits, [`Split ${nextSplit}`]: 0 });
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Another Split
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total: ₹{Object.values(customSplits).reduce((sum, amount) => sum + amount, 0).toFixed(2)} /
                  Order Total: ₹{splitDialog.order?.total_amount.toFixed(2) || '0.00'}
                </p>
              </div>
            )}
 
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800 font-medium flex items-center gap-2">
                <Info className="w-4 h-4" />
                Each split will create a separate order for payment. Staff will be notified.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitDialog({ open: false, order: null })} disabled={splitLoading}>
              Cancel
            </Button>
            <Button onClick={handleSplitSubmit} disabled={splitLoading}>
              {splitLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Splitting...
                </>
              ) : (
                'Split Order'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call Staff Dialog */}
      <Dialog open={callDialog.open} onOpenChange={(open) => setCallDialog({ ...callDialog, open })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bell className="w-5 h-5 text-accent" /> Call Staff</DialogTitle>
            <DialogDescription>
              Send a notification to staff that you need assistance
              {callDialog.order?.table_no ? ` at Table ${callDialog.order.table_no}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              A staff member will be alerted and come to your table shortly.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallDialog({ open: false, order: null })} disabled={callLoading}>
              Cancel
            </Button>
            <Button variant="hero" onClick={handleCallStaff} disabled={callLoading}>
              {callLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
              Call Staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}