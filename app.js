'use strict';
const $ = (id) => document.getElementById(id);
const storageScope = 'judu-pages:' + new URL('.', location.href).pathname;
const reader = $('reader');
const lookup = $('lookup');
let articles = [], active = null, visibleEntries = [], activeId = null;
let database = null, hot = null, selected = null, geometry = [], geometryDirty = true;
let lastPointer = null, pointerStart = null, busy = false, recording = false, draftKeys = ['Space'];
const held = new Set();
let touchPress = null;
let lookupScrollTarget = null;
function cancelTouchPress(){if(touchPress){clearTimeout(touchPress.timer);touchPress=null;}}
const defaultNavigation={sentencePrevious:['ArrowUp'],sentenceNext:['ArrowDown'],articlePrevious:['ArrowLeft'],articleNext:['ArrowRight']};
const actionLabels={query:'查询句子',sentencePrevious:'上一句',sentenceNext:'下一句',articlePrevious:'上一篇',articleNext:'下一篇'};
const cloneNavigation=n=>Object.fromEntries(Object.entries(n).map(([k,v])=>[k,[...v]]));
let draftNavigation=cloneNavigation(defaultNavigation),recordingAction='query',recordingBefore=null,tutorial=null;
let settings = {keys: ['Space'], fontSize: 22,navigation:cloneNavigation(defaultNavigation)};
try { const s = JSON.parse(localStorage.getItem(storageScope + 'judu-settings')); if (s && Array.isArray(s.keys) && s.keys.length && s.keys.length < 8) settings = {keys:s.keys, fontSize: Math.min(32,Math.max(18,Number(s.fontSize)||22)),navigation:Object.fromEntries(Object.entries(defaultNavigation).map(([k,v])=>[k,Array.isArray(s.navigation?.[k])&&s.navigation[k].length&&s.navigation[k].length<8?s.navigation[k]:v]))}; } catch {}
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
function applySettings() { document.documentElement.style.setProperty('--font-size', settings.fontSize+'px');$('shortcut-label').textContent=chordLabel(settings.keys);geometryDirty=true;clearHot();$('lookup-key-hint').textContent=chordLabel(settings.navigation.sentencePrevious)+' / '+chordLabel(settings.navigation.sentenceNext)+' 上下句 · Esc 关闭';if(tutorial)renderTutorial(); }
function renderLibrary() {
  $('library').replaceChildren();$('library-count').textContent=articles.length;
  articles.forEach(a=>{const btn=element('button',undefined,'library-item'+(a.id===activeId?' active':''));btn.setAttribute('aria-current',a.id===activeId?'page':'false');btn.append(element('strong',a.title),element('small',`${a.entries.length} 句${a.sample?' · 示例文章':a.filename?' · '+a.filename:''}`));btn.onclick=()=>navigateToArticle(a.id);$('library').append(btn);});
}
function selectArticle(id) {
  cancelTouchPress();
  closeLookup(false);clearHot();activeId=id;active=articles.find(a=>a.id===id)||null;
  try{localStorage.setItem(storageScope + 'judu-active',id||'');}catch{}
  if(tutorial&&active&&!tutorial.ids.includes(active.id))stopTutorial();
  if(document.getElementById('mobile-article-label'))document.getElementById('mobile-article-label').textContent=active?.title||'阅读空间';
  renderLibrary();renderArticleNavigation();reader.replaceChildren();visibleEntries=[];geometryDirty=true;
  $('text-button').disabled=!active;$('delete-button').disabled=!active;$('empty-state').hidden=!!active;
  renderHome();
  if(!active){$('article-title').textContent='让每个句子，都读得明白。';$('toolbar-title').textContent='我的文章';$('article-meta').textContent=articles.length?'你的文章都在这里，选择一篇开始阅读。':'导入 Excel 或粘贴解析文本，开始阅读。';$('footer-count').textContent='留一点时间，给理解。';notify('');return;}
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
  if(tutorial)renderTutorial();
}
function groupRows(entries){const groups=[];let last=null;for(const entry of entries){if(last!==entry.paragraph){groups.push([]);last=entry.paragraph;}const p=groups.at(-1);if(p.length)p.push({gap:true,sentence:' '});p.push(entry);}return groups;}
function renderArticleNavigation(){
  const index=articles.findIndex(a=>a.id===activeId);
  $('article-navigation').hidden=index<0;
  if(index<0)return;
  const previous=articles[index-1],next=articles[index+1];
  $('article-position').textContent=`第 ${index+1} / ${articles.length} 篇`;
  $('previous-article').disabled=!previous;$('next-article').disabled=!next;
  $('previous-title').textContent=previous?.title||'已经是第一篇';
  $('next-title').textContent=next?.title||'已经是最后一篇';
}
function navigateToArticle(id){selectArticle(id);$('article-title').scrollIntoView({block:'start'});}
$('previous-article').onclick=()=>{const i=articles.findIndex(a=>a.id===activeId);if(i>0)navigateToArticle(articles[i-1].id);};
$('next-article').onclick=()=>{const i=articles.findIndex(a=>a.id===activeId);if(i>=0&&i<articles.length-1)navigateToArticle(articles[i+1].id);};
async function importFiles(input){
  const files=Array.from(input||[]);if(!files.length||busy)return;stopTutorial();
  busy=true;$('import-button').disabled=true;
  const added=[],failures=[],batchId=crypto.randomUUID(),createdAt=Date.now();
  try{
    for(let i=0;i<files.length;i++){
      const file=files[i];$('import-button').textContent=`正在导入 ${i+1} / ${files.length}…`;
      try{
        if(!/\.(xlsx|csv)$/i.test(file.name))throw Error('仅支持 .xlsx 或 .csv，旧 .xls 请先另存为 .xlsx。');
        if(file.size>10*1024*1024)throw Error('文件不能超过 10 MB。');
        const result=await ReaderImport.read(file);
        for(const a of result.articles){
          added.push({...a,title:result.articles.length===1&&/^(Sheet\d*|工作表\d*)$/i.test(a.title)?file.name.replace(/\.[^.]+$/,''):a.title,id:crypto.randomUUID(),filename:file.name,createdAt,batchId,batchIndex:added.length});
        }
      }catch(err){failures.push(`${file.name}：${err.message||'导入失败'}`);}
    }
    if(added.length){
      if(failures.length)added[0].warnings=[...(added[0].warnings||[]),'以下文件未导入：\n'+failures.join('\n')];
      articles.unshift(...added);
      for(const a of added)await saveArticle(a);
      navigateToArticle(added[0].id);
      toast(`已导入 ${added.length} 篇文章，共 ${added.reduce((n,a)=>n+a.entries.length,0)} 句${failures.length?`；${failures.length} 个文件失败，详情见正文上方`:''}`);
    }else toast(failures.slice(0,3).join('\n')||'没有找到可导入的文章。');
  }finally{busy=false;$('import-button').disabled=false;$('import-button').textContent='＋ 导入 Excel 文章';$('file-input').value='';}
}
async function loadSample(){
  try{
    const data=await Promise.all(['assets/sample.json','assets/sample-next.json'].map(async url=>{const res=await fetch(url);if(!res.ok)throw Error();return res.json();}));
    const createdAt=Date.now();const examples=data.map((data,i)=>{
      const prior=articles.find(a=>a.sample&&(a.sampleKey===String(i)||a.title===data.title));
      return {...data,id:prior?.id||crypto.randomUUID(),sample:true,sampleKey:String(i),createdAt,batchIndex:i};
    });
    articles=examples.concat(articles.filter(a=>!examples.some(e=>e.id===a.id)));
    for(const example of examples)await saveArticle(example);
    tutorial={step:0,ids:examples.map(a=>a.id)};navigateToArticle(examples[0].id);renderTutorial();
  }catch{toast('示例加载失败，请刷新页面或检查网站文件是否上传完整。');}
}
function stopTutorial(){tutorial=null;$('shortcut-tutorial').hidden=true;reader.querySelectorAll('.tutorial-target').forEach(el=>el.classList.remove('tutorial-target'));}
function advanceTutorial(action){
  if(!tutorial)return;
  const steps=['open','sentenceNext','sentencePrevious','close','articleNext','articlePrevious'];
  if(steps[tutorial.step]===action){tutorial.step=isTouchReading()&&action==='open'?6:tutorial.step+1;renderTutorial();}
}
function renderTutorial(){
  if(!tutorial)return;
  const mobile=isTouchReading();
  const stages=[
    ['打开句子解析',mobile?'长按下面高亮的第一句。':'按住查询键，再左键点击下面高亮的第一句。',mobile?['长按约半秒']:[...settings.keys,'MouseLeft']],
    ['试试下一句','解析已打开，按下快捷键，查看下一句。',settings.navigation.sentenceNext],
    ['回到上一句','再按上一句的快捷键，回到刚才的句子。',settings.navigation.sentencePrevious],
    ['回到文章','按 Esc 关闭解析。关闭后，上下方向键仍能正常滚动。',['Escape']],
    ['切换下一篇','现在没有打开解析，按快捷键进入第二篇示例。',settings.navigation.articleNext],
    ['返回上一篇','按上一篇的快捷键，返回博物馆故事。',settings.navigation.articlePrevious],
    ['练习完成',mobile?'你已学会长按查询。快捷键练习可在电脑端体验。':'你已学会查询、上下句和篇章切换。可以开始自由阅读，也可在设置中修改快捷键。',[]]
  ];
  const [title,description,keys]=stages[tutorial.step];
  $('shortcut-tutorial').classList.toggle('tutorial-docked',tutorial.step>0&&tutorial.step<6);
  $('shortcut-tutorial').hidden=false;$('tutorial-title').textContent=title;$('tutorial-description').textContent=description;
  $('tutorial-progress').textContent=tutorial.step<6?`快捷键练习 ${tutorial.step+1} / 6`:'快捷键练习已完成';
  $('tutorial-keys').replaceChildren(...keys.map(k=>element('kbd',k==='MouseLeft'?'左键单击':k==='Escape'?'Esc':keyName(k),'tutorial-key')));
  $('tutorial-skip').textContent=tutorial.step===6?'开始阅读':'跳过引导';
  reader.querySelectorAll('.tutorial-target').forEach(el=>el.classList.remove('tutorial-target'));
  if(tutorial.step===0&&activeId===tutorial.ids[0])reader.querySelector('.sentence')?.classList.add('tutorial-target');
}
$('tutorial-skip').onclick=stopTutorial;
function measure(){geometry=[];reader.querySelectorAll('.sentence').forEach(span=>{const range=document.createRange();range.selectNodeContents(span);for(const r of range.getClientRects()){if(r.width>0&&r.height>0)geometry.push({span,left:r.left+scrollX,right:r.right+scrollX,top:r.top+scrollY,bottom:r.bottom+scrollY});}});geometryDirty=false;}
function hitSentence(x,y){
  if(geometryDirty)measure();x+=scrollX;y+=scrollY;let best=null,bestScore=Infinity;
  for(const r of geometry){const dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom);if(dx>3||dy>6)continue;const score=dx*dx+dy*dy;if(score<bestScore){best=r.span;bestScore=score;}}
  return best;
}
function chordDown(e){const available=new Set(held);if(e?.altKey)available.add('Alt');if(e?.ctrlKey)available.add('Control');if(e?.metaKey)available.add('Meta');if(e?.shiftKey)available.add('Shift');return settings.keys.every(key=>available.has(key));}
function clearHot(){hot?.classList.remove('hot');hot=null;}
function updateHot(e){if(recording||!chordDown(e)){clearHot();return;}const next=hitSentence(e.clientX,e.clientY);if(next!==hot){clearHot();hot=next;hot?.classList.add('hot');}}
reader.addEventListener('pointermove',e=>{
  if(e.pointerType==='touch'){
    if(touchPress&&e.pointerId===touchPress.id&&Math.hypot(e.clientX-touchPress.x,e.clientY-touchPress.y)>10)cancelTouchPress();
    return;
  }
  lastPointer=e;updateHot(e);
});
reader.addEventListener('pointerleave',()=>{lastPointer=null;clearHot();});
reader.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch'){
    document.documentElement.classList.add('touch-input');
    if(!e.isPrimary){cancelTouchPress();return;}
    cancelTouchPress();const span=hitSentence(e.clientX,e.clientY);if(!span)return;
    if(e.cancelable)e.preventDefault();
    window.getSelection()?.removeAllRanges();
    const press={id:e.pointerId,x:e.clientX,y:e.clientY,span,timer:null};touchPress=press;
    press.timer=setTimeout(()=>{if(touchPress!==press)return;touchPress=null;showLookup(span,press.x,press.y);},550);
    return;
  }
  if(e.button!==0||!chordDown(e))return;const span=hitSentence(e.clientX,e.clientY);if(!span)return;e.preventDefault();pointerStart={x:e.clientX,y:e.clientY,span};});
