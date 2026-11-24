/* Owner page › "Coaches, boats & lakes": every lake / boat / coach shows only a small icon + its name;
   tapping it opens the whole card (and tapping again closes it). Open cards stay open across reloads of the list. */
(() => {
  const open = new Set();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = k => (window.PW && window.PW.i18n ? window.PW.i18n.t(k) : k);
  const KINDS = [
    { box: '#lakeAdmin', item: '[data-lkcard]', key: el => 'lk' + el.dataset.lkcard, ic: '🌊',
      name: el => el.querySelector('.lk-title')?.textContent, off: el => el.classList.contains('off') },
    { box: '#boatList', item: 'li:not(.muted)', key: el => 'bt' + (el.querySelector('[data-bdel]')?.dataset.bdel || ''), ic: '🚤',
      name: el => el.querySelector('[data-bname]')?.value, off: el => el.classList.contains('off') },
    { box: '#coachList', item: '.coach-card', key: el => 'co' + (el.querySelector('[data-cact]')?.dataset.id || ''), ic: '👤',
      name: el => el.querySelector('h3')?.textContent, off: el => el.classList.contains('oHidden'),
      photo: el => el.querySelector('.cc-top .ph img')?.getAttribute('src') },
  ];
  function decorate(k) {
    const box = document.querySelector(k.box); if (!box) return;
    box.querySelectorAll(':scope > ' + k.item).forEach(el => {
      if (el.querySelector(':scope > .fold-head')) return;
      const key = k.key(el), ph = k.photo && k.photo(el);
      el.classList.add('fold'); el.classList.toggle('open', open.has(key) || el.classList.contains('editing'));
      const h = document.createElement('button');
      h.type = 'button'; h.className = 'fold-head'; h.dataset.fold = key; h.setAttribute('aria-expanded', el.classList.contains('open'));
      h.innerHTML = `<span class="fh-ic">${ph ? `<img src="${esc(ph)}" alt="">` : k.ic}</span><b>${esc(k.name(el) || '—')}</b>`
        + (k.off(el) ? `<span class="fh-off">${esc(t(k.box === '#lakeAdmin' ? 'lkClosed' : 'oHidden'))}</span>` : '') + '<i class="fh-chev" aria-hidden="true"></i>';
      el.prepend(h);
    });
  }
  const run = () => KINDS.forEach(decorate);
  document.addEventListener('click', e => {
    const h = e.target.closest('.fold-head'); if (!h) return;
    const el = h.parentElement, on = !el.classList.contains('open');
    el.classList.toggle('open', on); h.setAttribute('aria-expanded', on);
    on ? open.add(h.dataset.fold) : open.delete(h.dataset.fold);
  });
  document.addEventListener('DOMContentLoaded', () => {
    KINDS.forEach(k => { const box = document.querySelector(k.box); if (box) new MutationObserver(() => decorate(k)).observe(box, { childList: true }); });
    run();
  });
})();
