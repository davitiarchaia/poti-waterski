/* Booking page */
(() => {
const { auth, db, rpc, fn, equipName, equipInfo, equipText, i18n, fmt, iso, fromIso, todayIso, hours, inSeason, openSlots, weekdayHeaders, weather, wxInfo, rideScore, esc, waLink, pad, statusKey } = window.PW;
const C = window.CONFIG, RIDES = window.RIDES, ui = window.PW.ui;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const t = k => i18n.t(k);
i18n.init(window.DICT, ['ka', 'en', 'ru']);

const state = {
  ride: RIDES[0], picked: false, month: null, day: null, time: null, dur: 4, riders: 1, load: {}, wx: null, mine: [], myPasses: [], myReviews: new Set(),
  busyMonth: false, offers: [], offer: null, prices: {}, boats: 1, allBoats: [], coaches: [], coach: null, plans: [], pass: null, reviews: [],
  lakes: [], photos: [], lake: null, groups: [{ l: 1, n: 1 }], equip: 'own', gear: [], eqSel: {},
};
const money = v => (Math.round(v * 100) / 100).toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'ka-GE', { maximumFractionDigits: 2 });
const toast = (msg, kind = '') => { const el = $('#toast'); el.textContent = msg; el.className = 'toast ' + kind; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 5000); };

/* ---------- months ---------- */
const firstOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
const thisMonth = firstOfMonth(new Date());
const lastMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth() + C.monthsAhead, 1);
const startMonth = () => new Date(thisMonth);      // the calendar opens on today's month; earlier months can't be opened
function hasLaterDayThisMonth() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() > n.getDate(); }

/* ---------- club data: prices, boats, coaches, offers, pass plans, reviews ---------- */
async function loadClub() {
  const get = p => db(p).catch(() => []);
  const [pr, boats, coaches, offers, plans, lakes, photos, gear] = await Promise.all([
    get('ride_prices?select=*'), get('boats?select=id,lake_id&active=eq.true'),
    get('coaches?select=id,name,bio,photo_url,rides&active=eq.true&order=sort.asc,created_at.asc'),
    get('offers?select=*&order=sort.asc,created_at.desc'), get('pass_plans?select=*&active=eq.true&order=sort.asc,price.asc'),
    get('lakes?select=*&active=eq.true&order=sort.asc,created_at.asc'), Promise.resolve([]),
    get('equipment?select=*&active=eq.true&order=sort.asc,created_at.asc'),
  ]);
  state.periods = await get(`closed_periods?select=date_from,reopen_on,reason&reopen_on=gt.${todayIso()}&order=date_from.asc`);
  state.lakes = lakes; state.photos = photos; state.allBoats = boats; state.gear = gear;
  for (const id of Object.keys(state.eqSel)) if (!gear.some(g => g.id === id)) delete state.eqSel[id];
  window.PW.applyServices(pr);
  if (!RIDES.some(r => r.id === state.ride.id)) state.ride = RIDES[0];
  state.prices = Object.fromEntries(pr.map(x => [x.ride, x]));
  setBoats();
  state.coaches = coaches;
  state.offers = offers.filter(o => o.active && (!o.valid_to || o.valid_to >= todayIso()));
  if (state.offer && !state.offers.some(o => o.id === state.offer.id)) state.offer = null;
  state.plans = plans;
  renderLakes(); renderRides(); renderEquip(); renderOffers(); renderCoaches(); renderPlans(); renderSlots(); renderCalendar(); update();
}
function setBoats() { state.boats = state.lakes.length; }   // one session per active lake at the same time; staff choose the lake later

