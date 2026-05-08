// Razorpay webhook receiver. Verifies HMAC SHA-256 signature, then marks
// orders paid / refunded via SECURITY DEFINER RPCs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

async function hmacSha256Hex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  const body = await req.text();
  const expected = await hmacSha256Hex(secret, body);
  if (sig !== expected) return new Response("invalid signature", { status: 401 });

  const evt = JSON.parse(body);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (evt.event === "payment.captured") {
      // NOTE: We do NOT treat "payment.authorized" as paid.
      // authorized = bank hold only; captured = money received.
      const p = evt.payload?.payment?.entity;
      const orderId = p?.notes?.cafe_order_id;
      if (orderId) {
        await admin.rpc("record_payment_capture", {
          _order_id: orderId,
          _method: p.method ?? "upi",
          _rzp_order_id: p.order_id ?? null,
          _rzp_payment_id: p.id ?? null,
          _rzp_signature: sig,
          _paid_amount_paise: p.amount ?? null,  // amount in paise for server-side validation
        });
        // Look up cafe_id for the log
        const { data: ord } = await admin.from("orders").select("cafe_id").eq("id", orderId).single();
        await admin.from("payment_attempts").insert({
          order_id: orderId, cafe_id: ord?.cafe_id, event: evt.event,
          razorpay_order_id: p.order_id, razorpay_payment_id: p.id,
          amount: (p.amount ?? 0) / 100, method: p.method, status: p.status, raw: evt,
        });
      }
    } else if (evt.event === "payment.failed") {
      const p = evt.payload?.payment?.entity;
      const orderId = p?.notes?.cafe_order_id;
      if (orderId) {
        const { data: ord } = await admin.from("orders").select("cafe_id").eq("id", orderId).single();
        await admin.from("payment_attempts").insert({
          order_id: orderId, cafe_id: ord?.cafe_id, event: "payment.failed",
          razorpay_order_id: p.order_id, razorpay_payment_id: p.id,
          amount: (p.amount ?? 0) / 100, method: p.method, status: "failed", raw: evt,
        });
      }
    } else if (evt.event === "refund.processed" || evt.event === "refund.created") {
      const r = evt.payload?.refund?.entity;
      const paymentId = r?.payment_id;
      const { data: ord } = await admin.from("orders").select("id, cafe_id").eq("razorpay_payment_id", paymentId).maybeSingle();
      if (ord) {
        await admin.rpc("record_payment_refund", {
          _order_id: ord.id, _refund_id: r.id, _amount: (r.amount ?? 0) / 100,
        });
        await admin.from("payment_attempts").insert({
          order_id: ord.id, cafe_id: ord.cafe_id, event: evt.event,
          razorpay_payment_id: paymentId, amount: (r.amount ?? 0) / 100, status: r.status, raw: evt,
        });
      }
    }
    return new Response("ok");
  } catch (e) {
    console.error("webhook error", e);
    return new Response((e as Error).message, { status: 500 });
  }
});