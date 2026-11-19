// Sends emails through Gmail: new booking / pass → owner; decision / pass activated → customer.
// Secrets (Supabase → Edge Functions → Secrets): GMAIL_USER, GMAIL_APP_PASSWORD, optional OWNER_EMAIL, SITE_URL
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.14";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const RIDES: Record<string, Record<string, string>> = {
  ka: { first: "პირველი სრიალი", set: "სავარჯიშო საათი", wake: "ვეიკბორდი", group: "ჯგუფი / ღონისძიება" },
  en: { first: "First Ride", set: "Training Hour", wake: "Wakeboard", group: "Group / Event" },
  ru: { first: "Первое катание", set: "Тренировочный час", wake: "Вейкборд", group: "Группа / событие" },
};
const T: Record<string, Record<string, string>> = {
  ka: { okSub: "ჯავშანი დადასტურებულია ✅", okHead: "გელოდებით ოქროს ტბაზე!", noSub: "ჯავშანს ვერ ვადასტურებთ", noHead: "სამწუხაროდ, ამ დროს ვერ გიმასპინძლებთ.",
        note: "კლუბის შეტყობინება", when: "როდის", ride: "აქტივობა", place: "ოქროს ტბა, მალთაყვა, ფოთი", other: "აირჩიეთ სხვა დრო", my: "ჩემი ჯავშნები",
        passSub: "აბონემენტი გააქტიურდა ✅", passHead: "თქვენი აბონემენტი მზადაა", hours: "საათი", until: "მოქმედებს" },
  en: { okSub: "Your booking is confirmed ✅", okHead: "See you at Golden Lake!", noSub: "We couldn't confirm your booking", noHead: "Unfortunately we can't host you at this time.",
        note: "Message from the club", when: "When", ride: "Activity", place: "Golden Lake, Maltakva, Poti", other: "Pick another time", my: "My bookings",
        passSub: "Your pass is active ✅", passHead: "Your pass is ready", hours: "hours", until: "Valid until" },
  ru: { okSub: "Бронь подтверждена ✅", okHead: "Ждём вас на Золотом озере!", noSub: "Не можем подтвердить бронь", noHead: "К сожалению, в это время мы не сможем вас принять.",
        note: "Сообщение клуба", when: "Когда", ride: "Занятие", place: "Золотое озеро, Малтаква, Поти", other: "Выбрать другое время", my: "Мои брони",
        passSub: "Абонемент активирован ✅", passHead: "Ваш абонемент готов", hours: "ч.", until: "Действует до" },
};

function frame(title: string, inner: string, site: string, cta = "", ctaText = "") {
  return `<!doctype html><html><body style="margin:0;background:#f7f5f0;font-family:Arial,'Noto Sans Georgian',sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#06202e;color:#fff;padding:18px 24px;font-weight:700;letter-spacing:2px">POTI <span style="color:#9fd3e6">LAKE CLUB</span></td></tr>
  <tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:22px">${esc(title)}</h1>${inner}
  ${cta ? `<p style="margin:24px 0 0"><a href="${esc(cta)}" style="background:#f97316;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">${esc(ctaText)}</a></p>` : ""}
  </td></tr><tr><td style="padding:14px 24px;background:#faf9f6;color:#5b6b7a;font-size:12px">Golden Lake · Maltakva · Poti${site ? ` · <a href="${esc(site)}" style="color:#0b3a4f">${esc(site)}</a>` : ""}</td></tr>
  </table></td></tr></table></body></html>`;
}
const row = (k: string, v: unknown) => `<tr><td style="padding:6px 12px 6px 0;color:#5b6b7a;font-size:14px;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font-size:14px;font-weight:600">${esc(v)}</td></tr>`;

