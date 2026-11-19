/* Poti Lake Club — light/dark theme. Loaded in <head> so the theme is set before first paint. */
(function(){
  var K='poti-theme', d=document.documentElement;
  var mq=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null;
  function stored(){try{return localStorage.getItem(K)}catch(e){return null}}
  function apply(t){d.setAttribute('data-theme',t)}
  apply(stored()||(mq&&mq.matches?'dark':'light'));
  if(mq&&mq.addEventListener)mq.addEventListener('change',function(e){if(!stored())apply(e.matches?'dark':'light')});
  var L={en:['Switch to dark theme','Switch to light theme'],ka:['ბნელ თემაზე გადართვა','ნათელ თემაზე გადართვა'],ru:['Включить тёмную тему','Включить светлую тему']};
  function label(){var l=(d.lang||'en').slice(0,2);return (L[l]||L.en)[d.getAttribute('data-theme')==='dark'?1:0]}
  var ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
    '<g class="i-moon"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></g>'+
    '<g class="i-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g></svg>';
  document.addEventListener('DOMContentLoaded',function(){
    var host=document.querySelector('.top-right')||document.querySelector('.top');
    if(!host)return;
    var b=document.createElement('button');
    b.type='button';b.className='theme-toggle';b.innerHTML=ICON;
    host.insertBefore(b,host.firstChild);
    function sync(){var t=label();b.setAttribute('aria-label',t);b.title=t}
    b.addEventListener('click',function(){
      var n=d.getAttribute('data-theme')==='dark'?'light':'dark';
      apply(n);try{localStorage.setItem(K,n)}catch(e){}sync();
    });
    sync();
    new MutationObserver(sync).observe(d,{attributes:true,attributeFilter:['lang']});
  });
})();
