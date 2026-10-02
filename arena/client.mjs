import {MAX_ROUND_ACTIONS,replayActions,restoreDraft} from './round-actions.mjs';
import { EVENT_LABELS,eventChanges,eventActors,actionFeedback } from './replay.mjs';
import { RULESET, migrateRun, ROSTER, FOODS, createRun, prepareTeam, battle, finishRound, trainingTeam, unitInfo, foodInfo, tierFor, addPreparationEvents } from './core.mjs';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='vc_async_arena_preview_v1',TOKEN='vc_async_arena_token_v1',PENDING='vc_async_arena_pending_v1';
const localPreview=['127.0.0.1','localhost'].includes(location.hostname);
const productionApi='https://hanari-d6gjqwx683f6c455d-1450980602.ap-shanghai.app.tcloudbase.com';
const apiBase=localPreview?(location.port==='8082'?location.origin:'http://127.0.0.1:8082'):productionApi;
let freezeMode=false,roundActions=false,draft=null,submissionPending=!!localStorage.getItem(PENDING);
let run=null,token=localStorage.getItem(TOKEN),online=false,cloud=false,busy=true,selected=null,lastBattle=null,mergeMode=false,eventIndex=0,playing=false,timer=null,toastTimer;
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.token===token){draft=saved.draft||null;roundActions=!!saved.roundActions;}}catch{}
const initialResume=!!token||!!localStorage.getItem(KEY);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Reuse classic mode's quiet sine tones, voice limits and saved mute setting.
const audio=ClassicBattleAudio.create({speed:()=>1100/Number($('speed').value),silent:()=>document.hidden});
const sfx=(key,opt)=>audio.sfx(key,opt);
function paintAudio(){audio.paintSfxBtn();$('sfxBtn').textContent=audio.enabled?'音效开':'音效关';$('sfxBtn').setAttribute('aria-pressed',String(audio.enabled));}
$('sfxBtn').addEventListener('click',()=>{audio.toggleSfx();paintAudio();if(audio.enabled)sfx('settle');});paintAudio();
document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.stopBattle();});
function actionSound(before,after,action){
 const keys={buy:'buy',sell:'sell',roll:'roll',food:'equip',move:'deploy',merge:'deploy',freeze:'spellIce',bonus:'settle'};
 if(keys[action.type])sfx(keys[action.type]);
 const upgraded=after.team.find(u=>u&&before.team.some(v=>v?.uid===u.uid&&v.level<u.level));
 if(upgraded)sfx(upgraded.level===3?'merge3':'merge2',{delay:.12});
}
let soundedEvent=-1;
function battleSound(event){
 if(soundedEvent===eventIndex)return;soundedEvent=eventIndex;
 const keys={revive:'cast',volley:'spellZap',tripleZap:'spellZap',lastWord:'impactArc',attackSnipe:'impactBlade',sniperSupport:'spellZap',revengeSnipe:'spellZap',shieldBreak:'cast',copy:'cast',rearGrow:'heal',hurtGrow:'heal',hurtGift:'heal',friendlyHit:'stunHit',knockout:'impactBlade',faintGrow:'heal',summonTrain:'heal',weakening:'spellZap',relayAttack:'cast',start:'battleStart',attack:'slash',shield:'shield',snipe:'spellZap',faint:'die',summon:'cast',support:'impactArc',cleave:'impactBlade',retaliate:'stunHit',buff:'heal',heal:'heal',roundEndStart:'settle',roundEnd:'heal'};
 if(eventIndex===lastBattle.battle.events.length-1){audio.stopBattle();sfx(lastBattle.battle.winner==='a'?(run.status==='won'?'finalWin':'win'):lastBattle.battle.winner==='b'?'lose':'settle',{delay:.08});}
 else if(keys[event.type])sfx(keys[event.type],{scale:true});
}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3300);}
async function request(path,body,auth=true){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);try{const res=await fetch(apiBase+'/api/arena/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth&&token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});const result=await res.json();if(!res.ok){const e=new Error(result.error||'服务暂时不可用');e.status=res.status;throw e;}return result;}catch(e){if(e.name==='AbortError')throw new Error('连接超时，点击连接状态重新同步');throw e;}finally{clearTimeout(timeout);}}
function localSave(nextRun=run,nextDraft=draft){localStorage.setItem(KEY,JSON.stringify({run:nextRun,lastBattle,token,draft:nextDraft,roundActions}));}
function acceptRemote(result){
 roundActions=!!result.capabilities?.roundActions;cloud=result.snapshotStore==='cloudbase-pg';
 const restored=restoreDraft(result.run,draft,token);
 if(draft&&!restored){draft=null;toast('云端对局已更新，已同步当前回合。');}
 run=restored||result.run;
 if('battle' in result)lastBattle=result.battle?{battle:result.battle,opponent:result.opponent}:null;
 localSave();
}
function savePending(path,input){localStorage.setItem(PENDING,JSON.stringify({token,path,input}));submissionPending=true;}
function clearPending(){localStorage.removeItem(PENDING);submissionPending=false;}
async function retryPending(){
 const pending=JSON.parse(localStorage.getItem(PENDING)||'null');if(!pending)return null;
 if(pending.token&&pending.token!==token){clearPending();return null;}
 try{const result=await request(pending.path,pending.input);draft=null;acceptRemote(result);clearPending();return result;}
 catch(e){if(e.status&&e.status<500){clearPending();if(e.status===409)return null;}throw e;}
}
const portrait=id=>unitInfo(id)?.portrait||`assets/units_big/${encodeURIComponent(unitInfo(id)?.baseId||id)}.webp`;
function stats(u){return `<div class="stats"><span class="atk"><i>⚔</i>${u.atk}</span><span class="hp"><i>♥</i>${Math.max(0,u.hp)}</span></div>`;}
function xp(u){return `<div class="xp-track" aria-label="经验 ${u.xp} / 5">${Array.from({length:5},(_,i)=>`<i class="${i<u.xp?'full':''}"></i>`).join('')}</div>`;}
function sprite(u,extra=''){
 const d=unitInfo(u.id);if(!d)return `<div class="portrait ${extra}" style="display:grid;place-items:center;font-size:45px">${u.id==='bee'?'🐝':'✨'}</div>`;
 if(d.art){const {atlas,columns,rows,index}=d.art;return `<span class="portrait atlas-portrait ${extra}" role="img" aria-label="${esc(d.name)}"><span class="atlas-cell" style="background-image:url('${esc(atlas)}');background-size:${columns*100}% ${rows*100}%;background-position:${index%columns*100/(columns-1)}% ${Math.floor(index/columns)*100/(rows-1)}%"></span></span>`;}
 return `<img class="portrait ${extra}" src="${portrait(u.id)}" alt="${esc(d.name)}" draggable="false">`;
}
function perk(u){return u.perk?`<span class="perk" title="${esc(foodInfo(u.perk)?.description)}">${foodInfo(u.perk)?.icon||''}</span>`:'';}
function unitName(u){return unitInfo(u.id)?.name||(u.id==='bee'?'小蜜蜂':u.id==='spark'?'星火伴舞':'伴舞');}
function unitMarkup(u){return `${sprite(u)}${perk(u)}<span class="unit-name">${esc(unitName(u))}<span class="level">${u.level}级</span></span>${stats(u)}${xp(u)}`;}
function showDetail(zone,slot){if(!run)return;$('detail').dataset.visible='true';const offer=zone==='team'?run.team[slot]:zone==='shop'?run.shop[slot]:run.foods[slot];if(!offer)return;
 if(zone==='foods'){const d=foodInfo(offer.id);$('detail').innerHTML=`<span class="detail-kicker">培养道具 · 3 金</span><div class="detail-portrait" style="display:grid;place-items:center;font-size:64px">${d.icon}</div><h2 class="detail-name">${esc(d.name)}</h2><p class="ability">${esc(d.description)}</p><p class="detail-levels">点击道具，再点击队员使用。携带型道具会替换原有携带效果。</p>`;return;}
 const d=unitInfo(offer.id),u=zone==='team'?offer:{...d,level:1,xp:0};$('detail').innerHTML=`<span class="detail-kicker">${d.tier} 阶角色 · ${u.level} 级</span>${sprite(u,'detail-portrait')}<h2 class="detail-name">${esc(d.name)}</h2>${stats(u)}<p class="ability">${d.title?`<strong>${esc(d.title)}</strong><br>`:''}${esc(d.ability)}</p>${d.hint?`<p class="outfit-description">配合建议：${esc(d.hint)}</p>`:''}${d.description?`<p class="outfit-description">${esc(d.description)}</p><a class="outfit-source" href="${esc(d.source)}" target="_blank" rel="noopener noreferrer">衣装资料 ↗</a>`:''}<div class="detail-levels">${d.kind==='friendlyHit'?'各等级固定 1 点伤害、5 次触发。':['copy','inheritSummon','weakening','relayAttack','lastWord','sniperSupport','tripleZap','revive'].includes(d.kind)?'升级效果见技能说明。':'二级、三级效果数值 ×2 / ×3，触发次数不变。'}<br>战斗增益仅本场生效。<br>升级经验：2 / 5 · 当前 ${u.xp}/5${u.perk?`<br>携带 ${foodInfo(u.perk).icon} ${esc(foodInfo(u.perk).name)}`:''}</div>`;
}
function selectedIs(zone,slot){return selected?.zone===zone&&selected.slot===slot;}
function render(){if(!run)return;$('teamTitle').textContent=run.teamName||'星域小队';$('round').textContent=run.round;$('wins').innerHTML=`${run.wins}<span>/10</span>`;$('lives').textContent=run.lives;$('gold').textContent=run.gold;$('tier').textContent=`${'一二三四五六'[tierFor(run.round)-1]}阶 · 第 ${run.round} 回合`;
 $('connection').textContent=online?(cloud?'● 异步联机 · 云端阵容库':'● 异步联机 · 点击同步'):token?'○ 联机未连接 · 点击重试':'○ 本地训练 · 点击连接';
 $('phaseNote').textContent=run.status==='won'?'十座奖杯！这次演出圆满收官。':run.status==='lost'?'本次演出告一段落，再组一支小队吧。':'招募队员，培养默契，向十胜出发。';
 $('connection').title=roundActions?'商店操作保存在本机，结束回合统一提交校验'+(draft?.actions.length?`；待提交 ${draft.actions.length} 次操作`:''):'点击重新同步云端存档';
 const unavailable=busy||submissionPending||run.status!=='prep'||(!!token&&!online&&!roundActions);
 $('team').innerHTML=[4,3,2,1,0].map(i=>{const u=run.team[i],sel=selectedIs('team',i);return `<button class="unit-slot ${u?'':'empty'} ${sel?'selected':''} ${selected&&selected.zone!=='team'?'target':''}" data-zone="team" data-slot="${i}" data-unit="${u?.uid||''}" draggable="${!!u&&!unavailable}" ${unavailable?'disabled':''} aria-label="${u?`${esc(unitName(u))}，${u.atk}攻击，${u.hp}生命`:`队伍空位 ${i+1}`}，${i===0?'前排':'后排'}"><span class="position-number">${i===0?'前排':i+1}</span>${u?unitMarkup(u):'<span class="plus">＋</span><small>招募队员</small>'}</button>`;}).join('');
 $('shop').innerHTML=run.shop.map((o,i)=>o?`<div class="shop-card ${selectedIs('shop',i)?'selected':''} ${o.frozen?'frozen':''}"><span class="tier-dot">${unitInfo(o.id).tier}阶</span><button class="freeze-button" data-freeze="shop" data-slot="${i}" ${unavailable?'disabled':''} title="${o.frozen?'解冻':'冻结'} ${esc(unitInfo(o.id).name)}" aria-label="${o.frozen?'解冻':'冻结'} ${esc(unitInfo(o.id).name)}">❄</button><button class="buy-unit" data-zone="shop" data-slot="${i}" draggable="${!unavailable}" ${unavailable?'disabled':''} aria-label="招募 ${esc(unitInfo(o.id).name)}">${unitMarkup({...unitInfo(o.id),level:1,xp:0})}<span class="price">3 <i class="mini-coin">✦</i></span></button></div>`:`<div class="shop-card"><div class="sold">已招募<br>刷新补充</div></div>`).join('');
 $('foods').innerHTML=run.foods.map((o,i)=>o?`<div class="food-card ${selectedIs('foods',i)?'selected':''} ${o.frozen?'frozen':''}"><button class="freeze-button" data-freeze="foods" data-slot="${i}" ${unavailable?'disabled':''} aria-label="${o.frozen?'解冻':'冻结'} ${esc(foodInfo(o.id).name)}">❄</button><button class="food-buy" data-zone="foods" data-slot="${i}" draggable="${!unavailable}" ${unavailable?'disabled':''} aria-label="购买 ${esc(foodInfo(o.id).name)}"><span class="food-icon">${foodInfo(o.id).icon}</span><span class="food-name">${esc(foodInfo(o.id).name)}</span></button><span class="price">3 <i class="mini-coin">✦</i></span></div>`:`<div class="food-card"><small>已使用</small></div>`).join('');
 $('hint').textContent=selected?.zone==='shop'?'点击队伍空位招募，或点击同名队员合并。':selected?.zone==='foods'?'点击一位队员使用培养道具。':selected?.zone==='team'?(mergeMode?'点击另一位同名队员合并。':'点击位置调整顺序；同名棋子会自动合并，或选择出售。'):'拖动或点选招募、培养、排序；队员可拖到出售。';
 $('sellBtn').disabled=unavailable||selected?.zone!=='team';$('mergeBtn').disabled=unavailable||selected?.zone!=='team';$('mergeBtn').textContent=mergeMode?'取消合并':'合并同名';$('rollBtn').disabled=unavailable||run.gold<1;$('fightBtn').disabled=unavailable||!run.team.some(Boolean);$('fightBtn').innerHTML=busy?'处理中…':run.status==='prep'?'结束回合 <span>⚔</span>':'本局已结束';$('newBtn').disabled=busy;$('freezeBtn').disabled=unavailable;$('freezeBtn').classList.toggle('active',freezeMode);$('freezeBtn').setAttribute('aria-pressed',String(freezeMode));$('freezeBtn').textContent=freezeMode?'❄ 点击商品冻结':'❄ 冻结';
 $('bonus').hidden=!run.bonusOffer;if(run.bonusOffer)$('bonus').innerHTML=`升级奖励：选择一位高阶角色加入商店${run.bonusOffer.map((o,i)=>`<button class="small-button" data-bonus="${i}" ${unavailable?'disabled':''}>${esc(unitInfo(o.id).name)} · 3金</button>`).join('')}`;
 if(lastBattle){$('recent').textContent=`${lastBattle.opponent.name} · ${lastBattle.opponent.source==='player'?'玩家历史阵容':'训练队伍'}\n${lastBattle.battle.winner==='a'?'胜利 +1 奖杯':lastBattle.battle.winner==='b'?'失利 −1 生命':'平局'}`;$('replayBtn').hidden=false;}
 $('detail').dataset.visible=selected?'true':'false';bindCards();if(selected)showDetail(selected.zone,selected.slot);
}
async function mutate(action){if(busy||submissionPending||!run)return;const before=structuredClone(run);let feedback=[];busy=true;render();try{
 if(token&&roundActions){
  const nextDraft=draft||{token,ruleset:run.ruleset,revision:run.revision,actions:[]};
  if(nextDraft.actions.length>=MAX_ROUND_ACTIONS)throw new Error('本回合操作次数已达上限，请结束回合');
  const next=replayActions(run,[action]),queued={...nextDraft,actions:[...nextDraft.actions,structuredClone(action)]};
  localSave(next,queued);run=next;draft=queued;
 }else if(online){const input={requestId:crypto.randomUUID(),revision:run.revision,action};savePending('action',input);const result=await request('action',input);acceptRemote(result);clearPending();}
 else{if(token)throw new Error('请先点击连接状态恢复联机');const copy=replayActions(run,[action]);copy.revision++;localSave(copy);run=copy;}
 feedback=actionFeedback(before,run,action,unitInfo);actionSound(before,run,action);selected=null;mergeMode=false;
 }catch(e){toast(e.message);if(submissionPending)await recover(e);}finally{busy=false;render();if(feedback.length)showPrepFeedback(feedback);}}
async function recover(error){try{
 if(error.status&&error.status<500)clearPending();else{const recovered=await retryPending();if(recovered){online=true;return;}}
 const result=await request('last-battle');acceptRemote(result);online=true;
 }catch{online=false;toast('连接已断开，商店进度已保存在本机；点击连接状态重试原提交。');}}

function selectCard(zone,slot){
 if(busy)return;
 if(freezeMode&&(zone==='shop'||zone==='foods')){mutate({type:'freeze',zone,slot});return;}
 if(selectedIs(zone,slot)){selected=null;mergeMode=false;render();return;}
 if(zone==='team'&&selected){
  if(selected.zone==='shop'){
   const dest=run.team[slot],offer=run.shop[selected.slot];
   if(!dest||(dest.id===offer?.id&&dest.xp<5)){mutate({type:'buy',slot:selected.slot,to:slot});return;}
   // An occupied incompatible slot selects its existing teammate.
  }else if(selected.zone==='foods'){
   if(run.team[slot]){mutate({type:'food',slot:selected.slot,to:slot});return;}
   selected=null;mergeMode=false;render();return;
  }else{mutate({type:mergeMode||(run.team[selected.slot]?.id===run.team[slot]?.id)?'merge':'move',from:selected.slot,to:slot});return;}
 }
 if(zone==='team'&&!run.team[slot])return;
 selected={zone,slot};mergeMode=false;render();
}
let drag=null,suppressClickUntil=0;
function beginDrag(e,el){
 if(busy||e.button!==0||el.disabled||freezeMode)return;
 const zone=el.dataset.zone,slot=+el.dataset.slot;
 if(zone==='team'&&!run.team[slot])return;
 drag={zone,slot,el,pointerId:e.pointerId,x:e.clientX,y:e.clientY,active:false};
 el.setPointerCapture(e.pointerId);
}
function dropAction(source,target){
 if(!target)return null;
 if(target.id==='sellBtn')return source.zone==='team'?{type:'sell',slot:source.slot}:null;
 const to=+target.dataset.slot,dest=run.team[to];
 if(source.zone==='team'){
  if(source.slot===to)return null;
  const unit=run.team[source.slot];
  if(dest?.id===unit.id){if(dest.xp>=5)return null;return {type:'merge',from:source.slot,to};}
  return {type:'move',from:source.slot,to};
 }
 if(run.gold<3)return null;
 if(source.zone==='shop')return !dest||(dest.id===run.shop[source.slot]?.id&&dest.xp<5)?{type:'buy',slot:source.slot,to}:null;
 return dest&&!(run.foods[source.slot]?.id==='chocolate'&&dest.xp>=5)?{type:'food',slot:source.slot,to}:null;
}
function clearDropMarks(){document.querySelectorAll('.drop-valid,.drop-invalid').forEach(el=>el.classList.remove('drop-valid','drop-invalid'));}
function endDrag(cancel=false){
 if(!drag)return;
 const source=drag;drag=null;
 if(source.el.hasPointerCapture(source.pointerId))source.el.releasePointerCapture(source.pointerId);
 source.el.classList.remove('drag-source');source.ghost?.remove();clearDropMarks();
 if(!source.active)return;
 suppressClickUntil=performance.now()+450;selected=null;mergeMode=false;
 const action=!cancel&&source.action;
 if(action)mutate(action);else{render();if(!cancel)toast('拖到高亮位置即可操作；松开到其他地方会取消。');}
}
document.addEventListener('pointermove',e=>{
 if(!drag||drag.pointerId!==e.pointerId)return;
 if(!drag.active&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<9)return;
 if(!drag.active){
  drag.active=true;sfx('drag');selected=null;mergeMode=false;$('detail').dataset.visible='false';
  drag.el.classList.add('drag-source');
  const ghost=document.createElement('div');ghost.className='drag-token';ghost.setAttribute('aria-hidden','true');
  ghost.innerHTML=drag.zone==='foods'?`<span class="food-icon">${foodInfo(run.foods[drag.slot].id).icon}</span>`:unitMarkup(drag.zone==='team'?run.team[drag.slot]:{...unitInfo(run.shop[drag.slot].id),level:1,xp:0});
  document.body.append(ghost);drag.ghost=ghost;
  if(drag.zone==='team')$('sellBtn').disabled=false;
  $('hint').textContent='拖到队伍位置购买、合并或调整顺序；队员可拖到出售。';
 }
 e.preventDefault();drag.ghost.style.left=`${e.clientX}px`;drag.ghost.style.top=`${e.clientY}px`;
 clearDropMarks();
 const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-zone="team"],#sellBtn');
 drag.action=dropAction(drag,target);if(target?.id==='sellBtn'&&drag.action&&drag.hover!==target)sfx('sellhint');drag.hover=target;target?.classList.add(drag.action?'drop-valid':'drop-invalid');
},{passive:false});
document.addEventListener('pointerup',e=>{if(drag?.pointerId===e.pointerId)endDrag();});
document.addEventListener('pointercancel',e=>{if(drag?.pointerId===e.pointerId)endDrag(true);});
window.addEventListener('blur',()=>endDrag(true));
function bindCards(){
 document.querySelectorAll('[data-zone]').forEach(el=>{
  el.draggable=false;
  el.addEventListener('pointerdown',e=>beginDrag(e,el));
  el.addEventListener('pointerleave',()=>{if(!selected)$('detail').dataset.visible='false';});
  el.addEventListener('click',e=>{if(performance.now()<suppressClickUntil){e.preventDefault();return;}selectCard(el.dataset.zone,+el.dataset.slot);});
  el.addEventListener('pointerenter',()=>{if(!drag?.active)showDetail(el.dataset.zone,+el.dataset.slot);});
  el.addEventListener('focus',()=>showDetail(el.dataset.zone,+el.dataset.slot));
 });
 document.querySelectorAll('[data-freeze]').forEach(el=>el.addEventListener('click',()=>mutate({type:'freeze',zone:el.dataset.freeze,slot:+el.dataset.slot})));
 document.querySelectorAll('[data-bonus]').forEach(el=>el.addEventListener('click',()=>mutate({type:'bonus',slot:+el.dataset.bonus})));
}
let prepTimers=[];
function showPrepFeedback(notes){
 if(notes.some(n=>n.text?.includes('回合开始')))sfx('settle');
 for(const timer of prepTimers)clearTimeout(timer);prepTimers=[];document.querySelectorAll('.prep-pop,.prep-departure').forEach(el=>el.remove());
 $('prepFeedback').innerHTML=notes.map(n=>`<span>${esc(n.text)}</span>`).join('');$('prepFeedback').classList.add('active');
 const gold=notes.filter(n=>n.gold).reduce((sum,n)=>sum+n.gold,0);if(gold&&!reduced)$('gold').animate([{color:'#b48224',transform:'scale(1)'},{color:'#b48224',transform:'scale(1.2)'},{color:'',transform:'scale(1)'}],{duration:650});
 for(const note of notes){if(note.departure){const slot=$('team').querySelector(`[data-slot="${note.departure.slot}"]`),ghost=document.createElement('div');ghost.className='prep-departure';ghost.innerHTML=sprite(note.departure.unit);slot.append(ghost);prepTimers.push(setTimeout(()=>ghost.remove(),650));}if(note.shop&&!reduced)for(const portrait of $('shop').querySelectorAll('.portrait'))portrait.animate([{opacity:.4,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:360,easing:'cubic-bezier(.22,1,.36,1)'});}
 for(const note of notes)for(const uid of note.uids||[]){const card=[...$('team').querySelectorAll('[data-unit]')].find(el=>el.dataset.unit===uid);if(!card)continue;const badge=document.createElement('span');badge.className='prep-pop';badge.textContent=note.level?`升至 ${note.level} 级`:note.gold?`+${note.gold} 金币`:note.atk||note.hp?`${note.atk?`+${note.atk}⚔`:''} ${note.hp?`+${note.hp}♥`:''}`:note.caption||'技能触发';card.append(badge);if(!reduced){const portrait=card.querySelector('.portrait');if(portrait)portrait.animate([{filter:'drop-shadow(0 0 0 #91bb79)'},{filter:'drop-shadow(0 0 10px #91bb79)',transform:'translateY(-3px)'},{filter:'drop-shadow(0 0 0 #91bb79)',transform:'translateY(0)'}],{duration:700});}prepTimers.push(setTimeout(()=>badge.remove(),2600));}
 prepTimers.push(setTimeout(()=>$('prepFeedback').classList.remove('active'),7000));
}
async function fight(){if(busy||submissionPending)return;busy=true;selected=null;freezeMode=false;render();try{
 let result;
 if(token){
  if(!online)throw new Error('请先点击连接状态恢复联机；商店操作已保存在本机');
  const input={requestId:crypto.randomUUID(),revision:run.revision,...(roundActions?{actions:draft?.actions||[]}: {})};savePending('battle',input);
  result=await request('battle',input);draft=null;acceptRemote(result);clearPending();
 }else{
  const next=structuredClone(run),team=prepareTeam(next),seed=crypto.randomUUID(),replay=addPreparationEvents(battle(team,trainingTeam(next.round,seed),seed),next);
  const opponent={name:`第 ${next.round} 回合训练小队`,source:'training',round:next.round};finishRound(next,replay);next.revision++;result={run:next,battle:replay,opponent};run=result.run;lastBattle={battle:result.battle,opponent:result.opponent};localSave();
 }
 showBattle();
 }catch(e){toast(e.message);if(submissionPending){const revision=run.revision;await recover(e);if(lastBattle&&run.revision!==revision)showBattle();}}finally{busy=false;render();}}

let battleAnimations=[];
function clearBattleFx(){for(const a of battleAnimations)a.cancel();battleAnimations=[];$('battleFx').replaceChildren();}
function changeLabel(c){if(!c)return '';return [[c.hp,'生命'],[c.shield,'护盾'],[c.atk,'攻击']].filter(([n])=>n).map(([n,label])=>`${n>0?'+':'−'}${Math.abs(n)}${label}`).join(' · ');}
function battleUnits(team,side,changes,actors,type){
 const label=EVENT_LABELS[type]?.[1]||'技能触发';
 const cards=team.map((u,i)=>{if(!u)return `<div class="battle-unit vacant" style="grid-column:${side==='a'?5-i:i+1};grid-row:1"></div>`;const c=changes.find(c=>c.side===side&&c.uid===u.uid),actor=actors.some(a=>a.side===side&&a.uid===u.uid),hurt=c?.hp<0,enter=c?.type==='enter';
 const notices=[];if(c?.hp)notices.push(`<b class="float-number ${hurt?'damage':'healing'}">${hurt?'−':'+'}${Math.abs(c.hp)} ♥</b>`);if(c?.shield)notices.push(`<b class="float-shield">${c.shield>0?'+':'−'}${Math.abs(c.shield)} ◈</b>`);if(c?.atk>0)notices.push(`<b class="float-buff">+${c.atk} ⚔</b>`);
 return `<div class="battle-unit ${hurt?'is-hit':''} ${enter?'is-entering':''} ${actor?'is-actor':''} ${c?.hp>0?'is-healed':''}" data-side="${side}" data-uid="${esc(u.uid)}" style="grid-column:${side==='a'?5-i:i+1};grid-row:1">${i===0?'<span class="front-tag">前排</span>':''}<div class="sprite-motion">${sprite(u)}</div>${perk(u)}${type!=='hurtGrow'&&unitInfo(u.id)?.kind==='hurt'&&c?.atk>0?'<span class="skill-badge">受伤成长</span>':''}${actor&&type!=='attack'?`<span class="skill-badge">${esc(label)}</span>`:''}${enter?'<span class="skill-badge">新队员登场</span>':''}<div class="floating-stats">${notices.join('')}</div><span class="unit-name">${esc(unitName(u))}</span><div class="health-track" aria-label="生命 ${Math.max(0,u.hp)} / ${u.maxhp||u.hp}"><i style="width:${Math.min(100,Math.max(0,u.hp)/(u.maxhp||u.hp||1)*100)}%"></i></div>${stats(u)}${u.shield?`<span class="shield-value">◈ ${u.shield} 护盾</span>`:''}${changeLabel(c)?`<span class="change-readout">${esc(changeLabel(c))}</span>`:''}</div>`;
 }).join('');
 return cards+changes.filter(c=>c.side===side&&c.type==='exit').map(c=>`<div class="battle-unit is-exiting" data-ghost="${esc(c.uid)}" style="left:${side==='a'?(4-(lastBattle.battle.events[eventIndex-1]?.[side]||[]).findIndex(u=>u?.uid===c.uid))*20:(lastBattle.battle.events[eventIndex-1]?.[side]||[]).findIndex(u=>u?.uid===c.uid)*20}%"><div class="sprite-motion">${sprite(c.unit)}</div><span class="skill-badge">退场</span><span class="unit-name">${esc(unitName(c.unit))}</span></div>`).join('');
}
function syncLineup(container,html){
 const existing=new Map([...container.querySelectorAll('[data-uid]')].map(el=>[el.dataset.uid,{el,rect:el.getBoundingClientRect()}])),parentRect=container.getBoundingClientRect(),template=document.createElement('div');template.innerHTML=html;
 const nodes=[...template.children];
 for(let i=0;i<nodes.length;i++){const fresh=nodes[i],old=existing.get(fresh.dataset.uid);if(old){const portrait=old.el.querySelector('.portrait');if(portrait)fresh.querySelector('.portrait').replaceWith(portrait);old.el.className=fresh.className;old.el.style.cssText=fresh.style.cssText;old.el.replaceChildren(...fresh.childNodes);nodes[i]=old.el;}else if(fresh.dataset.ghost){const fallen=existing.get(fresh.dataset.ghost);if(fallen){fresh.style.left=(fallen.rect.left-parentRect.left)+'px';fresh.style.width=fallen.rect.width+'px';}}}
 container.replaceChildren(...nodes);
 if(!reduced)for(const node of nodes){const old=existing.get(node.dataset.uid);if(!old)continue;const next=node.getBoundingClientRect(),dx=old.rect.left-next.left,dy=old.rect.top-next.top;if(Math.abs(dx)+Math.abs(dy)>1)battleAnimations.push(node.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:Math.min(420,Number($('speed').value)*.55),easing:'cubic-bezier(.22,1,.36,1)'}));}
}
function visualEffects(event,changes,actors){
 if(reduced)return;const scene=$('battleFx').parentElement,rect=scene.getBoundingClientRect(),duration=Math.min(680,Number($('speed').value)*.84);
 const find=(side,uid)=>[...scene.querySelectorAll('[data-uid]')].find(el=>el.dataset.side===side&&el.dataset.uid===uid);
 const targets=changes.filter(c=>c.hp<0||c.shield<0);
 for(const actor of actors){const from=find(actor.side,actor.uid);if(!from)continue;let victim=(event.targets||[]).find(c=>c.side!==actor.side)||(event.targets||[]).find(c=>c.uid!==actor.uid)||targets.find(c=>c.side!==actor.side);if(!victim&&event.type==='attack'){const side=actor.side==='a'?'b':'a',u=event[side].find(Boolean);if(u)victim={side,uid:u.uid};}const to=victim&&find(victim.side,victim.uid);if(!to)continue;
 const fr=from.getBoundingClientRect(),tr=to.getBoundingClientRect(),x=fr.left+fr.width/2-rect.left,y=fr.top+fr.height*.4-rect.top,tx=tr.left+tr.width/2-rect.left,ty=tr.top+tr.height*.4-rect.top;
 const slash=document.createElement('span');slash.className=`battle-projectile ${event.type==='attack'?'slash':'magic'}`;slash.textContent=event.type==='attack'?'✦':'◆';slash.style.left=x+'px';slash.style.top=y+'px';$('battleFx').append(slash);battleAnimations.push(slash.animate([{transform:'translate(-50%,-50%) scale(.4)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.15},{transform:`translate(calc(-50% + ${tx-x}px),calc(-50% + ${ty-y}px)) scale(1.4)`,opacity:1,offset:.8},{transform:`translate(calc(-50% + ${tx-x}px),calc(-50% + ${ty-y}px)) scale(2)`,opacity:0}],{duration,fill:'forwards',easing:'ease-in'}));
 if(event.type==='attack')battleAnimations.push(from.querySelector('.sprite-motion').animate([{transform:'translate(0,0) rotate(0)'},{transform:`translate(${-(tx-x)*.035}px,${-(ty-y)*.02}px) rotate(${actor.side==='a'?-3:3}deg)`,offset:.18},{transform:`translate(${(tx-x)*.14}px,${(ty-y)*.1}px) rotate(${actor.side==='a'?3:-3}deg)`,offset:.46},{transform:`translate(${-(tx-x)*.015}px,0) rotate(0)`,offset:.78},{transform:'translate(0,0) rotate(0)'}],{duration,easing:'cubic-bezier(.33,0,.2,1)'}));
 }
}
function drawEvent(){
 clearBattleFx();const event=lastBattle.battle.events[eventIndex],previous=lastBattle.battle.events[eventIndex-1],changes=eventChanges(event,previous),actors=eventActors(event,previous,unitName),[icon,label]=EVENT_LABELS[event.type]||['✦','技能触发'];
 syncLineup($('battleA'),battleUnits(event.a,'a',changes,actors,event.type));syncLineup($('battleB'),battleUnits(event.b,'b',changes,actors,event.type));$('battleText').textContent=event.text;$('eventBadge').textContent=`${icon} ${label}`;$('battleStep').textContent=`${eventIndex+1} / ${lastBattle.battle.events.length}`;$('battleProgress').value=eventIndex+1;$('battleProgress').max=lastBattle.battle.events.length;
 $('battleLog').innerHTML=lastBattle.battle.events.slice(Math.max(0,eventIndex-2),eventIndex+1).map((e,i,list)=>`<li class="${i===list.length-1?'current':''}"><span>${esc(EVENT_LABELS[e.type]?.[1]||'技能')}</span>${esc(e.text)}</li>`).join('');
 visualEffects(event,changes,actors);battleSound(event);
 if(eventIndex===lastBattle.battle.events.length-1){playing=false;const win=lastBattle.battle.winner;$('battleTitle').textContent=run.status==='won'?'十胜达成，圆满收官！':run.status==='lost'?'演出落幕，下次再会。':win==='a'?'默契登台，收下一座奖杯！':win==='b'?'差一点，再调整一下队伍。':'势均力敌，双方平局。';$('continueBtn').hidden=false;$('continueBtn').textContent=run.status==='prep'?'查看结果':'查看结果';$('skipBtn').hidden=true;$('battleDialog').dataset.result=win;$('eventBadge').textContent=win==='a'?'🏆 胜利':win==='b'?'⚑ 失利':'⚖ 平局';}
 $('pauseBattle').textContent=playing?'暂停':'播放';$('nextEvent').disabled=eventIndex===lastBattle.battle.events.length-1;$('pauseBattle').disabled=eventIndex===lastBattle.battle.events.length-1;
}
function scheduleStep(){clearTimeout(timer);if(playing)timer=setTimeout(()=>{if(!playing)return;eventIndex++;drawEvent();scheduleStep();},Number($('speed').value));}
function showBattle(){if(!lastBattle)return;clearTimeout(timer);eventIndex=0;soundedEvent=-1;audio.stopBattle();playing=true;delete $('battleDialog').dataset.result;$('battleA').replaceChildren();$('battleB').replaceChildren();$('battleTitle').textContent='舞台交锋';$('opponentLabel').textContent=`对手：${lastBattle.opponent.name} · ${lastBattle.opponent.source==='player'?'真人历史阵容，对方无需在线':'训练队伍'}`;$('continueBtn').hidden=true;$('skipBtn').hidden=false;if(!$('battleDialog').open)$('battleDialog').showModal();drawEvent();scheduleStep();}
$('pauseBattle').addEventListener('click',()=>{playing=!playing;if(!playing)audio.stopBattle();$('pauseBattle').textContent=playing?'暂停':'播放';scheduleStep();});
$('nextEvent').addEventListener('click',()=>{playing=false;clearTimeout(timer);if(eventIndex<lastBattle.battle.events.length-1)eventIndex++;drawEvent();});
$('restartBattle').addEventListener('click',showBattle);$('speed').addEventListener('change',scheduleStep);

async function newRun(teamName='星域小队'){busy=true;render();try{
 if(submissionPending)throw new Error('请先点击连接状态确认上一回合提交结果');
 if(online){const result=await request('runs',{teamName},false);token=result.token;localStorage.setItem(TOKEN,token);draft=null;lastBattle=null;acceptRemote(result);clearPending();}
 else{if(token)throw new Error('请先恢复联机再开始新一局');draft=null;lastBattle=null;run=createRun(crypto.randomUUID());run.teamName=teamName;localSave();}
 selected=null;mergeMode=false;$('recent').textContent='第一场演出，等你登台。';$('replayBtn').hidden=true;
 }catch(e){toast(e.message);}finally{busy=false;render();}}
async function connect(){
 busy=true;render();
 try{
  if(token){
   const recovered=await retryPending();
   if(!recovered){const result=await request('last-battle');try{acceptRemote(result);}catch(e){draft=null;acceptRemote(result);toast('本机操作记录无法恢复，已同步云端存档。');}}
   online=true;
  }else{await request('health',undefined,false);online=true;await newRun();}
 }catch(e){
  online=false;
  if(e.status===401){token=null;draft=null;roundActions=false;localStorage.removeItem(TOKEN);clearPending();toast('原对局凭证已失效，点击连接状态开始新的联机局。');}
  else toast(token?'联机暂时断开，商店进度保存在本机，点击连接状态重试。':localPreview?'本地服务尚未连接，当前可试玩训练模式。':'当前为本地训练，进度保存在此浏览器。');
  if(!run){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');run=saved?.run&&saved.token===token?migrateRun(saved.run):createRun();lastBattle=saved?.token===token&&saved?.lastBattle?.battle?.ruleset===RULESET?saved.lastBattle:null;}catch{run=createRun();}}
 }finally{busy=false;render();}
}

$('rollBtn').addEventListener('click',()=>mutate({type:'roll'}));$('fightBtn').addEventListener('click',()=>{if(run.gold>=3){$('unspentGold').textContent=`还有 ${run.gold} 金币。未使用的金币不会带到下一回合。`;$('endTurnDialog').showModal();}else fight();});$('sellBtn').addEventListener('click',()=>selected?.zone==='team'&&mutate({type:'sell',slot:selected.slot}));$('mergeBtn').addEventListener('click',()=>{mergeMode=!mergeMode;render();});$('helpBtn').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());$('newBtn').addEventListener('click',()=>$('newDialog').showModal());$('cancelNew').addEventListener('click',()=>$('newDialog').close());$('confirmNew').addEventListener('click',()=>{$('newDialog').close();showSetup();});$('replayBtn').addEventListener('click',showBattle);$('skipBtn').addEventListener('click',()=>{clearTimeout(timer);playing=false;eventIndex=lastBattle.battle.events.length-1;drawEvent();});$('continueBtn').addEventListener('click',()=>{$('battleDialog').close();showResult();});$('battleDialog').addEventListener('close',()=>{playing=false;clearTimeout(timer);audio.stopBattle();clearBattleFx();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){endDrag(true);selected=null;mergeMode=false;render();}});$('connection').setAttribute('role','button');$('connection').setAttribute('tabindex','0');$('connection').style.cursor='pointer';$('connection').addEventListener('click',()=>{if(!busy)connect();});$('connection').addEventListener('keydown',e=>{if(e.key==='Enter'&&!busy)connect();});
function renderCodex(){
 const query=$('codexSearch').value.trim().toLowerCase(),tier=$('codexTier').value,mode=$('codexMode').value;
 const list=ROSTER.filter(d=>(!query||`${d.name} ${d.description||''} ${d.title||''} ${d.ability} ${d.hint||''}`.toLowerCase().includes(query))&&(!tier||d.tier===Number(tier))&&(!mode||(mode==='outfits'?!!d.art:!d.art)));
 $('codexCount').textContent=`${list.length} / ${ROSTER.length} 个棋子 · ${new Set(ROSTER.map(d=>d.baseId)).size} 位主播`;
 $('codexGrid').innerHTML=list.map(d=>`<button class="codex-card" data-piece="${esc(d.id)}">${sprite(d)}<strong>${esc(d.name)}</strong><small>${d.tier} 阶 · ${esc(d.title||'战斗技能')}</small>${stats(d)}<p>${esc(d.ability)}</p></button>`).join('')||'<p>没有符合条件的棋子。</p>';
 $('codexGrid').querySelectorAll('[data-piece]').forEach(el=>el.addEventListener('click',()=>{const d=unitInfo(el.dataset.piece);$('codexDetail').innerHTML=`${sprite(d,'detail-portrait')}<h3>${esc(d.name)}</h3>${d.title?`<h4>${esc(d.title)}</h4>`:''}<p>${esc(d.ability)}</p>${d.hint?`<p>配合建议：${esc(d.hint)}</p>`:''}<p>原版角色立绘</p>${d.source?`<a class="outfit-source" href="${esc(d.source)}" target="_blank" rel="noopener noreferrer">衣装资料 ↗</a><small>${esc(d.artNote)}</small>`:''}`;$('codexDetail').hidden=false;$('codexDetail').scrollIntoView({block:'nearest'});}));
}
function openHome(){if(busy)return;$('homeContinue').disabled=!run;$('homeCast').innerHTML=['goutan','songlv','aza','ruiya','nana7mi'].map(id=>sprite({id})).join('');$('homeDialog').showModal();}
let firstName='闪耀的',lastName='小队';
function showSetup(){if($('homeDialog').open)$('homeDialog').close();
 const options=[['nameFirst',['闪耀的','幸运的','快乐的']],['nameLast',['小队','偶像团','演出家']]];
 for(const [id,names]of options){$(id).innerHTML=names.map(n=>`<button class="roll-button ${n===(id==='nameFirst'?firstName:lastName)?'active':''}" data-name="${n}" aria-pressed="${n===(id==='nameFirst'?firstName:lastName)}">${n}</button>`).join('');$(id).querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{if(id==='nameFirst')firstName=btn.dataset.name;else lastName=btn.dataset.name;$(id).querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-pressed',String(b===btn));});$('namePreview').textContent=firstName+lastName;}));}
 $('namePreview').textContent=firstName+lastName;$('setupDialog').showModal();
}
function showResult(){const win=lastBattle.battle.winner,finished=run.status!=='prep';$('resultRound').textContent=`第 ${lastBattle.opponent.round||Math.max(1,run.round-1)} 回合 · ${finished?'本局结束':'战斗结果'}`;$('resultIcon').textContent=win==='a'?'🏆':win==='b'?'♥':'⚖';$('resultTitle').textContent=run.status==='won'?'十胜达成！':run.status==='lost'?'下次再来！':win==='a'?'胜利！':win==='b'?'失利':'平局';$('resultDescription').textContent=win==='a'?'获得一座奖杯。':win==='b'?'损失一条生命，调整队伍再出发。':'双方打成平局，不损失生命。';$('resultWins').textContent=run.wins;$('resultLives').textContent=run.lives;$('resultTeam').innerHTML=run.team.filter(Boolean).map(u=>`<div>${sprite(u)}<small>${esc(unitName(u))}</small></div>`).join('');$('resultNext').textContent=finished?'再来一局':'下一回合';$('resultDialog').showModal();}
$('menuBtn').addEventListener('click',openHome);$('homeArena').addEventListener('click',showSetup);$('homeContinue').addEventListener('click',()=>$('homeDialog').close());$('homeCodex').addEventListener('click',()=>{renderCodex();$('codexDialog').showModal();});$('homeHelp').addEventListener('click',()=>$('helpDialog').showModal());$('cancelSetup').addEventListener('click',()=>{$('setupDialog').close();openHome();});$('startArena').addEventListener('click',async()=>{$('startArena').disabled=true;await newRun(firstName+lastName);$('startArena').disabled=false;$('setupDialog').close();showPrepFeedback([{text:'第 1 回合开始：领取 10 金币',uids:[],gold:10}]);});
$('resultReplay').addEventListener('click',()=>{$('resultDialog').close();showBattle();});$('resultNext').addEventListener('click',()=>{$('resultDialog').close();if(run.status!=='prep')showSetup();else{render();showPrepFeedback(run.roundStartEvents||[{text:`第 ${run.round} 回合开始 · ${run.gold} 金币`,uids:[],gold:run.gold}]);}});$('resultMenu').addEventListener('click',()=>{$('resultDialog').close();openHome();});
$('confirmEndTurn').addEventListener('click',()=>{$('endTurnDialog').close();fight();});$('cancelEndTurn').addEventListener('click',()=>$('endTurnDialog').close());
$('freezeBtn').addEventListener('click',()=>{if(selected&&(selected.zone==='shop'||selected.zone==='foods'))mutate({type:'freeze',zone:selected.zone,slot:selected.slot});else{freezeMode=!freezeMode;render();}});
$('codexBtn').addEventListener('click',()=>{renderCodex();$('codexDialog').showModal();});
$('closeCodex').addEventListener('click',()=>$('codexDialog').close());
['codexSearch','codexTier','codexMode'].forEach(id=>$(id).addEventListener('input',renderCodex));
await connect();if(!initialResume)openHome();showPrepFeedback([{text:`第 ${run.round} 回合 · 招募、培养并调整队伍`,uids:[]}]);
