/* Riders page — public rider directory, levels, own profile. */
(() => {
const { auth, db, rpc, i18n, fmt, esc } = window.PW;
const ui = window.PW.ui, CM = window.CM, LEVELS = window.LEVELS, DISC = window.DISCIPLINES;
const $ = s => document.querySelector(s);
const t = k => i18n.t(k);
i18n.init(window.DICT, ['ka', 'en', 'ru']);

const state = { riders: [], lv: 'all', d: 'all', q: '', me: null, loaded: false };

async function load() {
  try { state.riders = await rpc('riders', {}) || []; } catch { state.riders = []; }
  state.loaded = true; render();
  openFromHash();
}
async function loadMe() {
  state.me = null;
  if (auth.session) {
    try { const r = await db(`profiles?id=eq.${auth.session.user.id}&select=id,username,full_name,level,level_verified,disciplines,bio,is_public,role`); state.me = r[0] || null; } catch {}
  }
  $('#myProfileBtn').textContent = t(state.me && (state.me.level || state.me.is_public) ? 'rMine' : 'rCreate');
}

/* ---------- render ---------- */
const score = r => r.wins * 1000 + r.podiums * 100 + r.events * 10 + r.hours;
function statRow(r) {
  return `<ul class="r-stats">
    <li><b>${r.hours}</b><span>${esc(t('rHours'))}</span></li>
    <li><b>${r.events}</b><span>${esc(t('rEvents'))}</span></li>
    <li><b>${r.podiums}</b><span>${esc(t('rPodiums'))}</span></li>
  </ul>`;
}
function card(r) {
  return `<button type="button" class="r-card" data-u="${esc(r.username)}">
    <div class="r-head">${CM.avatar(r.display_name, r.username)}<div class="r-id"><b>${esc(r.display_name)}</b><small>@${esc(r.username)}</small></div>
      ${r.wins ? `<span class="r-cup" title="${esc(t('rWins'))}">🏆 ${r.wins}</span>` : ''}</div>
    <div class="r-tags">${CM.levelBadge(r.level, r.level_verified)}${CM.discTags(r.disciplines)}</div>
    ${statRow(r)}
  </button>`;
}
function render() {
  // chips
  $('#lvChips').innerHTML = ['all', ...LEVELS].map(l => `<button type="button" class="chip${state.lv === l ? ' on' : ''}" data-lv="${l}">${esc(l === 'all' ? t('rAll') : t('lv_' + l))}</button>`).join('');
  $('#dChips').innerHTML = ['all', ...DISC].map(d => `<button type="button" class="chip soft${state.d === d ? ' on' : ''}" data-d="${d}">${esc(d === 'all' ? t('rAll') : t('d_' + d))}</button>`).join('');
  // level guide
  $('#lvGuide').innerHTML = LEVELS.map((l, i) => `<article class="lv-card"><span class="lv-step">${i + 1}</span>${CM.levelBadge(l)}<p>${esc(t('lvd_' + l))}</p>
    <small class="muted">${state.riders.filter(r => r.level === l).length} ${esc(t('navRiders').toLowerCase())}</small></article>`).join('');
  if (!state.loaded) { $('#riderGrid').innerHTML = '<div class="r-skel"></div><div class="r-skel"></div><div class="r-skel"></div>'; return; }
  // top 3
  const top = state.riders.filter(r => score(r) > 0).sort((a, b) => score(b) - score(a)).slice(0, 3);
  $('#topSec').hidden = top.length < 1;
  $('#podium').innerHTML = top.map((r, i) => `<button type="button" class="pod pod-${i + 1}" data-u="${esc(r.username)}">
    <span class="pod-medal">${['🥇', '🥈', '🥉'][i]}</span>${CM.avatar(r.display_name, r.username, 'lg')}
    <b>${esc(r.display_name)}</b>${CM.levelBadge(r.level, r.level_verified)}
    <small>${r.wins ? `🏆 ${r.wins} · ` : ''}${r.podiums ? `${r.podiums} ${esc(t('rPodiums'))} · ` : ''}${r.hours} ${esc(t('rHours'))}</small></button>`).join('');
  // grid
  const q = state.q.trim().toLowerCase();
  const list = state.riders
    .filter(r => state.lv === 'all' || r.level === state.lv)
    .filter(r => state.d === 'all' || (r.disciplines || []).includes(state.d))
    .filter(r => !q || r.display_name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q))
    .sort((a, b) => score(b) - score(a) || a.display_name.localeCompare(b.display_name));
  $('#riderGrid').innerHTML = list.length ? list.map(card).join('')
    : `<p class="cm-empty">${esc(state.riders.length ? t('rNoMatch') : t('rNone'))}</p>`;
}

/* ---------- rider detail ---------- */
async function openRider(u) {
  const r = state.riders.find(x => x.username === u);
  if (!r) return;
  const m = $('#riderModal');
  const head = `<div class="rm-top">${CM.avatar(r.display_name, r.username, 'xl')}
      <div><h2 id="rmName">${esc(r.display_name)}</h2><p class="muted">@${esc(r.username)} · ${esc(t('rSince'))} ${esc(fmt(r.member_since, 'month'))}</p>
      <div class="r-tags">${CM.levelBadge(r.level, r.level_verified)}${CM.discTags(r.disciplines)}</div></div></div>
    ${r.level_verified ? `<p class="rm-ver">✓ ${esc(t('verified'))}</p>` : ''}
    ${r.bio ? `<p class="rm-bio">${esc(r.bio)}</p>` : ''}
    <ul class="r-stats big">
      <li><b>${r.hours}</b><span>${esc(t('rHours'))}</span></li><li><b>${r.events}</b><span>${esc(t('rEvents'))}</span></li>
      <li><b>${r.podiums}</b><span>${esc(t('rPodiums'))}</span></li><li><b>${r.wins}</b><span>${esc(t('rWins'))}</span></li></ul>
    <h3 class="rm-h">${esc(t('rResults'))}</h3>`;
  $('#riderView').innerHTML = head + '<div class="rm-res"><div class="r-skel thin"></div></div>';
  if (!m.open) m.showModal();
  history.replaceState(null, '', '#u=' + encodeURIComponent(u));
  let res = [];
  try { res = await rpc('rider_results', { uname: u }) || []; } catch {}
  const medal = p => p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : p ? `#${p}` : '—';
  $('#riderView .rm-res').innerHTML = res.length ? res.map(x => `<a class="rm-row" href="events.html#e=${esc(x.event_id)}">
      <span class="rm-place">${medal(x.place)}</span><span><b>${esc(x.title)}</b><small>${CM.kindTag(x.kind)} ${esc(fmt(x.start_date, 'dm'))}${x.result ? ' · ' + esc(x.result) : ''}</small></span></a>`).join('')
    : `<p class="muted">${esc(t('rNoResults'))}</p>`;
}
$('#riderModal').addEventListener('close', () => { if (location.hash.startsWith('#u=')) history.replaceState(null, '', location.pathname); });
function openFromHash() {
  const m = location.hash.match(/^#u=(.+)$/);
  if (m) openRider(decodeURIComponent(m[1]));
  if (location.hash === '#me') { history.replaceState(null, '', location.pathname); openMine(); }
}

/* ---------- own profile ---------- */
const form = $('#riderForm');
function fillForm() {
  const me = state.me || {};
  $('#pfLevel').innerHTML = `<option value="">${esc(t('lvNone'))}</option>` + LEVELS.map(l => `<option value="${l}">${esc(t('lv_' + l))}</option>`).join('');
  $('#pfLevel').value = me.level || '';
  $('#pfDisc').innerHTML = DISC.map(d => `<label class="d-pick"><input type="checkbox" name="disc" value="${d}"${(me.disciplines || []).includes(d) ? ' checked' : ''}> <span>${esc(t('d_' + d))}</span></label>`).join('');
  form.bio.value = me.bio || '';
  const fresh = !me.level && !me.bio && !(me.disciplines || []).length;
  form.is_public.checked = me.is_public || fresh;   // a brand-new profile defaults to public
  $('#pfVerify').hidden = !me.level_verified;
  $('#pfError').textContent = '';
}
async function openMine() {
  if (!auth.session) return ui.open('in', async () => { await loadMe(); openMine(); });
  await loadMe(); fillForm(); $('#pfModal').showModal();
}
$('#myProfileBtn').addEventListener('click', openMine);
form.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = form.querySelector('[type=submit]'); btn.disabled = true; $('#pfError').textContent = '';
  const body = { level: $('#pfLevel').value || null, disciplines: [...form.querySelectorAll('[name=disc]:checked')].map(x => x.value),
    bio: form.bio.value.trim() || null, is_public: form.is_public.checked };
  try {
    await db(`profiles?id=eq.${auth.session.user.id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    $('#pfModal').close(); ui.toast(t(body.is_public ? 'pfSaved' : 'pfHidden'), 'ok');
    await Promise.all([loadMe(), load()]);
  } catch { $('#pfError').textContent = t('errNet'); }
  btn.disabled = false;
});

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const c = e.target.closest('[data-u]'); if (c) return openRider(c.dataset.u);
  const l = e.target.closest('[data-lv]'); if (l) { state.lv = l.dataset.lv; return render(); }
  const d = e.target.closest('[data-d]'); if (d) { state.d = d.dataset.d; return render(); }
});
$('#rSearch').addEventListener('input', e => { state.q = e.target.value; render(); });
window.addEventListener('hashchange', openFromHash);

function applyLang(l) {
  i18n.set(l); document.title = `${t('navRiders')} — Poti Waterski`; i18n.apply(); render(); ui.refresh(); loadMe();
  if ($('#riderModal').open) { const m = location.hash.match(/^#u=(.+)$/); if (m) openRider(decodeURIComponent(m[1])); }
}
$('.lang').addEventListener('click', e => { const l = e.target.dataset.lang; if (l) applyLang(l); });

const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();
i18n.set(i18n.lang); i18n.apply(); document.title = `${t('navRiders')} — Poti Waterski`; render();
ui.init({ onSignIn: () => loadMe(), onSignOut: () => loadMe() }).then(loadMe);
load();
})();
