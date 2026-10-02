export const RULESET = 'idol-queue-v1';
import { OUTFITS } from './outfits.mjs';
const rows = [
 ['goutan','勾檀',1,2,3,'gift','退场：给后方最近友军 +2/+2。'],
 ['songlv','小松绿',1,2,2,'summon','退场：召唤一只 2/2 伴舞。'],
 ['yujiu','羽啾',1,2,3,'summonBuff','友军召唤：给其 +1 攻击，每战三次。'],
 ['agari','东爱璃',1,2,3,'sell','出售：额外获得 1 金。'],
 ['ein','艾因',2,3,5,'hurt','受伤且存活：获得 +2 攻击，每战两次。'],
 ['yua','悠亚',2,3,3,'snipe','开战：对最低生命敌人造成 3 点伤害。'],
 ['likou','莉蔻',2,2,4,'grow','回合结束：给另一个最低生命友军永久 +1/+1。'],
 ['kouichi','光一',2,3,4,'support','前方最近友军攻击：对随机敌人造成 2 点伤害，每战三次。'],
 ['kanban','栞栞',3,3,7,'armor','开战：获得 4 点护盾。'],
 ['pako','帕可',3,3,5,'heal','退场：给所有友军恢复 3 点生命。'],
 ['aza','AZA',3,5,4,'cleave','攻击：对敌方第二位造成 2 点伤害。'],
 ['suiji','岁己',3,4,4,'income','回合开始：额外获得 1 金。'],
 ['zhijin','枝堇',4,6,4,'snipe','开战：对最低生命敌人造成 3 点伤害。'],
 ['sumi','礼墨',4,4,8,'gift','退场：给后方最近友军 +2/+2。'],
 ['yukie','桃濑雪绘',4,5,5,'grow','回合结束：给另一个最低生命友军永久 +1/+1。'],
 ['zeyin','泽音',4,3,7,'summonBuff','友军召唤：给其 +1 攻击，每战三次。'],
 ['miyue','弥月',5,7,6,'hurt','受伤且存活：获得 +2 攻击，每战两次。'],
 ['huali','花礼',5,4,8,'allGrow','回合结束：给另外两位友军永久 +1/+1。'],
 ['quanrong','犬绒',5,6,9,'armor','开战：获得 4 点护盾。'],
 ['ruiya','瑞娅',5,7,5,'support','前方最近友军攻击：对随机敌人造成 2 点伤害，每战三次。'],
 ['mahiru','真绯瑠',6,9,8,'summon','退场：召唤一只 2/2 伴舞。'],
 ['nana7mi','七海',6,8,9,'cleave','攻击：对敌方第二位造成 2 点伤害。'],
 ['miki','弥希',6,6,10,'allGrow','回合结束：给另外两位友军永久 +1/+1。'],
 ['rei','病院坂灵',6,7,9,'heal','退场：给所有友军恢复 3 点生命。'],
 ['hoshimi','希侑',1,3,2,'buyBuff','招募：给另一个随机友军永久 +1 攻击。'],
 ['chiharu','初濑',1,2,3,'sellBuff','出售：给另一个随机友军永久 +1/+1。'],
 ['zhouyi','轴伊',1,2,3,'rollIncome','刷新商店：返还 1 金，每回合一次。'],
 ['yuji','雨纪',1,2,3,'foodGrow','自己获得道具：永久 +1 生命。'],
 ['tiandou','恬豆',2,2,4,'buyBuff','招募：给另一个随机友军永久 +1 攻击。'],
 ['sishi','四时小路',2,4,3,'selfGrow','回合结束：自己永久 +1/+1。'],
 ['miting','米汀',2,3,4,'levelGift','升级：给另外两位随机友军永久 +1/+1。'],
 ['xuezhu','雪烛',2,3,3,'backSnipe','开战：对最后方敌人造成 2 点伤害。'],
 ['sanli','三理',3,4,4,'splashGift','退场：给所有友军 +1 攻击。'],
 ['diansu','点酥',3,4,4,'retaliate','受伤且存活：对前排敌人造成 1 点伤害，每战三次。'],
 ['lianshiye','恋诗夜',3,3,6,'foodGrow','自己获得道具：永久 +1 生命。'],
 ['huize','灰泽满',3,5,3,'backSnipe','开战：对最后方敌人造成 2 点伤害。'],
 ['shengge','笙歌',3,3,6,'levelGift','升级：给另外两位随机友军永久 +1/+1。'],
 ['shadow','李豆沙',3,4,5,'selfGrow','回合结束：自己永久 +1/+1。'],
 ['nox','诺莺',4,5,5,'doubleSummon','退场：召唤两位 1/1 伴舞。'],
 ['youyu','柚雨',4,5,6,'backSnipe','开战：对最后方敌人造成 2 点伤害。'],
 ['mumu','沐霂',4,4,6,'splashGift','退场：给所有友军 +1 攻击。'],
 ['kroya','克罗雅',4,5,5,'teamShield','开战：给另外两位友军 2 点护盾。'],
 ['shiliu','十六萤',4,6,4,'retaliate','受伤且存活：对前排敌人造成 1 点伤害，每战三次。'],
 ['seki','星汐',5,5,8,'teamShield','开战：给另外两位友军 2 点护盾。'],
 ['haruka','白神遥',5,6,7,'selfGrow','回合结束：自己永久 +1/+1。'],
 ['liAn','梨安',5,5,7,'doubleSummon','退场：召唤两位 1/1 伴舞。'],
 ['youyi','又一',5,7,5,'buyBuff','招募：给另一个随机友军永久 +1 攻击。'],
 ['azi','阿梓',6,7,8,'allGrow','回合结束：给另外两位友军永久 +1/+1。'],
 ['taodai','桃代',6,6,10,'teamShield','开战：给另外两位友军 2 点护盾。'],
 ['rinco','秋凛子',6,7,8,'splashGift','退场：给所有友军 +1 攻击。'],
];
export const BASE_ROSTER = rows.map(([id,name,tier,atk,hp,kind,ability])=>({id,name,tier,atk,hp,kind,ability,baseId:id,outfit:'原版',portrait:`assets/units_big/${id}.webp`}));
export const ROSTER = [...BASE_ROSTER,...OUTFITS];
export const FOODS = [
 {id:'snack',name:'应援曲奇',icon:'🍪',tier:1,description:'永久 +1 攻击、+1 生命。'},
 {id:'honey',name:'伴舞徽章',icon:'🐝',tier:1,description:'携带：退场召唤一只 1/1 小蜜蜂。'},
 {id:'protein',name:'能量便当',icon:'🍱',tier:2,description:'永久 +2 攻击。'},
 {id:'milk',name:'热牛奶',icon:'🥛',tier:2,description:'永久 +3 生命。'},
 {id:'garlic',name:'守护耳返',icon:'🎧',tier:3,description:'携带：每次受到伤害减少 2，至少受到 1 点。'},
 {id:'salad',name:'双人茶点',icon:'🥗',tier:3,description:'随机两位友军永久 +1/+1。'},
 {id:'melon',name:'舞台护盾',icon:'🛡️',tier:4,description:'携带：每战获得 8 点护盾。'},
 {id:'chocolate',name:'进修巧克力',icon:'🍫',tier:5,description:'获得 1 点经验，可提升技能等级。'},
 {id:'steak',name:'聚光灯',icon:'💡',tier:5,description:'携带：第一次普通攻击额外造成 8 点伤害。'},
 {id:'feast',name:'庆功盛宴',icon:'🎂',tier:6,description:'永久 +3 攻击、+3 生命。'},
];
const byId = Object.fromEntries(ROSTER.map(x=>[x.id,x]));
const foodById = Object.fromEntries(FOODS.map(x=>[x.id,x]));
export const unitInfo = id=>byId[id];
export const foodInfo = id=>foodById[id];
export const tierFor = round=>Math.min(6,Math.ceil(round/2));
const clone=x=>structuredClone(x);
const assert=(yes,message)=>{if(!yes)throw new Error(message);};
const cap=x=>Math.min(50,Math.max(1,x));
function hash(s){let n=2166136261;for(const c of String(s)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0||1;}
function rand(s){let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0||1;return s.rng/4294967296;}
const choose=(s,a)=>a[Math.floor(rand(s)*a.length)];
function makeUnit(s,id){const d=byId[id];return {uid:`u${s.nextUid++}`,id,atk:d.atk,hp:d.hp,xp:0,level:1,perk:null};}
function roll(s){const tier=tierFor(s.round),pool=ROSTER.filter(x=>x.tier<=tier),fp=FOODS.filter(x=>x.tier<=tier);s.shop=s.shop.map(x=>x?.frozen?x:{id:choose(s,pool).id,frozen:false});s.foods=s.foods.map(x=>x?.frozen?x:{id:choose(s,fp).id,frozen:false});}
export function createRun(seed=Date.now()){const s={ruleset:RULESET,round:1,gold:10,lives:5,wins:0,team:Array(5).fill(null),shop:Array(5).fill(null),foods:Array(2).fill(null),status:'prep',rng:hash(seed),nextUid:1,revision:0,preparedRound:0,bonusOffer:null};roll(s);return s;}
const slot=(n,length)=>assert(Number.isInteger(n)&&n>=0&&n<length,'位置无效');
function gainXp(s,u,n){assert(u.xp<5,'这位角色已经达到三级');const old=u.level;u.xp=Math.min(5,u.xp+n);u.level=u.xp>=5?3:u.xp>=2?2:1;if(u.level>old){if(byId[u.id].kind==='levelGift'){const mates=s.team.filter(x=>x&&x!==u);for(let i=0;i<2&&mates.length;i++){const v=mates.splice(Math.floor(rand(s)*mates.length),1)[0];v.atk=cap(v.atk+old);v.hp=cap(v.hp+old);}}const tier=Math.min(6,tierFor(s.round)+1);s.bonusOffer=Array.from({length:2},()=>({id:choose(s,ROSTER.filter(x=>x.tier===tier)).id}));}}
function combine(s,target,source){assert(target.id===source.id,'只有同名角色可以合并');assert(target.xp<5,'这位角色已经达到三级');target.atk=cap(Math.max(target.atk,source.atk)+1);target.hp=cap(Math.max(target.hp,source.hp)+1);gainXp(s,target,source.xp+1);}
export function act(s,a){assert(s.status==='prep','这局已结束，请开始新一局');assert(s.preparedRound!==s.round,'阵容已提交，不能继续操作');assert(a&&typeof a.type==='string','操作无效');
 if(a.type==='buy'){slot(a.slot,5);slot(a.to,5);const offer=s.shop[a.slot];assert(offer,'这个位置没有角色');assert(s.gold>=3,'金币不足，需要 3 金');const dest=s.team[a.to];if(dest){assert(dest.id===offer.id,'先选择空位，或选择同名角色进行合并');assert(dest.xp<5,'这位角色已经达到三级');}const u=makeUnit(s,offer.id);if(dest)combine(s,dest,u);else{s.team[a.to]=u;if(byId[u.id].kind==='buyBuff'){const mates=s.team.filter(v=>v&&v!==u);if(mates.length){const v=choose(s,mates);v.atk=cap(v.atk+u.level);}}}s.shop[a.slot]=null;s.gold-=3;}
 else if(a.type==='move'||a.type==='merge'){slot(a.from,5);slot(a.to,5);assert(a.from!==a.to,'请选择另一个位置');const u=s.team[a.from];assert(u,'这个位置没有角色');if(a.type==='merge'){assert(s.team[a.to],'合并目标不存在');combine(s,s.team[a.to],u);s.team[a.from]=null;}else{s.team.splice(a.from,1);s.team.splice(a.to,0,u);}}
 else if(a.type==='sell'){slot(a.slot,5);const u=s.team[a.slot];assert(u,'这个位置没有角色');s.gold+=u.level+(byId[u.id].kind==='sell'?u.level:0);s.team[a.slot]=null;if(byId[u.id].kind==='sellBuff'){const mates=s.team.filter(Boolean);if(mates.length){const v=choose(s,mates);v.atk=cap(v.atk+u.level);v.hp=cap(v.hp+u.level);}}}
 else if(a.type==='roll'){assert(s.gold>=1,'金币不足，需要 1 金');s.gold--;roll(s);for(const u of s.team.filter(Boolean))if(byId[u.id].kind==='rollIncome'&&u.rollIncomeRound!==s.round){u.rollIncomeRound=s.round;s.gold+=u.level;}}
 else if(a.type==='freeze'){assert(a.zone==='shop'||a.zone==='foods','商品区域无效');slot(a.slot,s[a.zone].length);assert(s[a.zone][a.slot],'没有可以冻结的商品');s[a.zone][a.slot].frozen=!s[a.zone][a.slot].frozen;}
 else if(a.type==='food'){slot(a.slot,2);slot(a.to,5);const o=s.foods[a.slot],u=s.team[a.to];assert(o,'这个位置没有道具');assert(u,'请先选择一位队员');assert(s.gold>=3,'金币不足，需要 3 金');const id=o.id;if(id==='chocolate')gainXp(s,u,1);else if(['honey','garlic','melon','steak'].includes(id))u.perk=id;else if(id==='salad'){const p=s.team.filter(Boolean);for(let i=0;i<2&&p.length;i++){const at=Math.floor(rand(s)*p.length),v=p.splice(at,1)[0];v.atk=cap(v.atk+1);v.hp=cap(v.hp+1);}}else{const [atk,hp]=id==='snack'?[1,1]:id==='protein'?[2,0]:id==='milk'?[0,3]:[3,3];u.atk=cap(u.atk+atk);u.hp=cap(u.hp+hp);}if(byId[u.id].kind==='foodGrow')u.hp=cap(u.hp+u.level);s.foods[a.slot]=null;s.gold-=3;}
 else if(a.type==='bonus'){slot(a.slot,2);assert(s.bonusOffer,'没有升级奖励');const at=s.shop.findIndex(x=>!x?.frozen);assert(at>=0,'先解冻一个商店位置');s.shop[at]={id:s.bonusOffer[a.slot].id,frozen:false};s.bonusOffer=null;}
 else throw new Error('不支持的操作');return s;
}
export function prepareTeam(s){
 assert(s.status==='prep','这局已经结束');assert(s.team.some(Boolean),'至少招募一位角色才能出战');
 if(s.preparedRound!==s.round){
  s.preparationEvents=[{type:'roundEndStart',text:'回合结束，结算队员的成长技能',actors:[],a:clone(s.team)}];
  for(const u of s.team.filter(Boolean)){
   const kind=byId[u.id].kind;let targets=[];
   if(kind==='selfGrow')targets=[u];
   if(kind==='grow'||kind==='allGrow')targets=s.team.filter(v=>v&&v!==u).sort((a,b)=>a.hp-b.hp).slice(0,kind==='grow'?1:2);
   const affected=[];for(const v of targets){const atk=v.atk,hp=v.hp;v.atk=cap(v.atk+u.level);v.hp=cap(v.hp+u.level);if(v.atk!==atk||v.hp!==hp)affected.push(`${byId[v.id].name} +${v.atk-atk}/+${v.hp-hp}`);}
   if(affected.length)s.preparationEvents.push({type:'roundEnd',text:`${byId[u.id].name} 回合结束成长：${affected.join('，')}`,actors:[{side:'a',uid:u.uid}],a:clone(s.team)});
  }
  s.preparedRound=s.round;
 }
 return clone(s.team);
}
export function finishRound(s,result){
 assert(s.preparedRound===s.round,'这回合尚未提交阵容');assert(['a','b','draw'].includes(result.winner),'战果无效');
 s.roundStartEvents=[];
 if(result.winner==='a')s.wins++;else if(result.winner==='b')s.lives--;
 if(s.wins>=10)s.status='won';else if(s.lives<=0)s.status='lost';else{
  s.round++;if(s.round===3&&s.lives<5){s.lives++;s.roundStartEvents.push({text:'第三回合恢复 1 生命',uids:[],lives:1});}
  s.gold=10;s.roundStartEvents.push({text:`第 ${s.round} 回合开始：领取 10 金币`,uids:[],gold:10});
  for(const u of s.team.filter(Boolean))if(byId[u.id].kind==='income'){s.gold+=u.level;s.roundStartEvents.push({text:`${byId[u.id].name} 回合开始：额外 +${u.level} 金币`,uids:[u.uid],gold:u.level});}
  roll(s);
 }
 return s;
}
export function addPreparationEvents(replay,s){
 const enemy=replay.events[0].b;
 replay.events.unshift(...(s.preparationEvents||[]).map(e=>({...clone(e),a:e.a.filter(Boolean).map(u=>({...u,maxhp:u.hp,shield:0})).concat(Array(5-e.a.filter(Boolean).length).fill(null)),b:clone(enemy)})));
 return replay;
}

export function trainingTeam(round,seed='training'){const s={rng:hash(seed),nextUid:1},tier=tierFor(round),pool=ROSTER.filter(x=>x.tier<=tier),count=Math.min(5,2+Math.floor(round/2));return Array.from({length:5},(_,i)=>{if(i>=count)return null;const u=makeUnit(s,choose(s,pool).id);const growth=Math.max(0,round-3);u.atk=cap(u.atk+Math.floor(growth*.8));u.hp=cap(u.hp+growth);u.xp=round>10?2:0;u.level=round>10?2:1;return u;});}
export function battle(teamA,teamB,seed='battle'){
 const state={rng:hash(seed)},teams={a:clone(teamA.filter(Boolean)),b:clone(teamB.filter(Boolean))},events=[],effects=[];let steps=0,serial=0;
 for(const u of [...teams.a,...teams.b]){u.maxhp=u.hp;u.shield=u.perk==='melon'?8:0;u.triggers=0;u.first=true;}
 const snap=side=>clone([...teams[side],...Array(Math.max(0,5-teams[side].length)).fill(null)]);
 const ref=(side,u)=>({side,uid:u.uid});
 const emit=(type,text,actors=[])=>{assert(events.length<500,'技能连锁超过安全上限');events.push({type,text,actors,a:snap('a'),b:snap('b')});};
 const name=u=>byId[u.id]?.name||(u.id==='bee'?'小蜜蜂':'伴舞');
 const other=side=>side==='a'?'b':'a';
 const damage=(u,amount)=>{if(!u||u.hp<=0)return;let n=amount;if(u.perk==='garlic')n=Math.max(1,n-2);const absorb=Math.min(n,u.shield);u.shield-=absorb;n-=absorb;u.hp-=n;if(n>0&&u.hp>0&&byId[u.id]?.kind==='hurt'&&u.triggers<2){u.triggers++;u.atk=cap(u.atk+2*u.level);}if(n>0&&u.hp>0&&byId[u.id]?.kind==='retaliate'&&u.triggers<3){u.triggers++;effects.push(u);}};
 const drainEffects=()=>{let count=0;while(effects.length){assert(++count<40,'反击技能形成无限连锁');const u=effects.shift();if(u.hp<=0)continue;const side=teams.a.includes(u)?'a':'b',victim=teams[other(side)].find(v=>v.hp>0);if(victim){damage(victim,u.level);emit('retaliate',`${name(u)} 反击 ${name(victim)}`,[ref(side,u)]);}}};
 const summon=(side,at,atk,hp,id='dancer')=>{const t=teams[side];if(t.length>=5)return;const u={uid:`summon${serial++}`,id,atk,hp,maxhp:hp,xp:0,level:1,perk:null,shield:0,triggers:0,first:true};t.splice(Math.min(at,t.length),0,u);for(const ally of t){if(byId[ally.id]?.kind==='summonBuff'&&ally.hp>0&&ally.triggers<3){ally.triggers++;u.atk=cap(u.atk+ally.level);}}emit('summon',`${name(u)} 登场！`);};
 const deaths=()=>{let loops=0;while([...teams.a,...teams.b].some(u=>u.hp<=0)){assert(++loops<40,'退场技能形成无限连锁');const fallen=[];for(const side of ['a','b'])for(const u of [...teams[side]])if(u.hp<=0)fallen.push({side,u,at:teams[side].indexOf(u),next:teams[side].slice(teams[side].indexOf(u)+1).find(v=>v.hp>0)});for(const {side,u} of fallen)teams[side]=teams[side].filter(v=>v!==u);emit('faint',fallen.map(({u})=>`${name(u)} 退场`).join(' · '));for(const {side,u,at,next} of fallen){const kind=byId[u.id]?.kind;if(kind==='gift'&&next&&teams[side].includes(next)){next.atk=cap(next.atk+2*u.level);next.hp=cap(next.hp+2*u.level);next.maxhp=Math.max(next.maxhp,next.hp);emit('buff',`${name(u)} 留下援护 +${2*u.level}/+${2*u.level}`,[ref(side,u)]);}if(kind==='splashGift'){for(const v of teams[side])v.atk=cap(v.atk+u.level);emit('buff',`${name(u)} 给全队 +${u.level} 攻击`,[ref(side,u)]);}if(kind==='heal'){for(const v of teams[side])v.hp=Math.min(v.maxhp,v.hp+3*u.level);emit('heal',`${name(u)} 恢复全队生命`,[ref(side,u)]);}if(kind==='summon')summon(side,at,2*u.level,2*u.level);if(kind==='doubleSummon'){summon(side,at,u.level,u.level);summon(side,at+1,u.level,u.level);}if(u.perk==='honey')summon(side,at,1,1,'bee');}}};
 emit('start','双方队伍登场');
 const openers=['a','b'].flatMap(side=>teams[side].map(u=>({side,u}))).sort((a,b)=>b.u.atk-a.u.atk||String(a.u.uid).localeCompare(String(b.u.uid))||a.side.localeCompare(b.side));
 for(const {side,u} of openers){if(u.hp<=0||!teams[side].includes(u))continue;const kind=byId[u.id]?.kind;if(kind==='armor'){u.shield+=4*u.level;emit('shield',`${name(u)} 获得 ${4*u.level} 点护盾`,[ref(side,u)]);}if(kind==='teamShield'){for(const v of teams[side].filter(v=>v!==u&&v.hp>0).slice(0,2))v.shield+=2*u.level;emit('shield',`${name(u)} 为两位队友架起护盾`,[ref(side,u)]);}if(kind==='snipe'||kind==='backSnipe'){const enemies=teams[other(side)].filter(v=>v.hp>0);const victim=kind==='snipe'?enemies.sort((a,b)=>a.hp-b.hp)[0]:enemies.at(-1);if(victim){damage(victim,(kind==='snipe'?3:2)*u.level);emit('snipe',`${name(u)} 开场狙击 ${name(victim)}`,[ref(side,u)]);drainEffects();deaths();}}}
 while(teams.a.length&&teams.b.length){assert(++steps<150,'战斗超过安全上限');const a=teams.a[0],b=teams.b[0],atkA=a.atk+(a.first&&a.perk==='steak'?8:0),atkB=b.atk+(b.first&&b.perk==='steak'?8:0);a.first=b.first=false;damage(b,atkA);damage(a,atkB);emit('attack',`${name(a)} 与 ${name(b)} 互攻 ${atkA} / ${atkB}`,[ref('a',a),ref('b',b)]);
  for(const [side,attacker] of [['a',a],['b',b]]){const enemy=teams[other(side)],kind=byId[attacker.id]?.kind;if(kind==='cleave'&&enemy[1]){damage(enemy[1],2*attacker.level);emit('cleave',`${name(attacker)} 波及后排`,[ref(side,attacker)]);}const rear=teams[side][1];if(rear&&rear.hp>0&&byId[rear.id]?.kind==='support'&&rear.triggers<3){const victims=enemy.filter(u=>u.hp>0);if(victims.length){rear.triggers++;damage(choose(state,victims),2*rear.level);emit('support',`${name(rear)} 发动后排支援`,[ref(side,rear)]);}}}
  drainEffects();deaths();
 }
 const winner=teams.a.length?'a':teams.b.length?'b':'draw';emit('end',winner==='a'?'你的队伍获胜！':winner==='b'?'对手获胜，下回合再来':'双方平局');return {winner,events,seed,ruleset:RULESET};
}
