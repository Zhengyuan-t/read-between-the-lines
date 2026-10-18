'use strict';
function showHome(e){e?.preventDefault();stopTutorial();resetHeld();$('mobile-menu').close();selectArticle(null);window.scrollTo({top:0,behavior:'instant'});}
document.querySelector('.brand').addEventListener('click',showHome);$('mobile-home').addEventListener('click',showHome);
function renderHome(){
 const home=!active;document.body.classList.toggle('is-home',home);$('home-library').hidden=!home||!articles.length;$('empty-state').hidden=!home||!!articles.length;$('hint').hidden=home;$('reader').hidden=home;
 if(!home)return;
 $('article-cards').replaceChildren();$('home-library-count').textContent=`${articles.length} 篇`;
 for(const article of articles){const card=element('button',undefined,'article-card');card.type='button';card.setAttribute('aria-label','阅读：'+article.title);card.append(element('strong',article.title),element('span',`${article.entries.length} 句${article.sample?' · 示例文章':''}`,'article-card-meta'),element('p',article.entries[0]?.sentence||'','article-card-excerpt'),element('span','继续阅读 →','article-card-action'));card.onclick=()=>navigateToArticle(article.id);const wrap=element('div',undefined,'article-card-wrap');const remove=element('button','删除','card-delete');remove.type='button';remove.setAttribute('aria-label','删除文章：'+article.title);remove.onclick=()=>requestArticleDeletion(article.id,true);wrap.append(card,remove);$('article-cards').append(wrap);}
}
