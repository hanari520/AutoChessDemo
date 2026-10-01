import { CLASSIC_SKILLS, CLASSIC_MARKS, classicAttackProfile } from './skill-catalog.js';
import './bond-runtime.js';
/* Deterministic battle resolver. Combat effects are a DOM-free, intentionally
 * bounded port of index.html; see the tests and migration notes for unsupported
 * solo-only mechanics. */
const RAW = `
ein|1|魔道|守护|84|6|1|0.8||
kouichi|1|工造|狂战|58|10|1|1.1||
yua|1|星际|法师|44|12|3|0.7||咒术
goutan|1|毛茸乐园|守护|82|6|1|0.8||
yujiu|1|毛茸乐园|游侠|40|10|4|1.25|森之国|
songlv|1|森之国|狂战|58|10|1|1.05||
likou|1|学园|医者|44|9|3|0.9||
agari|1|P-SP|偶像|50|7|3|0.9||
hoshimi|1|夜幕|刺客|69|11|1|1.15||
chiharu|1|森之国|刀客|60|11|1|1.05||
suiji|2|森之国|歌势|48|10|3|0.9||
kanban|2|毛茸乐园|守护|92|6|1|0.8||
zhouyi|2|夜幕|刀客|55|11|1|1.1||
yuji|2|深海|游侠|46|10|4|1.2||
tiandou|2|四禧丸子|歌势|52|10|3|0.9||
aza|2|音律|狂战|88|6|1|0.8||
pako|2|深海|医者|50|9|3|0.9||
zhijin|2|花语|刺客|76|12|1|1.2|森之国|
sishi|5|音律|游侠|46|11|4|1.2||
sumi|2|P-SP|守护|90|6|1|0.8||
yukie|3|工造|刀客|62|11|1|1.05||
miting|2|魔道|咒术|46|16|3|0.7||
xuezhu|3|夜幕|法师|44|15|3|0.7||
zeyin|3|深海|医者|52|11|3|0.9||
sanli|3|音律|法师|48|15|3|0.75||
diansu|3|魔道|刺客|55|16|3|0.7||
lianshiye|3|夜幕|刀客|60|11|1|1.05||
huize|3|学园|咒术|48|16|3|0.7||
shengge|3|P-SP|歌势|50|12|3|0.9||
shadow|3|P-SP|刺客|78|13|1|1.3||
nox|3|毛茸乐园|刺客|76|13|1|1.25||
miyue|4|夜幕|刀客|60|12|1|1.1||
huali|4|花语|偶像|52|9|3|0.9||
youyu|4|深海|刀客|60|13|1|1.1||
quanrong|4|毛茸乐园|守护|100|8|1|0.8||
ruiya|4|星际|法师|46|16|3|0.7|工造|
mumu|3|四禧丸子|偶像|54|10|3|0.9||
kroya|4|学园|法师|46|16|3|0.7||
shiliu|4|森之国|刺客|80|13|3|1.2||游侠
seki|4|P-SP|咒术|46|16|3|0.7|魔道|
haruka|4|P-SP|刀客|58|12|1|1.1||
mahiru|5|毛茸乐园|狂战|68|13|1|1.10||
nana7mi|5|深海|刀客|62|12|1|1.05||
liAn|5|四禧丸子|法师|48|17|3|0.7||
youyi|4|四禧丸子|刺客|92|13|1|1.15||刀客
azi|5|工造|歌势|52|15|3|1.0|音律|
taodai|4|花语|守护|96|8|1|0.8||
miki|5|星际|医者|48|13|3|0.9||
rei|5|P-SP|医者|47|15|3|0.7||
rinco|5|P-SP|狂战|62|13|1|1.1||
`;

