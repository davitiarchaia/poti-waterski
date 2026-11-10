/* Shared code: Supabase connection, accounts, weather, dates, language. */
(() => {
const { url: SB, key: KEY } = window.SUPABASE;
const C = window.CONFIG;

/* ---------- storage (never breaks if blocked) ---------- */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------- accounts (Supabase Auth: passwords are hashed by Supabase) ---------- */
let session = store.get('pw_session');
const listeners = new Set();
function setSession(s) {
  session = s && s.access_token ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Date.now() / 1000 + (s.expires_in || 3600), user: s.user } : null;
  store.set('pw_session', session);
  listeners.forEach(f => f(session));
}
async function authFetch(path, body) {
  const r = await fetch(`${SB}/auth/v1/${path}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.msg || j.error_description || j.message || 'auth'); e.code = j.error_code || j.code || r.status; throw e; }
  return j;
}
async function token() {
  if (!session) return null;
  if (session.expires_at - 60 < Date.now() / 1000) {
    try { setSession(await authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token })); }
    catch { setSession(null); return null; }
  }
  return session.access_token;
}
const auth = {
  get session() { return session; },
  onChange(f) { listeners.add(f); },
  async signUp({ email, password, username, full_name, phone }) {
    const b = this.backUrl();
    const j = await authFetch(`signup${b ? '?redirect_to=' + encodeURIComponent(b) : ''}`, { email, password, data: { username: username.toLowerCase(), full_name, phone } });
    if (j.access_token) { setSession(j); return 'signed-in'; }
    return 'check-email';
  },
  async signIn(email, password) { setSession(await authFetch('token?grant_type=password', { email, password })); },
  // links in emails (confirm sign-up, reset password) come back to this page
  backUrl() { return /^https?:/.test(location.protocol) ? location.origin + location.pathname : ''; },
  async recover(email) { const b = this.backUrl(); await authFetch(`recover${b ? '?redirect_to=' + encodeURIComponent(b) : ''}`, { email }); },
  async updatePassword(password) {
    const t = await token(); if (!t) throw Object.assign(new Error('auth'), { code: 401 });
    const r = await fetch(`${SB}/auth/v1/user`, { method: 'PUT', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.msg || 'auth'); e.code = j.error_code || r.status; throw e; }
  },
  async consumeUrl() {                       // returns 'signup' | 'recovery' | 'magiclink' | 'error' | null
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (!h.get('access_token') && !h.get('error')) return null;
    history.replaceState(null, '', location.pathname + location.search);
    if (h.get('error')) return 'error';
    const at = h.get('access_token');
    const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${at}` } });
    if (!r.ok) return 'error';
    setSession({ access_token: at, refresh_token: h.get('refresh_token'), expires_in: +h.get('expires_in') || 3600, user: await r.json() });
    return h.get('type') || 'signup';
  },
  async signOut() {
    const t = session && session.access_token;
    setSession(null);
    if (t) fetch(`${SB}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${t}` } }).catch(() => {});
  },
};

