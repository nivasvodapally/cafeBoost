import { supabase } from "@/integrations/supabase/client";

export type CafePaymentMode = {
  razorpay_mode: "test" | "live";
  allow_payment_simulation: boolean;
};

const cache = new Map<string, CafePaymentMode>();

/**
 * Lightweight per-cafe lookup of the payment-mode flags. Cached in memory
 * for the lifetime of the page so the test-mode banner / simulate buttons
 * don't have to refetch on every render.
 */
export async function getCafePaymentMode(cafeId: string): Promise<CafePaymentMode> {
  const cached = cache.get(cafeId);
  if (cached) return cached;
  const { data } = await supabase
    .from("cafes")
    .select("razorpay_mode, allow_payment_simulation")
    .eq("id", cafeId)
    .maybeSingle();
  const mode: CafePaymentMode = {
    razorpay_mode: (data?.razorpay_mode as "test" | "live") ?? "test",
    allow_payment_simulation: data?.allow_payment_simulation ?? true,
  };
  cache.set(cafeId, mode);
  return mode;
}

export function clearCafePaymentModeCache(cafeId?: string) {
  if (cafeId) cache.delete(cafeId);
  else cache.clear();
}
