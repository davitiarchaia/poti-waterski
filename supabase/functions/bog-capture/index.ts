// Owner only: charges (approve) or releases (cancel) the amount held on the customer's card for a booking.
// Secrets: BOG_CLIENT_ID, BOG_CLIENT_SECRET
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (me?.role !== "owner") return json({ error: "forbidden" }, 403);

    const { id, action } = await req.json();
    if (!id || !["approve", "cancel"].includes(action)) return json({ error: "bad_request" }, 400);
    const { data: row } = await admin.from("bookings").select("*").eq("id", id).single();
    if (!row) return json({ error: "not_found" }, 404);
    const { data: group } = row.group_id
      ? await admin.from("bookings").select("*").eq("group_id", row.group_id).limit(100)
      : { data: [row] };
    const held = (group || []).filter((b: any) => b.payment_status === "held" && b.bog_order_id);
    if (!held.length) return json({ ok: true, nothing: true });          // nothing held (cash, pass, or not paid online)
    const orderId = held[0].bog_order_id;

    const token = await bogToken();
    if (!token) return json({ error: "not_configured" });
    const live = (group || []).filter((b: any) => b.status !== "cancelled");
    const amount = Math.round(live.reduce((s: number, b: any) => s + Number(b.price || 0), 0) * 100) / 100;
    const path = action === "approve" ? "approve" : "cancel";
    const body: Record<string, unknown> = action === "approve"
      ? { description: "Booking confirmed", ...(amount > 0 ? { amount } : {}) }
      : { description: "Booking declined" };
    const r = await fetch(`https://api.bog.ge/payments/v1/payment/authorization/${path}/${encodeURIComponent(orderId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("bog", path, r.status, d); return json({ error: "bog_error", status: r.status }, 502); }
    const ids = (action === "approve" ? live : group || []).map((b: any) => b.id);
    if (action === "approve") {
      await admin.from("bookings").update({ payment_status: "captured", paid: true, paid_at: new Date().toISOString(), payment_method: "bog" }).in("id", ids).eq("bog_order_id", orderId);
    } else {
      await admin.from("bookings").update({ payment_status: "voided" }).in("id", ids).eq("bog_order_id", orderId);
    }
    return json({ ok: true, action, amount });
  } catch (e) {
    console.error(e);
    return json({ error: "error" }, 500);
  }
});