/* ---------- database (PostgREST) ---------- */
async function db(path, { method = 'GET', body, prefer } = {}) {
  const t = await token();
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (t) headers.Authorization = `Bearer ${t}`;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  const j = txt ? JSON.parse(txt) : null;
  if (!r.ok) { const e = new Error((j && j.message) || r.status); e.code = j && j.code; e.status = r.status; throw e; }
  return j;
}
const rpc = (fn, args) => db(`rpc/${fn}`, { method: 'POST', body: args });
// server functions (email, payment)
async function fn(name, body) {
  const t = await token();
  const r = await fetch(`${SB}/functions/v1/${name}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}
async function myProfile() {
  if (!session) return null;
  const rows = await db(`profiles?id=eq.${session.user.id}&select=*`);
  return rows && rows[0] || null;
}

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => new Date(s + 'T12:00');
const todayIso = () => iso(new Date());
function hours() { const h = []; for (let x = C.openHour; x <= C.closeHour; x++) h.push(`${pad(x)}:00`); return h; }
const inSeason = d => C.seasonMonths.includes(d.getMonth());
function openSlots(dayIso) {          // slots that can still be booked on that day
  const now = new Date();
  if (dayIso < iso(now)) return [];
  if (!inSeason(fromIso(dayIso))) return [];
  if (dayIso !== iso(now)) return hours();
  const cutoff = now.getHours() + 1;  // at least one hour ahead
  return hours().filter(h => +h.slice(0, 2) > cutoff);
}

/* ---------- language ---------- */
const LOCALE = { ka: 'ka-GE', en: 'en-GB', ru: 'ru-RU' };
const KA_WD = ['კვი', 'ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ'];
const KA_WD_LONG = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'];
const KA_MO = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
const i18n = {
  lang: 'ka', dict: {},
  init(dict, allowed) {
    this.dict = dict; this.allowed = allowed || Object.keys(dict);
    const s = store.get('lang'), n = (navigator.language || '').slice(0, 2);
    this.lang = this.allowed.includes(s) ? s : this.allowed.includes(n) ? n : 'ka';
  },
  t(k) { const d = this.dict[this.lang]; return d[k] !== undefined ? d[k] : this.dict.en[k]; },
  set(l) { this.lang = l; store.set('lang', l); document.documentElement.lang = l; },
  apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { const v = this.t(el.dataset.i18n); if (typeof v === 'string') el.textContent = v; });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => el.placeholder = this.t(el.dataset.i18nPh));
    root.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', this.t(el.dataset.i18nAria)));
    root.querySelectorAll('.lang button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === this.lang));
  },
};
function fmt(d, kind) {
  if (typeof d === 'string') d = fromIso(d);
  if (i18n.lang === 'ka') {
    if (kind === 'wd') return KA_WD[d.getDay()];
    if (kind === 'mo') return KA_MO[d.getMonth()].slice(0, 3);
    if (kind === 'month') return `${KA_MO[d.getMonth()]} ${d.getFullYear()}`;
    if (kind === 'dm') return `${d.getDate()} ${KA_MO[d.getMonth()]}`;
    if (kind === 'short') return `${d.getDate()} ${KA_MO[d.getMonth()].slice(0, 3)}`;
    return `${KA_WD_LONG[d.getDay()]}, ${d.getDate()} ${KA_MO[d.getMonth()]}`;
  }
  const o = { wd: { weekday: 'short' }, mo: { month: 'short' }, month: { month: 'long', year: 'numeric' }, dm: { day: 'numeric', month: 'long' },
    short: { day: 'numeric', month: 'short' }, long: { weekday: 'long', day: 'numeric', month: 'long' } }[kind];
  const s = new Intl.DateTimeFormat(LOCALE[i18n.lang], o).format(d);
  return kind === 'month' ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function weekdayHeaders() {                       // Monday first
  const base = new Date(2024, 0, 1);              // a Monday
  return [...Array(7)].map((_, i) => { const d = new Date(base); d.setDate(1 + i); return fmt(d, 'wd'); });
}

/* ---------- weather (Open-Meteo, free, no key) ---------- */
const WX = { // code → [icon, key]
  0: ['☀️', 'clear'], 1: ['🌤️', 'mostlyClear'], 2: ['⛅', 'partlyCloudy'], 3: ['☁️', 'cloudy'], 45: ['🌫️', 'fog'], 48: ['🌫️', 'fog'],
  51: ['🌦️', 'drizzle'], 53: ['🌦️', 'drizzle'], 55: ['🌦️', 'drizzle'], 56: ['🌧️', 'drizzle'], 57: ['🌧️', 'drizzle'],
  61: ['🌧️', 'rain'], 63: ['🌧️', 'rain'], 65: ['🌧️', 'heavyRain'], 66: ['🌧️', 'rain'], 67: ['🌧️', 'heavyRain'],
  71: ['🌨️', 'snow'], 73: ['🌨️', 'snow'], 75: ['🌨️', 'snow'], 77: ['🌨️', 'snow'],
  80: ['🌦️', 'showers'], 81: ['🌧️', 'showers'], 82: ['⛈️', 'heavyRain'], 85: ['🌨️', 'snow'], 86: ['🌨️', 'snow'],
  95: ['⛈️', 'storm'], 96: ['⛈️', 'storm'], 99: ['⛈️', 'storm'],
};
const wxInfo = code => WX[code] || ['🌡️', 'cloudy'];
// water conditions estimated from wind (km/h) and rain/storm — a guide, not a guarantee
function rideScore(wind, code, rainProb = 0) {
  if (code >= 95 || wind >= 30) return 'poor';
  if (wind >= 18 || rainProb >= 60 || (code >= 61 && code <= 67) || code === 82) return 'fair';
  return 'good';
}
let wxCache = null;
async function weather() {
  if (wxCache) return wxCache;
  const q = new URLSearchParams({
    latitude: C.lat, longitude: C.lon, timezone: C.timezone, forecast_days: 16, wind_speed_unit: 'kmh',
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m',
    hourly: 'temperature_2m,weather_code,wind_speed_10m,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!r.ok) throw new Error('weather');
  const j = await r.json();
  const hourly = {};
  j.hourly.time.forEach((t, i) => { hourly[t] = { temp: j.hourly.temperature_2m[i], code: j.hourly.weather_code[i], wind: j.hourly.wind_speed_10m[i], rain: j.hourly.precipitation_probability[i] }; });
  const daily = {};
  j.daily.time.forEach((t, i) => { daily[t] = { code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rain: j.daily.precipitation_probability_max[i], wind: j.daily.wind_speed_10m_max[i], sunrise: j.daily.sunrise[i], sunset: j.daily.sunset[i] }; });
  wxCache = { current: j.current, hourly, daily, days: j.daily.time };
  return wxCache;
}

/* ---------- misc ---------- */
// 'rejected' = the owner declined a request that was never confirmed
const statusKey = b => b.status === 'cancelled' && b.cancelled_by === 'owner' && !b.confirmed_at ? 'rejected' : b.status;
const phoneWa = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 9 ? '995' + d : d; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const waLink = (num, text) => num ? `https://wa.me/${String(num).replace(/\D/g, '')}${text ? '?text=' + encodeURIComponent(text) : ''}` : '';

/* services (activities) come from the database; this keeps window.RIDES and the texts in sync */
function applyServices(rows) {
  if (!rows || !rows.length) return;
  const list = [...rows].sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  window.RIDES.length = 0;
  for (const r of list) {
    const dk = (window.DICT.ka.rides || {})[r.ride] || [];
    for (const l of Object.keys(window.DICT)) {
      const d = window.DICT[l]; d.rides = d.rides || {};
      const old = d.rides[r.ride] || dk;
      d.rides[r.ride] = [r['name_' + l] || r.name_ka || old[0] || r.ride, r['info_' + l] || r.info_ka || old[1] || '', r['tag_' + l] || r.tag_ka || old[2] || ''];
    }
    window.RIDES.push({ id: r.ride, tag: !!(r.tag_ka || r.tag_en || r.tag_ru) });
  }
}
window.PW = { applyServices, token, auth, db, rpc, fn, myProfile, store, iso, fromIso, todayIso, hours, inSeason, openSlots, pad, i18n, fmt, weekdayHeaders, weather, wxInfo, rideScore, esc, waLink, statusKey, phoneWa };
})();
