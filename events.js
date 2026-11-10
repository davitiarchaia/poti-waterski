/* Events page — camps, courses, tournaments; sign-up and results. */
(() => {
const { auth, db, rpc, fn, i18n, fmt, todayIso, esc, myProfile } = window.PW;
const ui = window.PW.ui, CM = window.CM, LEVELS = window.LEVELS, KINDS = window.EVENT_KINDS;
const $ = s => document.querySelector(s);
const t = k => i18n.t(k);
i18n.init(window.DICT, ['ka', 'en', 'ru']);

const state = { events: [], taken: {}, mine: [], results: {}, kind: 'all', open: new Set(), signFor: null, loaded: false };
const money = v => '₾' + (Math.round((+v || 0) * 100) / 100).toLocaleString('ka-GE', { maximumFractionDigits: 2 });
const endDate = e => e.end_date || e.start_date;
const isPast = e => endDate(e) < todayIso();
const mySign = e => state.mine.find(s => s.event_id === e.id && s.status !== 'cancelled');
const sStatus = s => s.status === 'cancelled' && s.cancelled_by === 'owner' ? 'rejected' : s.status;

async function load() {
  try {
    const [ev, tk] = await Promise.all([
      db('events?select=*&status=neq.draft&order=start_date.asc,start_time.asc'),
      rpc('event_taken', {}).catch(() => []),
    ]);
    state.events = ev || []; state.taken = Object.fromEntries((tk || []).map(x => [x.event_id, x.taken]));
  } catch { state.events = []; }
  state.loaded = true;
  await Promise.all(state.events.filter(e => isPast(e) && e.results_published && !state.results[e.id])
    .map(e => rpc('event_results', { eid: e.id }).then(r => state.results[e.id] = r || []).catch(() => {})));
  render(); fromHash();
}
async function loadMine() {
  state.mine = [];
  if (auth.session) { try { state.mine = await db(`event_signups?select=*&user_id=eq.${auth.session.user.id}&order=created_at.desc`) || []; } catch {} }
  renderMine(); render();
}

/* ---------- render ---------- */
function dateBlock(e) {
  const d = new Date(e.start_date + 'T12:00');
  const multi = e.end_date && e.end_date !== e.start_date;
  return `<div class="ev-date"><b>${d.getDate()}</b><span>${esc(fmt(e.start_date, 'mo'))}</span>${multi ? `<small>→ ${esc(fmt(e.end_date, 'short'))}</small>` : ''}</div>`;
}
function seats(e) {
  const taken = state.taken[e.id] || 0;
  if (!e.capacity) return `<div class="ev-seats"><small>${esc(t('eOpen'))}</small></div>`;
  const left = Math.max(0, e.capacity - taken), pct = Math.min(100, taken / e.capacity * 100);
  return `<div class="ev-seats"><div class="ev-bar${left === 0 ? ' full' : left <= 3 ? ' low' : ''}"><i style="width:${pct}%"></i></div>
    <small>${esc(t('eSeats')(taken, e.capacity))}${left > 0 && left <= 3 ? ' · <b>' + esc(t('eSeatsLeft')(left)) + '</b>' : ''}</small></div>`;
}
function action(e) {
  const s = mySign(e);
  if (s) return `<span class="ev-joined st-${sStatus(s)}">✓ ${esc(t('eJoined'))} · ${esc(t('es_' + sStatus(s)))}</span>`;
  if (e.status === 'cancelled') return `<span class="badge cancelled">${esc(t('st_cancelled') || t('es_cancelled'))}</span>`;
  const full = e.capacity && (state.taken[e.id] || 0) >= e.capacity;
  if (full) return `<button type="button" class="btn ev-btn" disabled>${esc(t('eFull'))}</button>`;
  return `<button type="button" class="btn ev-btn" data-join="${e.id}">${esc(t('eJoin'))}</button>`;
}
function card(e) {
  const open = state.open.has(e.id), long = (e.description || '').length > 160;
  const days = e.end_date && e.end_date !== e.start_date ? Math.round((new Date(e.end_date) - new Date(e.start_date)) / 864e5) + 1 : 0;
  return `<article class="ev-card ev-k-${esc(e.kind)}${e.status === 'cancelled' ? ' is-cancelled' : ''}" id="e-${e.id}">
    ${dateBlock(e)}
    <div class="ev-body">
      <div class="ev-tags">${CM.kindTag(e.kind)}${e.discipline ? `<span class="d-tag">${esc(t('d_' + e.discipline))}</span>` : ''}
        ${e.level ? CM.levelBadge(e.level) : `<span class="d-tag soft">${esc(t('eAllLevels'))}</span>`}</div>
      <h3>${esc(e.title)}</h3>
      <p class="ev-when">${esc(fmt(e.start_date, 'long'))}${e.start_time ? ' · ' + esc(e.start_time) : ''}${days ? ' · ' + esc(t('eDays')(days)) : ''}</p>
      ${e.description ? `<p class="ev-desc${open || !long ? ' open' : ''}">${esc(e.description)}</p>${long ? `<button type="button" class="btn-link inline" data-more="${e.id}">${esc(t(open ? 'eLess' : 'eDetails'))}</button>` : ''}` : ''}
    </div>
    <div class="ev-side">
      <div class="ev-price">${+e.price ? money(e.price) : esc(t('eFree'))}</div>
      ${seats(e)}
      ${action(e)}
    </div>
  </article>`;
}
function pastCard(e) {
  const res = state.results[e.id] || [];
  const medal = p => p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : `#${p}`;
  return `<article class="ev-past" id="e-${e.id}">
    <div class="ev-past-h">${CM.kindTag(e.kind)}<b>${esc(e.title)}</b><small class="muted">${esc(fmt(e.start_date, 'dm'))} ${new Date(e.start_date).getFullYear()}</small></div>
    ${e.results_published ? (res.length ? `<ol class="res">${res.slice(0, 10).map(r => `<li class="p${r.place}"><span>${medal(r.place)}</span>
        ${r.username ? `<a href="riders.html#u=${encodeURIComponent(r.username)}">${esc(r.display_name)}</a>` : `<b>${esc(r.display_name)}</b>`}${r.result ? `<small>${esc(r.result)}</small>` : ''}</li>`).join('')}</ol>` : '')
      : (e.kind === 'tournament' ? `<p class="muted small">${esc(t('eNoResults'))}</p>` : '')}
  </article>`;
}
function render() {
  $('#kChips').innerHTML = ['all', ...KINDS].map(k => `<button type="button" class="chip${state.kind === k ? ' on' : ''}" data-kind="${k}">${esc(t('k_' + k))}</button>`).join('');
  if (!state.loaded) { $('#evUpcoming').innerHTML = '<div class="r-skel"></div><div class="r-skel"></div>'; return; }
  const f = e => state.kind === 'all' || e.kind === state.kind;
  const up = state.events.filter(e => !isPast(e) && f(e));
  const past = state.events.filter(e => isPast(e) && e.status !== 'cancelled' && f(e)).reverse();
  $('#evUpcoming').innerHTML = up.length ? up.map(card).join('') : `<p class="cm-empty">${esc(t('eNone'))}</p>`;
  $('#evPast').innerHTML = past.length ? past.slice(0, 12).map(pastCard).join('') : `<p class="cm-empty small">${esc(t('eNoPast'))}</p>`;
}
function renderMine() {
  $('#mineSec').hidden = !auth.session || !state.mine.length;
  $('#myEvents').innerHTML = state.mine.map(s => {
    const e = state.events.find(x => x.id === s.event_id); if (!e) return '';
    const st = sStatus(s), canCancel = st === 'pending' || (st === 'confirmed' && !isPast(e));
    return `<div class="my-row"><div><b>${esc(e.title)}</b><small>${esc(fmt(e.start_date, 'dm'))}${e.start_time ? ' · ' + esc(e.start_time) : ''}${+e.price ? ' · ' + money(e.price) : ''}${s.paid ? ' · ✓ ' + esc(t('evPaid') || 'paid') : ''}</small></div>
      <span class="badge ${st === 'pending' ? 'new' : st}">${esc(t('es_' + st))}</span>
      ${canCancel ? `<button type="button" class="btn-small" data-cancel="${s.id}">${esc(t('cancel'))}</button>` : ''}</div>`;
  }).join('');
}

/* ---------- sign-up ---------- */
const sform = $('#signForm');
async function openSign(id) {
  const e = state.events.find(x => x.id === id); if (!e) return;
  if (!auth.session) { ui.toast(t('eSignInFirst')); return ui.open('in', async () => { await loadMine(); openSign(id); }); }
  state.signFor = e;
  $('#sgFor').textContent = `${e.title} · ${fmt(e.start_date, 'dm')}${e.start_time ? ' · ' + e.start_time : ''} · ${+e.price ? money(e.price) : t('eFree')}`;
  $('#sgLevel').innerHTML = `<option value="">—</option>` + LEVELS.map(l => `<option value="${l}">${esc(t('lv_' + l))}</option>`).join('');
  const p = ui.state.profile || await myProfile().catch(() => null);
  sform.name.value = sform.name.value || (p && p.full_name) || '';
  sform.phone.value = sform.phone.value || (p && p.phone) || '';
  try { const r = await db(`profiles?id=eq.${auth.session.user.id}&select=level`); $('#sgLevel').value = (r[0] && r[0].level) || e.level || ''; } catch {}
  $('#sgError').textContent = '';
  $('#signModal').showModal();
}
sform.addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $('#sgError'), e = state.signFor; err.textContent = '';
  const name = sform.name.value.trim(), phone = sform.phone.value.trim();
  if (name.length < 2) return err.textContent = t('errContact');
  if (phone.replace(/\D/g, '').length < 5) return err.textContent = t('errContact');
  if (!sform.agree.checked) return err.textContent = t('errAgree');
  const btn = sform.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const r = await db('event_signups', { method: 'POST', body: { event_id: e.id, name, phone, level: $('#sgLevel').value || null, notes: sform.notes.value.trim() || null }, prefer: 'return=representation' });
    $('#signModal').close(); sform.notes.value = ''; ui.toast(t('eSignDone'), 'ok');
    if (r && r[0]) fn('notify', { event: 'event_signup', id: r[0].id }).catch(() => {});
    await Promise.all([loadMine(), load()]);
  } catch (x) {
    const m = String(x.code || x.message || '');
    err.textContent = m.includes('PW006') ? t('eErrFull') : m.includes('PW007') ? t('eErrClosed') : m.includes('23505') ? t('eErrDup') : t('errNet');
  }
  btn.disabled = false;
});

