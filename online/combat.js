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
// Numeric item effects follow index.html ITEM_FX. Trigger-only item mechanics are not yet ported.
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
// are reduced to the supported deterministic effects in applySkill below.
// Exported for the skills audit tests only; resolveBattle stays the sole runtime entry.
export const SKILLS = {
  ein:{mode:'guard',shield:.34,taunt:2200}, kouichi:{mode:'dash',target:'far',mult:2.15,splash:.5,lifesteal:.18},
  yua:{mode:'single',target:'far',mult:2.25,dtype:'magic',manaBurn:.45,silence:1800},
  goutan:{mode:'guardLink',shield:.20,allyShield:.30,taunt:1800,link:.30},
  yujiu:{mode:'single',target:'far',mult:1.8,shred:24,bounce:true},
  songlv:{mode:'cleave',mult:1.5,stun:800,lifesteal:.20},
  likou:{mode:'heal',heal:2.1,shield:.10,cleanse:true}, agari:{mode:'team',heal:.9,shield:.08},
  hoshimi:{mode:'dash',target:'low',mult:2.35,bleed:.018}, chiharu:{mode:'cleave',mult:1.65,wound:.25},
  suiji:{mode:'support',heal:.6,mana:28,haste:.18}, kanban:{mode:'guard',shield:.45,block:.35,slow:.20},
  zhouyi:{mode:'passive',passive:'shieldbreak'}, yuji:{mode:'passive',passive:'rainveil'},
  tiandou:{mode:'heal',heal:1.45,healN:2,shield:.08}, aza:{mode:'team',heal:.7,attack:.12},
  pako:{mode:'heal',heal:2.3,shield:.18}, zhijin:{mode:'dash',target:'far',mult:2.4,lifesteal:.18,noShield:2000},
  sishi:{mode:'chain',targets:4,mults:[1.25,1.05,.88,.72],season:true},
  sumi:{mode:'teamShield',shield:.18,dr:.10,cleanse:true}, yukie:{mode:'combo',target:'near',hits:3,mults:[1,1.1,1.6],stun:450,bleed:.015},
  miting:{mode:'single',target:'hi',mult:2.05,dtype:'magic',sunder:.35,reflectSkill:.30},
  xuezhu:{mode:'zone',target:'far',mult:1.7,freeze:2000}, zeyin:{mode:'team',heal:1,enemyHealDown:.25},
  sanli:{mode:'chain',targets:3,mults:[1.6,1.2,.9],stun:600,dtype:'magic'},
  diansu:{mode:'single',target:'hi',mult:2,petrify:2200,shieldbreak:true},
  lianshiye:{mode:'single',mult:1.8,silence:3000,manaBurn:.4},
  huize:{mode:'single',mult:1.6,slow:.4,bleed:.015,enemyHealDown:.35},
  shengge:{mode:'team',heal:.95,cleanse:true,haste:.15},
  shadow:{mode:'dash',target:'low',mult:2.8,execute:.45},
  nox:{mode:'dash',target:'far',mult:2.4}, miyue:{mode:'cleave',mult:1.85,bleed:.02,lifesteal:.05},
  huali:{mode:'heal',heal:1.6,healN:2,mana:18}, youyu:{mode:'single',target:'near',mult:2.2,dtype:'pure'},
  quanrong:{mode:'guard',shield:.50,taunt:2500,thorns:.08},
  ruiya:{mode:'single',target:'far',mult:2,freeze:2400}, mumu:{mode:'team',heal:1.05,haste:.20,shield:.10},
  kroya:{mode:'single',target:'hi',mult:2.6,dtype:'magic'},
  shiliu:{mode:'single',mult:2.15,stealShield:true,stun:600},
  seki:{mode:'cleave',mult:1.5,silence:2600,manaBurn:.35},
  haruka:{mode:'cleave',mult:1.8,weaken:.25,mana:4}, mahiru:{mode:'cleave',mult:.9,hits:3,lifesteal:.25,bleed:.02},
  nana7mi:{mode:'cleave',mult:2.1,slow:.35,lowHPBoost:.6}, liAn:{mode:'field',mult:1.25,freeze:1400,dtype:'magic'},
  youyi:{mode:'passive',passive:'soulmate'}, azi:{mode:'cleave',mult:1.3,stun:1500,dtype:'magic'},
  taodai:{mode:'teamShield',shield:.22,dr:.20,taunt:2700},
  miki:{mode:'heal',heal:1.5,healN:3,shield:.12,mana:12},
  rei:{mode:'cleave',mult:1.35,silence:2400,enemyHealDown:.40,dtype:'magic'}, rinco:{mode:'cleave',mult:2.1,silence:1800,lifesteal:.25}
};
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
    for (const key of items) {
      const fx=ITEM[key];
      if (fx.hp) u.maxhp=Math.round(u.maxhp*fx.hp);
      if (fx.atk) u.atk=Math.round(u.atk*fx.atk);
      if (fx.speed) u.speed*=fx.speed;
      for (const stat of ['dodge','crit','thorns','manaPerSec','shieldTick','killHeal','skillVamp','bounce']) u[stat]+=fx[stat]||0;
      if (fx.vamp) u.vamp=Math.max(u.vamp,fx.vamp);
      if (fx.manaRegen) u.manaRegen=Math.max(u.manaRegen,fx.manaRegen);
      if (fx.critM) u.critM=Math.max(u.critM,fx.critM);
      if (fx.skill) u.skillMul+=fx.skill;
      if (fx.manaStart) u.mana+=fx.manaStart;
      if (fx.shield) u.shield+=Math.round(u.maxhp*fx.shield);
      const parts=COMPONENTS[key]||[];
      u.startShield=Math.min(.16,u.startShield+parts.filter(p=>p==='armor').length*.08);
      u.edgePips=Math.min(2,u.edgePips+parts.filter(p=>p==='sword').length);
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
      if(key==='twinbows')u.nextBounce=.35;
      if(key==='swiftecho')u.nextAmp=.20;
      if(key==='bloodcore')u.overflowShield=.40;
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
    if(u.startShield)u.shield+=Math.round(u.maxhp*u.startShield);
    u.hp=u.maxhp;
    return u;
  });
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

