// Owner-initiated refund. Verifies caller is cafe owner, calls Razorpay
// refund API, then updates the order via SECURITY DEFINER RPC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
    const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const { order_id, amount } = await req.json();
    if (!order_id) throw new Error("order_id required");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: order } = await admin
      .from("orders").select("id, cafe_id, total_amount, razorpay_payment_id, payment_status").eq("id", order_id).single();
    if (!order) throw new Error("Order not found");

    // Verify owner
    const { data: cafe } = await admin.from("cafes").select("owner_user_id").eq("id", order.cafe_id).single();
    if (cafe?.owner_user_id !== user.id) throw new Error("Not authorised");

    if (!order.razorpay_payment_id) throw new Error("No Razorpay payment to refund");
    if (order.payment_status === "refunded") throw new Error("Already refunded");

    const refundAmount = Math.round((amount ?? Number(order.total_amount)) * 100);
    const auth = btoa(`${KEY_ID}:${KEY_SECRET}`);
    const r = await fetch(`https://api.razorpay.com/v1/payments/${order.razorpay_payment_id}/refund`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: refundAmount, notes: { cafe_order_id: order.id } }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.description || "Refund failed");

    await admin.rpc("record_payment_refund", { _order_id: order.id, _refund_id: j.id, _amount: refundAmount / 100 });
    return new Response(JSON.stringify({ ok: true, refund_id: j.id }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});