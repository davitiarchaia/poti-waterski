/* Owner page — rental equipment catalogue (boards, vests, wetsuits …) with a price per hour each. Loaded after owner-staff.js. */
(() => {
const { db, i18n, esc } = window.PW;
const ui = window.PW.ui;
const $ = s => document.querySelector(s);
const t = k => i18n.t(k);
const reload = () => window.ownerLoad();
const st = { gear: [], loaded: false, busy: false };
const rideLabel = r => r.name_ka || ((t('rides')[r.ride] || [r.ride])[0]);
const sorted = () => [...st.gear].sort((a, b) => a.sort - b.sort || String(a.created_at).localeCompare(String(b.created_at)));

async function fetchGear() {
  try { st.gear = await db('equipment?select=*&order=sort.asc,created_at.asc') || []; st.loaded = true; } catch { st.gear = []; }
}
function rideOptions(S, sel) {
  return [...S.prices].sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100))
    .map(r => `<option value="${esc(r.ride)}" ${r.ride === sel ? 'selected' : ''}>${esc(rideLabel(r))}</option>`).join('');
}
function render(S) {
  const box = $('#gearList'); if (!box || !S) return;
  const rows = sorted();
  const inp = (g, k, max, ph = '') => `<input data-gr="${g.id}" data-k="${k}" maxlength="${max}" value="${esc(g[k] || '')}" placeholder="${esc(ph)}">`;
  box.innerHTML = rows.length ? rows.map((g, i) => `<div class="gear-row${g.active ? '' : ' off'}">
      <div class="gr-names">
        <label><span>${esc(t('svName'))} (ქარ)</span>${inp(g, 'name_ka', 80, t('gearNamePh'))}</label>
        <details class="svc-more"><summary>${esc(t('gearMore'))}</summary>
          <div class="svc-grid">
            <label><span>${esc(t('svName'))} (EN)</span>${inp(g, 'name_en', 80)}</label><label><span>${esc(t('svName'))} (RU)</span>${inp(g, 'name_ru', 80)}</label>
            <label><span>${esc(t('svInfo'))} (EN)</span>${inp(g, 'info_en', 160)}</label><label><span>${esc(t('svInfo'))} (RU)</span>${inp(g, 'info_ru', 160)}</label>
          </div>
        </details>
      </div>
      <div class="gr-info">
        <label><span>${esc(t('svInfo'))} (ქარ)</span>${inp(g, 'info_ka', 160, t('gearInfoPh'))}</label>
        <label><span>${esc(t('gearFor'))}</span><select data-gr="${g.id}" data-k="ride">${rideOptions(S, g.ride)}</select></label>
      </div>
      <label class="money-in"><span>₾</span><input type="number" min="0" max="10000" step="0.5" inputmode="decimal" data-gr="${g.id}" data-k="price" value="${g.price ?? 0}"><small>${esc(t('perHour'))}</small></label>
      <div class="gr-act">
        <label class="tog"><input type="checkbox" data-gr="${g.id}" data-k="active" ${g.active ? 'checked' : ''}> ${esc(t('fActive'))}</label>
        <div class="svc-order"><button type="button" class="btn-small" data-grmove="${g.id}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="up">↑</button><button type="button" class="btn-small" data-grmove="${g.id}" data-dir="1" ${i < rows.length - 1 ? '' : 'disabled'} aria-label="down">↓</button></div>
        <button type="button" class="btn-small" data-grdel="${g.id}">${esc(t('del'))}</button>
      </div>
    </div>`).join('') : `<p class="muted">${esc(t('gearEmpty'))}</p>`;
  $('#saveGear').hidden = !rows.length;
  const fr = $('#gearForm [name=ride]'); if (fr) { const keep = fr.value; fr.innerHTML = rideOptions(S, keep || (S.prices.some(r => r.ride === 'wake') ? 'wake' : '')); }
  // services list: show how many items each service rents out
  for (const el of document.querySelectorAll('[data-gearcount]')) el.textContent = t('gearCount')(st.gear.filter(g => g.ride === el.dataset.gearcount && g.active).length);
}
const val = (id, k) => { const el = $(`[data-gr="${id}"][data-k="${k}"]`); if (!el) return undefined;
  if (k === 'active') return el.checked; if (k === 'price') return el.value === '' ? 0 : Math.min(10000, Math.max(0, +el.value)); if (k === 'ride' || k === 'name_ka') return el.value.trim(); return el.value.trim() || null; };
