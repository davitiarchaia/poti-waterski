// Daily: emails customers whose confirmed session was 1–3 days ago and who haven't reviewed it yet.
// Runs from pg_cron. Idempotent: every booking (or multi-hour group) gets at most one reminder.
// Uses the same secrets as notify: GMAIL_USER, GMAIL_APP_PASSWORD, SITE_URL
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.14";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const RIDES: Record<string, Record<string, string>> = {
  ka: { first: "პირველი სრიალი", set: "სავარჯიშო საათი", wake: "ვეიკბორდი", group: "ჯგუფი / ღონისძიება" },
  en: { first: "First Ride", set: "Training Hour", wake: "Wakeboard", group: "Group / Event" },
  ru: { first: "Первое катание", set: "Тренировочный час", wake: "Вейкборд", group: "Группа / событие" },
};
const T: Record<string, Record<string, string>> = {
  ka: { sub: "როგორ იყო ოქროს ტბაზე? ⭐", head: "მადლობა, რომ გვესტუმრეთ!", body: "თქვენი აზრი ძალიან მნიშვნელოვანია ჩვენთვის და სხვა მოცურავეებისთვის. შეაფასეთ სეანსი — ამას ერთი წუთი სჭირდება.", cta: "★ შეფასება", when: "სეანსი" },
  en: { sub: "How was Golden Lake? ⭐", head: "Thanks for riding with us!", body: "Your opinion matters to us and to other riders. Rate your session — it takes a minute.", cta: "★ Rate it", when: "Session" },
  ru: { sub: "Как прошло на Золотом озере? ⭐", head: "Спасибо, что были у нас!", body: "Ваше мнение важно для нас и для других райдеров. Оцените занятие — это займёт минуту.", cta: "★ Оценить", when: "Занятие" },
};

function frame(L: Record<string, string>, inner: string, site: string, cta: string) {
  return `<!doctype html><html><body style="margin:0;background:#f7f5f0;font-family:Arial,'Noto Sans Georgian',sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#06202e;color:#fff;padding:18px 24px;font-weight:700;letter-spacing:2px">POTI <span style="color:#9fd3e6">LAKE CLUB</span></td></tr>
  <tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:22px">${esc(L.head)}</h1>${inner}
  <p style="margin:22px 0 6px;font-size:30px;letter-spacing:4px;color:#f59e0b">★★★★★</p>
  <p style="margin:12px 0 0"><a href="${esc(cta)}" style="background:#f97316;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700">${esc(L.cta)}</a></p>
  </td></tr><tr><td style="padding:14px 24px;background:#faf9f6;color:#5b6b7a;font-size:12px">Golden Lake · Maltakva · Poti · <a href="${esc(site)}" style="color:#0b3a4f">${esc(site)}</a></td></tr>
  </table></td></tr></table></body></html>`;
}

const tbilisiDay = (offsetDays: number) => {
  const d = new Date(Date.now() + 4 * 3600e3 + offsetDays * 86400e3); // Asia/Tbilisi = UTC+4, no DST
  return d.toISOString().slice(0, 10);
};
const MONTHS: Record<string, string[]> = {
  ka: ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const gUser = Deno.env.get("GMAIL_USER"), gPass = Deno.env.get("GMAIL_APP_PASSWORD");
    const site = (Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");
    if (!gUser || !gPass || !site) return json({ sent: 0, reason: "not_configured" });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: rows, error } = await admin.from("bookings")
      .select("id,ride,date,time,lang,user_id,group_id")
      .eq("status", "confirmed").is("review_reminded_at", null).not("user_id", "is", null)
      .gte("date", tbilisiDay(-3)).lte("date", tbilisiDay(-1))
      .order("date").order("time").limit(500);
    if (error) throw error;
    if (!rows?.length) return json({ sent: 0 });

    // one reminder per booking / multi-hour group
    const groups = new Map<string, any[]>();
    for (const r of rows) { const k = r.group_id || r.id; (groups.get(k) || groups.set(k, []).get(k)!).push(r); }

    const allIds = rows.map(r => r.id);
    const { data: revs } = await admin.from("reviews").select("booking_id").in("booking_id", allIds);
    const reviewed = new Set((revs || []).map(r => r.booking_id));
    const userIds = [...new Set(rows.map(r => r.user_id))];
    const { data: profs } = await admin.from("profiles").select("id,role,full_name").in("id", userIds);
    const prof = new Map((profs || []).map(p => [p.id, p]));

    const mail = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: gUser, pass: gPass } });
    let sent = 0, skipped = 0;
    for (const list of groups.values()) {
      const first = list[0], ids = list.map(r => r.id);
      const mark = () => admin.from("bookings").update({ review_reminded_at: new Date().toISOString() }).in("id", ids);
      const p = prof.get(first.user_id);
      // the owner's own manual bookings and already-reviewed sessions get no email
      if (!p || p.role === "owner" || ids.some(i => reviewed.has(i))) { await mark(); skipped++; continue; }
      const { data: u } = await admin.auth.admin.getUserById(first.user_id);
      const to = u?.user?.email;
      if (!to) { await mark(); skipped++; continue; }
      const lang = ["ka", "en", "ru"].includes(first.lang) ? first.lang : "ka", L = T[lang];
      const [y, m, d] = first.date.split("-").map(Number);
      const lt = list[list.length - 1].time.slice(0, 5).split(":").map(Number), em = lt[0] * 60 + lt[1] + 15;   // rows are 15-minute slots
      const end = String(Math.floor(em / 60)).padStart(2, "0") + ":" + String(em % 60).padStart(2, "0");
      const when = `${d} ${MONTHS[lang][m - 1]}, ${first.time}–${end}`;
      const inner = `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${p.full_name ? esc(p.full_name) + ", " : ""}${esc(L.body)}</p>
        <p style="margin:0;font-size:14px;color:#5b6b7a">${esc(L.when)}: <b style="color:#0f172a">${esc(RIDES[lang][first.ride] || first.ride)} · ${esc(when)}</b></p>`;
      const link = `${site}/?review=${encodeURIComponent(first.id)}#mine`;
      try {
        await mail.sendMail({ from: `"Poti Lake Club" <${gUser}>`, to, subject: L.sub, html: frame(L, inner, site, link) });
        await mark(); sent++;
      } catch (e) { console.error("send failed", first.id, e); } // retried on the next run
    }
    return json({ sent, skipped });
  } catch (e) {
    console.error(e);
    return json({ error: "server" }, 500);
  }
});
