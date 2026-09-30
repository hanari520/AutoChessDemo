/* Shared classic battle presentation. Rules and damage stay in the caller. */
(function(root){
"use strict";
const SKILL_ACTIONS={
  ein:['brace',1],kouichi:['skate',2],yua:['cast',2],goutan:['brace',2],yujiu:['aim',2],
  songlv:['stomp',1],likou:['bloom',2],agari:['wave',2],hoshimi:['leap',1],chiharu:['sweep',2],
  suiji:['cast',1],kanban:['brace',1],zhouyi:['strike',1],yuji:['veil',1],tiandou:['bloom',2],
  aza:['stomp',2],pako:['bloom',1],zhijin:['skate',1],sishi:['spin',3],sumi:['wave',1],
  yukie:['strike',3],miting:['aim',1],xuezhu:['cast',1],zeyin:['wave',3],sanli:['cast',3],
  diansu:['stomp',1],lianshiye:['veil',2],huize:['bloom',1],shengge:['wave',2],shadow:['leap',2],
  nox:['veil',2],miyue:['spin',2],huali:['bloom',3],youyu:['veil',1],quanrong:['brace',2],
  ruiya:['cast',2],mumu:['wave',1],kroya:['cast',3],shiliu:['strike',2],seki:['spin',1],
  haruka:['sweep',1],mahiru:['spin',3],nana7mi:['stomp',2],liAn:['cast',1],youyi:['brace',1],
  azi:['wave',3],taodai:['brace',3],miki:['bloom',3],rei:['veil',3],rinco:['sweep',2]
};
const SKILL_PROJECTILE_ART=new Set('agari aza diansu goutan huali huize kroya likou miki miting mumu nana7mi pako ruiya sanli shengge sishi suiji tiandou xuezhu yua yujiu zeyin'.split(' '));
const SKILL_SLASH_ART=new Set('chiharu haruka hoshimi kouichi lianshiye mahiru miyue nox rinco shadow shiliu songlv youyu yukie zhijin'.split(' '));
const SKILL_SLASH_SVG=new Set(['mahiru','rinco','songlv']);
const DETACHED_SKILL_MODES=new Set(['single','chain','zone','chaos']);
function create(adapter){
  const speed=()=>Math.max(1,adapter.speed()),scale=()=>adapter.scale();
  const {unitVisual,boardGeo,fxNode,vfxAt,fxSparks,sigFor,byId,nearCells,unitDist,v3NearestFoes,eatk,fxDir,impactFx,boltFx}=adapter;
  const setTimeout=adapter.schedule||root.setTimeout.bind(root),clearTimeout=adapter.cancel||root.clearTimeout.bind(root);
function skillArt(id,kind){
  if(kind==='flight'||kind==='impact')return SKILL_PROJECTILE_ART.has(id)&&(kind!=='flight'||id!=='yua')?`assets/skill_projectiles/${id}-${kind}.webp`:null;
  if(kind==='slash'||kind==='slash-impact')return SKILL_SLASH_ART.has(id)?`assets/skill_slashes/${id}-${kind.replace('slash-','')}.${SKILL_SLASH_SVG.has(id)?'svg':'webp'}`:null;
  return null;
}
function setSkillArt(el,path){if(el&&path){el.classList.add('skill-art');el.style.setProperty('--skill-art',`url("${path}")`);}return el;}
function skillIsDetached(u,k){
  if(k.mode==='single'&&!SKILL_PROJECTILE_ART.has(u.id)&&(k.attackStyle==='blade'||byId(u.id).rng<=1))return false;
  return DETACHED_SKILL_MODES.has(k.mode)||(k.mode==='burst'&&u.id!=='songlv');
}
function skillFlightDuration(u,target){
  const a=unitVisual(u),b=unitVisual(target);
  const visualDistance=Math.hypot(b.x-a.x,b.y-a.y);
  const distance=Number.isFinite(visualDistance)?visualDistance:Math.hypot((target.x-u.x)*64,(target.y-u.y)*64);
  return Math.round(Math.min(580,Math.max(280,180+distance*1000/900))*scale());
}
function launchSkillProjectile(u,target,k,kind='attack',delay=0,artId=u?.id||'',duration=skillFlightDuration(u,target)){
  if(typeof document==='undefined'||!u||!target)return;
  const sig=sigFor({id:artId}),shotColor=k.color||sig.color;
  const fire=()=>{
    const a=unitVisual(u),b=unitVisual(target),dx=b.x-a.x,dy=b.y-a.y;
    const travel=duration/1000;
    const memory=artId==='yua'&&kind==='attack';
    const el=fxNode('skill-projectile'+(kind==='healing'?' healing':'')+(memory?' memory':'')+(artId==='nana7mi'?' tide':''),a.x,a.y,travel*1000+100);
    if(!el)return;
    const flightArt=memory?null:skillArt(artId,'flight');
    if(flightArt)setSkillArt(el,flightArt);
    const visualColor=flightArt||memory?shotColor:kind==='healing'?'#aaffd5':shotColor;
    el.dataset.glyph=kind==='healing'?'+':sig.glyph;el.dataset.shape=sig.shape;
    el.style.setProperty('--shot-dx',dx+'px');el.style.setProperty('--shot-dy',dy+'px');
    el.style.setProperty('--shot-color',visualColor);el.style.setProperty('--shot-time',travel+'s');
    setTimeout(()=>{
      const p=unitVisual(target),hit=setSkillArt(fxNode('skill-projectile-impact'+(kind==='healing'?' healing':''),p.x,p.y,300),skillArt(artId,'impact'));
      if(hit){hit.style.setProperty('--shot-color',visualColor);if(kind==='healing'&&!hit.classList.contains('skill-art'))hit.style.borderRadius='50%';}
      if(kind==='healing'&&(k.shield||k.allyShield))spawnShieldImpact(target,shotColor,artId);
    },travel*1000/speed());
  };
  if(delay>0)setTimeout(fire,delay/speed());else fire();
}
function spawnShieldImpact(target,color,artId=''){
  const p=unitVisual(target),el=setSkillArt(fxNode('skill-shield-impact',p.x,p.y,500),skillArt(artId,'impact'));
  if(el)el.style.setProperty('--shot-color',color);
}
function spawnSkillWave(u,targets,color,shield=false,style='',impacts=true,artId=u?.id||''){
  if(typeof document==='undefined'||!u)return;
  const a=unitVisual(u),g=boardGeo();
  const supportWave=shield||style==='support';
  const fullRadius=Math.max(g.cw*1.3,...targets.map(t=>{const p=unitVisual(t);return Math.hypot(p.x-a.x,p.y-a.y);}),0);
  const radius=supportWave?Math.min(fullRadius,g.cw*.95):fullRadius;
  const wave=setSkillArt(fxNode((shield?'skill-shield-wave':'skill-field-wave')+(supportWave?' support-wave':'')+(style?' '+style:''),a.x,a.y,650),skillArt(artId,'flight'));
  if(wave){wave.style.setProperty('--shot-color',color);wave.style.setProperty('--wave-size',(radius*2+g.cw*.55)+'px');}
  if(style==='gate'){
    const gate=fxNode('skill-field-gate',a.x,a.y,550);
    if(gate)gate.style.setProperty('--shot-color',color);
  }
  if(impacts)targets.forEach((t,i)=>setTimeout(()=>{
    if(shield)spawnShieldImpact(t,color,artId);
    else {const p=unitVisual(t),el=setSkillArt(fxNode('skill-field-impact'+(style?' '+style:''),p.x,p.y,440),skillArt(artId,'impact'));if(el)el.style.setProperty('--shot-color',color);}
  },(100+i*70)/speed()));
}
function spawnSkillSlash(u,target,color,index=0,artId=u.id){
  const a=unitVisual(u),b=unitVisual(target),ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI+(index%2?32:-24);
  const slashArt=skillArt(artId,'slash');
  const slash=setSkillArt(fxNode(slashArt?'skill-slash-art':'slashline',b.x,b.y,360),slashArt);
  if(slash){slash.style.setProperty('--rot',ang+'deg');slash.style.setProperty('--shot-color',color);if(!slashArt){slash.style.width=(boardGeo().cw*1.25)+'px';slash.style.background=`linear-gradient(90deg,transparent,#fff 26%,${color} 62%,transparent)`;slash.style.boxShadow=`0 0 9px ${color}`;}}
  const impactArt=skillArt(artId,'slash-impact');
  const impact=setSkillArt(fxNode('skill-projectile-impact',b.x,b.y,300),impactArt);
  if(impact){impact.style.setProperty('--shot-color',color);if(!impactArt){impact.style.width=(boardGeo().cw*.68)+'px';impact.style.height=(boardGeo().cw*.68)+'px';}}
}
function skillCastFx(u,units,k,target){
  const allies=units.filter(t=>t.hp>0&&t.side===u.side),foes=units.filter(t=>t.hp>0&&t.side!==u.side),sig=sigFor(u),color=k.color||sig.color;
  let detached=false;
  const detachedHit=skillIsDetached(u,k);
  if(detachedHit&&target){launchSkillProjectile(u,target,k);detached=true;}
  else if(k.mode==='single'&&target)setTimeout(()=>spawnSkillSlash(u,target,color),120/speed());
  if(k.mode==='combo'&&target){for(let i=0;i<(k.hits||1);i++)setTimeout(()=>spawnSkillSlash(u,target,color,i),(i*90)/speed());}
  else if(k.mode==='dash'&&target)setTimeout(()=>spawnSkillSlash(u,target,color),260/speed());
  else if(k.mode==='cleave'||k.mode==='dashCleave'){
    const strike=()=>units.filter(t=>t.hp>0&&t.side!==u.side&&nearCells(t,u,1)).slice(0,5).forEach((t,i)=>spawnSkillSlash(u,t,color,i));
    if(k.mode==='dashCleave')setTimeout(strike,100/speed());else strike();
  }else if(k.mode==='burst'&&u.id==='songlv'){
    const near=foes.filter(t=>nearCells(t,u,1));spawnSkillWave(u,near,color,false,'',false);
    near.forEach((t,i)=>setTimeout(()=>spawnSkillSlash(u,t,color,i),100/speed()));
  }else if(k.mode==='burst'&&u.id==='nana7mi'&&target){
    const hitList=[target,...v3NearestFoes(target,foes,1,2)];
    setTimeout(()=>spawnSkillWave(target,hitList,color,false,'tide'),skillFlightDuration(u,target)/speed());
  }
  if(k.mode==='guard')spawnShieldImpact(u,color);
  else if(k.mode==='guardLink'){
    const mate=allies.filter(t=>t!==u).sort((a,b)=>a.hp/a.maxhp-b.hp/b.maxhp)[0];
    spawnSkillWave(u,mate?[u,mate]:[u],color,true,'',false);
    spawnShieldImpact(u,color);
    if(mate)launchSkillProjectile(u,mate,k,'healing',90);
  }else if(k.mode==='teamShield')spawnSkillWave(u,allies,color,true);
  if(k.mode==='heal'){
    const recipients=allies.slice().sort((a,b)=>a.hp/a.maxhp-b.hp/b.maxhp).slice(0,k.healN||1);
    if(recipients.length>1)spawnSkillWave(u,recipients,color,!!k.shield,'support',false);
    recipients.forEach((t,i)=>{if(t!==u)launchSkillProjectile(u,t,k,'healing',i*80);else if(k.shield)spawnShieldImpact(t,color);});
    detached=recipients.some(t=>t!==u);
  }else if(k.mode==='team'||k.mode==='support'){
    const recipients=u.id==='suiji'?allies.filter(t=>t!==u):allies;
    if(recipients.length>1)spawnSkillWave(u,recipients,color,!!k.shield,'support',false);
    recipients.forEach((t,i)=>{if(t!==u)launchSkillProjectile(u,t,k,'healing',i*65);else if(k.shield)spawnShieldImpact(t,color);});
    detached=recipients.some(t=>t!==u);
  }
  if(k.mode==='field'){
    const anchor=u.id==='liAn'?(foes.slice().sort((a,b)=>eatk(b)-eatk(a))[0]||target):u;
    const style=u.id==='azi'?'sound':u.id==='rei'?'gate':u.id==='liAn'?'ice':u.id==='seki'?'void':'';
    if(anchor)spawnSkillWave(anchor,foes.filter(t=>unitDist(t,anchor)<= (u.id==='liAn'?4:3)),color,false,style,true,u.id);
  }
  return detached;
}
function skillAct(u,tgt){
  const spec=SKILL_ACTIONS[u.id],host=unitVisual(u).el;
  if(!spec||!host)return;
  const [gesture,beats]=spec, sig=sigFor(u), duration=(.44+beats*.12)*scale();
  const motionIndex=Math.max(0,adapter.unitIndex(u.id));
  host.style.setProperty('--skill-lean-in',`${(-12+(motionIndex*1.37)%18).toFixed(1)}deg`);
  host.style.setProperty('--skill-lean-out',`${(8+(motionIndex*1.91)%17).toFixed(1)}deg`);
  host.style.setProperty('--skill-rise',`${(-6-(motionIndex*.27)%10).toFixed(1)}%`);
  host.style.setProperty('--skill-compress',`${(.80+motionIndex*.0023).toFixed(3)}`);
  host.style.setProperty('--skill-spin',`${(152+motionIndex*4.1).toFixed(1)}deg`);
  host.style.setProperty('--skill-spin-end',`${(285+motionIndex*3.2).toFixed(1)}deg`);
  host.style.setProperty('--skill-charge-scale',`${(.82+motionIndex*.0025).toFixed(3)}`);
  host.style.setProperty('--skill-release-scale',`${(1.13+motionIndex*.0029).toFixed(3)}`);
  host.dataset.gesture=gesture;host.style.setProperty('--skill-dur',duration+'s');
  host.classList.remove('skill-acting');void host.offsetWidth;host.classList.add('skill-acting');
  clearTimeout(host._skillTimer);
  host._skillTimer=setTimeout(()=>host.classList.remove('skill-acting'),duration*1000/speed());
  const cueTarget=tgt&&tgt.hp>0?tgt:u;
  for(let i=0;i<beats;i++)setTimeout(()=>{
    const p=unitVisual(cueTarget),cue=fxNode('skill-cue',p.x,p.y,700);
    if(!cue)return;
    cue.dataset.glyph=sig.glyph;
    cue.style.setProperty('--cue-color',sig.color);
    cue.style.setProperty('--cue-radius',sig.shape==='seal'?'20%':sig.shape==='petal'?'45% 20% 50% 25%':'50%');
    cue.style.setProperty('--cue-dur',(.55+i*.06)*scale()+'s');
    cue.style.marginLeft=((i-(beats-1)/2)*12)+'px';
  },i*115*scale()/speed());
}
function signatureFx(u,tgt){
  const s=sigFor(u), kit=adapter.kit(u.id), art=kit&&u.id!=='kouichi'?'combat':s.art, el=vfxAt(u,'signature',850);
  if(el){el.dataset.glyph=s.glyph;el.dataset.shape=s.shape;el.dataset.art=art;el.dataset.unit=u.id;
    if(['heal','team','support','guard','guardLink','teamShield'].includes(u._skillArch))el.classList.add('support-cast');
    el.style.setProperty('--sig-color',kit?kit.color:s.color);el.style.setProperty('--sig-rot',s.rot+'deg');el.style.setProperty('--sig-scale',s.scale);el.style.setProperty('--sig-dur',s.dur+'s');
    if(kit&&kit.asset&&u.id!=='kouichi'){el.style.setProperty('background-image','url("'+kit.asset+'")','important');el.classList.add('kit-art');}}
  if(tgt&&tgt.hp>0){const p=unitVisual(tgt),hit=fxNode('signature',p.x,p.y,560);
    if(hit){hit.classList.add('signature-hit');hit.dataset.glyph=s.glyph;hit.dataset.shape=s.shape;hit.dataset.art=art;hit.dataset.unit=u.id;
      hit.style.setProperty('--sig-color',kit?kit.color:s.color);hit.style.setProperty('--sig-rot',s.rot+'deg');hit.style.setProperty('--sig-scale',s.scale);hit.style.setProperty('--sig-hit-dur',s.hitDur+'s');
      if(kit&&kit.asset&&u.id!=='kouichi'){hit.style.setProperty('background-image','url("'+kit.asset+'")','important');hit.classList.add('kit-art');}}}
  fxSparks(u,kit?kit.color:s.color,3+(Math.abs(Number(s.rot))%2),20+(Math.abs(Number(s.rot))%14));
}
function v3AttackFx(u,tgt,p){
  if(p.style==='blade'){const h=fxDir(u,tgt),el=fxNode('slashline',h.b.x,h.b.y,300);if(el){el.style['--rot']=(h.ang*180/Math.PI)+'deg';el.style.background='linear-gradient(90deg,transparent,#fff 35%,'+p.color+' 65%,transparent)';}}
  else if(p.style==='shot') impactFx(tgt,p.color);
  else if(p.style==='arc') boltFx(u,tgt,false);
  else if(p.style==='pulse'){const q=unitVisual(tgt),el=fxNode('atk-pulse',q.x,q.y,480);if(el)el.style.setProperty('--atk-color',p.color);}
  else {const q=unitVisual(tgt),el=fxNode('atk-burst',q.x,q.y,520);if(el)el.style.setProperty('--atk-color',p.color);fxSparks(tgt,p.color,3,18);}
}
function fireProjectile(src,tgt,color,profile){
  const s=unitVisual(src),flight=420/speed(),t0=performance.now();
  const el=fxNode('proj'+(color==='#c77dff'?' magic':'')+' atk-'+profile.style,s.x-4,s.y-4,500);
  if(!el)return;
  el.dataset.glyph=profile.glyph||'✦';el.style.setProperty('--atk-color',profile.color||color);
  el.style.background=color;el.style.color=color;el.style.boxShadow=color==='#c77dff'?`0 0 10px 2px ${color},0 0 3px 1px #fff`:`0 0 6px ${color}`;
  const tail=document.createElement('i');tail.className='tail';el.appendChild(tail);
  function step(){
    if(el.isConnected===false)return;
    const k=Math.min(1,(performance.now()-t0)/flight),t=unitVisual(tgt);
    if(adapter.translate?.()){el.style.translate=`${(t.x-s.x)*k}px ${(t.y-s.y)*k}px`;}
    else{el.style.left=`${s.x+(t.x-s.x)*k-4}px`;el.style.top=`${s.y+(t.y-s.y)*k-4}px`;}
    tail.style.transform=`rotate(${Math.atan2(t.y-s.y,t.x-s.x)}rad)`;
    if(k<1)setTimeout(step,16);else{el.remove();impactFx(tgt,color);}
  }
  step();
}
return {skillArt,setSkillArt,skillIsDetached,skillFlightDuration,launchSkillProjectile,spawnShieldImpact,spawnSkillWave,spawnSkillSlash,skillCastFx,skillAct,signatureFx,v3AttackFx,fireProjectile};
}
function signature(id,cfg={}) {
  let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;
  return {...cfg,rot:((h%37)-18),scale:(.88+(h%17)/100).toFixed(2),dur:(.66+(h%5)*.07).toFixed(2),hitDur:(.48+(h%4)*.07).toFixed(2)};
}
root.ClassicBattlePresentation=Object.freeze({create,signature,actions:SKILL_ACTIONS});
})(globalThis);
