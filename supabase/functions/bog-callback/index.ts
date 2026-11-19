// Bank of Georgia calls this when a payment finishes. We never trust the body:
// we ask BOG directly for the order status before marking anything paid.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

async function bogToken() {
  const id = Deno.env.get("BOG_CLIENT_ID"), secret = Deno.env.get("BOG_CLIENT_SECRET");
  if (!id || !secret) return null;
  const r = await fetch("https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(`${id}:${secret}`) },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error("bog_auth_" + r.status);
  return (await r.json()).access_token as string;
}

Deno.serve(async (req) => {
  const ok = () => new Response("ok", { status: 200 });
  if (req.method !== "POST") return ok();
  try {
    const payload = await req.json().catch(() => null);
    const orderId = payload?.body?.order_id;
    if (!orderId || typeof orderId !== "string") return ok();
    const token = await bogToken(); if (!token) return ok();
    const r = await fetch(`https://api.bog.ge/payments/v1/receipt/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return ok();
    const d = await r.json();
    const st = d?.order_status?.key;
    const ext = String(d.external_order_id || ""), m = ext.match(/^([bp])_([0-9a-f-]{36})$/);
    if (!m) return ok();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const table = m[1] === "p" ? "passes" : "bookings";
    // all 15-minute rows of one booking share this order
    if (st === "completed") {
      await admin.from(table).update({ paid: true, paid_at: new Date().toISOString(), payment_method: "bog", ...(table === "passes" ? { status: "active" } : { payment_status: "captured" }) }).eq("bog_order_id", orderId);
    } else if (st === "blocked" && table === "bookings") {          // pre-authorization succeeded: money is held
      await admin.from("bookings").update({ payment_status: "held", payment_method: "bog" }).eq("bog_order_id", orderId).in("payment_status", ["none", "pending"]);
    } else if (st === "rejected" && table === "bookings") {
      await admin.from("bookings").update({ payment_status: "failed" }).eq("bog_order_id", orderId).in("payment_status", ["none", "pending"]);
    }
    return ok();
  } catch (e) {
    console.error(e);
    return ok();
  }
});
