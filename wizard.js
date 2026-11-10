/* Phone-size booking form: one step per screen with Back / Next. Desktop keeps the full form. */
(() => {
const form = document.querySelector('#bookingForm'); if (!form) return;
const { i18n } = window.PW, t = k => i18n.t(k);
const mq = window.matchMedia('(max-width: 720px)');
const bar = document.createElement('div'); bar.className = 'wiz-bar'; bar.hidden = true;
bar.innerHTML = `<div class="wiz-prog"><span id="wizStep"></span><i><b id="wizFill"></b></i><strong id="wizSum"></strong></div>
  <p class="form-error" id="wizErr" role="alert"></p>
  <div class="wiz-btns"><button type="button" class="btn-small" id="wizBack"></button><button type="button" class="btn wiz-next" id="wizNext"></button></div>`;
form.append(bar);
const $ = s => form.querySelector(s);
let i = 0, on = false;
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
  sum();
  if (scroll) { const y = form.getBoundingClientRect().top + window.scrollY - 76; window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }
}
const sum = () => { const el = document.querySelector('#sumTotal'); $('#wizSum').textContent = el ? el.textContent : ''; };
// what must be chosen before leaving a step
function blocker() {
  const f = steps()[i]; if (!f) return '';
  if (f.querySelector('#calGrid') && !S().day) return t('errDay');
  if (f.querySelector('#slots') && !S().time) return t('errTime');
  return '';
}
function go(d) {
  if (d > 0) { const b = blocker(); if (b) return $('#wizErr').textContent = b; }
  i += d; paint(true);
}
function enable(v) {
  on = v; form.classList.toggle('wiz', v); bar.hidden = !v;
  if (v) paint(false); else form.querySelectorAll('.wiz-on').forEach(f => f.classList.remove('wiz-on'));
}
$('#wizBack').addEventListener('click', () => go(-1));
$('#wizNext').addEventListener('click', () => go(1));
form.addEventListener('click', e => {
  if (!on) return;
  // picking a day leads straight to the times
  if (e.target.closest('#calGrid [data-iso]')) setTimeout(() => { if (S().day && steps()[i] && steps()[i].querySelector('#calGrid')) go(1); }, 60);
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
document.querySelector('#again')?.addEventListener('click', () => { i = 0; if (on) setTimeout(() => paint(true), 30); });
// offers and "book again" links jump to the form: start from the first step that still needs a choice
document.querySelector('.lang')?.addEventListener('click', () => on && setTimeout(() => paint(false), 50));
new MutationObserver(() => on && paint(false)).observe(form.querySelector('#lakeStep') || form, { attributes: true, attributeFilter: ['hidden'] });
mq.addEventListener('change', e => enable(e.matches));
enable(mq.matches);
})();
