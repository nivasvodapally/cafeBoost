/// <reference types="vite/client" />

type RazorpayCheckoutResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutInstance = {
  open: () => void;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
  theme: { color?: string };
  method: { upi: boolean; card: boolean; netbanking: boolean; wallet: boolean };
  handler: (resp: RazorpayCheckoutResponse) => void;
  modal: { ondismiss: () => void };
};

interface Window {
  Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  webkitAudioContext?: typeof AudioContext;
  __cafeboost_audio_ctx?: AudioContext;
}
