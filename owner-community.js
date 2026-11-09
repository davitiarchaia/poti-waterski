/* Owner page — events & tournaments, rider levels. Loaded after owner.js; the database only lets the owner change these. */
(() => {
const { auth, db, rpc, fn, i18n, fmt, todayIso, esc } = window.PW;
const ui = window.PW.ui, CM = window.CM, LEVELS = window.LEVELS, DISC = window.DISCIPLINES, KINDS = window.EVENT_KINDS;
const $ = s => document.querySelector(s);
const t = k => i18n.t(k);
const state = { events: [], signups: [], profiles: [], open: null, edit: null, q: '', loaded: false };
const money = v => '₾' + (Math.round((+v || 0) * 100) / 100).toLocaleString('ka-GE', { maximumFractionDigits: 2 });
const notify = (event, id) => fn('notify', { event, id }).catch(() => {});
const isOwner = () => ui.state.profile && ui.state.profile.role === 'owner';
const secEv = $('section.view[data-view=events]'), secRd = $('section.view[data-view=riders]');

async function load() {
  if (!auth.session || !isOwner()) return;
  try {
    const [ev, sg, pr] = await Promise.all([
      db('events?select=*&order=start_date.desc'),
      db('event_signups?select=*&order=created_at.asc'),
      db('profiles?select=id,username,full_name,phone,role,level,level_verified,disciplines,is_public,created_at&order=created_at.desc'),
    ]);
    state.events = ev || []; state.signups = sg || []; state.profiles = pr || [];
  } catch { /* keep previous */ }
  state.loaded = true; render();
}
const live = id => state.signups.filter(s => s.event_id === id && s.status !== 'cancelled');
const prof = id => state.profiles.find(p => p.id === id);

/* ---------- events list / detail ---------- */
const form = $('#evForm');
function opts(sel, list, label, anyKey) {
  const keep = sel.value;
  sel.innerHTML = (anyKey ? `<option value="">${esc(t(anyKey))}</option>` : '') + list.map(v => `<option value="${v}">${esc(t(label + v))}</option>`).join('');
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
}
function renderForm() {
  opts($('#evKind'), KINDS, 'k_'); opts($('#evStatus'), ['published', 'draft', 'cancelled'], 'st_');
  opts($('#evLevel'), LEVELS, 'lv_', 'evAny'); opts($('#evDisc'), DISC, 'd_', 'evAny');
  $('#evFormTitle').textContent = t(state.edit ? 'evEdit' : 'evNew'); $('#evCancel').hidden = !state.edit;
}
function fill(e) {
  form.title.value = e ? e.title : ''; form.kind.value = e ? e.kind : 'tournament'; form.status.value = e ? e.status : 'published';
  form.start_date.value = e ? e.start_date : ''; form.end_date.value = e && e.end_date || ''; form.start_time.value = e && e.start_time || '';
  form.price.value = e ? +e.price || '' : ''; form.capacity.value = e && e.capacity || ''; form.level.value = e && e.level || '';
  form.discipline.value = e && e.discipline || ''; form.description.value = e && e.description || ''; $('#evError').textContent = '';
}
function render() {
  renderForm();
  $('#cntEvents').textContent = state.signups.filter(s => s.status === 'pending').length || '';
  renderPane(); renderRiders();
}
function renderPane() {
  const pane = $('#evPane');
  if (state.open) return renderDetail(pane);
  if (!state.events.length) return pane.innerHTML = `<p class="inbox-empty">${esc(t('evNone'))}</p>`;
  pane.innerHTML = `<div class="ev-o-list">${state.events.map(e => {
    const l = live(e.id), pend = l.filter(s => s.status === 'pending').length, conf = l.filter(s => s.status === 'confirmed').length;
    const d = new Date(e.start_date + 'T12:00');
    return `<article class="ev-o${state.edit === e.id ? ' editing' : ''}">
      <div class="ev-date"><b>${d.getDate()}</b><span>${esc(fmt(e.start_date, 'mo'))}</span></div>
      <div><div class="ev-tags">${CM.kindTag(e.kind)}<span class="ostate ${e.status === 'published' ? 'oLive' : 'oHidden'}">${esc(t('st_' + e.status))}</span>${e.results_published ? '<span class="d-tag">🏆</span>' : ''}</div>
        <h3>${esc(e.title)}</h3>
        <small>${+e.price ? money(e.price) : esc(t('eFree'))} · ${e.capacity ? `${l.length}/${e.capacity}` : l.length} · ✓ ${conf}${pend ? ` · <b style="color:var(--orange)">● ${pend} ${esc(t('es_pending'))}</b>` : ''}</small></div>
      <div class="oc-actions"><button type="button" class="btn-small primary" data-evopen="${e.id}">${esc(t('evOpen'))}</button>
        <button type="button" class="btn-small" data-evedit="${e.id}">${esc(t('edit'))}</button>
        <button type="button" class="btn-small" data-evdel="${e.id}">${esc(t('del'))}</button></div>
    </article>`;
  }).join('')}</div>`;
}
function renderDetail(pane) {
  const e = state.events.find(x => x.id === state.open);
  if (!e) { state.open = null; return renderPane(); }
  const rows = state.signups.filter(s => s.event_id === e.id).sort((a, b) => (a.status === 'cancelled') - (b.status === 'cancelled') || (a.place || 99) - (b.place || 99));
  const st = s => s.status === 'cancelled' && s.cancelled_by === 'owner' ? 'rejected' : s.status;
  const badge = s => `<span class="badge ${st(s) === 'pending' ? 'new' : st(s)}">${esc(t('es_' + st(s)))}</span>`;
  pane.innerHTML = `<div class="panel">
    <button type="button" class="btn-link inline" id="evBack">${esc(t('evBack'))}</button>
    <div class="sg-head"><div><div class="ev-tags">${CM.kindTag(e.kind)}</div><h2>${esc(e.title)}</h2>
      <p class="muted">${esc(fmt(e.start_date, 'long'))}${e.start_time ? ' · ' + esc(e.start_time) : ''} · ${+e.price ? money(e.price) : esc(t('eFree'))}${e.capacity ? ` · ${live(e.id).length}/${e.capacity}` : ''}</p></div>
      <button type="button" class="btn-small${e.results_published ? '' : ' primary'}" id="evPub">${esc(t(e.results_published ? 'evHideRes' : 'evPublishRes'))}</button></div>
    <h3 class="sub-h first">${esc(t('evSignups'))}</h3>
    ${rows.length ? `<div class="tbl-wrap"><table class="sg-table"><thead><tr><th>${esc(t('name'))}</th><th>${esc(t('levelLabel'))}</th><th></th><th>${esc(t('evPaid'))}</th><th>${esc(t('evPlace'))}</th><th>${esc(t('evResult'))}</th><th></th></tr></thead><tbody>
      ${rows.map(s => { const p = prof(s.user_id); return `<tr data-sid="${s.id}">
        <td><b>${esc(s.name)}</b>${p && !s.by_owner ? ` <small class="muted">@${esc(p.username)}</small>` : ''}<br><a href="tel:${esc(s.phone.replace(/\s/g, ''))}">${esc(s.phone)}</a>${s.notes ? `<br><small class="muted">${esc(s.notes)}</small>` : ''}</td>
        <td>${s.level ? CM.levelBadge(s.level) : '—'}</td><td>${badge(s)}</td>
        <td><input type="checkbox" data-paid="${s.id}"${s.paid ? ' checked' : ''}${s.status === 'cancelled' ? ' disabled' : ''} aria-label="${esc(t('evPaid'))}"></td>
        <td><input class="mini place" type="number" min="1" max="999" data-place="${s.id}" value="${s.place || ''}"${s.status !== 'confirmed' ? ' disabled' : ''}></td>
        <td><input class="mini result" maxlength="80" data-result="${s.id}" value="${esc(s.result || '')}" placeholder="${esc(t('evResultPh'))}"${s.status !== 'confirmed' ? ' disabled' : ''}></td>
        <td class="oc-actions">${s.status === 'pending' ? `<button type="button" class="btn-small primary" data-sgok="${s.id}">✓ ${esc(t('evConfirm'))}</button><button type="button" class="btn-small" data-sgno="${s.id}">${esc(t('evReject'))}</button>`
          : s.status === 'confirmed' ? `<button type="button" class="btn-small" data-sgno="${s.id}">${esc(t('cancel'))}</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="form-actions"><button type="button" class="btn-small primary big" id="evSaveRes">${esc(t('evSaveRes'))}</button></div>`
      : `<p class="inbox-empty">${esc(t('evNoSignups'))}</p>`}
    <h3 class="sub-h">${esc(t('evAddPerson'))}</h3>
    <form class="row add-person" id="evAdd" novalidate>
      <input name="name" maxlength="80" placeholder="${esc(t('name'))}" required>
      <input name="phone" type="tel" maxlength="30" placeholder="${esc(t('phone'))}" required>
      <select name="level"><option value="">—</option>${LEVELS.map(l => `<option value="${l}">${esc(t('lv_' + l))}</option>`).join('')}</select>
      <button class="btn-small primary" type="submit">+</button>
    </form>
    <p class="form-error" id="sgErr" role="alert"></p>
  </div>`;
}

async function patchSign(id, body) { return db(`event_signups?id=eq.${id}`, { method: 'PATCH', body, prefer: 'return=minimal' }); }
form.addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $('#evError'); err.textContent = '';
  const title = form.title.value.trim();
  if (title.length < 2) return err.textContent = t('errTitle');
  if (!form.start_date.value) return err.textContent = t('errDates');
  if (form.end_date.value && form.end_date.value < form.start_date.value) return err.textContent = t('errDates');
  const body = { title, kind: form.kind.value, status: form.status.value, start_date: form.start_date.value, end_date: form.end_date.value || null,
    start_time: form.start_time.value ? form.start_time.value.slice(0, 5) : null, price: +form.price.value || 0,
    capacity: form.capacity.value ? Math.round(+form.capacity.value) : null, level: form.level.value || null, discipline: form.discipline.value || null,
    description: form.description.value.trim() || null };
  const btn = form.querySelector('[type=submit]'); btn.disabled = true;
  try {
    if (state.edit) await db(`events?id=eq.${state.edit}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    else await db('events', { method: 'POST', body, prefer: 'return=minimal' });
    state.edit = null; fill(null); ui.toast(t('saved'), 'ok'); await load();
  } catch { err.textContent = t('errNet'); }
  btn.disabled = false;
});
$('#evCancel').addEventListener('click', () => { state.edit = null; fill(null); render(); });

secEv.addEventListener('click', async e => {
  const g = (a) => e.target.closest(`[${a}]`);
  let b;
  if ((b = g('data-evopen'))) { state.open = b.dataset.evopen; return renderPane(); }
  if (e.target.id === 'evBack') { state.open = null; return renderPane(); }
  if ((b = g('data-evedit'))) { state.edit = b.dataset.evedit; fill(state.events.find(x => x.id === state.edit)); render(); return form.scrollIntoView({ behavior: 'smooth' }); }
  if ((b = g('data-evdel'))) {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = t('evDelQ'); b.classList.add('danger'); return; }
    b.disabled = true; try { await db(`events?id=eq.${b.dataset.evdel}`, { method: 'DELETE', prefer: 'return=minimal' }); } catch { ui.toast(t('errNet'), 'bad'); }
    return load();
  }
  if (e.target.id === 'evPub') {
    const ev = state.events.find(x => x.id === state.open);
    try { await db(`events?id=eq.${ev.id}`, { method: 'PATCH', body: { results_published: !ev.results_published }, prefer: 'return=minimal' }); } catch { ui.toast(t('errNet'), 'bad'); }
    return load();
  }
  if ((b = g('data-sgok'))) {
    b.disabled = true; const s = state.signups.find(x => x.id === b.dataset.sgok);
    try { await patchSign(s.id, { status: 'confirmed', decided_at: new Date().toISOString(), cancelled_by: null }); if (!s.by_owner) notify('event_decided', s.id); } catch { ui.toast(t('errNet'), 'bad'); }
    return load();
  }
  if ((b = g('data-sgno'))) {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = t('cancelQ'); b.classList.add('danger'); return; }
    b.disabled = true; const s = state.signups.find(x => x.id === b.dataset.sgno), wasPending = s.status === 'pending';
    try { await patchSign(s.id, { status: 'cancelled', cancelled_by: 'owner', decided_at: new Date().toISOString(), place: null }); if (wasPending && !s.by_owner) notify('event_decided', s.id); } catch { ui.toast(t('errNet'), 'bad'); }
    return load();
  }
  if (e.target.id === 'evSaveRes') {
    const btn = e.target; btn.disabled = true;
    const ups = [...secEv.querySelectorAll('[data-place]')].filter(i => !i.disabled).map(i => {
      const id = i.dataset.place, r = secEv.querySelector(`[data-result="${id}"]`), s = state.signups.find(x => x.id === id);
      const place = i.value ? Math.max(1, Math.round(+i.value)) : null, result = r.value.trim() || null;
      return (place !== s.place || result !== s.result) ? patchSign(id, { place, result }) : null;
    }).filter(Boolean);
    try { await Promise.all(ups); ui.toast(t('evResSaved'), 'ok'); } catch { ui.toast(t('errNet'), 'bad'); }
    return load();
  }
});
secEv.addEventListener('change', async e => {
  const p = e.target.closest('[data-paid]');
  if (p) { try { await patchSign(p.dataset.paid, { paid: p.checked }); } catch { p.checked = !p.checked; ui.toast(t('errNet'), 'bad'); } load(); }
});
secEv.addEventListener('submit', async e => {
  if (e.target.id !== 'evAdd') return;
  e.preventDefault();
  const f = e.target, err = $('#sgErr'); err.textContent = '';
  const name = f.name.value.trim(), phone = f.phone.value.trim();
  if (name.length < 2 || phone.replace(/\D/g, '').length < 5) return err.textContent = t('errContact');
  try {
    const r = await db('event_signups', { method: 'POST', body: { event_id: state.open, name, phone, level: f.level.value || null }, prefer: 'return=representation' });
    if (r && r[0]) await patchSign(r[0].id, { status: 'confirmed', decided_at: new Date().toISOString() });
    await load();
  } catch (x) { const m = String(x.code || x.message || ''); err.textContent = m.includes('PW006') ? t('eErrFull') : m.includes('PW007') ? t('eErrClosed') : t('errNet'); }
});

/* ---------- rider levels ---------- */
function renderRiders() {
  const q = state.q.trim().toLowerCase();
  const list = state.profiles.filter(p => p.role !== 'owner')
    .filter(p => !q || (p.full_name || '').toLowerCase().includes(q) || p.username.toLowerCase().includes(q) || (p.phone || '').includes(q));
  $('#raList').innerHTML = list.length ? list.map(p => `<div class="ra-row" data-pid="${p.id}">
      ${CM.avatar(p.full_name || p.username, p.username)}
      <div><b>${esc(p.full_name || p.username)}</b> <small>@${esc(p.username)}${p.phone ? ' · ' + esc(p.phone) : ''}</small><div class="r-tags">${CM.discTags(p.disciplines)}</div></div>
      <span class="d-tag${p.is_public ? '' : ' soft'}">${esc(t(p.is_public ? 'rvPublic' : 'rvPrivate'))}</span>
      <select class="mini" data-lvset="${p.id}" aria-label="${esc(t('rvSet'))}"><option value="">—</option>${LEVELS.map(l => `<option value="${l}"${p.level === l ? ' selected' : ''}>${esc(t('lv_' + l))}</option>`).join('')}</select>
      <button type="button" class="btn-small${p.level_verified ? '' : ' primary'}" data-lvver="${p.id}"${p.level ? '' : ' disabled'}>${p.level_verified ? '✓ ' + esc(t('verifiedShort')) : esc(t('rvVerify'))}</button>
    </div>`).join('') : `<p class="inbox-empty">${esc(t('noData'))}</p>`;
}
secRd.addEventListener('change', async e => {
  const s = e.target.closest('[data-lvset]'); if (!s) return;
  try { await rpc('owner_set_level', { p_user: s.dataset.lvset, p_level: s.value || null, p_verified: false }); } catch { ui.toast(t('errNet'), 'bad'); }
  load();
});
secRd.addEventListener('click', async e => {
  const b = e.target.closest('[data-lvver]'); if (!b) return;
  const p = prof(b.dataset.lvver); b.disabled = true;
  try { await rpc('owner_set_level', { p_user: p.id, p_level: p.level, p_verified: !p.level_verified }); } catch { ui.toast(t('errNet'), 'bad'); }
  load();
});
$('#raSearch').addEventListener('input', e => { state.q = e.target.value; renderRiders(); });

/* load when one of the two tabs becomes visible; also keep the pending count fresh */
const watch = new MutationObserver(() => { if (!secEv.hidden || !secRd.hidden) load(); });
watch.observe(secEv, { attributes: true, attributeFilter: ['hidden'] });
watch.observe(secRd, { attributes: true, attributeFilter: ['hidden'] });
$('.lang').addEventListener('click', e => { if (e.target.dataset.lang) setTimeout(render, 0); });
(function poll() { setTimeout(async () => { if (isOwner()) await load(); poll(); }, isOwner() && state.loaded ? 60000 : 3000); })();
})();
