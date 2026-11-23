/* Owner page — STAFF: employee records, their documents (private files) and a monthly salary calculation
   (gross → pension 2% → income tax → net). Loaded after owner-staff.js. */
(() => {
const { db, token, i18n, fmt, iso, todayIso, esc } = window.PW;
const ui = window.PW.ui;
const $ = s => document.querySelector(s);
const t = k => i18n.t(k);
const S = () => window.ownerState;
const money = v => '₾' + (Math.round((+v || 0) * 100) / 100).toLocaleString('ka-GE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BUCKET = 'staff-files', MAXF = 20 * 1024 * 1024;
const em = { list: [], files: [], edit: null, month: 0, loaded: false };
const form = $('#emForm');
if (!form) return;

async function loadEmployees() {
  try {
    const [l, f] = await Promise.all([db('employees?select=*&order=active.desc,full_name.asc'), db('employee_files?select=*&order=created_at.asc')]);
    em.list = l || []; em.files = f || []; em.loaded = true;
  } catch { em.list = em.list || []; }
  render();
}

/* ---------- pay maths (Georgia): pension 2% from gross, income tax from (gross − pension) ---------- */
function hoursOf(e, m0) {
  const st = S(); if (!st || !(e.coach_id || e.driver_id)) return 0;
  const a = iso(m0), z = iso(new Date(m0.getFullYear(), m0.getMonth() + 1, 0)), today = todayIso();
  const rows = st.bookings.filter(b => b.status === 'confirmed' && b.date >= a && b.date <= z && b.date <= today
    && (e.coach_id ? b.coach_id === e.coach_id : b.driver_id === e.driver_id));
  return rows.length / 4;
}
function rateOf(e) {
  const st = S(); if (!st) return 0;
  const x = e.coach_id ? st.coaches.find(c => c.id === e.coach_id) : e.driver_id ? st.drivers.find(d => d.id === e.driver_id) : null;
  return x && x.pay_rate != null ? +x.pay_rate : 0;
}
function calc(e, m0) {
  const hours = hoursOf(e, m0), amount = (+e.monthly_salary || 0) + hours * rateOf(e);
  const p = e.pension ? 0.02 : 0, tx = (+e.income_tax_pct || 0) / 100;
  const gross = e.salary_is_net ? amount / ((1 - p) * (1 - tx) || 1) : amount;
  const pension = gross * p, tax = (gross - pension) * tx, net = gross - pension - tax;
  return { hours, gross, pension, tax, net, cost: gross };
}

/* ---------- list ---------- */
const linkName = e => {
  const st = S(); if (!st) return '';
  if (e.coach_id) { const c = st.coaches.find(x => x.id === e.coach_id); return c ? `🏄 ${c.name}` : ''; }
  if (e.driver_id) { const d = st.drivers.find(x => x.id === e.driver_id); return d ? `🚤 ${d.name}` : ''; }
  return '';
};
function detailHtml(e) {
  const st = S(), c = calc(e, new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const row = (k, v) => v ? `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>` : '';
  const files = em.files.filter(f => f.employee_id === e.id);
  return `<div class="em-detail"><dl>
    ${row('emPosition', e.position)}${row('phone', e.phone)}${row('email', e.email)}${row('emPid', e.personal_id)}
    ${row('birthDate', e.birth_date && fmt(e.birth_date, 'short'))}${row('emStart', e.start_date && fmt(e.start_date, 'short'))}
    ${row('emAddress', e.address)}${row('emBank', e.bank_account)}${row('emLink', linkName(e))}
    ${row('emSalary', +e.monthly_salary ? money(e.monthly_salary) + (e.salary_is_net ? ` (${t('emNet').toLowerCase()})` : '') : '')}
    ${row('emTax', e.income_tax_pct != null ? e.income_tax_pct + '%' : '')}${row('emPensionEmp', e.pension ? '✓' : '✗')}
    ${row('emNet', money(c.net))}${row('emNotes', e.notes)}</dl>
    <h4 class="sub-h">${esc(t('emFiles'))}</h4>
    ${files.length ? `<ul class="em-flist">${files.map(f => `<li><button type="button" class="btn-link" data-emopen="${f.id}">📄 ${esc(f.name)}</button><small class="muted">${f.size ? sizeTxt(f.size) : ''}</small></li>`).join('')}</ul>` : '<p class="muted">—</p>'}
  </div>`;
}
function renderList() {
  const box = $('#emList'); if (!box) return;
  box.innerHTML = em.list.length ? em.list.map(e => {
    const n = em.files.filter(f => f.employee_id === e.id).length, open = em.view === e.id;
    return `<article class="em-card${e.active ? '' : ' off'}${em.edit === e.id ? ' editing' : ''}${open ? ' open' : ''}">
      <div class="em-row">
        <div class="em-av">${esc((e.full_name || '?').slice(0, 1))}</div>
        <button type="button" class="em-main" data-emview="${e.id}" aria-expanded="${open}"><b>${esc(e.full_name)}</b>${e.active ? '' : ` <small class="badge">${esc(t('emInactive'))}</small>`}
          <small class="muted">${[e.position, e.phone, linkName(e)].filter(Boolean).map(esc).join(' · ')}</small></button>
        <span class="em-docs muted" title="${esc(t('emFiles'))}">📎 ${n}</span>
        <button type="button" class="btn-small" data-emedit="${e.id}">${esc(t('edit'))}</button>
        <button type="button" class="btn-small em-del" data-emdel="${e.id}" title="${esc(t('del'))}" aria-label="${esc(t('del'))}">🗑</button>
      </div>
      ${open ? detailHtml(e) : ''}
    </article>`;
  }).join('') : `<p class="inbox-empty">${esc(t('emNone'))}</p>`;
}
document.addEventListener('click', async ev => {
  const v = ev.target.closest('[data-emview]'), d = ev.target.closest('[data-emdel]');
  if (v) { em.view = em.view === v.dataset.emview ? null : v.dataset.emview; renderList(); }
  if (d) {
    if (!d.dataset.sure) { d.dataset.sure = 1; d.textContent = t('delQ'); d.classList.add('danger'); setTimeout(() => { if (d.isConnected) { delete d.dataset.sure; d.textContent = '🗑'; d.classList.remove('danger'); } }, 4000); return; }
    const id = d.dataset.emdel, paths = em.files.filter(f => f.employee_id === id).map(f => f.path);
    try {
      if (paths.length) await fetch(`${window.SUPABASE.url}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
      await db(`employee_files?employee_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
      await db(`employees?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
      if (em.edit === id) closeForm();
      if (em.view === id) em.view = null;
      ui.toast(t('emDeleted'), 'ok');
    } catch { ui.toast(t('errNet'), 'bad'); }
    await loadEmployees();
  }
});

/* ---------- form ---------- */
function linkOptions(sel) {
  const st = S() || { coaches: [], drivers: [] };
  return `<option value="">${esc(t('emNoLink'))}</option>`
    + `<optgroup label="${esc(t('stCoaches'))}">${st.coaches.map(c => `<option value="coach:${c.id}" ${sel === 'coach:' + c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`
    + `<optgroup label="${esc(t('stDrivers'))}">${st.drivers.map(d => `<option value="driver:${d.id}" ${sel === 'driver:' + d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</optgroup>`;
}
function openForm(e) {
  em.edit = e ? e.id : null; form.hidden = false;
  $('#emFormTitle').textContent = t(e ? 'emEdit' : 'emNew');
  for (const k of ['full_name', 'position', 'phone', 'email', 'personal_id', 'birth_date', 'start_date', 'address', 'bank_account', 'notes']) form[k].value = e && e[k] ? e[k] : '';
  form.monthly_salary.value = e && +e.monthly_salary ? e.monthly_salary : '';
  form.income_tax_pct.value = e ? e.income_tax_pct : 20;
  form.salary_is_net.checked = e ? !!e.salary_is_net : false;
  form.pension.checked = e ? !!e.pension : true;
  form.active.checked = e ? !!e.active : true;
  $('#emLink').innerHTML = linkOptions(e ? (e.coach_id ? 'coach:' + e.coach_id : e.driver_id ? 'driver:' + e.driver_id : '') : '');
  $('#emError').textContent = '';
  renderFiles(); preview(); renderList();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeForm() { em.edit = null; form.hidden = true; renderList(); }
function formData() {
  const [kind, id] = (form.link.value || ':').split(':');
  return {
    full_name: form.full_name.value.trim(), position: form.position.value.trim() || null, phone: form.phone.value.trim() || null,
    email: form.email.value.trim() || null, personal_id: form.personal_id.value.trim() || null, birth_date: form.birth_date.value || null,
    start_date: form.start_date.value || null, address: form.address.value.trim() || null, bank_account: form.bank_account.value.trim().replace(/\s+/g, '') || null,
    notes: form.notes.value.trim() || null, coach_id: kind === 'coach' ? id : null, driver_id: kind === 'driver' ? id : null,
    monthly_salary: Math.max(0, +form.monthly_salary.value || 0), income_tax_pct: Math.min(100, Math.max(0, form.income_tax_pct.value === '' ? 20 : +form.income_tax_pct.value)),
    salary_is_net: form.salary_is_net.checked, pension: form.pension.checked, active: form.active.checked,
  };
}
// live preview of this month's numbers while editing
function preview() {
  const d = formData(), now = new Date(), c = calc(d, new Date(now.getFullYear(), now.getMonth(), 1));
  $('#emPreview').textContent = `${fmt(new Date(now.getFullYear(), now.getMonth(), 1), 'month')}: ${t('emGross')} ${money(c.gross)} · ${t('emPensionEmp')} ${money(c.pension)} · ${t('emTaxAmt')} ${money(c.tax)} · ${t('emNet')} ${money(c.net)}`
    + (c.hours ? ` (${c.hours.toLocaleString('ka-GE')} ${t('emHours').toLowerCase()})` : '');
}
form.addEventListener('input', preview);
form.addEventListener('change', preview);
form.addEventListener('submit', async ev => {
  ev.preventDefault();
  const body = formData();
  if (!body.full_name) { form.full_name.focus(); return $('#emError').textContent = t('errTitle'); }
  try {
    if (em.edit) await db(`employees?id=eq.${em.edit}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    else { const r = await db('employees?select=id', { method: 'POST', body, prefer: 'return=representation' }); em.edit = r && r[0] && r[0].id; }
    ui.toast(t('emSaved'), 'ok');
  } catch { return $('#emError').textContent = t('errNet'); }
  await loadEmployees();
  const e = em.list.find(x => x.id === em.edit); if (e) { $('#emFormTitle').textContent = t('emEdit'); renderFiles(); }
});
$('#emCancel').addEventListener('click', closeForm);
$('#emNewBtn').addEventListener('click', () => openForm(null));
document.addEventListener('click', e => { const b = e.target.closest('[data-emedit]'); if (b) openForm(em.list.find(x => x.id === b.dataset.emedit)); });

/* ---------- documents (private bucket; opened through a short-lived link) ---------- */
const sizeTxt = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
function renderFiles() {
  const box = $('#emFiles');
  if (!em.edit) { box.innerHTML = `<h3 class="sub-h">${esc(t('emFiles'))}</h3><p class="muted">${esc(t('emFilesSaveFirst'))}</p>`; return; }
  const list = em.files.filter(f => f.employee_id === em.edit);
  box.innerHTML = `<h3 class="sub-h">${esc(t('emFiles'))}</h3>
    <ul class="em-flist">${list.map(f => `<li><button type="button" class="btn-link" data-emopen="${f.id}">📄 ${esc(f.name)}</button><small class="muted">${f.size ? sizeTxt(f.size) : ''} · ${esc(fmt(f.created_at.slice(0, 10), 'short'))}</small><button type="button" class="btn-small" data-emfdel="${f.id}">✕</button></li>`).join('')}</ul>
    <label class="btn-small em-up"><input type="file" multiple hidden id="emUpload"><span>${esc(t('emFilesAdd'))}</span></label>`;
}
const authHeaders = async () => ({ apikey: window.SUPABASE.key, Authorization: `Bearer ${await token()}` });
document.addEventListener('change', async ev => {
  if (ev.target.id !== 'emUpload' || !em.edit) return;
  const files = [...ev.target.files], lbl = ev.target.closest('label'); lbl.classList.add('busy');
  let ok = 0;
  for (const f of files) {
    if (f.size > MAXF) { ui.toast(t('emTooBig'), 'bad'); continue; }
    const safe = f.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-80) || 'file';
    const path = `${em.edit}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
    try {
      const r = await fetch(`${window.SUPABASE.url}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': f.type || 'application/octet-stream', 'x-upsert': 'false' }, body: f });
      if (!r.ok) throw new Error('upload ' + r.status);
      await db('employee_files', { method: 'POST', body: { employee_id: em.edit, path, name: f.name.slice(0, 200), size: f.size }, prefer: 'return=minimal' });
      ok++;
    } catch (x) { console.error(x); ui.toast(t('emUpFail'), 'bad'); }
  }
  lbl.classList.remove('busy');
  if (ok) ui.toast(t('emUploaded') + (ok > 1 ? ` ×${ok}` : ''), 'ok');
  await loadEmployees(); renderFiles();
});
document.addEventListener('click', async ev => {
  const o = ev.target.closest('[data-emopen]'), d = ev.target.closest('[data-emfdel]');
  if (o) {
    const f = em.files.find(x => x.id === o.dataset.emopen); if (!f) return;
    const win = window.open('', '_blank');
    try {
      const r = await fetch(`${window.SUPABASE.url}/storage/v1/object/sign/${BUCKET}/${f.path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }) });
      const j = await r.json(); if (!r.ok || !j.signedURL) throw new Error('sign');
      const url = `${window.SUPABASE.url}/storage/v1${j.signedURL}`;
      if (win) win.location = url; else location.href = url;
    } catch { if (win) win.close(); ui.toast(t('errNet'), 'bad'); }
  }
  if (d) {
    if (!d.dataset.sure) { d.dataset.sure = 1; d.textContent = t('delQ'); d.classList.add('danger'); return; }
    const f = em.files.find(x => x.id === d.dataset.emfdel); if (!f) return;
    try {
      await fetch(`${window.SUPABASE.url}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [f.path] }) });
      await db(`employee_files?id=eq.${f.id}`, { method: 'DELETE', prefer: 'return=minimal' });
    } catch { ui.toast(t('errNet'), 'bad'); }
    await loadEmployees(); renderFiles();
  }
});

/* ---------- monthly salary table ---------- */
function renderCalc() {
  const box = $('#emCalc'); if (!box) return;
  const now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth() - em.month, 1);
  $('#emMonth').innerHTML = `<button type="button" class="pm-nav" data-emstep="1" aria-label="‹">‹</button><b class="pm-cur">${esc(fmt(m0, 'month'))}</b><button type="button" class="pm-nav" data-emstep="-1" aria-label="›" ${em.month === 0 ? 'disabled' : ''}>›</button>`;
  const rows = em.list.filter(e => e.active).map(e => ({ e, c: calc(e, m0) }));
  if (!rows.length) { box.innerHTML = `<p class="empty">${esc(t('emNone'))}</p>`; return; }
  const sum = k => rows.reduce((s, r) => s + r.c[k], 0);
  box.innerHTML = `<div class="tbl-wrap"><table class="sg-table pay-table em-calc"><thead><tr><th></th><th>${esc(t('emHours'))}</th><th>${esc(t('emGross'))}</th><th>${esc(t('emPensionEmp'))}</th><th>${esc(t('emTaxAmt'))}</th><th>${esc(t('emNet'))}</th><th>${esc(t('emCost'))}</th></tr></thead>
    <tbody>${rows.map(({ e, c }) => `<tr><td><b>${esc(e.full_name)}</b>${e.position ? `<small class="muted"> ${esc(e.position)}</small>` : ''}</td><td>${c.hours ? c.hours.toLocaleString('ka-GE') : '—'}</td><td>${money(c.gross)}</td><td>${money(c.pension)}</td><td>${money(c.tax)}</td><td><b>${money(c.net)}</b></td><td>${money(c.cost)}</td></tr>`).join('')}
    <tr class="pay-sec"><td>${esc(t('emTotal'))}</td><td>${sum('hours').toLocaleString('ka-GE')}</td><td>${money(sum('gross'))}</td><td>${money(sum('pension'))}</td><td>${money(sum('tax'))}</td><td>${money(sum('net'))}</td><td>${money(sum('cost'))}</td></tr></tbody></table></div>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-emstep]'); if (b && !b.disabled) { em.month = Math.max(0, Math.min(36, em.month + +b.dataset.emstep)); renderCalc(); } });

function render() { renderList(); renderCalc(); if (!form.hidden) { preview(); } }

// hook into the owner page's render cycle; employees load once and after each change
const prev = window.ownerExtra && window.ownerExtra.render;
window.ownerExtra = { ...(window.ownerExtra || {}), render(st) { if (prev) prev(st); if (!em.loaded) loadEmployees(); else render(); } };
})();
