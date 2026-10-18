'use strict';
const mobileLayout=matchMedia('(max-width:700px)'),sidebar=document.querySelector('.sidebar'),toolbarActions=document.querySelector('.toolbar-actions');
const sidebarHome=document.createComment('sidebar-home'),actionsHome=document.createComment('actions-home');sidebar.before(sidebarHome);toolbarActions.before(actionsHome);
function arrangeMobile(){const destination=$('mobile-menu-content');if(mobileLayout.matches){destination.append(sidebar,toolbarActions);}else{$('mobile-menu').close();sidebarHome.after(sidebar);actionsHome.after(toolbarActions);}}
arrangeMobile();mobileLayout.addEventListener('change',arrangeMobile);
$('mobile-menu-open').onclick=()=>{resetHeld();closeLookup();$('mobile-menu').showModal();};$('mobile-menu-close').onclick=()=>$('mobile-menu').close();
// Close the menu during capture so the existing action can open its own dialog.
$('mobile-menu-content').addEventListener('click',e=>{if(e.target.closest('button,a'))$('mobile-menu').close();},true);
$('paste-open').onclick=()=>{resetHeld();closeLookup();$('paste-error').hidden=true;$('paste-dialog').showModal();};$('paste-close').onclick=()=>$('paste-dialog').close();
fetch('assets/文本解析AI提示词.md?v=2').then(r=>{if(!r.ok)throw Error();return r.text();}).then(t=>$('paste-prompt').value=t).catch(()=>$('paste-prompt').value='提示词加载失败，请查看 assets/文本解析AI提示词.md。');
$('paste-copy-prompt').onclick=async()=>{try{await navigator.clipboard.writeText($('paste-prompt').value);toast('文本解析提示词已复制。');}catch{$('paste-prompt').focus();$('paste-prompt').select();toast('请手动复制已选中的提示词。');}};
function parsePastedArticles(text){
 if(text.length>2*1024*1024)throw Error('文本过长，请分批导入（每批不超过 2 MB 字符）。');
 const raw=text.trim().replace(/^```(?:json)?\s*\n?/i,'').replace(/\s*```$/,'');let data;
 try{data=JSON.parse(raw);}catch{throw Error('解析文本不是完整的 JSON。请复制 AI 输出的全部内容，或让 AI 修复 JSON 格式；不要只复制其中几句。');}
 // Compact rows omit repeated field names; normalize before the same strict validation.
 if(data&&typeof data==='object'&&!Array.isArray(data)&&Array.isArray(data.rows))data={articles:[data]};
 if(data&&Array.isArray(data.articles))data={articles:data.articles.map(a=>{
  if(!a||!Array.isArray(a.rows))return a;
  if(a.rows.length>5000)throw Error('每篇最多 5000 句，请分批导入。');
  return{title:a.title,entries:a.rows.map((r,j)=>{
   if(!Array.isArray(r)||r.length!==4||typeof r[2]!=='string'||!r[2].trim()||typeof r[3]!=='string')throw Error(`紧凑格式第 ${j+1} 行需要四项：[段落序号, 原句, 完整翻译, 学习要点]。`);
   return{paragraph:r[0],sentence:r[1],analysis:'【完整翻译】\n'+r[2]+(r[3].trim()?'\n【学习要点】\n'+r[3]:'')};
  })};
 })};
 if(!data||!Array.isArray(data.articles)||!data.articles.length||data.articles.length>50)throw Error('需要 articles 数组，每批 1–50 篇文章。');
 return data.articles.map((a,i)=>{if(!a||typeof a.title!=='string'||!a.title.trim()||a.title.length>300||!Array.isArray(a.entries)||!a.entries.length||a.entries.length>5000)throw Error(`第 ${i+1} 篇缺少有效标题或 entries 句子列表（每篇 1–5000 句）。`);let last=0;const entries=a.entries.map((e,j)=>{if(!e||typeof e.sentence!=='string'||!e.sentence.trim()||e.sentence.length>30000||typeof e.analysis!=='string'||!e.analysis.trim()||e.analysis.length>100000||!Number.isInteger(e.paragraph)||e.paragraph<1||e.paragraph<last)throw Error(`第 ${i+1} 篇第 ${j+1} 句格式有误：需要非空 sentence、analysis，以及按顺序递增或相同的 paragraph 正整数。`);last=e.paragraph;return{sentence:e.sentence,analysis:e.analysis,paragraph:e.paragraph};});return{title:a.title.trim(),entries};});
}
$('paste-submit').onclick=async()=>{if(busy)return;$('paste-error').hidden=true;let parsed;try{parsed=parsePastedArticles($('paste-content').value);}catch(err){$('paste-error').textContent=err.message;$('paste-error').hidden=false;return;}busy=true;$('paste-submit').disabled=true;try{stopTutorial();const createdAt=Date.now(),batchId=crypto.randomUUID();const added=parsed.map((a,i)=>({...a,id:crypto.randomUUID(),filename:'粘贴解析文本',createdAt,batchId,batchIndex:i}));for(const a of added)await saveArticle(a);articles.unshift(...added);selectArticle(added[0].id);$('paste-dialog').close();$('paste-content').value='';toast(`已导入 ${added.length} 篇文章。`);}finally{busy=false;$('paste-submit').disabled=false;}};
function enableHorizontalSwipe(surface,kind){let gesture=null;
 surface.addEventListener('touchstart',e=>{if(e.touches.length!==1||e.target.closest('button,a,input,textarea,select,dialog')||document.querySelector('dialog[open]')){gesture=null;return;}if(kind==='article'&&(!active||!lookup.hidden)){gesture=null;return;}const t=e.touches[0];gesture={x:t.clientX,y:t.clientY,time:Date.now(),vertical:false};},{passive:true});
 surface.addEventListener('touchmove',e=>{if(!gesture)return;if(e.touches.length!==1){gesture=null;return;}const t=e.touches[0],dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;if(Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx))gesture.vertical=true;},{passive:true});
 surface.addEventListener('touchcancel',()=>gesture=null,{passive:true});
 surface.addEventListener('touchend',e=>{const g=gesture;gesture=null;if(!g||g.vertical||e.touches.length||Date.now()-g.time>1400||document.querySelector('dialog[open]'))return;const t=e.changedTouches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.6)return;cancelTouchPress();const direction=dx<0?1:-1;if(kind==='sentence'){if(lookup.hidden||!selected)return;const index=Number(selected.dataset.index);if(index+direction<0||index+direction>=visibleEntries.length){toast(direction>0?'已经是最后一句':'已经是第一句');return;}moveLookupSentence(direction);}else{if(!lookup.hidden)return;const i=articles.findIndex(a=>a.id===activeId),next=articles[i+direction];if(!next){toast(direction>0?'已经是最后一篇':'已经是第一篇');return;}navigateToArticle(next.id);}}, {passive:true});
}
enableHorizontalSwipe(lookup,'sentence');enableHorizontalSwipe($('drop-zone'),'article');
document.querySelector('.touch-hint').textContent='长按句子查看解析；解析内左滑下一句、右滑上一句，正文左右滑动切换文章。';