/* ---------- lakes (photos uploaded by the owner) ---------- */
const photoUrl = path => `${window.SUPABASE.url}/storage/v1/object/public/lake-photos/${path.split('/').map(encodeURIComponent).join('/')}`;
const lakeName = l => l ? (l['name_' + i18n.lang] || l.name_ka) : '';
const lakeInfo = l => l ? (l['info_' + i18n.lang] || l.info_ka || '') : '';
function renderLakes() {
  $('#lakesSec').hidden = true; return;   // lakes are internal (staff statistics) — customers never see them
  const sec = $('#lakesSec'), withPh = state.lakes.filter(l => state.photos.some(p => p.lake_id === l.id) || lakeInfo(l));
  sec.hidden = !withPh.length;
  $('#lakes').innerHTML = withPh.map(l => {
    const ph = state.photos.filter(p => p.lake_id === l.id);
    return `<article class="lake">
      <span class="lake-ph">${ph.length ? `<img src="${esc(photoUrl(ph[0].path))}" alt="" loading="lazy">` : '<span class="lake-noph" aria-hidden="true">🌊</span>'}
        ${ph.length ? `<button type="button" class="lake-gal" data-gal="${l.id}">📷 ${ph.length}</button>` : ''}</span>
      <span class="lake-tx"><b>${esc(lakeName(l))}</b>${lakeInfo(l) ? `<small>${esc(lakeInfo(l))}</small>` : ''}</span>
    </article>`;
  }).join('');
}
$('#lakes').addEventListener('click', e => { const c = e.target.closest('.lake'), g = c && c.querySelector('[data-gal]'); if (g) { e.preventDefault(); openGallery(g.dataset.gal, 0); } });
// photo viewer
const gal = { lake: null, i: 0 };
function openGallery(lakeId, i) {
  const ph = state.photos.filter(p => p.lake_id === lakeId); if (!ph.length) return;
  gal.lake = lakeId; gal.i = (i + ph.length) % ph.length;
  const p = ph[gal.i], l = state.lakes.find(x => x.id === lakeId);
  $('#galImg').src = photoUrl(p.path); $('#galImg').alt = p.caption || lakeName(l);
  $('#galCap').textContent = `${lakeName(l)}${p.caption ? ' — ' + p.caption : ''} · ${gal.i + 1}/${ph.length}`;
  $('#galThumbs').innerHTML = ph.map((x, k) => `<button type="button" data-gi="${k}" aria-current="${k === gal.i}"><img src="${esc(photoUrl(x.path))}" alt="" loading="lazy"></button>`).join('');
  const m = $('#galModal'); if (!m.open) m.showModal();
}
$('#galPrev').addEventListener('click', () => openGallery(gal.lake, gal.i - 1));
$('#galNext').addEventListener('click', () => openGallery(gal.lake, gal.i + 1));
$('#galThumbs').addEventListener('click', e => { const b = e.target.closest('[data-gi]'); if (b) openGallery(gal.lake, +b.dataset.gi); });
$('#galModal').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') openGallery(gal.lake, gal.i - 1); if (e.key === 'ArrowRight') openGallery(gal.lake, gal.i + 1); });
const rideOn = id => !state.prices[id] || state.prices[id].active !== false;
const priceOf = id => state.prices[id] && state.prices[id].price != null ? +state.prices[id].price : null;

/* ---------- rides ---------- */
function renderRides() {
  const list = RIDES.filter(r => rideOn(r.id));
  if (!list.some(r => r.id === state.ride.id) && list.length) state.ride = list[0];
  $('#rides').innerHTML = list.map(r => {
    const [name, info, tag] = t('rides')[r.id] || [r.id, ''], p = priceOf(r.id);
    const price = p != null ? `₾${money(p)} ${t('perHour')}` : t('onRequest');
    return `<label class="ride"><input type="radio" name="ride" value="${r.id}" ${state.picked && state.ride.id === r.id ? 'checked' : ''}>
      ${r.tag && tag ? `<span class="tag">${esc(tag)}</span>` : ''}<b>${esc(name)}</b><small>${esc(info)}</small><span class="price">${esc(price)}</span></label>`;
  }).join('');
}
$('#rides').addEventListener('change', e => {
  state.ride = RIDES.find(r => r.id === e.target.value); state.picked = true;
  if (state.offer && state.offer.ride && state.offer.ride !== state.ride.id) state.offer = null;
  if (state.coach && !coachFits(state.coaches.find(c => c.id === state.coach))) state.coach = null;
  renderEquip(); renderOffers(); renderCoaches(); renderPassUse(); update();
});