const ROSTER = Object.fromEntries(RAW.trim().split('\n').map(line => {
  const [id,cost,fac,job,hp,atk,range,speed,fac2,job2] = line.split('|');
  return [id,{id,cost:+cost,fac,job,hp:+hp,atk:+atk,range:+range,speed:+speed,fac2,job2}];
}));
// Codex reference data: full roster order is a read-only view.
export const ROSTER_LIST = Object.values(ROSTER);
const MELEE = new Set('ein kouichi yukie goutan kanban zhouyi miyue taodai youyu quanrong nana7mi youyi zhijin songlv shadow sumi haruka rinco aza lianshiye hoshimi chiharu nox mahiru'.split(' '));
const PHYSICAL = new Set('ein kouichi yukie goutan kanban zhouyi miyue taodai youyu quanrong nana7mi youyi zhijin songlv shiliu shadow sumi haruka rinco yuji yujiu sishi aza lianshiye hoshimi chiharu nox mahiru'.split(' '));
const COST_MULT = {1:1,2:1.18,3:1.42,4:1.72,5:2.1};
const STAR_MULT = {1:1.9,2:1.8,3:1.7,4:1.6,5:1.5};
const ARMOR = {'守护':23,'刀客':15,'狂战':16,'刺客':8,'游侠':5,'偶像':5,'法师':3,'咒术':4,'歌势':4,'医者':4};
const RESIST = {'守护':.10,'刀客':.05,'狂战':.05,'刺客':0,'游侠':.10,'偶像':.10,'法师':.15,'咒术':.15,'歌势':.15,'医者':.15};
const BONDS = {
  '深海':[2,4], '星际':[2,3], '毛茸乐园':[2,4,6], '音律':[2,3], '四禧丸子':[2,4],
  '学园':[2], '夜幕':[2,4], '花语':[2], '魔道':[2,3], '森之国':[3,4], '工造':[2,3], 'P-SP':[2,4],
  '刀客':[2,4,6], '守护':[2,4,6], '歌势':[2,4], '游侠':[2,3], '法师':[3,6], '咒术':[2],
  '刺客':[3,6], '狂战':[2,4], '医者':[2,4], '偶像':[2,3]
};
export const BOND_TIERS = BONDS;
export function bondSummary(board) {
  const units = (board || []).filter(Boolean);
  const count = {};
  const seen = new Set();
  for (const unit of units) {
    if (seen.has(unit.id)) continue;
    seen.add(unit.id);
    const d = ROSTER[unit.id];
    if (!d) continue;
    for (const tag of [d.fac,d.fac2,d.job,d.job2].filter(Boolean)) count[tag]=(count[tag]||0)+1;
  }
  return Object.entries(count).map(([name,value]) => ({
    name, count:value, tiers:BONDS[name] || [],
    active:(BONDS[name] || []).filter(threshold => value >= threshold).length,
  })).sort((a,b) => b.active-a.active || b.count-a.count || a.name.localeCompare(b.name));
}
// Numeric equipment effects and component triggers follow classic ITEM_FX / ITEM_SPECIAL.
const ITEM = {
  sword:{atk:1.4}, staff:{atk:1.25}, armor:{hp:1.3}, bow:{speed:1.35}, vamp:{vamp:.20}, mana:{manaRegen:2},
  flamejudge:{atk:1.8,crit:.20,critM:2.5}, galehunt:{atk:1.25,speed:1.35}, soulblade:{atk:1.4,vamp:.20,killHeal:.15},
  sagestaff:{atk:1.5,skill:.18}, hexdrinker:{atk:1.25,skillVamp:.15}, tidejewel:{atk:1.25,manaStart:20},
  aegis:{hp:1.45,shieldTick:.08}, bramble:{hp:1.3,thorns:.04}, windmail:{hp:1.3,speed:1.35,dodge:.12},
  twinbows:{speed:1.7,bounce:.25}, swiftecho:{speed:1.35,manaPerSec:3}, bloodcore:{vamp:.35,skillVamp:.15},
  twinshell:{manaRegen:3}, spellblade:{atk:1.65,skill:.12}, stormbreaker:{atk:1.4,hp:1.3},
  soulstring:{atk:1.4,manaRegen:2}, runeguard:{atk:1.25,hp:1.3}, astralbow:{atk:1.25,speed:1.35},
  bastioncoil:{hp:1.3,manaRegen:2}, venomshot:{speed:1.35,vamp:.2}, stormfang:{vamp:.2,manaRegen:2}
};
const COMPONENTS = {
  sword:['sword'],staff:['staff'],armor:['armor'],bow:['bow'],vamp:['vamp'],mana:['mana'],
  flamejudge:['sword','sword'],galehunt:['sword','bow'],soulblade:['sword','vamp'],sagestaff:['staff','staff'],
  hexdrinker:['staff','vamp'],tidejewel:['staff','mana'],aegis:['armor','armor'],bramble:['armor','vamp'],
  windmail:['armor','bow'],twinbows:['bow','bow'],swiftecho:['bow','mana'],bloodcore:['vamp','vamp'],
  twinshell:['mana','mana'],spellblade:['sword','staff'],stormbreaker:['sword','armor'],
  soulstring:['sword','mana'],runeguard:['staff','armor'],astralbow:['staff','bow'],
  bastioncoil:['armor','mana'],venomshot:['bow','vamp'],stormfang:['vamp','mana']
};
// Current solo COMBAT_KITS (index.html). Modes and unusual secondary mechanics
// are normalized into milliseconds for the deterministic server clock below.
// Exported for the skills audit tests only; resolveBattle stays the sole runtime entry.
export const SKILLS = Object.fromEntries(Object.entries(CLASSIC_SKILLS).map(([id,kit])=>{
  const skill={...kit};
  for(const key of ['stun','freeze','petrify','silence','noShield','taunt'])if(skill[key])skill[key]*=1000;
  if(skill.selfShield)skill.shield=skill.selfShield;
  if(skill.passive)skill.passive=skill.attackHit;
  return [id,skill];
}));
function hash(id, seed) { let h=seed; for (const ch of id) h=(Math.imul(h,31)+ch.charCodeAt(0))>>>0; return h; }
function seed32(value) { let h=2166136261; for (const c of String(value)) { h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0 || 1; }
function rngOf(seed) { let state=seed32(seed); return () => { state^=state<<13; state^=state>>>17; state^=state<<5; state>>>=0; return state/4294967296; }; }
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const live=units=>units.filter(u=>u.hp>0);
const byHp=(a,b)=>a.hp/a.maxhp-b.hp/b.maxhp || a.slot-b.slot;

function entries(board, side) {
  if (!Array.isArray(board)) throw new Error('Board must be an array');
  const positioned=board.length===64 ? board.map((unit,slot)=>({unit,slot})) : board;
  if (board.length!==64 && !board.every(e=>e && (Number.isInteger(e.slot) || (Number.isInteger(e.x)&&Number.isInteger(e.y)))))
    throw new Error('Board must have 64 cells or positioned entries');
  const used=new Set();
  return positioned.filter(e=>e.unit).map(e=>{
    const slot=e.slot ?? e.y*8+e.x;
    if (!Number.isInteger(slot)||slot<0||slot>=64) throw new Error('Invalid board slot');
    if (used.has(slot)) throw new Error('Board slot already occupied');
    used.add(slot);
    const input=e.unit, d=ROSTER[input.id];
    if (!d) throw new Error(`Unknown unit: ${input.id}`);
    const star=input.star ?? 1;
    if (![1,2,3].includes(star)) throw new Error('Invalid star');
    const items=input.items ?? [];
    if (!Array.isArray(items)||items.length>3) throw new Error('Invalid items');
    for (const item of items) if (!ITEM[item]) throw new Error(`Unknown item: ${item}`);
    let hp=Math.round(Math.round(d.hp*COST_MULT[d.cost])*(.9+(hash(d.id,7)%5)*.05));
    let atk=Math.round(Math.round(d.atk*COST_MULT[d.cost])*(.88+(hash(d.id,13)%5)*.06));
    hp=Math.round(hp*Math.pow(STAR_MULT[d.cost],star-1));
    atk=Math.round(atk*Math.pow(STAR_MULT[d.cost],star-1));
    const jitter=.85+(hash(d.id,17)%4)*.1;
    const u={uid:String(input.uid ?? `${side}-${slot}`),id:d.id,side,slot,x:slot%8,y:Math.floor(slot/8),
      star,fac:d.fac,fac2:d.fac2,job:d.job,job2:d.job2,range:d.range,speed:d.speed,
      dtype:PHYSICAL.has(d.id)?'phys':'magic',melee:MELEE.has(d.id),
      atk,maxhp:hp,hp,ar:Math.round((ARMOR[d.job]||5)*jitter),mr:Math.round((RESIST[d.job]||0)*jitter*100)/100,
      shield:0,mana:15,maxmana:50,cd:0,skillCd:0,stun:0,silence:0,slow:0,dodge:0,crit:0,critM:1.5,vamp:0,
      manaRegen:1,manaPerSec:0,skillMul:1,skillVamp:0,regen:0,thorns:0,bounce:0,killHeal:0,shieldTick:0,
      taunt:0,block:0,blockT:0,dr:0,drT:0,haste:0,hasteT:0,attackBuff:0,attackBuffT:0,poison:0,bleed:0,slowPct:0,
      wound:0,woundT:0,weaken:0,weakenT:0,freeze:0,noShield:0,healDown:0,healDownT:0,
      arDown:0,arDownT:0,mrDown:0,mrDownT:0,reflect:0,reflectT:0,linkShare:0,linkTarget:null,
      startShield:0,firstSnare:false,killMana:0,edgePips:0,manaGift:0,stormStun:false,poisonItem:0,
      castShield:0,castSunder:0,manaBurnItem:0,critExpose:0,killShield:0,killHaste:0,nextAmp:0,nextSplash:0,
      nextBounce:0,bounceEcho:0,teamCastShield:0,overflowShield:0,thornsSlow:0,dodgeAmp:0,markShield:0,
      blockSlow:0,shieldBreakReady:false,rainStacks:0,rainSlowReady:false,soulmateShieldGiven:false,
      itemIds:[...items],attacks:0,casts:0};
    u.passive=SKILLS[u.id]?.passive||null;
    let hpMul=1,atkMul=1;
    for (const key of items) {
      const fx=ITEM[key];
      if (fx.hp) hpMul*=fx.hp;
      if (fx.atk) atkMul*=fx.atk;
      if (fx.speed) u.speed*=fx.speed;
      for(const stat of ['crit','manaPerSec'])u[stat]+=fx[stat]||0;
      for(const stat of ['dodge','thorns','shieldTick','killHeal','skillVamp','bounce'])u[stat]=Math.max(u[stat],fx[stat]||0);
      if (fx.vamp) u.vamp=Math.max(u.vamp,fx.vamp);
      if (fx.manaRegen) u.manaRegen=Math.max(u.manaRegen,fx.manaRegen);
      if (fx.critM) u.critM=Math.max(u.critM,fx.critM);
      if (fx.skill) u.skillMul+=fx.skill;
      if (fx.manaStart) u.mana+=fx.manaStart;
      if (fx.shield) u.shield+=Math.round(u.maxhp*fx.shield);
      const parts=COMPONENTS[key]||[];
      u.startShield=Math.min(.16,u.startShield+parts.filter(p=>p==='armor').length*.08);
      u.edgePips=Math.min(2,u.edgePips+parts.filter(p=>p==='sword').length);
      u.arcanePips=Math.min(2,(u.arcanePips||0)+parts.filter(p=>p==='staff').length);
      u.firstSnare ||= parts.includes('bow');
      u.killMana+=parts.filter(p=>p==='vamp').length*8;
      u.manaGift+=parts.filter(p=>p==='mana').length*5;
      if(key==='flamejudge')u.critExpose=.12;
      if(key==='galehunt')u.killHaste=.10;
      if(key==='soulblade')u.killShield=.08;
      if(key==='sagestaff')u.castShield=.06;
      if(key==='hexdrinker')u.manaBurnItem=7;
      if(key==='tidejewel')u.castSunder=.10;
      if(key==='bramble')u.thornsSlow=.18;

      if(key==='swiftecho')u.nextAmp=.20;
      if(key==='bloodcore')u.overflowShield=.40;
      if(key==='stormfang')u.overflowShield=.45;
      if(key==='twinshell')u.teamCastShield=.035;
      if(key==='stormbreaker')u.stormStun=true;
      if(key==='soulstring')u.nextAmp=.22,u.nextSplash=.32;
      if(key==='astralbow')u.nextBounce=.35;
      if(key==='venomshot')u.poisonItem=.012;
      if(key==='twinbows')u.bounceEcho=.35;
      if(key==='windmail')u.dodgeAmp=.20;
      if(key==='spellblade')u.markShield=.06;
      if(key==='runeguard')u.markShield=.08;
      if(key==='bastioncoil')u.shieldBreakMana=12;
    }
    u.maxhp=Math.round(u.maxhp*hpMul);u.atk=Math.round(u.atk*atkMul);
    if(u.startShield)u.shield+=Math.round(u.maxhp*u.startShield);
    u.hp=u.maxhp;
    return u;
  });
}

// The inspection panel uses the same pre-battle stat construction as the resolver.
// Team bonds and temporary combat effects are applied only after battle starts.
export function previewUnit(unit) {
  if (!unit || !ROSTER[unit.id]) return null;
  const combatant = entries([{unit, slot:56}], 'A')[0];
  return {
    hp:combatant.maxhp, atk:combatant.atk, speed:combatant.speed,
    range:combatant.range, armor:combatant.ar, resist:combatant.mr,
    damageType:combatant.dtype, melee:combatant.melee,
    skill:SKILLS[unit.id] || null,
  };
}

function bondTiers(units) {
  const seen=new Set(),count={};
  for (const u of units) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    for (const tag of [u.fac,u.fac2,u.job,u.job2].filter(Boolean)) count[tag]=(count[tag]||0)+1;
  }
  return Object.fromEntries(Object.entries(count).map(([tag,n])=>[tag,(BONDS[tag]||[]).filter(need=>n>=need).length]).filter(([,tier])=>tier));
}
function applyBonds(mine,foes,b,random) {
  for (const u of mine) {
    u.atk=Math.round(u.atk*(1+.07*(b['毛茸乐园']||0)));
    const depth=b['深海']||0;if(depth)u.mr=Math.min(.85,u.mr+(depth>=2?.30:.12));
    if(u.fac==='四禧丸子'||u.fac2==='四禧丸子') if(b['四禧丸子'])u.maxhp=Math.round(u.maxhp*(1+(b['四禧丸子']>=2?.36:.18)));
    if((u.fac==='花语'||u.fac2==='花语')&&b['花语'])u.maxhp=Math.round(u.maxhp*1.07);
    if((u.fac==='音律'||u.fac2==='音律')&&b['音律'])u.speed*=1+(b['音律']>=2?.36:.22);
    if((u.fac==='学园'||u.fac2==='学园')&&b['学园'])u.range++;
    if((u.fac==='森之国'||u.fac2==='森之国')&&b['森之国'])u.dodge+=b['森之国']>=2?.40:.20;
    if((u.job==='刀客'||u.job2==='刀客')&&b['刀客'])u.ar+=b['刀客']>=3?14:b['刀客']>=2?11:7;
    if((u.job==='刺客'||u.job2==='刺客')&&b['刺客']){u.crit=Math.min(.6,u.crit+.18);u.critM=Math.max(u.critM,b['刺客']>=2?4.5:3.5);}
    if((u.job==='狂战'||u.job2==='狂战')&&b['狂战'])u.vamp=Math.max(u.vamp,b['狂战']>=2?.42:.26);
    if((u.job==='游侠'||u.job2==='游侠')&&b['游侠']){u.bounce=Math.max(u.bounce,b['游侠']>=2?.25:.15);u.bounceChance=b['游侠']>=2?.25:.15;}
    if(b['歌势'])u.regen+=b['歌势']>=2?3:1.5;
    if(b['偶像'])u.mana=clamp(u.mana+(b['偶像']>=2?20:10),0,u.maxmana);
    if((u.fac==='星际'||u.fac2==='星际')&&b['星际']){u.mana=u.maxmana;if(b['星际']>=2)u.skillMul+=.12;}
    if((u.fac==='魔道'||u.fac2==='魔道')&&b['魔道'])u.petrifyChance=b['魔道']>=2?.64:.40;
    if((u.fac==='P-SP'||u.fac2==='P-SP')&&b['P-SP'])u.bondSilence=b['P-SP']>=2?.24:.10;
    if((u.job==='守护'||u.job2==='守护')&&b['守护']){u.guardChance=b['守护']>=3?.48:b['守护']>=2?.36:.24;u.guardShield=b['守护']>=3?.13:b['守护']>=2?.10:.08;}
    if((u.job==='医者'||u.job2==='医者')&&b['医者'])u.medic=true;
    if((u.job==='歌势'||u.job2==='歌势')&&b['歌势'])u.singer=true;
    u.hp=u.maxhp;
  }
  if (b['夜幕']) for(const u of foes) u.ar-=b['夜幕']>=2?8:4;
  if (b['法师']) for(const u of foes) u.mr-=b['法师']>=2?.72:.28;
  if(b['工造']){
    const picked=[...mine].sort((a,b)=>random()-.5).slice(0,b['工造']>=2?2:1);
    for(const u of picked){u.ar+=b['工造']>=2?12:8;u.regen+=b['工造']>=2?5:3;}
  }
}

