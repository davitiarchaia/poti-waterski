/* Owner page — lakes & photos, drivers, staff accounts (coaches / drivers) and their pay. Loaded after owner.js. */
(() => {
const { db, rpc, token, i18n, fmt, iso, todayIso, esc } = window.PW;
const ui = window.PW.ui;
const $ = s => document.querySelector(s);
const t = k => i18n.t(k);
const H = () => window.ownerHelpers;
const S = () => window.ownerState;
const reload = () => window.ownerLoad();
const money = v => '₾' + (Math.round((+v || 0) * 100) / 100).toLocaleString('ka-GE', { maximumFractionDigits: 2 });
const photoUrl = path => `${window.SUPABASE.url}/storage/v1/object/public/lake-photos/${path.split('/').map(encodeURIComponent).join('/')}`;
const err = m => ui.toast(m || t('errNet'), 'bad');
const pay = { month: 0 };

/* ---------- LAKES & PHOTOS ---------- */
function renderLakes(st) {
  const box = $('#lakeAdmin'); if (!box) return;
  box.innerHTML = st.lakes.map((l, i) => {
    const ph = st.photos.filter(p => p.lake_id === l.id);
    const boats = st.boats.filter(b => b.lake_id === l.id);
    const inp = (k, max, ph2 = '') => `<input data-lk="${l.id}" data-k="${k}" maxlength="${max}" value="${esc(l[k] || '')}" placeholder="${esc(ph2)}">`;
    return `<article class="panel lk-card${l.active ? '' : ' off'}">
      <div class="lk-head">
        <div class="svc-order"><button type="button" class="btn-small" data-lkmove="${l.id}" data-dir="-1" ${i ? '' : 'disabled'}>↑</button><button type="button" class="btn-small" data-lkmove="${l.id}" data-dir="1" ${i < st.lakes.length - 1 ? '' : 'disabled'}>↓</button></div>
        <label class="lk-name"><span>${esc(t('svName'))} (ქარ)</span>${inp('name_ka', 60)}</label>
        <label><span>🚤 ${esc(t('lkDriver'))}</span><select data-lk="${l.id}" data-k="driver_id"><option value="">—</option>${st.drivers.map(d => `<option value="${d.id}" ${d.id === l.driver_id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-lk="${l.id}" data-k="active" ${l.active ? 'checked' : ''}> <span>${esc(t('fActive'))}</span></label>
      </div>
      <label><span>${esc(t('svInfo'))} (ქარ)</span>${inp('info_ka', 300, t('lkInfoPh'))}</label>
      <details class="svc-more"><summary>${esc(t('lkMore'))}</summary>
        <div class="svc-grid">
          <label><span>${esc(t('svName'))} (EN)</span>${inp('name_en', 60)}</label><label><span>${esc(t('svName'))} (RU)</span>${inp('name_ru', 60)}</label>
          <label><span>${esc(t('svInfo'))} (EN)</span>${inp('info_en', 300)}</label><label><span>${esc(t('svInfo'))} (RU)</span>${inp('info_ru', 300)}</label>
        </div>
      </details>
      <div class="lk-photos">
        ${ph.map((p, k) => `<figure class="lk-ph"><img src="${esc(photoUrl(p.path))}" alt="" loading="lazy">
          <input class="mini" data-phcap="${p.id}" maxlength="120" value="${esc(p.caption || '')}" placeholder="${esc(t('lkCaption'))}">
          <div class="lk-ph-acts">${k ? `<button type="button" class="btn-small" data-phfirst="${p.id}" title="${esc(t('lkCover'))}">★</button>` : `<span class="lk-cover">★ ${esc(t('lkCover'))}</span>`}
            <button type="button" class="btn-small" data-phdel="${p.id}">${esc(t('del'))}</button></div></figure>`).join('')}
        <label class="lk-upload"><input type="file" accept="image/jpeg,image/png,image/webp" multiple data-upload="${l.id}" hidden><span>＋<br>${esc(t('lkUpload'))}</span></label>
      </div>
      <div class="form-actions"><button type="button" class="btn-small primary big" data-lksave="${l.id}">${esc(t('save'))}</button></div>
    </article>`;
  }).join('') || `<p class="inbox-empty">${esc(t('noData'))}</p>`;
}
const lakeVal = (id, k) => { const el = document.querySelector(`[data-lk="${id}"][data-k="${k}"]`); if (!el) return undefined; return el.type === 'checkbox' ? el.checked : (el.value.trim() || null); };
document.addEventListener('click', async e => {
  const sv = e.target.closest('[data-lksave]'), mv = e.target.closest('[data-lkmove]'), del = e.target.closest('[data-phdel]'), first = e.target.closest('[data-phfirst]');
  if (sv) {
    const id = sv.dataset.lksave, body = {};
    ['name_ka', 'name_en', 'name_ru', 'info_ka', 'info_en', 'info_ru', 'driver_id', 'active'].forEach(k => { const v = lakeVal(id, k); if (v !== undefined) body[k] = v; });
    if (!body.name_ka) return err(t('svErrName'));
    sv.disabled = true;
    try {
      await db(`lakes?id=eq.${id}`, { method: 'PATCH', body, prefer: 'return=minimal' });
      // captions
      for (const p of S().photos.filter(x => x.lake_id === id)) {
        const c = document.querySelector(`[data-phcap="${p.id}"]`), v = c && (c.value.trim() || null);
        if (c && v !== (p.caption || null)) await db(`lake_photos?id=eq.${p.id}`, { method: 'PATCH', body: { caption: v }, prefer: 'return=minimal' });
      }
      ui.toast(t('saved'), 'ok');
    } catch { err(); }
    sv.disabled = false; return reload();
  }
  if (mv) {
    const list = [...S().lakes], i = list.findIndex(l => l.id === mv.dataset.lkmove), j = i + +mv.dataset.dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]]; mv.disabled = true;
    try { await Promise.all(list.map((l, k) => db(`lakes?id=eq.${l.id}`, { method: 'PATCH', body: { sort: k + 1 }, prefer: 'return=minimal' }))); } catch { err(); }
    return reload();
  }
  if (del) {
    if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = t('delQ'); del.classList.add('danger'); return; }
    const p = S().photos.find(x => x.id === del.dataset.phdel); del.disabled = true;
    try {
      await db(`lake_photos?id=eq.${p.id}`, { method: 'DELETE', prefer: 'return=minimal' });
      const tk = await token();
      await fetch(`${window.SUPABASE.url}/storage/v1/object/lake-photos`, { method: 'DELETE', headers: { apikey: window.SUPABASE.key, Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [p.path] }) }).catch(() => {});
    } catch { err(); }
    return reload();
  }
  if (first) {
    const p = S().photos.find(x => x.id === first.dataset.phfirst), list = S().photos.filter(x => x.lake_id === p.lake_id);
    const order = [p, ...list.filter(x => x.id !== p.id)]; first.disabled = true;
    try { await Promise.all(order.map((x, k) => db(`lake_photos?id=eq.${x.id}`, { method: 'PATCH', body: { sort: k + 1 }, prefer: 'return=minimal' }))); } catch { err(); }
    return reload();
  }
});
// photo upload → Supabase Storage (bucket "lake-photos"; only the owner may write)
async function shrink(file) {             // keep uploads light: max 1800px, JPEG ~0.85
  if (!/^image\//.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    if (k >= 1 && file.size < 1.5e6) return file;
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', .85));
  } catch { return file; }
}
document.addEventListener('change', async e => {
  const up = e.target.closest('[data-upload]'); if (!up || !up.files.length) return;
  const lake = up.dataset.upload, files = [...up.files];
  const label = up.closest('.lk-upload'); label.classList.add('busy');
  let done = 0, sort = Math.max(0, ...S().photos.filter(p => p.lake_id === lake).map(p => p.sort || 0));
  for (const f0 of files) {
    try {
      const f = await shrink(f0);
      if (f.size > 6 * 1024 * 1024) { err(t('lkTooBig')); continue; }
      const ext = (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const path = `${lake}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const tk = await token();
      const r = await fetch(`${window.SUPABASE.url}/storage/v1/object/lake-photos/${path}`, { method: 'POST', headers: { apikey: window.SUPABASE.key, Authorization: `Bearer ${tk}`, 'Content-Type': f.type, 'x-upsert': 'false' }, body: f });
      if (!r.ok) throw new Error('upload ' + r.status);
      await db('lake_photos', { method: 'POST', body: { lake_id: lake, path, sort: ++sort }, prefer: 'return=minimal' });
      done++;
    } catch (x) { console.error(x); err(t('lkUpFail')); }
  }
  label.classList.remove('busy'); up.value = '';
  if (done) ui.toast(t('lkUploaded')(done), 'ok');
  reload();
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'lakeForm') {
    e.preventDefault();
    const n = e.target.name_ka.value.trim(); if (n.length < 1) return;
    try { await db('lakes', { method: 'POST', body: { name_ka: n, sort: S().lakes.length + 1 }, prefer: 'return=minimal' }); e.target.reset(); } catch { err(); }
    return reload();
  }
  if (e.target.id === 'driverForm') {
    e.preventDefault();
    const f = e.target, n = f.name.value.trim(); if (!n) return;
    try { await db('drivers', { method: 'POST', body: { name: n, phone: f.phone.value.trim() || null, sort: S().drivers.length + 1 }, prefer: 'return=minimal' }); f.reset(); } catch { err(); }
    return reload();
  }
});

/* ---------- DRIVERS ---------- */
function renderDrivers(st) {
  const box = $('#driverList'); if (!box) return;
  box.innerHTML = st.drivers.map(d => {
    const lakes = st.lakes.filter(l => l.driver_id === d.id).map(l => H().lakeName(l));
    return `<div class="drv${d.active ? '' : ' off'}">
      <span class="boat-ic" aria-hidden="true">🧑‍✈️</span>
      <input class="mini" data-drv="${d.id}" data-k="name" maxlength="60" value="${esc(d.name)}" aria-label="${esc(t('coName'))}">
      <input class="mini" data-drv="${d.id}" data-k="phone" maxlength="30" value="${esc(d.phone || '')}" placeholder="+995…" aria-label="${esc(t('phone'))}">
      <span class="muted small">${lakes.length ? '🌊 ' + esc(lakes.join(', ')) : esc(t('drNoLake'))}</span>
      <button type="button" class="btn-small" data-drvtoggle="${d.id}">${esc(t(d.active ? 'hide' : 'show'))}</button>
      <button type="button" class="btn-small" data-drvdel="${d.id}">${esc(t('del'))}</button>
    </div>`;
  }).join('') || `<p class="muted">${esc(t('noData'))}</p>`;
}
document.addEventListener('change', async e => {
  const d = e.target.closest('[data-drv]'); if (!d) return;
  const v = e.target.value.trim(); if (d.dataset.k === 'name' && !v) return;
  try { await db(`drivers?id=eq.${d.dataset.drv}`, { method: 'PATCH', body: { [d.dataset.k]: v || null }, prefer: 'return=minimal' }); } catch { err(); }
  reload();
});
document.addEventListener('click', async e => {
  const tg = e.target.closest('[data-drvtoggle]'), dl = e.target.closest('[data-drvdel]');
  if (tg) { const d = S().drivers.find(x => x.id === tg.dataset.drvtoggle); try { await db(`drivers?id=eq.${d.id}`, { method: 'PATCH', body: { active: !d.active }, prefer: 'return=minimal' }); } catch { err(); } return reload(); }
  if (dl) {
    if (!dl.dataset.sure) { dl.dataset.sure = 1; dl.textContent = t('delQ'); dl.classList.add('danger'); return; }
    try { await db(`drivers?id=eq.${dl.dataset.drvdel}`, { method: 'DELETE', prefer: 'return=minimal' }); } catch { err(); } return reload();
  }
});

/* ---------- STAFF ACCOUNTS: link a registered account to a coach or driver ---------- */
function renderStaff(st) {
  const box = $('#staffList'); if (!box) return;
  const opts = (sel) => `<option value="">${esc(t('stNone'))}</option>`
    + `<optgroup label="${esc(t('stCoaches'))}">${st.coaches.map(c => `<option value="coach:${c.id}" ${sel === 'coach:' + c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`
    + `<optgroup label="${esc(t('stDrivers'))}">${st.drivers.map(d => `<option value="driver:${d.id}" ${sel === 'driver:' + d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</optgroup>`;
  const people = Object.values(st.profiles).filter(p => p.role !== 'owner');
  const linked = p => { const c = st.coaches.find(x => x.user_id === p.id); if (c) return 'coach:' + c.id; const d = st.drivers.find(x => x.user_id === p.id); return d ? 'driver:' + d.id : ''; };
  const rows = people.sort((a, b) => (linked(b) ? 1 : 0) - (linked(a) ? 1 : 0) || a.username.localeCompare(b.username));
  box.innerHTML = `<div class="ra-tools"><input type="search" id="stSearch" placeholder="${esc(t('rvSearch'))}" value="${esc(pay.q || '')}"></div>` + (rows.filter(p => !pay.q || (p.username + ' ' + (p.full_name || '') + ' ' + (p.phone || '')).toLowerCase().includes(pay.q.toLowerCase())).map(p => {
    const l = linked(p);
    return `<div class="st-row${l ? ' on' : ''}"><div><b>${esc(p.full_name || p.username)}</b> <small class="muted">@${esc(p.username)}${p.phone ? ' · ' + esc(p.phone) : ''}</small></div>
      <span class="badge ${p.role === 'coach' || p.role === 'driver' ? 'confirmed' : ''}">${esc(t('role_' + (p.role || 'customer')))}</span>
      <select class="mini" data-stlink="${p.id}" aria-label="${esc(t('stLink'))}">${opts(l)}</select></div>`;
  }).join('') || `<p class="muted">${esc(t('noData'))}</p>`);
}
document.addEventListener('input', e => { if (e.target.id === 'stSearch') { pay.q = e.target.value; renderStaff(S()); const i = $('#stSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
document.addEventListener('change', async e => {
  const s = e.target.closest('[data-stlink]'); if (!s) return;
  const [kind, id] = (s.value || ':').split(':'); s.disabled = true;
  try { await rpc('owner_set_staff', { p_user: s.dataset.stlink, p_kind: kind || null, p_staff: id || null }); ui.toast(t('stSaved'), 'ok'); } catch { err(); }
  reload();
});
window.staffLinkUI = (kind, c) => {
  const p = c.user_id && S().profiles[c.user_id];
  return `<p class="muted small">${p ? `🔑 @${esc(p.username)}` : esc(t('stNoAccount'))}</p>`;
};

/* ---------- PAYROLL: confirmed hours per coach and driver ---------- */
function renderPayroll(st) {
  const box = $('#payroll'); if (!box) return;
  const now = new Date(), months = [0, -1, -2].map(o => new Date(now.getFullYear(), now.getMonth() + o, 1));
  $('#payMonth').innerHTML = months.map((m, i) => `<button type="button" data-paym="${i}" aria-pressed="${pay.month === i}">${esc(fmt(m, 'month'))}</button>`).join('');
  const m0 = months[pay.month], a = iso(m0), z = iso(new Date(m0.getFullYear(), m0.getMonth() + 1, 0)), today = todayIso();
  const done = st.bookings.filter(b => b.status === 'confirmed' && b.date >= a && b.date <= z);
  const row = (kind, x, list) => {
    const past = list.filter(b => b.date <= today), hrs = past.length / 4, plan = list.length / 4;
    const rate = x.pay_rate != null ? +x.pay_rate : null;
    return `<tr><td><b>${esc(x.name)}</b><small class="muted"> ${esc(t(kind === 'coach' ? 'stCoach1' : 'stDriver1'))}</small></td>
      <td>${H().uniq(past)}</td><td>${hrs.toLocaleString('ka-GE')}</td><td class="muted">${plan > hrs ? '+' + (plan - hrs).toLocaleString('ka-GE') : ''}</td>
      <td><input class="mini rate" type="number" min="0" step="0.5" data-rate="${kind}:${x.id}" value="${rate ?? ''}" placeholder="—" aria-label="${esc(t('payRate'))}"></td>
      <td><b>${rate != null ? money(rate * hrs) : '—'}</b></td></tr>`;
  };
  const coaches = st.coaches.map(c => row('coach', c, done.filter(b => b.coach_id === c.id)));
  const drivers = st.drivers.map(d => row('driver', d, done.filter(b => b.driver_id === d.id)));
  box.innerHTML = (coaches.length || drivers.length) ? `<div class="tbl-wrap"><table class="sg-table pay-table"><thead><tr><th></th><th>${esc(t('payBookings'))}</th><th>${esc(t('payHours'))}</th><th>${esc(t('payPlanned'))}</th><th>${esc(t('payRate'))}</th><th>${esc(t('payTotal'))}</th></tr></thead>
    <tbody>${coaches.length ? `<tr class="pay-sec"><td colspan="6">${esc(t('stCoaches'))}</td></tr>${coaches.join('')}` : ''}${drivers.length ? `<tr class="pay-sec"><td colspan="6">${esc(t('stDrivers'))}</td></tr>${drivers.join('')}` : ''}</tbody></table></div>`
    : `<p class="empty">${esc(t('noData'))}</p>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-paym]'); if (b) { pay.month = +b.dataset.paym; renderPayroll(S()); } });
document.addEventListener('change', async e => {
  const r = e.target.closest('[data-rate]'); if (!r) return;
  const [kind, id] = r.dataset.rate.split(':'), v = r.value === '' ? null : Math.max(0, +r.value);
  try { await db(`${kind === 'coach' ? 'coaches' : 'drivers'}?id=eq.${id}`, { method: 'PATCH', body: { pay_rate: v }, prefer: 'return=minimal' }); } catch { err(); }
  reload();
});

window.ownerExtra = { render(st) { renderLakes(st); renderDrivers(st); renderStaff(st); renderPayroll(st); } };
})();
