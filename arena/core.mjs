export const RULESET = 'idol-original50-v2';
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
 ['suiji','岁己',1,2,3,'foodGrow','自己获得道具：永久 +1 生命。'],
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
 ['yuji','雨纪',3,4,4,'income','回合开始：额外获得 1 金。'],
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
const originalRows = rows.map(([id,name,tier,atk,hp,kind,ability])=>({id,name,tier,atk,hp,kind,ability,baseId:id,outfit:'原版',portrait:`assets/units_big/${id}.webp`}));
// Skill numbers below are level-one values unless a level progression is stated.
export const SPECIAL_SKILLS = {
 rearGrow:{title:'接力应援',ability:'前方最近友军普攻后：自己 +2/+2，每战 5 次。',hint:'放在高生命前排后方，承接多次攻击。'},
 hurtGift:{title:'逆境传递',ability:'受伤且存活：后方最近友军 +1/+2，每战 4 次。',hint:'前方搭配震场节拍，后方搭配接力应援。'},
 friendlyHit:{title:'震场节拍',ability:'自己普攻后：对后方最近友军造成 1 点伤害（各等级固定），每战 5 次。',hint:'用小额伤害主动触发逆境传递、受伤成长和反击。'},
 knockout:{title:'破阵追击',ability:'击败敌人且自己存活：对当前首位存活敌人造成 4 点伤害，可连续追击，每战 5 次。',hint:'提高攻击先击败前排，再清理残血队伍。'},
 faintGrow:{title:'谢幕接棒',ability:'其他友军退场：自己 +2/+1，每战 6 次。',hint:'放在后排，搭配多次召唤和伴舞徽章。'},
 faintShield:{title:'守护誓约',ability:'前方最近友军退场：自己 +2 攻击并获得 4 点护盾，每战 4 次。',hint:'放在召唤棋子后面，用护盾承接下一轮交锋。'},
 inheritSummon:{title:'星火继承',ability:'退场：召唤 1/2/3 位星火伴舞，各继承自己 50% 攻击（向上取整）、1 生命。',hint:'搭配聚光传递提高继承攻击，再搭配舞团编排。'},
 summonTrain:{title:'舞团编排',ability:'友军被召唤：给其 +2/+2，每战 6 次。',hint:'放在后排，搭配星火继承或双重召唤。'},
 weakening:{title:'聚光压制',ability:'开战：将最高生命敌人的当前生命削减 25%/50%/75%（向上取整，至少剩 1）；不触发受伤技能。',hint:'克制高生命前排，搭配开场狙击收割。'},
 relayAttack:{title:'聚光传递',ability:'开战：给前方最近友军增加自身攻击的 50%/100%/150%（向上取整）。',hint:'放在星火继承或破阵追击后方。'},
 copy:{title:'镜像合演',ability:'开战前：复制前方最近友军的战斗技能，以自己的技能等级释放；不复制镜像合演、商店或回合技能。',hint:'复制召唤、舞团编排、聚光压制，变化取决于站位。'},
};
const originalSkills={tiandou:'rearGrow',xuezhu:'hurtGift',shadow:'friendlyHit',quanrong:'knockout',miyue:'faintGrow',kanban:'faintShield',mahiru:'inheritSummon',zeyin:'summonTrain',youyu:'weakening',youyi:'relayAttack',rinco:'copy'};
Object.assign(SPECIAL_SKILLS,{
 lastWord:{title:'谢幕震波',ability:'退场：对首位存活敌人造成自身攻击 50%/100%/150% 的伤害（向上取整）。',hint:'培养攻击，让退场也能收割敌方前排。'},
 volley:{title:'双重聚光',ability:'开战：对两位不同随机敌人各造成 2 点伤害。',hint:'配合聚光压制，同时削弱多位敌人。'},
 mentor:{title:'领舞特训',ability:'回合结束：前方最近友军永久 +1 攻击、+2 生命。',hint:'放在主力后方，稳定培养指定棋子。'},
 sniperSupport:{title:'精准伴奏',ability:'前方最近友军普攻后：对攻击最高的敌人造成自身攻击 25%/50%/75% 的伤害，每战 3 次。',hint:'提升自身攻击，放在耐打的前排后方。'},
 revive:{title:'返场演出',ability:'退场：以原攻击和 2/4/6 生命返场一次，清除携带道具；返场仍能获得召唤增益。',hint:'搭配舞团编排和谢幕接棒，返场只限一次。'},
 attackSnipe:{title:'剑舞破后',ability:'自己普攻后：对最后方存活敌人造成 3 点伤害，每战 3 次。',hint:'针对后排召唤辅助，保护自己以多次释放。'},
 levelGrow:{title:'资深合唱',ability:'回合结束：所有其他二级或三级友军永久 +1/+1。',hint:'优先升级队友，再让整队共同成长。'},
 tripleZap:{title:'三重星轨',ability:'开战：对三位不同随机敌人造成自身攻击 20%/40%/60% 的伤害（向上取整）。',hint:'培养攻击，对付多单位阵容。'},
 foodShare:{title:'茶会同享',ability:'任意友军使用道具：自己永久 +1/+1，每次购买道具触发一次。',hint:'培养队友的同时让自己成长，装备和进修也触发。'},
 leaderGrow:{title:'王牌共鸣',ability:'回合结束：队伍中有其他三级友军时，自己永久 +2/+2。',hint:'与容易升级的低阶队友组成成长队。'},
 teamLevel:{title:'晋级庆典',ability:'其他友军升级：自己永久 +2/+2，每次升级触发一次。',hint:'反复合并或使用进修巧克力培养队友。'},
 allyBuy:{title:'新人欢迎会',ability:'招募其他一阶友军（不含直接合并购买）：给另外两位最低生命友军永久 +1 生命。',hint:'买卖一阶棋子可以培养主力；自己获得的收益来自其他棋子。'},
 hurtShield:{title:'应急结界',ability:'受伤且存活：获得 3 点护盾，每战 3 次。',hint:'搭配震场节拍主动触发，护盾完全吸收时不重复触发。'},
 summonEcho:{title:'谢幕接援',ability:'其他友军退场：在其位置召唤一位 2/2 伴舞，每战 2 次。',hint:'放在后排，搭配召唤增益；自己退场不触发。'},
 shieldBreak:{title:'破盾觉醒',ability:'开战：获得 6 点护盾；护盾被伤害打破：自己 +3 攻击，每战 2 次。',hint:'先承伤再提高攻击；友军护盾可以再次触发觉醒。'},
 revengeSnipe:{title:'离场追光',ability:'其他友军退场：对最高攻击敌人造成 2 点伤害，每战 3 次。',hint:'让召唤单位在前排退场，打击对方主力。'},
});
Object.assign(originalSkills,{sumi:'lastWord',zhijin:'volley',yukie:'mentor',ruiya:'sniperSupport',rei:'revive',nana7mi:'attackSnipe',miki:'levelGrow',azi:'tripleZap',lianshiye:'foodShare',haruka:'leaderGrow',shengge:'teamLevel',mumu:'allyBuy',shiliu:'hurtShield',liAn:'summonEcho',seki:'shieldBreak',taodai:'revengeSnipe'});
const basicTitles={gift:'谢幕馈赠',summon:'伴舞登台',summonBuff:'入场应援',sell:'特别酬劳',hurt:'逆境突破',snipe:'弱点聚光',grow:'温柔照拂',support:'后排伴奏',heal:'治愈谢幕',cleave:'横扫舞台',income:'开场红包',allGrow:'双人特训',buyBuff:'初次见面',sellBuff:'临别礼物',rollIncome:'商店灵感',foodGrow:'独享茶点',selfGrow:'自主练习',levelGift:'晋级馈赠',splashGift:'全队谢礼',retaliate:'受伤反击',backSnipe:'后排点名',doubleSummon:'双重登台',teamShield:'团队耳返'};
const basicHints={gift:'放在主力前面，退场后把属性传给下一位。',summon:'搭配羽啾、泽音或退场观察技能。',summonBuff:'放在召唤棋子后方，强化新登场的伴舞。',sell:'临时补位，出售回收金币。',hurt:'培养生命或搭配震场节拍，多次触发成长。',snipe:'搭配聚光压制，开场清理残血敌人。',grow:'培养队伍中的低生命主力。',support:'放在耐打前排后方，多次支援。',heal:'放在受伤队友前方，退场时恢复全队。',cleave:'打击前排与第二位敌人，克制密集队伍。',income:'留在队伍中，每回合增加培养资源。',allGrow:'同时培养两位友军，适合双主力。',buyBuff:'招募时为队友提供永久攻击。',sellBuff:'低阶买卖流，把属性留给主力。',rollIncome:'每回合第一次刷新有收益，升级能提高返还。',foodGrow:'集中给自己使用道具，额外提高生命。',selfGrow:'长期保留并升级，逐回合培养自己。',levelGift:'用合并或进修升级，为队友提供属性。',splashGift:'放在队伍前方，退场后提高全队攻击。',retaliate:'搭配震场节拍，主动触发小额伤害反击。',backSnipe:'开场点名后排辅助，配合剑舞破后。',doubleSummon:'搭配召唤增益、退场成长和退场接援。',teamShield:'保护友军，也可让破盾觉醒再次触发。'};
export const BASE_ROSTER=originalRows.map(d=>{
 const kind=originalSkills[d.id]||d.kind;
 return {...d,kind,title:basicTitles[kind],hint:basicHints[kind],...(SPECIAL_SKILLS[kind]||{})};
});
export const ROSTER = BASE_ROSTER;
// Retired costume ids are migrated by identity. Their artwork stays archived.
export function migrateRun(input){
 const s=structuredClone(input);if(s.ruleset===RULESET)return s;
 if(s.ruleset!=='idol-queue-v1')throw new Error('存档版本不兼容');
 const migrate=u=>{if(!u)return u;const id=u.id.split('__costume')[0];if(!ROSTER.some(d=>d.id===id))throw new Error('存档包含未知棋子');return {...u,id};};
 s.team=s.team.map(migrate);s.shop=s.shop.map(migrate);if(s.bonusOffer)s.bonusOffer=s.bonusOffer.map(migrate);
 s.ruleset=RULESET;delete s.preparationEvents;delete s.roundStartEvents;return s;
}
export function migrateResult(value){
 const result=structuredClone(value);if(!result?.run)return result;
 const legacy=result.run.ruleset!==RULESET;result.run=migrateRun(result.run);
 if(legacy||result.battle&&result.battle.ruleset!==RULESET){result.battle=null;delete result.opponent;}
 return result;
}
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
function gainXp(s,u,n){assert(u.xp<5,'这位角色已经达到三级');const old=u.level;u.xp=Math.min(5,u.xp+n);u.level=u.xp>=5?3:u.xp>=2?2:1;if(u.level>old){for(const watcher of s.team.filter(v=>v&&v!==u&&byId[v.id].kind==='teamLevel')){watcher.atk=cap(watcher.atk+2*watcher.level);watcher.hp=cap(watcher.hp+2*watcher.level);}if(byId[u.id].kind==='levelGift'){const mates=s.team.filter(x=>x&&x!==u);for(let i=0;i<2&&mates.length;i++){const v=mates.splice(Math.floor(rand(s)*mates.length),1)[0];v.atk=cap(v.atk+u.level);v.hp=cap(v.hp+u.level);}}const tier=Math.min(6,tierFor(s.round)+1);s.bonusOffer=Array.from({length:2},()=>({id:choose(s,ROSTER.filter(x=>x.tier===tier)).id}));}}
function combine(s,target,source){assert(target.id===source.id,'只有同名角色可以合并');assert(target.xp<5,'这位角色已经达到三级');target.atk=cap(Math.max(target.atk,source.atk)+1);target.hp=cap(Math.max(target.hp,source.hp)+1);gainXp(s,target,source.xp+1);}
export function act(s,a){assert(s.status==='prep','这局已结束，请开始新一局');assert(s.preparedRound!==s.round,'阵容已提交，不能继续操作');assert(a&&typeof a.type==='string','操作无效');
 if(a.type==='buy'){slot(a.slot,5);slot(a.to,5);const offer=s.shop[a.slot];assert(offer,'这个位置没有角色');assert(s.gold>=3,'金币不足，需要 3 金');const dest=s.team[a.to];if(dest){assert(dest.id===offer.id,'先选择空位，或选择同名角色进行合并');assert(dest.xp<5,'这位角色已经达到三级');}const u=makeUnit(s,offer.id);if(dest)combine(s,dest,u);else{s.team[a.to]=u;if(byId[u.id].kind==='buyBuff'){const mates=s.team.filter(v=>v&&v!==u);if(mates.length){const v=choose(s,mates);v.atk=cap(v.atk+u.level);}}}if(!dest&&byId[u.id].tier===1)for(const watcher of s.team.filter(v=>v&&v!==u&&byId[v.id].kind==='allyBuy'))for(const v of s.team.filter(v=>v&&v!==watcher).sort((a,b)=>a.hp-b.hp).slice(0,2))v.hp=cap(v.hp+watcher.level);s.shop[a.slot]=null;s.gold-=3;}
 else if(a.type==='move'||a.type==='merge'){slot(a.from,5);slot(a.to,5);assert(a.from!==a.to,'请选择另一个位置');const u=s.team[a.from];assert(u,'这个位置没有角色');if(a.type==='merge'){assert(s.team[a.to],'合并目标不存在');combine(s,s.team[a.to],u);s.team[a.from]=null;}else{s.team.splice(a.from,1);s.team.splice(a.to,0,u);}}
 else if(a.type==='sell'){slot(a.slot,5);const u=s.team[a.slot];assert(u,'这个位置没有角色');s.gold+=u.level+(byId[u.id].kind==='sell'?u.level:0);s.team[a.slot]=null;if(byId[u.id].kind==='sellBuff'){const mates=s.team.filter(Boolean);if(mates.length){const v=choose(s,mates);v.atk=cap(v.atk+u.level);v.hp=cap(v.hp+u.level);}}}
 else if(a.type==='roll'){assert(s.gold>=1,'金币不足，需要 1 金');s.gold--;roll(s);for(const u of s.team.filter(Boolean))if(byId[u.id].kind==='rollIncome'&&u.rollIncomeRound!==s.round){u.rollIncomeRound=s.round;s.gold+=u.level;}}
 else if(a.type==='freeze'){assert(a.zone==='shop'||a.zone==='foods','商品区域无效');slot(a.slot,s[a.zone].length);assert(s[a.zone][a.slot],'没有可以冻结的商品');s[a.zone][a.slot].frozen=!s[a.zone][a.slot].frozen;}
 else if(a.type==='food'){slot(a.slot,2);slot(a.to,5);const o=s.foods[a.slot],u=s.team[a.to];assert(o,'这个位置没有道具');assert(u,'请先选择一位队员');assert(s.gold>=3,'金币不足，需要 3 金');const id=o.id;if(id==='chocolate')gainXp(s,u,1);else if(['honey','garlic','melon','steak'].includes(id))u.perk=id;else if(id==='salad'){const p=s.team.filter(Boolean);for(let i=0;i<2&&p.length;i++){const at=Math.floor(rand(s)*p.length),v=p.splice(at,1)[0];v.atk=cap(v.atk+1);v.hp=cap(v.hp+1);}}else{const [atk,hp]=id==='snack'?[1,1]:id==='protein'?[2,0]:id==='milk'?[0,3]:[3,3];u.atk=cap(u.atk+atk);u.hp=cap(u.hp+hp);}if(byId[u.id].kind==='foodGrow')u.hp=cap(u.hp+u.level);for(const watcher of s.team.filter(v=>v&&byId[v.id].kind==='foodShare')){watcher.atk=cap(watcher.atk+watcher.level);watcher.hp=cap(watcher.hp+watcher.level);}s.foods[a.slot]=null;s.gold-=3;}
 else if(a.type==='bonus'){slot(a.slot,2);assert(s.bonusOffer,'没有升级奖励');const at=s.shop.findIndex(x=>!x?.frozen);assert(at>=0,'先解冻一个商店位置');s.shop[at]={id:s.bonusOffer[a.slot].id,frozen:false};s.bonusOffer=null;}
 else throw new Error('不支持的操作');return s;
}
export function prepareTeam(s){
 assert(s.status==='prep','这局已经结束');assert(s.team.some(Boolean),'至少招募一位角色才能出战');
 if(s.preparedRound!==s.round){
  s.preparationEvents=[{type:'roundEndStart',text:'回合结束，结算队员的成长技能',actors:[],a:clone(s.team)}];
  for(const u of s.team.filter(Boolean)){
   const kind=byId[u.id].kind;let targets=[];
   if(kind==='selfGrow'||kind==='leaderGrow'&&s.team.some(v=>v&&v!==u&&v.level===3))targets=[u];
   if(kind==='levelGrow')targets=s.team.filter(v=>v&&v!==u&&v.level>=2);
   if(kind==='mentor'){const at=s.team.indexOf(u),v=s.team.slice(0,at).findLast(Boolean);if(v)targets=[v];}
   if(kind==='grow'||kind==='allGrow')targets=s.team.filter(v=>v&&v!==u).sort((a,b)=>a.hp-b.hp).slice(0,kind==='grow'?1:2);
   const affected=[];for(const v of targets){const atk=v.atk,hp=v.hp;v.atk=cap(v.atk+u.level*(kind==='leaderGrow'?2:1));v.hp=cap(v.hp+u.level*(['leaderGrow','mentor'].includes(kind)?2:1));if(v.atk!==atk||v.hp!==hp)affected.push(`${byId[v.id].name} +${v.atk-atk}/+${v.hp-hp}`);}
   if(affected.length)s.preparationEvents.push({type:'roundEnd',text:`${byId[u.id].name} ${byId[u.id].title}：${affected.join('，')}`,actors:[{side:'a',uid:u.uid}],a:clone(s.team)});
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
 const state={rng:hash(seed)},teams={a:clone(teamA.filter(Boolean)),b:clone(teamB.filter(Boolean))},events=[],effects=[];
 let steps=0,serial=0;
 const kind=u=>u?.battleKind||byId[u?.id]?.kind;
 const other=side=>side==='a'?'b':'a';
 const name=u=>byId[u.id]?.name||(u.id==='bee'?'小蜜蜂':u.id==='spark'?'星火伴舞':'伴舞');
 const ref=(side,u)=>({side,uid:u.uid});
 const snap=side=>clone([...teams[side],...Array(Math.max(0,5-teams[side].length)).fill(null)]);
 const emit=(type,text,actors=[],targets=[])=>{assert(events.length<500,'技能连锁超过安全上限');events.push({type,text,actors,targets,a:snap('a'),b:snap('b')});};
 const sideOf=u=>teams.a.includes(u)?'a':teams.b.includes(u)?'b':null;
 const living=u=>u&&u.hp>0&&sideOf(u);
 const next=(side,u,offset)=>{const at=teams[side].indexOf(u);return at<0?null:offset>0?teams[side].slice(at+1).find(v=>v.hp>0):teams[side].slice(0,at).findLast(v=>v.hp>0);};
 const consume=(u,limit)=>{if(u.triggers>=limit)return false;u.triggers++;return true;};
 const grow=(u,atk,hp)=>{u.atk=cap(u.atk+atk);u.hp=cap(u.hp+hp);u.maxhp=Math.max(u.maxhp,u.hp);};
 for(const u of [...teams.a,...teams.b]){u.maxhp=u.hp;u.shield=u.perk==='melon'?8:0;u.triggers=0;u.first=true;delete u.battleKind;}
 // Resolve copies from the original lineup, never from another copy's transient skill.
 const shopKinds=new Set(['copy','grow','allGrow','selfGrow','income','buyBuff','sell','sellBuff','rollIncome','foodGrow','levelGift','mentor','levelGrow','foodShare','leaderGrow','teamLevel','allyBuy']);
 const copies=[];
 for(const side of ['a','b'])for(const u of teams[side])if(kind(u)==='copy'){
  const source=next(side,u,-1),sourceKind=byId[source?.id]?.kind;
  if(sourceKind&&!shopKinds.has(sourceKind)){u.battleKind=sourceKind;copies.push({side,u,source});}
 }
 emit('start','双方队伍登场');
 for(const {side,u,source} of copies)emit('copy',`${name(u)} 镜像合演：复制 ${name(source)} 的战斗技能（${u.level} 级）`,[ref(side,u)],[ref(side,source)]);
 const damage=(u,amount,source=null)=>{
  if(!u||u.hp<=0||amount<=0)return;
  let n=amount;if(u.perk==='garlic')n=Math.max(1,n-2);
  const oldShield=u.shield,absorb=Math.min(n,u.shield);u.shield-=absorb;n-=absorb;u.hp-=n;
  if(oldShield>0&&u.shield===0&&u.hp>0&&kind(u)==='shieldBreak'&&consume(u,2))effects.push({type:'shieldBreak',u});
  if(n>0&&u.hp>0){
   const k=kind(u),limit=k==='hurt'?2:k==='hurtGift'?4:3;
   if(['hurt','retaliate','hurtGift','hurtShield'].includes(k)&&consume(u,limit))effects.push({type:k,u});
  }
  if(u.hp<=0&&source&&sideOf(source)!==sideOf(u)&&kind(source)==='knockout')effects.push({type:'knockout',u:source});
 };
 const drainEffects=()=>{
  let count=0;
  while(effects.length){
   assert(++count<100,'受伤与追击技能形成无限连锁');
   const {type,u}=effects.shift();if(!living(u))continue;const side=sideOf(u);
   if(type==='hurtShield'){u.shield+=3*u.level;emit('shield',`${name(u)} 应急结界：护盾 +${3*u.level}`,[ref(side,u)],[ref(side,u)]);}
   if(type==='shieldBreak'){grow(u,3*u.level,0);emit('shieldBreak',`${name(u)} 破盾觉醒：攻击 +${3*u.level}`,[ref(side,u)],[ref(side,u)]);}
   if(type==='hurt'){grow(u,2*u.level,0);emit('hurtGrow',`${name(u)} 受伤成长：攻击 +${2*u.level}`,[ref(side,u)],[ref(side,u)]);}
   if(type==='hurtGift'){
    const v=next(side,u,1);if(v){grow(v,u.level,2*u.level);emit('hurtGift',`${name(u)} 逆境传递 → ${name(v)} +${u.level}/+${2*u.level}`,[ref(side,u)],[ref(side,v)]);}
   }
   if(type==='retaliate'||type==='knockout'){
    const v=teams[other(side)].find(v=>v.hp>0);if(!v||type==='knockout'&&!consume(u,5))continue;
    const amount=(type==='knockout'?4:1)*u.level;damage(v,amount,u);
    emit(type,`${name(u)} ${type==='knockout'?'击败追击':'受伤反击'} → ${name(v)}，${amount} 点伤害`,[ref(side,u)],[ref(other(side),v)]);
   }
  }
 };
 const summon=(side,at,atk,hp,id='dancer',source=null,extra={})=>{
  const t=teams[side];if(t.length>=5)return;
  const u={uid:`summon${serial++}`,id,atk:cap(atk),hp:cap(hp),maxhp:cap(hp),xp:0,level:1,perk:null,shield:0,triggers:0,first:true,...extra};
  t.splice(Math.min(at,t.length),0,u);
  // Preserve legacy summon snapshots, including their existing attack bonus.
  for(const ally of t)if(kind(ally)==='summonBuff'&&ally.hp>0&&consume(ally,3))u.atk=cap(u.atk+ally.level);
  emit(extra.revived?'revive':'summon',`${source?name(source)+(extra.revived?' 返场 → ':' 召唤 → '):''}${name(u)} 登场！${u.atk}/${u.hp}`,extra.revived?[ref(side,u)]:source?[ref(side,source)]:[],[ref(side,u)]);
  for(const ally of t)if(kind(ally)==='summonTrain'&&ally.hp>0&&consume(ally,6)){
   grow(u,2*ally.level,2*ally.level);emit('summonTrain',`${name(ally)} 舞团编排 → ${name(u)} +${2*ally.level}/+${2*ally.level}`,[ref(side,ally)],[ref(side,u)]);
  }
 };
 const deaths=()=>{
  let loops=0;
  while([...teams.a,...teams.b].some(u=>u.hp<=0)){
   assert(++loops<40,'退场技能形成无限连锁');const fallen=[];
   for(const side of ['a','b'])for(const u of teams[side])if(u.hp<=0)fallen.push({side,u,at:teams[side].indexOf(u),next:next(side,u,1),adjacent:teams[side][teams[side].indexOf(u)+1]});
   for(const {side,u} of fallen)teams[side]=teams[side].filter(v=>v!==u);
   emit('faint',fallen.map(({u})=>`${name(u)} 退场`).join(' · '));
   for(const {side,u,at,next:rear,adjacent} of fallen){
    // Only survivors observe faint events; simultaneous deaths cannot revive each other.
    for(const ally of [...teams[side]])if(ally.hp>0){
     if(kind(ally)==='faintGrow'&&consume(ally,6)){grow(ally,2*ally.level,ally.level);emit('faintGrow',`${name(ally)} 谢幕接棒：${name(u)} 退场，自己 +${2*ally.level}/+${ally.level}`,[ref(side,ally)],[ref(side,ally)]);}
     if(kind(ally)==='summonEcho'&&consume(ally,2))summon(side,at,2*ally.level,2*ally.level,'dancer',ally);
     if(kind(ally)==='revengeSnipe'&&consume(ally,3)){const victim=teams[other(side)].filter(v=>v.hp>0).sort((a,b)=>b.atk-a.atk)[0];if(victim){damage(victim,2*ally.level,ally);emit('revengeSnipe',`${name(ally)} 离场追光 → ${name(victim)}，${2*ally.level} 点伤害`,[ref(side,ally)],[ref(other(side),victim)]);}}
     if(ally===adjacent&&kind(ally)==='faintShield'&&consume(ally,4)){grow(ally,2*ally.level,0);ally.shield+=4*ally.level;emit('shield',`${name(ally)} 守护誓约：前方友军退场，攻击 +${2*ally.level}、护盾 +${4*ally.level}`,[ref(side,ally)],[ref(side,ally)]);}
    }
    const k=kind(u);
    if(k==='gift'&&living(rear)){grow(rear,2*u.level,2*u.level);emit('buff',`${name(u)} 留下援护 +${2*u.level}/+${2*u.level}`,[ref(side,u)],[ref(side,rear)]);}
    if(k==='splashGift'){for(const v of teams[side].filter(v=>v.hp>0))grow(v,u.level,0);emit('buff',`${name(u)} 给全队 +${u.level} 攻击`,[ref(side,u)]);}
    if(k==='heal'){for(const v of teams[side].filter(v=>v.hp>0))v.hp=Math.min(v.maxhp,v.hp+3*u.level);emit('heal',`${name(u)} 恢复全队生命`,[ref(side,u)]);}
    if(k==='lastWord'){const victim=teams[other(side)].find(v=>v.hp>0);if(victim){const amount=Math.ceil(u.atk*.5*u.level);damage(victim,amount,u);emit('lastWord',`${name(u)} 谢幕震波 → ${name(victim)}，${amount} 点伤害`,[ref(side,u)],[ref(other(side),victim)]);}}
    if(k==='revive'&&!u.revived)summon(side,at,u.atk,2*u.level,u.id,u,{revived:true,level:u.level,battleKind:u.battleKind});
    if(k==='summon')summon(side,at,2*u.level,2*u.level,'dancer',u);
    if(k==='doubleSummon'){summon(side,at,u.level,u.level,'dancer',u);summon(side,at+1,u.level,u.level,'dancer',u);}
    if(k==='inheritSummon')for(let i=0;i<u.level;i++)summon(side,at+i,Math.ceil(u.atk*.5),1,'spark',u);
    if(u.perk==='honey')summon(side,at,1,1,'bee',u);
    drainEffects();
   }
  }
 };
 const openers=['a','b'].flatMap(side=>teams[side].map(u=>({side,u}))).sort((a,b)=>b.u.atk-a.u.atk||String(a.u.uid).localeCompare(String(b.u.uid))||a.side.localeCompare(b.side));
 for(const {side,u} of openers){
  if(!living(u))continue;const k=kind(u);
  if(k==='armor'||k==='shieldBreak'){const amount=(k==='shieldBreak'?6:4)*u.level;u.shield+=amount;emit('shield',`${name(u)} 获得 ${amount} 点护盾`,[ref(side,u)]);}
  if(k==='teamShield'){for(const v of teams[side].filter(v=>v!==u&&v.hp>0).slice(0,2))v.shield+=2*u.level;emit('shield',`${name(u)} 为两位队友架起护盾`,[ref(side,u)]);}
  if(k==='volley'||k==='tripleZap'){const pool=teams[other(side)].filter(v=>v.hp>0);for(let i=0;i<(k==='volley'?2:3)&&pool.length;i++){const victim=pool.splice(Math.floor(rand(state)*pool.length),1)[0],amount=k==='volley'?2*u.level:Math.ceil(u.atk*.2*u.level);damage(victim,amount,u);emit(k,`${name(u)} ${k==='volley'?'双重聚光':'三重星轨'} → ${name(victim)}，${amount} 点伤害`,[ref(side,u)],[ref(other(side),victim)]);}drainEffects();deaths();}
  if(k==='relayAttack'){
   const v=next(side,u,-1);if(v){const amount=Math.ceil(u.atk*.5*u.level);grow(v,amount,0);emit('relayAttack',`${name(u)} 聚光传递 → ${name(v)}，攻击 +${amount}`,[ref(side,u)],[ref(side,v)]);}
  }
  if(k==='weakening'){
   const v=teams[other(side)].filter(v=>v.hp>0).sort((a,b)=>b.hp-a.hp)[0];
   if(v){const amount=Math.min(v.hp-1,Math.ceil(v.hp*.25*u.level));v.hp-=amount;emit('weakening',`${name(u)} 聚光压制 → ${name(v)}，削减 ${amount} 生命（${25*u.level}%）`,[ref(side,u)],[ref(other(side),v)]);}
  }
  if(k==='snipe'||k==='backSnipe'){
   const enemies=teams[other(side)].filter(v=>v.hp>0),v=k==='snipe'?enemies.sort((a,b)=>a.hp-b.hp)[0]:enemies.at(-1);
   if(v){damage(v,(k==='snipe'?3:2)*u.level,u);emit('snipe',`${name(u)} 开场狙击 ${name(v)}`,[ref(side,u)],[ref(other(side),v)]);drainEffects();deaths();}
  }
 }
 while(teams.a.length&&teams.b.length){
  assert(++steps<150,'战斗超过安全上限');const a=teams.a[0],b=teams.b[0],atkA=a.atk+(a.first&&a.perk==='steak'?8:0),atkB=b.atk+(b.first&&b.perk==='steak'?8:0);
  a.first=b.first=false;damage(b,atkA,a);damage(a,atkB,b);emit('attack',`${name(a)} 与 ${name(b)} 互攻 ${atkA} / ${atkB}`,[ref('a',a),ref('b',b)]);
  for(const [side,attacker] of [['a',a],['b',b]]){
   const enemy=teams[other(side)],k=kind(attacker),rear=next(side,attacker,1);
   if(k==='attackSnipe'&&living(attacker)&&consume(attacker,3)){const victim=enemy.findLast(v=>v.hp>0);if(victim){damage(victim,3*attacker.level,attacker);emit('attackSnipe',`${name(attacker)} 剑舞破后 → ${name(victim)}，${3*attacker.level} 点伤害`,[ref(side,attacker)],[ref(other(side),victim)]);}}
   if(living(rear)&&kind(rear)==='sniperSupport'&&consume(rear,3)){const victim=enemy.filter(v=>v.hp>0).sort((a,b)=>b.atk-a.atk)[0];if(victim){const amount=Math.ceil(rear.atk*.25*rear.level);damage(victim,amount,rear);emit('sniperSupport',`${name(rear)} 精准伴奏 → ${name(victim)}，${amount} 点伤害`,[ref(side,rear)],[ref(other(side),victim)]);}}
   if(k==='cleave'&&enemy[1]){damage(enemy[1],2*attacker.level,attacker);emit('cleave',`${name(attacker)} 波及后排`,[ref(side,attacker)],[ref(other(side),enemy[1])]);}
   if(k==='friendlyHit'&&living(attacker)&&rear&&consume(attacker,5)){damage(rear,1,attacker);emit('friendlyHit',`${name(attacker)} 震场节拍 → ${name(rear)}，友军受到 1 点伤害`,[ref(side,attacker)],[ref(side,rear)]);}
   if(living(rear)&&kind(rear)==='rearGrow'&&consume(rear,5)){grow(rear,2*rear.level,2*rear.level);emit('rearGrow',`${name(rear)} 接力应援：${name(attacker)} 普攻，自己 +${2*rear.level}/+${2*rear.level}`,[ref(side,rear)],[ref(side,rear)]);}
   if(living(rear)&&kind(rear)==='support'&&consume(rear,3)){
    const victims=enemy.filter(u=>u.hp>0);if(victims.length){const v=choose(state,victims);damage(v,2*rear.level,rear);emit('support',`${name(rear)} 发动后排支援`,[ref(side,rear)],[ref(other(side),v)]);}
   }
  }
  drainEffects();deaths();
 }
 const winner=teams.a.length?'a':teams.b.length?'b':'draw';emit('end',winner==='a'?'你的队伍获胜！':winner==='b'?'对手获胜，下回合再来':'双方平局');return {winner,events,seed,ruleset:RULESET};
}
