/* Phone-size booking form: one step per screen with Back / Next. Desktop keeps the full form. */
(() => {
const form = document.querySelector('#bookingForm'); if (!form) return;
const { i18n } = window.PW, t = k => i18n.t(k);
const mq = { matches: true, addEventListener() {} };   // one step at a time on every screen size
const bar = document.createElement('div'); bar.className = 'wiz-bar'; bar.hidden = true;
bar.innerHTML = `<div class="wiz-prog"><span id="wizStep"></span><i><b id="wizFill"></b></i><strong id="wizSum"></strong></div>
  <p class="form-error" id="wizErr" role="alert"></p>
  <div class="wiz-btns"><button type="button" class="btn-small" id="wizBack"></button><button type="button" class="btn wiz-next" id="wizNext"></button></div>`;
form.append(bar);
const $ = s => form.querySelector(s);
let i = 0, on = false;
try { i = +sessionStorage.getItem('pw.step') || 0; if (!(window.bookingState || {}).picked) i = 0; } catch {}
const steps = () => [...form.querySelectorAll('fieldset.step')].filter(f => !f.hidden);
const S = () => window.bookingState || {};

function paint(scroll) {
  const list = steps(); i = Math.max(0, Math.min(i, list.length - 1));
  const last = i === list.length - 1;
  form.querySelectorAll('fieldset.step').forEach(f => f.classList.toggle('wiz-on', f === list[i]));
  form.classList.toggle('wiz-last', last);
  $('#wizStep').textContent = t('wizStep')(i + 1, list.length);
  $('#wizFill').style.width = ((i + 1) / list.length * 100) + '%';
  $('#wizBack').textContent = t('wizBack'); $('#wizBack').hidden = i === 0;
  $('#wizNext').textContent = t('wizNext'); $('#wizNext').hidden = last;
  $('#wizErr').textContent = '';
  try { sessionStorage.setItem('pw.step', i); } catch {}
  if (window.PW && window.PW.saveBooking) window.PW.saveBooking();
  sum();
  if (scroll) { const y = form.getBoundingClientRect().top + window.scrollY - 76; window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }
}
const sum = () => { const el = document.querySelector('#sumTotal'); $('#wizSum').textContent = el ? el.textContent : ''; };
// what must be chosen before leaving a step
function blocker(jump) {   // jump: open the lake that still needs a choice (only when Next is pressed)
  const f = steps()[i]; if (!f) return '';
  if (f.querySelector('#rides') && !S().picked) return t('errRide');
  if (f.querySelector('#rgroups') && !(S().groups || []).length) return t('errRiders');
  if (f.querySelector('#calGrid') && !S().day) return t('errDay');
  if (f.querySelector('#slots') && S().legsMissing) { const m = S().legsMissing(); if (m) { if (jump) S().showLeg(m.i); return m.msg; } }
  if (f.querySelector('#dur') && !S().dur) return t('errDur');
  if (f.querySelector('#slots') && !S().time) return t('errTime');
  return '';
}
// "Rent it" chosen but no item picked: shake + vibrate and ask before moving on
const noGear = () => { const f = steps()[i], box = document.querySelector('#equipBox');
  return f && f.querySelector('#rides') && S().equip === 'rent' && box && !box.hidden && !Object.values(S().eqSel || {}).some(n => n > 0); };
function warnNoGear() {
  form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
  try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch {}
  const dlg = $('#eqDlg'); if (dlg && dlg.showModal) setTimeout(() => dlg.showModal(), 350); else { i += 1; paint(true); }
}
// coach cards shown but none tapped: ask before moving on
const noCoach = () => { const f = steps()[i], box = document.querySelector('#coaches'), pick = document.querySelector('#coachPick');
  return f && f.contains(box) && pick && !pick.hidden && !box.hidden && box.children.length > 0 && !S().coachPicked; };
function warn(id) {
  form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
  try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch {}
  const dlg = $(id); if (dlg && dlg.showModal) setTimeout(() => dlg.showModal(), 350); else go(1, true);
}
function go(d, force) {
  if (d > 0) { const b = blocker(true); if (b) return $('#wizErr').textContent = b; }
  if (d > 0 && !force && noGear()) return warnNoGear();
  if (d > 0 && !force && noCoach()) return warn('#coachDlg');
  i += d; paint(true);
}
$('#eqX') && $('#eqX').addEventListener('click', () => $('#eqDlg').close());
$('#ncX') && $('#ncX').addEventListener('click', () => $('#coachDlg').close());
$('#ncBack') && $('#ncBack').addEventListener('click', () => { $('#coachDlg').close(); const x = document.querySelector('#coachPick'); if (x) x.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
$('#ncGo') && $('#ncGo').addEventListener('click', () => { $('#coachDlg').close(); const nc = document.querySelector('#coaches .coach.none'); if (nc) nc.click(); go(1, true); });
$('#eqBack') && $('#eqBack').addEventListener('click', () => { $('#eqDlg').close(); const x = document.querySelector('#equipBox .eq-items'); if (x) x.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
$('#eqGo') && $('#eqGo').addEventListener('click', () => { $('#eqDlg').close(); go(1, true); });
function enable(v) {
  on = v; form.classList.toggle('wiz', v); bar.hidden = !v;
  if (v) paint(false); else form.querySelectorAll('.wiz-on').forEach(f => f.classList.remove('wiz-on'));
}
// the home page shows only the hero until "Book now" (or any in-page link) is pressed; then step 1
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
  const root = document.documentElement; if (!root.classList.contains('gate')) return;
  root.classList.remove('gate'); try { sessionStorage.setItem('pw.open', '1'); } catch {}
  if (a.getAttribute('href') === '#bookingForm') { e.preventDefault(); i = 0; paint(false); requestAnimationFrame(() => { const y = form.getBoundingClientRect().top + window.scrollY - 70; window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }); }
});
$('#wizBack').addEventListener('click', () => go(-1));
$('#wizNext').addEventListener('click', () => go(1));
form.addEventListener('click', e => {
  if (!on) return;
  setTimeout(() => { sum(); if ($('#wizErr').textContent && !blocker()) $('#wizErr').textContent = ''; }, 80);
});
form.addEventListener('change', () => on && setTimeout(sum, 80));
// a failed submit that cleared the time (slot just taken / closed) sends the customer back to the time step
form.addEventListener('submit', () => { if (on) setTimeout(back, 1500); }, true);
function back() {
  if (!on || form.hidden) return;
  const list = steps(), need = !S().day ? list.findIndex(f => f.querySelector('#calGrid')) : !S().time ? list.findIndex(f => f.querySelector('#slots')) : -1;
  if (need < 0 || need === i) return;
  const msg = document.querySelector('#formError').textContent; i = need; paint(true); $('#wizErr').textContent = msg;
}
document.querySelector('#again')?.addEventListener('click', () => { i = 0; try { sessionStorage.setItem('pw.step', 0); } catch {} if (on) setTimeout(() => paint(true), 30); });
// offers and "book again" links jump to the form: start from the first step that still needs a choice
document.querySelector('.lang')?.addEventListener('click', () => on && setTimeout(() => paint(false), 50));
new MutationObserver(() => on && paint(false)).observe(form.querySelector('#lakeStep') || form, { attributes: true, attributeFilter: ['hidden'] });
mq.addEventListener('change', e => enable(e.matches));
enable(mq.matches);
})();
