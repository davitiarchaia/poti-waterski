/* Booking page */
(() => {
const { auth, db, rpc, fn, i18n, fmt, iso, fromIso, todayIso, hours, inSeason, openSlots, weekdayHeaders, weather, wxInfo, rideScore, esc, waLink, pad, statusKey } = window.PW;
const C = window.CONFIG, RIDES = window.RIDES, ui = window.PW.ui;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const t = k => i18n.t(k);
i18n.init(window.DICT, ['ka', 'en', 'ru']);

const state = {
  ride: RIDES[0], month: null, day: null, time: null, dur: 1, riders: 1, load: {}, wx: null, mine: [], myPasses: [], myReviews: new Set(),
  busyMonth: false, offers: [], offer: null, prices: {}, boats: 1, coaches: [], coach: null, plans: [], pass: null, reviews: [],
};
const money = v => (Math.round(v * 100) / 100).toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'ka-GE', { maximumFractionDigits: 2 });
const toast = (msg, kind = '') => { const el = $('#toast'); el.textContent = msg; el.className = 'toast ' + kind; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 5000); };

/* ---------- months ---------- */
const firstOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
const thisMonth = firstOfMonth(new Date());
const lastMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth() + C.monthsAhead, 1);
function startMonth() {
  const d = new Date(thisMonth);
  for (let i = 0; i <= C.monthsAhead; i++) {
    if (C.seasonMonths.includes(d.getMonth()) && (i > 0 || openSlots(todayIso()).length || hasLaterDayThisMonth())) return new Date(d);
    d.setMonth(d.getMonth() + 1);
  }
  return new Date(thisMonth);
}
function hasLaterDayThisMonth() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() > n.getDate(); }

/* ---------- club data: prices, boats, coaches, offers, pass plans, reviews ---------- */
async function loadClub() {
  const get = p => db(p).catch(() => []);
  const [pr, boats, coaches, offers, plans] = await Promise.all([
    get('ride_prices?select=*'), get('boats?select=id&active=eq.true'),
    get('coaches?select=id,name,bio,photo_url,rides&active=eq.true&order=sort.asc,created_at.asc'),
    get('offers?select=*&order=sort.asc,created_at.desc'), get('pass_plans?select=*&active=eq.true&order=sort.asc,price.asc'),
  ]);
  window.PW.applyServices(pr);
  if (!RIDES.some(r => r.id === state.ride.id)) state.ride = RIDES[0];
  state.prices = Object.fromEntries(pr.map(x => [x.ride, x]));
  state.boats = Math.max(boats.length, 1);
  state.coaches = coaches;
  state.offers = offers.filter(o => o.active && (!o.valid_to || o.valid_to >= todayIso()));
  if (state.offer && !state.offers.some(o => o.id === state.offer.id)) state.offer = null;
  state.plans = plans;
  renderRides(); renderOffers(); renderCoaches(); renderPlans(); renderSlots(); renderCalendar(); update();
}
const rideOn = id => !state.prices[id] || state.prices[id].active !== false;
const priceOf = id => state.prices[id] && state.prices[id].price != null ? +state.prices[id].price : null;

/* ---------- rides ---------- */
function renderRides() {
  const list = RIDES.filter(r => rideOn(r.id));
  if (!list.some(r => r.id === state.ride.id) && list.length) state.ride = list[0];
  $('#rides').innerHTML = list.map(r => {
    const [name, info, tag] = t('rides')[r.id] || [r.id, ''], p = priceOf(r.id);
    const price = p != null ? `₾${money(p)} ${t('perHour')}` : t('onRequest');
    return `<label class="ride"><input type="radio" name="ride" value="${r.id}" ${state.ride.id === r.id ? 'checked' : ''}>
      ${r.tag && tag ? `<span class="tag">${esc(tag)}</span>` : ''}<b>${esc(name)}</b><small>${esc(info)}</small><span class="price">${esc(price)}</span></label>`;
  }).join('');
}
$('#rides').addEventListener('change', e => {
  state.ride = RIDES.find(r => r.id === e.target.value);
  if (state.offer && state.offer.ride && state.offer.ride !== state.ride.id) state.offer = null;
  if (state.coach && !coachFits(state.coaches.find(c => c.id === state.coach))) state.coach = null;
  renderOffers(); renderCoaches(); renderPassUse(); update();
});

/* ---------- offers ---------- */
const offerOk = (o, day) => (!o.valid_from || day >= o.valid_from) && (!o.valid_to || day <= o.valid_to);
function renderOffers() {
  $('#offers').hidden = !state.offers.length;
  $('#offerRow').innerHTML = state.offers.map(o => {
    const on = state.offer && state.offer.id === o.id;
    const when = o.valid_from && o.valid_from > todayIso() ? t('offerFrom')(fmt(o.valid_from, 'dm')) : o.valid_to ? t('offerUntil')(fmt(o.valid_to, 'dm')) : '';
    return `<div class="offer" role="group" aria-pressed="${on}">
      ${o.discount_percent ? `<span class="pct">${esc(t('offerOff')(o.discount_percent))}</span>` : ''}
      <b>${esc(o.title)}</b>${o.description ? `<p>${esc(o.description)}</p>` : ''}
      <small>${esc(o.ride ? rideName(o.ride) : t('offerAny'))}${when ? ' · ' + esc(when) : ''}</small>
      <button type="button" class="use" data-offer="${o.id}">${esc(on ? t('offerOn') : t('offerUse'))}</button>
    </div>`;
  }).join('');
}
$('#offerRow').addEventListener('click', e => {
  const b = e.target.closest('[data-offer]'); if (!b) return;
  const o = state.offers.find(x => x.id === b.dataset.offer);
  if (state.offer && state.offer.id === o.id) state.offer = null;
  else {
    state.offer = o; state.pass = null;
    if (o.ride && o.ride !== state.ride.id) { state.ride = RIDES.find(r => r.id === o.ride) || state.ride; renderRides(); renderCoaches(); }
    if (o.valid_from && o.valid_from > iso(state.month) && !state.day) { const d = fromIso(o.valid_from); state.month = new Date(d.getFullYear(), d.getMonth(), 1); loadMonth(); }
  }
  renderOffers(); renderPassUse(); update();
});