/* ---------- clicks ---------- */
document.addEventListener('click', async e => {
  const j = e.target.closest('[data-join]'); if (j) return openSign(j.dataset.join);
  const k = e.target.closest('[data-kind]'); if (k) { state.kind = k.dataset.kind; return render(); }
  const m = e.target.closest('[data-more]'); if (m) { const id = m.dataset.more; state.open.has(id) ? state.open.delete(id) : state.open.add(id); return render(); }
  const c = e.target.closest('[data-cancel]');
  if (c) {
    if (!c.dataset.sure) { c.dataset.sure = 1; c.textContent = t('eCancelQ'); c.classList.add('danger'); return; }
    c.disabled = true;
    try { await rpc('cancel_my_signup', { sid: c.dataset.cancel }); } catch { ui.toast(t('errNet'), 'bad'); }
    await Promise.all([loadMine(), load()]);
  }
});
function fromHash() {
  const m = location.hash.match(/^#e=(.+)$/);
  if (m) { const el = document.getElementById('e-' + decodeURIComponent(m[1])); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2200); } }
  if (location.hash === '#mine' && !$('#mineSec').hidden) $('#mineSec').scrollIntoView({ behavior: 'smooth' });
}
window.addEventListener('hashchange', fromHash);

function applyLang(l) {
  i18n.set(l); document.title = `${t('eTitle')} — Poti Lake Club`; i18n.apply(); render(); renderMine(); ui.refresh();
}
$('.lang').addEventListener('click', e => { const l = e.target.dataset.lang; if (l) applyLang(l); });

const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();
i18n.set(i18n.lang); i18n.apply(); document.title = `${t('eTitle')} — Poti Lake Club`; render();
ui.init({ onSignIn: () => loadMine(), onSignOut: () => loadMine() }).then(async () => { await load(); await loadMine(); fromHash(); });
})();
