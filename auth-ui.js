/* Sign in / sign up / password reset / profile windows and the account button. Used by both pages. */
(() => {
const { auth, db, rpc, myProfile, i18n, esc } = window.PW;
const t = k => i18n.t(k);
const modal = document.getElementById('authModal');
const form = document.getElementById('authForm');
const emailRow = form.email.closest('label'), pwRow = form.password.closest('label');
let mode = 'in', after = null;
const state = { profile: null };

/* small notice at the bottom of the screen (shared) */
let toastEl = document.getElementById('toast');
if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'toast'; toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); toastEl.hidden = true; document.body.appendChild(toastEl); }
function toast(msg, kind = '') { toastEl.textContent = msg; toastEl.className = 'toast ' + kind; toastEl.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.hidden = true, 5000); }

/* "forgot password?" link under the password field */
const forgot = document.createElement('button');
forgot.type = 'button'; forgot.className = 'btn-link inline forgot';
pwRow.after(forgot);
forgot.addEventListener('click', () => setMode('reset'));

/* sign in with Google / Facebook / X (providers are switched on in Supabase → Authentication → Providers) */
const SOCIAL = [['google', 'withGoogle', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8h-4v3.1A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.2 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.2 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"/></svg>'],
  ['facebook', 'withFacebook', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z"/></svg>'],
  ['x', 'withX', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.2 2h3.4l-7.4 8.5L23 22h-6.8l-5.3-7-6.1 7H1.4l7.9-9L1 2h7l4.8 6.4L18.2 2Zm-1.2 18h1.9L7.1 4H5.1l11.9 16Z"/></svg>']];
const social = document.createElement('div');
social.className = 'social';
social.innerHTML = `<p class="social-or"><span></span></p><div class="social-btns">${SOCIAL.map(([p, k, ic]) => `<button type="button" class="soc soc-${p}" data-prov="${p}">${ic}<span data-k="${k}"></span></button>`).join('')}</div>`;
form.querySelector('#authBtn').after(social);
social.addEventListener('click', e => {
  const b = e.target.closest('[data-prov]'); if (!b) return;
  try { sessionStorage.setItem('pw_oauth', b.dataset.prov); } catch {}
  const back = location.href.split('#')[0];
  location.href = `${window.SUPABASE.url}/auth/v1/authorize?provider=${encodeURIComponent(b.dataset.prov)}&redirect_to=${encodeURIComponent(back)}`;
});

function setMode(m) {
  mode = m;
  modal.dataset.mode = m;
  modal.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === m));
  const titles = { in: 'signIn', up: 'signUp', reset: 'resetTitle', newpw: 'newPwTitle' }, buttons = { in: 'signIn', up: 'signUp', reset: 'resetSend', newpw: 'newPwSave' };
  document.getElementById('authBtn').textContent = t(buttons[m]);
  document.getElementById('authTitle').textContent = t(titles[m]);
  document.getElementById('switchQ').textContent = m === 'up' ? t('haveAccount') : m === 'in' ? t('noAccount') : '';
  document.getElementById('switchBtn').textContent = m === 'in' ? t('signUp') : t('signIn');
  emailRow.hidden = m === 'newpw'; pwRow.hidden = m === 'reset';
  forgot.hidden = m !== 'in'; forgot.textContent = t('forgot');
  form.password.autocomplete = m === 'in' ? 'current-password' : 'new-password';
  form.password.placeholder = m === 'newpw' ? t('newPassword') : '';
  const head = modal.querySelector('.mode-head') || (() => { const h = document.createElement('h2'); h.className = 'mode-head'; modal.querySelector('.tabs').after(h); return h; })();
  head.hidden = m === 'in' || m === 'up'; head.textContent = t(titles[m]);
  document.getElementById('authError').textContent = '';
  social.hidden = m === 'reset' || m === 'newpw';
  social.querySelector('.social-or span').textContent = t('orWith');
  social.querySelectorAll('[data-k]').forEach(x => x.textContent = t(x.dataset.k));
}
modal.querySelectorAll('[role=tab]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.tab)));
document.getElementById('switchBtn').addEventListener('click', () => setMode(mode === 'in' ? 'up' : 'in'));

function open(m = 'in', onDone, intro = true) {
  after = onDone || null;
  document.getElementById('authOk').textContent = '';
  document.getElementById('authIntro').hidden = !intro || m === 'reset' || m === 'newpw';
  i18n.apply(modal); setMode(m);
  if (!modal.open) { if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', ''); }
  setTimeout(() => (m === 'up' ? form.username : m === 'newpw' ? form.password : form.email).focus(), 30);
}
function close() { if (modal.open) modal.close(); }

const errKey = x => { const c = String(x.code || ''); return x.ui || (c === 'invalid_credentials' ? 'errLogin' : c === 'email_not_confirmed' ? 'errConfirm'
  : c === 'user_already_exists' || c === 'email_exists' ? 'errExists' : ['over_request_rate_limit', 'over_email_send_rate_limit', '429'].includes(c) ? 'errRate'
  : c === 'weak_password' ? 'errPw' : c === 'same_password' ? 'errSamePw' : 'errAuth'); };

form.addEventListener('submit', async e => {
  e.preventDefault();
  const err = document.getElementById('authError'), ok = document.getElementById('authOk'), btn = document.getElementById('authBtn');
  err.textContent = ''; ok.textContent = '';
  const email = form.email.value.trim(), password = form.password.value;
  if (mode !== 'newpw' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err.textContent = t('errEmail');
  if (mode !== 'reset' && password.length < 8) return err.textContent = t('errPw');
  btn.disabled = true;
  try {
    if (mode === 'reset') {
      await auth.recover(email);
      ok.textContent = t('resetSent'); return;
    }
    if (mode === 'newpw') {
      await auth.updatePassword(password);
      form.reset(); close(); toast(t('pwChanged'), 'ok'); return;
    }
    if (mode === 'up') {
      const username = form.username.value.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(username)) throw Object.assign(new Error(), { ui: 'errUser' });
      if (!(await rpc('username_available', { u: username }))) throw Object.assign(new Error(), { ui: 'errUserTaken' });
      const res = await auth.signUp({ email, password, username, full_name: form.full_name.value.trim(), phone: form.phone.value.trim() });
      if (res === 'check-email') { ok.textContent = t('checkEmail'); setMode('in'); form.password.value = ''; return; }
    } else {
      await auth.signIn(email, password);
    }
    state.profile = await myProfile().catch(() => null);
    form.reset(); close();
    renderAccount();
    if (after) { const f = after; after = null; f(state.profile); }
  } catch (x) {
    err.textContent = t(errKey(x));
  } finally { btn.disabled = false; }
});

/* profile window (created here so both pages have it) */
const pm = document.createElement('dialog');
pm.className = 'modal'; pm.id = 'profileModal';
pm.innerHTML = `<form method="dialog" class="modal-x"><button aria-label="Close">×</button></form>
  <h2 data-i18n="profile"></h2>
  <form id="profileForm" class="stack" novalidate>
    <div class="pf-id"><span class="avatar" id="pfAvatar"></span><div><b id="pfUser"></b><small id="pfEmail" class="muted"></small></div></div>
    <label><span data-i18n="fullName"></span><input name="full_name" maxlength="80" autocomplete="name"></label>
    <label><span data-i18n="phone"></span><input name="phone" type="tel" maxlength="30" autocomplete="tel" placeholder="+995 5XX XX XX XX"></label>
    <p class="form-ok" id="pfOk" role="status"></p><p class="form-error" id="pfErr" role="alert"></p>
    <button class="btn" type="submit" data-i18n="save"></button>
  </form>
  <form id="pwForm" class="stack pw-change" novalidate>
    <h3 data-i18n="changePw"></h3>
    <label><span data-i18n="newPassword"></span><input name="password" type="password" minlength="8" autocomplete="new-password"><small class="hint" data-i18n="pwHint"></small></label>
    <p class="form-error" id="pwErr" role="alert"></p>
    <button class="btn-small primary big" type="submit" data-i18n="changePw"></button>
  </form>`;
document.body.appendChild(pm);
function openProfile() {
  const p = state.profile || {}, f = pm.querySelector('#profileForm');
  i18n.apply(pm);
  pm.querySelector('#pfAvatar').textContent = (p.username || '?').slice(0, 1).toUpperCase();
  pm.querySelector('#pfUser').textContent = '@' + (p.username || '');
  pm.querySelector('#pfEmail').textContent = (auth.session && auth.session.user && auth.session.user.email) || '';
  f.full_name.value = p.full_name || ''; f.phone.value = p.phone || '';
  pm.querySelector('#pfOk').textContent = ''; pm.querySelector('#pfErr').textContent = ''; pm.querySelector('#pwErr').textContent = '';
  pm.showModal();
}
pm.querySelector('#profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('[type=submit]'); btn.disabled = true;
  try {
    await db(`profiles?id=eq.${auth.session.user.id}`, { method: 'PATCH', body: { full_name: f.full_name.value.trim() || null, phone: f.phone.value.trim() || null }, prefer: 'return=minimal' });
    state.profile = await myProfile().catch(() => state.profile);
    pm.querySelector('#pfOk').textContent = t('profileSaved'); renderAccount(); opts.onProfile && opts.onProfile(state.profile);
  } catch { pm.querySelector('#pfErr').textContent = t('errNet'); }
  btn.disabled = false;
});
pm.querySelector('#pwForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, err = pm.querySelector('#pwErr'); err.textContent = '';
  if (f.password.value.length < 8) return err.textContent = t('errPw');
  const btn = f.querySelector('[type=submit]'); btn.disabled = true;
  try { await auth.updatePassword(f.password.value); f.reset(); pm.close(); toast(t('pwChanged'), 'ok'); }
  catch (x) { err.textContent = t(errKey(x)); }
  btn.disabled = false;
});

/* account button in the header */
const box = document.getElementById('account');
let menuOpen = false, opts = {};
function renderAccount() {
  if (!box) return;
  const p = state.profile;
  if (!auth.session) {
    box.innerHTML = `<button type="button" class="acc-btn" id="accIn">${esc(t('signIn'))}</button>`;
    box.querySelector('#accIn').onclick = () => open('in', opts.onSignIn, false);
    return;
  }
  const name = p ? p.username : (auth.session.user.email || '').split('@')[0];
  const staff = p && (p.role === 'coach' || p.role === 'driver') && opts.staffLink !== false;
  box.innerHTML = `${p && p.role === 'owner' && opts.ownerLink !== false ? `<a class="owner-pill" href="owner.html">⚙ <span>${esc(t('ownerPage'))}</span></a>` : ''}${staff ? `<a class="owner-pill staff-pill" href="staff.html">🗓 <span>${esc(t('staffPage'))}</span><b class="nb" id="staffBadge" hidden></b></a>` : ''}
    <button type="button" class="acc-btn on" id="accMenuBtn" aria-haspopup="menu" aria-expanded="${menuOpen}">
      <span class="avatar" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</span><span class="acc-name">${esc(name)}</span>
    </button>
    <div class="acc-menu" role="menu" ${menuOpen ? '' : 'hidden'}>
      ${opts.mineLink !== false ? `<a role="menuitem" href="index.html#mine">${esc(t('myBookings'))}</a>` : ''}
      ${t('myEvents') ? `<a role="menuitem" href="events.html#mine">${esc(t('myEvents'))}</a><a role="menuitem" href="riders.html#me">${esc(t('myRider'))}</a>` : ''}
      <button type="button" role="menuitem" id="accProfile">${esc(t('profile'))}</button>
      ${p && p.role === 'owner' && opts.ownerLink !== false ? `<a role="menuitem" href="owner.html">${esc(t('ownerPage'))}</a>` : ''}
      ${staff ? `<a role="menuitem" href="staff.html">${esc(t('staffPage'))}</a>` : ''}
      <button type="button" role="menuitem" id="accOut">${esc(t('signOut'))}</button>
    </div>`;
  box.querySelector('#accMenuBtn').onclick = () => { menuOpen = !menuOpen; renderAccount(); };
  box.querySelector('#accProfile').onclick = () => { menuOpen = false; renderAccount(); openProfile(); };
  box.querySelector('#accOut').onclick = async () => { menuOpen = false; await auth.signOut(); state.profile = null; renderAccount(); opts.onSignOut && opts.onSignOut(); };
  box.querySelectorAll('a[role=menuitem]').forEach(a => a.addEventListener('click', () => { menuOpen = false; renderAccount(); }));
}
document.addEventListener('click', e => { if (menuOpen && box && !e.composedPath().includes(box)) { menuOpen = false; renderAccount(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) { menuOpen = false; renderAccount(); } });

function linkMessage(link) {
  if (link === 'recovery') open('newpw', null, false);
  let oauth = null; try { oauth = sessionStorage.getItem('pw_oauth'); sessionStorage.removeItem('pw_oauth'); } catch {}
  if (link === 'error') toast(oauth ? t('socialNotReady') : t('linkExpired'), 'bad');
  else if (link && oauth) toast(t('signedInOk'), 'ok');
  else if (link) toast(t('emailConfirmed'), 'ok');
}
async function init(o = {}) {
  opts = o;
  const link = await auth.consumeUrl().catch(() => 'error');   // arrived from an email link?
  if (auth.session) state.profile = await myProfile().catch(e => { if (e.status === 401) auth.signOut(); return null; });
  renderAccount(); linkMessage(link); staffBadge();
  return state.profile;
}
window.addEventListener('hashchange', async () => {           // link opened while the page was already open
  const link = await auth.consumeUrl().catch(() => 'error');
  if (!link) return;
  if (auth.session) state.profile = await myProfile().catch(() => null);
  renderAccount(); linkMessage(link); opts.onSignIn && link !== 'error' && opts.onSignIn(state.profile);
});
async function staffBadge() {
  const p = state.profile; if (!p || (p.role !== 'coach' && p.role !== 'driver') || !auth.session) return;
  try {
    const r = await db(`notifications?select=id&user_id=eq.${auth.session.user.id}&read_at=is.null&limit=99`);
    const el = document.getElementById('staffBadge'); if (el) { el.hidden = !r.length; el.textContent = r.length; }
  } catch {}
}
setInterval(staffBadge, 60000);
window.PW.ui = { open, close, init, renderAccount, state, toast, refresh() { setMode(mode); renderAccount(); } };
})();