/* ---------- calendar ---------- */
const slotUsed = (d, h) => ((state.load[d] || {})[h] || { used: 0 }).used;
const dayClosed = d => state.closed && state.closed[d] && '*' in state.closed[d];
const hourClosed = (d, h) => dayClosed(d) || !!(state.closed && state.closed[d] && h in state.closed[d]);
const slotFull = (d, h) => hourClosed(d, h) || slotUsed(d, h) >= state.boats;
// multi-hour bookings: a start hour works only if every following hour is free too
const MAX_DUR = 10;
const addH = (h, n) => `${pad(+h.slice(0, 2) + n)}:00`;
const rangeOf = (h, n = state.dur) => [...Array(n)].map((_, i) => addH(h, i));
const startOk = (d, h, n = state.dur) => { const open = openSlots(d); return rangeOf(h, n).every(x => open.includes(x) && !slotFull(d, x)); };
function dayStatus(dayIso) {
  const open = openSlots(dayIso);
  if (!open.length || dayClosed(dayIso)) return { s: 'closed', free: 0 };
  const free = open.filter(h => startOk(dayIso, h)).length;
  return { s: free === 0 ? 'full' : free <= 3 ? 'few' : 'free', free };
}
async function loadMonth() {
  const m = state.month, d1 = iso(m), d2 = iso(new Date(m.getFullYear(), m.getMonth() + 1, 0));
  state.busyMonth = true; renderCalendar();
  const map = {};
  const closed = {};
  try {
    const [load, cl] = await Promise.all([rpc('slot_load', { d1, d2 }), rpc('closed_slots', { d1, d2 }).catch(() => [])]);
    load.forEach(r => { (map[r.d] = map[r.d] || {})[r.t] = { used: r.used, coaches: r.coaches || [] }; });
    cl.forEach(r => { (closed[r.d] = closed[r.d] || {})[r.t || '*'] = r.reason || ''; });
    state.load = map; state.closed = closed;
  } catch { state.load = {}; state.closed = {}; }
  state.busyMonth = false; renderCalendar(); renderSlots(); renderCoaches();
}
function renderCalendar() {
  const m = state.month;
  $('#calTitle').textContent = fmt(m, 'month');
  $('#calPrev').disabled = m <= thisMonth;
  $('#calNext').disabled = m >= lastMonth;
  $('#calWd').innerHTML = weekdayHeaders().map(w => `<span>${esc(w)}</span>`).join('');
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  let html = '<span class="cal-pad"></span>'.repeat((m.getDay() + 6) % 7);
  for (let d = 1; d <= days; d++) {
    const date = new Date(m.getFullYear(), m.getMonth(), d), di = iso(date);
    const st = state.busyMonth ? { s: 'loading', free: 0 } : dayStatus(di);
    const wx = state.wx && state.wx.daily[di];
    const icon = wx && st.s !== 'closed' ? `<span class="cd-wx" aria-hidden="true">${wxInfo(wx.code)[0]}</span>` : '';
    const label = `${fmt(date, 'long')} — ${st.s === 'loading' ? t('loading') : st.s === 'closed' ? t('closed') : st.s === 'full' ? t('full') : t('slotsLeft')(st.free)}`;
    html += `<button type="button" class="cd ${st.s}${di === todayIso() ? ' today' : ''}" data-iso="${di}" aria-pressed="${state.day === di}"
      aria-label="${esc(label)}" ${st.s === 'closed' || st.s === 'loading' ? 'disabled' : ''}><b>${d}</b>${icon}<i class="dot" aria-hidden="true"></i></button>`;
  }
  $('#calGrid').innerHTML = html;
  const off = !C.seasonMonths.includes(m.getMonth());
  $('#calNote').hidden = !off; if (off) $('#calNote').textContent = t('offSeason');
}
$('#calPrev').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); loadMonth(); });
$('#calNext').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); loadMonth(); });
$('#calGrid').addEventListener('click', e => {
  const b = e.target.closest('.cd'); if (!b || b.disabled) return;
  state.day = b.dataset.iso; state.time = null;
  $$('#calGrid .cd').forEach(x => x.setAttribute('aria-pressed', x === b));
  renderSlots(); renderCoaches(); renderPassUse(); update();
  if (matchMedia('(max-width: 900px)').matches) $('#slots').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

/* ---------- hours ---------- */
function renderSlots() {
  const box = $('#slots'), dw = $('#dayWx');
  $('#daySub').textContent = state.day ? `· ${fmt(state.day, 'long')}` : '';
  if (!state.day) { dw.hidden = true; box.innerHTML = `<p class="hint">${esc(t('pickDayFirst'))}</p>`; return; }
  const dwx = state.wx && state.wx.daily[state.day];
  if (dwx) {
    const [ic, k] = wxInfo(dwx.code), sc = rideScore(dwx.wind, dwx.code, dwx.rain);
    dw.hidden = false;
    dw.innerHTML = `<span class="dw-ic" aria-hidden="true">${ic}</span><span><b>${esc(t('wx')[k])}</b> · ${Math.round(dwx.max)}° / ${Math.round(dwx.min)}°</span>
      <span>${esc(t('wxWind'))} ${Math.round(dwx.wind)} ${esc(t('kmh'))}</span><span>${esc(t('wxRain'))} ${dwx.rain ?? 0}%</span><span class="score ${sc}">${esc(t('ride_' + sc))}</span>`;
  } else { dw.hidden = false; dw.innerHTML = `<span class="muted">${esc(t('wxFar'))}</span>`; }
  const open = openSlots(state.day);
  if (state.time && !startOk(state.day, state.time)) state.time = null;
  if (!open.length || open.every(h => slotFull(state.day, h))) { box.innerHTML = `<p class="hint">${esc(dayClosed(state.day) ? t('dayClosed') + (state.closed[state.day]['*'] ? ' — ' + state.closed[state.day]['*'] : '') : t('noSlots'))}</p>`; return; }
  box.innerHTML = hours().filter(h => open.includes(h)).map(h => {
    const full = slotFull(state.day, h), shut = hourClosed(state.day, h), left = state.boats - slotUsed(state.day, h), hw = state.wx && state.wx.hourly[`${state.day}T${h}`];
    const busy = full || !startOk(state.day, h), noFit = !full && busy;
    const inRange = state.time && rangeOf(state.time).includes(h) && h !== state.time;
    const end = `${pad(+h.slice(0, 2) + 1)}:00`;
    const w = hw ? `<small class="sw">${wxInfo(hw.code)[0]} ${Math.round(hw.temp)}° · ${Math.round(hw.wind)} ${esc(t('kmh'))}</small>` : '';
    const boats = !busy && state.boats > 1 ? `<small class="sb">${esc(t('boatsLeft')(left))}</small>` : '';
    const why = shut ? t('closed') : full ? t('taken') : t('noFit')(state.dur);
    return `<button type="button" class="slot${inRange ? ' in-range' : ''}${noFit ? ' no-fit' : ''}" role="radio" aria-checked="${state.time === h}" data-h="${h}" ${busy ? 'disabled' : ''}
      aria-label="${h}–${end}${busy ? ' — ' + esc(why) : ''}"><b>${h}</b><small class="se">– ${end}</small>${busy ? `<small class="sw">${esc(why)}</small>` : w + boats}</button>`;
  }).join('');
}
$('#slots').addEventListener('click', e => {
  const b = e.target.closest('.slot'); if (!b || b.disabled) return;
  state.time = b.dataset.h;
  if (state.coach && coachBusy(state.coach)) state.coach = null;
  renderSlots(); renderCoaches(); update();
});
// duration (1–4 hours)
function renderDur() {
  $('#dur').innerHTML = [...Array(MAX_DUR)].map((_, i) => `<button type="button" role="radio" aria-checked="${state.dur === i + 1}" data-dur="${i + 1}" aria-label="${esc(t('hoursN')(i + 1))}" title="${esc(t('hoursN')(i + 1))}">${i + 1}</button>`).join('')
    + `<span class="dur-now">${esc(t('hoursN')(state.dur))}</span>`;
}
$('#dur').addEventListener('click', e => {
  const b = e.target.closest('[data-dur]'); if (!b) return;
  state.dur = +b.dataset.dur;
  if (state.coach && coachBusy(state.coach)) state.coach = null;
  renderDur(); renderCalendar(); renderSlots(); renderCoaches(); renderPassUse(); update();
});

/* ---------- coaches ---------- */
const coachFits = c => c && (!c.rides || !c.rides.length || c.rides.includes(state.ride.id));
const coachBusy = id => state.day && state.time && rangeOf(state.time).some(h => (((state.load[state.day] || {})[h] || {}).coaches || []).includes(id));
function renderCoaches() {
  const list = state.coaches.filter(coachFits);
  $('#coachPick').hidden = !list.length;
  if (!list.length) return;
  const card = (id, name, sub, photo, busy) => `<button type="button" class="coach" role="radio" aria-checked="${state.coach === id}" data-coach="${id || ''}" ${busy ? 'disabled' : ''}>
      <span class="ph">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : esc(name.slice(0, 1))}</span>
      <span class="cn"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${busy ? `<small class="busy">${esc(t('coachBusy'))}</small>` : ''}</span></button>`;
  $('#coaches').innerHTML = card(null, t('coachAny'), t('coachAnySub'), '', false) +
    list.map(c => card(c.id, c.name, c.bio, c.photo_url, coachBusy(c.id))).join('');
}
$('#coaches').addEventListener('click', e => {
  const b = e.target.closest('.coach'); if (!b || b.disabled) return;
  state.coach = b.dataset.coach || null; renderCoaches(); update();
});

/* ---------- riders ---------- */
document.querySelector('.stepper').addEventListener('click', e => {
  const d = +e.target.dataset.d; if (!d) return;
  state.riders = Math.min(12, Math.max(1, state.riders + d)); $('#riderCount').textContent = state.riders; update();
});

/* ---------- passes the customer owns ---------- */
const passLeft = p => p.hours_total - state.mine.filter(b => b.pass_id === p.id && b.status !== 'cancelled').length;
const passValid = (p, day) => p.status === 'active' && p.paid && (!day || (day >= p.starts_at && day <= p.expires_at)) && (!p.ride || p.ride === state.ride.id) && passLeft(p) >= state.dur;
function renderPassUse() {
  const usable = state.myPasses.filter(p => passValid(p, state.day));
  const box = $('#passUse');
  box.hidden = !usable.length;
  if (!usable.length) { state.pass = null; return; }
  if (state.pass && !usable.some(p => p.id === state.pass)) state.pass = null;
  $('#usePass').checked = !!state.pass;
  $('#passSel').hidden = !state.pass;
  $('#passSel').innerHTML = usable.map(p => `<option value="${p.id}">${esc(p.name)} — ${esc(t('hoursLeft')(passLeft(p), p.hours_total))}</option>`).join('');
  if (state.pass) $('#passSel').value = state.pass;
}
$('#usePass').addEventListener('change', e => {
  state.pass = e.target.checked ? $('#passSel').value || (state.myPasses.find(p => passValid(p, state.day)) || {}).id || null : null;
  if (state.pass) { state.offer = null; renderOffers(); }
  renderPassUse(); update();
});
$('#passSel').addEventListener('change', e => { state.pass = e.target.value; update(); });

/* ---------- summary ---------- */
const rideName = id => (t('rides')[id] || [id])[0];
const whenText = (day = state.day, time = state.time, n = state.dur) => !day ? t('noWhen') : `${fmt(day, 'long')} · ${time ? `${time}–${addH(time, n)}${n > 1 ? ` (${t('hoursN')(n)})` : ''}` : t('pickTime')}`;
function currentPrice() {
  if (state.pass) return 0;
  const base = priceOf(state.ride.id), pct = state.offer && state.offer.discount_percent;
  return base == null ? null : Math.round(base * (100 - (pct || 0))) / 100 * state.dur;
}
function update() {
  const coach = state.coaches.find(c => c.id === state.coach);
  $('#sumRide').textContent = `${rideName(state.ride.id)} · ${t('rider')(state.riders)}${coach ? ' · ' + coach.name : ''}`;
  $('#sumWhen').textContent = whenText();
  const o = state.offer, pct = o && o.discount_percent, p = currentPrice();
  $('#sumTotal').textContent = state.pass ? t('byPass') : p == null ? (pct ? t('offerOff')(pct) : t('onRequest')) : '₾' + money(p);
  $('#sumOffer').hidden = !o; if (o) $('#sumOffer').textContent = `🔥 ${o.title}${pct ? ' · ' + t('offerOff')(pct) : ''}`;
  $('#submitBtn').textContent = t(auth.session ? 'submit' : 'submitLogin');
  $('#formError').textContent = '';
}

/* ---------- submit ---------- */
const form = $('#bookingForm');
function prefill(p) {
  if (!p) return;
  if (!form.name.value && p.full_name) form.name.value = p.full_name;
  if (!form.phone.value && p.phone) form.phone.value = p.phone;
}
form.addEventListener('submit', e => { e.preventDefault(); submit(); });
async function submit() {
  const err = $('#formError');
  if (!state.day) return err.textContent = t('errDay');
  if (!state.time) return err.textContent = t('errTime');
  if (state.offer && !offerOk(state.offer, state.day)) return err.textContent = t('errOfferDate');
  if (!$('#agree').checked) { $('#agree').focus(); return err.textContent = t('errAgree'); }
  if (!auth.session) return ui.open('in', p => { prefill(p); afterAuth().then(submitIfReady); });
  const name = form.name.value.trim(), phone = form.phone.value.trim();
  if (!name || phone.replace(/\D/g, '').length < 9) { form.name.value ? form.phone.focus() : form.name.focus(); return err.textContent = t('errContact'); }
  const group = state.dur > 1 ? (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16))) : null;
  const booking = { ride: state.ride.id, date: state.day, time: state.time, riders: state.riders,
    level: window.DICT.en.levels[form.level.value], name, phone, notes: form.notes.value.trim() || null, lang: i18n.lang,
    offer_id: state.offer && !state.pass ? state.offer.id : null, coach_id: state.coach, pass_id: state.pass };
  const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = t('sending');
  let res = 'error', row = null;
  const rows = rangeOf(state.time).map(h => ({ ...booking, time: h, group_id: group }));
  try {
    const r = await db('bookings?select=id,ride,date,time,riders,level,name,phone,notes,price,paid', { method: 'POST', body: rows, prefer: 'return=representation' });
    row = r && r[0] && { ...r[0], time: state.time, dur: r.length, price: r.some(x => x.price == null) ? null : r.reduce((a, x) => a + +x.price, 0), paid: r.every(x => x.paid) };
    res = 'ok';
  }
  catch (x) { res = x.code === '23505' ? 'taken' : x.code === 'PW001' ? 'coach' : x.code === 'PW002' ? 'pass' : x.code === 'PW005' ? 'closed' : x.status === 401 ? 'auth' : 'error'; }
  btn.disabled = false; update();
  if (res === 'auth') { await auth.signOut(); ui.renderAccount(); return ui.open('in', () => afterAuth().then(submitIfReady)); }
  if (res === 'taken') { state.time = null; await loadMonth(); update(); return err.textContent = t('errTaken'); }
  if (res === 'coach') { state.coach = null; await loadMonth(); update(); return err.textContent = t('errCoach'); }
  if (res === 'closed') { state.time = null; await loadMonth(); update(); return err.textContent = t('closedHour'); }
  if (res === 'pass') { state.pass = null; renderPassUse(); update(); return err.textContent = t('errPass'); }
  if (res !== 'ok') return err.textContent = t('errNet');
  state.last = { ...booking, dur: state.dur, ...(row || {}) };
  if (row && row.id) fn('notify', { event: 'booking_created', id: row.id }).catch(() => {});
  showDone(); loadMonth(); loadMine();
}
function submitIfReady() { if (state.day && state.time) submit(); }
const lastWhen = b => whenText(b.date, b.time, b.dur || 1);
function showDone() {
  const b = state.last, rn = rideName(b.ride);
  $('#doneText').textContent = t('doneText')(rn, lastWhen(b), t('rider')(b.riders));
  const msg = `${t('waMsg')}\n${rn} · ${t('rider')(b.riders)} · ${t('levels')[window.DICT.en.levels.indexOf(b.level)]}\n${lastWhen(b)}\n${b.name}, ${b.phone}${b.notes ? '\n' + b.notes : ''}`;
  const wa = $('#doneWa'); wa.hidden = !C.whatsapp; wa.href = waLink(C.whatsapp, msg);
  const box = $('#payBox'), price = b.price != null ? +b.price : null;
  box.hidden = !(price > 0) || b.paid;
  if (!box.hidden) {
    $('#payAmount').textContent = `${t('toPay')}: ₾${money(price)}`;
    $('#payBtn').hidden = !C.onlinePayment; $('#payBtn').dataset.id = b.id || '';
    $('#payNote').textContent = C.onlinePayment ? t('payOrLake') : t('payAtLake');
  }
  form.hidden = true; const d = $('#done'); d.hidden = false; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); d.focus({ preventScroll: true });
}
$('#payBtn').addEventListener('click', e => startPay('booking', e.target.dataset.id, e.target));
$('#again').addEventListener('click', () => {
  const keep = { name: form.name.value, phone: form.phone.value };
  form.reset(); form.name.value = keep.name; form.phone.value = keep.phone;
  Object.assign(state, { ride: RIDES[0], day: null, time: null, dur: 1, riders: 1, last: null, offer: null, coach: null, pass: null }); renderDur();
  $('#riderCount').textContent = 1; renderRides(); renderOffers(); renderCoaches(); renderPassUse(); renderCalendar(); renderSlots(); update();
  $('#done').hidden = true; form.hidden = false;
});

