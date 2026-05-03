// Lazy-loads Razorpay Checkout JS and opens the UPI/cards modal.
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("Failed to load Razorpay")); };
    document.head.appendChild(s);
  });
  return loading;
}

type RzpOpts = {
  key: string;
  amount: number;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  onSuccess: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  onDismiss?: () => void;
};

export async function openRazorpayCheckout(opts: RzpOpts) {
  await loadScript();
  const W = window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open: () => void } };
  const rzp = new W.Razorpay({
    key: opts.key,
    amount: opts.amount,
    currency: "INR",
    order_id: opts.order_id,
    name: opts.name,
    description: opts.description ?? "Order payment",
    prefill: opts.prefill ?? {},
    theme: opts.theme ?? { color: "#0f172a" },
    method: { upi: true, card: true, netbanking: true, wallet: true },
    handler: opts.onSuccess,
    modal: { ondismiss: opts.onDismiss ?? (() => undefined) },
  });
  rzp.open();
}