reader.addEventListener('pointerup',e=>{const start=pointerStart;pointerStart=null;if(!start||e.button!==0||Math.hypot(start.x-e.clientX,start.y-e.clientY)>6)return;const span=hitSentence(e.clientX,e.clientY);if(span===start.span){e.preventDefault();showLookup(span,e.clientX,e.clientY);}});
document.addEventListener('pointerup',()=>{pointerStart=null;cancelTouchPress();});
document.addEventListener('pointercancel',()=>{pointerStart=null;cancelTouchPress();});
document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!e.isPrimary)cancelTouchPress();});
function isTouchReading(){return document.documentElement.classList.contains('touch-input')||document.documentElement.classList.contains('touch-reader');}
reader.addEventListener('contextmenu',e=>{if(e.pointerType==='touch'||isTouchReading())e.preventDefault();});
reader.addEventListener('selectstart',e=>{if(isTouchReading())e.preventDefault();},true);
document.addEventListener('selectionchange',()=>{
  if(!isTouchReading())return;const selection=window.getSelection();
  if(selection&&!selection.isCollapsed&&(reader.contains(selection.anchorNode)||reader.contains(selection.focusNode)))selection.removeAllRanges();
});
document.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')document.documentElement.classList.remove('touch-input');},true);
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
  updateReviewSave();
  advanceTutorial('open');
  lookup.hidden=false;lookup.scrollTop=0;lookup.style.visibility='hidden';lookup.style.left='12px';lookup.style.top='12px';
  requestAnimationFrame(()=>{const w=lookup.offsetWidth,h=lookup.offsetHeight;const left=Math.min(Math.max(12,x-24),innerWidth-w-12);let top=y+18;if(top+h>innerHeight-12)top=y-h-18;if(top<12)top=Math.max(12,Math.min(innerHeight-h-12,y-h/2));lookup.style.left=left+'px';lookup.style.top=top+'px';lookup.style.visibility='visible';if(keyboard)lookup.focus({preventScroll:true});});
}
function moveLookupSentence(direction){
  if(lookup.hidden||!selected)return;
  const index=Number(selected.dataset.index)+direction;
  if(index<0||index>=visibleEntries.length)return;
  const span=reader.querySelector(`.sentence[data-index="${index}"]`);
  if(!span)return;
  const popup=lookup.getBoundingClientRect();
  const oldScroll=scrollY;
  span.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  if(scrollY!==oldScroll)lookupScrollTarget=scrollY;
  showLookup(span,popup.left+24,popup.top-18,true);
  advanceTutorial(direction<0?'sentencePrevious':'sentenceNext');
}
function closeLookup(restoreFocus=false){lookupScrollTarget=null;lookup.hidden=true;if(restoreFocus)selected?.focus({preventScroll:true});selected?.classList.remove('selected');selected=null;}
$('lookup-close').onclick=()=>closeLookup(true);
document.addEventListener('pointerdown',e=>{if(!lookup.hidden&&!lookup.contains(e.target)){if(reader.contains(e.target)&&chordDown(e))return;closeLookup(false);}});
window.addEventListener('scroll',()=>{
  cancelTouchPress();
  if(lookupScrollTarget!==null&&Math.abs(scrollY-lookupScrollTarget)<1){lookupScrollTarget=null;return;}
  closeLookup(false);
},{passive:true});
window.addEventListener('resize',()=>{geometryDirty=true;closeLookup(false);});
new ResizeObserver(()=>{geometryDirty=true;}).observe(reader);
document.fonts?.ready.then(()=>{geometryDirty=true;});
function resetHeld(){cancelTouchPress();held.clear();pointerStart=null;clearHot();}
window.addEventListener('blur',resetHeld);document.addEventListener('visibilitychange',resetHeld);
function draftKeysFor(action){return action==='query'?draftKeys:draftNavigation[action];}
function setDraftKeys(action,keys){if(action==='query')draftKeys=[...keys];else draftNavigation[action]=[...keys];renderShortcutDrafts();}
function renderShortcutDrafts(){
  $('settings-shortcut').textContent=chordLabel(draftKeys);
  for(const action of Object.keys(defaultNavigation)){
    const btn=document.querySelector(`[data-record-action="${action}"]`);
    btn.textContent=recording&&recordingAction===action?'请按下组合键…':chordLabel(draftNavigation[action]);
    btn.classList.toggle('recording',recording&&recordingAction===action);
  }
  $('record-key').classList.toggle('recording',recording&&recordingAction==='query');
  $('record-key').textContent=recording&&recordingAction==='query'?'请按下组合键…':'录制自定义查询键';
}
function beginRecording(action){recordingBefore=[...draftKeysFor(action)];resetHeld();recording=true;recordingAction=action;renderShortcutDrafts();$('record-help').textContent=`正在录制「${actionLabels[action]}」：同时按下需要的键，再全部松开。Esc 取消。`;}
function keyboardMatches(e,keys){
  const actual=new Set(held);actual.add(canonicalKey(e.code));
  for(const [flag,key] of [['altKey','Alt'],['ctrlKey','Control'],['metaKey','Meta'],['shiftKey','Shift']]){if(e[flag])actual.add(key);else actual.delete(key);}
  return actual.size===keys.length&&keys.every(k=>actual.has(k));
}
function shortcutProblem(){
  const same=(a,b)=>a.length===b.length&&a.every(k=>b.includes(k));
  for(const [a,b] of [['sentencePrevious','sentenceNext'],['articlePrevious','articleNext']])if(same(draftNavigation[a],draftNavigation[b]))return `「${actionLabels[a]}」和「${actionLabels[b]}」不能使用相同的按键。`;
  for(const action of Object.keys(defaultNavigation)){
    const nav=draftNavigation[action];
    if(draftKeys.every(k=>nav.includes(k))||nav.every(k=>draftKeys.includes(k)))return `「${actionLabels[action]}」与查询键相互包含，会在查询前触发切换，请换一个组合。`;
  }
  return '';
}
document.addEventListener('keydown',e=>{
  if(e.isComposing)return;
  if(e.code==='Escape'){
    if(recording){e.preventDefault();e.stopPropagation();recording=false;if(recordingBefore)setDraftKeys(recordingAction,recordingBefore);renderShortcutDrafts();$('record-help').textContent='已取消录制。';}
    else{closeLookup(true);advanceTutorial('close');}
    resetHeld();return;
  }
  const key=canonicalKey(e.code);
  if(recording){e.preventDefault();e.stopPropagation();held.add(key);setDraftKeys(recordingAction,[...held].sort());$('record-help').textContent='松开全部按键后录制完成，再点击「保存设置」。';return;}
  if(isInput(e.target)||document.querySelector('dialog[open]'))return;
  held.add(key);
  if(!lookup.hidden&&selected){
    const action=['sentencePrevious','sentenceNext'].find(a=>keyboardMatches(e,settings.navigation[a]));
    if(action){e.preventDefault();moveLookupSentence(action==='sentencePrevious'?-1:1);return;}
  }else if(active){
    const action=['articlePrevious','articleNext'].find(a=>keyboardMatches(e,settings.navigation[a]));
    if(action){
      e.preventDefault();
      if(!e.repeat){const i=articles.findIndex(a=>a.id===activeId),next=i+(action==='articlePrevious'?-1:1);if(next>=0&&next<articles.length){navigateToArticle(articles[next].id);advanceTutorial(action);}}
      return;
    }
  }
  if(settings.keys.includes(key)){e.preventDefault();if(lastPointer)updateHot(lastPointer);}
});
document.addEventListener('keyup',e=>{
  held.delete(canonicalKey(e.code));if(canonicalKey(e.code)==='Meta')held.clear();clearHot();
  if(recording&&held.size===0){recording=false;renderShortcutDrafts();$('record-help').textContent=`已记录「${actionLabels[recordingAction]}」：${chordLabel(draftKeysFor(recordingAction))}。点击保存后生效。`;}
});
function openSettings(){resetHeld();closeLookup();draftKeys=[...settings.keys];draftNavigation=cloneNavigation(settings.navigation);recording=false;renderShortcutDrafts();$('font-size').value=settings.fontSize;$('font-value').textContent=settings.fontSize+' px';$('record-help').textContent='点击要修改的快捷键，按下组合后全部松开，再保存。Esc 用于取消或关闭解析；部分组合可能被系统占用。';$('settings-error').hidden=true;$('settings-dialog').showModal();}
$('settings-dialog').addEventListener('close',()=>{recording=false;resetHeld();});
$('settings-button').onclick=openSettings;$('hint-settings').onclick=openSettings;
document.querySelectorAll('[data-preset]').forEach(btn=>btn.onclick=()=>{recording=false;resetHeld();draftKeys=[btn.dataset.preset];renderShortcutDrafts();});
$('record-key').onclick=()=>beginRecording('query');
document.querySelectorAll('[data-record-action]').forEach(btn=>btn.onclick=()=>beginRecording(btn.dataset.recordAction));
$('font-size').oninput=e=>$('font-value').textContent=e.target.value+' px';
$('save-settings').onclick=()=>{
  if(recording){toast('请先完成按键录制。');return;}
  const error=shortcutProblem();$('settings-error').hidden=!error;$('settings-error').textContent=error;if(error)return;
  settings={keys:[...draftKeys],fontSize:Number($('font-size').value),navigation:cloneNavigation(draftNavigation)};
  try{localStorage.setItem(storageScope+'judu-settings',JSON.stringify(settings));}catch{toast('设置仅在本次阅读中生效。');}
  applySettings();$('settings-dialog').close();
};
$('reset-settings').onclick=()=>{recording=false;resetHeld();draftKeys=['Space'];draftNavigation=cloneNavigation(defaultNavigation);$('font-size').value=22;$('font-value').textContent='22 px';$('settings-error').hidden=true;renderShortcutDrafts();};
async function copy(text){try{await navigator.clipboard.writeText(text);toast('已复制');}catch{toast('复制未成功，请选中文本后手动复制。');}}
$('copy-analysis').onclick=()=>{if(selected){const a=visibleEntries[Number(selected.dataset.index)];copy(a.sentence+'\n\n'+(a.analysis||'尚无解析'));}};
$('copy-prompt').onclick=()=>copy($('prompt-text').value);
$('guide-button').onclick=()=>$('guide-dialog').showModal();
$('import-button').onclick=$('empty-import').onclick=()=>$('file-input').click();
$('file-input').onchange=e=>importFiles(e.target.files);
$('sample-button').onclick=$('empty-sample').onclick=loadSample;
let pendingArticleDeletion=null;
function requestArticleDeletion(id,fromHome=false){const article=articles.find(a=>a.id===id);if(!article)return;pendingArticleDeletion={id,fromHome};$('confirm-dialog').querySelector('h2').textContent='删除「'+article.title+'」？';$('confirm-dialog').querySelector('p').textContent='只从当前浏览器移除这篇文章，原始文件和已收藏的复习卡仍保留。';$('confirm-dialog').returnValue='cancel';$('confirm-dialog').showModal();}
$('delete-button').onclick=()=>requestArticleDeletion(activeId);
$('confirm-dialog').addEventListener('close',async()=>{const target=pendingArticleDeletion;pendingArticleDeletion=null;if($('confirm-dialog').returnValue!=='delete'||!target)return;try{if(database)await dbAction('readwrite',store=>store.delete(target.id));}catch{toast('删除未成功，请重试。');return;}articles=articles.filter(a=>a.id!==target.id);selectArticle(target.fromHome?null:articles[0]?.id||null);toast('文章已删除，复习卡仍保留。');});
let dragDepth=0;
document.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;}});
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop-overlay').hidden=true;}});
document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;importFiles(e.dataTransfer.files);});
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
async function start(){applySettings();try{database=await openDatabase();articles=await dbAction('readonly',store=>store.getAll());articles.sort((a,b)=>b.createdAt-a.createdAt||(a.batchIndex??0)-(b.batchIndex??0));}catch{$('save-state').textContent='浏览器存储不可用';}
  let id=null;try{id=localStorage.getItem(storageScope + 'judu-active');}catch{}
  if(articles.length&&id)selectArticle(articles.find(a=>a.id===id)?.id||null);else selectArticle(null);
  fetch('assets/AI提示词.md?v=20261018-1').then(r=>r.ok?r.text():Promise.reject()).then(t=>$('prompt-text').value=t).catch(()=>$('prompt-text').value='提示词文件加载失败，请查看文件夹内的 AI提示词.md。');
}
start();

const touchMedia=matchMedia('(hover: none) and (pointer: coarse)');
function updateTouchHint(){document.documentElement.classList.toggle('touch-reader',touchMedia.matches);}
updateTouchHint();touchMedia.addEventListener('change',updateTouchHint);
