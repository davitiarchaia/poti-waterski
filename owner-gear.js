/* Owner page — rental equipment lives inside each service row (name + price per hour each). Loaded after owner-staff.js. */
(() => {
const { db, i18n, esc } = window.PW;
const ui = window.PW.ui;
const $ = s => document.querySelector(s);
const t = k => i18n.t(k);
const st = { gear: [] };
const sorted = ride => st.gear.filter(g => g.ride === ride).sort((a, b) => a.sort - b.sort || String(a.created_at).localeCompare(String(b.created_at)));

async function fetchGear() { try { st.gear = await db('equipment?select=*&order=sort.asc,created_at.asc') || []; } catch { st.gear = []; } }

const inp = (g, k, max, ph = '') => `<input data-gr="${g.id}" data-k="${k}" maxlength="${max}" value="${esc(g[k] || '')}" placeholder="${esc(ph)}">`;
const row = g => `<div class="sg-item${g.active ? '' : ' off'}">
  <div class="sg-row">
    <input data-gr="${g.id}" data-k="name_ka" maxlength="80" value="${esc(g.name_ka || '')}" placeholder="${esc(t('sgName'))}" aria-label="${esc(t('sgName'))}">
    <input data-gr="${g.id}" data-k="price" type="number" min="0" max="10000" step="0.5" inputmode="decimal" value="${g.price ?? 0}" aria-label="${esc(t('sgPrice'))}" title="${esc(t('sgPrice'))}">
    <label class="tog" title="${esc(t('fActive'))}"><input type="checkbox" data-gr="${g.id}" data-k="active" ${g.active ? 'checked' : ''}></label>
    <button type="button" class="btn-small" data-grdel="${g.id}" aria-label="${esc(t('del'))}">✕</button>
  </div>
  <details class="sg-more"><summary>EN / RU</summary><div class="sg-extra">${inp(g, 'name_en', 80, 'Name (EN)')}${inp(g, 'name_ru', 80, 'Название (RU)')}${inp(g, 'info_ka', 160, t('svInfo'))}</div></details>
</div>`;
const draft = () => `<div class="sg-item"><div class="sg-row" data-draft>
  <input name="gn" maxlength="80" placeholder="${esc(t('sgName'))}" aria-label="${esc(t('sgName'))}"><input name="gp" type="number" min="0" max="10000" step="0.5" inputmode="decimal" placeholder="${esc(t('sgPrice'))}" aria-label="${esc(t('sgPrice'))}">
  <span></span><button type="button" class="btn-small" data-grx aria-label="remove">✕</button></div></div>`;

function render() {
  for (const box of document.querySelectorAll('[data-gearbox]')) {
    const ride = box.dataset.gearbox;
    box.innerHTML = `<div class="sg-head"><b>${esc(t('sgTitle'))}</b><button type="button" class="btn-small" data-gearadd="${esc(ride)}">${esc(t('sgAdd'))}</button></div><div class="sg-list">${sorted(ride).map(row).join('')}</div>`;
  }
}
const val = (id, k) => { const el = $(`[data-gr="${id}"][data-k="${k}"]`); if (!el) return undefined;
  if (k === 'active') return el.checked; if (k === 'price') return el.value === '' ? 0 : Math.min(10000, Math.max(0, +el.value)); if (k === 'name_ka') return el.value.trim(); return el.value.trim() || null; };
const KEYS = ['name_ka', 'name_en', 'name_ru', 'info_ka', 'price', 'active'];

// called by the "Save" button of the services list before it reloads
window.ownerGearSave = async () => {
  const jobs = [];
  for (const g of st.gear) {
    const body = {};
    for (const k of KEYS) { const v = val(g.id, k); const old = k === 'price' ? +g[k] : g[k] ?? null; if (v !== undefined && v !== old) body[k] = v; }
    if (!Object.keys(body).length) continue;
    if ('name_ka' in body && !body.name_ka) throw Object.assign(new Error('name'), { code: 'name' });
    jobs.push(db(`equipment?id=eq.${g.id}`, { method: 'PATCH', body, prefer: 'return=minimal' }));
  }
  const add = [];
  for (const box of document.querySelectorAll('[data-gearbox]')) {
    let n = Math.max(0, ...sorted(box.dataset.gearbox).map(g => g.sort || 0));
    for (const r of box.querySelectorAll('[data-draft]')) {
      const name = r.querySelector('[name=gn]').value.trim(); if (!name) continue;
      add.push({ ride: box.dataset.gearbox, name_ka: name, price: Math.min(10000, Math.max(0, +r.querySelector('[name=gp]').value || 0)), per_rider: true, active: true, sort: ++n });
    }
  }
  if (add.length) jobs.push(db('equipment', { method: 'POST', body: add, prefer: 'return=minimal' }));
  await Promise.all(jobs); await fetchGear();
};

document.addEventListener('click', async e => {
  const a = e.target.closest('[data-gearadd]');
  if (a) { const list = a.closest('[data-gearbox]').querySelector('.sg-list'); list.insertAdjacentHTML('beforeend', draft()); list.lastElementChild.querySelector('input').focus(); return; }
  if (e.target.closest('[data-grx]')) return e.target.closest('.sg-item').remove();
  const d = e.target.closest('[data-grdel]');
  if (d) {
    if (!d.dataset.sure) { d.dataset.sure = 1; d.textContent = t('delQ'); d.classList.add('danger'); return; }
    d.disabled = true;
    try { await db(`equipment?id=eq.${d.dataset.grdel}`, { method: 'DELETE', prefer: 'return=minimal' }); } catch { $('#priceError').textContent = t('errNet'); }
    await fetchGear(); render();
  }
});

const prev = window.ownerExtra;
window.ownerExtra = { render(S) { if (prev) prev.render(S); render(); fetchGear().then(() => { if (!document.querySelector('[data-draft]')) render(); }); } };
})();
