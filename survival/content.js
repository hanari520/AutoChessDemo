(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./classic-kits.js'):root.SurvivalClassicKits);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SurvivalContent=api;
})(globalThis,function(kits){
  'use strict';
  const WEAPONS={
    nightblade:{name:'夜岚折刃',kind:'melee',damage:17,rate:850,range:150,color:0xb9a3f5,price:25,asset:'slash',family:'刃舞',effect:'wound',desc:'刃舞 · 命中使敌人易伤 15%，持续 2 秒'},
    frostseal:{name:'冰烛法印',kind:'shot',damage:12,rate:1000,range:450,color:0x99e5ff,price:26,asset:'frost',projectile:'wand',family:'秘术',effect:'slow',desc:'秘术 · 命中减速 40%，持续 1.2 秒'},
    seasonchain:{name:'四季连珠',kind:'shot',damage:10,rate:950,range:460,color:0xb3ed98,price:28,asset:'chain',projectile:'wand',family:'秘术',effect:'chain',desc:'秘术 · 命中后向附近 2 名敌人弹射'},
    prismshield:{name:'棱镜守夜灯',kind:'pulse',damage:5,rate:2000,range:150,color:0x98ebdc,price:27,asset:'barrier',family:'支援',effect:'shield',desc:'支援 · 释放音波时获得 2 点临时护盾'},
    crimsonblade:{name:'绯红旋刃',kind:'melee',damage:16,rate:800,range:135,color:0xff9db2,price:28,asset:'slash',family:'刃舞',effect:'bleed',desc:'刃舞 · 命中附加流血，恢复实际伤害的 4%'},
    memoryshot:{name:'记忆回收杖',kind:'shot',damage:18,rate:1400,range:500,color:0xd0baff,price:26,asset:'memexp',projectile:'bow',family:'秘术',effect:'silence',desc:'秘术 · 命中打断敌人射击 1.2 秒'},
    lotusbell:{name:'花礼铃',kind:'pulse',damage:5,rate:2100,range:145,color:0xffc4dc,price:25,asset:'holy',family:'支援',effect:'heal',desc:'支援 · 释放音波时恢复 1 点生命'},
    rootHammer:{name:'根系战锤',kind:'melee',damage:22,rate:1450,range:145,color:0xc0ee8f,price:27,asset:'quake',family:'刃舞',effect:'stun',desc:'刃舞 · 命中短暂眩晕，首领抵抗控制'}
  };
  const EXTRA_STATS={skillPower:0,skillHaste:0,crit:0,dodge:0,lifesteal:0,statusPower:0,healBoost:0,shieldBoost:0};
  const UPGRADES=[
    {stat:'skillPower',value:15,name:'术式增幅',desc:'专属技能伤害与效果 +15%'},
    {stat:'skillHaste',value:12,name:'技能回转',desc:'专属技能冷却速度 +12%'},
    {stat:'crit',value:5,name:'会心',desc:'武器暴击率 +5% · 暴击伤害 175%'},
    {stat:'dodge',value:4,name:'偏航',desc:'闪避率 +4% · 上限 45%'},
    {stat:'lifesteal',value:2,name:'汲取',desc:'武器实际伤害的 2% 转为生命'},
    {stat:'statusPower',value:15,name:'余波',desc:'减速 / 易伤 / 流血持续时间 +15%'},
    {stat:'healBoost',value:15,name:'盛放',desc:'技能与武器治疗量 +15%'},
    {stat:'shieldBoost',value:15,name:'屏障',desc:'技能与武器护盾量 +15%'}
  ];
  const ITEMS={
    spellbook:{name:'星蚀笔记',stat:'skillPower',value:15,price:23,desc:'专属技能效果 +15%',icon:'sparkles'},
    hourglass:{name:'四季沙漏',stat:'skillHaste',value:12,price:24,desc:'专属技能冷却速度 +12%',icon:'hourglass'},
    lens:{name:'看破透镜',stat:'crit',value:5,price:25,desc:'武器暴击率 +5%',icon:'crosshair'},
    rain:{name:'雨幕披肩',stat:'dodge',value:4,price:23,desc:'闪避率 +4%',icon:'wind'},
    petals:{name:'花礼种子',stat:'healBoost',value:15,price:20,desc:'治疗量 +15%',icon:'flower-2'},
    prism:{name:'守夜棱镜',stat:'shieldBoost',value:15,price:20,desc:'护盾量 +15%',icon:'shield'}
  };
  const FAMILIES={刃舞:{stat:'damage',value:8},秘术:{stat:'skillPower',value:12},远射:{stat:'crit',value:4},支援:{stat:'healBoost',value:12},星环:{stat:'shieldBoost',value:12}};
  const BASE_FAMILIES={blade:'刃舞',wand:'秘术',bow:'远射',mic:'支援',fan:'远射',satellite:'星环'};
  const BONDS={
    守护:{armor:2},狂战:{damage:8},法师:{skillPower:12},咒术:{statusPower:15},游侠:{haste:8},刀客:{crit:4},医者:{healBoost:15},偶像:{harvest:3},歌势:{skillHaste:10},刺客:{dodge:4},
    魔道:{skillPower:10},工造:{shieldBoost:12},星际:{pickup:20},毛茸乐园:{armor:1},森之国:{regen:1},学园:{skillHaste:8},'P-SP':{haste:6},夜幕:{crit:3},深海:{statusPower:12},四禧丸子:{healBoost:12},音律:{harvest:2},花语:{regen:1}
  };
  const STAT_LABELS={damage:'伤害',armor:'护甲',skillPower:'技能效果',skillHaste:'技能回转',haste:'攻速',crit:'暴击',dodge:'闪避',harvest:'收获',healBoost:'治疗',shieldBoost:'护盾',pickup:'拾取',regen:'恢复',statusPower:'余波'};
  const MODES={guard:'guard',guardLink:'guard',teamShield:'guard',heal:'heal',team:'support',support:'support',single:'single',dash:'slash',dashCleave:'slash',cleave:'slash',combo:'slash',burst:'burst',chain:'chain',zone:'zone',field:'field',chaos:'chaos',passive:'passive'};
  function signature(id){
    const k=kits[id];if(!k)return null;
    const mode=MODES[k.mode],passive=k.mode==='passive';
    let desc={guard:'周期生成护盾，并以屏障反击附近敌人',heal:'自动治疗主角，满血时将溢出治疗转为护盾',support:'治疗并提供短时攻速；有区域效果的角色留下音律领域',single:'锁定敌人释放术式',slash:'向目标释放斩影，不改变主角位置',burst:'释放近身冲击并击退敌人',chain:'在多名敌人间连锁命中',zone:'在目标位置留下持续伤害与控制区域',field:'释放广域术式',chaos:'轮转冰冻、易伤与连锁术式',passive:'命中触发专属被动'}[mode];
    if(id==='zhouyi')desc='每 5 次武器命中，破盾读秒使目标易伤 35%';
    if(id==='yuji')desc='每 8 次武器命中蓄积雨幕，自动闪避下一次受伤';
    if(id==='youyi')desc='每 6 次武器命中治疗主角，并在半血以下生成护盾';
    if(k.freeze||k.petrify)desc+=' · 冻结 / 石化控制';
    else if(k.stun)desc+=' · 短暂眩晕';
    if(k.silence||k.manaBurn)desc+=' · 打断敌人射击';
    if(k.shred||k.sunder||k.wound||k.brittle)desc+=' · 易伤';
    if(k.bleed)desc+=' · 流血';
    if(k.lifesteal)desc+=' · 生命汲取';
    if(k.execute)desc+=' · 低血目标斩杀增伤';
    return {id,name:k.name,mode,desc,kit:k,color:parseInt(k.color.replace('#',''),16),cooldown:passive?0:['guard','heal','support'].includes(mode)?8:6.5};
  }
  function family(id){return WEAPONS[id]?.family||BASE_FAMILIES[id];}
  function bonuses(s,roster){
    const stats={},entries=[],counts={};
    const add=(bonus)=>{for(const [stat,value] of Object.entries(bonus))stats[stat]=(stats[stat]||0)+value;};
    for(const w of s.weapons){const tag=family(w.id);if(tag)counts[tag]=(counts[tag]||0)+1;}
    for(const [name,count] of Object.entries(counts)){const def=FAMILIES[name],steps=Math.floor(count/2),bonus={[def.stat]:def.value*Math.max(1,steps)};if(steps)add(bonus);entries.push({name,count,bonus,kind:'weapon',active:steps>0});}
    const members=[s.hero,...s.companions].map(id=>roster.find(h=>h.id===id)).filter(Boolean),tags={};
    for(const h of members)for(const tag of new Set([h.job,h.job2,h.fac,h.fac2].filter(Boolean)))tags[tag]=(tags[tag]||0)+1;
    for(const [name,count] of Object.entries(tags))if(count>=2&&BONDS[name]){const bonus=Object.fromEntries(Object.entries(BONDS[name]).map(([k,v])=>[k,v*Math.floor(count/2)]));add(bonus);entries.push({name,count,bonus,kind:'party',active:true});}
    return {stats,entries};
  }
  function bonusText(bonus){return Object.entries(bonus).map(([k,v])=>`${STAT_LABELS[k]||k} +${v}${['armor','harvest','pickup','regen'].includes(k)?'':'%'}`).join(' · ');}
  return {WEAPONS,ITEMS,EXTRA_STATS,UPGRADES,FAMILIES,BONDS,signature,family,bonuses,bonusText};
});
