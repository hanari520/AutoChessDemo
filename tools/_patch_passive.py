# 被动变体接入：makeBattleUnit / dealDamage / startBattle / passiveHeal / 每秒tick
import io
p = 'index.html'
s = io.open(p, encoding='utf8').read()

def rep(old, new):
    global s
    assert old in s, 'NOT FOUND: ' + old[:60]
    s = s.replace(old, new, 1)

# 1) makeBattleUnit：把被动变体参数挂到战斗单位上
rep("""  b.atk=Math.round(b.atk*b.atkMul);
  if(b.hpMul)b.maxhp=Math.round(b.maxhp*b.hpMul);
  b.hp=b.maxhp;
  if(d.sk[1]==='drain' && isPassive(u)) b.vamp=Math.max(b.vamp,0.2); // 被动吸血""",
"""  b.atk=Math.round(b.atk*b.atkMul);
  if(b.hpMul)b.maxhp=Math.round(b.maxhp*b.hpMul);
  b.hp=b.maxhp;
  const pv=svOf(d.id).p;                  // 棋子被动变体参数
  if(pv){
    b.pv=pv;
    b.pRegen=pv.pRegen; b.growPct=pv.grow; b.growT=0;
    b.thorns=pv.thorns; b.pAtkDot=pv.atkDot; b.pierceB=pv.pierce;
  }
  if(d.sk[1]==='drain' && isPassive(u)) b.vamp=Math.max(b.vamp,(pv&&pv.vampPct)||0.2); // 被动吸血""")

# 2) dealDamage：格挡/破盾/透盾/反伤/攻击毒伤全部按变体参数
rep("""function dealDamage(src,tgt,dmg,units){
  if(!tgt||tgt.hp<=0) return;
  if(src && isPassive(tgt) && byId(tgt.id).sk[1]==='block' && Math.random()<0.2){
    dmg=Math.round(dmg*0.5);
    dmgPopup(null,tgt,'格挡','cast');
  }
  // 破盾之刃：对带护盾目标附加 60% 伤害（普攻与技能通用）
  if(src && isPassive(src) && byId(src.id).sk[1]==='shieldbane' && tgt.shield>0){
    dmg=Math.round(dmg*1.6);
    dmgPopup(src,tgt,'🛡特攻','cast');
  }
  // 透盾星矢：攻击无视护盾，直接扣生命
  if(src && isPassive(src) && byId(src.id).sk[1]==='pierce' && tgt.shield>0){
    dmgPopup(src,tgt,'透盾','cast');
  } else if(tgt.shield>0){
    const ab=Math.min(tgt.shield,dmg); tgt.shield-=ab; dmg-=ab;
  }
  if(tgt.dmgReduce) dmg=Math.round(dmg*(1-tgt.dmgReduce));
  tgt.hp-=dmg;
  if(src && src.vamp && src.hp<src.maxhp) src.hp=Math.min(src.maxhp, src.hp+Math.round(dmg*src.vamp));
  if(src && src.poisonAtk && tgt.hp>0){ tgt.poisonT=3000; tgt.poisonDmg=Math.round(tgt.maxhp*(src.poisonPow||0.02)); }
  dmgPopup(src,tgt,'-'+dmg);""",
"""function dealDamage(src,tgt,dmg,units){
  if(!tgt||tgt.hp<=0) return 0;
  const tpv=tgt.pv, spv=src&&src.pv;
  if(src && isPassive(tgt) && byId(tgt.id).sk[1]==='block' && Math.random()<((tpv&&tpv.blockCt)||0.2)){
    dmg=Math.round(dmg*(1-((tpv&&tpv.blockDmg)||0.5)));
    dmgPopup(null,tgt,'格挡','cast');
  }
  // 破盾之刃：对带护盾目标附加特攻伤害（普攻与技能通用）
  if(src && isPassive(src) && byId(src.id).sk[1]==='shieldbane' && tgt.shield>0){
    dmg=Math.round(dmg*(1+((spv&&spv.sb)||0.6)));
    dmgPopup(src,tgt,'🛡特攻','cast');
  }
  // 透盾：攻击无视护盾，直接扣生命
  if(src && isPassive(src) && byId(src.id).sk[1]==='pierce' && tgt.shield>0){
    dmgPopup(src,tgt,'透盾','cast');
  } else if(tgt.shield>0){
    const ab=Math.min(tgt.shield,dmg); tgt.shield-=ab; dmg-=ab;
  } else if(src && isPassive(src) && byId(src.id).sk[1]==='pierce' && spv&&spv.pierce){
    dmg=Math.round(dmg*(1+spv.pierce));   // 透盾变体：对无盾目标加成
  }
  if(tgt.dmgReduce) dmg=Math.round(dmg*(1-tgt.dmgReduce));
  tgt.hp-=dmg;
  if(src && src.vamp && src.hp<src.maxhp) src.hp=Math.min(src.maxhp, src.hp+Math.round(dmg*src.vamp));
  if(src && src.poisonAtk && tgt.hp>0){ tgt.poisonT=3000; tgt.poisonDmg=Math.round(tgt.maxhp*(src.poisonPow||0.02)); }
  if(src && src.pAtkDot && tgt.hp>0){ tgt.poisonT=3000; tgt.poisonDmg=Math.round(tgt.maxhp*src.pAtkDot); }
  if(tgt.thorns && src && src.hp>0 && dmg>0){ src.hp-=Math.max(1,Math.round(tgt.maxhp*tgt.thorns)); dmgPopup(null,src,'荆棘','cast'); }
  dmgPopup(src,tgt,'-'+dmg);""")