/** Pure deterministic 64-cell battle slice. `winner` is A, B or draw. */
export function resolveBattle(boardA,boardB,seed,opts={}) {
  const random=rngOf(seed), a=entries(boardA,'A'),b=entries(boardB,'B'),units=[...a,...b],events=[];
  const bonds={A:bondTiers(a),B:bondTiers(b)};
  applyBonds(a,b,bonds.A,random);applyBonds(b,a,bonds.B,random);
  const tickMs=100,maxTicks=clamp(Number.isInteger(opts.maxTicks)?opts.maxTicks:600,1,1200);
  if(Number.isFinite(opts.initialMana))for(const u of units)u.mana=clamp(opts.initialMana,0,u.maxmana);
  let at=0;
  const emit=(type,more)=>events.push({type,at,...more});
  const allies=u=>live(units).filter(v=>v.side===u.side);
  const foes=u=>live(units).filter(v=>v.side!==u.side);
  const sortDist=(origin,list,far=false)=>[...list].sort((x,y)=>(far?dist(y,origin)-dist(x,origin):dist(x,origin)-dist(y,origin))||x.slot-y.slot);
  function choose(u,list,preference='near') {
    if(!list.length)return null;
    if(preference==='low')return [...list].sort(byHp)[0];
    if(preference==='hi')return [...list].sort((x,y)=>y.atk-x.atk||x.slot-y.slot)[0];
    return sortDist(u,list,preference==='far')[0];
  }
  function shield(u,value,from=u.uid){if(u.noShield>0)return;const amount=Math.max(0,Math.round(value));if(!amount)return;u.shield+=amount;emit('shield',{from,target:u.uid,amount});}
  function heal(src,tgt,value){if(tgt.hp<=0)return 0;const amount=Math.max(0,Math.min(tgt.maxhp-tgt.hp,Math.round(value*(1-(tgt.healDown||0)))));tgt.hp+=amount;if(amount)emit('heal',{from:src.uid,target:tgt.uid,amount});return amount;}
  function die(tgt,src){if(tgt.hp>0)return;tgt.hp=0;emit('death',{target:tgt.uid,by:src?.uid||null});if(src?.killHeal&&src.hp>0)heal(src,src,src.maxhp*src.killHeal);if(src?.killMana){src.mana=clamp(src.mana+src.killMana,0,src.maxmana);emit('mana',{from:src.uid,target:src.uid,amount:src.killMana,reason:'item-kill'});}if(src?.killShield)shield(src,src.maxhp*src.killShield);if(src?.killHaste)src.speed*=1+Math.min(.3,src.killHaste*Math.min(3,(src.killHasteStacks=(src.killHasteStacks||0)+1)));}
  function damage(src,tgt,raw,dtype='phys',kind='attack') {
    if(!tgt||tgt.hp<=0)return 0;
    if(kind!=='link'&&tgt.linkShare>0&&tgt.linkTarget){const mate=units.find(x=>x.uid===tgt.linkTarget&&x.hp>0);if(mate){const shared=Math.round(raw*tgt.linkShare);raw-=shared;damage(tgt,mate,shared,dtype,'link');}}
    if(kind==='attack'&&tgt.wound)raw*=1+tgt.wound;
    let amount=Math.max(1,Math.round(raw));
    if(dtype==='phys')amount=Math.round(amount*(1-(.052*(tgt.ar-tgt.arDown))/(.9+.048*Math.abs(tgt.ar-tgt.arDown))));
    else if(dtype==='magic')amount=Math.round(amount*(1-(tgt.mr-tgt.mrDown)));
    if(dtype!=='pure')amount=Math.max(amount,Math.ceil(raw*.05));
    amount=Math.max(1,Math.round(amount*(1-(tgt.dr||0))));
    const blocked=tgt.block>0&&random()<tgt.block;
    if(blocked){amount=Math.ceil(amount*.5);if(src&&tgt.blockSlow){src.slow=Math.max(src.slow,1200);src.slowPct=Math.max(src.slowPct||0,.20);}emit('block',{from:src?.uid||null,target:tgt.uid});}
    const shieldBefore=tgt.shield,absorbed=Math.min(tgt.shield,amount);tgt.shield-=absorbed;amount-=absorbed;
    tgt.hp=Math.max(0,tgt.hp-amount);
    if(amount>0&&src&&tgt.silence<=0){const lo=Math.min(amount/5,15),hi=Math.min(amount/2.5,30);tgt.mana=clamp(tgt.mana+(lo+random()*(hi-lo))*tgt.manaRegen,0,tgt.maxmana);}
    emit(kind,{from:src?.uid||null,target:tgt.uid,amount,absorbed,dtype,x:tgt.x,y:tgt.y});
    if(shieldBefore>0&&tgt.shield===0){emit('shieldBreak',{target:tgt.uid,by:src?.uid||null});if(tgt.shieldBreakMana){tgt.mana=clamp(tgt.mana+tgt.shieldBreakMana,0,tgt.maxmana);emit('mana',{from:tgt.uid,target:tgt.uid,amount:tgt.shieldBreakMana,reason:'shield-break'});}}
    if(src&&amount>0&&(kind==='attack'||kind==='skill'||kind==='bounce')){
      const vamp=kind==='skill'?src.skillVamp:src.vamp, gain=Math.round(amount*(vamp||0));
      if(gain){const actual=heal(src,src,gain);if(actual<gain&&src.overflowShield)shield(src,(gain-actual)*src.overflowShield);}
    }
    if(tgt.thorns&&src&&src.hp>0&&kind!=='thorns')damage(tgt,src,Math.max(1,Math.round(tgt.maxhp*tgt.thorns)),'pure','thorns');
    if(tgt.thornsSlow&&src){src.slow=Math.max(src.slow,1400);src.slowPct=Math.max(src.slowPct||0,.18);}
    // reflectSkill marks the caster: its own next skill backfires (solo castSkill v3Reflect).
    if(src&&src.reflect>0&&kind==='skill'&&src.hp>0){const back=raw*src.reflect;src.reflect=0;damage(src,src,back,'magic','reflect');}
    if(tgt.hp===0)die(tgt,src);
    return amount+absorbed;
  }
  function applyHitEffects(u,t,k,target,power) {
    if(!t||t.hp<=0)return;
    if(k.stun)t.stun=Math.max(t.stun,k.stun);
    if(k.freeze)t.freeze=Math.max(t.freeze,k.freeze);
    if(k.petrify)t.stun=Math.max(t.stun,k.petrify);
    if(k.silence)t.silence=Math.max(t.silence,k.silence);
    // k.slow carries the solo slow amount (<1) or a plain duration; the amount feeds slowPct, which
    // lengthens the attack cooldown while t.slow > 0 (solo: cd*(1+slowA) while slowed).
    if(k.slow){const pct=typeof k.slow==='number'&&k.slow<1?k.slow:.3;t.slow=Math.max(t.slow,typeof k.slow==='number'&&k.slow<1?2000:1200);t.slowPct=Math.max(t.slowPct||0,pct);}
    if(k.weaken){t.weaken=Math.max(t.weaken,k.weaken);t.weakenT=Math.max(t.weakenT,3000);}
    if(k.wound){t.wound=Math.max(t.wound,k.wound);t.woundT=Math.max(t.woundT,4000);}
    if(k.noShield)t.noShield=Math.max(t.noShield,k.noShield);
    if(k.enemyHealDown){t.healDown=Math.max(t.healDown,k.enemyHealDown);t.healDownT=Math.max(t.healDownT,4000);}
    if(k.shred){t.arDown=Math.max(t.arDown,k.shred);t.arDownT=Math.max(t.arDownT,4000);}
    if(k.sunder){t.mrDown=Math.max(t.mrDown,k.sunder);t.mrDownT=Math.max(t.mrDownT,4000);}
    if(k.reflectSkill){t.reflect=Math.max(t.reflect,k.reflectSkill);t.reflectT=Math.max(t.reflectT,5000);}
    if(k.manaBurn){const lost=Math.round(t.mana*k.manaBurn);t.mana=Math.max(0,t.mana-lost);if(lost)emit('manaBurn',{from:u.uid,target:t.uid,amount:lost});}
    if(k.bleed){t.poisonDmg=Math.max(t.poisonDmg||0,Math.round(t.maxhp*k.bleed));t.poison=Math.max(t.poison,3000);}
    if(k.execute&&t.hp/t.maxhp<.4)damage(u,t,power*k.execute,k.dtype||u.dtype,'skill');
  }
  function castSkill(u) {
    const k=SKILLS[u.id];if(!k||k.mode==='passive')return false;
    if(u.mana<u.maxmana||u.skillCd>0||u.stun>0||u.silence>0)return false;
    const team=allies(u),enemies=foes(u),cost=ROSTER[u.id].cost;
    // Solo: power scales with SKILL_STAR_M[cost]^(star-1); the table is keyed by COST, not star.
    const power=u.atk*u.skillMul*(.82+.10*cost)*Math.pow(({1:1.30,2:1.25,3:1.20,4:1.15,5:1.12})[cost]||1.1,u.star-1);
    u.mana=0;u.skillCd=3000;u.cd=Math.max(u.cd,850);u.casts++;
    emit('cast',{from:u.uid,skill:u.id,mode:k.mode});
    const healN=k.healN||1;
    if(['heal','support'].includes(k.mode)){
      const candidates=k.mode==='support'?team.filter(t=>t!==u):team;
      const targets=[...candidates].sort(byHp).slice(0,k.mode==='support'?candidates.length:healN);
      for(const t of targets){heal(u,t,power*k.heal);if(k.shield)shield(t,t.maxhp*k.shield,u.uid);if(k.mana){t.mana=clamp(t.mana+k.mana,0,t.maxmana);emit('mana',{from:u.uid,target:t.uid,amount:k.mana});}}
      if(k.haste)for(const t of team){t.haste=Math.max(t.haste,k.haste);t.hasteT=Math.max(t.hasteT,4000);}
    } else if(k.mode==='team'){
      for(const t of team){heal(u,t,power*k.heal);if(k.shield)shield(t,t.maxhp*k.shield,u.uid);if(k.attack){t.attackBuff=Math.max(t.attackBuff,k.attack);t.attackBuffT=Math.max(t.attackBuffT,4000);}if(k.haste){t.haste=Math.max(t.haste,k.haste);t.hasteT=Math.max(t.hasteT,4000);}}
      if(k.enemyHealDown)for(const t of enemies){t.healDown=Math.max(t.healDown,k.enemyHealDown);t.healDownT=Math.max(t.healDownT,4000);}
    } else if(k.mode==='teamShield'){
      for(const t of team)shield(t,t.maxhp*k.shield,u.uid);
      if(k.dr)for(const t of team){t.dr=Math.max(t.dr,k.dr);t.drT=Math.max(t.drT,4000);}
      if(k.taunt)u.taunt=Math.max(u.taunt,k.taunt);
    } else if(k.mode==='guard'||k.mode==='guardLink'){
      shield(u,u.maxhp*k.shield,u.uid);if(k.taunt)u.taunt=Math.max(u.taunt,k.taunt);
      if(k.block){u.block=Math.max(u.block,k.block);u.blockT=Math.max(u.blockT,4000);u.blockSlow=k.slow||0;}if(k.thorns)u.thorns=Math.max(u.thorns,k.thorns);
      if(k.mode==='guardLink'){const mate=team.filter(t=>t!==u).sort(byHp)[0];if(mate){shield(mate,mate.maxhp*k.allyShield,u.uid);mate.linkTarget=u.uid;mate.linkShare=k.link;}}
    } else {
      let targets=[];
      if(k.mode==='cleave'||k.mode==='burst'||k.mode==='field'||k.mode==='zone'){
        const radius=['field','zone'].includes(k.mode)?3:1;
        targets=sortDist(u,enemies).filter(t=>dist(u,t)<=radius);
      } else if(k.mode==='chain')targets=sortDist(u,enemies).slice(0,k.targets||3);
      else {const target=choose(u,enemies,k.target||'near');if(target)targets=[target];}
      const hits=k.hits||1;
      for(let i=0;i<targets.length;i++){
        const t=targets[i];if(t.hp<=0)continue;
        let raw=power*(k.mults?.[i]||k.mult||1.5);
        if(k.lowHPBoost)raw*=1+k.lowHPBoost*(1-u.hp/u.maxhp);
        for(let h=0;h<hits&&t.hp>0;h++){
          // Solo strips or steals shields before the hit lands (v3ApplyHit pre-damage check);
          // doing it after damage() would leave nothing to steal once the shield is consumed.
          if(k.stealShield&&t.shield>0){const stolen=t.shield;t.shield=0;shield(u,stolen);}
          if(k.shieldbreak&&t.shield>0){const stripped=t.shield;t.shield=0;t.noShield=Math.max(t.noShield,2500);emit('shieldBreak',{target:t.uid,by:u.uid,amount:stripped});}
          const dealt=damage(u,t,raw,k.dtype||u.dtype,'skill');
          applyHitEffects(u,t,k,t,power);
          if(k.lifesteal&&dealt)heal(u,u,dealt*k.lifesteal);
          if(k.splash){for(const near of sortDist(t,enemies.filter(x=>x!==t&&x.hp>0&&dist(x,t)<=1)).slice(0,2))damage(u,near,raw*k.splash,k.dtype||u.dtype,'skill');}
          if(k.season&&t.hp>0){const season=Math.floor(random()*4);if(season===0){t.slow=Math.max(t.slow,2000);t.slowPct=Math.max(t.slowPct||0,.25);}else if(season===1)t.mana=Math.max(0,t.mana-15);else if(season===2){t.poison=3000;t.poisonDmg=Math.round(t.maxhp*.02);}else t.freeze=Math.max(t.freeze,1000);}
        }
      }
    }
    if(k.cleanse)for(const t of team){t.stun=t.freeze=t.silence=t.slow=t.weaken=t.healDown=0;}
    if(u.singer){const n=team.filter(t=>t.singer).length,nearest=choose(u,enemies);if(nearest)damage(u,nearest,u.atk*((bonds[u.side==='A'?'A':'B']['歌势']>=2?1.6:.8)+.4*n),'magic','bond');}
    if(u.manaGift){const mate=team.filter(t=>t!==u).sort((x,y)=>x.mana/x.maxmana-y.mana/y.maxmana)[0];if(mate){mate.mana=clamp(mate.mana+u.manaGift,0,mate.maxmana);emit('mana',{from:u.uid,target:mate.uid,amount:u.manaGift,reason:'item-cast'});}}
    if(u.castShield){const mate=team.filter(t=>t!==u).sort(byHp)[0];shield(u,u.maxhp*u.castShield);if(mate)shield(mate,mate.maxhp*u.castShield);}
    if(u.teamCastShield)for(const t of team)shield(t,t.maxhp*u.teamCastShield,u.uid);
    if(u.castSunder){const t=choose(u,enemies);if(t)t.mrDown=Math.max(t.mrDown,u.castSunder);}
    if(u.manaBurnItem){const t=choose(u,enemies);if(t)t.mana=Math.max(0,t.mana-u.manaBurnItem);}
    if(u.nextAmp||u.nextSplash||u.nextBounce)u.nextAttackAmp=Math.max(u.nextAttackAmp||0,u.nextAmp),u.nextAttackSplash=u.nextSplash,u.nextAttackBounce=u.nextBounce,u.nextAmp=u.nextSplash=u.nextBounce=0;
    if(k.bounce)u.nextAttackBounce=.5;
    return true;
  }
  function onAttack(u,t,raw,critical) {
    u.attacks++;
    if(u.edgePips){const every=u.edgePips>=2?3:4;if(u.attacks%every===0)damage(u,t,raw*(u.edgePips>=2?.35:.25),'pure','item');}
    if(u.firstSnare){u.firstSnare=false;t.slow=Math.max(t.slow,1200);t.slowPct=Math.max(t.slowPct||0,.20);emit('slow',{from:u.uid,target:t.uid,source:'item'});}
    if(u.stormStun&&u.attacks%3===0&&t.hp>0)t.stun=Math.max(t.stun,450);
    if(u.poisonItem&&t.hp>0){t.poison=Math.max(t.poison,3000);t.poisonDmg=Math.max(t.poisonDmg||0,Math.round(t.maxhp*u.poisonItem));}
    if(u.bondSilence&&random()<u.bondSilence)t.silence=Math.max(t.silence,3000);
    if(t.petrifyChance&&u.melee&&random()<t.petrifyChance)u.stun=Math.max(u.stun,1500);
    if(u.passive==='soulmate'){
      heal(u,u,u.maxhp*.03);const mate=allies(u).filter(x=>x!==u).sort(byHp)[0];if(mate)heal(u,mate,mate.maxhp*.03);
    }
    if(u.passive==='shieldbreak'){
      if(t.shield>0){const stripped=t.shield;t.shield=0;u.shieldBreakReady=true;emit('shieldBreak',{target:t.uid,by:u.uid,amount:stripped});}
      else u.shieldBreakReady=true;
    }
    if(u.passive==='rainveil'&&u.attacks%2===0)u.rainStacks=Math.min(2,(u.rainStacks||0)+1);
    const enemies=foes(u), bounceChance=u.bounceChance||u.bounce;
    if(bounceChance&&random()<bounceChance){const other=sortDist(t,enemies.filter(x=>x!==t&&dist(x,t)<=2))[0];if(other)damage(u,other,raw*(u.bounceEcho||.5),u.dtype,'bounce');}
    if(u.critExpose&&critical&&t.hp>0)t.wound=Math.max(t.wound,u.critExpose),t.woundT=Math.max(t.woundT,2500);
    if(u.markShield&&t.hp>0){t.markShieldBy=u;}
    if(u.nextAttackSplash){const other=sortDist(t,enemies.filter(x=>x!==t&&dist(x,t)<=2))[0];if(other)damage(u,other,raw*u.nextAttackSplash,'magic','item');u.nextAttackSplash=0;}
    if(u.nextAttackBounce){const other=sortDist(t,enemies.filter(x=>x!==t&&dist(x,t)<=2))[0];if(other)damage(u,other,raw*u.nextAttackBounce,'magic','item');u.nextAttackBounce=0;}
  }
  for(const side of ['A','B'])if(bonds[side]['咒术']){
    const candidates=side==='A'?b:a,target=candidates.length?candidates[Math.floor(random()*candidates.length)]:null;
    if(target){target.hex=2500;target.stun=Math.max(target.stun,2500);emit('hex',{target:target.uid,duration:2500});}
  }
  for(let tick=0;tick<maxTicks;tick++) {
    at=tick*tickMs;
    if(!live(a).length||!live(b).length)break;
    for(const u of units) {
      if(u.hp<=0)continue;
      for(const key of ['cd','skillCd','stun','silence','slow','freeze','taunt','hasteT','attackBuffT','drT','blockT','poison','noShield','healDownT','arDownT','mrDownT','reflectT','woundT','weakenT'])if(u[key]>0)u[key]=Math.max(0,u[key]-tickMs);
      if(!u.hasteT)u.haste=0;if(!u.attackBuffT)u.attackBuff=0;if(!u.drT)u.dr=0;if(!u.blockT)u.block=0;
      if(!u.slow)u.slowPct=0;
      if(!u.healDownT)u.healDown=0;if(!u.arDownT)u.arDown=0;if(!u.mrDownT)u.mrDown=0;if(!u.reflectT)u.reflect=0;
      if(!u.weakenT)u.weaken=0;if(!u.woundT)u.wound=0;
      if(u.regen)heal(u,u,u.regen*tickMs/1000);
      if(u.manaPerSec)u.mana=clamp(u.mana+u.manaPerSec*tickMs/1000,0,u.maxmana);
      if(u.shieldTick&&tick>0&&at%3000===0)shield(u,u.maxhp*u.shieldTick);
      if(u.guardChance&&tick>0&&at%3000===0&&random()<u.guardChance)shield(u,u.maxhp*u.guardShield);
      if(u.medic&&tick>0&&at%5000===0){const group=allies(u),targets=[...group].sort(byHp).slice(0,bonds[u.side==='A'?'A':'B']['医者']>=2?2:1);for(const t of targets)heal(u,t,t.maxhp*(bonds[u.side==='A'?'A':'B']['医者']>=2?.06:.04));}
      if(u.poison>0&&at%1000===0){const dealt=Math.min(u.hp,u.poisonDmg||0);u.hp=Math.max(0,u.hp-dealt);emit('dot',{from:null,target:u.uid,amount:dealt});if(u.hp<=0)die(u,null);}
      if(u.hp<=0||u.stun>0||u.freeze>0)continue;
      const enemy=foes(u);if(!enemy.length)continue;
      if(castSkill(u))continue;
      const taunted=enemy.filter(v=>v.taunt>0),target=choose(u,taunted.length?taunted:enemy);
      if(dist(u,target)>u.range){if(tick%3===0){const step=nextStep(u,target,units);if(step){u.x=step.x;u.y=step.y;emit('move',{unit:u.uid,x:u.x,y:u.y});}}continue;}
      if(u.cd>0)continue;
      // Slowed units swing slower (solo: ATTACK_INTERVAL/aspd*(1+slowA) while slowed).
      u.cd=1450/Math.max(.1,u.speed*(1+u.haste))*(1+(u.slow>0?u.slowPct||.3:0));
      let raw=u.atk*(1+u.attackBuff)*(1-(u.weaken||0));
      if(u.nextAttackAmp){raw*=1+u.nextAttackAmp;u.nextAttackAmp=0;}
      if(u.passive==='shieldbreak'&&u.shieldBreakReady){raw*=1.8;u.shieldBreakReady=false;}
      const critical=u.crit>0&&random()<u.crit;
      if(critical)raw=Math.round(raw*u.critM);
      if(target.dodge>0&&random()<target.dodge){emit('dodge',{from:u.uid,target:target.uid});if(target.dodgeAmp)target.nextAttackAmp=Math.max(target.nextAttackAmp||0,target.dodgeAmp);continue;}
      if(target.passive==='rainveil'&&target.rainStacks>0){target.rainStacks--;target.rainSlowReady=true;shield(target,target.maxhp*.08);emit('dodge',{from:u.uid,target:target.uid,reason:'rainveil'});continue;}
      if(target.passive==='rainveil'&&random()<.25){raw=Math.ceil(raw*.5);emit('block',{from:u.uid,target:target.uid,reason:'rainveil'});}
      const amount=damage(u,target,raw,u.dtype,'attack');
      if(amount>0)u.mana=clamp(u.mana+(u.job==='法师'||u.job==='咒术'||u.job==='医者'?30:15)*u.manaRegen,0,u.maxmana);
      if(u.passive==='rainveil'&&u.rainSlowReady&&target.hp>0){target.slow=Math.max(target.slow,1200);target.slowPct=Math.max(target.slowPct||0,.20);u.rainSlowReady=false;}
      onAttack(u,target,raw,critical);
      if(u.passive==='soulmate'&&!u.soulmateShieldGiven&&allies(u).some(t=>t.hp/t.maxhp<=.2)){for(const mate of allies(u))shield(mate,mate.maxhp*.2,u.uid);u.soulmateShieldGiven=true;}
    }
  }
  const survivorsA=live(a).map(u=>({uid:u.uid,id:u.id,hp:Math.ceil(u.hp),maxhp:u.maxhp,x:u.x,y:u.y,shield:u.shield}));
  const survivorsB=live(b).map(u=>({uid:u.uid,id:u.id,hp:Math.ceil(u.hp),maxhp:u.maxhp,x:u.x,y:u.y,shield:u.shield}));
  const winner=survivorsA.length&&!survivorsB.length?'A':survivorsB.length&&!survivorsA.length?'B':'draw';
  return {winner,survivorsA,survivorsB,bonds,events,durationMs:at,complete:!survivorsA.length||!survivorsB.length};
}
