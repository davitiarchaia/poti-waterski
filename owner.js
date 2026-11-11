/* Owner page — data is only readable/changeable by accounts with role = owner (enforced by the database). */
(() => {
const { auth, db, rpc, fn, equipText, i18n, fmt, iso, fromIso, todayIso, hours, inSeason, weather, wxInfo, rideScore, esc, waLink, pad, statusKey, phoneWa } = window.PW;
const ui = window.PW.ui;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const t = k => i18n.t(k);
i18n.init(window.DICT, ['ka', 'en']);

const state = {
  bookings: [], profiles: {}, offers: [], prices: [], boats: [], coaches: [], plans: [], passes: [], reviews: [], closures: [], lakes: [], photos: [], drivers: [],
  view: null, status: 'all', date: 'upcoming', q: '', wx: null, timer: null, editing: null, editPlan: null, editCoach: null, notes: {},
};
const HOURS = hours().length;                       // open hours per day (each booking row = 15 minutes)
const toMin = q => +q.slice(0, 2) * 60 + +q.slice(3, 5);
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const addQ = (q, n) => fromMin(toMin(q) + 15 * n);
const hourOf = q => q.slice(0, 2) + ':00';
const durText = n => t('durText')(Math.floor(n / 4), (n % 4) * 15);
const lakeById = id => state.lakes.find(l => l.id === id);
const lakeName = l => l ? (l['name_' + i18n.lang] || l.name_ka) : '';
const driverById = id => state.drivers.find(d => d.id === id);
const groupsText = gr => (gr || []).map(g => `${g.n} × ${t('levels')[g.l] || ''}`).join(', ');
// one customer booking = several 15-minute rows sharing group_id → merge them for display
function merge(rows) {
  const out = [], by = {};
  rows.forEach(b => {
    const k = b.group_id || b.id;
    if (!by[k]) { by[k] = { ...b, ids: [b.id], dur: 1, end: addQ(b.time, 1), price: b.price == null ? null : +b.price, paid: b.paid }; out.push(by[k]); }
    else { const g = by[k]; g.ids.push(b.id); g.dur++; if (b.time < g.time) g.time = b.time; const e = addQ(b.time, 1); if (e > g.end) g.end = e;
      g.price = g.price == null || b.price == null ? null : g.price + +b.price; g.paid = g.paid && b.paid; }
  });
  return out;
}
const uniq = list => new Set(list.map(b => b.group_id || b.id)).size;
const rideName = id => (t('rides')[id] || [id])[0];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const endOf = time => addQ(time, 1);
const levelName = l => t('levels')[window.DICT.en.levels.indexOf(l)] || l || '';
const offerById = id => state.offers.find(o => o.id === id);
const coachById = id => state.coaches.find(c => c.id === id);
const boatById = id => state.boats.find(b => b.id === id);
const money = v => '₾' + (Math.round((+v || 0) * 100) / 100).toLocaleString('ka-GE', { maximumFractionDigits: 2 });
const activeBoats = () => Math.max(state.lakes.filter(l => l.active).length, 1);   // capacity: one session per active lake at a time
const CAP = () => HOURS * activeBoats();
const notify = (event, id) => fn('notify', { event, id }).catch(() => {});

/* unsaved typing pauses the 1-minute auto refresh (it redraws the lists and would wipe the fields); any save/manual load() clears it */
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('form, #priceRows, #fleet, #lakes, textarea')) state.dirty = true; });
/* ---------- gate ---------- */
async function start() {
  const p = await ui.init({ ownerLink: false, onSignIn: () => start(), onSignOut: () => start() });
  clearInterval(state.timer);
  if (!auth.session) return gate(t('oSignInPrompt'), true);
  if (!p || p.role !== 'owner') return gate(t('oOnly'), false);
  $('#gate').hidden = true; $('#dash').hidden = false;
  await load();
  if (!state.view) show(location.hash.slice(1) || 'inbox');
  state.timer = setInterval(() => { if (!state.dirty) load(true); }, 60000);   // never redraw while something is being typed
  if (!state.wx) weather().then(w => { state.wx = w; render(); }).catch(() => { $('#oWx').innerHTML = `<p class="muted">${esc(t('wxNa'))}</p>`; });
}
function gate(msg, showBtn) { $('#dash').hidden = true; $('#gate').hidden = false; $('#gateMsg').textContent = msg; $('#gateBtn').hidden = !showBtn; }
$('#gateBtn').addEventListener('click', () => ui.open('in', () => start()));