function nextStep(actor,target,units) {
  const occupied=new Set(live(units).filter(u=>u!==actor).map(u=>u.y*8+u.x));
  const key=(x,y)=>y*8+x;
  const queue=[{x:actor.x,y:actor.y,first:null}],seen=new Set([key(actor.x,actor.y)]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i];
    if (dist(p,target)<=actor.range) return p.first;
    for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const x=p.x+dx,y=p.y+dy,k=key(x,y);
      if(x<0||x>=8||y<0||y>=8||occupied.has(k)||seen.has(k))continue;
      seen.add(k);queue.push({x,y,first:p.first||{x,y}});
    }
  }
  return null;
}
function landingBeside(actor,target,units,range=1) {
  const occupied=new Set(live(units).filter(u=>u!==actor).map(u=>u.y*8+u.x));
  const spots=[];
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    if(occupied.has(y*8+x)||Math.abs(x-target.x)+Math.abs(y-target.y)>range)continue;
    spots.push({x,y});
  }
  return spots.sort((a,b)=>dist(a,target)-dist(b,target)||dist(a,actor)-dist(b,actor)||a.y-b.y||a.x-b.x)[0]||null;
}

/** Pure deterministic 64-cell battle slice. `winner` is A, B or draw. */
export function resolveBattle(boardA,boardB,seed,opts={}) {
  const random=rngOf(seed), a=entries(boardA,'A'),b=entries(boardB,'B'),units=[...a,...b],events=[];
  const bonds={A:bondTiers(a),B:bondTiers(b)};
  // The classic event runtime replaces the former passive-stat approximations.
  const tickMs=100,maxTicks=clamp(Number.isInteger(opts.maxTicks)?opts.maxTicks:600,1,1200);
  if(opts.initialMana!=null)for(const u of units){const value=typeof opts.initialMana==='object'?(opts.initialMana[u.uid]??opts.initialMana[u.side]??15):opts.initialMana;if(Number.isFinite(value))u.mana=clamp(value,0,u.maxmana);}
  const startingUnits=units.map(u=>({uid:u.uid,hp:u.hp,maxhp:u.maxhp,mana:u.mana,maxmana:u.maxmana,shield:u.shield,
    atk:u.atk,speed:u.speed,range:u.range,armor:u.ar,resist:u.mr}));
  let at=0,lastCast=-800,nextCastSide=opts.initialMana!=null?'A':(random()<.5?'A':'B'),nextCaster=null;
  const lastSideCast={A:-1200,B:-1200};
  const emit=(type,more)=>events.push({type,at,...more});
  const aliases={frozen:'freeze',silenceT:'silence',slowT:'slow',slowA:'slowPct',noShieldT:'noShield',healDownT:'healDownT',healDownA:'healDown',itemNextStrikeAmp:'nextAttackAmp',hexT:'hex',v3HealLockT:'healLock',v3HealBomb:'healBomb'};
  const proxies=new Map(),originals=new WeakMap();
  for(const unit of units){const proxy=new Proxy(unit,{get:(u,key)=>key==='side'?(u.side==='A'?0:1):key==='isPassiveFlag'?!!u.passive:key==='v3HealBomb'&&u.healBomb?{...u.healBomb,owner:proxies.get(u.healBomb.owner)}:u[aliases[key]||key],set:(u,key,value)=>{u[aliases[key]||key]=key==='v3HealBomb'&&value?{...value,owner:originals.get(value.owner)||value.owner}:value;return true;}});proxies.set(unit,proxy);originals.set(proxy,unit);}
  const wrapped=units.map(u=>proxies.get(u)),unwrap=u=>originals.get(u)||u;
  const bondRuntime=globalThis.ClassicBondRules.create({BV:[bonds.A,bonds.B],bondModern:()=>true,
    byId:id=>({...ROSTER[id],form:MELEE.has(id)?'me':'ra'}),facsOf:d=>[d.fac,d.fac2].filter(Boolean),jobsOf:d=>[d.job,d.job2].filter(Boolean),unitDist:dist,
    dealDamage:(src,tgt,n,list,type)=>damage(unwrap(src),unwrap(tgt),n,type,'bond'),
    dmgPopup:(src,tgt,label,type)=>{const unit=unwrap(tgt);if(unit)emit(type==='heal'?'heal':'bond',{from:unwrap(src)?.uid||null,target:unit.uid,label,amount:type==='heal'?parseFloat(label.slice(1))||0:0,hp:unit.hp,shield:unit.shield,mana:unit.mana});},
    bsHeal:()=>{}});
  const zones=[], pendingImpacts=[];
  const queueImpact=(delay,resolve)=>pendingImpacts.push({at:at+delay,resolve});
  const flight=(src,tgt)=>Math.round(Math.min(580,Math.max(280,180+Math.hypot(tgt.x-src.x,tgt.y-src.y)*64*1000/900)));
  for(const u of units)Object.assign(u,{healLock:0,counter:0,counterT:0,shieldBreakCd:0,tempoHits:0,tempoT:0,soulShieldCd:0,arcaneT:0,arcaneMarks:0,moveCd:0,linkT:0});
  function placeMark(tgt,src,guard=false){const mark=CLASSIC_MARKS[src.id];if(!mark||!tgt||tgt.hp<=0)return;tgt.sigMark={...mark,left:mark.dur*1000,guard,owner:src.uid};emit('mark',{from:src.uid,target:tgt.uid,mark:{...tgt.sigMark},label:mark.label});}
  function spawnZone(u,x,y,k){zones.push({u,x,y,...k,left:k.dur,acc:0});emit('zone',{from:u.uid,x,y,radius:k.r,duration:k.dur});}
  const allies=u=>live(units).filter(v=>v.side===u.side);
  const foes=u=>live(units).filter(v=>v.side!==u.side);
  const sortDist=(origin,list,far=false)=>[...list].sort((x,y)=>(far?dist(y,origin)-dist(x,origin):dist(x,origin)-dist(y,origin))||x.slot-y.slot);
  function choose(u,list,preference='near') {
    if(!list.length)return null;
    if(preference==='low')return [...list].sort(byHp)[0];
    if(preference==='hi')return [...list].sort((x,y)=>y.atk-x.atk||x.slot-y.slot)[0];
    return sortDist(u,list,preference==='far')[0];
  }
  function shield(u,value,from=u.uid){if(u.noShield>0)return;const amount=Math.max(0,Math.round(value));if(!amount)return;u.shield+=amount;emit('shield',{from,target:u.uid,amount,shield:u.shield});}
  function heal(src,tgt,value){if(tgt.hp<=0||tgt.healLock>0)return 0;const amount=Math.max(0,Math.min(tgt.maxhp-tgt.hp,Math.round(value*(1-(tgt.healDown||0)))));tgt.hp+=amount;if(amount)emit('heal',{from:src.uid,target:tgt.uid,amount,hp:tgt.hp});return amount;}
  function gainMana(u,amount,from=u,reason='skill'){if(u.passive)return;const before=u.mana;u.mana=clamp(u.mana+amount,0,u.maxmana);emit('mana',{from:from.uid,target:u.uid,amount:u.mana-before,mana:u.mana,reason});}
  function cleanse(u){for(const key of ['stun','freeze','silence','slow','weaken','weakenT','healDown','healDownT','noShield','hex','petrifyT','arDown','arDownT','mrDown','mrDownT','wound','woundT','healLock','brittle'])u[key]=0;u.slowPct=0;}
  function skillHeal(src,tgt,value,k){
    if(tgt.hp<=0||tgt.healLock>0)return;
    if(src.id==='mumu'&&tgt.hp>=tgt.maxhp){shield(tgt,tgt.maxhp*k.shield,src.uid);return;}
    const cut=Math.max(0,(tgt.healDown||0)-(src.id==='pako'?.18:0));
    let valueAfterCut=Math.round(value*(1-cut));
    if(src.id==='huali')valueAfterCut=Math.round(valueAfterCut*(1+.65*(1-tgt.hp/tgt.maxhp)));
    if(tgt.healBomb?.left>0&&tgt.healBomb.owner.hp>0){const bomb=tgt.healBomb;tgt.healBomb=null;const burst=Math.round(valueAfterCut*bomb.amp);valueAfterCut-=burst;damage(bomb.owner,tgt,burst,'magic','healBomb');}
    if(tgt.hp<=0)return;
    const real=Math.max(0,Math.min(tgt.maxhp-tgt.hp,valueAfterCut));tgt.hp+=real;emit('heal',{from:src.uid,target:tgt.uid,amount:real,hp:tgt.hp});
    if(k.cleanse)cleanse(tgt);
    if(k.shield&&src.id!=='pako'&&src.id!=='mumu')shield(tgt,tgt.maxhp*k.shield,src.uid);
    if(src.id==='pako'&&valueAfterCut>real)shield(tgt,Math.min(Math.round(tgt.maxhp*.18),valueAfterCut-real),src.uid);
    if(src.id==='tiandou')tgt.skillShieldMana=k.mana;
    else if(k.mana)gainMana(tgt,k.mana,src);
  }
  function die(tgt,src){if(tgt.hp>0)return;tgt.hp=0;emit('death',{target:tgt.uid,by:src?.uid||null});if(src?.killHeal&&src.hp>0)heal(src,src,src.maxhp*src.killHeal);if(src?.killMana){src.mana=clamp(src.mana+src.killMana,0,src.maxmana);emit('mana',{from:src.uid,target:src.uid,amount:src.killMana,reason:'item-kill'});}if(src?.killShield)shield(src,src.maxhp*src.killShield);if(src?.killHaste){src.killHasteStacks=Math.min(3,(src.killHasteStacks||0)+1);src.killHasteBonus=1+src.killHaste*src.killHasteStacks;src.killHasteT=4000;}}
  function damage(src,tgt,raw,dtype='phys',kind='attack') {
    if(!tgt||tgt.hp<=0)return 0;
    const wasCasting=src?._casting,wasBasic=src?._basicAttack;
    if(src){src._casting=kind==='skill';src._basicAttack=kind==='attack';}
    raw=bondRuntime.preHit(proxies.get(src),proxies.get(tgt),raw,wrapped,dtype);
    if(raw<=0){emit(kind,{from:src?.uid||null,target:tgt.uid,amount:0,absorbed:0,dtype,hp:tgt.hp,shield:tgt.shield,mana:tgt.mana});if(src){src._casting=wasCasting;src._basicAttack=wasBasic;}return 0;}
    if(kind!=='link'&&tgt.linkT>0&&tgt.linkShare>0&&tgt.linkTarget){const mate=units.find(x=>x.uid===tgt.linkTarget&&x.hp>0);if(mate){const shared=Math.round(raw*tgt.linkShare);raw-=shared;tgt.linkT=0;tgt.linkShare=0;tgt.linkTarget=null;damage(src,mate,shared,dtype,'link');}}
    if(tgt.exposure?.left>0&&src?.side===tgt.exposure.side&&src.uid!==tgt.exposure.owner){raw=Math.round(raw*(1+tgt.exposure.amp));tgt.exposure=null;emit('exposureBurst',{from:src.uid,target:tgt.uid,label:'✦破绽'});}
    if(tgt.wound&&(kind==='attack'||!tgt.woundBasicOnly)){raw*=1+tgt.wound;tgt.wound=0;tgt.woundT=0;}
    if(tgt.arcaneT>0&&tgt.arcaneMarks>0&&src?.side!==tgt.side){raw*=1+.06*tgt.arcaneMarks;tgt.arcaneMarks=0;tgt.arcaneT=0;if(src?.markShield){shield(src,src.maxhp*src.markShield);const mate=allies(src).filter(x=>x!==src).sort(byHp)[0];if(mate)shield(mate,mate.maxhp*src.markShield,src.uid);}}
    if(tgt.sigMark?.left>0&&(!tgt.sigMark.guard||src?.side!==tgt.side)){const mark=tgt.sigMark;tgt.sigMark=null;const before=raw;raw=Math.round(raw*(1+(mark.guard?-mark.amp:mark.amp)));emit('markBurst',{from:mark.owner,target:tgt.uid,label:mark.label,kind:mark.kind,guard:mark.guard,amp:mark.amp,rawBefore:before,rawAfter:raw});}
    if(src?.passive==='shieldbreak'&&tgt.shield>0)raw*=1.8;
    let amount=Math.max(1,Math.round(raw));
    if(dtype==='phys'){amount=Math.round(amount*(1-(.052*(tgt.ar-tgt.arDown))/(.9+.048*Math.abs(tgt.ar-tgt.arDown))));if(tgt.petrifyT>0)amount=Math.round(amount*1.25);}
    else if(dtype==='magic')amount=Math.round(amount*(1-(tgt.mr-tgt.mrDown)));
    if(dtype!=='pure')amount=Math.max(amount,Math.ceil(raw*.05));
    const preShieldDamage=amount;
    const blocked=tgt.block>0&&random()<tgt.block;
    if(blocked){amount=Math.ceil(amount*.5);if(src&&tgt.blockSlow){src.slow=Math.max(src.slow,1200);src.slowPct=Math.max(src.slowPct||0,.20);}emit('block',{from:src?.uid||null,target:tgt.uid});}
    if(tgt.noShield>0)tgt.shield=0;
    const shieldBefore=tgt.shield,absorbed=Math.min(tgt.shield,amount);tgt.shield-=absorbed;amount-=absorbed;
    amount=Math.max(0,Math.round(amount*(1-(tgt.dr||0))));
    amount=bondRuntime.beforeHealth(proxies.get(src),proxies.get(tgt),amount,wrapped);
    tgt.hp=Math.max(0,tgt.hp-amount);
    if(amount>0&&src&&!tgt.passive&&tgt.silence<=0){const lo=Math.min(amount/5,15),hi=Math.min(amount/2.5,30);tgt.mana=clamp(tgt.mana+(lo+random()*(hi-lo))*tgt.manaRegen,0,tgt.maxmana);}
    emit(kind,{from:src?.uid||null,target:tgt.uid,amount,absorbed,dtype,x:tgt.x,y:tgt.y,hp:tgt.hp,shield:tgt.shield,mana:tgt.mana});
    if(shieldBefore>0&&tgt.shield===0){emit('shieldBreak',{target:tgt.uid,by:src?.uid||null,shield:tgt.shield});if(tgt.skillShieldMana){gainMana(tgt,tgt.skillShieldMana,tgt,'shield-break');tgt.skillShieldMana=0;}if(tgt.shieldBreakMana&&tgt.shieldBreakCd<=0){gainMana(tgt,tgt.shieldBreakMana,tgt,'shield-break');tgt.shieldBreakCd=4500;}if(tgt.counterT>0&&tgt.counter&&src?.hp>0){const counter=tgt.counter;tgt.counter=0;tgt.counterT=0;damage(tgt,src,preShieldDamage*counter,'magic','counter');}}
    if(shieldBefore>0&&tgt.shield===0&&src?.passive==='shieldbreak')src.shieldBreakReady=true;
    if(kind==='skill'&&src?.manaBurnItem&&tgt.hp>0&&!tgt.passive){const lost=Math.min(tgt.mana,src.manaBurnItem);tgt.mana-=lost;if(lost)emit('manaBurn',{from:src.uid,target:tgt.uid,amount:lost,mana:tgt.mana,source:'item'});}
    if(kind==='skill'&&src?.arcanePips&&tgt.hp>0){tgt.arcaneMarks=Math.min(src.arcanePips,(tgt.arcaneMarks||0)+1);tgt.arcaneT=4000;}
    if(src&&amount>0&&(kind==='attack'||kind==='skill'||kind==='bounce')){
      const vamp=kind==='skill'?src.skillVamp:src.vamp, gain=Math.round(amount*(vamp||0));
      if(gain){const actual=heal(src,src,gain);if(actual<gain&&src.overflowShield)shield(src,(gain-actual)*src.overflowShield);}
    }
    const thornPct=Math.max(tgt.thorns||0,shieldBefore>0?(tgt.shieldThorns||0):0);
    if(thornPct&&src&&src.hp>0&&preShieldDamage>0){const reflected=bondRuntime.beforeHealth(proxies.get(tgt),proxies.get(src),Math.round(tgt.maxhp*thornPct),wrapped);src.hp=Math.max(0,src.hp-reflected);emit('thorns',{from:tgt.uid,target:src.uid,amount:reflected,dtype:'pure',hp:src.hp,shield:src.shield,mana:src.mana});if(src.hp<=0)die(src,tgt);}
    if(tgt.thornsSlow&&src){src.slow=Math.max(src.slow,1400);src.slowPct=Math.max(src.slowPct||0,.18);}
    if(tgt.hp===0){if(kind==='skill'&&src?.killReset){src.mana=src.maxmana;src.skillCd=0;src.killReset=false;emit('mana',{from:src.uid,target:src.uid,mana:src.mana,amount:src.maxmana,reason:'kill-reset'});}if(src?.passive==='shieldbreak'&&shieldBefore>0)src.shieldBreakReady=true;die(tgt,src);}
    bondRuntime.hit(proxies.get(src),proxies.get(tgt),amount,wrapped);
    if(tgt.hp<=0&&src)bondRuntime.kill(proxies.get(src),proxies.get(tgt),wrapped);
    if(src){src._casting=wasCasting;src._basicAttack=wasBasic;}
    return amount;
  }
  function applyHitEffects(u,t,k,target,power) {
    if(!t||t.hp<=0)return;
    if(k.stun&&(!k.stealShield||k.stoleShield))t.stun=Math.max(t.stun,k.stun);
    if(k.freeze)t.freeze=Math.max(t.freeze,k.freeze);
    if(k.petrify){t.freeze=Math.max(t.freeze,k.petrify);t.petrifyT=Math.max(t.petrifyT||0,k.petrify);}
    if(k.silence)t.silence=Math.max(t.silence,k.silence);
    // k.slow carries the solo slow amount (<1) or a plain duration; the amount feeds slowPct, which
    // lengthens the attack cooldown while t.slow > 0 (solo: cd*(1+slowA) while slowed).
    if(k.slow){const pct=typeof k.slow==='number'&&k.slow<1?k.slow:.3;t.slow=Math.max(t.slow,2200);t.slowPct=Math.max(t.slowPct||0,pct);}
    if(k.weaken){t.weaken=Math.max(t.weaken,k.weaken);t.weakenT=Math.max(t.weakenT,3500);if(u.id==='haruka')t.weakenBy=u.uid;}
    if(k.wound){t.wound=Math.max(t.wound,k.wound);t.woundT=Math.max(t.woundT,4000);t.woundBasicOnly=true;}
    if(k.brittle){if(u.id==='liAn')t.brittle=k.brittle;else{t.wound=k.brittle;t.woundT=4000;t.woundBasicOnly=false;}}
    if(k.healBlock)t.healLock=Math.max(t.healLock,k.healBlock*1000);
    if(k.echo)t.castEcho={owner:u,amp:k.echo,left:5000};
    if(k.noShield)t.noShield=Math.max(t.noShield,k.noShield);
    if(k.enemyHealDown){t.healDown=Math.max(t.healDown,k.enemyHealDown);t.healDownT=Math.max(t.healDownT,4000);}
    if(k.shred){t.arDown=Math.max(t.arDown,k.shred);t.arDownT=Math.max(t.arDownT,4000);}
    if(k.sunder){t.mrDown=Math.max(t.mrDown,k.sunder);t.mrDownT=Math.max(t.mrDownT,4000);}
    if(k.reflectSkill){t.reflect=Math.max(t.reflect,k.reflectSkill);t.reflectT=Math.max(t.reflectT,5000);t.reflectBy=u;}
    if(k.manaBurn){const lost=Math.round(t.mana*k.manaBurn);t.mana=Math.max(0,t.mana-lost);if(lost)emit('manaBurn',{from:u.uid,target:t.uid,amount:lost,mana:t.mana});}
    if(k.bleed){t.poisonDmg=Math.max(t.poisonDmg||0,Math.round(t.maxhp*k.bleed));t.poison=Math.max(t.poison,(k.bleedDuration||3)*1000);}

  }
  function queueHeal(u,t,value,k,delay=0){const travel=t===u?0:flight(u,t);if(!travel){skillHeal(u,t,value,k);return;}emit('healLaunch',{from:u.uid,target:t.uid,duration:travel+delay});queueImpact(travel+delay,()=>{if(t.hp>0)skillHeal(u,t,value,k);});}
  function castSkill(u) {
    const k=SKILLS[u.id];if(!k||k.mode==='passive')return false;
    if(u!==nextCaster||u.mana<u.maxmana||u.skillCd>0||u.stun>0||u.silence>0)return false;
    if(bondRuntime.beforeCast(proxies.get(u),wrapped))return true;
    const team=allies(u),enemies=foes(u),cost=ROSTER[u.id].cost;
    // Solo: power scales with SKILL_STAR_M[cost]^(star-1); the table is keyed by COST, not star.
    const power=Math.round(u.atk*(1+u.attackBuff)*(1-(u.weaken||0))*u.skillMul*(.82+.10*cost)*Math.pow(({1:1.30,2:1.25,3:1.20,4:1.15,5:1.12})[cost]||1.1,u.star-1));
    if(u.reflect>0){const owner=u.reflectBy,amp=u.reflect;u.reflect=0;u.reflectT=0;if(owner?.hp>0)damage(owner,u,power*amp,'magic','reflect');if(u.hp<=0)return true;}
    if(u.castEcho?.left>0&&u.castEcho.owner.hp>0)damage(u.castEcho.owner,u,u.castEcho.owner.atk*u.castEcho.amp,'magic','echo');
    if(u.hp<=0)return true;
    lastCast=at;lastSideCast[u.side]=at;nextCastSide=u.side==='A'?'B':'A';nextCaster=null;
    u.mana=0;u.skillCd=3000;u.cd=Math.max(u.cd,850);u.casts++;
    emit('cast',{from:u.uid,skill:u.id,mode:k.mode,mana:u.mana});
    const actualHits=[];let scheduledHits=0,collectingHits=true;
    const finish=()=>{if(collectingHits||scheduledHits)return;const recipients=actualHits.filter(t=>t.hp>0);if(k.pull)for(const t of recipients){const x=t.x+Math.sign(u.x-t.x),y=t.y+Math.sign(u.y-t.y);if(x>=0&&x<8&&y>=0&&y<8&&!units.some(v=>v!==t&&v.hp>0&&v.x===x&&v.y===y)){t.x=x;t.y=y;emit('move',{unit:t.uid,x,y,kind:'pull'});}}placeMark(recipients[0]||u,u,!recipients.length);};
    const healN=k.healN||1;
    if(['heal','support'].includes(k.mode)){
      const candidates=k.mode==='support'?team.filter(t=>t!==u):team;
      const targets=[...candidates].sort(byHp).slice(0,k.mode==='support'?candidates.length:healN);
      for(const [i,t] of targets.entries())queueHeal(u,t,power*k.heal,k,i*80);
      if(k.haste){u.haste=Math.max(u.haste,k.haste);u.hasteT=Math.max(u.hasteT,4000);}
    } else if(k.mode==='team'){
      const injured=team.filter(t=>t.hp<t.maxhp).length;
      for(const [i,t] of team.entries()){const controlled=t.stun>0||t.freeze>0||t.silence>0||t.hex>0;queueHeal(u,t,power*k.heal,k,i*65);if(k.attack){t.attackBuff=Math.max(t.attackBuff,k.attack);t.attackBuffT=Math.max(t.attackBuffT,4000);}if(k.haste&&(u.id!=='shengge'||controlled)){t.haste=Math.max(t.haste,k.haste);t.hasteT=Math.max(t.hasteT,(k.hasteDuration||4)*1000);}if(k.tempo){t.tempoHits=1;t.tempoT=3000;}}
      if(k.zone)spawnZone(u,u.x,u.y,k.zone);
      if(u.id==='zeyin')for(let i=0;i<Math.min(4,injured);i++){const target=choose(u,foes(u));if(target)damage(u,target,power*.35,'magic','echo');}
      if(k.enemyHealDown)for(const t of enemies){t.healDown=Math.max(t.healDown,k.enemyHealDown);t.healDownT=Math.max(t.healDownT,4000);}
    } else if(k.mode==='teamShield'){
      for(const t of team){if(k.cleanse){cleanse(t);t.controlWard=true;}shield(t,t.maxhp*k.shield,u.uid);}
      if(k.dr)for(const t of team){t.dr=Math.max(t.dr,k.dr);t.drT=Math.max(t.drT,4000);}
      if(k.taunt)u.taunt=Math.max(u.taunt,k.taunt);
    } else if(k.mode==='guard'||k.mode==='guardLink'){
      shield(u,u.maxhp*k.shield,u.uid);if(k.taunt)u.taunt=Math.max(u.taunt,k.taunt);
      if(k.counter){u.counter=k.counter;u.counterT=7000;}
      if(k.block){u.block=Math.max(u.block,k.block);u.blockT=Math.max(u.blockT,4000);u.blockSlow=k.slow||0;}if(k.thorns)u.shieldThorns=k.thorns;
      if(k.mode==='guardLink'){const mate=team.filter(t=>t!==u).sort(byHp)[0];if(mate){const delay=90+flight(u,mate);emit('shieldLaunch',{from:u.uid,target:mate.uid,duration:delay});queueImpact(delay,()=>{if(mate.hp<=0)return;shield(mate,mate.maxhp*k.allyShield,u.uid);mate.linkTarget=u.uid;mate.linkShare=k.link;mate.linkT=3500;});}}
    } else {
      let targets=[];
      if(k.mode==='burst'&&u.id!=='songlv'){const target=choose(u,enemies,k.target||'near');if(target)targets=[target,...sortDist(target,enemies.filter(t=>t!==target&&dist(t,target)<=1)).slice(0,2)];}
      else if(['cleave','burst','field','dashCleave'].includes(k.mode)){
        const anchor=u.id==='liAn'?choose(u,enemies,'hi'):u;
        const radius=u.id==='liAn'?4:k.mode==='field'?3:1;
        targets=sortDist(anchor,enemies).filter(t=>k.mode==='field'?dist(anchor,t)<=radius:Math.max(Math.abs(anchor.x-t.x),Math.abs(anchor.y-t.y))<=radius);
      } else if(k.mode==='chain'){let anchor=u;const remaining=[...enemies];while(remaining.length&&targets.length<(k.targets||3)){const next=sortDist(anchor,remaining)[0];targets.push(next);remaining.splice(remaining.indexOf(next),1);anchor=next;}}
      else {const target=choose(u,enemies,k.target||'near');if(target)targets=[target];}
      if(['dash','dashCleave'].includes(k.mode)){
        const target=choose(u,enemies,k.target||'near');const spot=target&&landingBeside(u,target,units);
        if(spot){u.x=spot.x;u.y=spot.y;emit('move',{unit:u.uid,x:u.x,y:u.y,kind:'dash'});}
        if(u.id==='hoshimi')u.killReset=true;
        if(k.phase){u.phaseT=k.phase*1000;u.phaseDodge=.55;}
        if(k.mode==='dashCleave')targets=enemies.filter(t=>Math.max(Math.abs(u.x-t.x),Math.abs(u.y-t.y))<=1);
        else if(k.splash&&target)targets=[target,...sortDist(target,enemies.filter(t=>t!==target&&dist(t,target)<=1)).slice(0,3)];
      }
      const hits=k.hits||1;
      for(let i=0;i<targets.length;i++){
        const t=targets[i];if(t.hp<=0)continue;
        let raw=power*(k.mode==='combo'?1:(k.mode==='dash'&&i>0?k.splash:(k.mults?.[i]||k.mult||1.5)));
        if(k.lowHPBoost)raw*=1+k.lowHPBoost*(1-u.hp/u.maxhp);
        for(let h=0;h<hits&&t.hp>0;h++){
          // Solo strips or steals shields before the hit lands (v3ApplyHit pre-damage check);
          // doing it after damage() would leave nothing to steal once the shield is consumed.
          const detached=['zone','chain','chaos'].includes(k.mode)||(k.mode==='burst'&&u.id!=='songlv')||(k.mode==='single'&&!(k.attackStyle==='blade'||u.range<=1));
          const delay=h*180+(k.mode==='chain'?i*280:0)+(detached?flight(u,t):0);
          scheduledHits++;
          const strikeImpact=()=>{try{if(t.hp<=0)return;
          if(!actualHits.includes(t))actualHits.push(t);
          const stoleShield=!!(k.stealShield&&t.shield>0);
          if(stoleShield){const stolen=t.shield;t.shield=0;shield(u,stolen);}
          if(k.shieldbreak&&t.shield>0){const stripped=t.shield;t.shield=0;t.noShield=Math.max(t.noShield,2500);emit('shieldBreak',{target:t.uid,by:u.uid,amount:stripped,shield:t.shield});}
          const strikeRaw=k.mode==='combo'?power*(k.mults?.[h]||1):raw;
          const dealt=damage(u,t,strikeRaw+(k.execute&&t.hp/t.maxhp<.4?power*k.execute:0),k.dtype||u.dtype,'skill');
          const strike={...k,stoleShield};
          if((u.id==='yukie'&&h<hits-1)||(u.id==='sanli'&&i<targets.length-1))strike.stun=0;
          if(u.id==='yukie'&&h<hits-1||u.id==='mahiru'&&h<hits-1)strike.bleed=0;
          applyHitEffects(u,t,strike,t,power);
          if(k.lifesteal&&dealt&&!['rinco','miyue'].includes(u.id))heal(u,u,dealt*k.lifesteal);
          if(k.season&&t.hp>0){const season=i%4;if(season===0){t.slow=Math.max(t.slow,2000);t.slowPct=Math.max(t.slowPct||0,.25);}else if(season===1){const lost=Math.round(t.maxmana*.3);t.mana=Math.max(0,t.mana-lost);emit('manaBurn',{from:u.uid,target:t.uid,amount:lost,mana:t.mana});}else if(season===2){t.poison=3000;t.poisonDmg=Math.round(t.maxhp*.02);}else t.freeze=Math.max(t.freeze,1000);}
          if(u.id==='rei'&&t.hp>0)t.healBomb={owner:u,amp:k.enemyHealDown,left:4000};
          if(k.afterimage&&t.hp>0)t.afterimage={owner:u,left:2000,damage:Math.round(power*.72)};
          if(k.mode==='chaos'&&t.hp>0){const effect=random();if(effect<.34)t.freeze=Math.max(t.freeze,1300);else if(effect<.67)t.silence=Math.max(t.silence,1800);else{t.mana=Math.max(0,t.mana-20);emit('manaBurn',{from:u.uid,target:t.uid,amount:20,mana:t.mana});}}
          }finally{scheduledHits--;finish();}};
          if(delay){emit('skillLaunch',{from:u.uid,target:t.uid,mode:k.mode,duration:delay,detached});queueImpact(delay,strikeImpact);}else strikeImpact();
        }
      }
      if(k.mode==='zone'&&targets[0]){const target=targets[0];queueImpact(flight(u,target),()=>spawnZone(u,target.x,target.y,{...k.zone,slow:k.slow||0}));}
      if(u.id==='seki')spawnZone(u,u.x,u.y,{r:3,dur:2600,dps:0,manaBurn:6});
      if(k.mode==='field'&&k.mana)gainMana(u,k.mana*targets.length);
      if(u.id==='miyue')u.vamp=Math.min(.3,u.vamp+targets.length*k.lifesteal);
      if(u.id==='rinco')u.vamp=Math.max(u.vamp,k.lifesteal);
    }
    collectingHits=false;finish();
    if(u.singer){const n=team.filter(t=>t.singer).length,nearest=choose(u,enemies);if(nearest)damage(u,nearest,u.atk*((bonds[u.side==='A'?'A':'B']['歌势']>=2?1.6:.8)+.4*n),'magic','bond');}
    if(u.manaGift){const candidates=team.filter(t=>t!==u&&!t.passive);const mate=(candidates.length?candidates:[u]).sort((x,y)=>x.mana/x.maxmana-y.mana/y.maxmana)[0];if(mate){mate.mana=clamp(mate.mana+u.manaGift,0,mate.maxmana);emit('mana',{from:u.uid,target:mate.uid,amount:u.manaGift,reason:'item-cast'});}}
    if(u.castShield){const mate=team.filter(t=>t!==u).sort(byHp)[0];shield(u,u.maxhp*u.castShield);if(mate)shield(mate,mate.maxhp*u.castShield);}
    if(u.teamCastShield)for(const t of team)shield(t,t.maxhp*u.teamCastShield,u.uid);
    if(u.castSunder){const t=choose(u,enemies);if(t){t.mrDown=Math.max(t.mrDown,u.castSunder);t.mrDownT=Math.max(t.mrDownT,2500);}}

    if(u.nextAmp||u.nextSplash||u.nextBounce)u.nextAttackAmp=Math.max(u.nextAttackAmp||0,u.nextAmp),u.nextAttackSplash=u.nextSplash,u.nextAttackBounce=u.nextBounce;
    if(k.bounce)u.nextAttackBounce=.5;
    bondRuntime.cast(proxies.get(u),wrapped);
    return true;
  }
  function onAttack(u,t,dealt,critical,raw=dealt) {
    if(dealt<=0)return;
    const profile=classicAttackProfile(u.id);
    if(!['rainveil','soulmate'].includes(profile.onHit)&&random()<profile.proc){
      if(profile.onHit==='bleed'){t.poison=Math.max(t.poison,2200);t.poisonDmg=Math.max(t.poisonDmg||0,Math.round(t.maxhp*profile.potency));}
      else if(profile.onHit==='slow'){t.slow=Math.max(t.slow,1400);t.slowPct=Math.max(t.slowPct||0,.18);}
      else if(profile.onHit==='mana')gainMana(u,5,u);
      else if(profile.onHit==='spark'){const near=sortDist(t,foes(u).filter(x=>x!==t&&dist(x,t)<=2))[0];if(near)damage(u,near,Math.round(raw*.28),'magic','spark');}
    }
    u.attacks++;
    bondRuntime.attack(proxies.get(u),proxies.get(t),dealt,wrapped);
    if(u.tempoHits>0){u.tempoHits--;damage(u,t,u.atk*.42,'magic','tempo');for(const near of sortDist(t,foes(u).filter(x=>x!==t&&dist(x,t)<=2)).slice(0,2))damage(u,near,u.atk*.42,'magic','tempo');}
    if(u.edgePips){const every=u.edgePips>=2?3:4;if(u.attacks%every===0){const edge=Math.round(u.atk*.28);damage(u,t,edge,'pure','item');const near=sortDist(t,foes(u).filter(x=>x!==t&&dist(x,t)<=1))[0];if(near)damage(u,near,edge*.45,'pure','item');}}
    if(u.firstSnare){u.firstSnare=false;t.slow=Math.max(t.slow,1200);t.slowPct=Math.max(t.slowPct||0,.20);emit('slow',{from:u.uid,target:t.uid,source:'item'});}
    if(u.stormStun&&u.attacks%3===0&&t.hp>0)t.stun=Math.max(t.stun,450);
    if(u.poisonItem&&t.hp>0){t.poison=Math.max(t.poison,3000);t.poisonDmg=Math.max(t.poisonDmg||0,Math.round(t.maxhp*u.poisonItem));}   // 物品毒固定 3 秒（对齐经典 index.html:1606；此处无技能配置 k 可引）
    if(u.bondSilence&&random()<u.bondSilence)t.silence=Math.max(t.silence,3000);
    if(t.petrifyChance&&u.melee&&random()<t.petrifyChance)u.stun=Math.max(u.stun,1500);
    if(u.passive==='soulmate'){
      heal(u,u,u.maxhp*.03);const mate=allies(u).filter(x=>x!==u).sort(byHp)[0];if(mate)heal(u,mate,mate.maxhp*.03);
      const pair=[u,mate].filter(Boolean);if(pair.some(x=>x.hp/x.maxhp<.22)&&u.soulShieldCd<=0){for(const unit of pair)shield(unit,unit.maxhp*.2,u.uid);u.soulShieldCd=8000;}
    }
    if(u.passive&&t.hp>0)placeMark(t,u);
    if(u.passive==='rainveil'&&u.attacks%2===0)u.rainStacks=Math.min(2,(u.rainStacks||0)+1);
    const enemies=foes(u), bounceChance=u.bounceChance||u.bounce;
    if(bounceChance&&random()<bounceChance){const other=sortDist(t,enemies.filter(x=>x!==t&&dist(x,t)<=2))[0];if(other)damage(u,other,raw*(u.bounceEcho||.5),u.dtype,'bounce');}
    if(u.critExpose&&critical&&t.hp>0)t.exposure={amp:u.critExpose,left:2500,side:u.side,owner:u.uid};

    if(u.nextAttackSplash){const other=sortDist(t,enemies.filter(x=>x!==t&&dist(x,t)<=2))[0];if(other)damage(u,other,raw*u.nextAttackSplash,'magic','item');u.nextAttackSplash=0;}
    if(u.nextAttackBounce){const other=sortDist(t,enemies.filter(x=>x!==t&&dist(x,t)<=3))[0];if(other)damage(u,other,raw*u.nextAttackBounce,'magic','item');u.nextAttackBounce=0;}
  }
  bondRuntime.start(wrapped);
  const statusFields=['stun','freeze','silence','slow','taunt','poison','noShield','hasteT','attackBuffT','drT','woundT','weakenT','healDownT','arDownT','mrDownT','reflectT','blockT','healLock','counterT','tempoT','hex','phaseT','petrifyT'];
  const lastStatus=new Map();
  for(let tick=0;tick<maxTicks;tick++) {
    at=tick*tickMs;
    const ready=pendingImpacts.filter(p=>p.at<=at);
    for(let i=pendingImpacts.length-1;i>=0;i--)if(pendingImpacts[i].at<=at)pendingImpacts.splice(i,1);
    for(const impact of ready)impact.resolve();
    const candidates=at-lastCast>=800?units.filter(u=>u.hp>0&&!u.passive&&u.stun<=0&&u.freeze<=0&&u.silence<=0&&!(u.hex>0)&&u.mana>=u.maxmana&&u.skillCd<=0&&at-lastSideCast[u.side]>=1200):[];
    nextCaster=candidates.find(u=>u.side===nextCastSide)||candidates[0]||null;
    if(!live(a).length||!live(b).length)break;
    for(const u of units) {
      if(u.exposure){u.exposure.left-=tickMs;if(u.exposure.left<=0)u.exposure=null;}
      if(u.sigMark){u.sigMark.left-=tickMs;if(u.sigMark.left<=0){u.sigMark=null;emit('markExpired',{target:u.uid});}}
      if(u.afterimage){const effect=u.afterimage;effect.left-=tickMs;if(effect.left<=0){u.afterimage=null;if(effect.owner.hp>0&&u.hp>0)damage(effect.owner,u,effect.damage,'magic','afterimage');for(const mate of units.filter(x=>x.hp>0&&x.side===u.side&&dist(x,u)<=1))mate.silence=Math.max(mate.silence,1300);}}
      if(u.hp<=0)continue;
      if(u.controlWard&&(u.stun>0||u.freeze>0||u.silence>0||u.hex>0)){u.stun=u.freeze=u.silence=u.hex=0;u.controlWard=false;emit('cleanse',{from:u.uid,target:u.uid});}
      const frozenBefore=u.freeze;
      for(const key of ['healLock','counterT','shieldBreakCd','tempoT','soulShieldCd','arcaneT','moveCd','linkT','hex','petrifyT','phaseT','killHasteT','thornsT'])if(u[key]>0)u[key]=Math.max(0,u[key]-tickMs);
      for(const key of ['castEcho','healBomb'])if(u[key]){u[key].left-=tickMs;if(u[key].left<=0)u[key]=null;}
      if(u.thornsT===0)u.thorns=u.itemIds.includes('bramble')?.04:0;
      if(!u.killHasteT){u.killHasteStacks=0;u.killHasteBonus=1;}
      if(!u.tempoT)u.tempoHits=0;
      for(const key of ['cd','skillCd','stun','silence','slow','freeze','taunt','hasteT','attackBuffT','drT','blockT','poison','noShield','healDownT','arDownT','mrDownT','reflectT','woundT','weakenT'])if(u[key]>0)u[key]=Math.max(0,u[key]-tickMs);
      if(!u.hasteT)u.haste=0;if(!u.attackBuffT)u.attackBuff=0;if(!u.drT)u.dr=0;if(!u.blockT)u.block=0;
      if(!u.slow)u.slowPct=0;
      if(!u.healDownT)u.healDown=0;if(!u.arDownT)u.arDown=0;if(!u.mrDownT)u.mrDown=0;if(!u.reflectT)u.reflect=0;
      if(!u.weakenT)u.weaken=0;if(!u.woundT)u.wound=0;
      if(frozenBefore>0&&u.freeze===0&&u.brittle){u.wound=u.brittle;u.woundBasicOnly=false;u.woundT=5000;u.brittle=0;}
      if(u.regen)heal(u,u,u.regen*tickMs/1000);
      if(u.manaPerSec)u.mana=clamp(u.mana+u.manaPerSec*tickMs/1000,0,u.maxmana);
      if(u.shieldTick&&tick>0&&at%3000===0)shield(u,u.maxhp*u.shieldTick);
      if(u.guardChance&&tick>0&&at%3000===0&&random()<u.guardChance)shield(u,u.maxhp*u.guardShield);
      if(u.medic&&tick>0&&at%5000===0){const group=allies(u),targets=[...group].sort(byHp).slice(0,bonds[u.side==='A'?'A':'B']['医者']>=2?2:1);for(const t of targets)heal(u,t,t.maxhp*(bonds[u.side==='A'?'A':'B']['医者']>=2?.06:.04));}
      if(u.poison>0&&at%1000===0){const dealt=bondRuntime.beforeHealth(null,proxies.get(u),Math.min(u.hp,u.poisonDmg||0),wrapped);u.hp=Math.max(0,u.hp-dealt);emit('dot',{from:null,target:u.uid,amount:dealt,hp:u.hp});if(u.hp<=0)die(u,null);}
      if(u.hp<=0||u.stun>0||u.freeze>0||u.hex>0)continue;
      if(u.job==='刺客'&&!u.jumped){
        u.jumped=true;
        const opponents=foes(u);
        const depth=foe=>u.side==='A'?3-foe.y:foe.y-4;
        const sorted=[...opponents].sort((a,b)=>
          ((b.range>=2?10:0)+depth(b)*2-b.hp/b.maxhp)-
          ((a.range>=2?10:0)+depth(a)*2-a.hp/a.maxhp));
        const spot=sorted.map(foe=>landingBeside(u,foe,units,Math.max(1,u.range))).find(Boolean);
        if(spot){u.x=spot.x;u.y=spot.y;u.cd=500;emit('move',{unit:u.uid,x:u.x,y:u.y,kind:'jump'});}
      }
      const enemy=foes(u);if(!enemy.length)continue;
      if(castSkill(u))continue;
      const taunted=enemy.filter(v=>v.taunt>0),shielded=u.passive==='shieldbreak'?enemy.filter(v=>v.shield>0):[];let target=choose(u,taunted.length?taunted:shielded.length?shielded:enemy);
      if(dist(u,target)>u.range){if(u.moveCd<=0){let step=nextStep(u,target,units);if(!step&&!taunted.length){for(const alternative of sortDist(u,enemy.filter(v=>v!==target))){step=nextStep(u,alternative,units);if(step){target=alternative;break;}}}if(step){u.x=step.x;u.y=step.y;u.moveCd=450*(u.job==='刺客'?.8:1)*(1+(u.slow>0?u.slowPct:0));emit('move',{unit:u.uid,x:u.x,y:u.y,kind:'walk'});}}continue;}
      if(u.cd>0)continue;
      // Slowed units swing slower (solo: ATTACK_INTERVAL/aspd*(1+slowA) while slowed).
      u.cd=1450/Math.max(.1,u.speed*(1+u.haste)*(u.killHasteBonus||1))*(1+(u.slow>0?u.slowPct||.3:0));
      const profile=classicAttackProfile(u.id);
      let raw=Math.round(u.atk*(1+u.attackBuff)*(1-(u.weaken||0))*profile.mult);
      if(u.nextAttackAmp){raw*=1+u.nextAttackAmp;u.nextAttackAmp=0;}
      if(u.passive==='shieldbreak'&&target.shield<=0&&u.shieldBreakReady){raw*=1.8;u.shieldBreakReady=false;}
      const critical=u.crit>0&&random()<u.crit;
      if(critical)raw=Math.round(raw*u.critM);
      if(random()<Math.max(target.dodge,target.phaseT>0?target.phaseDodge||0:0)){emit('dodge',{from:u.uid,target:target.uid});bondRuntime.dodge(proxies.get(target));if(target.dodgeAmp)target.nextAttackAmp=Math.max(target.nextAttackAmp||0,target.dodgeAmp);continue;}
      if(target.passive==='rainveil'&&target.rainStacks>0){target.rainStacks--;target.rainSlowReady=true;shield(target,target.maxhp*.08);emit('dodge',{from:u.uid,target:target.uid,reason:'rainveil'});continue;}
      if(target.passive==='rainveil'&&random()<.25){raw=Math.ceil(raw*.5);emit('block',{from:u.uid,target:target.uid,reason:'rainveil'});}
      const amount=damage(u,target,raw,u.dtype,'attack');
      if(amount>0){const cap=['法师','咒术','医者'].includes(u.job)?30:15;gainMana(u,Math.min(8+amount/6,cap)*u.manaRegen*(u.silence>0?.5:1),u,'attack');if(u.weaken>0&&u.weakenBy){const haruka=units.find(x=>x.uid===u.weakenBy&&x.hp>0);if(haruka)gainMana(haruka,4,u,'weaken-attack');}}
      if(u.passive==='rainveil'&&u.rainSlowReady&&target.hp>0){target.slow=Math.max(target.slow,1200);target.slowPct=Math.max(target.slowPct||0,.20);u.rainSlowReady=false;}
      onAttack(u,target,amount,critical,raw);
    }
    for(let i=zones.length-1;i>=0;i--){const zone=zones[i];zone.left-=tickMs;if(zone.left<=0||zone.u.hp<=0){zones.splice(i,1);continue;}zone.acc+=tickMs;if(zone.acc>=1000){zone.acc-=1000;for(const target of foes(zone.u).filter(t=>Math.max(Math.abs(t.x-zone.x),Math.abs(t.y-zone.y))<=zone.r)){if(zone.dps>0)damage(zone.u,target,Math.max(1,Math.round(zone.u.atk*zone.dps)),'magic','zoneDamage');if(zone.slow){target.slow=Math.max(target.slow,1200);target.slowPct=Math.max(target.slowPct,zone.slow);}if(zone.manaBurn){const lost=Math.min(target.mana,zone.manaBurn);target.mana-=lost;emit('manaBurn',{from:zone.u.uid,target:target.uid,amount:lost,mana:target.mana});}}}}
    for(const u of units) {
      const statuses=u.hp>0?statusFields.filter(key=>u[key]>0):[];
      const stats={atk:Math.round(u.atk*(1+u.attackBuff)*(1-(u.weaken||0))),speed:u.speed*(1+u.haste)*(u.killHasteBonus||1)/(1+(u.slow>0?u.slowPct||.3:0)),armor:u.ar-(u.arDown||0),resist:u.mr-(u.mrDown||0)};
      const stamp=JSON.stringify({statuses,stats});
      if(lastStatus.get(u.uid)!==stamp){lastStatus.set(u.uid,stamp);emit('status',{target:u.uid,statuses,stats});}
    }
  }
  const survivorsA=live(a).map(u=>({uid:u.uid,id:u.id,hp:Math.ceil(u.hp),maxhp:u.maxhp,x:u.x,y:u.y,shield:u.shield}));
  const survivorsB=live(b).map(u=>({uid:u.uid,id:u.id,hp:Math.ceil(u.hp),maxhp:u.maxhp,x:u.x,y:u.y,shield:u.shield}));
  const winner=survivorsA.length&&!survivorsB.length?'A':survivorsB.length&&!survivorsA.length?'B':'draw';
  return {winner,survivorsA,survivorsB,bonds,startingUnits,events,durationMs:at,complete:!survivorsA.length||!survivorsB.length};
}
