'use strict';
// Apply saved appearance before the stylesheet paints the page.
(() => {
  const scope='judu-pages:'+new URL('.',location.href).pathname;
  const storageKey=scope+'appearance';
  const themes=['blue','system','paper','warm','dark'],tones=['standard','soft','contrast'];
  let preference={theme:'blue',tone:'standard'};
  try{const stored=JSON.parse(localStorage.getItem(storageKey));const migrated=stored?.theme==='slate';if(migrated)stored.theme='dark';if(stored&&themes.includes(stored.theme)&&tones.includes(stored.tone))preference=stored;if(migrated)localStorage.setItem(storageKey,JSON.stringify(preference));}catch{}
  const system=matchMedia('(prefers-color-scheme: dark)');
  function apply(){
    const theme=preference.theme==='system'?(system.matches?'dark':'blue'):preference.theme;
    document.documentElement.dataset.theme=theme;document.documentElement.dataset.textTone=preference.tone;
    document.documentElement.style.colorScheme=theme==='dark'?'dark':'light';
    let meta=document.querySelector('meta[name="theme-color"]');if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.append(meta);}meta.content={blue:'#ffffff',paper:'#fdfdfd',warm:'#f8f0df',dark:'#202124'}[theme];
    if(!document.getElementById('appearance-dialog'))return;
    document.querySelectorAll('[data-color-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.colorTheme===preference.theme)));
    document.querySelectorAll('button[data-text-tone]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.textTone===preference.tone)));
    const status=document.getElementById('appearance-status');if(status)status.textContent=preference.theme==='system'?`跟随系统：当前为${system.matches?'深色':'浅色'}`:'已应用所选配色';
  }
  function save(){try{localStorage.setItem(storageKey,JSON.stringify(preference));}catch{const status=document.getElementById('appearance-status');if(status)status.textContent='当前浏览器无法保存，配色仅本次生效。';}}
  apply();system.addEventListener('change',()=>{if(preference.theme==='system')apply();});
  document.addEventListener('DOMContentLoaded',()=>{
    const dialog=document.getElementById('appearance-dialog');
    document.getElementById('appearance-button').onclick=()=>dialog.showModal();
    document.querySelectorAll('[data-color-theme]').forEach(b=>b.onclick=()=>{preference.theme=b.dataset.colorTheme;apply();save();});
    document.querySelectorAll('button[data-text-tone]').forEach(b=>b.onclick=()=>{preference.tone=b.dataset.textTone;apply();save();});
    apply();
  });
})();
