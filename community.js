/* Shared bits for the community pages (riders, events) and the owner page tabs. */
(() => {
const { i18n, esc } = window.PW;
const t = k => i18n.t(k);
const COLORS = ['#3d6369', '#3b8472', '#f59e0b', '#7c3aed', '#7db5ad', '#db2777', '#2563eb', '#b45309'];
const hash = s => { let h = 2166136261; for (const c of String(s || '')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return (h ^ (h >>> 15)) >>> 0; };
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avatar = (name, key, size = '') => `<span class="r-ava ${size}" style="background:${COLORS[hash(key || name) % COLORS.length]}" aria-hidden="true">${esc(initials(name))}</span>`;
const levelBadge = (lv, verified) => lv
  ? `<span class="lv lv-${esc(lv)}">${esc(t('lv_' + lv))}${verified ? ` <b class="lv-ok" title="${esc(t('verified'))}">✓</b>` : ''}</span>`
  : `<span class="lv lv-none">${esc(t('lvNone'))}</span>`;
const discTags = list => (list || []).map(d => `<span class="d-tag">${esc(t('d_' + d))}</span>`).join('');
const kindTag = k => `<span class="k-tag k-${esc(k)}">${esc(t('k_' + k))}</span>`;
window.CM = { avatar, levelBadge, discTags, kindTag, initials };
})();
