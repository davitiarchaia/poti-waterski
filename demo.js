/* Thin notice shown on every page while CONFIG.demo is true (set it to false in config.js when the club goes live). */
(() => {
  if (!window.CONFIG || !window.CONFIG.demo) return;
  const lang = (() => { try { return JSON.parse(localStorage.getItem('lang')); } catch { return null; } })() || (navigator.language || 'ka').slice(0, 2);
  const txt = {
    ka: 'სადემონსტრაციო ვერსია — რაიდერები, ღონისძიებები და ჯავშნები სანიმუშოა.',
    en: 'Demo version — riders, events and bookings are sample data.',
    ru: 'Демо-версия — райдеры, события и брони — примерные данные.',
  };
  const bar = document.createElement('div');
  bar.className = 'demo-bar'; bar.setAttribute('role', 'note');
  bar.textContent = txt[lang] || txt.ka;
  document.body.prepend(bar);
  const st = document.createElement('style');
  st.textContent = '.demo-bar{background:repeating-linear-gradient(135deg,#abb9bf 0 14px,#b9c6cb 14px 28px);color:#06202e;font:700 .8rem/1.3 Inter,"Noto Sans Display","Noto Sans Georgian",system-ui,sans-serif;text-align:center;padding:.4rem 1rem;position:relative;z-index:60}';
  document.head.appendChild(st);
})();
