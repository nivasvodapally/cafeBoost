// Creates a Razorpay order for a given cafe order. Returns the Razorpay
// order id + key id for the client to launch checkout.
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
    if (!KEY_ID || !KEY_SECRET) throw new Error("Razorpay keys not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const { order_id } = await req.json();
    if (!order_id) throw new Error("order_id required");

    // Verify the caller owns this order (RLS will allow read)
    const { data: order, error: oerr } = await supabase
      .from("orders")
      .select("id, cafe_id, total_amount, payment_status, customer_user_id, razorpay_order_id, customer_name, customer_phone")
      .eq("id", order_id)
      .single();
    if (oerr || !order) throw new Error("Order not found or not yours");
    if (order.payment_status === "paid") throw new Error("Order already paid");

    // If we already have a razorpay order id, reuse it
    if (order.razorpay_order_id) {
      return new Response(JSON.stringify({ key_id: KEY_ID, razorpay_order_id: order.razorpay_order_id, amount: Math.round(Number(order.total_amount) * 100), order }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const amountPaise = Math.round(Number(order.total_amount) * 100);
    const auth = btoa(`${KEY_ID}:${KEY_SECRET}`);
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: order.id.slice(0, 40),
        notes: { cafe_order_id: order.id, cafe_id: order.cafe_id },
      }),
    });
    const rzpJson = await rzpRes.json();
    if (!rzpRes.ok) throw new Error(rzpJson?.error?.description || "Razorpay error");

    // Save razorpay_order_id back via service role (RLS would block update on most fields)
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("orders").update({ razorpay_order_id: rzpJson.id }).eq("id", order.id);
    await admin.from("payment_attempts").insert({
      order_id: order.id, cafe_id: order.cafe_id, event: "order.created",
      razorpay_order_id: rzpJson.id, amount: Number(order.total_amount), status: rzpJson.status, raw: rzpJson,
    });

    return new Response(JSON.stringify({ key_id: KEY_ID, razorpay_order_id: rzpJson.id, amount: amountPaise, order }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});