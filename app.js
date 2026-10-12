'use strict';
const $ = (id) => document.getElementById(id);
const storageScope = 'judu-pages:' + new URL('.', location.href).pathname;
const reader = $('reader');
const lookup = $('lookup');
let articles = [], active = null, visibleEntries = [], activeId = null;
let database = null, hot = null, selected = null, geometry = [], geometryDirty = true;
let lastPointer = null, pointerStart = null, busy = false, recording = false, draftKeys = ['Space'];
const held = new Set();
let settings = {keys: ['Space'], fontSize: 22};
try { const s = JSON.parse(localStorage.getItem(storageScope + 'judu-settings')); if (s && Array.isArray(s.keys) && s.keys.length && s.keys.length < 8) settings = {keys:s.keys, fontSize: Math.min(32,Math.max(18,Number(s.fontSize)||22))}; } catch {}
const keyName = (code) => ({Space:'空格',Alt:'Option / Alt',Shift:'Shift',Control:'Control',Meta:'⌘ Command',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',CapsLock:'Caps Lock'}[code] || code.replace(/^Key|^Digit/,''));
const canonicalKey = code => code.replace(/^(Shift|Alt|Control|Meta)(Left|Right)$/, '$1');
const chordLabel = keys => keys.map(keyName).join(' + ');
const isInput = el => !!el?.closest('input, textarea, select, [contenteditable=true]');
function element(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if(className) el.className = className; return el; }
function toast(text) { $('toast').textContent=text; $('toast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('toast').hidden=true,3800); }
function notify(text) { $('notice').textContent=text; $('notice').hidden=!text; }
function openDatabase() { return new Promise((resolve,reject)=>{const req=indexedDB.open(storageScope + 'judu-reader',1);req.onupgradeneeded=()=>req.result.createObjectStore('articles',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); }
function dbAction(mode, action) { return new Promise((resolve,reject)=>{ if(!database){reject(new Error('storage unavailable'));return;}const tx=database.transaction('articles',mode);const req=action(tx.objectStore('articles'));tx.oncomplete=()=>resolve(req?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);}); }
async function saveArticle(article) { try{await dbAction('readwrite',store=>store.put(article));$('save-state').textContent='已保存在此浏览器';}catch{$('save-state').textContent='本次阅读未保存';toast('浏览器存储不可用或空间不足，请保留原始文件。');} }
function applySettings() { document.documentElement.style.setProperty('--font-size', settings.fontSize+'px');$('shortcut-label').textContent=chordLabel(settings.keys);geometryDirty=true;clearHot(); }
function renderLibrary() {
  $('library').replaceChildren();$('library-count').textContent=articles.length;
  articles.forEach(a=>{const btn=element('button',undefined,'library-item'+(a.id===activeId?' active':''));btn.setAttribute('aria-current',a.id===activeId?'page':'false');btn.append(element('strong',a.title),element('small',`${a.entries.length} 句${a.sample?' · 示例文章':''}`));btn.onclick=()=>selectArticle(a.id);$('library').append(btn);});
}
function selectArticle(id) {
  closeLookup(false);clearHot();activeId=id;active=articles.find(a=>a.id===id)||null;
  try{localStorage.setItem(storageScope + 'judu-active',id||'');}catch{}
  renderLibrary();reader.replaceChildren();visibleEntries=[];geometryDirty=true;
  $('text-button').disabled=!active;$('delete-button').disabled=!active;$('empty-state').hidden=!!active;
  if(!active){$('article-title').textContent='让每个句子，都读得明白。';$('toolbar-title').textContent='开始阅读';$('article-meta').textContent='从一张两列的 Excel 开始。';$('footer-count').textContent='留一点时间，给理解。';notify('');return;}
  $('article-title').textContent=active.title;$('toolbar-title').textContent=active.title;
  const paragraphs = active.matchedParagraphs || groupRows(active.entries);
  let ordinal=0, matchedCount=0;
  for(const items of paragraphs){const p=document.createElement('p');for(const item of items){
    if(item.gap){p.append(document.createTextNode(item.sentence));continue;}
    const idx=visibleEntries.length;visibleEntries.push(item);ordinal++;
    const span=element('span',item.sentence,'sentence'+(!item.analysis?' unmatched':''));span.dataset.index=idx;span.tabIndex=0;span.setAttribute('role','button');span.setAttribute('aria-label',`第 ${ordinal} 句，按 Enter 查看解析：${item.sentence}`);p.append(span);
    if(item.analysis)matchedCount++;
  }reader.append(p);}
  $('article-meta').textContent=`${active.sample?'示例读本 · ':''}${visibleEntries.length} 句 · ${paragraphs.length} 段 · ${matchedCount} 句有解析`;
  $('footer-count').textContent=`${matchedCount} / ${visibleEntries.length} 句已关联解析`;
  const warns=[...(active.warnings||[])];if(active.matchReport)warns.unshift(active.matchReport);
  notify(warns.length?warns.slice(0,8).join('\n')+(warns.length>8?`\n另有 ${warns.length-8} 条提示。`:''):'');
}
function groupRows(entries){const groups=[];let last=null;for(const entry of entries){if(last!==entry.paragraph){groups.push([]);last=entry.paragraph;}const p=groups.at(-1);if(p.length)p.push({gap:true,sentence:' '});p.push(entry);}return groups;}
async function importFile(file){
  if(!file||busy)return;if(!/\.(xlsx|csv)$/i.test(file.name)){toast('请选择 .xlsx 或 .csv；旧版 .xls 请先另存为 .xlsx。');return;}
  if(file.size>10*1024*1024){toast('文件不能超过 10 MB。');return;}
  busy=true;$('import-button').disabled=true;$('import-button').textContent='正在整理文章…';
  try{
    const result=await ReaderImport.read(file);
    const added=result.articles.map(a=>({...a,title:result.articles.length===1&&/^(Sheet\d*|工作表\d*)$/i.test(a.title)?file.name.replace(/\.[^.]+$/,''):a.title,id:crypto.randomUUID(),filename:file.name,createdAt:Date.now()}));
    for(const a of added){articles.unshift(a);await saveArticle(a);}selectArticle(added[0].id);toast(`已导入 ${added.length} 篇文章，共 ${added.reduce((n,a)=>n+a.entries.length,0)} 句`);
  }catch(err){toast(err.message||'导入失败，请检查文件格式。');}
  finally{busy=false;$('import-button').disabled=false;$('import-button').textContent='＋ 导入 Excel 文章';$('file-input').value='';}
}
async function loadSample(){
  const previous=articles.find(a=>a.sample);if(previous){selectArticle(previous.id);return;}
  try{const res=await fetch('assets/sample.json');if(!res.ok)throw Error();const sample=await res.json();sample.id=crypto.randomUUID();sample.sample=true;sample.createdAt=Date.now();articles.unshift(sample);await saveArticle(sample);selectArticle(sample.id);}catch{toast('示例加载失败，请刷新页面或检查网站文件是否上传完整。');}
}
function measure(){geometry=[];reader.querySelectorAll('.sentence').forEach(span=>{const range=document.createRange();range.selectNodeContents(span);for(const r of range.getClientRects()){if(r.width>0&&r.height>0)geometry.push({span,left:r.left+scrollX,right:r.right+scrollX,top:r.top+scrollY,bottom:r.bottom+scrollY});}});geometryDirty=false;}
function hitSentence(x,y){
  if(geometryDirty)measure();x+=scrollX;y+=scrollY;let best=null,bestScore=Infinity;
  for(const r of geometry){const dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom);if(dx>3||dy>6)continue;const score=dx*dx+dy*dy;if(score<bestScore){best=r.span;bestScore=score;}}
  return best;
}
function chordDown(e){const available=new Set(held);if(e?.altKey)available.add('Alt');if(e?.ctrlKey)available.add('Control');if(e?.metaKey)available.add('Meta');if(e?.shiftKey)available.add('Shift');return settings.keys.every(key=>available.has(key));}
function clearHot(){hot?.classList.remove('hot');hot=null;}
function updateHot(e){if(recording||!chordDown(e)){clearHot();return;}const next=hitSentence(e.clientX,e.clientY);if(next!==hot){clearHot();hot=next;hot?.classList.add('hot');}}
reader.addEventListener('pointermove',e=>{lastPointer=e;updateHot(e);});
reader.addEventListener('pointerleave',()=>{lastPointer=null;clearHot();});
reader.addEventListener('pointerdown',e=>{if(e.button!==0||!chordDown(e))return;const span=hitSentence(e.clientX,e.clientY);if(!span)return;e.preventDefault();pointerStart={x:e.clientX,y:e.clientY,span};});
reader.addEventListener('pointerup',e=>{const start=pointerStart;pointerStart=null;if(!start||e.button!==0||Math.hypot(start.x-e.clientX,start.y-e.clientY)>6)return;const span=hitSentence(e.clientX,e.clientY);if(span===start.span){e.preventDefault();showLookup(span,e.clientX,e.clientY);}});
document.addEventListener('pointerup',()=>{pointerStart=null;});
reader.addEventListener('keydown',e=>{if(e.code==='Enter'&&e.target.classList.contains('sentence')){e.preventDefault();const r=e.target.getClientRects()[0];showLookup(e.target,r.left,r.bottom,true);}});
function analysisSections(text){
  const sections=[];let current={title:'句子解析',lines:[]};
  for(const line of text.split(/\r?\n/)){
    const m=line.match(/^\s*(?:#{1,4}\s*)?(?:【|\[)?(完整翻译|中文翻译|翻译|句子主干|句法结构|语法解析|时态与语态|重点搭配|词组与搭配|易错点|理解提示)(?:】|\])?\s*[:：]?\s*(.*)$/);
    if(m){if(current.lines.some(x=>x.trim()))sections.push(current);current={title:m[1],lines:m[2]?[m[2]]:[]};}else current.lines.push(line);
  }
  if(current.lines.some(x=>x.trim()))sections.push(current);return sections;
}
function showLookup(span,x,y,keyboard=false){
  if(!span)return;selected?.classList.remove('selected');selected=span;span.classList.add('selected');
  if(!keyboard)window.getSelection()?.removeAllRanges();
  const index=Number(span.dataset.index),entry=visibleEntries[index];$('lookup-sentence').textContent=entry.sentence;$('lookup-index').textContent=`${index+1} / ${visibleEntries.length}`;$('lookup-analysis').replaceChildren();
  if(!entry.analysis){const p=element('p','这句话还没有匹配到解析。请在 Excel 的第二列补充对应翻译与语法解析，再重新导入。');$('lookup-analysis').append(p);}else{
    for(const section of analysisSections(entry.analysis)){const box=element('section',undefined,'analysis-section'+(/翻译/.test(section.title)?' translation':''));box.append(element('h3',section.title),element('p',section.lines.join('\n').trim()));$('lookup-analysis').append(box);}
  }
  lookup.hidden=false;lookup.scrollTop=0;lookup.style.visibility='hidden';lookup.style.left='12px';lookup.style.top='12px';
  requestAnimationFrame(()=>{const w=lookup.offsetWidth,h=lookup.offsetHeight;const left=Math.min(Math.max(12,x-24),innerWidth-w-12);let top=y+18;if(top+h>innerHeight-12)top=y-h-18;if(top<12)top=Math.max(12,Math.min(innerHeight-h-12,y-h/2));lookup.style.left=left+'px';lookup.style.top=top+'px';lookup.style.visibility='visible';if(keyboard)lookup.focus({preventScroll:true});});
}
function closeLookup(restoreFocus=false){lookup.hidden=true;if(restoreFocus)selected?.focus({preventScroll:true});selected?.classList.remove('selected');selected=null;}
$('lookup-close').onclick=()=>closeLookup(true);
document.addEventListener('pointerdown',e=>{if(!lookup.hidden&&!lookup.contains(e.target)){if(reader.contains(e.target)&&chordDown(e))return;closeLookup(false);}});
window.addEventListener('scroll',()=>closeLookup(false),{passive:true});
window.addEventListener('resize',()=>{geometryDirty=true;closeLookup(false);});
new ResizeObserver(()=>{geometryDirty=true;}).observe(reader);
document.fonts?.ready.then(()=>{geometryDirty=true;});
function resetHeld(){held.clear();pointerStart=null;clearHot();}
window.addEventListener('blur',resetHeld);document.addEventListener('visibilitychange',resetHeld);
document.addEventListener('keydown',e=>{
  if(e.isComposing)return;
  if(e.code==='Escape'){if(recording){recording=false;$('record-key').classList.remove('recording');$('record-key').textContent='录制自定义按键组合';$('record-help').textContent='已取消录制。';}else closeLookup(true);resetHeld();return;}
  const key=canonicalKey(e.code);
  if(recording){e.preventDefault();e.stopPropagation();held.add(key);draftKeys=[...held].sort();$('settings-shortcut').textContent=chordLabel(draftKeys);$('record-help').textContent='松开按键后录制完成，再点击“保存设置”。';return;}
  if(isInput(e.target)||document.querySelector('dialog[open]'))return;
  held.add(key);
  if(settings.keys.includes(key)){e.preventDefault();if(lastPointer)updateHot(lastPointer);}
});
document.addEventListener('keyup',e=>{
  held.delete(canonicalKey(e.code));if(canonicalKey(e.code)==='Meta')held.clear();clearHot();
  if(recording&&held.size===0){recording=false;$('record-key').classList.remove('recording');$('record-key').textContent='重新录制';$('record-help').textContent='已记录 '+chordLabel(draftKeys)+' ＋ 左键单击。点击保存生效。';}
});
function openSettings(){resetHeld();draftKeys=[...settings.keys];recording=false;$('settings-shortcut').textContent=chordLabel(draftKeys);$('font-size').value=settings.fontSize;$('font-value').textContent=settings.fontSize+' px';$('record-key').classList.remove('recording');$('record-key').textContent='录制自定义按键组合';$('record-help').textContent='可使用字母、数字、功能键或组合键。部分系统快捷键会被系统优先处理。Esc 用于取消。';$('settings-dialog').showModal();}
$('settings-dialog').addEventListener('close',()=>{recording=false;resetHeld();});
$('settings-button').onclick=openSettings;$('hint-settings').onclick=openSettings;
document.querySelectorAll('[data-preset]').forEach(btn=>btn.onclick=()=>{recording=false;resetHeld();draftKeys=[btn.dataset.preset];$('settings-shortcut').textContent=chordLabel(draftKeys);$('record-key').classList.remove('recording');$('record-key').textContent='录制自定义按键组合';});
$('record-key').onclick=()=>{resetHeld();recording=true;$('record-key').classList.add('recording');$('record-key').textContent='请按下想使用的键…';$('record-help').textContent='同时按下需要的键，然后松开。Esc 取消。';};
$('font-size').oninput=e=>$('font-value').textContent=e.target.value+' px';
$('save-settings').onclick=()=>{if(recording){toast('请先完成按键录制。');return;}settings={keys:draftKeys,fontSize:Number($('font-size').value)};try{localStorage.setItem(storageScope + 'judu-settings',JSON.stringify(settings));}catch{toast('设置仅在本次阅读中生效。');}applySettings();$('settings-dialog').close();};
$('reset-settings').onclick=()=>{recording=false;resetHeld();draftKeys=['Space'];$('settings-shortcut').textContent='空格';$('font-size').value=22;$('font-value').textContent='22 px';$('record-key').classList.remove('recording');$('record-key').textContent='录制自定义按键组合';};
async function copy(text){try{await navigator.clipboard.writeText(text);toast('已复制');}catch{toast('复制未成功，请选中文本后手动复制。');}}
$('copy-analysis').onclick=()=>{if(selected){const a=visibleEntries[Number(selected.dataset.index)];copy(a.sentence+'\n\n'+(a.analysis||'尚无解析'));}};
$('copy-prompt').onclick=()=>copy($('prompt-text').value);
$('guide-button').onclick=()=>$('guide-dialog').showModal();
$('import-button').onclick=$('empty-import').onclick=()=>$('file-input').click();
$('file-input').onchange=e=>importFile(e.target.files[0]);
$('sample-button').onclick=$('empty-sample').onclick=loadSample;
$('delete-button').onclick=()=>$('confirm-dialog').showModal();
$('confirm-dialog').addEventListener('close',async()=>{if($('confirm-dialog').returnValue!=='delete'||!active)return;try{await dbAction('readwrite',store=>store.delete(active.id));}catch{}articles=articles.filter(a=>a.id!==activeId);selectArticle(articles[0]?.id||null);});
let dragDepth=0;
document.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;}});
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop-overlay').hidden=true;}});
document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;const files=e.dataTransfer.files;if(files.length>1){toast('请每次导入一个文件；文件内可有多张工作表。');return;}importFile(files[0]);});
// Canonical text with offsets into the original, used only for exact matching.
function normalizeMapped(text){let value='',map=[];for(let i=0;i<text.length;i++){let c=text[i];if(/[\s\u00a0]/.test(c)){if(value.endsWith(' '))continue;c=' ';}else if(/[‘’]/.test(c))c="'";else if(/[“”]/.test(c))c='"';value+=c;map.push(i);}return{value,map};}
const normalized=text=>normalizeMapped(text).value.trim();
function matchOriginal(text, entries){
  const buckets=new Map();entries.forEach((e,i)=>{const key=normalized(e.sentence);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({...e,sourceIndex:i});});
  const used=new Set(),paragraphs=[];let missingChunks=0;
  for(const original of text.trim().split(/\n\s*\n/)){
    const {value,map}=normalizeMapped(original);const candidates=[];
    for(const [key] of buckets){if(!key)continue;let pos=0;while((pos=value.indexOf(key,pos))!==-1){const start=pos,end=pos+key.length;pos=end;const before=value[start-1]||'',after=value[end]||'';if(/[\p{L}\p{N}]/u.test(before)&&/[\p{L}\p{N}]/u.test(key[0]))continue;if(/[\p{L}\p{N}]/u.test(after)&&/[\p{L}\p{N}]/u.test(key.at(-1)))continue;candidates.push({start,end,key});}}
    candidates.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));
    const out=[];let cursor=0,acceptedEnd=0;
    function leftover(part){if(!part)return;if(!part.trim()){out.push({gap:true,sentence:part});return;}missingChunks++;out.push({sentence:part,analysis:'',paragraph:paragraphs.length});}
    for(const c of candidates){if(c.start<acceptedEnd)continue;const source=buckets.get(c.key).shift();if(!source)continue;const start=map[c.start],end=map[c.end-1]+1;leftover(original.slice(cursor,start));out.push({...source,sentence:original.slice(start,end)});used.add(source.sourceIndex);cursor=end;acceptedEnd=c.end;}
    leftover(original.slice(cursor));paragraphs.push(out);
  }
  return {paragraphs,used:used.size,unused:entries.length-used.size,missingChunks};
}
$('text-button').onclick=()=>$('text-input').click();
$('text-input').onchange=async e=>{
  const file=e.target.files[0];if(!file||!active)return;const target=active;
  try{if(file.size>500*1024)throw Error('原文 TXT 请控制在 500 KB 以内。');const text=await file.text();if(!text.trim())throw Error('原文为空。');if(text.includes('\ufffd'))throw Error('TXT 编码无法识别，请保存为 UTF-8。');const result=matchOriginal(text,target.entries);target.matchedParagraphs=result.paragraphs;target.matchReport=`原文匹配：${result.used} 句已关联；${result.unused} 条 Excel 句子未在原文找到；${result.missingChunks} 处原文未匹配（以虚线标示）。`;await saveArticle(target);if(activeId===target.id)selectArticle(target.id);toast('原文已载入，匹配结果显示在正文上方。');}catch(err){toast(err.message);}finally{e.target.value='';}
};
async function start(){applySettings();try{database=await openDatabase();articles=await dbAction('readonly',store=>store.getAll());articles.sort((a,b)=>b.createdAt-a.createdAt);}catch{$('save-state').textContent='浏览器存储不可用';}
  let id=null;try{id=localStorage.getItem(storageScope + 'judu-active');}catch{}
  if(articles.length)selectArticle(articles.find(a=>a.id===id)?.id||articles[0].id);else selectArticle(null);
  fetch('assets/AI提示词.md').then(r=>r.ok?r.text():Promise.reject()).then(t=>$('prompt-text').value=t).catch(()=>$('prompt-text').value='提示词文件加载失败，请查看文件夹内的 AI提示词.md。');
}
start();