/* ---------- sections ---------- */
const VIEWS = ['inbox', 'dash', 'all', 'schedule', 'passes', 'offers', 'prices', 'fleet', 'lakes', 'reviews', 'events', 'riders'];
function show(v) {
  if (!VIEWS.includes(v)) v = 'inbox';
  state.view = v;
  $$('.o-tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v));
  $$('.view').forEach(s => s.hidden = s.dataset.view !== v);
  history.replaceState(null, '', '#' + v);
}
$('.o-tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) show(b.dataset.view); });

/* ---------- data ---------- */
async function load(auto) {
  if (!auto) state.dirty = false;
  try {
    const [b, p, o, pr, bo, co, pl, ps, rv, cl, lk, ph, dr, pe] = await Promise.all([
      
      db('bookings?select=*&order=date.asc,time.asc&limit=20000'),
      db('profiles?select=id,username,full_name,phone,role'),
      db('offers?select=*&order=sort.asc,created_at.desc'),
      db('ride_prices?select=*'),
      db('boats?select=*&order=sort.asc,created_at.asc'),
      db('coaches?select=*&order=sort.asc,created_at.asc'),
      db('pass_plans?select=*&order=sort.asc,price.asc'),
      db('passes?select=*&order=created_at.desc&limit=2000'),
      db('reviews?select=*&order=created_at.desc&limit=1000'),
      db(`closures?select=*&date=gte.${iso(addDays(new Date(), -30))}&order=date.asc,time.asc.nullsfirst`),
      db('lakes?select=*&order=sort.asc,created_at.asc'), db('lake_photos?select=*&order=sort.asc,created_at.asc'), db('drivers?select=*&order=sort.asc,created_at.asc'),
      db('closed_periods?select=*&order=date_from.asc').catch(() => []),
    ]);
    b.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
    window.PW.applyServices(pr);
    Object.assign(state, { bookings: b, offers: o, prices: pr, boats: bo, coaches: co, plans: pl, passes: ps, reviews: rv, closures: cl, lakes: lk, photos: ph, drivers: dr, periods: pe,
      profiles: Object.fromEntries(p.map(x => [x.id, x])) });
    $('#updated').textContent = `${t('updated')} ${new Date().toLocaleTimeString(i18n.lang === 'ka' ? 'ka-GE' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    $('#tblError').textContent = '';
  } catch (e) {
    if (e.status === 401) { await auth.signOut(); return start(); }
    $('#tblError').textContent = t('errNet');
  }
  render();
}
// bookings that belong to one multi-hour booking are changed together
const groupOf = id => { const b = state.bookings.find(x => x.id === id); return b && b.group_id ? state.bookings.filter(x => x.group_id === b.group_id) : b ? [b] : []; };
async function patch(table, id, body, wholeGroup = true) {
  const b = table === 'bookings' && wholeGroup ? state.bookings.find(x => x.id === id) : null;
  const filter = b && b.group_id ? `group_id=eq.${b.group_id}` : `id=eq.${id}`;
  try { await db(`${table}?${filter}`, { method: 'PATCH', body, prefer: 'return=minimal' }); return true; }
  catch (x) { $('#tblError').textContent = x.code === '23505' ? t('errSlotClash') : t('errNet'); return false; }
}

/* ---------- WhatsApp reply in the customer's own language ---------- */
function inLang(lang, f) { const prev = i18n.lang; i18n.lang = window.DICT[lang] ? lang : 'ka'; try { return f(); } finally { i18n.lang = prev; } }
function replyLink(b) {
  const lang = window.DICT[b.lang] ? b.lang : 'ka', d = window.DICT[lang];
  const g = merge(groupOf(b.id))[0] || b;
  const when = inLang(lang, () => `${fmt(b.date, 'long')}, ${g.time}–${g.end || endOf(b.time)} · ${(d.rides[b.ride] || [b.ride])[0]}`);
  return waLink(phoneWa(b.phone), (statusKey(b) === 'confirmed' ? d.waConfirm : d.waReject)(b.name, when, b.owner_note || ''));
}
function payTag(b) {
  if (b.pass_id) return `<span class="pay-tag ok">🎟️ ${esc(t('byPass'))}</span>`;
  if (b.price == null) return `<span class="muted">—</span>`;
  if (b.paid) return `<span class="pay-tag ok">✓ ${money(b.price)} · ${esc(t('pm_' + (b.payment_method || 'cash')))}</span>`;
  if (b.payment_status === 'held') return `<span class="pay-tag held">🔒 ${money(b.price)} · ${esc(t('oHeld'))}</span>`;
  return `<span class="pay-tag">${money(b.price)} · ${esc(t(b.payment_status === 'voided' ? 'oVoided' : b.payment_status === 'failed' ? 'oPayFailed' : 'unpaid'))}</span>`;
}
const boatSelect = b => state.boats.length > 1 && !b.group_id ? `<select class="mini" data-boat="${b.id}" aria-label="${esc(t('boat'))}">${state.boats.map(x => `<option value="${x.id}" ${x.id === b.boat_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : '';
// which lake a booking goes to: chosen by the coach / driver in their account, or here by the owner
const lakeSelect = b => state.lakes.length && b.status !== 'cancelled' ? `<select class="mini lake-sel${b.lake_id ? '' : ' unset'}" data-lakesel="${b.id}" aria-label="${esc(t('lakeLabel'))}"><option value="">🌊 ${esc(t('lakeUnset'))}</option>${state.lakes.filter(l => l.active || l.id === b.lake_id).map(l => `<option value="${l.id}" ${l.id === b.lake_id ? 'selected' : ''}>🌊 ${esc(lakeName(l))}</option>`).join('')}</select>` : '';
const coachSelect = b => state.coaches.length ? `<select class="mini" data-coachsel="${b.id}" aria-label="${esc(t('coachTitle'))}"><option value="">${esc(t('noCoach'))}</option>${state.coaches.filter(c => c.active || c.id === b.coach_id).map(c => `<option value="${c.id}" ${c.id === b.coach_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : '';

/* ---------- INCOMING ---------- */
function wxFor(b) {
  const h = state.wx && state.wx.hourly[`${b.date}T${b.time}`];
  if (!h) return '';
  const sc = rideScore(h.wind, h.code, h.rain), [ic] = wxInfo(h.code);
  return `<span class="ib-wx">${ic} ${Math.round(h.temp)}° · ${esc(t('wxWind'))} ${Math.round(h.wind)} ${esc(t('kmh'))} <span class="score ${sc}">${esc(t('ride_' + sc))}</span></span>`;
}
function renderInbox() {
  const today = todayIso();
  const fresh = merge(state.bookings.filter(b => b.status === 'new' && b.date >= today));
  $('#cntInbox').textContent = fresh.length || '';
  const box = $('#inbox');
  if (!fresh.length) box.innerHTML = `<p class="inbox-empty">${esc(t('inboxEmpty'))}</p>`;
  else box.innerHTML = fresh.map(b => {
    const p = state.profiles[b.user_id], o = offerById(b.offer_id), wa = waLink(phoneWa(b.phone));
    const created = b.created_at ? new Date(b.created_at) : null;
    return `<article class="ib" data-id="${b.id}">
      <header class="ib-head">
        <div class="ib-when"><b>${esc(fmt(b.date, 'long'))}</b><span>${esc(b.time)}–${b.end}</span><small class="dur-tag">${esc(durText(b.dur))}</small></div>
        <div class="ib-ride"><b>${esc(rideName(b.ride))}</b>${o ? `<span class="offer-chip">${esc(o.title)}${o.discount_percent ? ` · −${o.discount_percent}%` : ''}</span>` : ''}${payTag(b)}</div>
      </header>
      <div class="ib-body">
        <div class="ib-who"><b>${esc(b.name)}</b>${p ? ` <span class="muted">@${esc(p.username)}</span>` : ''}
          <span><a href="tel:${esc(b.phone.replace(/\s/g, ''))}">${esc(b.phone)}</a>${wa ? ` · <a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${b.email ? ` · <a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}</span></div>
        <div class="ib-meta"><span>${esc(t('rider')(b.riders))}</span><span>${esc(b.rider_groups ? groupsText(b.rider_groups) : levelName(b.level))}</span>${equipText(b) ? `<span>🏄 ${esc(equipText(b))}</span>` : ''}${driverById(b.driver_id) ? `<span>🚤 ${esc(driverById(b.driver_id).name)}</span>` : ''}
          ${created ? `<span class="muted">${esc(t('received'))}: ${esc(fmt(iso(created), 'short'))} ${pad(created.getHours())}:${pad(created.getMinutes())}</span>` : ''}</div>
        <div class="ib-assign">${lakeSelect(b)}${coachSelect(b)}</div>
        ${b.notes ? `<p class="ib-notes">“${esc(b.notes)}”</p>` : ''}
        ${wxFor(b)}
      </div>
      <div class="ib-reply">
        <label><span>${esc(t('msgLabel'))}</span><textarea rows="2" maxlength="500" data-note="${b.id}" placeholder="${esc(t('msgPh'))}">${esc(state.notes[b.id] || '')}</textarea></label>
        <div class="quick">${['qBusy', 'qWeather', 'qOther'].map(k => `<button type="button" class="chip" data-quick="${k}" data-id="${b.id}">${esc(t(k))}</button>`).join('')}</div>
        <div class="ib-actions">
          <button type="button" class="btn-small primary big" data-decide="confirm" data-id="${b.id}">✓ ${esc(t(b.payment_status === 'held' ? 'confirmCharge' : 'confirm'))}</button>
          <button type="button" class="btn-small big" data-decide="reject" data-id="${b.id}">✕ ${esc(t('reject'))}</button>
        </div>
      </div>
    </article>`;
  }).join('');
  const recent = merge(state.bookings.filter(b => b.decided_at && ['confirmed', 'rejected'].includes(statusKey(b))))
    .sort((a, b) => b.decided_at.localeCompare(a.decided_at)).slice(0, 8);
  $('#recentH').hidden = !recent.length;
  $('#recent').innerHTML = recent.map(b => {
    const k = statusKey(b);
    return `<li><span class="badge ${k}">${esc(t('st_' + k))}</span>
      <span><b>${esc(b.name)}</b> · ${esc(fmt(b.date, 'short'))} ${esc(b.time)}–${esc(b.end)} · ${esc(rideName(b.ride))}${b.owner_note ? ` <span class="muted">— ${esc(b.owner_note)}</span>` : ''}</span>
      ${b.phone ? `<a class="btn-small wa" href="${esc(replyLink(b))}" target="_blank" rel="noopener">${esc(t('sendWa'))}</a>` : ''}</li>`;
  }).join('');
}
$('#inbox').addEventListener('input', e => { const n = e.target.dataset.note; if (n) state.notes[n] = e.target.value; });
document.addEventListener('change', async e => {
  const bs = e.target.closest('[data-boat]'), cs = e.target.closest('[data-coachsel]');
  if (bs) { await patch('bookings', bs.dataset.boat, { boat_id: bs.value }, false); load(); }
  if (cs) { await patch('bookings', cs.dataset.coachsel, { coach_id: cs.value || null }); load(); }
  const ls = e.target.closest('[data-lakesel]');
  if (ls) {
    ls.disabled = true;
    try { await rpc('staff_set_lake', { p_booking: ls.dataset.lakesel, p_lake: ls.value || null }); }
    catch (x) { const m = t(x.code === 'PW011' ? 'errLakeBusy' : 'errNet'); $('#tblError').textContent = m; if (window.PW.ui && window.PW.ui.toast) window.PW.ui.toast(m, 'err'); }
    load();
  }
});
$('#inbox').addEventListener('click', async e => {
  const q = e.target.closest('[data-quick]');
  if (q) { const ta = $(`[data-note="${q.dataset.id}"]`); ta.value = t(q.dataset.quick); state.notes[q.dataset.id] = ta.value; ta.focus(); return; }
  const btn = e.target.closest('[data-decide]'); if (!btn) return;
  const id = btn.dataset.id, note = (state.notes[id] || '').trim() || null;
  if (btn.dataset.decide === 'reject' && !btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = '✕ ' + t('rejectQ'); btn.classList.add('danger'); return; }
  btn.closest('.ib').querySelectorAll('button,select').forEach(x => x.disabled = true);
  const now = new Date().toISOString();
  const body = btn.dataset.decide === 'confirm'
    ? { status: 'confirmed', confirmed_at: now, decided_at: now, owner_note: note, cancelled_by: null }
    : { status: 'cancelled', cancelled_by: 'owner', decided_at: now, owner_note: note, confirmed_at: null };
  if (await patch('bookings', id, body)) { delete state.notes[id]; notify('booking_decided', id); await settleHold(id, btn.dataset.decide === 'confirm'); }
  load();
});
// money held on the customer's card: charge it on confirm, release it on reject/cancel
async function settleHold(id, charge) {
  const g = groupOf(id); if (!g.some(b => b.payment_status === 'held')) return;
  const r = await fn('bog-capture', { id, action: charge ? 'approve' : 'cancel' }).catch(() => ({ error: 'net' }));
  if (r && r.ok) ui.toast(t(charge ? 'oCharged' : 'oReleased'), 'ok');
  else ui.toast(t('oChargeFail'), 'bad');
}

/* ---------- STATISTICS ---------- */
function monthBounds(offset = 0) { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() + offset, 1), new Date(n.getFullYear(), n.getMonth() + offset + 1, 0)]; }
function revenueIn(d0, d1) {
  const a = iso(d0), z = iso(d1), inR = ts => ts && ts.slice(0, 10) >= a && ts.slice(0, 10) <= z;
  const bk = state.bookings.filter(b => b.paid && !b.pass_id && b.price > 0 && inR(b.paid_at)).reduce((s, b) => s + +b.price, 0);
  const ps = state.passes.filter(p => p.paid && p.price > 0 && inR(p.paid_at)).reduce((s, p) => s + +p.price, 0);
  return bk + ps;
}
function renderKpis() {
  const today = todayIso();
  const active = state.bookings.filter(b => b.status !== 'cancelled');
  const [m0, m1] = monthBounds();
  const monthRows = active.filter(b => b.date >= iso(m0) && b.date <= iso(m1)), inMonth = uniq(monthRows);
  let cap = 0; for (let d = new Date(m0); d <= m1; d.setDate(d.getDate() + 1)) if (inSeason(d)) cap += CAP();
  const fresh = uniq(state.bookings.filter(b => b.status === 'new' && b.date >= today));
  const expected = active.filter(b => b.date >= today && !b.paid && b.price > 0).reduce((s, b) => s + +b.price, 0);
  const vis = state.reviews.filter(r => !r.hidden), avg = vis.length ? (vis.reduce((s, r) => s + r.rating, 0) / vis.length).toFixed(1) : '—';
  const livePasses = state.passes.filter(p => p.status === 'active' && p.expires_at >= today).length;
  const k = [
    ['kNew', fresh, fresh > 0], ['kRevenue', money(revenueIn(m0, m1))], ['kExpected', money(expected)],
    ['kMonth', inMonth], ['kOcc', cap ? Math.round(monthRows.length / 4 / cap * 100) + '%' : '—'], ['kRating', avg === '—' ? '—' : `${avg} ★`],
    ['kPasses', livePasses], ['kCust', new Set(active.map(b => b.user_id).filter(Boolean)).size],
  ];
  $('#kpis').innerHTML = k.map(([key, v, alert]) => `<div class="kpi${alert ? ' alert' : ''}"><small>${esc(t(key))}</small><b>${esc(v)}</b></div>`).join('');
}
// generic bar chart (one series) with hover tooltips
function barChart(box, items, { max, label, tip, yFmt = v => v, ref }) {
  const W = 720, H = 220, L = 44, R = 8, T = 10, B = 26, iw = W - L - R, ih = H - T - B;
  const top = Math.max(max || 0, ...items.map(i => i.v), 1), bw = iw / items.length, gap = Math.min(6, bw * .25), y = v => T + ih - v / top * ih;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
  [0, top / 2, top].forEach(v => { svg += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${esc(yFmt(Math.round(v)))}</text>`; });
  if (ref) svg += `<line class="cap" x1="${L}" x2="${W - R}" y1="${y(ref)}" y2="${y(ref)}"/>`;
  items.forEach((it, i) => {
    const x = L + i * bw + gap / 2, w = bw - gap;
    if (it.v > 0) { const h = Math.max(it.v / top * ih, 2), tp = T + ih - h, r = Math.min(4, w / 2, h);
      svg += `<path class="bar" d="M${x},${T + ih} V${tp + r} Q${x},${tp} ${x + r},${tp} H${x + w - r} Q${x + w},${tp} ${x + w},${tp + r} V${T + ih} Z"/>`; }
    if (it.label) svg += `<text class="axis" x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(it.label)}</text>`;
    svg += `<rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${ih}" data-i="${i}"/>`;
  });
  box.innerHTML = svg + `</svg><div class="tip" hidden></div>`;
  const tipEl = box.querySelector('.tip'), el = box.querySelector('svg');
  const showTip = r => {
    const it = items[+r.dataset.i], bb = el.getBoundingClientRect(), rb = r.getBoundingClientRect();
    tipEl.hidden = false; tipEl.innerHTML = tip(it);
    tipEl.style.left = (rb.left - bb.left + rb.width / 2) + 'px';
    tipEl.style.top = Math.max(rb.top - bb.top + rb.height * (1 - it.v / top) - 6, 30) + 'px';
  };
  box.querySelectorAll('.hit').forEach(r => { r.addEventListener('mouseenter', () => showTip(r)); r.addEventListener('click', () => showTip(r)); });
  el.addEventListener('mouseleave', () => tipEl.hidden = true);
}
function renderRevenue() {
  const items = [...Array(6)].map((_, i) => { const [a, z] = monthBounds(i - 5); return { a, v: revenueIn(a, z), label: fmt(a, 'mo') }; });
  if (!items.some(i => i.v)) return $('#revChart').innerHTML = `<p class="empty">${esc(t('noRevenue'))}</p>`;
  barChart($('#revChart'), items, { label: t('cRevenue'), yFmt: v => '₾' + v, tip: it => `<b>${esc(fmt(it.a, 'month'))}</b>${money(it.v)}` });
}
function renderPerDay() {
  const s0 = new Date(); s0.setHours(0, 0, 0, 0);
  const days = [...Array(30)].map((_, i) => iso(addDays(s0, i)));
  const counts = Object.fromEntries(days.map(d => [d, 0]));
  state.bookings.forEach(b => { if (b.status !== 'cancelled' && b.date in counts) counts[b.date] += 0.25; });   // boat-hours
  barChart($('#perDay'), days.map((d, i) => ({ d, v: counts[d], closed: !inSeason(fromIso(d)), label: i % 5 === 0 || i === 29 ? fmt(d, 'short') : '' })),
    { max: CAP(), ref: CAP(), label: t('cPerDay'), tip: it => `<b>${esc(fmt(it.d, 'long'))}</b>${it.closed ? esc(t('closed')) : esc(t('cOfCap')(it.v, CAP()))}` });
}
function hbars(box, rows) {
  if (!rows.length || !rows.some(r => r[1])) return box.innerHTML = `<p class="empty">${esc(t('noData'))}</p>`;
  const max = Math.max(...rows.map(c => c[1]), 1);
  box.innerHTML = rows.map(([name, n, extra]) => `<div class="hbar"><span>${esc(name)}</span><b>${n}${extra ? ` <small class="muted">${esc(extra)}</small>` : ''}</b>
    <div class="track"><div class="fill" style="width:${n / max * 100}%"></div></div></div>`).join('');
}
function renderBreakdowns() {
  const active = state.bookings.filter(b => b.status !== 'cancelled');
  hbars($('#byRide'), window.RIDES.map(r => [rideName(r.id), uniq(active.filter(b => b.ride === r.id))]).sort((a, b) => b[1] - a[1]));
  const s0 = todayIso(), s30 = iso(addDays(new Date(), 30));
  hbars($('#byCoach'), state.coaches.map(c => [c.name, uniq(active.filter(b => b.coach_id === c.id)), t('next30')(uniq(active.filter(b => b.coach_id === c.id && b.date >= s0 && b.date <= s30)))]).sort((a, b) => b[1] - a[1]));
  hbars($('#byOffer'), state.offers.map(o => [o.title, uniq(active.filter(b => b.offer_id === o.id))]).filter(r => r[1]).sort((a, b) => b[1] - a[1]));
  if ($('#byLake')) hbars($('#byLake'), [...state.lakes.map(l => [lakeName(l), uniq(active.filter(b => b.lake_id === l.id)), t('hoursShort')(active.filter(b => b.lake_id === l.id).length / 4)]),
    ...(active.some(b => !b.lake_id) ? [[t('lakeUnset'), uniq(active.filter(b => !b.lake_id)), t('hoursShort')(active.filter(b => !b.lake_id).length / 4)]] : [])]);
  // outcomes of decided requests (counted per booking, not per 15-minute row)
  const all = merge(state.bookings), n = all.length || 1;
  const cnt = k => all.filter(b => statusKey(b) === k).length;
  const byCust = all.filter(b => b.status === 'cancelled' && b.cancelled_by === 'customer').length;
  const custs = {}; all.filter(b => b.user_id && b.status !== 'cancelled').forEach(b => custs[b.user_id] = (custs[b.user_id] || 0) + 1);
  const ids = Object.keys(custs), repeat = ids.length ? Math.round(ids.filter(i => custs[i] > 1).length / ids.length * 100) : 0;
  const paidShare = (() => { const pr = all.filter(b => b.status !== 'cancelled' && b.price > 0); return pr.length ? Math.round(pr.filter(b => b.paid).length / pr.length * 100) : 0; })();
  const tiles = [['oConfirmed', cnt('confirmed'), 'good'], ['oPending', cnt('new'), 'warn'], ['oRejected', cnt('rejected'), 'crit'], ['oCustCancel', byCust, 'muted'],
    ['oRepeat', repeat + '%', ''], ['oPaidShare', paidShare + '%', '']];
  $('#outcome').innerHTML = all.length ? tiles.map(([k, v, c]) => `<div class="oc ${c}"><b>${esc(v)}</b><small>${esc(t(k))}</small>${typeof v === 'number' ? `<i style="width:${v / n * 100}%"></i>` : ''}</div>`).join('') : `<p class="empty">${esc(t('noData'))}</p>`;
}
function renderHeat() {
  const active = state.bookings.filter(b => b.status !== 'cancelled');
  const hs = hours(), grid = [...Array(7)].map(() => hs.map(() => 0));
  active.forEach(b => { const wd = (fromIso(b.date).getDay() + 6) % 7, hi = hs.indexOf(hourOf(b.time)); if (hi >= 0) grid[wd][hi] += 0.25; });
  grid.forEach(r => r.forEach((v, i) => r[i] = Math.round(v * 4) / 4));
  const max = Math.max(1, ...grid.flat()), wds = window.PW.weekdayHeaders();
  if (!active.length) return $('#heat').innerHTML = `<p class="empty">${esc(t('noData'))}</p>`;
  const step = v => v === 0 ? 0 : Math.min(5, Math.ceil(v / max * 5));
  $('#heat').innerHTML = `<div class="hm" style="grid-template-columns:auto repeat(${hs.length},minmax(0,1fr))">
    <span></span>${hs.map(h => `<span class="hm-h">${h.slice(0, 2)}</span>`).join('')}
    ${grid.map((row, i) => `<span class="hm-d">${esc(wds[i])}</span>${row.map((v, j) => `<span class="hm-c s${step(v)}" title="${esc(wds[i])} ${hs[j]} — ${v}">${v || ''}</span>`).join('')}`).join('')}
  </div><div class="hm-legend"><span>0</span>${[1, 2, 3, 4, 5].map(s => `<i class="hm-c s${s}"></i>`).join('')}<span>${max}</span></div>`;
}
function renderWeather() {
  const wx = state.wx; if (!wx) return;
  $('#oWx').innerHTML = wx.days.slice(0, 7).map(d => {
    const x = wx.daily[d], [ic, k] = wxInfo(x.code), sc = rideScore(x.wind, x.code, x.rain);
    return `<div class="wx-card"><small>${esc(d === todayIso() ? t('today') : fmt(d, 'wd'))} ${fromIso(d).getDate()}</small>
      <span class="big" aria-hidden="true">${ic}</span><b class="temp">${Math.round(x.max)}°<span> / ${Math.round(x.min)}°</span></b>
      <span>${esc(t('wx')[k])}</span><span class="muted">${esc(t('wxWind'))} ${Math.round(x.wind)} · ${esc(t('wxRain'))} ${x.rain ?? 0}%</span>
      <span class="score ${sc}">${esc(t('ride_' + sc))}</span></div>`;
  }).join('');
}

/* ---------- PASSES ---------- */
const passUsed = p => state.bookings.filter(b => b.pass_id === p.id && b.status !== 'cancelled').length * 0.25;
function renderPasses() {
  const today = todayIso();
  const pending = state.passes.filter(p => p.status === 'pending');
  const live = state.passes.filter(p => p.status === 'active' && p.expires_at >= today && passUsed(p) < p.hours_total);
  const done = state.passes.filter(p => p.status === 'cancelled' || (p.status === 'active' && (p.expires_at < today || passUsed(p) >= p.hours_total)));
  $('#cntPasses').textContent = pending.length || '';
  const who = p => { const pr = state.profiles[p.user_id]; return pr ? `<b>${esc(pr.full_name || pr.username)}</b> <span class="muted">@${esc(pr.username)}</span>${pr.phone ? ` · <a href="tel:${esc(pr.phone.replace(/\s/g, ''))}">${esc(pr.phone)}</a>` : ''}` : '<span class="muted">—</span>'; };
  const card = (p, acts) => {
    const used = passUsed(p);
    return `<article class="ps-card"><div class="ps-main"><div><b class="ps-name">${esc(p.name)}</b> · ${money(p.price)} · ${esc(t('passHours')(p.hours_total))}${p.ride ? ' · ' + esc(rideName(p.ride)) : ''}</div>
      <div class="ps-who">${who(p)}</div>
      ${p.status === 'active' ? `<div class="mp-bar dark"><i style="width:${(p.hours_total - used) / p.hours_total * 100}%"></i></div><small class="muted">${esc(t('hoursLeft')(Math.max(0, p.hours_total - used), p.hours_total))} · ${esc(t('validTill')(fmt(p.expires_at, 'dm')))}${p.paid ? ' · ' + esc(t('pm_' + (p.payment_method || 'cash'))) : ''}</small>` : `<small class="muted">${esc(t('requested'))}: ${esc(fmt(p.created_at.slice(0, 10), 'dm'))}</small>`}
      </div><div class="ps-acts">${acts}</div></article>`;
  };
  $('#psPending').innerHTML = pending.length ? pending.map(p => card(p, `
      <select class="mini" data-pm="${p.id}" aria-label="${esc(t('payMethod'))}"><option value="cash">${esc(t('pm_cash'))}</option><option value="card">${esc(t('pm_card'))}</option></select>
      <button type="button" class="btn-small primary" data-activate="${p.id}">✓ ${esc(t('psActivate'))}</button>
      <button type="button" class="btn-small" data-pcancel="${p.id}">${esc(t('cancel'))}</button>`)).join('') : `<p class="inbox-empty">${esc(t('psNoReq'))}</p>`;
  $('#psActive').innerHTML = live.length ? live.map(p => card(p, `<button type="button" class="btn-small" data-pcancel="${p.id}">${esc(t('cancel'))}</button>`)).join('') : `<p class="empty">${esc(t('noData'))}</p>`;
  $('#psDone').innerHTML = done.length ? done.slice(0, 30).map(p => card(p, `<span class="badge ${p.status === 'cancelled' ? 'cancelled' : 'confirmed'}">${esc(t(p.status === 'cancelled' ? 'pass_cancelled' : 'pass_expired'))}</span>`)).join('') : `<p class="empty">${esc(t('noData'))}</p>`;
}
$('section.view[data-view=passes]').addEventListener('click', async e => {
  const a = e.target.closest('[data-activate]'), c = e.target.closest('[data-pcancel]');
  if (a) { a.disabled = true; const pm = $(`[data-pm="${a.dataset.activate}"]`).value;
    if (await patch('passes', a.dataset.activate, { status: 'active', paid: true, payment_method: pm })) notify('pass_activated', a.dataset.activate);
    return load(); }
  if (c) { if (!c.dataset.sure) { c.dataset.sure = 1; c.textContent = t('cancelQ'); c.classList.add('danger'); return; }
    c.disabled = true; await patch('passes', c.dataset.pcancel, { status: 'cancelled' }); load(); }
});

/* ---------- PRICES & PASS PLANS ---------- */
function renderPrices() {
  const rows = state.prices.filter(r => !r.archived).sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const used = id => state.bookings.filter(b => b.ride === id).length;
  const inp = (r, k, max, ph = '') => `<input data-sv="${r.ride}" data-k="${k}" maxlength="${max}" value="${esc(r[k] || (k === 'name_ka' ? rideName(r.ride) : ''))}" placeholder="${esc(ph)}">`;
  $('#priceRows').innerHTML = rows.map((r, i) => `<div class="svc-row${r.active === false ? ' off' : ''}">
      <div class="svc-main">
        <div class="svc-order"><button type="button" class="btn-small" data-svmove="${r.ride}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="up">↑</button><button type="button" class="btn-small" data-svmove="${r.ride}" data-dir="1" ${i < rows.length - 1 ? '' : 'disabled'} aria-label="down">↓</button></div>
        <label class="svc-name"><span>${esc(t('svName'))} (ქარ)</span>${inp(r, 'name_ka', 60)}</label>
        <label class="money-in"><span>₾</span><input type="number" min="0" step="0.5" inputmode="decimal" data-sv="${r.ride}" data-k="price" value="${r.price ?? ''}" placeholder="${esc(t('noPrice'))}"><small>${esc(t('perHour'))}</small></label>
        <label class="check"><input type="checkbox" data-sv="${r.ride}" data-k="active" ${r.active !== false ? 'checked' : ''}> <span>${esc(t('fActive'))}</span></label>
      </div>
      <label class="svc-info"><span>${esc(t('svInfo'))} (ქარ)</span>${inp(r, 'info_ka', 140, t('svInfoPh'))}</label>
      <div class="svc-gear" data-gearbox="${esc(r.ride)}"></div>
      <details class="svc-more"><summary>${esc(t('svMore'))}</summary>
        <div class="svc-grid">
          <label><span>${esc(t('svName'))} (EN)</span>${inp(r, 'name_en', 60)}</label><label><span>${esc(t('svName'))} (RU)</span>${inp(r, 'name_ru', 60)}</label>
          <label><span>${esc(t('svInfo'))} (EN)</span>${inp(r, 'info_en', 140)}</label><label><span>${esc(t('svInfo'))} (RU)</span>${inp(r, 'info_ru', 140)}</label>
          <label><span>${esc(t('svTag'))} (ქარ)</span>${inp(r, 'tag_ka', 30, t('svTagPh'))}</label><label><span>${esc(t('svTag'))} (EN)</span>${inp(r, 'tag_en', 30)}</label>
          <label><span>${esc(t('svTag'))} (RU)</span>${inp(r, 'tag_ru', 30)}</label>
        </div>
        <p class="muted small">${esc(t('svUsed')(used(r.ride)))}</p>
        <button type="button" class="btn-small" data-svdel="${r.ride}">${esc(t('del'))}</button>
      </details>
    </div>`).join('');
}
const NUM_KEYS = ['price'];
const svVal = (id, k) => { const el = $(`[data-sv="${id}"][data-k="${k}"]`); if (!el) return undefined; if (k === 'active') return el.checked; if (NUM_KEYS.includes(k)) return el.value === '' ? null : Math.max(0, +el.value); return el.value.trim() || null; };
const SV_KEYS = ['name_ka', 'name_en', 'name_ru', 'info_ka', 'info_en', 'info_ru', 'tag_ka', 'tag_en', 'tag_ru', 'price', 'active'];
$('#savePrices').addEventListener('click', async e => {
  const btn = e.target; btn.disabled = true; $('#priceError').textContent = '';
  try {
    if (window.ownerGearSave) await window.ownerGearSave();
    for (const r of state.prices.filter(r => !r.archived)) {
      const body = {};
      for (const k of SV_KEYS) { const v = svVal(r.ride, k); if (v !== undefined && v !== (NUM_KEYS.includes(k) && r[k] != null ? +r[k] : r[k] ?? null)) body[k] = v; }
      if (!Object.keys(body).length) continue;
      if ('name_ka' in body && (!body.name_ka || body.name_ka.length < 2)) throw Object.assign(new Error('name'), { code: 'name' });
      body.updated_at = new Date().toISOString();
      await db(`ride_prices?ride=eq.${encodeURIComponent(r.ride)}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    }
    btn.textContent = t('saved'); setTimeout(() => btn.textContent = t('save'), 1500);
  } catch (x) { $('#priceError').textContent = x.code === 'name' ? t('svErrName') : t('errNet'); }
  btn.disabled = false; load();
});
$('#priceRows').addEventListener('click', async e => {
  const m = e.target.closest('[data-svmove]'), d = e.target.closest('[data-svdel]');
  if (m) {
    const rows = state.prices.filter(r => !r.archived).sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    const i = rows.findIndex(r => r.ride === m.dataset.svmove), j = i + +m.dataset.dir;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]]; m.disabled = true;
    try { await Promise.all(rows.map((r, k) => r.sort === k + 1 ? null : db(`ride_prices?ride=eq.${encodeURIComponent(r.ride)}`, { method: 'PATCH', body: { sort: k + 1 }, prefer: 'return=minimal' })).filter(Boolean)); } catch { $('#priceError').textContent = t('errNet'); }
    return load();
  }
  if (d) {
    if (!d.dataset.sure) { d.dataset.sure = 1; d.textContent = t('delQ'); d.classList.add('danger'); return; }
    d.disabled = true;
    const q = `ride_prices?ride=eq.${encodeURIComponent(d.dataset.svdel)}`, live = state.bookings.some(b => b.ride === d.dataset.svdel && b.status !== 'cancelled' && b.date >= todayIso());
    try {
      if (live) throw Object.assign(new Error('live'), { code: 'live' });
      try { await db(q, { method: 'DELETE', prefer: 'return=minimal' }); }
      catch (x) {      // old bookings still point to this service: keep their history, take the service out of the site and this list
        if (String(x.code) !== '23503') throw x;
        await db(q, { method: 'PATCH', body: { archived: true, active: false }, prefer: 'return=minimal' });
      }
      if (window.PW.ui && window.PW.ui.toast) window.PW.ui.toast(t('svDeleted'), 'ok');
    } catch (x) { $('#priceError').textContent = x.code === 'live' ? t('svErrLive') : t('errNet'); }
    return load();
  }
});
$('#svcForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, err = $('#svcError'); err.textContent = '';
  const name = f.name_ka.value.trim();
  if (name.length < 2) return err.textContent = t('svErrName');
  const body = { ride: 's' + Date.now().toString(36), name_ka: name, name_en: f.name_en.value.trim() || null, name_ru: f.name_ru.value.trim() || null,
    info_ka: f.info_ka.value.trim() || null, tag_ka: f.tag_ka.value.trim() || null, price: f.price.value === '' ? null : Math.max(0, +f.price.value),
    active: true, sort: Math.max(0, ...state.prices.map(r => r.sort || 0)) + 1 };
  const gear = [...document.querySelectorAll('#svcGearRows .sg-row')].map((r, i) => ({ ride: body.ride, name_ka: r.querySelector('[name=gn]').value.trim(), price: Math.min(10000, Math.max(0, +r.querySelector('[name=gp]').value || 0)), per_rider: true, active: true, sort: i + 1 })).filter(g => g.name_ka);
  const btn = f.querySelector('[type=submit]'); btn.disabled = true;
  try { await db('ride_prices', { method: 'POST', body, prefer: 'return=minimal' }); if (gear.length) await db('equipment', { method: 'POST', body: gear, prefer: 'return=minimal' }); f.reset(); $('#svcGearRows').innerHTML = ''; toastOk(t('svAdded')); await load(); }
  catch { err.textContent = t('errNet'); }
  btn.disabled = false;
});
$('#svcGearAdd').addEventListener('click', () => {
  const r = document.createElement('div'); r.className = 'sg-row';
  r.innerHTML = `<input name="gn" maxlength="80" placeholder="${esc(t('sgName'))}" aria-label="${esc(t('sgName'))}"><input name="gp" type="number" min="0" max="10000" step="0.5" inputmode="decimal" placeholder="${esc(t('sgPrice'))}" aria-label="${esc(t('sgPrice'))}"><button type="button" class="btn-small" aria-label="remove">✕</button>`;
  r.querySelector('button').onclick = () => r.remove();
  $('#svcGearRows').append(r); r.querySelector('input').focus();
});
const toastOk = m => ui.toast(m, 'ok');
const pform = $('#planForm');
function rideOptions(sel, allLabel) { const v = sel.value; sel.innerHTML = `<option value="">${esc(allLabel)}</option>` + window.RIDES.map(r => `<option value="${r.id}">${esc(rideName(r.id))}</option>`).join(''); sel.value = v; }
function renderPlans() {
  rideOptions($('#planRide'), t('fAny'));
  $('#planFormTitle').textContent = t(state.editPlan ? 'plEdit' : 'plNew'); $('#planCancel').hidden = !state.editPlan;
  const list = $('#planList');
  if (!state.plans.length) return list.innerHTML = `<p class="inbox-empty">${esc(t('plNone'))}</p>`;
  list.innerHTML = state.plans.map(p => {
    const sold = state.passes.filter(x => x.plan_id === p.id && x.status !== 'cancelled').length;
    return `<article class="offer-card ${p.active ? 'oLive' : 'oHidden'}${state.editPlan === p.id ? ' editing' : ''}">
      <div class="oc-top"><span class="ostate ${p.active ? 'oLive' : 'oHidden'}">${esc(t(p.active ? 'oLive' : 'oHidden'))}</span><span class="oc-disc">${money(p.price)}</span></div>
      <h3>${esc(p.name)}</h3>${p.description ? `<p>${esc(p.description)}</p>` : ''}
      <ul class="oc-meta"><li>${esc(t('passHours')(p.hours))}</li><li>${esc(t('passValid')(p.valid_days))}</li><li>${esc(p.ride ? rideName(p.ride) : t('fAny'))}</li><li>${esc(t('perHourEq')((p.price / p.hours).toFixed(1)))}</li><li>${esc(t('sold')(sold))}</li></ul>
      <div class="oc-actions"><button type="button" class="btn-small" data-plact="edit" data-id="${p.id}">${esc(t('edit'))}</button>
        <button type="button" class="btn-small" data-plact="toggle" data-id="${p.id}">${esc(t(p.active ? 'hide' : 'show'))}</button>
        <button type="button" class="btn-small" data-plact="del" data-id="${p.id}">${esc(t('del'))}</button></div></article>`;
  }).join('');
}
function fillPlan(p) {
  pform.name.value = p ? p.name : ''; pform.hours.value = p ? p.hours : ''; pform.price.value = p ? p.price : ''; pform.valid_days.value = p ? p.valid_days : '';
  pform.ride.value = p && p.ride ? p.ride : ''; pform.description.value = p ? p.description || '' : ''; pform.active.checked = p ? p.active : true; $('#planError').textContent = '';
}
pform.addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#planError'), name = pform.name.value.trim(), h = Math.round(+pform.hours.value), price = +pform.price.value, days = Math.round(+pform.valid_days.value);
  if (name.length < 2) return err.textContent = t('errTitle');
  if (!(h >= 1 && h <= 200) || !(price >= 0) || pform.price.value === '' || !(days >= 1 && days <= 730)) return err.textContent = t('plErr');
  const body = { name, hours: h, price, valid_days: days, ride: pform.ride.value || null, description: pform.description.value.trim() || null, active: pform.active.checked };
  const btn = pform.querySelector('[type=submit]'); btn.disabled = true;
  try {
    if (state.editPlan) await db(`pass_plans?id=eq.${state.editPlan}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    else await db('pass_plans', { method: 'POST', body, prefer: 'return=minimal' });
    state.editPlan = null; fillPlan(null);
  } catch { err.textContent = t('errNet'); }
  btn.disabled = false; load();
});
$('#planCancel').addEventListener('click', () => { state.editPlan = null; fillPlan(null); renderPlans(); });
$('#planList').addEventListener('click', async e => {
  const b = e.target.closest('[data-plact]'); if (!b) return;
  const p = state.plans.find(x => x.id === b.dataset.id); if (!p) return;
  if (b.dataset.plact === 'edit') { state.editPlan = p.id; fillPlan(p); renderPlans(); pform.scrollIntoView({ behavior: 'smooth' }); return; }
  if (b.dataset.plact === 'del' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = t('delQ'); b.classList.add('danger'); return; }
  b.disabled = true;
  try { if (b.dataset.plact === 'toggle') await db(`pass_plans?id=eq.${p.id}`, { method: 'PATCH', body: { active: !p.active }, prefer: 'return=minimal' });
        else await db(`pass_plans?id=eq.${p.id}`, { method: 'DELETE', prefer: 'return=minimal' }); } catch { $('#tblError').textContent = t('errNet'); }
  load();
});

/* ---------- BOATS & COACHES ---------- */
function renderFleet() {
  $('#boatList').innerHTML = state.boats.map(b => `<li class="${b.active ? '' : 'off'}">
      <span class="boat-ic" aria-hidden="true">🚤</span><input class="boat-name" value="${esc(b.name)}" maxlength="60" data-bname="${b.id}" aria-label="${esc(t('boat'))}">
      <select class="mini" data-blake="${b.id}" aria-label="${esc(t('lakeLabel'))}"><option value="">—</option>${state.lakes.map(l => `<option value="${l.id}" ${l.id === b.lake_id ? 'selected' : ''}>${esc(lakeName(l))}</option>`).join('')}</select>
      <span class="muted">${esc(t('boatUse')(uniq(state.bookings.filter(x => x.boat_id === b.id && x.status !== 'cancelled' && x.date >= todayIso()))))}</span>
      <button type="button" class="btn-small" data-btoggle="${b.id}">${esc(t(b.active ? 'hide' : 'show'))}</button>
      <button type="button" class="btn-small" data-bdel="${b.id}">${esc(t('del'))}</button></li>`).join('') || `<li class="muted">${esc(t('noData'))}</li>`;
  $('#coachRides').innerHTML = window.RIDES.map(r => `<label class="check"><input type="checkbox" value="${r.id}" data-cride ${state.editCoach && (coachById(state.editCoach).rides || []).includes(r.id) ? 'checked' : ''}> <span>${esc(rideName(r.id))}</span></label>`).join('');
  $('#coachFormTitle').textContent = t(state.editCoach ? 'coEdit' : 'coNew'); $('#coachCancel').hidden = !state.editCoach;
  $('#coachList').innerHTML = state.coaches.length ? state.coaches.map(c => {
    const upcoming = uniq(state.bookings.filter(b => b.coach_id === c.id && b.status !== 'cancelled' && b.date >= todayIso()));
    return `<article class="offer-card coach-card ${c.active ? 'oLive' : 'oHidden'}${state.editCoach === c.id ? ' editing' : ''}">
      <div class="cc-top"><span class="ph">${c.photo_url ? `<img src="${esc(c.photo_url)}" alt="">` : esc(c.name.slice(0, 1))}</span><div><h3>${esc(c.name)}</h3><span class="ostate ${c.active ? 'oLive' : 'oHidden'}">${esc(t(c.active ? 'oLive' : 'oHidden'))}</span></div></div>
      ${c.bio ? `<p>${esc(c.bio)}</p>` : ''}
      <ul class="oc-meta"><li>${esc(c.rides && c.rides.length ? c.rides.map(rideName).join(', ') : t('fAny'))}</li><li>${esc(t('coachUpcoming')(upcoming))}</li></ul>
      ${window.staffLinkUI ? window.staffLinkUI('coach', c) : ''}
      <div class="oc-actions"><button type="button" class="btn-small" data-cact="edit" data-id="${c.id}">${esc(t('edit'))}</button>
        <button type="button" class="btn-small" data-cact="toggle" data-id="${c.id}">${esc(t(c.active ? 'hide' : 'show'))}</button>
        <button type="button" class="btn-small" data-cact="del" data-id="${c.id}">${esc(t('del'))}</button></div></article>`;
  }).join('') : `<p class="inbox-empty">${esc(t('coNone'))}</p>`;
}
$('#boatForm').addEventListener('submit', async e => {
  e.preventDefault(); const n = e.target.name.value.trim(); if (!n) return;
  try { await db('boats', { method: 'POST', body: { name: n, sort: state.boats.length, lake_id: (state.lakes[0] || {}).id || null }, prefer: 'return=minimal' }); e.target.reset(); } catch { $('#tblError').textContent = t('errNet'); }
  load();
});
$('#boatList').addEventListener('change', async e => {
  const i = e.target.closest('[data-bname]'), l = e.target.closest('[data-blake]');
  if (i && i.value.trim()) { await patch('boats', i.dataset.bname, { name: i.value.trim() }); load(); }
  if (l) { await patch('boats', l.dataset.blake, { lake_id: l.value || null }); load(); }
});
$('#boatList').addEventListener('click', async e => {
  const tg = e.target.closest('[data-btoggle]'), dl = e.target.closest('[data-bdel]');
  if (tg) { const b = boatById(tg.dataset.btoggle); await patch('boats', b.id, { active: !b.active }); return load(); }
  if (dl) { if (!dl.dataset.sure) { dl.dataset.sure = 1; dl.textContent = t('delQ'); dl.classList.add('danger'); return; }
    try { await db(`boats?id=eq.${dl.dataset.bdel}`, { method: 'DELETE', prefer: 'return=minimal' }); } catch { $('#tblError').textContent = t('errNet'); } load(); }
});
const cform = $('#coachForm');
function fillCoach(c) { cform.name.value = c ? c.name : ''; cform.bio.value = c ? c.bio || '' : ''; cform.photo_url.value = c ? c.photo_url || '' : ''; cform.active.checked = c ? c.active : true; $('#coachError').textContent = ''; }
cform.addEventListener('submit', async e => {
  e.preventDefault();
  const name = cform.name.value.trim(), photo = cform.photo_url.value.trim();
  if (!name) return $('#coachError').textContent = t('errTitle');
  if (photo && !/^https:\/\//.test(photo)) return $('#coachError').textContent = t('errPhoto');
  const body = { name, bio: cform.bio.value.trim() || null, photo_url: photo || null, rides: $$('[data-cride]:checked').map(x => x.value), active: cform.active.checked };
  try {
    if (state.editCoach) await db(`coaches?id=eq.${state.editCoach}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    else await db('coaches', { method: 'POST', body: { ...body, sort: state.coaches.length }, prefer: 'return=minimal' });
    state.editCoach = null; fillCoach(null);
  } catch { $('#coachError').textContent = t('errNet'); }
  load();
});
$('#coachCancel').addEventListener('click', () => { state.editCoach = null; fillCoach(null); renderFleet(); });
$('#coachList').addEventListener('click', async e => {
  const b = e.target.closest('[data-cact]'); if (!b) return;
  const c = coachById(b.dataset.id); if (!c) return;
  if (b.dataset.cact === 'edit') { state.editCoach = c.id; fillCoach(c); renderFleet(); cform.scrollIntoView({ behavior: 'smooth' }); return; }
  if (b.dataset.cact === 'del' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = t('delQ'); b.classList.add('danger'); return; }
  b.disabled = true;
  try { if (b.dataset.cact === 'toggle') await db(`coaches?id=eq.${c.id}`, { method: 'PATCH', body: { active: !c.active }, prefer: 'return=minimal' });
        else await db(`coaches?id=eq.${c.id}`, { method: 'DELETE', prefer: 'return=minimal' }); } catch { $('#tblError').textContent = t('errNet'); }
  load();
});

/* ---------- REVIEWS ---------- */
const stars = n => `<span class="stars" aria-label="${n} / 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
function renderReviewsAdmin() {
  const r = state.reviews, vis = r.filter(x => !x.hidden);
  const avg = vis.length ? vis.reduce((s, x) => s + x.rating, 0) / vis.length : 0;
  $('#rvHead').innerHTML = r.length ? `<div class="rv-summary compact"><div class="rv-score"><b>${avg ? avg.toFixed(1) : '—'}</b>${stars(Math.round(avg))}<small>${esc(t('reviewsCount')(vis.length))}</small></div>
    <div class="rv-dist">${[5, 4, 3, 2, 1].map(n => { const c = vis.filter(x => x.rating === n).length; return `<div class="rv-row"><span>${n}★</span><div class="track"><div class="fill" style="width:${vis.length ? c / vis.length * 100 : 0}%"></div></div><span>${c}</span></div>`; }).join('')}</div></div>` : '';
  $('#rvAdmin').innerHTML = r.length ? r.map(x => {
    const bk = state.bookings.find(b => b.id === x.booking_id), pr = state.profiles[x.user_id];
    return `<article class="rv-card admin${x.hidden ? ' hidden-rv' : ''}">
      <header>${stars(x.rating)}<small>${esc(fmt(x.created_at.slice(0, 10), 'dm'))}${x.hidden ? ' · ' + esc(t('oHidden')) : ''}</small></header>
      ${x.text ? `<p>${esc(x.text)}</p>` : `<p class="muted">${esc(t('noText'))}</p>`}
      <footer><span class="avatar sm">${esc((x.author || '?').slice(0, 1).toUpperCase())}</span><b>${esc(x.author || '')}</b>${pr ? `<span class="muted">@${esc(pr.username)}</span>` : ''}${bk ? `<span class="muted">· ${esc(rideName(bk.ride))}, ${esc(fmt(bk.date, 'short'))}</span>` : ''}</footer>
      <label class="rv-reply-edit"><span>${esc(t('replyLabel'))}</span><textarea rows="2" maxlength="500" data-reply="${x.id}">${esc(x.owner_reply || '')}</textarea></label>
      <div class="oc-actions"><button type="button" class="btn-small primary" data-rsave="${x.id}">${esc(t('saveReply'))}</button>
        <button type="button" class="btn-small" data-rhide="${x.id}">${esc(t(x.hidden ? 'show' : 'hide'))}</button></div>
    </article>`;
  }).join('') : `<p class="inbox-empty">${esc(t('noReviewsOwner'))}</p>`;
}
$('#rvAdmin').addEventListener('click', async e => {
  const s = e.target.closest('[data-rsave]'), h = e.target.closest('[data-rhide]');
  if (s) { s.disabled = true; const v = $(`[data-reply="${s.dataset.rsave}"]`).value.trim();
    await patch('reviews', s.dataset.rsave, { owner_reply: v || null, replied_at: v ? new Date().toISOString() : null }); return load(); }
  if (h) { const r = state.reviews.find(x => x.id === h.dataset.rhide); h.disabled = true; await patch('reviews', r.id, { hidden: !r.hidden }); load(); }
});

/* ---------- OFFERS ---------- */
const oform = $('#offerForm');
function offerState(o) { const today = todayIso(); if (!o.active) return 'oHidden'; if (o.valid_to && o.valid_to < today) return 'oExpired'; if (o.valid_from && o.valid_from > today) return 'oSched'; return 'oLive'; }
function renderOffers() {
  rideOptions($('#offerRide'), t('fAny'));
  $('#offerFormTitle').textContent = t(state.editing ? 'oEdit' : 'oNew'); $('#offerCancel').hidden = !state.editing;
  const list = $('#offerList');
  if (!state.offers.length) return list.innerHTML = `<p class="inbox-empty">${esc(t('oNone'))}</p>`;
  list.innerHTML = state.offers.map(o => {
    const st = offerState(o), used = uniq(state.bookings.filter(b => b.offer_id === o.id && b.status !== 'cancelled'));
    const range = o.valid_from || o.valid_to ? `${o.valid_from ? fmt(o.valid_from, 'short') : '…'} – ${o.valid_to ? fmt(o.valid_to, 'short') : '…'}` : t('noLimit');
    return `<article class="offer-card ${st}${state.editing === o.id ? ' editing' : ''}">
      <div class="oc-top"><span class="ostate ${st}">${esc(t(st))}</span>${o.discount_percent ? `<span class="oc-disc">−${o.discount_percent}%</span>` : ''}</div>
      <h3>${esc(o.title)}</h3>${o.description ? `<p>${esc(o.description)}</p>` : ''}
      <ul class="oc-meta"><li>${esc(o.ride ? rideName(o.ride) : t('fAny'))}</li><li>${esc(range)}</li><li>${esc(t('usedTimes')(used))}</li></ul>
      <div class="oc-actions"><button type="button" class="btn-small" data-oact="edit" data-id="${o.id}">${esc(t('edit'))}</button>
        <button type="button" class="btn-small" data-oact="toggle" data-id="${o.id}">${esc(t(o.active ? 'hide' : 'show'))}</button>
        <button type="button" class="btn-small" data-oact="del" data-id="${o.id}">${esc(t('del'))}</button></div></article>`;
  }).join('');
}
function fillForm(o) {
  oform.title.value = o ? o.title : ''; oform.description.value = o ? o.description || '' : '';
  oform.discount_percent.value = o && o.discount_percent ? o.discount_percent : '';
  oform.ride.value = o && o.ride ? o.ride : ''; oform.valid_from.value = o ? o.valid_from || '' : ''; oform.valid_to.value = o ? o.valid_to || '' : '';
  oform.active.checked = o ? o.active : true; $('#offerError').textContent = '';
}
oform.addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#offerError'); err.textContent = '';
  const title = oform.title.value.trim(), disc = oform.discount_percent.value ? Math.round(+oform.discount_percent.value) : null;
  const vf = oform.valid_from.value || null, vt = oform.valid_to.value || null;
  if (title.length < 2) return err.textContent = t('errTitle');
  if (vf && vt && vt < vf) return err.textContent = t('errDates');
  const body = { title, description: oform.description.value.trim() || null, discount_percent: disc && disc >= 1 && disc <= 90 ? disc : null, ride: oform.ride.value || null, valid_from: vf, valid_to: vt, active: oform.active.checked };
  const btn = oform.querySelector('[type=submit]'); btn.disabled = true;
  try {
    if (state.editing) await db(`offers?id=eq.${state.editing}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    else await db('offers', { method: 'POST', body, prefer: 'return=minimal' });
    state.editing = null; fillForm(null); btn.textContent = t('saved'); setTimeout(() => { btn.textContent = t('save'); }, 1500);
  } catch { err.textContent = t('errNet'); }
  btn.disabled = false; load();
});
$('#offerCancel').addEventListener('click', () => { state.editing = null; fillForm(null); renderOffers(); });
$('#offerList').addEventListener('click', async e => {
  const b = e.target.closest('[data-oact]'); if (!b) return;
  const o = offerById(b.dataset.id); if (!o) return;
  if (b.dataset.oact === 'edit') { state.editing = o.id; fillForm(o); renderOffers(); oform.scrollIntoView({ behavior: 'smooth', block: 'start' }); oform.title.focus(); return; }
  if (b.dataset.oact === 'del' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = t('delQ'); b.classList.add('danger'); return; }
  b.disabled = true;
  try { if (b.dataset.oact === 'toggle') await db(`offers?id=eq.${o.id}`, { method: 'PATCH', body: { active: !o.active }, prefer: 'return=minimal' });
        else { await db(`offers?id=eq.${o.id}`, { method: 'DELETE', prefer: 'return=minimal' }); if (state.editing === o.id) { state.editing = null; fillForm(null); } } }
  catch { $('#tblError').textContent = t('errNet'); }
  load();
});

/* ---------- ALL BOOKINGS ---------- */
function filtered() {
  const today = todayIso(), q = state.q.trim().toLowerCase();
  let r = state.bookings.filter(b => (state.status === 'all' || statusKey(b) === state.status) && (state.date === 'any' || (state.date === 'upcoming' ? b.date >= today : b.date < today)));
  if (q) r = r.filter(b => [b.name, b.phone, b.notes, b.owner_note, (state.profiles[b.user_id] || {}).username, (coachById(b.coach_id) || {}).name].join(' ').toLowerCase().includes(q));
  r = merge(r);
  return state.date === 'past' ? r.reverse() : r;
}
function renderTable() {
  $$('#fStatus button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === state.status));
  $$('#fDate button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === state.date));
  const rows = filtered();
  if (!rows.length) return $('#rows').innerHTML = `<tr><td colspan="9" class="empty">${esc(t('none'))}</td></tr>`;
  $('#rows').innerHTML = rows.map(b => {
    const p = state.profiles[b.user_id], k = statusKey(b), wa = waLink(phoneWa(b.phone)), o = offerById(b.offer_id), c = coachById(b.coach_id), bt = boatById(b.boat_id), acts = [];
    if (b.status === 'new') acts.push(`<button class="btn-small primary" data-act="confirm" data-id="${b.id}">${esc(t(b.payment_status === 'held' ? 'confirmCharge' : 'confirm'))}</button>`, `<button class="btn-small" data-act="reject" data-id="${b.id}">${esc(t('reject'))}</button>`);
    else if (b.status === 'confirmed') acts.push(`<button class="btn-small" data-act="cancel" data-id="${b.id}">${esc(t('cancel'))}</button>`);
    else if (b.date >= todayIso()) acts.push(`<button class="btn-small" data-act="reopen" data-id="${b.id}">${esc(t('reopen'))}</button>`);
    if (b.status !== 'cancelled' && b.price > 0 && !b.paid) acts.push(`<button class="btn-small" data-act="paid" data-id="${b.id}">💵 ${esc(t('markPaid'))}</button>`);
    if (['confirmed', 'rejected'].includes(k) && b.phone) acts.push(`<a class="btn-small wa" href="${esc(replyLink(b))}" target="_blank" rel="noopener">WhatsApp</a>`);
    return `<tr class="is-${b.status}">
      <td class="when"><b>${esc(fmt(b.date, 'long'))}</b><span>${esc(b.time)}–${esc(b.end)} · ${esc(durText(b.dur))}</span>${b.status !== 'cancelled' && b.date >= todayIso() ? lakeSelect(b) : b.lake_id ? `<span>🌊 ${esc(lakeName(lakeById(b.lake_id)))}</span>` : ''}</td>
      <td>${esc(rideName(b.ride))}${c ? `<span class="sub">${esc(c.name)}</span>` : ''}${o ? `<span class="offer-chip sm">${esc(o.title)}</span>` : ''}</td>
      <td class="who"><b>${esc(b.name)}</b><span><a href="tel:${esc(b.phone.replace(/\s/g, ''))}">${esc(b.phone)}</a>${wa ? ` · <a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</span>${b.email ? `<span><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></span>` : ''}${p ? `<span>@${esc(p.username)}</span>` : ''}</td>
      <td>${b.riders}${equipText(b) ? `<span class="sub">🏄 ${esc(equipText(b))}</span>` : ''}</td><td>${esc(b.rider_groups ? groupsText(b.rider_groups) : levelName(b.level))}</td><td>${payTag(b)}</td>
      <td class="notes">${esc(b.notes || '')}${b.owner_note ? `<span class="o-note">↳ ${esc(b.owner_note)}</span>` : ''}</td>
      <td><span class="badge ${k}">${esc(t('st_' + k))}</span></td>
      <td class="act">${acts.join('')}</td></tr>`;
  }).join('');
}
$('#rows').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const a = btn.dataset.act;
  if ((a === 'cancel' || a === 'reject') && !btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = t(a === 'reject' ? 'rejectQ' : 'cancelQ'); btn.classList.add('danger'); return; }
  btn.disabled = true;
  const now = new Date().toISOString();
  const body = {
    confirm: { status: 'confirmed', confirmed_at: now, decided_at: now, cancelled_by: null },
    reject: { status: 'cancelled', cancelled_by: 'owner', decided_at: now, confirmed_at: null },
    cancel: { status: 'cancelled', cancelled_by: 'owner', decided_at: now },
    reopen: { status: 'new', cancelled_by: null, confirmed_at: null, decided_at: null },
    paid: { paid: true, paid_at: now, payment_method: 'cash' },
  }[a];
  if (await patch('bookings', btn.dataset.id, body)) {
    if (a === 'confirm' || a === 'reject') notify('booking_decided', btn.dataset.id);
    if (a === 'confirm' || a === 'reject' || a === 'cancel') await settleHold(btn.dataset.id, a === 'confirm');
  }
  load();
});
$('#fStatus').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.status = b.dataset.v; renderTable(); } });
$('#fDate').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.date = b.dataset.v; renderTable(); } });
$('#q').addEventListener('input', e => { state.q = e.target.value; renderTable(); });
$('#refresh').addEventListener('click', load);

/* ---------- SCHEDULE: close days / hours ---------- */
const cform2 = $('#closeForm');
function renderSchedule() {
  const sel = $('#closeTime'), v = sel.value;
  sel.innerHTML = `<option value="">${esc(t('scWholeDay'))}</option>` + hours().map(h => `<option value="${h}">${h}–${addQ(h, 4)}</option>`).join(''); sel.value = v;
  $('#closeQuick').innerHTML = ['scQRest', 'scQWeather', 'scQEvent', 'scQRepair', 'scQPrivate'].map(k => `<button type="button" class="chip" data-creason="${k}">${esc(t(k))}</button>`).join('');
  renderPeriods();
  const today = todayIso(), list = state.closures.filter(c => c.date >= today);
  $('#closeList').innerHTML = list.length ? list.map(c => {
    const clash = uniq(state.bookings.filter(b => b.date === c.date && b.status !== 'cancelled' && (!c.time || hourOf(b.time) === c.time)));
    return `<article class="ps-card"><div class="ps-main"><b>🚫 ${esc(fmt(c.date, 'long'))} · ${esc(c.time ? `${c.time}–${addQ(c.time, 4)}` : t('scWholeDay'))}</b>
      ${c.reason ? `<small class="muted">${esc(c.reason)}</small>` : ''}${clash ? `<small class="warn-txt">⚠ ${esc(t('scClash')(clash))}</small>` : ''}</div>
      <div class="ps-acts"><button type="button" class="btn-small" data-copen="${c.id}">${esc(t('scOpen'))}</button></div></article>`;
  }).join('') : `<p class="inbox-empty">${esc(t('scNone'))}</p>`;
}
/* club closed from a date until the owner's chosen reopening date (winter break, repairs …) */
function renderPeriods() {
  const today = todayIso(), list = (state.periods || []).filter(p => p.reopen_on > today);
  $('#periodList').innerHTML = list.length ? list.map(p => {
    const clash = uniq(state.bookings.filter(b => b.status !== 'cancelled' && b.date >= p.date_from && b.date < p.reopen_on && b.date >= today));
    return `<article class="ps-card${p.date_from <= today ? ' now' : ''}"><div class="ps-main"><b>🔒 ${esc(fmt(p.date_from, 'long'))} → ${esc(t('peOpens'))} ${esc(fmt(p.reopen_on, 'long'))}</b>
      <small class="muted">${p.date_from <= today ? esc(t('peNow')) + ' · ' : ''}${esc(t('peDays')(Math.round((fromIso(p.reopen_on) - fromIso(p.date_from)) / 864e5)))}${p.reason ? ' · ' + esc(p.reason) : ''}</small>
      ${clash ? `<small class="warn-txt">⚠ ${esc(t('scClash')(clash))}</small>` : ''}</div>
      <div class="ps-acts"><button type="button" class="btn-small" data-pdel="${p.id}">${esc(t('peOpenNow'))}</button></div></article>`;
  }).join('') : `<p class="inbox-empty">${esc(t('peNone'))}</p>`;
}
$('#periodForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, err = $('#periodError'); err.textContent = '';
  if (!f.date_from.value || !f.reopen_on.value) return err.textContent = t('peErrDates');
  if (f.reopen_on.value <= f.date_from.value) return err.textContent = t('peErrOrder');
  const btn = f.querySelector('[type=submit]'); btn.disabled = true;
  try { await db('closed_periods', { method: 'POST', body: { date_from: f.date_from.value, reopen_on: f.reopen_on.value, reason: f.reason.value.trim() || null }, prefer: 'return=minimal' }); f.reset(); }
  catch { err.textContent = t('errNet'); }
  btn.disabled = false; load();
});
$('#periodList').addEventListener('click', async e => {
  const b = e.target.closest('[data-pdel]'); if (!b) return;
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = t('delQ'); b.classList.add('danger'); return; }
  b.disabled = true;
  try { await db(`closed_periods?id=eq.${b.dataset.pdel}`, { method: 'DELETE', prefer: 'return=minimal' }); } catch { $('#tblError').textContent = t('errNet'); }
  load();
});
$('#closeQuick').addEventListener('click', e => { const b = e.target.closest('[data-creason]'); if (b) cform2.reason.value = t(b.dataset.creason); });
cform2.addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#closeError'); err.textContent = '';
  if (!cform2.date.value) return err.textContent = t('errDay');
  const btn = cform2.querySelector('[type=submit]'); btn.disabled = true;
  const from = cform2.date.value, to = cform2.date_to.value || from, days = [];
  for (let d = fromIso(from); iso(d) <= to && days.length < 62; d = addDays(d, 1)) days.push(iso(d));
  if (to < from || !days.length) { btn.disabled = false; return err.textContent = t('scErrRange'); }
  const have = new Set(state.closures.filter(c => (c.time || '') === (cform2.time.value || '')).map(c => c.date));
  const rows = days.filter(d => !have.has(d)).map(d => ({ date: d, time: cform2.time.value || null, reason: cform2.reason.value.trim() || null }));
  try { if (rows.length) await db('closures', { method: 'POST', body: rows, prefer: 'return=minimal' }); else throw Object.assign(new Error(), { code: '23505' }); cform2.reset(); }
  catch (x) { err.textContent = x.code === '23505' ? t('scDup') : t('errNet'); }
  btn.disabled = false; load();
});
$('#closeList').addEventListener('click', async e => {
  const b = e.target.closest('[data-copen]'); if (!b) return;
  b.disabled = true;
  try { await db(`closures?id=eq.${b.dataset.copen}`, { method: 'DELETE', prefer: 'return=minimal' }); } catch { $('#tblError').textContent = t('errNet'); }
  load();
});

