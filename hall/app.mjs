import {games,selectGames} from './catalog.mjs';

const base=new URL('../',import.meta.url);
const url=path=>new URL(path,base).href;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key='vtlib:hall:preferences:v1';
let preferences={favorites:[],recent:[]},durable=true;
try {
  const data=JSON.parse(localStorage.getItem(key));
  if(data&&typeof data==='object')for(const kind of ['favorites','recent']) {
    if(Array.isArray(data[kind]))preferences[kind]=[...new Set(data[kind].filter(id=>games.some(g=>g.id===id)))];
  }
} catch { durable=false; }
const state={query:'',category:'all',tab:'all',sort:'recommended'};
const continuing=new Set();
function persist(){try{localStorage.setItem(key,JSON.stringify(preferences));}catch{durable=false;}document.querySelector('#preference-note').hidden=durable;}
function render() {
  const visible=selectGames(games,{...state,...preferences});
  document.querySelector('#game-count').textContent=`找到 ${visible.length} 款游戏`;
  document.querySelector('#all-count').textContent=games.length;
  document.querySelector('#favorite-count').textContent=preferences.favorites.length;
  document.querySelector('#recent-count').textContent=preferences.recent.length;
  document.querySelector('#games').innerHTML=visible.length?visible.map(g=>{
    const favorite=preferences.favorites.includes(g.id);
    return `<article class="game-card"><div class="card-art art-${g.id}" style="--scene:url('${url(g.art)}')"><span class="card-label">${esc(g.label)}</span><div class="card-cast" aria-hidden="true">${g.cast.map(id=>`<img src="${url(g.portraits?.[id]??`assets/units_big/${id}.webp`)}" alt="" loading="lazy" width="512" height="512">`).join('')}</div><button class="favorite" data-favorite="${g.id}" aria-label="${favorite?'取消收藏':'收藏'}${esc(g.title)}" aria-pressed="${favorite}">${favorite?'♥':'♡'}</button></div><div class="card-body"><p class="genre">${esc(g.category)}</p><h3><a data-game="${g.id}" href="${url(g.entry)}">${esc(g.title)}</a></h3><p class="description">${esc(g.description)}</p><ul class="tags">${g.tags.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><a class="play-link" data-game="${g.id}" href="${url(g.entry)}">${continuing.has(g.id)?'继续游戏':'开始游戏'}<span aria-hidden="true">↗</span></a></div></article>`;
  }).join(''):'<div class="empty"><span aria-hidden="true">✧</span><h3>这里还没有游戏</h3><p>'+ (state.tab==='favorites'?'点亮游戏封面上的爱心，把喜欢的作品留在这里。':state.tab==='recent'?'开始一款游戏后，它会出现在这里。':'换个关键词，或清除筛选再看看。')+'</p><button id="reset-filters">浏览全部游戏</button></div>';
  document.querySelector('#preference-note').hidden=durable;
}
function reset(){Object.assign(state,{query:'',category:'all',tab:'all',sort:'recommended'});document.querySelector('#search').value='';document.querySelector('#sort').value='recommended';sync();render();}
function sync(){for(const b of document.querySelectorAll('[data-tab]'))b.setAttribute('aria-pressed',String(b.dataset.tab===state.tab));for(const b of document.querySelectorAll('[data-category]'))b.setAttribute('aria-pressed',String(b.dataset.category===state.category));}
document.querySelector('#search').addEventListener('input',e=>{state.query=e.target.value;render();});
document.querySelector('#sort').addEventListener('change',e=>{state.sort=e.target.value;render();});
document.addEventListener('click',e=>{
  const favorite=e.target.closest('[data-favorite]');
  if(favorite){const id=favorite.dataset.favorite;preferences.favorites=preferences.favorites.includes(id)?preferences.favorites.filter(x=>x!==id):[...preferences.favorites,id];persist();render();document.querySelector(`[data-favorite="${id}"]`)?.focus();return;}
  const tab=e.target.closest('[data-tab]'),category=e.target.closest('[data-category]');
  if(tab||category){if(tab)state.tab=tab.dataset.tab;if(category)state.category=category.dataset.category;sync();render();}
  if(e.target.closest('#reset-filters'))reset();
  const game=e.target.closest('[data-game]');
  if(game){const id=game.dataset.game;if(games.some(g=>g.id===id)){preferences.recent=[id,...preferences.recent.filter(x=>x!==id)].slice(0,20);persist();}}
});
window.addEventListener('storage',e=>{if(e.key===key){try{const data=JSON.parse(e.newValue);for(const kind of ['favorites','recent'])preferences[kind]=Array.isArray(data?.[kind])?[...new Set(data[kind].filter(id=>games.some(g=>g.id===id)))]:[];render();}catch{/* Ignore malformed cross-tab data. */}}});
render();
async function loadExtras(){
  // Optional save/collectible modules must not prevent the cached hall from rendering offline.
  const [{loadSave},{listCollectibles}]=await Promise.all([import('../library/storage.mjs'),import('../library/collectibles.mjs')]);
  for(const gameId of ['studio-manager','midnight-store']){
    const save=await loadSave(gameId);
    if(save.ok&&save.value&&save.value.payload?.phase!=='complete')continuing.add(gameId);
  }
  if(continuing.has('studio-manager'))document.querySelector('#featured-play').textContent='继续经营';
  render();
  const result=await listCollectibles();
  const collectibles=document.querySelector('#collectibles');
  if(result.ok&&result.value.length)collectibles.innerHTML=result.value.map(c=>{const game=games.find(g=>g.id===c.gameId);return `<div class="souvenir"><span aria-hidden="true">✦</span><div><strong>${esc(c.title)}</strong><p>来自《${esc(game?.title??'未知作品')}》 · 本地记录</p></div>${game?`<a href="${url(game.entry)}">查看游戏</a>`:''}</div>`;}).join('');
  else if(!result.ok)collectibles.textContent='暂时无法读取纪念物。刷新页面后重试。';
}
async function loadUpcoming(){
  try{const response=await fetch(url('library/games.json'));if(!response.ok)throw Error('catalog');const upcoming=(await response.json()).filter(g=>g.status==='development');document.querySelector('#upcoming').innerHTML=upcoming.map(g=>`<div class="upcoming-item"><span>${esc(g.genre)}</span><h3>${esc(g.title)}</h3><p>${esc(g.description)}</p><small>开发中 · 暂未开放</small></div>`).join('');}catch{document.querySelector('#upcoming').textContent='新作预告暂时无法读取，已开放游戏仍可从上方进入。';}
}
loadUpcoming();
loadExtras().catch(()=>{document.querySelector('#collectibles').textContent='暂时无法读取本地记录，已开放游戏仍可进入。';});
if('serviceWorker' in navigator)navigator.serviceWorker.register(url('sw.js')).catch(()=>{});
