/* Staff page — a coach or driver sees only their own bookings (the database enforces this) and their notifications. */
(() => {
const { auth, db, rpc, equipText, i18n, fmt, todayIso, iso, esc, pad, waLink, phoneWa } = window.PW;
const ui = window.PW.ui;
const $ = s => document.querySelector(s);
const t = k => i18n.t(k);
i18n.init(window.DICT, ['ka', 'en', 'ru']);

const state = { me: null, kind: null, rows: [], lakes: [], coaches: [], notes: [], range: 'week', lastSeen: null };
const toMin = q => +q.slice(0, 2) * 60 + +q.slice(3, 5);
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const addQ = (q, n) => fromMin(toMin(q) + 15 * n);
const durText = n => t('durText')(Math.floor(n / 4), (n % 4) * 15);
const rideName = id => (t('rides')[id] || [id])[0];
const lakeName = id => { const l = state.lakes.find(x => x.id === id); return l ? (l['name_' + i18n.lang] || l.name_ka) : ''; };
const groupsText = gr => (gr || []).map(g => `${g.n} × ${t('levels')[g.l] || ''}`).join(', ');
function merge(rows) {
  const out = [], by = {};
  rows.forEach(b => {
    const k = b.group_id || b.id;
    if (!by[k]) { by[k] = { ...b, dur: 1, end: addQ(b.time, 1) }; out.push(by[k]); }
    else { const g = by[k]; g.dur++; if (b.time < g.time) g.time = b.time; const e = addQ(b.time, 1); if (e > g.end) g.end = e; }
  });
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

async function start() {
  const p = await ui.init({ staffLink: false, onSignIn: () => start(), onSignOut: () => start() });
  if (!auth.session) return gate(t('staffSignIn'), true);
  if (!p || (p.role !== 'coach' && p.role !== 'driver')) return gate(t('staffOnly'), false);
  state.kind = p.role;
  const uid = auth.session.user.id;
  const [me, lakes, coaches] = await Promise.all([
    db(`${p.role === 'coach' ? 'coaches' : 'drivers'}?user_id=eq.${uid}&select=*`).catch(() => []),
    db('lakes?select=id,name_ka,name_en,name_ru,active,driver_id&order=sort.asc').catch(() => []),
    db('coaches?select=id,name').catch(() => []),
  ]);
  state.me = me[0] || null; state.lakes = lakes; state.coaches = coaches;
  if (!state.me) return gate(t('staffNotLinked'), false);
  $('#stGate').hidden = true; $('#stBody').hidden = false; $('#bellBtn').hidden = false;
  $('#stRole').textContent = `🗓 ${t('role_' + p.role)} · Poti Lake Club`;
  $('#stHello').textContent = t('staffHello')(state.me.name);
  await load();
  clearInterval(state.timer); state.timer = setInterval(load, 30000);
}
function gate(msg, btn) { $('#stBody').hidden = true; $('#stGate').hidden = false; $('#stGateMsg').textContent = msg; $('#stSignIn').hidden = !btn; $('#bellBtn').hidden = true; }
$('#stSignIn').addEventListener('click', () => ui.open('in', () => start()));

async function load() {
  // a coach sees their own bookings; a driver sees the ones on their lake plus those that still have no lake
  const mine = state.kind === 'coach' ? `coach_id=eq.${state.me.id}` : `or=(driver_id.eq.${state.me.id},lake_id.is.null)`, from = iso(new Date(Date.now() - 30 * 864e5));
  try {
    const [rows, notes] = await Promise.all([
      db(`bookings?select=id,ride,date,time,riders,rider_groups,level,name,phone,notes,status,lake_id,coach_id,driver_id,equip_sets,equip_items,group_id&${mine}&date=gte.${from}&status=neq.cancelled&order=date.asc,time.asc&limit=5000`),
      db(`notifications?select=*&user_id=eq.${auth.session.user.id}&order=created_at.desc&limit=60`),
    ]);
    const before = new Set(state.notes.map(n => n.id));
    state.rows = rows; state.notes = notes;
    if (state.lastSeen !== null) notes.filter(n => !before.has(n.id) && !n.read_at).forEach(osNotify);
    state.lastSeen = Date.now();
  } catch (e) { if (e.status === 401) { await auth.signOut(); return start(); } }
  render();
}
// optional system notification while the page is open
function osNotify(n) {
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(noteTitle(n), { body: noteBody(n), tag: n.id }); } catch {}
}
const noteTitle = n => t('nt_' + n.kind);
const noteBody = n => { const d = n.data || {}; return `${n.kind === 'remind' && d.need_lake ? '🌊 ' + t('remindPick') + ' · ' : ''}${d.date ? fmt(d.date, 'long') : ''} · ${d.from || ''}–${d.to || ''} · ${rideName(d.ride)}${d.lake ? ' · ' + d.lake : ''}${d.name ? ' · ' + d.name : ''}`; };

function render() {
  const today = todayIso(), all = merge(state.rows), up = all.filter(b => b.date >= today);
  const wkEnd = iso(new Date(Date.now() + 7 * 864e5));
  const hrsWeek = up.filter(b => b.date <= wkEnd && b.status === 'confirmed').reduce((a, b) => a + b.dur / 4, 0);
  const pending = up.filter(b => b.status === 'new').length;
  const todayN = up.filter(b => b.date === today).length, needLake = up.filter(b => !b.lake_id).length;
  $('#stNeed').hidden = !needLake; $('#stNeed').textContent = needLake ? t('stNeedLake')(needLake) : '';
  $('#stKpis').innerHTML = [[t('stToday'), todayN], [t('stWeekH'), hrsWeek.toLocaleString('ka-GE')], [t('stPending'), pending], [t('stTotalUp'), up.length]]
    .map(([k, v]) => `<div class="kpi"><small>${esc(k)}</small><b>${esc(String(v))}</b></div>`).join('');
  $('#stRange').innerHTML = ['today', 'week', 'all', 'past'].map(r => `<button type="button" class="chip${state.range === r ? ' on' : ''}" data-range="${r}">${esc(t('stR_' + r))}</button>`).join('');
  let list = state.range === 'past' ? all.filter(b => b.date < today).reverse() : up;
  if (state.range === 'today') list = up.filter(b => b.date === today);
  if (state.range === 'week') list = up.filter(b => b.date <= wkEnd);
  const days = {}; list.forEach(b => (days[b.date] = days[b.date] || []).push(b));
  $('#stDays').innerHTML = Object.keys(days).length ? Object.entries(days).map(([d, items]) => `<div class="st-day"><h3>${esc(fmt(d, 'long'))}${d === today ? ` <span class="badge new">${esc(t('today'))}</span>` : ''}</h3>
    ${items.map(b => { const coach = state.coaches.find(c => c.id === b.coach_id); const wa = waLink(phoneWa(b.phone));
      return `<article class="st-bk st-${b.status}">
        <div class="st-time"><b>${esc(b.time)}</b><span>${esc(b.end)}</span><small>${esc(durText(b.dur))}</small></div>
        <div class="st-info"><b>${esc(rideName(b.ride))}</b>${b.date < today && b.lake_id ? ` <span class="lake-chip">${esc(lakeName(b.lake_id))}</span>` : ''}
          <span>${esc(t('rider')(b.riders))}${b.rider_groups ? ' — ' + esc(groupsText(b.rider_groups)) : ''}${equipText(b) ? ' · 🏄 ' + esc(equipText(b)) : ''}</span>
          <span class="muted">${esc(b.name)} · <a href="tel:${esc(String(b.phone).replace(/\s/g, ''))}">${esc(b.phone)}</a>${wa ? ` · <a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${state.kind === 'driver' && coach ? ' · 🎓 ' + esc(coach.name) : ''}</span>
          ${b.notes ? `<span class="st-notes">“${esc(b.notes)}”</span>` : ''}
          ${b.date >= today ? `<label class="st-lake${b.lake_id ? '' : ' unset'}"><span>🌊 ${esc(t('lakeLabel'))}</span><select data-lakesel="${b.id}"><option value="">${esc(t('lakePick'))}</option>${state.lakes.filter(l => l.active !== false || l.id === b.lake_id).map(l => `<option value="${l.id}" ${l.id === b.lake_id ? 'selected' : ''}>${esc(lakeName(l.id))}</option>`).join('')}</select></label>` : ''}</div>
        <span class="badge ${b.status === 'new' ? 'new' : 'confirmed'}">${esc(t(b.status === 'new' ? 'st_new' : 'st_confirmed'))}</span>
      </article>`; }).join('')}</div>`).join('') : `<p class="cm-empty">${esc(t('stNone2'))}</p>`;
  const unread = state.notes.filter(n => !n.read_at).length;
  $('#bellCount').hidden = !unread; $('#bellCount').textContent = unread;
  const sb = document.getElementById('staffBadge'); if (sb) { sb.hidden = !unread; sb.textContent = unread; }
  renderNotes();
}
function renderNotes() {
  $('#ntList').innerHTML = state.notes.length ? state.notes.map(n => `<div class="nt nt-${n.kind}${n.read_at ? '' : ' unread'}">
      <span class="nt-ic" aria-hidden="true">${{ new: '🆕', confirmed: '✅', cancelled: '✖️', assigned: '🎓', remind: '⏰' }[n.kind] || '🔔'}</span>
      <div><b>${esc(noteTitle(n))}</b><span>${esc(noteBody(n))}</span><small class="muted">${esc(fmt(new Date(n.created_at), 'short') + ' ' + new Date(n.created_at).toTimeString().slice(0, 5))}</small></div>
    </div>`).join('') : `<p class="muted">${esc(t('notifNone'))}</p>`;
  $('#ntAllRead').hidden = !state.notes.some(n => !n.read_at);
}
$('#bellBtn').addEventListener('click', () => {
  $('#notifModal').showModal();
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
});
$('#ntAllRead').addEventListener('click', async () => {
  try { await db(`notifications?user_id=eq.${auth.session.user.id}&read_at=is.null`, { method: 'PATCH', body: { read_at: new Date().toISOString() }, prefer: 'return=minimal' }); } catch {}
  load();
});
$('#stDays').addEventListener('change', async e => {
  const sel = e.target.closest('[data-lakesel]'); if (!sel) return;
  sel.disabled = true;
  try { await rpc('staff_set_lake', { p_booking: sel.dataset.lakesel, p_lake: sel.value || null }); ui.toast(t(sel.value ? 'lakeSaved' : 'lakeCleared'), 'ok'); }
  catch (x) { ui.toast(t(x.code === 'PW011' ? 'errLakeBusy' : 'errNet'), 'err'); }
  load();
});
$('#stRange').addEventListener('click', e => { const b = e.target.closest('[data-range]'); if (b) { state.range = b.dataset.range; render(); } });

function applyLang(l) { i18n.set(l); i18n.apply(); document.title = `${t('staffPage')} — Poti Lake Club`; ui.refresh(); if (state.me) { $('#stHello').textContent = t('staffHello')(state.me.name); render(); } }
$('.lang').addEventListener('click', e => { const l = e.target.dataset.lang; if (l) applyLang(l); });
const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();
i18n.set(i18n.lang); i18n.apply(); document.title = `${t('staffPage')} — Poti Lake Club`;
start();
})();