/* ---------- add a booking by hand (phone / walk-in) ---------- */
const bm = $('#bookModal'), bf = $('#bookForm');
function freeQuarters(date, lake) {
  const closedDay = state.closures.some(c => c.date === date && !c.time) || (state.periods || []).some(p => date >= p.date_from && date < p.reopen_on);
  const cap = state.lakes.filter(l => l.active).length;
  return hours().flatMap(h => ['00', '15', '30', '45'].map(m => h.slice(0, 3) + m)).map(q => {
    const at = state.bookings.filter(b => b.date === date && b.time === q && b.status !== 'cancelled');
    const left = Math.min(cap - at.length, lake ? 1 - at.filter(b => b.lake_id === lake).length : cap);
    const closed = closedDay || state.closures.some(c => c.date === date && c.time === hourOf(q));
    return { q, left, closed };
  });
}
function fillBookTimes() {
  const sel = $('#bkTime'), d = bf.date.value, n = +bf.dur.value || 4;
  if (!d) { sel.innerHTML = `<option value="">${esc(t('pickDayFirst'))}</option>`; return; }
  const fq = freeQuarters(d, bf.lake_id.value || null), okAt = i => fq.slice(i, i + n).length === n && fq.slice(i, i + n).every(x => x.left > 0 && !x.closed);
  const keep = sel.value;
  sel.innerHTML = fq.map((x, i) => `<option value="${x.q}" ${!okAt(i) ? 'disabled' : ''}>${x.q}–${addQ(x.q, n)} · ${esc(x.closed ? t('closed') : x.left <= 0 ? t('full') : !okAt(i) ? t('noFitD')(durText(n)) : t('boatsLeft')(x.left))}</option>`).join('');
  const first = [...sel.options].find(o => o.value === keep && !o.disabled) || [...sel.options].find(o => !o.disabled); if (first) sel.value = first.value;
}
$('#addBooking').addEventListener('click', () => {
  bf.reset(); $('#bkError').textContent = '';
  $('#bkRide').innerHTML = window.RIDES.map(r => `<option value="${r.id}">${esc(rideName(r.id))}</option>`).join('');
  $('#bkLake').innerHTML = `<option value="">${esc(t('lakeLater'))}</option>` + state.lakes.filter(l => l.active).map(l => `<option value="${l.id}">${esc(lakeName(l))}</option>`).join('');
  $('#bkCoach').innerHTML = `<option value="">${esc(t('noCoach'))}</option>` + state.coaches.filter(c => c.active).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#bkLevel').innerHTML = t('levels').map((x, i) => `<option value="${i}">${esc(x)}</option>`).join('');
  $('#bkDur').innerHTML = [...Array(40)].map((_, i) => `<option value="${i + 1}" ${i + 1 === 4 ? 'selected' : ''}>${esc(durText(i + 1))}</option>`).join('');
  bf.date.value = todayIso(); fillBookTimes(); i18n.apply(bm); bm.showModal();
});
bf.date.addEventListener('change', fillBookTimes);
bf.dur.addEventListener('change', fillBookTimes);
bf.lake_id.addEventListener('change', fillBookTimes);
bf.addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#bkError'); err.textContent = '';
  if (!bf.date.value || !bf.time.value) return err.textContent = t('errTime');
  if (!bf.name.value.trim() || bf.phone.value.replace(/\D/g, '').length < 9) return err.textContent = t('errContact');
  const em = bf.email.value.trim();
  if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return err.textContent = t('errEmail');
  const now = new Date().toISOString(), conf = bf.confirmed.checked, riders = Math.min(12, Math.max(1, +bf.riders.value || 1));
  const body = { ride: bf.ride.value, date: bf.date.value, time: bf.time.value, riders, rider_groups: [{ l: +bf.level.value, n: riders }],
    level: window.DICT.en.levels[bf.level.value], name: bf.name.value.trim(), phone: bf.phone.value.trim(), email: em || null, notes: bf.notes.value.trim() || null,
    lang: i18n.lang, lake_id: bf.lake_id.value || null, coach_id: bf.coach_id.value || null, status: conf ? 'confirmed' : 'new', confirmed_at: conf ? now : null, decided_at: conf ? now : null };
  const btn = bf.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const n = +bf.dur.value || 4, group = crypto.randomUUID();
    const rows = [...Array(n)].map((_, i) => ({ ...body, time: addQ(body.time, i), group_id: group }));
    const r = await db('bookings?select=id,price', { method: 'POST', body: rows, prefer: 'return=representation' });
    if (bf.paid.checked && r && r.length) await db(`bookings?group_id=eq.${group}`, { method: 'PATCH', body: { paid: true, paid_at: now, payment_method: 'cash' }, prefer: 'return=minimal' });
    bm.close(); window.PW.ui.toast(t('bkSaved'), 'ok');
  } catch (x) { err.textContent = x.code === '23505' ? t('errTaken') : x.code === 'PW001' ? t('errCoach') : x.code === 'PW005' ? t('closedHour') : t('errNet'); }
  btn.disabled = false; load();
});

