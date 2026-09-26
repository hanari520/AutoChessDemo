/* Battle-only bond events. No shop RNG, persistent state, or timers. */
const BOND_NEW_DESC={
  '深海':['深海成员首次受到技能伤害时获得 18% 最大生命潮盾','潮盾同时覆盖最近的友军'],
  '星际':['不同星际成员施法后，星链追加一次魔法伤害','星链再跃迁至第二名敌人'],
  '毛茸乐园':['不同毛茸成员集火同一敌人时追加追击伤害','追击令目标减速','追击再波及目标邻近敌人'],
  '音律':['音律成员每 3 次普攻奏出节拍，为邻近友军回蓝','节拍同时为两名邻近友军回蓝'],
  '四禧丸子':['四禧成员相邻时替同伴分担 15% 受伤','分担者同时获得护盾'],
  '学园':['学园成员锁定最远敌人作为研究目标，攻击该目标追加伤害'],
  '夜幕':['夜幕成员击杀后向附近两名敌人扩散暮印；下一次受击引爆','暮印扩散至三名敌人'],
  '花语':['花语成员首次跌至 35% 生命以下时开花，治疗自身并为邻近友军加盾'],
  '魔道':['魔道成员首次受到近战普攻时石化攻击者 1.5 秒','反制后自身再获护盾'],
  '森之国':['森之国成员获得 18% 普攻闪避；闪避后获得幻影护层','幻影同时保护最近的友军'],
  '工造':['战前为一名友军装配可被击破的装置，抵挡伤害','为两名友军装配更坚固的装置'],
  'P-SP':['敌方蓝量最高者即将施法时，P-SP 打断并使其短暂沉默（每场 1 次）','每场可打断 2 次'],
  '刀客':['相邻刀客形成防线；同伴受击时刀客反击攻击者','反击时为同伴加盾','反击再波及攻击者邻近敌人'],
  '守护':['守护成员战前认领相邻队友，队友首次受击时援护加盾','援护同时保护守护者','援护同时解除被认领者的沉默'],
  '歌势':['不同歌势成员施法组成合唱，为全队回复生命','合唱同时为最低蓝队友回蓝'],
  '游侠':['游侠每 3 次命中将箭弹向未被本次命中的另一名敌人','箭矢再弹向第二名敌人'],
  '法师':['不同法师成员施法积累符文，引爆蓝量最高的敌人','爆破再波及目标邻近敌人'],
  '咒术':['战斗开始将敌方蓝量最高者变形 2.5 秒'],
  '刺客':['刺客击杀孤立目标后潜行，短暂闪避普攻','潜行后下一次普攻强化'],
  '狂战':['狂战低于 45% 生命后，普攻横扫目标邻近敌人','横扫第二名邻近敌人'],
  '医者':['友军首次遭受致命伤害时，医者紧急分诊使其存活并回复生命','分诊同时治疗附近友军'],
  '偶像':['邻近友军施法后，偶像为其添加应援护盾','应援同时保护附近最低血友军']
};
function bondModern(){return !!(S&&Number(S.bondRulesVersion)>=2);}
function bondDesc(name,cfg){return (!S||bondModern())&&BOND_NEW_DESC[name]||cfg.desc;}
const BondRuntime={
  state:null,
  start(units){
    const st={units,depth:0,chorus:[new Set(),new Set()],star:[new Set(),new Set()],mage:[new Set(),new Set()],rescued:[false,false],spotlight:[0,0]};
    this.state=st;
    const tiers=(side,name)=>BV[side]&&BV[side][name]||0;
    for(const u of units){
      u.skMul=u.skMul||1;u.healMul=u.healMul||1;u.regen=u.regen||0;
      u.bond={}; const d=byId(u.id),b=u.bond;
      for(const f of facsOf(d))if(tiers(u.side,f))b[f]=tiers(u.side,f);
      for(const j of jobsOf(d))if(tiers(u.side,j))b[j]=tiers(u.side,j);
      if(b['森之国'])u.dodge=Math.min(.6,(u.dodge||0)+.18);
      if(b['学园']){
        const foes=units.filter(v=>v.side!==u.side&&v.hp>0).sort((a,c)=>unitDist(c,u)-unitDist(a,u)||String(a.uid).localeCompare(String(c.uid)));
        u.bondResearch=foes[0]&&foes[0].uid;
      }
    }
    for(const side of [0,1]){
      const mine=units.filter(v=>v.side===side),foes=units.filter(v=>v.side!==side);
      if(tiers(side,'工造'))mine.slice().sort((a,b)=>b.maxhp-a.maxhp||String(a.uid).localeCompare(String(b.uid))).slice(0,tiers(side,'工造')>=2?2:1)
        .forEach(v=>{v.bondDevice=Math.round(v.maxhp*(tiers(side,'工造')>=2?.28:.18));});
      if(tiers(side,'咒术')){
        const v=foes.slice().sort((a,b)=>b.mana-a.mana||String(a.uid).localeCompare(String(b.uid)))[0];
        if(v){v.hexT=Math.max(v.hexT||0,2500);dmgPopup(null,v,'🐑变形','cast');}
      }
      for(const g of mine.filter(v=>v.bond['守护'])){
        const mate=mine.filter(v=>v!==g&&unitDist(v,g)<=1).sort((a,b)=>unitDist(a,g)-unitDist(b,g)||String(a.uid).localeCompare(String(b.uid)))[0];
        if(mate)g.bondClaim=mate.uid;else dmgPopup(g,g,'🛡缺少邻位','cast');
      }
    }
  },
  tier(u,n){return u&&u.bond&&u.bond[n]||0;},
  damage(src,tgt,n,units,type){const st=this.state;if(!st||st.depth>=2||!tgt||tgt.hp<=0)return 0;st.depth++;try{return dealDamage(src,tgt,Math.max(1,Math.round(n)),units,type);}finally{st.depth--;}},
  shield(src,tgt,n,label){if(!tgt||tgt.hp<=0||tgt.noShieldT>0)return;tgt.shield=(tgt.shield||0)+Math.max(1,Math.round(n));dmgPopup(src,tgt,label||'🛡羁绊','cast');},
  heal(src,tgt,n){if(!tgt||tgt.hp<=0)return;const h=Math.min(tgt.maxhp-tgt.hp,Math.max(0,Math.round(n)))*(tgt.healDownT>0?1-tgt.healDownA:1);tgt.hp+=h;if(h>0){bsHeal(src,h);dmgPopup(src,tgt,'+'+Math.round(h),'heal');}},
  preHit(src,tgt,dmg,units,dtype){
    const st=this.state;if(!st||st.depth||!bondModern())return dmg;
    if(this.tier(tgt,'深海')&&src&&src.side!==tgt.side&&src._casting&&!tgt.bondTide){tgt.bondTide=true;this.shield(tgt,tgt,tgt.maxhp*.18,'🌊潮盾');if(this.tier(tgt,'深海')>=2){const ally=units.filter(v=>v.hp>0&&v.side===tgt.side&&v!==tgt).sort((a,b)=>unitDist(a,tgt)-unitDist(b,tgt))[0];if(ally)this.shield(tgt,ally,ally.maxhp*.12,'🌊潮盾');}}
    if(tgt.bondDevice>0){const block=Math.min(tgt.bondDevice,dmg);tgt.bondDevice-=block;dmg-=block;dmgPopup(null,tgt,tgt.bondDevice>0?'🔧装置抵挡':'🔧装置击破','cast');}
    if(src&&src._basicAttack&&byId(src.id).form==='me'&&this.tier(tgt,'魔道')&&!tgt.bondReversed){tgt.bondReversed=true;src.frozen=Math.max(src.frozen||0,1500);src.petrifyT=Math.max(src.petrifyT||0,1500);if(this.tier(tgt,'魔道')>=2)this.shield(tgt,tgt,tgt.maxhp*.10,'🗿反制');}
    const guard=units.find(g=>g.hp>0&&g.side===tgt.side&&g.bondClaim===tgt.uid&&!g.bondGuardUsed);
    if(guard){guard.bondGuardUsed=true;this.shield(guard,tgt,tgt.maxhp*.14,'🛡援护');if(this.tier(guard,'守护')>=2)this.shield(guard,guard,guard.maxhp*.10,'🛡守护');if(this.tier(guard,'守护')>=3)tgt.silenceT=0;}
    if(src&&src.side!==tgt.side){
      const mate=units.find(v=>v!==tgt&&v.hp>0&&v.side===tgt.side&&this.tier(v,'四禧丸子')&&this.tier(tgt,'四禧丸子')&&unitDist(v,tgt)<=1);
      if(mate&&dmg>1){const part=Math.floor(dmg*.15);if(part>0){dmg-=part;this.damage(src,mate,part,units,dtype);dmgPopup(tgt,mate,'🍡分担','cast');if(this.tier(mate,'四禧丸子')>=2&&!mate.bondShareShield){mate.bondShareShield=true;this.shield(mate,mate,mate.maxhp*.12,'🍡同心盾');}}}
    }
    return dmg;
  },
  beforeHealth(src,tgt,dmg,units){
    const st=this.state;if(!st||st.depth||!bondModern()||dmg<tgt.hp||st.rescued[tgt.side]||!BV[tgt.side]||!BV[tgt.side]['医者'])return dmg;
    const healer=units.find(v=>v!==tgt&&v.hp>0&&v.side===tgt.side&&this.tier(v,'医者'));if(!healer)return dmg;
    st.rescued[tgt.side]=true;this.heal(healer,tgt,tgt.maxhp*.22);dmg=Math.min(dmg,tgt.hp-1);dmgPopup(healer,tgt,'✚分诊','cast');
    if(BV[tgt.side]['医者']>=2)units.filter(v=>v.hp>0&&v.side===tgt.side&&v!==tgt&&unitDist(v,tgt)<=2).forEach(v=>this.heal(healer,v,v.maxhp*.12));
    return Math.max(0,dmg);
  },
  hit(src,tgt,dealt,units){
    const st=this.state;if(!st||st.depth||!bondModern()||dealt<=0)return;
    if(tgt.hp>0&&this.tier(tgt,'花语')&&!tgt.bondBloom&&tgt.hp/tgt.maxhp<=.35){tgt.bondBloom=true;this.heal(tgt,tgt,tgt.maxhp*.22);units.filter(v=>v.hp>0&&v.side===tgt.side&&v!==tgt&&unitDist(v,tgt)<=2).forEach(v=>this.shield(tgt,v,v.maxhp*.12,'🌸开花'));}
    if(src&&src.side!==tgt.side){
      if(tgt.bondDusk){const n=tgt.bondDusk;tgt.bondDusk=0;this.damage(src,tgt,n,units,'magic');dmgPopup(src,tgt,'🌙暮印','cast');}
      const defenders=units.filter(v=>v.hp>0&&v!==tgt&&v.side===tgt.side&&this.tier(v,'刀客')&&this.tier(tgt,'刀客')&&unitDist(v,tgt)<=1);
      for(const v of defenders){v.bondCounters=(v.bondCounters||0)+1;if(v.bondCounters<=3){this.damage(v,src,v.atk*.4,units,'phys');dmgPopup(v,src,'⚔防线反击','cast');if(this.tier(v,'刀客')>=2)this.shield(v,tgt,tgt.maxhp*.06,'⚔防线');if(this.tier(v,'刀客')>=3){const extra=units.find(x=>x.hp>0&&x.side===src.side&&x!==src&&unitDist(x,src)<=1);if(extra)this.damage(v,extra,v.atk*.3,units,'phys');}}}
    }
  },
  attack(src,tgt,dealt,units){
    if(!this.state||!bondModern()||dealt<=0||!src||src.hp<=0||!tgt)return;
    const side=src.side;
    if(this.tier(src,'音律')){src.bondBeat=(src.bondBeat||0)+1;if(src.bondBeat%3===0){const allies=units.filter(v=>v.hp>0&&v.side===side&&v!==src&&unitDist(v,src)<=2&&!v.isPassiveFlag).sort((a,b)=>a.mana-b.mana).slice(0,this.tier(src,'音律')>=2?2:1);for(const ally of allies){ally.mana=Math.min(ally.maxmana,ally.mana+10);dmgPopup(src,ally,'🎵节拍','cast');}}}
    if(this.tier(src,'毛茸乐园')){const key='bondFocus'+side,seen=tgt[key]||(tgt[key]=new Set());seen.add(src.id);if(seen.size>=2&&!tgt['bondFocusUsed'+side]){tgt['bondFocusUsed'+side]=true;this.damage(src,tgt,src.atk*.6,units,'phys');dmgPopup(src,tgt,'🐾集火','cast');if(this.tier(src,'毛茸乐园')>=2){tgt.slowA=Math.max(tgt.slowA||0,.25);tgt.slowT=Math.max(tgt.slowT||0,1600);}if(this.tier(src,'毛茸乐园')>=3){const extra=units.find(v=>v.hp>0&&v.side!==side&&v!==tgt&&unitDist(v,tgt)<=1);if(extra)this.damage(src,extra,src.atk*.4,units,'phys');}}}
    if(src.bondResearch===tgt.uid){this.damage(src,tgt,src.atk*.25,units,'magic');if(!src.bondResearchShown){src.bondResearchShown=true;dmgPopup(src,tgt,'📚研究目标','cast');}}
    if(this.tier(src,'游侠')){src.bondArrow=(src.bondArrow||0)+1;if(src.bondArrow%3===0){const targets=units.filter(x=>x.hp>0&&x.side!==side&&x!==tgt).sort((a,b)=>unitDist(a,tgt)-unitDist(b,tgt)).slice(0,this.tier(src,'游侠')>=2?2:1);for(const v of targets){this.damage(src,v,src.atk*.45,units,'phys');dmgPopup(src,v,'🏹弹射','cast');}}}
    if(this.tier(src,'狂战')&&src.hp/src.maxhp<.45){const targets=units.filter(x=>x.hp>0&&x.side!==side&&x!==tgt&&unitDist(x,tgt)<=1).sort((a,b)=>unitDist(a,tgt)-unitDist(b,tgt)).slice(0,this.tier(src,'狂战')>=2?2:1);for(const v of targets){this.damage(src,v,src.atk*.4,units,'phys');dmgPopup(src,v,'⚔横扫','cast');}}
  },
  dodge(tgt){if(!this.state||!bondModern()||!this.tier(tgt,'森之国'))return;this.shield(tgt,tgt,tgt.maxhp*.09,'🍃幻影');if(this.tier(tgt,'森之国')>=2){const ally=this.state.units.filter(v=>v.hp>0&&v.side===tgt.side&&v!==tgt).sort((a,b)=>unitDist(a,tgt)-unitDist(b,tgt))[0];if(ally)this.shield(tgt,ally,ally.maxhp*.07,'🍃幻影');}},
  beforeCast(caster,units){
    const st=this.state;if(!st||!bondModern())return false;
    const side=1-caster.side,tier=BV[side]&&BV[side]['P-SP']||0;
    if(!tier||st.spotlight[side]>=(tier>=2?2:1)||!units.some(v=>v.hp>0&&v.side===side&&this.tier(v,'P-SP')))return false;
    const highest=units.filter(v=>v.hp>0&&v.side===caster.side&&!v.isPassiveFlag).sort((a,b)=>b.mana-a.mana||String(a.uid).localeCompare(String(b.uid)))[0];
    if(highest!==caster)return false;
    st.spotlight[side]++;caster.mana=Math.min(caster.mana,Math.floor(caster.maxmana*.5));
    caster.silenceT=Math.max(caster.silenceT||0,1200);caster.cd=Math.max(caster.cd||0,400);
    dmgPopup(null,caster,'🎤聚光打断','cast');return true;
  },
  cast(src,units){
    const st=this.state;if(!st||!bondModern()||!src||src.hp<=0)return;const side=src.side,foes=units.filter(v=>v.hp>0&&v.side!==side),mine=units.filter(v=>v.hp>0&&v.side===side);
    if(this.tier(src,'星际')){const s=st.star[side];s.add(src.id);if(s.size>=2){s.clear();const targets=foes.sort((a,b)=>unitDist(a,src)-unitDist(b,src)).slice(0,this.tier(src,'星际')>=2?2:1);for(const v of targets){this.damage(src,v,src.atk*.8,units,'magic');dmgPopup(src,v,'🌌星链','cast');}}}
    if(this.tier(src,'歌势')){const s=st.chorus[side];s.add(src.id);if(s.size>=2){s.clear();mine.forEach(v=>this.heal(src,v,v.maxhp*.05));dmgPopup(src,src,'🎶合唱','cast');if(this.tier(src,'歌势')>=2){const ally=mine.filter(v=>!v.isPassiveFlag).sort((a,b)=>a.mana-b.mana)[0];if(ally){ally.mana=Math.min(ally.maxmana,ally.mana+12);dmgPopup(src,ally,'🎵和声回蓝','cast');}}}}
    if(this.tier(src,'法师')){const s=st.mage[side];s.add(src.id);if(s.size>=2){s.clear();const v=foes.sort((a,b)=>b.mana-a.mana)[0];if(v){this.damage(src,v,src.atk*1.1,units,'magic');dmgPopup(src,v,'🔮符文爆破','cast');if(this.tier(src,'法师')>=2){const extra=foes.find(x=>x!==v&&x.hp>0&&unitDist(x,v)<=2);if(extra)this.damage(src,extra,src.atk*.6,units,'magic');}}}}
    for(const idol of mine.filter(v=>v!==src&&this.tier(v,'偶像')&&unitDist(v,src)<=2)){idol.bondCheers=(idol.bondCheers||0)+1;if(idol.bondCheers<=4){this.shield(idol,src,src.maxhp*.08,'✨应援');if(this.tier(idol,'偶像')>=2){const ally=mine.filter(v=>v!==src&&v!==idol&&unitDist(v,idol)<=2).sort((a,b)=>a.hp/a.maxhp-b.hp/b.maxhp)[0];if(ally)this.shield(idol,ally,ally.maxhp*.06,'✨应援');}}}
  },
  kill(src,tgt,units){
    if(!this.state||this.state.depth||!bondModern()||!src||src.hp<=0)return;
    if(this.tier(src,'夜幕'))units.filter(v=>v.hp>0&&v.side!==src.side).sort((a,b)=>unitDist(a,tgt)-unitDist(b,tgt)).slice(0,this.tier(src,'夜幕')>=2?3:2).forEach(v=>{v.bondDusk=Math.round(src.atk*.55);dmgPopup(src,v,'🌙暮印','cast');});
    if(this.tier(src,'刺客')&&!units.some(v=>v.hp>0&&v.side===tgt.side&&v!==tgt&&unitDist(v,tgt)<=1)){src.phaseT=Math.max(src.phaseT||0,1800);src.phaseDodge=.8;if(this.tier(src,'刺客')>=2)src.itemNextStrikeAmp=Math.max(src.itemNextStrikeAmp||0,.35);dmgPopup(src,src,'🥷潜行','cast');}
  }
};