const endQ = (t: string) => { const [h, m] = t.slice(0, 5).split(":").map(Number), e = h * 60 + m + 15; return String(Math.floor(e / 60)).padStart(2, "0") + ":" + String(e % 60).padStart(2, "0"); };   // rows are 15-minute slots

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { event, id } = await req.json();
    if (!event || !id) return json({ error: "bad_request" }, 400);

    const gUser = Deno.env.get("GMAIL_USER"), gPass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gUser || !gPass) return json({ sent: false, reason: "not_configured" });
    const site = Deno.env.get("SITE_URL") || "";
    const mail = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: gUser, pass: gPass } });
    const send = (to: string | string[], subject: string, html: string) => mail.sendMail({ from: `"Poti Lake Club" <${gUser}>`, to, subject, html });

    const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
    const isOwner = me?.role === "owner";
    async function ownerEmails() {
      const extra = (Deno.env.get("OWNER_EMAIL") || "").split(",").map(s => s.trim()).filter(Boolean);
      const { data: owners } = await admin.from("profiles").select("id").eq("role", "owner");
      const list = [...extra];
      for (const o of owners || []) { const { data } = await admin.auth.admin.getUserById(o.id); if (data.user?.email) list.push(data.user.email); }
      return [...new Set(list)];
    }
    // a multi-hour booking = several rows with the same group_id
    async function withGroup(b: any) {
      if (!b.group_id) return { rows: [b], end: endQ(b.time), total: b.price };
      const { data: rows } = await admin.from("bookings").select("*").eq("group_id", b.group_id).order("time");
      const list = (rows || [b]).filter((x: any) => x.status === b.status || b.status === "cancelled");
      const last = list[list.length - 1] || b;
      const total = list.some((x: any) => x.price == null) ? null : list.reduce((s: number, x: any) => s + Number(x.price), 0);
      return { rows: list, start: list[0]?.time || b.time, end: endQ(last.time), total };
    }
    const recent = (iso: string) => Date.now() - new Date(iso).getTime() < 15 * 60 * 1000;
    const fresh = (iso: string) => Date.now() - new Date(iso).getTime() < 24 * 3600 * 1000;

    if (event === "booking_created") {
      const { data: b } = await admin.from("bookings").select("*").eq("id", id).single();
      if (!b || b.user_id !== user.id || b.notified_at || !recent(b.created_at)) return json({ sent: false, reason: "not_allowed" });
      const [{ data: coach }, { data: offer }] = await Promise.all([
        b.coach_id ? admin.from("coaches").select("name").eq("id", b.coach_id).single() : Promise.resolve({ data: null }),
        b.offer_id ? admin.from("offers").select("title").eq("id", b.offer_id).single() : Promise.resolve({ data: null }),
      ]);
      const to = await ownerEmails(); if (!to.length) return json({ sent: false, reason: "no_owner_email" });
      const G = await withGroup(b), end = G.end, q = G.rows.length, dur = `${Math.floor(q / 4) ? Math.floor(q / 4) + " სთ" : ""}${q % 4 ? " " + (q % 4) * 15 + " წთ" : ""}`.trim();
      const { data: lake } = b.lake_id ? await admin.from("lakes").select("name_ka").eq("id", b.lake_id).maybeSingle() : { data: null };
      const groups = Array.isArray(b.rider_groups) ? b.rider_groups.map((g: any) => `${g.n}×${["პირველად", "დამწყები", "საშუალო", "გამოცდილი"][g.l] || g.l}`).join(", ") : "";
      const inner = `<p style="margin:0 0 14px;color:#5b6b7a">ახალი მოთხოვნა საიტიდან (${dur}). დაადასტურე ან უარყავი მფლობელის გვერდზე.</p><table cellpadding="0" cellspacing="0">
        ${row("როდის", `${b.date} · ${G.start || b.time}–${end}`)}${row("აქტივობა", RIDES.ka[b.ride] || b.ride)}${lake ? row("ტბა", lake.name_ka) : ""}${row("მონაწილე", b.riders)}${row("დონე", groups || b.level || "")}${b.equip_sets ? row("აღჭურვილობა", `${b.equip_sets} კომპლ. ქირით`) : ""}
        ${row("სახელი", b.name)}${row("ტელეფონი", b.phone)}${b.email ? row("ელფოსტა", b.email) : ""}${coach ? row("მწვრთნელი", coach.name) : ""}${offer ? row("შეთავაზება", offer.title) : ""}
        ${G.total != null ? row("ფასი", `₾${G.total}${b.paid ? " · გადახდილი" : ""}`) : ""}${b.notes ? row("შენიშვნა", b.notes) : ""}</table>`;
      await send(to, `🔔 ახალი ჯავშანი: ${b.date} ${b.time} — ${b.name}`, frame("ახალი ჯავშანი", inner, site, site ? `${site.replace(/\/$/, "")}/owner.html#inbox` : "", "გახსენი მფლობელის გვერდი"));
      await admin.from("bookings").update({ notified_at: new Date().toISOString() }).in("id", G.rows.map((x: any) => x.id));
      return json({ sent: true });
    }

    if (event === "booking_decided") {
      if (!isOwner) return json({ error: "forbidden" }, 403);
      const { data: b } = await admin.from("bookings").select("*").eq("id", id).single();
      if (!b || !b.decided_at || !fresh(b.decided_at)) return json({ sent: false, reason: "not_allowed" });
      const { data: cu } = b.user_id ? await admin.auth.admin.getUserById(b.user_id) : { data: { user: null } };
      const toMail = cu?.user?.email || b.email;
      if (!toMail) return json({ sent: false, reason: "no_email" });
      const L = T[b.lang] ? b.lang : "ka", t = T[L], ok = b.status === "confirmed";
      const G = await withGroup(b), end = G.end;
      const inner = `<p style="margin:0 0 14px;color:#5b6b7a">${esc(ok ? t.okHead : t.noHead)}</p><table cellpadding="0" cellspacing="0">
        ${row(t.when, `${b.date} · ${G.start || b.time}–${end}`)}${row(t.ride, RIDES[L][b.ride] || b.ride)}${ok ? row("📍", t.place) : ""}</table>
        ${b.owner_note ? `<p style="margin:16px 0 0;padding:12px 14px;background:#eef7f7;border-radius:10px"><b>${esc(t.note)}:</b> ${esc(b.owner_note)}</p>` : ""}`;
      await send(toMail, ok ? t.okSub : t.noSub, frame(ok ? t.okSub : t.noSub, inner, site, site ? `${site.replace(/\/$/, "")}/index.html#mine` : "", ok ? t.my : t.other));
      return json({ sent: true });
    }

    if (event === "pass_requested") {
      const { data: p } = await admin.from("passes").select("*").eq("id", id).single();
      if (!p || p.user_id !== user.id || !recent(p.created_at)) return json({ sent: false, reason: "not_allowed" });
      const { data: prof } = await admin.from("profiles").select("username,full_name,phone").eq("id", p.user_id).single();
      const to = await ownerEmails(); if (!to.length) return json({ sent: false, reason: "no_owner_email" });
      const inner = `<p style="margin:0 0 14px;color:#5b6b7a">მომხმარებელმა აბონემენტი მოითხოვა. გადახდის შემდეგ გაააქტიურე მფლობელის გვერდზე.</p><table cellpadding="0" cellspacing="0">
        ${row("აბონემენტი", p.name)}${row("საათი", p.hours_total)}${row("ფასი", `₾${p.price}`)}${row("მომხმარებელი", `${prof?.full_name || ""} @${prof?.username || ""}`)}${row("ტელეფონი", prof?.phone || "")}</table>`;
      await send(to, `🎟️ აბონემენტის მოთხოვნა: ${p.name}`, frame("აბონემენტის მოთხოვნა", inner, site, site ? `${site.replace(/\/$/, "")}/owner.html#passes` : "", "გახსენი მფლობელის გვერდი"));
      return json({ sent: true });
    }

    if (event === "pass_activated") {
      if (!isOwner) return json({ error: "forbidden" }, 403);
      const { data: p } = await admin.from("passes").select("*").eq("id", id).single();
      if (!p || p.status !== "active") return json({ sent: false, reason: "not_allowed" });
      const { data: cu } = await admin.auth.admin.getUserById(p.user_id);
      if (!cu.user?.email) return json({ sent: false, reason: "no_email" });
      const L = (cu.user.user_metadata?.lang && T[cu.user.user_metadata.lang]) ? cu.user.user_metadata.lang : "ka", t = T[L];
      const inner = `<p style="margin:0 0 14px;color:#5b6b7a">${esc(t.passHead)}</p><table cellpadding="0" cellspacing="0">
        ${row("🎟️", p.name)}${row(t.hours, p.hours_total)}${row(t.until, p.expires_at)}</table>`;
      await send(cu.user.email, t.passSub, frame(t.passSub, inner, site, site ? `${site.replace(/\/$/, "")}/index.html#mine` : "", t.my));
      return json({ sent: true });
    }
    if (event === "event_signup") {
      const { data: s } = await admin.from("event_signups").select("*").eq("id", id).single();
      if (!s || s.user_id !== user.id || !recent(s.created_at)) return json({ sent: false, reason: "not_allowed" });
      const { data: ev } = await admin.from("events").select("title,start_date,end_date,start_time,price").eq("id", s.event_id).single();
      const to = await ownerEmails(); if (!to.length) return json({ sent: false, reason: "no_owner_email" });
      const inner = `<p style="margin:0 0 14px;color:#5b6b7a">ახალი რეგისტრაცია ღონისძიებაზე. დაადასტურე მფლობელის გვერდზე.</p><table cellpadding="0" cellspacing="0">
        ${row("ღონისძიება", ev?.title || "")}${row("თარიღი", `${ev?.start_date || ""}${ev?.end_date && ev.end_date !== ev.start_date ? " – " + ev.end_date : ""}${ev?.start_time ? " · " + ev.start_time : ""}`)}
        ${row("სახელი", s.name)}${row("ტელეფონი", s.phone)}${row("დონე", s.level || "")}${ev?.price ? row("ფასი", `₾${ev.price}`) : ""}${s.notes ? row("შენიშვნა", s.notes) : ""}</table>`;
      await send(to, `🏁 რეგისტრაცია: ${ev?.title || ""} — ${s.name}`, frame("ახალი რეგისტრაცია", inner, site, site ? `${site.replace(/\/$/, "")}/owner.html#events` : "", "გახსენი მფლობელის გვერდი"));
      return json({ sent: true });
    }

    if (event === "event_decided") {
      if (!isOwner) return json({ error: "forbidden" }, 403);
      const { data: s } = await admin.from("event_signups").select("*").eq("id", id).single();
      if (!s || s.by_owner || !s.decided_at || !fresh(s.decided_at)) return json({ sent: false, reason: "not_allowed" });
      const { data: ev } = await admin.from("events").select("title,start_date,end_date,start_time").eq("id", s.event_id).single();
      const { data: cu } = await admin.auth.admin.getUserById(s.user_id);
      if (!cu.user?.email) return json({ sent: false, reason: "no_email" });
      const L = (cu.user.user_metadata?.lang && T[cu.user.user_metadata.lang]) ? cu.user.user_metadata.lang : "ka", t = T[L], ok = s.status === "confirmed";
      const E: Record<string, string[]> = {
        ka: ["რეგისტრაცია დადასტურებულია ✅", "რეგისტრაცია ვერ დადასტურდა", "გელოდებით ოქროს ტბაზე!", "სამწუხაროდ, ამჯერად ადგილს ვერ გთავაზობთ.", "ჩემი ღონისძიებები"],
        en: ["Your registration is confirmed ✅", "We couldn't confirm your registration", "See you at Golden Lake!", "Unfortunately we can't offer you a place this time.", "My events"],
        ru: ["Регистрация подтверждена ✅", "Не можем подтвердить регистрацию", "Ждём вас на Золотом озере!", "К сожалению, в этот раз мест нет.", "Мои события"],
      };
      const e = E[L] || E.ka;
      const inner = `<p style="margin:0 0 14px;color:#5b6b7a">${esc(ok ? e[2] : e[3])}</p><table cellpadding="0" cellspacing="0">
        ${row("🏁", ev?.title || "")}${row(t.when, `${ev?.start_date || ""}${ev?.end_date && ev.end_date !== ev.start_date ? " – " + ev.end_date : ""}${ev?.start_time ? " · " + ev.start_time : ""}`)}${ok ? row("📍", t.place) : ""}</table>`;
      await send(cu.user.email, ok ? e[0] : e[1], frame(ok ? e[0] : e[1], inner, site, site ? `${site.replace(/\/$/, "")}/events.html#mine` : "", e[4]));
      return json({ sent: true });
    }
    return json({ error: "unknown_event" }, 400);
  } catch (e) {
    console.error(e);
    return json({ sent: false, reason: "error" }, 500);
  }
});