/* ---------- equipment: the owner's catalogue (Owner page → Services → Equipment) ---------- */
const gearFor = id => state.gear.filter(g => g.ride === id);
const renting = () => state.equip === 'rent' && gearFor(state.ride.id).length > 0;
const equipItems = () => !renting() ? [] : gearFor(state.ride.id).map(g => ({ id: g.id, n: Math.min(state.eqSel[g.id] || 0, 12) })).filter(x => x.n > 0);
const equipSets = () => equipItems().reduce((a, x) => a + x.n, 0);
const equipHourly = () => equipItems().reduce((a, x) => a + +state.gear.find(g => g.id === x.id).price * x.n, 0);
const priceTag = p => +p > 0 ? `₾${money(+p)} / ${t('perH')}` : t('eqFree');
function numberSteps() { [...document.querySelectorAll('#bookingForm fieldset.step')].filter(f => !f.hidden).forEach((f, k) => { const n = f.querySelector('legend i'); if (n) n.textContent = k + 1; }); }
function renderEquip() {
  const list = state.picked ? gearFor(state.ride.id) : [], box = $('#equipBox');
  $('#equipStep').hidden = !list.length; numberSteps();
  if (!list.length) return;
  const from = Math.min(...list.map(g => +g.price));
  box.innerHTML = `<p class="eq-q">${esc(t('eqQ'))}</p>
    <div class="eq-opts" role="radiogroup">
      <label class="eq-opt${state.equip === 'own' ? ' on' : ''}"><input type="radio" name="equip" value="own" ${state.equip === 'own' ? 'checked' : ''}><b>${esc(t('eqOwn'))}</b><small>${esc(t('eqOwnSub'))}</small></label>
      <label class="eq-opt${state.equip === 'rent' ? ' on' : ''}"><input type="radio" name="equip" value="rent" ${state.equip === 'rent' ? 'checked' : ''}><b>${esc(t('eqRent'))}</b><small>${esc(from > 0 ? t('eqFrom')(money(from)) : t('eqPick'))}</small></label>
    </div>
    ${state.equip === 'rent' ? `<ul class="eq-items">${list.map(g => { const n = state.eqSel[g.id] || 0; return `<li class="eq-item${n ? ' on' : ''}">
        <div class="eq-name"><b>${esc(equipName(g))}</b>${equipInfo(g) ? `<small>${esc(equipInfo(g))}</small>` : ''}<span class="eq-price">${esc(priceTag(g.price))}</span></div>
        <div class="stepper sm"><button type="button" data-eqid="${g.id}" data-d="-1" aria-label="−" ${n ? '' : 'disabled'}>−</button><output>${n}</output><button type="button" data-eqid="${g.id}" data-d="1" aria-label="+" ${n >= 12 ? 'disabled' : ''}>+</button></div>
      </li>`; }).join('')}</ul>
      ${equipSets() ? `<p class="eq-total">${esc(t('eqTotal'))}: <b>${esc(equipHourly() > 0 ? `₾${money(equipHourly())} / ${t('perH')}` : t('eqFree'))}</b></p>` : `<p class="eq-hint">${esc(t('eqPickHint'))}</p>`}` : ''}`;
}
$('#equipBox').addEventListener('change', e => {
  if (e.target.name !== 'equip') return;
  state.equip = e.target.value;
  if (state.equip === 'rent' && !equipSets()) { const g = gearFor(state.ride.id)[0]; if (g) state.eqSel[g.id] = 1; }  // start with one of the first item; quantities are independent of the rider count
  renderEquip(); update();
});
$('#equipBox').addEventListener('click', e => {
  const b = e.target.closest('[data-eqid]'); if (!b) return;
  const id = b.dataset.eqid; state.eqSel[id] = Math.min(12, Math.max(0, (state.eqSel[id] || 0) + +b.dataset.d));
  renderEquip(); update();
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
    if (o.ride && (!state.picked || o.ride !== state.ride.id)) { state.ride = RIDES.find(r => r.id === o.ride) || state.ride; state.picked = true; renderRides(); renderEquip(); renderCoaches(); }
    if (o.valid_from && o.valid_from > iso(state.month) && !state.day) { const d = fromIso(o.valid_from); state.month = new Date(d.getFullYear(), d.getMonth(), 1); loadMonth(); }
  }
  renderOffers(); renderPassUse(); update();
});