rep("""  dmgPopup(src,tgt,'-'+dmg);
  if(tgt.hp<=0){
    if(src && src.side===0) S.stats.kills++;
    log(`💀 ${src&&src.side===0?'我方':'敌方'}${src?byId(src.id).name:'?'} 击败 ${byId(tgt.id).name}`);
  }
}""",
"""  dmgPopup(src,tgt,'-'+dmg);
  if(tgt.hp<=0){
    if(src && src.side===0) S.stats.kills++;
    log(`💀 ${src&&src.side===0?'我方':'敌方'}${src?byId(src.id).name:'?'} 击败 ${byId(tgt.id).name}`);
  }
  return dmg;
}""")

# 3) startBattle：被动护盾百分比按变体 + 护盾型被动的"队友护盾"
rep("""      if(isPassive(u) && d.sk[1]==='shield'){
        // 被动护盾按费用分级：1费20%／2费25%／3费及以上35%
        u.shield+=Math.round(u.maxhp*(d.cost>=3?0.35:d.cost===2?0.25:0.2));
      }""",
"""      if(isPassive(u) && d.sk[1]==='shield'){
        // 被动护盾：按棋子变体百分比（默认按费用分级）
        const pv2=(svOf(d.id).p)||{};
        u.shield+=Math.round(u.maxhp*(pv2.shieldPct!==undefined?pv2.shieldPct:(d.cost>=3?0.35:d.cost===2?0.25:0.2)));
      }""")

rep("""    // 医者羁绊：生命最低队友护盾
    const mT=tierOf(clsCnt,CLASSES,'医者');""",
"""    // 护盾型被动变体：为生命比例最低的队友附加护盾
    mine.filter(x=>isPassive(x)&&byId(x.id).sk[1]==='shield'&&(svOf(x.id).p||{}).allyShield)
      .forEach(x=>{
        const mates=mine.filter(v=>v!==x&&v.hp>0);
        if(!mates.length) return;
        const low=mates.reduce((a,b)=>b.hp/b.maxhp<a.hp/a.maxhp?b:a);
        low.shield+=Math.round(low.maxhp*svOf(x.id).p.allyShield);
      });
    // 医者羁绊：生命最低队友护盾
    const mT=tierOf(clsCnt,CLASSES,'医者');""")

# 4) 治疗被动：变体间隔/治疗量/人数/附加护盾
rep("""      if(isPassive(u) && d.sk[1]==='heal') u.healCd=3000;""",
"""      if(isPassive(u) && d.sk[1]==='heal') u.healCd=((svOf(u.id).p||{}).healIv||6000)/2;""")
rep("""        if(u.healCd<=0){ u.healCd=6000; passiveHeal(u,units); }""",
"""        if(u.healCd<=0){ u.healCd=(u.pv&&u.pv.healIv)||6000; passiveHeal(u,units); }""")
rep("""function passiveHeal(u,units){
  const allies=units.filter(v=>v.hp>0&&v.side===u.side&&v!==u);
  if(!allies.length) return;
  const t=allies.reduce((a,b)=>b.hp/b.maxhp<a.hp/a.maxhp?b:a);
  const hd=t.healDownT>0?(1-t.healDownA):1;
  const h=Math.round(u.atk*1.1*byId(u.id).skc*(u.sks||1)*(u.healMul||1)*hd);
  t.hp=Math.min(t.maxhp,t.hp+h);
  vfxAt(t,'ring heal',950); dmgPopup(u,t,'+'+h,'heal');
}""",
"""function passiveHeal(u,units){
  const allies=units.filter(v=>v.hp>0&&v.side===u.side&&v!==u);
  if(!allies.length) return;
  const pv=(u.pv)||{};
  const n=pv.healN||1;
  const sorted=[...allies].sort((a,b)=>a.hp/a.maxhp-b.hp/b.maxhp).slice(0,n);
  sorted.forEach(t=>{
    const hd=t.healDownT>0?(1-t.healDownA):1;
    const h=Math.round(u.atk*(pv.healPct||1.1)*byId(u.id).skc*(u.sks||1)*(u.healMul||1)*hd);
    t.hp=Math.min(t.maxhp,t.hp+h);
    if(pv.healShield) t.shield+=Math.round(t.maxhp*pv.healShield);
    vfxAt(t,'ring heal',950); dmgPopup(u,t,'+'+h,'heal');
  });
}""")

# 5) 每秒 tick：变体回血 + 护盾成长
rep("""        const hd = u.healDownT>0 ? (1-u.healDownA) : 1;
        if(u.regen && u.hp<u.maxhp) u.hp=Math.min(u.maxhp,u.hp+u.regen*hd);""",
"""        const hd = u.healDownT>0 ? (1-u.healDownA) : 1;
        if(u.regen && u.hp<u.maxhp) u.hp=Math.min(u.maxhp,u.hp+u.regen*hd);
        if(u.pRegen && u.hp<u.maxhp) u.hp=Math.min(u.maxhp,u.hp+u.maxhp*u.pRegen*hd);
        if(u.growPct){ u.growT+=1000; if(u.growT>=3000){ u.growT-=3000; u.shield+=Math.round(u.maxhp*u.growPct); } }""")

io.open(p, 'w', encoding='utf8').write(s)
print('passive variants ok')