/* ---------- CSV ---------- */
$('#csv').addEventListener('click', () => {
  const cols = ['date', 'time', 'ride', 'coach', 'boat', 'riders', 'level', 'name', 'phone', 'username', 'notes', 'offer', 'price', 'paid', 'payment_method', 'status', 'owner_note', 'created_at', 'decided_at'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const val = (b, c) => c === 'username' ? (state.profiles[b.user_id] || {}).username : c === 'ride' ? rideName(b.ride) : c === 'coach' ? (coachById(b.coach_id) || {}).name
    : c === 'boat' ? (boatById(b.boat_id) || {}).name : c === 'offer' ? (offerById(b.offer_id) || {}).title : c === 'status' ? t('st_' + statusKey(b)) : c === 'paid' ? (b.paid ? 'yes' : 'no') : b[c];
  const cols2 = [...cols.slice(0, 2), 'end', 'duration_min', 'lake', 'driver', ...cols.slice(2), 'email', 'rider_groups', 'equipment_sets', 'payment_status'];
  const val2 = (b, c) => c === 'end' ? b.end : c === 'duration_min' ? b.dur * 15 : c === 'lake' ? lakeName(lakeById(b.lake_id)) : c === 'driver' ? (driverById(b.driver_id) || {}).name
    : c === 'rider_groups' ? groupsText(b.rider_groups) : c === 'equipment_sets' ? equipText(b) : val(b, c);
  const lines = [cols2.join(',')].concat(merge(state.bookings).map(b => cols2.map(c => q(val2(b, c))).join(',')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bookings-${todayIso()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

function render() {
  renderInbox(); renderKpis(); renderRevenue(); renderPerDay(); renderBreakdowns(); renderHeat(); renderWeather();
  renderPasses(); renderOffers(); renderPrices(); renderPlans(); renderFleet(); renderReviewsAdmin(); renderTable(); renderSchedule();
  if (window.ownerExtra) window.ownerExtra.render(state);
}
window.ownerState = state; window.ownerLoad = () => load(); window.ownerHelpers = { merge, uniq, durText, lakeName, groupOf, addQ };

/* ---------- language ---------- */
function applyLang(l) { i18n.set(l); i18n.apply(); document.title = `${t('oTitle')} — Poti Lake Club`; ui.refresh(); render(); if (!$('#gate').hidden) start(); }
$('.lang').addEventListener('click', e => { const l = e.target.dataset.lang; if (l) applyLang(l); });

i18n.set(i18n.lang); i18n.apply(); document.title = `${t('oTitle')} — Poti Lake Club`;
start();
})();