/* ---------- calendar ---------- */
// time is booked in 15-minute steps: one database row per 15 minutes
const slotUsed = (d, q) => ((state.load[d] || {})[q] || { used: 0 }).used;
const periodOf = d => (state.periods || []).find(p => d >= p.date_from && d < p.reopen_on);   // club closed from … until it reopens (set by the owner)
const dayClosed = d => !!periodOf(d) || !!(state.closed && state.closed[d] && '*' in state.closed[d]);
const dayReason = d => { const p = periodOf(d); return p ? (p.reason || '') : ((state.closed && state.closed[d] && state.closed[d]['*']) || ''); };
const hourOf = q => q.slice(0, 2) + ':00';
const hourClosed = (d, q) => dayClosed(d) || !!(state.closed && state.closed[d] && hourOf(q) in state.closed[d]);
const slotFull = (d, q) => hourClosed(d, q) || slotUsed(d, q) >= state.boats;
const MAX_Q = 40;                                   // 10 hours
const toMin = q => +q.slice(0, 2) * 60 + +q.slice(3, 5);
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const addQ = (q, n) => fromMin(toMin(q) + 15 * n);
const quarters = d => openSlots(d).flatMap(h => ['00', '15', '30', '45'].map(m => h.slice(0, 3) + m));
const rangeOf = (q, n = state.dur) => [...Array(n)].map((_, i) => addQ(q, i));
const startOk = (d, q, n = state.dur, open = quarters(d)) => rangeOf(q, n).every(x => open.includes(x) && !slotFull(d, x));
const durText = n => t('durText')(Math.floor(n / 4), (n % 4) * 15);
function dayStatus(dayIso) {
  const open = quarters(dayIso);
  if (!open.length || dayClosed(dayIso)) return { s: 'closed', free: 0, pct: 0 };
  const freeQ = open.filter(q => !slotFull(dayIso, q)).length, starts = open.filter(q => startOk(dayIso, q, state.dur, open)).length;
  const pct = Math.round(freeQ / open.length * 100);
  return { s: starts === 0 ? 'full' : pct <= 35 ? 'few' : 'free', free: Math.floor(freeQ / 4), pct };
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
    const past = di < todayIso(), off = !past && st.s === 'closed' && dayClosed(di);
    const label = `${fmt(date, 'long')} — ${st.s === 'loading' ? t('loading') : off ? t('dayOff') : st.s === 'closed' ? t('closed') : st.s === 'full' ? t('full') : t('slotsLeft')(st.free)}`;
    html += `<button type="button" class="cd ${st.s}${past ? ' past' : ''}${off ? ' dayoff' : ''}${di === todayIso() ? ' today' : ''}" data-iso="${di}" aria-pressed="${state.day === di}"
      aria-label="${esc(label)}" ${st.s === 'closed' || st.s === 'loading' ? 'disabled' : ''}><b>${d}</b>${icon}
      ${st.s === 'free' || st.s === 'few' ? `<span class="cd-bar" aria-hidden="true"><i style="width:${st.pct}%"></i></span>` : '<i class="dot" aria-hidden="true"></i>'}</button>`;
  }
  $('#calGrid').innerHTML = html;
  // the whole rest of this month falls into a closed period → say when the club opens again
  const from = iso(m) < todayIso() ? todayIso() : iso(m), last = iso(new Date(m.getFullYear(), m.getMonth(), days));
  const pf = periodOf(from), pl = periodOf(last), per = pf && pl && pf === pl ? pf : null, note = $('#calNote');
  const reopen = per ? fromIso(per.reopen_on) : null, canJump = reopen && firstOfMonth(reopen) <= lastMonth;
  note.hidden = !per && state.boats > 0;
  note.innerHTML = state.boats < 1 ? esc(t('noCapacity')) : per ? `${esc(t('clubClosedTill')(fmt(per.reopen_on, 'long')))}${per.reason ? ' ' + esc(per.reason) + '.' : ''}${canJump ? ` <button type="button" class="btn-link inline" id="calJump" data-m="${per.reopen_on}">${esc(t('toSeason')(fmt(firstOfMonth(reopen), 'month')))}</button>` : ''}` : '';
}
$('#calPrev').addEventListener('click', () => { if (state.month <= thisMonth) return; state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); loadMonth(); });
$('#calNote').addEventListener('click', e => { if (e.target.id === 'calJump') { state.month = firstOfMonth(fromIso(e.target.dataset.m)); loadMonth(); } });
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
  const open = quarters(state.day);
  if (state.time && !startOk(state.day, state.time, state.dur, open)) state.time = null;
  if (!open.length || open.every(q => slotFull(state.day, q))) { box.innerHTML = `<p class="hint">${esc(dayClosed(state.day) ? t('dayClosed') + (dayReason(state.day) ? ' — ' + dayReason(state.day) : '') : t('noSlots'))}</p>`; return; }
  const sel = state.time ? rangeOf(state.time) : [];
  const hoursOpen = [...new Set(open.map(hourOf))];
  box.innerHTML = hoursOpen.map(h => {
    const hw = state.wx && state.wx.hourly[`${state.day}T${h}`];
    const chips = open.filter(q => hourOf(q) === h).map(q => {
      const full = slotFull(state.day, q), ok = !full && startOk(state.day, q, state.dur, open);
      const why = hourClosed(state.day, q) ? t('closed') : full ? t('taken') : !ok ? t('noFitD')(durText(state.dur)) : '';
      const cls = `${sel.includes(q) && q !== state.time ? ' in-range' : ''}${full ? ' full' : !ok ? ' no-fit' : ''}`;
      return `<button type="button" class="q${cls}" role="radio" aria-checked="${state.time === q}" data-h="${q}" ${ok ? '' : 'disabled'}
        aria-label="${q}–${addQ(q, state.dur)}${why ? ' — ' + esc(why) : ''}" title="${why ? esc(why) : `${q}–${addQ(q, state.dur)}`}">${q.slice(3)}</button>`;
    }).join('');
    const left = Math.min(...open.filter(q => hourOf(q) === h).map(q => state.boats - slotUsed(state.day, q)));
    return `<div class="hrow"><span class="hlab"><b>${h.slice(0, 2)}</b><small>${hw ? `${wxInfo(hw.code)[0]} ${Math.round(hw.temp)}° · ${Math.round(hw.wind)} ${esc(t('kmh'))}` : ''}</small></span>
      <span class="qs">${chips}</span>${state.boats > 1 && left > 0 ? `<small class="sb">${esc(t('boatsLeft')(left))}</small>` : ''}</div>`;
  }).join('') + (state.time ? `<p class="sel-range">✓ ${esc(state.time)}–${esc(addQ(state.time, state.dur))} · ${esc(durText(state.dur))}</p>` : '');
}
$('#slots').addEventListener('click', e => {
  const b = e.target.closest('.q'); if (!b || b.disabled) return;
  state.time = b.dataset.h;
  if (state.coach && coachBusy(state.coach)) state.coach = null;
  renderSlots(); renderCoaches(); update();
});
// duration: 15 minutes … 10 hours
const DUR_QUICK = [2, 4, 6, 8, 12];
function renderDur() {
  $('#dur').innerHTML = `<div class="stepper dur-step"><button type="button" data-dd="-1" aria-label="−15" ${state.dur <= 1 ? 'disabled' : ''}>−</button>
      <output aria-live="polite">${esc(durText(state.dur))}</output><button type="button" data-dd="1" aria-label="+15" ${state.dur >= MAX_Q ? 'disabled' : ''}>+</button></div>
    <div class="dur-quick">${DUR_QUICK.map(n => `<button type="button" data-dq="${n}" aria-pressed="${state.dur === n}">${esc(durText(n))}</button>`).join('')}</div>`;
}
$('#dur').addEventListener('click', e => {
  const b = e.target.closest('[data-dd],[data-dq]'); if (!b) return;
  state.dur = b.dataset.dq ? +b.dataset.dq : Math.min(MAX_Q, Math.max(1, state.dur + +b.dataset.dd));
  if (state.coach && coachBusy(state.coach)) state.coach = null;
  renderDur(); renderCalendar(); renderSlots(); renderCoaches(); renderPassUse(); update();
});

