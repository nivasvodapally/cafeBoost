/**
 * orderService — single entry point for placing customer orders.
 *
 * All validation, totals, item snapshotting AND loyalty bumps now happen
 * server-side inside `place_order_and_update_loyalty` (single transaction).
 * This guarantees:
 *  - Loyalty points and visits ACCUMULATE atomically (no overwrite race).
 *  - Points are computed from subtotal (excludes tax).
 *  - Order + items + loyalty either all succeed or none do.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CartLine = { id: string; qty: number };
export type PlaceOrderInput = {
  cafeId: string;
  customerUserId: string;
  customerName: string;
  customerPhone?: string | null;
  notes?: string | null;
  source?: Database["public"]["Enums"]["order_source"];
  tableNo?: string | null;
  cart: CartLine[];
};

const recentSubmits = new Map<string, number>();
const SUBMIT_DEDUPE_MS = 4000;

function cartKey(input: PlaceOrderInput) {
  const sig = input.cart.map((c) => `${c.id}x${c.qty}`).sort().join("|");
  return `${input.cafeId}:${input.customerUserId}:${sig}`;
}

export async function placeOrder(input: PlaceOrderInput) {
  if (!input.cart.length) throw new Error("Cart is empty");

  const key = cartKey(input);
  const last = recentSubmits.get(key);
  if (last && Date.now() - last < SUBMIT_DEDUPE_MS) {
    throw new Error("Order already submitted — please wait a moment");
  }
  recentSubmits.set(key, Date.now());

  try {
    const items = input.cart.map((c) => ({ menu_item_id: c.id, quantity: c.qty }));
    const { data, error } = await supabase.rpc("place_order_and_update_loyalty", {
      _cafe_id: input.cafeId,
      _customer_user_id: input.customerUserId,
      _customer_name: input.customerName,
      _customer_phone: input.customerPhone ?? null,
      _notes: input.notes ?? null,
      _source: input.source ?? "app",
      _table_no: input.tableNo ?? null,
      _items: items,
    });
    if (error) throw error;
    const r = data as { id: string; subtotal: number; tax_amount: number; total_amount: number; earned_points: number };
    return {
      id: r.id,
      subtotal: Number(r.subtotal),
      taxAmount: Number(r.tax_amount),
      totalAmount: Number(r.total_amount),
      earnedPoints: Number(r.earned_points),
    };
  } catch (e) {
    recentSubmits.delete(key);
    throw e;
  }
}
