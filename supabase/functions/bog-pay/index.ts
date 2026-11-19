// Starts a Bank of Georgia payment, or checks its status.
// Bookings: the amount is only HELD on the card (pre-authorization); it is charged by bog-capture when the owner confirms.
// Passes: charged at once.
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
    const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { kind, id, return_url, action } = await req.json();
    const table = kind === "pass" ? "passes" : kind === "booking" ? "bookings" : null;
    if (!table || !id) return json({ error: "bad_request" }, 400);
    const { data: row } = await admin.from(table).select("*").eq("id", id).single();
    if (!row || row.user_id !== user.id) return json({ error: "not_found" }, 404);

    const token = await bogToken();
    if (!token) return json({ error: "not_configured" });

    // a multi-hour booking is paid in one go
    let rows: any[] = [row];
    if (table === "bookings" && row.group_id) {
      const { data } = await admin.from("bookings").select("*").eq("group_id", row.group_id).neq("status", "cancelled").limit(100);
      rows = data && data.length ? data : [row];
    }
    const ids = rows.map(r => r.id);

    if (action === "check") {           // fallback when the callback hasn't arrived yet
      if (row.paid) return json({ paid: true });
      if (table === "bookings" && row.payment_status === "held") return json({ held: true });
      if (!row.bog_order_id) return json({ paid: false });
      const r = await fetch(`https://api.bog.ge/payments/v1/receipt/${row.bog_order_id}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json(), st = d?.order_status?.key;
      if (st === "completed") {
        const upd: Record<string, unknown> = { paid: true, paid_at: new Date().toISOString(), payment_method: "bog", ...(table === "passes" ? { status: "active" } : { payment_status: "captured" }) };
        await admin.from(table).update(upd).in("id", ids).eq("bog_order_id", row.bog_order_id);
        return json({ paid: true });
      }
      if (st === "blocked" && table === "bookings") {
        await admin.from("bookings").update({ payment_status: "held", payment_method: "bog" }).in("id", ids).eq("bog_order_id", row.bog_order_id);
        return json({ held: true });
      }
      return json({ paid: false, status: st || null });
    }

    if (rows.every(r => r.paid)) return json({ error: "already_paid" });
    if (table === "bookings" && rows.some(r => r.payment_status === "held")) return json({ error: "already_held" });
    if (row.status === "cancelled") return json({ error: "cancelled" });
    const amount = Math.round(rows.filter(r => !r.paid).reduce((s, r) => s + Number(r.price || 0), 0) * 100) / 100;
    if (!(amount > 0)) return json({ error: "no_price" });
    const back = typeof return_url === "string" && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)/.test(return_url) ? return_url : null;
    const sep = back && back.includes("?") ? "&" : "?";
    const body = {
      callback_url: `${url}/functions/v1/bog-callback`,
      external_order_id: `${kind === "pass" ? "p" : "b"}_${id}`.slice(0, 40),
      ttl: 30,
      ...(table === "bookings" ? { capture: "manual" } : {}),
      purchase_units: { currency: "GEL", total_amount: amount, basket: [{ product_id: kind === "pass" ? `pass-${row.plan_id || "x"}`.slice(0, 40) : `ride-${row.ride}`, quantity: 1, unit_price: amount }] },
      ...(back ? { redirect_urls: { success: `${back}${sep}pay=ok&ref=${kind}:${id}`, fail: `${back}${sep}pay=fail&ref=${kind}:${id}` } } : {}),
    };
    const r = await fetch("https://api.bog.ge/payments/v1/ecommerce/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Accept-Language": "ka", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok || !d?._links?.redirect?.href) { console.error("bog order", r.status, d); return json({ error: "bog_error" }, 502); }
    await admin.from(table).update({ bog_order_id: d.id, ...(table === "bookings" ? { payment_status: "pending" } : {}) }).in("id", ids.filter((_, i) => !rows[i].paid));
    return json({ url: d._links.redirect.href });
  } catch (e) {
    console.error(e);
    return json({ error: "error" }, 500);
  }
});