/* ---------- online payment (Bank of Georgia) ---------- */
async function startPay(kind, id, btn) {
  if (!id) return;
  if (!C.onlinePayment) return toast(t('payNotReady'));
  if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = t('paying'); }
  const r = await fn('bog-pay', { kind, id, return_url: location.href.split(/[?#]/)[0] }).catch(() => ({}));
  if (r.url) { location.href = r.url; return; }
  if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label; }
  toast(r.error === 'not_configured' ? t('payNotReady') : r.error === 'already_paid' ? t('payOk') : t('payFail'), r.error === 'already_paid' ? 'ok' : 'bad');
}
/* review link from the reminder email: ?review=<booking id> */
async function handleReviewLink() {
  const q = new URLSearchParams(location.search), id = q.get('review');
  if (!id) return;
  q.delete('review'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  const open = () => {
    const b = state.mine.find(x => x.id === id);
    if (!b) return;
    const ids = b.group_id ? state.mine.filter(x => x.group_id === b.group_id).map(x => x.id) : [b.id];
    if (ids.some(i => state.myReviews.has(i))) return toast(t('reviewed'), 'ok');
    $('#mine').scrollIntoView({ behavior: 'smooth' });
    openReview(id);
  };
  if (!auth.session) return ui.open('in', () => afterAuth().then(open));
  open();
}
async function handlePayReturn() {
  const q = new URLSearchParams(location.search), st = q.get('pay'), ref = q.get('ref');
  if (!st || !ref) return;
  history.replaceState(null, '', location.pathname + location.hash);
  const [kind, id] = ref.split(':');
  if (st !== 'ok') return toast(t('payFail'), 'bad');
  toast(t('payChecking'));
  for (let i = 0; i < 4; i++) {
    const r = await fn('bog-pay', { kind, id, action: 'check' }).catch(() => ({}));
    if (r.paid) { toast(t('payOk'), 'ok'); return loadMine(); }
    await new Promise(res => setTimeout(res, 2500));
  }
  toast(t('payPending'));
  loadMine();
}

/* ---------- my bookings & passes ---------- */
async function loadMine() {
  const sec = $('#mine');
  if (!auth.session) { sec.hidden = true; state.mine = []; state.myPasses = []; state.myReviews = new Set(); renderPassUse(); return; }
  const uid = auth.session.user.id;
  const [mine, passes, revs] = await Promise.all([
    db(`bookings?user_id=eq.${uid}&select=id,ride,date,time,riders,status,cancelled_by,confirmed_at,owner_note,price,paid,pass_id,coach_id,group_id&order=date.desc,time.desc&limit=100`).catch(() => []),
    db(`passes?user_id=eq.${uid}&select=*&order=created_at.desc`).catch(() => []),
    db(`reviews?user_id=eq.${uid}&select=booking_id`).catch(() => []),
  ]);
  state.mine = mine; state.myPasses = passes; state.myReviews = new Set(revs.map(r => r.booking_id));
  sec.hidden = false; renderMine(); renderPassUse(); update();
}
function passState(p) { if (p.status === 'cancelled') return 'cancelled'; if (p.status !== 'active') return 'pending'; return p.expires_at < todayIso() || passLeft(p) <= 0 ? 'expired' : 'active'; }
function renderMine() {
  const list = $('#mineList');
  const today = todayIso();
  const passes = state.myPasses.filter(p => p.status !== 'cancelled');
  let html = '';
  if (passes.length) html += `<h3>${esc(t('myPasses'))}</h3><div class="my-passes">${passes.map(p => {
    const s = passState(p), left = passLeft(p);
    return `<div class="my-pass ${s}"><div><b>${esc(p.name)}</b><span class="badge pass-${s}">${esc(t('pass_' + s))}</span></div>
      <div class="mp-bar" aria-hidden="true"><i style="width:${Math.max(0, left) / p.hours_total * 100}%"></i></div>
      <small>${esc(t('hoursLeft')(Math.max(0, left), p.hours_total))}${p.expires_at ? ' · ' + esc(t('validTill')(fmt(p.expires_at, 'dm'))) : ''}</small>
      ${s === 'pending' && !p.paid ? `<small class="muted">₾${money(p.price)} · ${esc(t('passPayHint'))}</small>${C.onlinePayment ? `<button type="button" class="btn-small primary" data-paypass="${p.id}">${esc(t('payNow'))}</button>` : ''}` : ''}
    </div>`; }).join('')}</div>`;
  if (!state.mine.length) { list.innerHTML = html + `<p class="muted">${esc(t('mbEmpty'))}</p>`; return; }
  // merge the hours of a multi-hour booking into one line
  const groups = [], byG = {};
  [...state.mine].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).forEach(b => {
    const k = b.group_id || b.id;
    if (!byG[k]) { byG[k] = { ...b, ids: [b.id], dur: 1, price: b.price == null ? null : +b.price, paid: b.paid }; groups.push(byG[k]); }
    else { const g = byG[k]; g.ids.push(b.id); g.dur++; g.price = g.price == null || b.price == null ? null : g.price + +b.price; g.paid = g.paid && b.paid; if (b.owner_note && !g.owner_note) g.owner_note = b.owner_note; }
  });
  const up = groups.filter(b => b.date >= today), past = groups.filter(b => b.date < today).reverse();
  const row = b => {
    const k = statusKey(b), coach = state.coaches.find(c => c.id === b.coach_id);
    const pay = b.status !== 'cancelled' && b.price > 0 ? (b.paid ? `<span class="pay-tag ok">✓ ${esc(t('paid'))}</span>` : `<span class="pay-tag">₾${money(b.price)} · ${esc(t('unpaid'))}</span>`) : b.pass_id ? `<span class="pay-tag ok">🎟️ ${esc(t('byPass'))}</span>` : '';
    const acts = [];
    if (b.date >= today && b.status !== 'cancelled') {
      if (!b.paid && b.price > 0 && C.onlinePayment) acts.push(`<button type="button" class="btn-small primary" data-pay="${b.id}">${esc(t('payNow'))}</button>`);
      const cancelAttr = b.group_id ? `data-cancelgroup="${b.group_id}"` : `data-cancel="${b.id}"`;
      const hoursLeft = (new Date(`${b.date}T${b.time}:00`) - Date.now()) / 3.6e6;
      acts.push(hoursLeft >= (C.cancelHours || 0) ? `<button type="button" class="btn-small ghost" ${cancelAttr}>${esc(t('cancel'))}</button>` : `<small class="muted late">${esc(t('lateCancel'))}</small>`);
    }
    if (b.date <= today && b.status === 'confirmed') acts.push(b.ids.some(i => state.myReviews.has(i)) ? `<span class="pay-tag ok">★ ${esc(t('reviewed'))}</span>` : `<button type="button" class="btn-small star" data-review="${b.id}">★ ${esc(t('writeReview'))}</button>`);
    return `<li class="mb">
      <div><b>${esc(rideName(b.ride))}</b><span>${esc(whenText(b.date, b.time, b.dur))} · ${esc(t('rider')(b.riders))}${coach ? ' · ' + esc(coach.name) : ''}</span>
        ${pay}${b.owner_note ? `<span class="reply">${esc(t('ownerSays'))} ${esc(b.owner_note)}</span>` : ''}</div>
      <span class="badge ${k}">${esc(t('st_' + k))}</span>
      <div class="mb-acts">${acts.join('')}</div>
    </li>`;
  };
  html += (up.length ? `<h3>${esc(t('mbUpcoming'))}</h3><ul>${up.map(row).join('')}</ul>` : '') + (past.length ? `<h3>${esc(t('mbPast'))}</h3><ul class="past">${past.map(row).join('')}</ul>` : '');
  list.innerHTML = html;
}
$('#mineList').addEventListener('click', async e => {
  const pay = e.target.closest('[data-pay]'); if (pay) return startPay('booking', pay.dataset.pay, pay);
  const pp = e.target.closest('[data-paypass]'); if (pp) return startPay('pass', pp.dataset.paypass, pp);
  const rv = e.target.closest('[data-review]'); if (rv) return openReview(rv.dataset.review);
  const b = e.target.closest('[data-cancel],[data-cancelgroup]'); if (!b) return;
  if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = t('cancelQ'); b.classList.add('danger'); return; }
  b.disabled = true;
  try { b.dataset.cancelgroup ? await rpc('cancel_my_group', { g: b.dataset.cancelgroup }) : await rpc('cancel_my_booking', { b: b.dataset.cancel }); } catch {}
  await loadMine(); loadMonth();
});

/* ---------- pass plans (buy) ---------- */
function renderPlans() {
  $('#passesSec').hidden = !state.plans.length;
  $('#navPasses').hidden = !state.plans.length;
  $('#plans').innerHTML = state.plans.map((p, i) => {
    const per = p.hours ? p.price / p.hours : 0, base = p.ride ? priceOf(p.ride) : null;
    const save = base && per < base ? Math.round((1 - per / base) * 100) : 0;
    return `<article class="plan${i === 1 || (state.plans.length === 1) ? ' hot' : ''}">
      ${save ? `<span class="save">${esc(t('saveP')(save))}</span>` : ''}
      <h3>${esc(p.name)}</h3>
      <p class="plan-price"><b>₾${money(p.price)}</b><span>${esc(t('perHourEq')(money(per)))}</span></p>
      <ul><li>⏱ ${esc(t('passHours')(p.hours))}</li><li>📅 ${esc(t('passValid')(p.valid_days))}</li><li>🏄 ${esc(p.ride ? rideName(p.ride) : t('offerAny'))}</li></ul>
      ${p.description ? `<p class="muted">${esc(p.description)}</p>` : ''}
      <button type="button" class="btn" data-buy="${p.id}">${esc(t('buy'))}</button>
    </article>`;
  }).join('');
}
$('#plans').addEventListener('click', e => {
  const b = e.target.closest('[data-buy]'); if (!b) return;
  const go = async () => {
    b.disabled = true;
    try {
      const r = await db('passes?select=id,price', { method: 'POST', body: { plan_id: b.dataset.buy }, prefer: 'return=representation' });
      const p = r && r[0];
      if (p) fn('notify', { event: 'pass_requested', id: p.id }).catch(() => {});
      await loadMine();
      if (p && C.onlinePayment && p.price > 0) return startPay('pass', p.id, b);
      toast(t('passReqDone'), 'ok');
      $('#mine').scrollIntoView({ behavior: 'smooth' });
    } catch { toast(t('errNet'), 'bad'); }
    b.disabled = false;
  };
  if (!auth.session) return ui.open('in', () => afterAuth().then(go));
  go();
});

/* ---------- reviews ---------- */
const stars = n => `<span class="stars" aria-label="${n} / 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
async function loadReviews() {
  try { state.reviews = await db('reviews?select=id,created_at,rating,text,author,ride,owner_reply&hidden=eq.false&order=created_at.desc&limit=60'); }
  catch { state.reviews = []; }
  renderReviews();
}
function renderReviews() {
  const box = $('#rvWrap'), r = state.reviews;
  if (!r.length) return box.innerHTML = `<div class="rv-empty"><span class="big-stars">★★★★★</span><p>${esc(t('noReviews'))}</p></div>`;
  const avg = r.reduce((s, x) => s + x.rating, 0) / r.length;
  const dist = [5, 4, 3, 2, 1].map(n => [n, r.filter(x => x.rating === n).length]);
  box.innerHTML = `<div class="rv-summary">
      <div class="rv-score"><b>${avg.toFixed(1)}</b>${stars(Math.round(avg))}<small>${esc(t('reviewsCount')(r.length))}</small></div>
      <div class="rv-dist">${dist.map(([n, c]) => `<div class="rv-row"><span>${n}★</span><div class="track"><div class="fill" style="width:${c / r.length * 100}%"></div></div><span>${c}</span></div>`).join('')}</div>
    </div>
    <div class="rv-cards">${r.map(x => `<article class="rv-card">
      <header>${stars(x.rating)}<small>${esc(fmt(x.created_at.slice(0, 10), 'dm'))}</small></header>
      ${x.text ? `<p>${esc(x.text)}</p>` : ''}
      <footer><span class="avatar sm">${esc((x.author || '?').slice(0, 1).toUpperCase())}</span><b>${esc(x.author || '')}</b>${x.ride ? `<span class="muted">· ${esc(rideName(x.ride))}</span>` : ''}</footer>
      ${x.owner_reply ? `<div class="rv-reply"><b>${esc(t('clubReply'))}</b> ${esc(x.owner_reply)}</div>` : ''}
    </article>`).join('')}</div>`;
}
const rvModal = $('#reviewModal'), rvForm = $('#reviewForm');
function openReview(id) {
  const b = state.mine.find(x => x.id === id); if (!b) return;
  rvForm.reset(); rvForm.dataset.id = id; $('#rvError').textContent = '';
  const grp = b.group_id ? state.mine.filter(x => x.group_id === b.group_id && x.status === b.status).sort((x, y) => x.time < y.time ? -1 : 1) : [b];
  $('#rvFor').textContent = `${rideName(b.ride)} · ${whenText(b.date, grp[0].time, grp.length)}`;
  i18n.apply(rvModal); rvModal.showModal();
}
rvForm.addEventListener('submit', async e => {
  e.preventDefault();
  const rating = +((rvForm.querySelector('[name=rating]:checked') || {}).value || 0);
  if (!rating) return $('#rvError').textContent = t('errStars');
  const btn = rvForm.querySelector('[type=submit]'); btn.disabled = true;
  try {
    await db('reviews', { method: 'POST', body: { booking_id: rvForm.dataset.id, rating, text: rvForm.text.value.trim() || null }, prefer: 'return=minimal' });
    rvModal.close(); toast(t('thanksReview'), 'ok'); loadMine(); loadReviews();
  } catch (x) { $('#rvError').textContent = x.code === '23505' ? t('reviewed') : t('errNet'); }
  btn.disabled = false;
});

/* ---------- weather ---------- */
async function loadWeather() {
  try { state.wx = await weather(); } catch { state.wx = null; }
  renderWeather(); renderCalendar(); renderSlots();
}
function renderWeather() {
  const wx = state.wx, days = $('#wxDays'), now = $('#wxNow');
  if (!wx) { days.innerHTML = `<p class="muted">${esc(t('wxNa'))}</p>`; now.hidden = true; return; }
  const c = wx.current, [ic, k] = wxInfo(c.weather_code);
  now.hidden = false;
  now.innerHTML = `<span class="wn-ic" aria-hidden="true">${ic}</span><span><b>${Math.round(c.temperature_2m)}°</b> ${esc(t('wx')[k])}</span><span>${esc(t('wxWind'))} ${Math.round(c.wind_speed_10m)} ${esc(t('kmh'))}</span>`;
  days.innerHTML = `<div class="wx-card now">
      <small>${esc(t('wxNow'))}</small><span class="big" aria-hidden="true">${ic}</span><b class="temp">${Math.round(c.temperature_2m)}°</b>
      <span>${esc(t('wx')[k])}</span>
      <dl><dt>${esc(t('wxFeels'))}</dt><dd>${Math.round(c.apparent_temperature)}°</dd><dt>${esc(t('wxWind'))}</dt><dd>${Math.round(c.wind_speed_10m)} ${esc(t('kmh'))}</dd>
      <dt>${esc(t('wxGust'))}</dt><dd>${Math.round(c.wind_gusts_10m)} ${esc(t('kmh'))}</dd><dt>${esc(t('wxHum'))}</dt><dd>${c.relative_humidity_2m}%</dd></dl>
    </div>` + wx.days.slice(0, 7).map(d => {
      const x = wx.daily[d], [i2, k2] = wxInfo(x.code), sc = rideScore(x.wind, x.code, x.rain);
      return `<div class="wx-card"><small>${esc(d === todayIso() ? t('today') : fmt(d, 'wd'))} ${fromIso(d).getDate()}</small>
        <span class="big" aria-hidden="true">${i2}</span><b class="temp">${Math.round(x.max)}°<span> / ${Math.round(x.min)}°</span></b>
        <span>${esc(t('wx')[k2])}</span><span class="muted">${esc(t('wxWind'))} ${Math.round(x.wind)} · ${esc(t('wxRain'))} ${x.rain ?? 0}%</span>
        <span class="score ${sc}">${esc(t('ride_' + sc))}</span></div>`;
    }).join('');
}

/* ---------- contact ---------- */
function renderContact() {
  const rows = [];
  if (C.phone) rows.push(`<li><b>${esc(t('cPhone'))}</b><a href="tel:${esc(C.phone.replace(/\s/g, ''))}">${esc(C.phone)}</a></li>`);
  if (C.whatsapp) rows.push(`<li><b>${esc(t('cWa'))}</b><a href="${esc(waLink(C.whatsapp))}" target="_blank" rel="noopener">${esc(t('cWaLink'))}</a></li>`);
  if (C.instagram) rows.push(`<li><b>${esc(t('cIg'))}</b><a href="https://instagram.com/${esc(C.instagram)}" target="_blank" rel="noopener">@${esc(C.instagram)}</a></li>`);
  rows.push(`<li><b>${esc(t('cHours'))}</b><span>${pad(C.openHour)}:00 – ${pad(C.closeHour + 1)}:00</span></li>`);
  rows.push(`<li><b>${esc(t('cSeason'))}</b><span>${esc(t('cSeasonV'))}</span></li>`);
  if (!C.phone && !C.whatsapp) rows.unshift(`<li class="only">${esc(t('cOnly'))}</li>`);
  $('#contactList').innerHTML = rows.join('');
  // footer contacts
  const fc = [];
  if (C.phone) fc.push(`<a href="tel:${esc(C.phone.replace(/\s/g, ''))}">📞 ${esc(C.phone)}</a>`);
  if (C.whatsapp) fc.push(`<a href="${esc(waLink(C.whatsapp))}" target="_blank" rel="noopener">💬 WhatsApp</a>`);
  if (C.instagram) fc.push(`<a href="https://instagram.com/${esc(C.instagram)}" target="_blank" rel="noopener">📷 @${esc(C.instagram)}</a>`);
  if (C.email) fc.push(`<a href="mailto:${esc(C.email)}">✉️ ${esc(C.email)}</a>`);
  fc.push(`<span>🕘 ${pad(C.openHour)}:00 – ${pad(C.closeHour + 1)}:00 · ${esc(t('cSeasonV'))}</span>`);
  $('#footContact').innerHTML = fc.join('');
  // floating WhatsApp / call button
  const fab = $('#fab');
  if (C.whatsapp) { fab.href = waLink(C.whatsapp); fab.classList.remove('call'); $('#fabTxt').textContent = t('fab'); fab.hidden = false; }
  else if (C.phone) { fab.href = `tel:${C.phone.replace(/\s/g, '')}`; fab.removeAttribute('target'); fab.classList.add('call'); $('#fabTxt').textContent = t('fabCall'); fab.hidden = false; }
  else fab.hidden = true;
}

/* ---------- language ---------- */
function applyLang(l) {
  i18n.set(l); document.title = t('title'); i18n.apply();
  const lv = $('#level'), keep = Math.max(0, lv.selectedIndex);
  lv.innerHTML = t('levels').map((x, i) => `<option value="${i}">${esc(x)}</option>`).join(''); lv.selectedIndex = keep;
  renderRides(); renderOffers(); renderDur(); renderCoaches(); renderPlans(); renderCalendar(); renderSlots(); renderContact(); renderWeather(); renderMine(); renderReviews(); renderPassUse(); update(); ui.refresh();
  if (!$('#done').hidden && state.last) showDone();
}
$('.lang').addEventListener('click', e => { const l = e.target.dataset.lang; if (l) applyLang(l); });

function afterAuth() { update(); return loadMine(); }

/* ---------- start ---------- */
state.month = startMonth();
$('#yr').textContent = new Date().getFullYear();
applyLang(i18n.lang);
ui.init({ onSignIn: p => { prefill(p); afterAuth(); }, onSignOut: () => { afterAuth(); } }).then(p => { prefill(p); return afterAuth(); }).then(handleReviewLink).then(handlePayReturn);
loadClub(); loadMonth(); loadWeather(); loadReviews();
if (location.hash === '#mine') setTimeout(() => $('#mine').scrollIntoView(), 700);
})();