const KEYS = ['name_ka', 'name_en', 'name_ru', 'info_ka', 'info_en', 'info_ru', 'price', 'ride', 'active'];

document.addEventListener('click', async e => {
  if (e.target.id === 'saveGear') {
    const btn = e.target, er = $('#gearError'); btn.disabled = true; er.textContent = '';
    try {
      for (const g of st.gear) {
        const body = {};
        for (const k of KEYS) { const v = val(g.id, k); const old = k === 'price' ? +g[k] : g[k] ?? null; if (v !== undefined && v !== old) body[k] = v; }
        if (!Object.keys(body).length) continue;
        if ('name_ka' in body && !body.name_ka) throw Object.assign(new Error('name'), { code: 'name' });
        await db(`equipment?id=eq.${g.id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
      }
      btn.textContent = t('saved'); setTimeout(() => btn.textContent = t('save'), 1500);
    } catch (x) { er.textContent = x.code === 'name' ? t('gearErrName') : t('errNet'); }
    btn.disabled = false; await fetchGear(); render(window.ownerState);
    return;
  }
  const m = e.target.closest('[data-grmove]');
  if (m) {
    const rows = sorted(), i = rows.findIndex(g => g.id === m.dataset.grmove), j = i + +m.dataset.dir;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]]; m.disabled = true;
    try { await Promise.all(rows.map((g, k) => g.sort === k + 1 ? null : db(`equipment?id=eq.${g.id}`, { method: 'PATCH', body: { sort: k + 1 }, prefer: 'return=minimal' })).filter(Boolean)); }
    catch { $('#gearError').textContent = t('errNet'); }
    await fetchGear(); return render(window.ownerState);
  }
  const d = e.target.closest('[data-grdel]');
  if (d) {
    if (!d.dataset.sure) { d.dataset.sure = 1; d.textContent = t('delQ'); d.classList.add('danger'); return; }
    d.disabled = true;
    try { await db(`equipment?id=eq.${d.dataset.grdel}`, { method: 'DELETE', prefer: 'return=minimal' }); } catch { $('#gearError').textContent = t('errNet'); }
    await fetchGear(); return render(window.ownerState);
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'gearForm') return;
  e.preventDefault();
  const f = e.target, er = $('#gearFormError'); er.textContent = '';
  const name = f.name_ka.value.trim();
  if (!name) { f.name_ka.focus(); return er.textContent = t('gearErrName'); }
  const body = { name_ka: name, name_en: f.name_en.value.trim() || null, name_ru: f.name_ru.value.trim() || null, info_ka: f.info_ka.value.trim() || null,
    price: f.price.value === '' ? 0 : Math.min(10000, Math.max(0, +f.price.value)), ride: f.ride.value, active: true,
    sort: Math.max(0, ...st.gear.map(g => g.sort || 0)) + 1 };
  const btn = f.querySelector('[type=submit]'); btn.disabled = true;
  try { await db('equipment', { method: 'POST', body, prefer: 'return=minimal' }); const r = f.ride.value; f.reset(); f.ride.value = r; ui.toast(t('gearAdded'), 'ok'); }
  catch { er.textContent = t('errNet'); }
  btn.disabled = false; await fetchGear(); render(window.ownerState);
});

const prev = window.ownerExtra;
window.ownerExtra = { render(S) { if (prev) prev.render(S); render(S); fetchGear().then(() => render(window.ownerState)); } };
})();