/* ---------- coaches ---------- */
const coachFits = c => c && (!c.rides || !c.rides.length || c.rides.includes(state.ride.id));
const coachBusy = id => state.day && state.time && rangeOf(state.time).some(h => (((state.load[state.day] || {})[h] || {}).coaches || []).includes(id));
function renderCoaches() {
  // shown after the hour is chosen, and only the coaches who are free then
  const list = state.day && state.time ? state.coaches.filter(coachFits).filter(c => !coachBusy(c.id)) : [];
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

/* ---------- riders: groups of different levels ---------- */
const MAX_R = 12;
const ridersTotal = () => state.groups.reduce((a, g) => a + g.n, 0);
function renderGroups() {
  state.riders = ridersTotal();
  const lv = t('levels');
  $('#rgroups').innerHTML = state.groups.map((g, i) => `<div class="rg" data-gi="${i}">
      <select data-gl="${i}" aria-label="${esc(t('levelLabel'))}">${lv.map((x, k) => `<option value="${k}" ${g.l === k ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <div class="stepper sm"><button type="button" data-gn="-1" data-i="${i}" aria-label="−" ${g.n <= 1 ? 'disabled' : ''}>−</button><output>${g.n}</output><button type="button" data-gn="1" data-i="${i}" aria-label="+" ${state.riders >= MAX_R ? 'disabled' : ''}>+</button></div>
      ${state.groups.length > 1 ? `<button type="button" class="rg-x" data-gx="${i}" aria-label="${esc(t('remove'))}">×</button>` : '<span></span>'}
    </div>`).join('');
  $('#rTotal').textContent = t('ridersTotal')(state.riders);
  $('#addRider').disabled = state.riders >= MAX_R || state.groups.length >= 4;
}
$('#rgroups').addEventListener('change', e => { const i = e.target.dataset.gl; if (i == null) return; state.groups[+i].l = +e.target.value; update(); });
$('#rgroups').addEventListener('click', e => {
  const n = e.target.closest('[data-gn]'), x = e.target.closest('[data-gx]');
  if (n) { const g = state.groups[+n.dataset.i]; g.n = Math.max(1, Math.min(MAX_R - (ridersTotal() - g.n), g.n + +n.dataset.gn)); }
  else if (x) state.groups.splice(+x.dataset.gx, 1);
  else return;
  renderGroups(); renderEquip(); update();
});
$('#addRider').addEventListener('click', () => {
  if (ridersTotal() >= MAX_R) return;
  const used = state.groups.map(g => g.l), l = [0, 1, 2, 3].find(k => !used.includes(k)) ?? 0;
  state.groups.push({ l, n: 1 }); renderGroups(); renderEquip(); update();
});
const groupsText = (gr, sep = ', ') => (gr || []).map(g => `${g.n} × ${t('levels')[g.l] || ''}`).join(sep);

/* ---------- passes the customer owns ---------- */
const passLeft = p => p.hours_total - state.mine.filter(b => b.pass_id === p.id && b.status !== 'cancelled').length * 0.25;
const passValid = (p, day) => p.status === 'active' && p.paid && (!day || (day >= p.starts_at && day <= p.expires_at)) && (!p.ride || p.ride === state.ride.id) && passLeft(p) >= state.dur / 4;
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
window.bookingState = state;   // read by wizard.js (phone step-by-step form)
const whenText = (day = state.day, time = state.time, n = state.dur) => !day ? t('noWhen') : `${fmt(day, 'long')} · ${time ? `${time}–${addQ(time, n)} (${durText(n)})` : t('pickTime')}`;
const equipCost = () => Math.round(equipHourly() / 4 * 100) / 100 * state.dur;   // same rounding as the database (per 15 minutes)
function currentPrice() {
  if (state.pass) return equipCost();
  const base = priceOf(state.ride.id), pct = state.offer && state.offer.discount_percent;
  return base == null ? null : Math.round(base * (100 - (pct || 0)) / 4) / 100 * state.dur + equipCost();
}
function update() {
  const coach = state.coaches.find(c => c.id === state.coach);
  const lk = state.lakes.find(l => l.id === state.lake), sets = equipSets();
  $('#sumRide').textContent = !state.picked ? '—' : `${rideName(state.ride.id)} · ${t('rider')(state.riders)}${coach ? ' · ' + coach.name : ''}${sets ? ' · 🏄 ' + equipText({ equip_items: equipItems().map(x => ({ ...x, ...state.gear.find(g => g.id === x.id) , n: x.n })) }) : ''}`;
  $('#sumWhen').textContent = whenText();
  const o = state.offer, pct = o && o.discount_percent, p = currentPrice();
  $('#sumTotal').textContent = state.pass ? (p ? `${t('byPass')} + ₾${money(p)}` : t('byPass')) : p == null ? (pct ? t('offerOff')(pct) : t('onRequest')) : '₾' + money(p);
  $('#holdNote').hidden = !C.onlinePayment || !(p > 0);
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
  if (!form.email.value && auth.session && auth.session.user && auth.session.user.email) form.email.value = auth.session.user.email;
}
form.addEventListener('submit', e => { e.preventDefault(); submit(); });
async function submit() {
  const err = $('#formError');
  if (!state.picked) { document.querySelector('#rides').scrollIntoView({ block: 'center', behavior: 'smooth' }); return err.textContent = t('errRide'); }
  if (!state.day) return err.textContent = t('errDay');
  if (!state.time) return err.textContent = t('errTime');
  if (state.offer && !offerOk(state.offer, state.day)) return err.textContent = t('errOfferDate');
  if (!$('#agree').checked) { $('#agree').focus(); return err.textContent = t('errAgree'); }
  if (!auth.session) return ui.open('in', p => { prefill(p); afterAuth().then(submitIfReady); });
  const name = form.name.value.trim(), phone = form.phone.value.trim(), email = form.email.value.trim();
  if (!name || phone.replace(/\D/g, '').length < 9) { form.name.value ? form.phone.focus() : form.name.focus(); return err.textContent = t('errContact'); }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { form.email.focus(); return err.textContent = t('errEmail'); }
  const group = crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  const levelSum = state.groups.length === 1 ? window.DICT.en.levels[state.groups[0].l] : 'Mixed';
  const booking = { ride: state.ride.id, date: state.day, time: state.time, riders: state.riders, rider_groups: state.groups.map(g => ({ l: g.l, n: g.n })),
    level: levelSum, name, phone, email, notes: form.notes.value.trim() || null, lang: i18n.lang, equip_items: equipItems().length ? equipItems() : null,
    offer_id: state.offer && !state.pass ? state.offer.id : null, coach_id: state.coach, pass_id: state.pass };
  const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = t('sending');
  let res = 'error', row = null;
  const rows = rangeOf(state.time).map(h => ({ ...booking, time: h, group_id: group }));
  try {
    const r = await db('bookings?select=id,ride,date,time,riders,level,name,phone,notes,price,paid,rider_groups,lake_id,equip_sets,equip_items', { method: 'POST', body: rows, prefer: 'return=representation' });
    row = r && r[0] && { ...r[0], time: state.time, dur: r.length, price: r.some(x => x.price == null) ? null : r.reduce((a, x) => a + +x.price, 0), paid: r.every(x => x.paid) };
    res = 'ok';
  }
  catch (x) { res = x.code === '23505' ? 'taken' : x.code === 'PW001' ? 'coach' : x.code === 'PW002' ? 'pass' : x.code === 'PW010' ? 'equip' : x.code === 'PW005' || x.code === 'PW008' ? 'closed' : x.status === 401 ? 'auth' : 'error'; }
  btn.disabled = false; update();
  if (res === 'auth') { await auth.signOut(); ui.renderAccount(); return ui.open('in', () => afterAuth().then(submitIfReady)); }
  if (res === 'taken') { state.time = null; await loadMonth(); update(); return err.textContent = t('errTaken'); }
  if (res === 'equip') { await loadClub(); return err.textContent = t('errEquip'); }
  if (res === 'coach') { state.coach = null; await loadMonth(); update(); return err.textContent = t('errCoach'); }
  if (res === 'closed') { state.time = null; await loadMonth(); update(); return err.textContent = t('closedHour'); }
  if (res === 'pass') { state.pass = null; renderPassUse(); update(); return err.textContent = t('errPass'); }
  if (res !== 'ok') return err.textContent = t('errNet');
  state.last = { ...booking, dur: state.dur, ...(row || {}) };
  if (row && row.id) fn('notify', { event: 'booking_created', id: row.id }).catch(() => {});
  showDone(); loadMonth(); loadMine();
  // with online payment the amount is only held on the card now; it is charged when the club confirms
  if (C.onlinePayment && row && row.id && row.price > 0 && !row.paid) startPay('booking', row.id, $('#payBtn'));
}
function submitIfReady() { if (state.day && state.time) submit(); }
const lastWhen = b => whenText(b.date, b.time, b.dur || 1);
function showDone() {
  const b = state.last, rn = rideName(b.ride);
  $('#doneText').textContent = t('doneText')(rn, lastWhen(b), t('rider')(b.riders));
  const lk = state.lakes.find(l => l.id === b.lake_id);
  const msg = `${t('waMsg')}\n${rn} · ${t('rider')(b.riders)} (${groupsText(b.rider_groups)})${equipText(b) ? ' · ' + equipText(b) : ''}\n${lastWhen(b)}\n${b.name}, ${b.phone}${b.notes ? '\n' + b.notes : ''}`;
  const wa = $('#doneWa'); wa.hidden = !C.whatsapp; wa.href = waLink(C.whatsapp, msg);
  const box = $('#payBox'), price = b.price != null ? +b.price : null;
  box.hidden = !(price > 0) || b.paid;
  if (!box.hidden) {
    $('#payAmount').textContent = `${t('toPay')}: ₾${money(price)}`;
    $('#payBtn').hidden = !C.onlinePayment; $('#payBtn').dataset.id = b.id || '';
    $('#payNote').textContent = C.onlinePayment ? t('payHoldNote') : t('payAtLake');
    $('#payBtn').textContent = t('payHold');
  }
  form.hidden = true; const d = $('#done'); d.hidden = false; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); d.focus({ preventScroll: true });
}
$('#payBtn').addEventListener('click', e => startPay('booking', e.target.dataset.id, e.target));
$('#again').addEventListener('click', () => {
  const keep = { name: form.name.value, phone: form.phone.value };
  form.reset(); form.name.value = keep.name; form.phone.value = keep.phone;
  Object.assign(state, { ride: RIDES[0], day: null, time: null, dur: 4, riders: 1, groups: [{ l: 1, n: 1 }], equip: 'own', eqSel: {}, last: null, offer: null, coach: null, pass: null }); renderDur();
  prefill(ui.state.profile); renderGroups(); renderRides(); renderEquip(); renderOffers(); renderCoaches(); renderPassUse(); renderCalendar(); renderSlots(); update();
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
    if (r.held) { toast(t('payHeldOk'), 'ok'); return loadMine(); }
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
    db(`bookings?user_id=eq.${uid}&select=id,ride,date,time,riders,status,cancelled_by,confirmed_at,owner_note,price,paid,pass_id,coach_id,group_id,lake_id,equip_sets,equip_items,rider_groups,payment_status&order=date.desc,time.desc&limit=1000`).catch(() => []),
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
    const pay = b.status !== 'cancelled' && b.price > 0 ? (b.paid ? `<span class="pay-tag ok">✓ ${esc(t('paid'))}</span>` : b.payment_status === 'held' ? `<span class="pay-tag held">🔒 ₾${money(b.price)} · ${esc(t('held'))}</span>` : `<span class="pay-tag">₾${money(b.price)} · ${esc(t('unpaid'))}</span>`) : b.pass_id ? `<span class="pay-tag ok">🎟️ ${esc(t('byPass'))}</span>` : '';
    const acts = [];
    if (b.date >= today && b.status !== 'cancelled') {
      if (!b.paid && b.price > 0 && C.onlinePayment && b.payment_status !== 'held' && b.status !== 'cancelled') acts.push(`<button type="button" class="btn-small primary" data-pay="${b.id}">${esc(t('payHold'))}</button>`);
      const cancelAttr = b.group_id ? `data-cancelgroup="${b.group_id}"` : `data-cancel="${b.id}"`;
      const hoursLeft = (new Date(`${b.date}T${b.time}:00`) - Date.now()) / 3.6e6;
      acts.push(hoursLeft >= (C.cancelHours || 0) ? `<button type="button" class="btn-small ghost" ${cancelAttr}>${esc(t('cancel'))}</button>` : `<small class="muted late">${esc(t('lateCancel'))}</small>`);
    }
    if (b.date <= today && b.status === 'confirmed') acts.push(b.ids.some(i => state.myReviews.has(i)) ? `<span class="pay-tag ok">★ ${esc(t('reviewed'))}</span>` : `<button type="button" class="btn-small star" data-review="${b.id}">★ ${esc(t('writeReview'))}</button>`);
    return `<li class="mb">
      <div><b>${esc(rideName(b.ride))}</b><span>${esc(whenText(b.date, b.time, b.dur))} · ${esc(t('rider')(b.riders))}${coach ? ' · ' + esc(coach.name) : ''}${equipText(b) ? ' · 🏄 ' + esc(equipText(b)) : ''}</span>
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
  now.innerHTML = `<span class="wn-lab">${esc(t('wxLakeNow'))}</span><span class="wn-main"><span class="wn-ic" aria-hidden="true">${ic}</span><b>${Math.round(c.temperature_2m)}°C</b><span>${esc(t('wx')[k])}</span></span>
    <span class="wn-wind"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6"/></svg><span><b>${Math.round(c.wind_speed_10m)} ${esc(t('kmh'))}</b><small>${esc(t('wxWind'))}</small></span></span>`;
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
  if (!C.phone && !C.whatsapp) rows.unshift(`<li class="only">${esc(t('cOnly'))}</li>`);
  $('#contactList').innerHTML = rows.join('');
  // footer contacts
  const fc = [];
  if (C.phone) fc.push(`<a href="tel:${esc(C.phone.replace(/\s/g, ''))}">📞 ${esc(C.phone)}</a>`);
  if (C.whatsapp) fc.push(`<a href="${esc(waLink(C.whatsapp))}" target="_blank" rel="noopener">💬 WhatsApp</a>`);
  if (C.instagram) fc.push(`<a href="https://instagram.com/${esc(C.instagram)}" target="_blank" rel="noopener">📷 @${esc(C.instagram)}</a>`);
  if (C.email) fc.push(`<a href="mailto:${esc(C.email)}">✉️ ${esc(C.email)}</a>`);
  fc.push(`<span>🕘 ${pad(C.openHour)}:00 – ${pad(C.closeHour + 1)}:00</span>`);
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
  renderLakes(); renderGroups(); renderEquip(); renderRides(); renderOffers(); renderDur(); renderCoaches(); renderPlans(); renderCalendar(); renderSlots(); renderContact(); renderWeather(); renderMine(); renderReviews(); renderPassUse(); update(); ui.refresh();
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
