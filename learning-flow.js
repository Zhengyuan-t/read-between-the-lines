'use strict';
function updateLookupButtons(){const i=Number(selected?.dataset.index);$('lookup-previous').disabled=!selected||i<=0;$('lookup-next').disabled=!selected||i>=visibleEntries.length-1;}
$('lookup-previous').onclick=()=>moveLookupSentence(-1);$('lookup-next').onclick=()=>moveLookupSentence(1);
function cardArticleId(c){if(c.type==='vocab')return c.articleId;try{return JSON.parse(c.id)[0];}catch{return null;}}
function renderReadingWrapUp(){
 $('reading-wrap-up').hidden=!active;if(!active)return;
 const cards=reviewCards.filter(c=>cardArticleId(c)===activeId),vocab=cards.filter(c=>c.type==='vocab'),pending=vocab.filter(c=>!reviewReady(c)),due=cards.filter(c=>reviewReady(c)&&c.due<=Date.now());
 $('wrap-up-summary').textContent=cards.length?`这篇文章收藏了 ${vocab.length} 个表达、${cards.length-vocab.length} 个句子；${pending.length} 个待补释义，${due.length} 张卡已到期。`:'遇到想学的表达，可以用「标记生词」先收藏；句子解析也可以加入复习。';
 $('wrap-up-pending').disabled=!pending.length;$('wrap-up-pending').textContent=`补充释义${pending.length?'（'+pending.length+'）':''}`;
 $('wrap-up-review').disabled=!due.length;$('wrap-up-review').textContent=`复习到期内容${due.length?'（'+due.length+'）':''}`;
 $('wrap-up-next').disabled=articles.findIndex(a=>a.id===activeId)>=articles.length-1;
}
function reviewThisArticle(filter){if(!active)return;reviewArticleFilter=activeId;$('review-filter').value=filter;startReview();$('review-dialog').showModal();}
$('wrap-up-pending').onclick=()=>reviewThisArticle('pending');$('wrap-up-review').onclick=()=>reviewThisArticle('all');$('wrap-up-next').onclick=()=>$('next-article').click();
$('review-scope-clear').onclick=()=>{reviewArticleFilter=null;startReview();};
document.addEventListener('reviewchange',renderReadingWrapUp);setInterval(renderReadingWrapUp,30000);
