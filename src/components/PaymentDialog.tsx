import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, Loader2, Smartphone, X, FlaskConical, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { getCafePaymentMode } from "@/lib/cafePaymentMode";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  cafeId: string;
  cafeName?: string;
  amount: number;
  customerName?: string;
  customerPhone?: string | null;
  /** When true, runner is collecting from a customer (offer cash + show-QR options). */
  runnerMode?: boolean;
  onPaid?: () => void;
};

/**
 * Unified payment dialog for both customers and runners.
 *
 * - Customer: pick UPI (Razorpay) or "I'll pay cash at the counter".
 * - Runner: pick cash or "show UPI QR to customer". The dialog polls payment
 *   status while waiting so the moment the webhook confirms the capture (or a
 *   simulation runs) the UI flips to "Paid" and closes.
 * - Test mode: clearly banner-marked and exposes Simulate Success / Simulate
 *   Failure buttons (powered by simulate_payment RPC) so the team can test the
 *   full flow without a real Razorpay account.
 */
export function PaymentDialog({
  open, onOpenChange, orderId, cafeId, cafeName, amount, customerName, customerPhone, runnerMode, onPaid,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [waitingUpi, setWaitingUpi] = useState(false);
  const [mode, setMode] = useState<{ razorpay_mode: "test"|"live"; allow_payment_simulation: boolean } | null>(null);
  const [paid, setPaid] = useState(false);
  const [cashToken, setCashToken] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPaid(false); setWaitingUpi(false);
    void getCafePaymentMode(cafeId).then(setMode);
  }, [open, cafeId]);

  // Poll payment status while we're waiting for an external capture/simulation.
  useEffect(() => {
    if (!open || !waitingUpi) return;
    let stop = false;
    const tick = async () => {
      const { data } = await supabase.from("orders").select("payment_status").eq("id", orderId).maybeSingle();
      if (stop) return;
      if (data?.payment_status === "paid") {
        setPaid(true); setWaitingUpi(false);
        toast.success("Payment received");
        onPaid?.();
        setTimeout(() => onOpenChange(false), 900);
      }
    };
    const i = setInterval(() => void tick(), 2500);
    void tick();
    return () => { stop = true; clearInterval(i); };
  }, [open, waitingUpi, orderId, onOpenChange, onPaid]);

  const isTest = mode?.razorpay_mode === "test";

  // For CUSTOMERS — just marks intent, does NOT mark as paid
  const chooseCash = async () => {
    setBusy(true);
    const { error } = await supabase
      .rpc('set_payment_method', { _order_id: orderId, _method: 'cash' });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setCashToken(true);
    onPaid?.();
  };

  // For RUNNERS only — confirms cash was physically collected
  const confirmCashCollected = async () => {
    setBusy(true);
    const { error } = await supabase
      .rpc('mark_order_paid', { _order_id: orderId });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setPaid(true);
    toast.success("Cash collected — order marked as paid");
    onPaid?.();
    setTimeout(() => onOpenChange(false), 900);
  };

  const payUpi = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("razorpay-create-order", { body: { order_id: orderId } });
      if (error) throw error;
      // Edge function returns { error: "..." } on business errors
      if (data?.error) throw new Error(data.error);
      const d = data as { key_id: string; razorpay_order_id: string; amount: number };
      if (!d.razorpay_order_id) throw new Error("Failed to create payment order — please try again");
      setWaitingUpi(true);
      await openRazorpayCheckout({
        amount: d.amount,
        order_id: d.razorpay_order_id,
        name: cafeName ?? "Cafe",
        description: `Order #${orderId.slice(0, 6).toUpperCase()}`,
        prefill: { name: customerName, contact: customerPhone ?? undefined },
        onSuccess: () => { /* webhook will mark paid; polling will pick up */ },
        onDismiss: () => { setWaitingUpi(false); toast("Checkout closed — you can retry anytime"); },
      });
    } catch (e) {
      const msg = (e as Error).message || "Payment failed";
      // Provide a friendlier message for common configuration errors
      if (msg.includes("keys not configured") || msg.includes("RAZORPAY")) {
        toast.error("Payment gateway not configured yet. Please contact the cafe owner.");
      } else if (msg.includes("already paid")) {
        toast.info("This order is already paid!");
      } else {
        toast.error(msg);
      }
      setWaitingUpi(false);
    } finally {
      setBusy(false);
    }
  };

  const simulate = async (outcome: "success" | "failure") => {
    setBusy(true);
    const { error } = await supabase.rpc("simulate_payment", { _order_id: orderId, _outcome: outcome });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (outcome === "success") {
      setPaid(true); toast.success("Test payment succeeded");
      onPaid?.();
      setTimeout(() => onOpenChange(false), 900);
    } else {
      toast.error("Test payment failed (as expected)");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-4 h-4" /> Pay ₹{amount.toFixed(2)}
          </DialogTitle>
          <DialogDescription>
            {runnerMode ? "Collect payment from the customer." : `Complete your order at ${cafeName ?? "the cafe"}.`}
          </DialogDescription>
        </DialogHeader>

        {isTest && (
          <div className="rounded-lg bg-amber-500/15 text-amber-900 dark:text-amber-200 px-3 py-2 text-xs flex items-start gap-2">
            <FlaskConical className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">TEST MODE</p>
              <p className="opacity-80">Razorpay is in test mode — no real money will move. Use the simulate buttons below for end-to-end testing.</p>
            </div>
          </div>
        )}

        {paid ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-14 h-14 text-success mx-auto mb-2" />
            <p className="font-display text-xl font-bold">Payment received</p>
          </div>
        ) : cashToken ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-20 h-20 bg-accent-soft rounded-full flex items-center justify-center mx-auto mb-2">
              <Banknote className="w-10 h-10 text-accent" />
            </div>
            <div>
              <p className="font-display text-2xl font-bold">Token: #{orderId.slice(0, 6).toUpperCase()}</p>
              <p className="text-sm text-muted-foreground mt-2 px-4 italic font-medium">
                "You can pay to the <b>runners</b> or at the <b>counter</b>."
              </p>
              <p className="text-[11px] text-muted-foreground mt-2 px-4">
                Note: The kitchen will start preparing once staff accepts your order.
              </p>
            </div>
            <div className="bg-muted p-3 rounded-lg text-xs flex items-start gap-2 text-left">
              <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
              <p>You can still pay online anytime from your <b>Orders</b> page if you change your mind.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="hero" className="w-full h-12" onClick={() => { setCashToken(false); setWaitingUpi(false); }}>
                Pay Online Now
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => onOpenChange(false)}>
                Pay cash later (Close)
              </Button>
            </div>
          </div>
        ) : waitingUpi ? (
          <div className="text-center py-8 space-y-3">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-muted-foreground" />
            <div>
              <p className="font-semibold">Waiting for payment confirmation…</p>
              <p className="text-xs text-muted-foreground mt-1">Complete the UPI flow on your phone. We'll detect it automatically.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setWaitingUpi(false)}><X className="w-4 h-4 mr-1" /> Cancel & choose another method</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {runnerMode ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-muted/50 p-4 text-center">
                  <p className="text-3xl font-bold font-display">₹{amount.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Amount to collect from {customerName ?? "customer"}</p>
                </div>

                {/* Primary action for runner — collect cash */}
                <Button
                  onClick={confirmCashCollected}
                  variant="default"
                  size="lg"
                  className="w-full gap-2 h-16 text-base"
                  disabled={busy}
                >
                  <Banknote className="w-6 h-6" />
                  <div className="text-left flex-1">
                    <p className="font-bold">Collect ₹{amount.toFixed(2)} Cash</p>
                    <p className="text-[11px] opacity-80 font-normal">Tap after receiving cash from customer</p>
                  </div>
                </Button>

                {/* Secondary action — show QR for customer to scan and pay UPI themselves */}
                <Button
                  onClick={payUpi}
                  variant="outline"
                  size="lg"
                  className="w-full gap-2 h-14"
                  disabled={busy}
                >
                  <Smartphone className="w-5 h-5" />
                  <div className="text-left flex-1">
                    <p className="font-semibold">Show UPI QR to Customer</p>
                    <p className="text-[11px] opacity-80 font-normal">Customer scans and pays via GPay / PhonePe</p>
                  </div>
                </Button>
              </div>
            ) : (
              /* CUSTOMER MODE — customer paying themselves */
              <div className="space-y-3">
                <Button
                  onClick={payUpi}
                  variant="hero"
                  size="lg"
                  className="w-full gap-2 h-14"
                  disabled={busy}
                >
                  <Smartphone className="w-5 h-5" />
                  <div className="text-left flex-1">
                    <p className="font-semibold">Pay with UPI</p>
                    <p className="text-[11px] opacity-80 font-normal">GPay · PhonePe · Paytm · any UPI app</p>
                  </div>
                </Button>

                <Button
                  onClick={chooseCash}
                  variant="outline"
                  size="lg"
                  className="w-full gap-2 h-14"
                  disabled={busy}
                >
                  <Banknote className="w-5 h-5" />
                  <div className="text-left flex-1">
                    <p className="font-semibold">Pay Cash at Counter</p>
                    <p className="text-[11px] opacity-80 font-normal">Order is sent now — pay when you collect</p>
                  </div>
                </Button>
              </div>
            )}

            {isTest && mode?.allow_payment_simulation && (
              <div className="pt-3 mt-3 border-t border-border space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FlaskConical className="w-3 h-3" /> Simulate (test only)
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => simulate("success")} variant="outline" size="sm" className="flex-1 gap-1" disabled={busy}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Success
                  </Button>
                  <Button onClick={() => simulate("failure")} variant="outline" size="sm" className="flex-1 gap-1" disabled={busy}>
                    <AlertCircle className="w-3.5 h-3.5 text-destructive" /> Failure
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
