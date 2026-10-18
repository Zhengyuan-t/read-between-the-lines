'use strict';
const reviewKey=storageScope+'review-v1', reviewDay=86400000;
let reviewCards=[];
function validReview(c){return c&&typeof c.id==='string'&&typeof c.sentence==='string'&&c.sentence.length<=30000&&typeof c.analysis==='string'&&c.analysis.length<=100000&&typeof c.title==='string'&&typeof c.focus==='string'&&c.focus.length<=180&&Number.isFinite(c.due)&&Number.isInteger(c.stage)&&c.stage>=0&&c.stage<=6&&(c.type===undefined||c.type==='sentence'||c.type==='vocab'&&typeof c.term==='string'&&c.term.length>0&&c.term.length<=30000&&typeof c.definition==='string'&&c.definition.length<=2000&&typeof c.note==='string'&&c.note.length<=2000&&typeof c.articleId==='string'&&Number.isInteger(c.sentenceIndex)&&c.sentenceIndex>=0&&Number.isInteger(c.start)&&Number.isInteger(c.end)&&c.start>=0&&c.end>c.start&&c.end<=c.sentence.length&&c.term===c.sentence.slice(c.start,c.end));}
function reviewReady(c){return c.type!=='vocab'||!!(c.definition.trim()||c.note.trim());}
function reviewMatches(c){const filter=$('review-filter').value;return reviewReady(c)&&(filter==='all'||filter==='vocab'&&c.type==='vocab'||filter==='sentence'&&c.type!=='vocab');}
try{const data=JSON.parse(localStorage.getItem(reviewKey));if(Array.isArray(data))reviewCards=data.filter(validReview);}catch{}
let reviewQueue=[],reviewPosition=0,reviewRevealed=false,pendingReview=null;
function persistReview(next){try{localStorage.setItem(reviewKey,JSON.stringify(next));reviewCards=next;updateReviewCount();document.dispatchEvent(new Event('reviewchange'));return true;}catch{toast('复习卡未能保存，请先导出备份并检查浏览器存储空间。');return false;}}
function updateReviewCount(){const due=reviewCards.filter(c=>reviewReady(c)&&c.due<=Date.now()).length;$('review-count').textContent=due;$('review-open').setAttribute('aria-label',`轻量复习，${due} 张到期`);}
function currentReviewId(){return active&&selected?JSON.stringify([active.id,Number(selected.dataset.index)]):null;}
function updateReviewSave(){const saved=reviewCards.some(c=>c.id===currentReviewId());$('review-save').textContent=saved?'✓ 已加入复习':'＋ 加入复习';$('review-save').disabled=!visibleEntries[Number(selected?.dataset.index)]?.analysis||saved;}
$('review-save').onclick=()=>{const entry=visibleEntries[Number(selected?.dataset.index)];if(!entry?.analysis)return;pendingReview={id:currentReviewId(),sentence:entry.sentence,analysis:entry.analysis,title:active.title,focus:'',due:Date.now(),stage:0};resetHeld();closeLookup();$('review-focus').value='';$('review-save-dialog').showModal();};
$('review-save-close').onclick=()=>$('review-save-dialog').close();
$('review-save-form').onsubmit=e=>{e.preventDefault();if(!pendingReview)return;const card={...pendingReview,focus:$('review-focus').value.trim()};if(reviewCards.some(c=>c.id===card.id)){toast('这句话已经在复习卡中。');return;}if(persistReview([...reviewCards,card])){$('review-save-dialog').close();pendingReview=null;toast('已加入复习，随时可开始回忆。');}};
function startReview(){resetHeld();closeLookup();reviewQueue=reviewCards.filter(c=>reviewMatches(c)&&c.due<=Date.now()).sort((a,b)=>a.due-b.due).slice(0,5).map(c=>c.id);reviewPosition=0;renderReview();}
$('review-open').onclick=()=>{startReview();$('review-dialog').showModal();};
$('review-close').onclick=()=>$('review-dialog').close();
$('review-filter').onchange=startReview;
function renderReview(){
 const body=$('review-body');body.replaceChildren();reviewRevealed=false;
 const vocab=reviewCards.filter(c=>c.type==='vocab'),pending=vocab.filter(c=>!reviewReady(c));$('review-types').textContent=`生词 ${vocab.length} · 句子 ${reviewCards.length-vocab.length} · 待补释义 ${pending.length}`;
 if($('review-filter').value==='pending'){$('review-summary').textContent=pending.length?`${pending.length} 个生词待补释义，填写后进入复习。`:'没有待补释义的生词。';for(const c of pending){const row=element('div',undefined,'pending-word');row.append(element('strong',c.term),element('p',c.sentence,'small'));const edit=element('button','补充释义','secondary');edit.onclick=()=>openVocabEditor(c);const remove=element('button','移出列表','quiet');remove.onclick=()=>{if(persistReview(reviewCards.filter(x=>x.id!==c.id)))renderReview();};row.append(edit,remove);body.append(row);}return;}
const card=reviewCards.find(c=>c.id===reviewQueue[reviewPosition]);
 if(!card){const eligible=reviewCards.filter(reviewMatches),due=eligible.filter(c=>c.due<=Date.now()).length;$('review-summary').textContent=reviewQueue.length?'本轮完成。先休息一下，也可以继续。':'现在没有到期卡。';body.append(element('p',reviewCards.length?`共 ${reviewCards.length} 张复习卡。${due?`还有 ${due} 张到期。`:eligible.length?'下次到期：'+new Date(Math.min(...eligible.map(c=>c.due))).toLocaleString('zh-CN'):'当前分类没有可复习的卡片；可切换分类或补充生词释义。'}`:'阅读时打开句子解析，点击「加入复习」。每次选几个真正想学的表达即可。'));if(due){const b=element('button','再复习一轮','primary');b.onclick=startReview;body.append(b);}return;}
 $('review-summary').textContent=`本轮 ${reviewPosition+1} / ${reviewQueue.length} · 共 ${reviewCards.length} 张卡`;
 body.append(element('p',card.title,'small'),element('p',card.type==='vocab'?`回忆「${card.term}」在原句中的意思。`:card.focus||'不看解析，用自己的话解释这句话。','review-task'));
 const sentence=element('blockquote',card.sentence,'review-sentence');sentence.lang='en';body.append(sentence,element('p','先说出或想出答案，再核对。','muted'));
 const answer=element('div',undefined,'review-answer');answer.hidden=true;
 if(card.type==='vocab'){if(card.definition)answer.append(element('h3','英文释义'),element('p',card.definition));if(card.note)answer.append(element('h3','中文释义 / 备注'),element('p',card.note));const edit=element('button','修改释义','secondary');edit.onclick=()=>openVocabEditor(card);answer.append(edit);}
 const contextAnswer=card.type==='vocab'?element('details'):answer;if(card.type==='vocab'){contextAnswer.append(element('summary','查看原句解析'));answer.append(contextAnswer);}
 for(const section of analysisSections(card.analysis)){const box=element('section',undefined,'analysis-section');box.append(element('h3',section.title),element('p',section.lines.join('\n').trim()));contextAnswer.append(box);}
 const reveal=element('button','查看解析，核对答案','primary');const grades=element('div',undefined,'review-grades');grades.hidden=true;
 for(const [grade,label] of [['again','忘了 · 10 分钟后'],['hard','模糊 · 1 天后'],['good',`记住了 · ${[1,3,7,14,30,60][card.stage]||60} 天后`]]){const b=element('button',label,'secondary');b.onclick=()=>{if(!reviewRevealed)return;let stage=card.stage,delay;if(grade==='again'){stage=0;delay=600000;}else if(grade==='hard'){stage=Math.max(0,stage-1);delay=reviewDay;}else{delay=([1,3,7,14,30,60][stage]||60)*reviewDay;stage=Math.min(6,stage+1);}if(persistReview(reviewCards.map(c=>c.id===card.id?{...c,stage,due:Date.now()+delay}:c))){reviewPosition++;renderReview();}};grades.append(b);}
 reveal.onclick=()=>{answer.hidden=false;grades.hidden=false;reveal.hidden=true;reviewRevealed=true;};
 const remove=element('button','移出复习','quiet');remove.onclick=()=>{if(persistReview(reviewCards.filter(c=>c.id!==card.id))){reviewPosition++;renderReview();}};
 body.append(reveal,answer,grades,remove);
}
$('review-export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,cards:reviewCards},null,2)],{type:'application/json'}));const a=element('a');a.href=url;a.download='句读复习备份_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('review-import').onclick=()=>$('review-import-file').click();
$('review-import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('备份请控制在 10 MB 以内。');const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.cards)||data.cards.length>10000||!data.cards.every(validReview))throw Error('备份格式不正确，请使用句读导出的 JSON 文件。');const merged=new Map(reviewCards.map(c=>[c.id,c]));for(const c of data.cards)if(!merged.has(c.id))merged.set(c.id,c);if(persistReview([...merged.values()])){startReview();toast('备份已合并，现有卡片的进度保留。');}}catch(err){toast(err.message);}finally{e.target.value='';}};
updateReviewCount();setInterval(updateReviewCount,30000);
