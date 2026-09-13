# -*- coding: utf-8 -*-
# v3 大改版补丁：46人名单 / 12阵营 / 多多式经济(25回合) / 多多式布局 / 技能克制
# 一次读入 -> 顺序替换 -> 一次写回（不中途重读文件）
import re, io

P = r'F:\demo\autochess\index.html'
s = io.open(P, encoding='utf8').read()
orig = s
n_ok = 0

def rep(old, new, cnt=1):
    global s, n_ok
    assert s.count(old) >= 1, 'NOT FOUND: ' + old[:80]
    s = s.replace(old, new, cnt)
    n_ok += 1

# ---------- 1) UNITS 全表替换（46 人） ----------
new_units = r'''/* ================= 名单：46 人（VirtuaReal 38 + P-SP 8，按 2026-09-12 修改建议重编） =================
   fac 阵营(12) / job 职业(10) / sk [技能名, 原型, 'passive'?] */
const UNITS = [
  // ---------- 1 费（8 人 × 45 张） ----------
  {id:'ein',    name:'艾因',        cost:1, fac:'魔道',    job:'守护', hp:84,  atk:5,  rng:1, spd:0.8, sk:['魔导屏障','shield','passive']},
  {id:'kouichi',name:'光一',        cost:1, fac:'工造',    job:'狂战', hp:58,  atk:10, rng:1, spd:1.1, sk:['战斗续行','dash']},
  {id:'yua',    name:'悠亚',        cost:1, fac:'星际',    job:'法师', hp:44,  atk:13, rng:3, spd:0.7, sk:['外星光线','fireball']},
  {id:'goutan', name:'勾檀',        cost:1, fac:'毛茸乐园', job:'守护', hp:80,  atk:6,  rng:1, spd:0.8, sk:['忠诚守护','shield','passive']},
  {id:'yujiu',  name:'羽啾',        cost:1, fac:'毛茸乐园', job:'游侠', hp:40,  atk:9,  rng:4, spd:1.3, sk:['羽刃连射','rapid']},
  {id:'songlv', name:'小松绿',      cost:1, fac:'森之国',  job:'狂战', hp:56,  atk:10, rng:1, spd:1.1, sk:['松塔重锤','slam']},
  {id:'likou',  name:'莉蔻',        cost:1, fac:'学园',    job:'医者', hp:44,  atk:10, rng:3, spd:0.9, sk:['急救笔记','heal','passive']},
  {id:'agari',  name:'东爱璃',      cost:1, fac:'P-SP',    job:'偶像', hp:50,  atk:9,  rng:3, spd:0.9, sk:['爱的应援','aheal']},
  // ---------- 2 费（10 人 × 30 张） ----------
  {id:'suiji',  name:'岁己Sui',     cost:2, fac:'森之国',  job:'歌势', hp:46,  atk:9,  rng:3, spd:0.9, sk:['晨间报时','heal','passive']},
  {id:'kanban', name:'栞栞',        cost:2, fac:'毛茸乐园', job:'守护', hp:90,  atk:6,  rng:1, spd:0.8, sk:['海獭坚壳','shield','passive']},
  {id:'zhouyi', name:'轴伊',        cost:2, fac:'夜幕',    job:'刀客', hp:55,  atk:11, rng:1, spd:1.1, sk:['破盾之刃','shieldbane','passive']},
  {id:'yuji',   name:'雨纪',        cost:2, fac:'深海',    job:'游侠', hp:46,  atk:10, rng:4, spd:1.2, sk:['雨幕庇护','block','passive']},
  {id:'tiandou',name:'恬豆',        cost:2, fac:'四禧丸子', job:'歌势', hp:54,  atk:12, rng:3, spd:0.9, sk:['甜心合唱','aheal']},
  {id:'aza',    name:'阿萨Aza',     cost:2, fac:'音律',    job:'歌势', hp:50,  atk:9,  rng:3, spd:0.9, sk:['节拍回响','aheal']},
  {id:'pako',   name:'帕可',        cost:2, fac:'学园',    job:'医者', hp:52,  atk:10, rng:3, spd:0.9, sk:['活力应援','aheal']},
  {id:'zhijin', name:'枝堇',        cost:2, fac:'花语',    job:'刺客', hp:52,  atk:11, rng:1, spd:1.2, sk:['紫影突刺','dash']},
  {id:'sishi',  name:'四时小路',    cost:2, fac:'音律',    job:'游侠', hp:46,  atk:10, rng:4, spd:1.2, sk:['四季轮舞','volley']},
  {id:'sumi',   name:'礼墨',        cost:2, fac:'P-SP',    job:'守护', hp:88,  atk:6,  rng:1, spd:0.8, sk:['墨盾结界','shield','passive']},
  // ---------- 3 费（10 人 × 25 张） ----------
  {id:'yukie',  name:'桃濑雪绘',    cost:3, fac:'工造',    job:'刀客', hp:62,  atk:10, rng:1, spd:1.0, sk:['连段上勾拳','cleave']},
  {id:'miting', name:'米汀',        cost:3, fac:'魔道',    job:'咒术', hp:46,  atk:14, rng:3, spd:0.7, sk:['秘术冲击','fireball']},
  {id:'xuezhu', name:'雪烛',        cost:3, fac:'夜幕',    job:'法师', hp:44,  atk:14, rng:3, spd:0.7, sk:['雪烛幽光','frost']},
  {id:'zeyin',  name:'泽音',        cost:3, fac:'深海',    job:'医者', hp:52,  atk:12, rng:3, spd:0.9, sk:['泽国歌声','aheal']},
  {id:'sanli',  name:'三理',        cost:3, fac:'音律',    job:'偶像', hp:48,  atk:17, rng:3, spd:0.7, sk:['三重奏爆裂','fireball']},
  {id:'diansu', name:'点酥',        cost:3, fac:'魔道',    job:'咒术', hp:48,  atk:16, rng:3, spd:0.7, sk:['酥骨咒','curse']},
  {id:'lianshiye',name:'恋诗夜',    cost:3, fac:'夜幕',    job:'法师', hp:44,  atk:15, rng:3, spd:0.7, sk:['夜之挽歌','fireball']},
  {id:'huize',  name:'灰泽满',      cost:3, fac:'深海',    job:'咒术', hp:48,  atk:16, rng:3, spd:0.7, sk:['潮汐诅咒','curse']},
  {id:'shengge',name:'笙歌',        cost:3, fac:'P-SP',    job:'歌势', hp:48,  atk:12, rng:3, spd:0.9, sk:['笙歌不息','aheal']},
  {id:'shadow', name:'李豆沙',      cost:3, fac:'P-SP',    job:'刺客', hp:50,  atk:13, rng:1, spd:1.3, sk:['影袭','dash']},
  // ---------- 4 费（10 人 × 15 张） ----------
  {id:'miyue',  name:'弥月',        cost:4, fac:'夜幕',    job:'刀客', hp:58,  atk:11, rng:1, spd:1.1, sk:['月影斩','dash']},
  {id:'huali',  name:'花礼',        cost:4, fac:'花语',    job:'偶像', hp:50,  atk:10, rng:3, spd:0.9, sk:['花之祝福','heal','passive']},
  {id:'youyu',  name:'柚雨',        cost:4, fac:'深海',    job:'刀客', hp:62,  atk:13, rng:1, spd:1.1, sk:['柚叶风斩','cleave']},
  {id:'quanrong',name:'犬绒',       cost:4, fac:'毛茸乐园', job:'守护', hp:100, atk:8,  rng:1, spd:0.8, sk:['绒毛硬壳','shield','passive']},
  {id:'ruiya',  name:'瑞娅',        cost:4, fac:'星际',    job:'法师', hp:46,  atk:15, rng:3, spd:0.7, sk:['时空禁锢','frost']},
  {id:'mumu',   name:'沐霂',        cost:4, fac:'四禧丸子', job:'偶像', hp:54,  atk:12, rng:3, spd:0.9, sk:['霂雨润物','heal','passive']},
  {id:'kroya',  name:'克罗雅',      cost:4, fac:'学园',    job:'法师', hp:46,  atk:15, rng:3, spd:0.7, sk:['禁咒裂界','fireball']},
  {id:'shiliu', name:'十六萤',      cost:4, fac:'森之国',  job:'刺客', hp:50,  atk:13, rng:1, spd:1.2, sk:['破茧之刺','break']},
  {id:'seki',   name:'星汐',        cost:4, fac:'P-SP',    job:'咒术', hp:46,  atk:15, rng:3, spd:0.7, sk:['星蚀','burn']},
  {id:'haruka', name:'白神遥',      cost:4, fac:'P-SP',    job:'刀客', hp:58,  atk:12, rng:1, spd:1.1, sk:['白刃疾风','cleave']},
  // ---------- 5 费（8 人 × 10 张） ----------
  {id:'nana7mi',name:'七海Nana7mi', cost:5, fac:'深海',    job:'刀客', hp:60,  atk:9,  rng:1, spd:1.0, sk:['七海旋流','cleave']},
  {id:'liAn',   name:'梨安',        cost:5, fac:'四禧丸子', job:'法师', hp:50,  atk:16, rng:3, spd:0.7, sk:['安魂曲','massfreeze']},
  {id:'youyi',  name:'又一',        cost:5, fac:'四禧丸子', job:'刺客', hp:60,  atk:13, rng:1, spd:1.1, sk:['一心同体','drain','passive']},
  {id:'azi',    name:'阿梓',        cost:5, fac:'工造',    job:'歌势', hp:55,  atk:14, rng:3, spd:1.0, sk:['梓音震魂','massstun']},
  {id:'taodai', name:'桃代',        cost:5, fac:'花语',    job:'守护', hp:98,  atk:8,  rng:1, spd:0.8, sk:['桃色结界','shield','passive']},
  {id:'miki',   name:'弥希',        cost:5, fac:'星际',    job:'医者', hp:48,  atk:14, rng:3, spd:0.9, sk:['星海庇护','heal','passive']},
  {id:'rei',    name:'病院坂灵',    cost:5, fac:'P-SP',    job:'法师', hp:47,  atk:15, rng:3, spd:0.7, sk:['灵界之门','massstun']},
  {id:'rinco',  name:'秋凛子',      cost:5, fac:'P-SP',    job:'狂战', hp:62,  atk:12, rng:1, spd:1.1, sk:['凛冬狂潮','cleave']},
];
'''
s = re.sub(r'/\* ================= 名单.*?\n\];\n', new_units, s, count=1, flags=re.S)
n_ok += 1

# ---------- 2) 攻击形式集合 ----------
rep("""/* ===== 攻击形式：近战(me)/远程(rg) × 物理(phys)/法术(magic) =====
   职业默认：刀客/守护/狂战/刺客=近战物理，游侠=远程物理，法师/咒术/歌势/医者/偶像=远程法术
   例外：千幽=近战法师，命依=近战咒术 */
const MELEE_IDS = new Set(['ein','nana7mi','kouichi','yagi','yukie','chiharu','chiyu','goutan','jiji','laien','miyue','zhouyi','kanban','lizhi','qiyu','qingyi','guijan','aming','taodai','nimu','axw','mingyi','youyu','nengneng','quanrong','hesen','gongyuan','nuoyi','youyi','boushoku']);
const PHYS_IDS = new Set(['ein','nana7mi','kouichi','yagi','yukie','chiharu','goutan','jiji','lizhi','miyue','zhouyi','kanban','yuji','taoxing','qiyu','qingyi','guijan','aming','taodai','nimu','axw','youyu','nengneng','quanrong','xiaoke','hesen','gongyuan','nuoyi','youyi','boushoku','xiwei','mumao','mizuka']);""",
"""/* ===== 攻击形式：近战(me)/远程(rg) × 物理(phys)/法术(magic) =====
   职业默认：刀客/守护/狂战/刺客=近战物理，游侠=远程物理，法师/咒术/歌势/医者/偶像=远程法术 */
const MELEE_IDS = new Set(['ein','kouichi','yukie','goutan','kanban','zhouyi','miyue','taodai','youyu','quanrong','nana7mi','youyi','zhijin','songlv','shiliu','shadow','sumi','haruka','rinco']);
const PHYS_IDS = new Set(['ein','kouichi','yukie','goutan','kanban','zhouyi','miyue','taodai','youyu','quanrong','nana7mi','youyi','zhijin','songlv','shiliu','shadow','sumi','haruka','rinco','yuji','yujiu','sishi']);""")

# ---------- 3) FACTIONS 12 阵营 ----------
rep("""const FACTIONS = {
  '深海':    {need:[2,4], desc:['全队每秒回复 1.5 生命','每秒回复 3 生命，深海棋子生命 +15%']},
  '百鬼夜行': {need:[3,5], desc:['敌方全体攻击 -10%','敌方攻击 -18%，百鬼棋子攻击 +15%']},
  '天启':    {need:[2,4], desc:['开战全队护盾 15% 最大生命','护盾 30%，每秒回复 1 生命']},
  '星际':    {need:[2,3], desc:['法师与游侠攻击 +15%','法师与游侠攻击 +25%，攻速 +10%']},
  '毛茸乐园': {need:[2,4], desc:['全队生命 +10%','全队生命 +20%，每秒回复 1.5 生命']},
  '音律':    {need:[2,3], desc:['歌势与医者治疗效果 +25%','治疗效果 +50%']},
  '四禧丸子': {need:[4],   desc:['全员合体：全队攻击 +20%，每秒回复 2，团员额外 +15% 攻击']},
  '学园':    {need:[2,4], desc:['全队攻速 +12%','攻速 +20%，学园棋子攻击 +15%']},
  '夜幕':    {need:[3,5], desc:['夜幕棋子攻击 +18%','夜幕棋子攻击 +30%，全队受到伤害 -10%']},
  '花语':    {need:[2,3], desc:['全队生命 +8%，每秒回复 1 生命','全队生命 +15%，每秒回复 2 生命']},
  '魔道':    {need:[2,4], desc:['技能伤害 +20%','技能伤害 +40%']},
  '森之国':  {need:[2,4], desc:['全队生命 +12%','全队生命 +22%，每秒回复 1 生命']},
  '工造':    {need:[3,5], desc:['全队攻速 +10%，获得 10% 护盾','攻速 +18%，护盾 20%，工造棋子攻击 +15%']},
};""",
"""const FACTIONS = {
  '深海':    {need:[2,4], desc:['全队每秒回复 1.5 生命','每秒回复 3 生命，深海棋子生命 +15%']},
  '星际':    {need:[2,3], desc:['法师与游侠攻击 +15%','法师与游侠攻击 +25%，攻速 +10%']},
  '毛茸乐园': {need:[2,3], desc:['全队生命 +10%','全队生命 +20%，每秒回复 1.5 生命']},
  '音律':    {need:[2,3], desc:['歌势与医者治疗效果 +25%','治疗效果 +50%']},
  '四禧丸子': {need:[3,4], desc:['全队攻击 +12%，每秒回复 1.5 生命','全员合体：全队攻击 +20%，团员额外 +15% 攻击']},
  '学园':    {need:[2,3], desc:['全队攻速 +12%','攻速 +20%，学园棋子攻击 +15%']},
  '夜幕':    {need:[2,3], desc:['夜幕棋子攻击 +18%','夜幕棋子攻击 +30%，全队受到伤害 -10%']},
  '花语':    {need:[2,3], desc:['全队生命 +8%，每秒回复 1 生命','全队生命 +15%，每秒回复 2 生命']},
  '魔道':    {need:[2,3], desc:['技能伤害 +20%','技能伤害 +40%']},
  '森之国':  {need:[2,3], desc:['全队生命 +12%','全队生命 +22%，每秒回复 1 生命']},
  '工造':    {need:[2,3], desc:['全队攻速 +10%，获得 10% 护盾','攻速 +18%，护盾 20%，工造棋子攻击 +15%']},
  'P-SP':    {need:[3,6], desc:['P-SP 棋子攻击 +15%，全队每秒回复 1 生命','P-SP 棋子攻击 +30%，全队每秒回复 2 生命']},
};""")

# ---------- 4) 狂战羁绊档位（全游戏仅 3 名狂战） ----------
rep("'狂战': {need:[2,4], desc:['狂战吸血 15%','狂战吸血 30%']},",
    "'狂战': {need:[2,3], desc:['狂战吸血 15%','狂战吸血 30%']},")

# ---------- 5) SKILL_VAR 全表替换（46 条） ----------
new_sv = r'''const SKILL_VAR = {
  /* —— 1 费 —— */
  ein:    {p:{shieldPct:.20,pRegen:.008}, txt:'并每秒回复 0.8% 最大生命'},
  kouichi:{fx:[['selfheal',.40]], txt:'并治疗自身相当于伤害 40% 的生命'},
  yua:    {tgt:'low'},
  goutan: {p:{shieldPct:.20,allyShield:.12}, txt:'并为生命比例最低的队友附加 12% 护盾'},
  yujiu:  {rapidN:4, fx:[['atkup',.15]], txt:'强化接下来 4 次普攻，并获得 15% 攻击力（本场战斗）'},
  songlv: {fx:[['selfheal',.35]], txt:'并治疗自身相当于伤害 35% 的生命'},
  likou:  {p:{healPct:1.10,healIv:5000,healN:2}, txt:'每 5 秒同时治疗生命最低的两名队友'},
  agari:  {fx:[['healshield',.04]], txt:'并使全体获得 4% 最大生命护盾'},
  /* —— 2 费 —— */
  suiji:  {p:{healPct:1.25,healIv:5000}},
  kanban: {p:{shieldPct:.25,blockCt:.15,blockDmg:.5}, txt:'并额外获得 15% 概率格挡（减免 50%）'},
  zhouyi: {p:{sb:.80}},
  yuji:   {p:{blockCt:.25,blockDmg:.5}},
  tiandou:{fx:[['healshield',.05]], txt:'并使全体获得 5% 最大生命护盾'},
  aza:    {fx:[['allatkup',.10]], txt:'并提升全体 10% 攻击（本场战斗）'},
  pako:   {fx:[['heallow',.40]], txt:'并为生命比例最低的队友额外回复 40% 攻击生命'},
  zhijin: {tgt:'low', pow:1.05, fx:[['vamp',.15]], txt:'优先攻击残血，并永久获得 15% 吸血'},
  sishi:  {pow:1.05, fx:[['slow',.25,2]], txt:'并使命中者减速 25%，持续 2 秒'},
  sumi:   {p:{shieldPct:.25,thorns:.05}, txt:'受到攻击时反弹 5% 最大生命的伤害'},
  /* —— 3 费 —— */
  yukie:  {pow:1.10, fx:[['dot',.015]], txt:'并附加每 3 秒 1.5% 最大生命的毒伤'},
  miting: {fx:[['splash',.50]], txt:'并对距其第二近的敌人造成 50% 溅射'},
  xuezhu: {pow:1.20, fx:[['freeze',2.0]], txt:'冻结延长至 2 秒'},
  zeyin:  {fx:[['foehealdown',.20,3]], txt:'并使所有敌人受到的治疗降低 20%，持续 3 秒'},
  sanli:  {pow:1.10, fx:[['splash',.40]], txt:'并对距其第二近的敌人造成 40% 溅射'},
  diansu: {fx:[['weaken',.40,4]], txt:'攻降效果提升至 40%'},
  lianshiye:{pow:1.10, fx:[['splash',.45]], txt:'并对距其第二近的敌人造成 45% 溅射'},
  huize:  {fx:[['healdown',.35,3],['dot',.015]], txt:'并使其治疗降低 35%、附加毒伤，持续 3 秒'},
  shengge:{fx:[['healshield',.06]], txt:'并使全体获得 6% 最大生命护盾'},
  shadow: {pow:1.15, fx:[['stun',.4]], txt:'并眩晕目标 0.4 秒'},
  /* —— 4 费 —— */
  miyue:  {pow:1.15, fx:[['dot',.02]], txt:'并附加每 3 秒 2% 最大生命的毒伤'},
  huali:  {p:{healPct:1.30,healIv:6000,healShield:.08}, txt:'并为目标附加 8% 最大生命护盾'},
  youyu:  {pow:1.10, fx:[['dot',.02]], txt:'并附加每 3 秒 2% 最大生命的毒伤'},
  quanrong:{p:{shieldPct:.36,blockCt:.15,blockDmg:.5}, txt:'并额外获得 15% 概率格挡（减免 50%）'},
  ruiya:  {fx:[['freeze',2.2]], txt:'冻结延长至 2.2 秒'},
  mumu:   {p:{healPct:1.25,healIv:5500,healN:2}, txt:'每 5.5 秒同时治疗生命最低的两名队友'},
  kroya:  {tgt:'hi', pow:1.10, fx:[['splash',.35]], txt:'优先攻击高攻，并造成 35% 溅射'},
  shiliu: {pow:1.05, fx:[['stun',.5]], txt:'并眩晕目标 0.5 秒'},
  seki:   {pow:1.10, fx:[['burn',.45]], txt:'烧毁目标 45% 法力'},
  haruka: {pow:1.10, fx:[['weaken',.20,3]], txt:'并削减命中者 20% 攻击，持续 3 秒'},
  /* —— 5 费 —— */
  nana7mi:{pow:1.10, fx:[['slow',.30,2]], txt:'并使命中者减速 30%，持续 2 秒'},
  liAn:   {fx:[['freeze',1.5]], txt:'冻结延长至 1.5 秒'},
  youyi:  {p:{vampPct:.30,atkDot:.010}, txt:'攻击附带每 3 秒 1% 最大生命的毒伤'},
  azi:    {pow:1.10, fx:[['stun',1.5]], txt:'眩晕延长至 1.5 秒'},
  taodai: {p:{shieldPct:.38}},
  miki:   {p:{healPct:1.35,healIv:5000,healN:2,healShield:.06}, txt:'每 5 秒同时治疗两名队友，并附加 6% 护盾'},
  rei:    {pow:1.05, fx:[['stun',1.4]], txt:'眩晕延长至 1.4 秒'},
  rinco:  {pow:1.20, fx:[['stun',.5]], txt:'并眩晕命中者 0.5 秒'},
};'''
s = re.sub(r'const SKILL_VAR = \{.*?\n\};', new_sv, s, count=1, flags=re.S)
n_ok += 1

# ---------- 6) 常量：25 回合 ----------
rep("const SHOP_SIZE=5, MAX_ROUNDS=20, BENCH=8, MAX_EQUIP=2;",
    "const SHOP_SIZE=5, MAX_ROUNDS=25, BENCH=8, MAX_EQUIP=2;")

# ---------- 7) XP 表（多多式：每回合自动+2，4金买4经验） ----------
rep("""/* 升级人口经验表：每回合结束自动 +2 经验，4 金币可购买 4 经验，满值自动升级并重新累计 */
const XP_NEED = {3:4, 4:6, 5:9, 6:13, 7:18, 8:24, 9:30};""",
"""/* 升级人口经验表（多多自走棋式）：每回合自动 +2 经验，4 金币固定买 4 经验 */
const XP_NEED = {2:2, 3:4, 4:6, 5:10, 6:16, 7:24, 8:32, 9:40};""")

# ---------- 8) 刷新概率表（按人口等级，多多式） ----------
rep("""function drawFromPool(){ // 按等级概率决定费用档，再从卡池余量中抽取
  const lv=S.lvl;
  const odds = lv<=3?[.7,.3,0,0,0]
    : lv<=5?[.5,.35,.15,0,0]
    : lv<=6?[.3,.35,.2,.1,.05]
    : lv<=7?[.2,.3,.25,.15,.1]
    : [.15,.25,.3,.2,.1];""",
"""/* 各人口等级刷新概率（1~5 费，%）：等级越高越容易刷出高费棋子（多多自走棋式） */
const SHOP_ODDS = {1:[100,0,0,0,0], 2:[70,30,0,0,0], 3:[60,30,10,0,0], 4:[50,35,15,0,0],
  5:[40,35,20,5,0], 6:[33,30,25,10,2], 7:[30,30,25,13,2], 8:[24,30,28,15,3],
  9:[22,28,28,17,5], 10:[19,25,27,20,9]};
function drawFromPool(){ // 按等级概率决定费用档，再从卡池余量中抽取
  const lv=S.lvl;
  const odds = (SHOP_ODDS[lv]||SHOP_ODDS[10]).map(x=>x/100);""")

# ---------- 9) 战斗羁绊结算：新 12 阵营 ----------
rep("""    // —— 阵营档位 ——
    let t=tierOf(facCnt,FACTIONS,'深海');
    if(t>=1) regen+=1.5; if(t>=2){ regen+=1.5; facHp['深海']=0.15; }
    t=tierOf(facCnt,FACTIONS,'百鬼夜行');
    if(t>=1) foeAtkCut+=0.10; if(t>=2){ foeAtkCut+=0.08; facAtk['百鬼夜行']=0.15; }
    t=tierOf(facCnt,FACTIONS,'天启');
    if(t>=1) shieldPct+=0.15; if(t>=2){ shieldPct+=0.15; regen+=1; }
    t=tierOf(facCnt,FACTIONS,'星际');
    if(t>=1){ addAtkJob('法师',0.15); addAtkJob('游侠',0.15); }
    if(t>=2){ addAtkJob('法师',0.10); addAtkJob('游侠',0.10); spdMul+=0.10; }
    t=tierOf(facCnt,FACTIONS,'毛茸乐园');
    if(t>=1) hpMul*=1.10; if(t>=2){ hpMul*=1.10; regen+=1.5; }
    t=tierOf(facCnt,FACTIONS,'音律');
    if(t>=1) healMul+=0.25; if(t>=2) healMul+=0.25;
    t=tierOf(facCnt,FACTIONS,'四禧丸子');
    if(t>=1){ atkMul+=0.20; regen+=2; facAtk['四禧丸子']=0.15; }
    t=tierOf(facCnt,FACTIONS,'学园');
    if(t>=1) spdMul+=0.12; if(t>=2){ spdMul+=0.08; facAtk['学园']=0.15; }
    t=tierOf(facCnt,FACTIONS,'夜幕');
    if(t>=1) facAtk['夜幕']=0.18; if(t>=2){ facAtk['夜幕']=0.30; dmgReduce+=0.10; }
    t=tierOf(facCnt,FACTIONS,'花语');
    if(t>=1){ hpMul*=1.08; regen+=1; } if(t>=2){ hpMul*=1.07; regen+=1; }
    t=tierOf(facCnt,FACTIONS,'魔道');
    if(t>=1) skMul+=0.2; if(t>=2) skMul+=0.2;
    t=tierOf(facCnt,FACTIONS,'森之国');
    if(t>=1) hpMul*=1.12; if(t>=2){ hpMul*=1.10; regen+=1; }
    t=tierOf(facCnt,FACTIONS,'工造');
    if(t>=1){ spdMul+=0.10; shieldPct+=0.10; } if(t>=2){ spdMul+=0.08; shieldPct+=0.10; facAtk['工造']=0.15; }""",
"""    // —— 阵营档位 ——
    let t=tierOf(facCnt,FACTIONS,'深海');
    if(t>=1) regen+=1.5; if(t>=2){ regen+=1.5; facHp['深海']=0.15; }
    t=tierOf(facCnt,FACTIONS,'星际');
    if(t>=1){ addAtkJob('法师',0.15); addAtkJob('游侠',0.15); }
    if(t>=2){ addAtkJob('法师',0.10); addAtkJob('游侠',0.10); spdMul+=0.10; }
    t=tierOf(facCnt,FACTIONS,'毛茸乐园');
    if(t>=1) hpMul*=1.10; if(t>=2){ hpMul*=1.10; regen+=1.5; }
    t=tierOf(facCnt,FACTIONS,'音律');
    if(t>=1) healMul+=0.25; if(t>=2) healMul+=0.25;
    t=tierOf(facCnt,FACTIONS,'四禧丸子');
    if(t>=1){ atkMul+=0.12; regen+=1.5; }
    if(t>=2){ atkMul+=0.08; regen+=0.5; facAtk['四禧丸子']=0.15; }
    t=tierOf(facCnt,FACTIONS,'学园');
    if(t>=1) spdMul+=0.12; if(t>=2){ spdMul+=0.08; facAtk['学园']=0.15; }
    t=tierOf(facCnt,FACTIONS,'夜幕');
    if(t>=1) facAtk['夜幕']=0.18; if(t>=2){ facAtk['夜幕']=0.30; dmgReduce+=0.10; }
    t=tierOf(facCnt,FACTIONS,'花语');
    if(t>=1){ hpMul*=1.08; regen+=1; } if(t>=2){ hpMul*=1.07; regen+=1; }
    t=tierOf(facCnt,FACTIONS,'魔道');
    if(t>=1) skMul+=0.2; if(t>=2) skMul+=0.2;
    t=tierOf(facCnt,FACTIONS,'森之国');
    if(t>=1) hpMul*=1.12; if(t>=2){ hpMul*=1.10; regen+=1; }
    t=tierOf(facCnt,FACTIONS,'工造');
    if(t>=1){ spdMul+=0.10; shieldPct+=0.10; } if(t>=2){ spdMul+=0.08; shieldPct+=0.10; facAtk['工造']=0.15; }
    t=tierOf(facCnt,FACTIONS,'P-SP');
    if(t>=1){ facAtk['P-SP']=0.15; regen+=1; } if(t>=2){ facAtk['P-SP']=0.30; regen+=1; }""")

rep("    let hpMul=1, atkMul=1, spdMul=1, regen=0, skMul=1, healMul=1, shieldPct=0, dmgReduce=0, foeAtkCut=0, poisonPow=0.02;",
    "    let hpMul=1, atkMul=1, spdMul=1, regen=0, skMul=1, healMul=1, shieldPct=0, dmgReduce=0, poisonPow=0.02;")

rep("""    // 敌方减攻（百鬼夜行）
    if(foeAtkCut>0) units.filter(u=>u.side!==side).forEach(u=>u.atk=Math.round(u.atk*(1-foeAtkCut)));
""", "")

# ---------- 10) 经济结算（多多式：5金+利息+连胜/连败阶梯） ----------
rep("""  if(won){
    S.streak++; S.lossStreak=0; S.stats.wins++;
    S.stats.maxStreak=Math.max(S.stats.maxStreak,S.streak);
    log(`　🏆 战斗胜利（当前连胜 ${S.streak}）`);
    addGold(2,'胜利奖金');
    if(S.round===1) addGold(2,'首胜奖励');
    if(S.streak>1) addGold(Math.min(S.streak,3),'连胜奖励');
    if(S.round>=MAX_ROUNDS && !S.endless){ round20Victory(); return; }
  } else {
    S.stats.losses++; S.lossStreak=(S.lossStreak||0)+1; S.streak=0;
    const dmg = 1 + Math.floor(Math.max(0,survivors-1)/2);
    S.hp -= dmg; S.stats.dmgTaken+=dmg;
    log(`　💔 战斗失败：敌方存活 ${survivors} 人，扣 ${dmg} 血（剩余 ${S.hp-dmg<0?0:S.hp-dmg}）`);
    if(S.hp<=0){ S.hp=0; gameOver(false); return; }
  }
  addGold(7,'基础收入');
  addGold(Math.min(5,Math.floor(S.gold/10)),'存款利息（每10金+1，上限5）');
  S.round++;
  S.phase='prep';
  if(!shopOpen){ shopOpen=true; applyShop(); }   // 战斗结束自动展开商店
  if(S.lvl<10){ S.xp+=3; checkLevel(); }   // 每回合结束自动积累 3 点升级经验""",
"""  if(won){
    S.streak++; S.lossStreak=0; S.stats.wins++;
    S.stats.maxStreak=Math.max(S.stats.maxStreak,S.streak);
    log(`　🏆 战斗胜利（当前连胜 ${S.streak}）`);
    const wb = S.streak>=5?3 : S.streak>=3?2 : S.streak>=2?1 : 0;   // 连胜奖励阶梯
    if(wb) addGold(wb,`连胜奖励（${S.streak} 连胜）`);
    if(S.round>=MAX_ROUNDS && !S.endless){ stageVictory(); return; }
  } else {
    S.stats.losses++; S.lossStreak=(S.lossStreak||0)+1; S.streak=0;
    const dmg = 1 + Math.floor(Math.max(0,survivors-1)/2);
    S.hp -= dmg; S.stats.dmgTaken+=dmg;
    log(`　💔 战斗失败：敌方存活 ${survivors} 人，扣 ${dmg} 血（剩余 ${S.hp-dmg<0?0:S.hp-dmg}）`);
    if(S.hp<=0){ S.hp=0; gameOver(false); return; }
    const lb = S.lossStreak>=5?3 : S.lossStreak>=3?2 : S.lossStreak>=2?1 : 0; // 连败补偿阶梯
    if(lb) addGold(lb,`连败补偿（${S.lossStreak} 连败）`);
  }
  addGold(5,'基础收入');
  addGold(Math.min(5,Math.floor(S.gold/10)),'存款利息（每10金+1，上限5）');
  S.round++;
  S.phase='prep';
  if(!shopOpen){ shopOpen=true; applyShop(); }   // 战斗结束自动展开商店
  if(S.lvl<10){ S.xp+=2; checkLevel(); }   // 每回合结束自动积累 2 点升级经验（多多式）""")

# ---------- 11) 买经验按钮：固定 4 金 4 经验 ----------
rep("""$('lvlBtn').onclick=()=>{ if(S.phase!=='prep'||S.lvl>=10)return;
  const need=xpNeed(S.lvl);
  const cost=Math.min(4, need-S.xp);
  if(S.gold<cost){ log('⚠ 金币不足，无法购买升级经验'); return; }
  S.gold-=cost; S.stats.goldSpent+=cost; S.xp+=cost;
  checkLevel(); renderAll(); };""",
"""$('lvlBtn').onclick=()=>{ if(S.phase!=='prep'||S.lvl>=10)return;   // 多多式：固定 4 金买 4 经验
  if(S.gold<4){ log('⚠ 金币不足，无法购买升级经验'); return; }
  S.gold-=4; S.stats.goldSpent+=4; S.xp+=4;
  checkLevel(); renderAll(); };""")

# ---------- 12) renderTop：等级/经验条 + 买经验文案 ----------
rep("""  const need=xpNeed(S.lvl);
  const cost=Math.min(4, need-S.xp);
  $('lvlBtn').textContent = S.lvl>=10 ? '人口已满' : `升级人口 (F) 经验${S.xp}/${need} -${cost}💰`;
  $('lvlBtn').disabled = S.lvl>=10 || S.gold<cost;""",
"""  const need=xpNeed(S.lvl);
  $('lvlNum').textContent=S.lvl;
  $('xpText').textContent = S.lvl>=10 ? '人口已满' : `经验 ${S.xp}/${need}`;
  $('xpFill').style.width = S.lvl>=10 ? '100%' : Math.min(100,S.xp/need*100)+'%';
  $('lvlBtn').textContent = S.lvl>=10 ? '人口已满' : '买经验 (F) +4经验 -4💰';
  $('lvlBtn').disabled = S.lvl>=10 || S.gold<4;""")

# ---------- 13) 敌方成长曲线（25 回合） ----------
rep("""  const cap = r<4?1 : r<7?2 : r<11?3 : r<15?4 : 5;   // 敌方费用上限随回合解锁""",
"""  const cap = r<4?1 : r<7?2 : r<11?3 : r<16?4 : 5;   // 敌方费用上限随回合解锁""")
rep("""  const mul = 0.88 * (1 + Math.min(r-1,12)*0.028) * dyn - earlyDisc;
  const bossMult = r<8?1.1 : r<12?1.25 : r<16?1.28 : 1.12;         // Boss 强度随回合提升（前期大幅减负）
  const bossStar = r<8?1:2;                           // 前期 Boss 为 1★
  const bossGuards = r<8?1:2;                         // 前期 Boss 护卫更少""",
"""  const mul = 0.88 * (1 + Math.min(r-1,20)*0.028) * dyn - earlyDisc;
  const bossMult = r<8?1.1 : r<12?1.25 : r<16?1.32 : r<21?1.40 : r<25?1.45 : 1.55; // Boss 强度随回合提升
  const bossStar = r<8?1:2;                           // 前期 Boss 为 1★
  const bossGuards = r<8?1 : r<20?2 : 3;              // 后期 Boss 护卫更多""")
rep("""    const total = Math.max(3, Math.min(1 + Math.ceil(r/2), 8) - (r<8?1:0)); // 前期 Boss 战人数更少""",
"""    const total = Math.max(3, Math.min(1 + Math.ceil(r/2), 9) - (r<8?1:0)); // 前期 Boss 战人数更少""")
rep("""    const total = Math.min(1 + Math.ceil(r/2), 7);""",
"""    const total = Math.min(1 + Math.ceil(r/2), 8);""")

# ---------- 14) 通关函数更名 + 无尽文案 ----------
rep("function round20Victory(){", "function stageVictory(){")
rep("  log('♾ 进入无限模式：从第 21 回合开始，敌方将无限变强！');",
    "  log('♾ 进入无限模式：从第 26 回合开始，敌方将无限变强！');")

# ---------- 15) 顶栏 / 主区 / 商店栏 布局重排（多多式） ----------
rep("""<div id="topbar">
  <span class="tag">回合 <b id="round">1</b><span id="roundMax">/20</span></span>
  <span class="tag">❤️ <b id="hp">32</b></span>
  <span class="tag" title="利息：每10金+1，上限5。下回合利息预览见绿色数字">💰 <b id="gold">10</b><span id="interest" style="font-size:11px;color:#8dff9a;margin-left:3px"></span></span>
  <span class="tag">人口 <b id="pop">0</b>/<b id="popMax">3</b></span>
  <span class="tag">连胜 <b id="streak">0</b></span>
  <div class="fight-btn-row">
    <button class="btn" id="histBtn">📜 战绩</button>
    <button class="btn" id="bookBtn">📖 图鉴</button>
    <button class="btn" id="deployBtn" title="自动把最强的棋子按坦克前排、输出后排布阵">⚡ 一键上阵</button>
    <button class="btn" id="refreshBtn">刷新 (D) -2💰</button>
    <button class="btn" id="lockBtn" title="锁定当前商店，下回合不自动刷新">🔓 商店</button>
    <button class="btn" id="lvlBtn">升级人口 (F)</button>
    <button class="btn" id="sellBtn" title="先点击棋子选中，再点此出售（按星级与费用返还金币并回卡池，装备卸回装备栏）" style="background:#5b1e1e;color:#ff9a9a;border-color:#ff9a9a;">💸 出售</button>
    <span class="tag" style="display:flex;gap:4px;align-items:center;padding:3px 8px">⏩
      <button class="spd-b on" data-s="1">1×</button>
      <button class="spd-b" data-s="1.5">1.5×</button>
      <button class="spd-b" data-s="2">2×</button>
    </span>
    <button class="btn" id="resetBtn" title="放弃当前进度，重新开一局">🔄 重开</button>
    <button class="btn" id="fightBtn" style="background:#1e5b2a;color:#8dff9a;border-color:#8dff9a;">⚔ 开战 (空格)</button>
  </div>
</div>
<div id="main">
  <div id="boardwrap">
    <div id="board"></div>
    <div id="bench"></div>
  </div>
  <div id="side">
    <div class="panel"><h3>⚡ 下一个对手</h3><div id="enemyInfo"></div></div>
    <div class="panel"><h3>🔗 羁绊（上场生效）</h3><div id="synergy"></div></div>
    <div class="panel"><h3>🎒 装备（点装备→点棋子穿戴；右键棋子卸下全部装备）</h3><div id="equip"></div></div>
    <div class="panel"><h3>战报</h3><div id="log"></div></div>
  </div>
</div>
<div id="shopbar">
  <button class="btn" id="shopBtn" title="打开/关闭商店">🛒 商店</button>
  <div id="shop"></div>
</div>""",
"""<div id="topbar">
  <span class="tag">回合 <b id="round">1</b><span id="roundMax">/25</span></span>
  <span class="tag">❤️ <b id="hp">32</b></span>
  <span class="tag" title="利息：每10金+1，上限5。下回合利息预览见绿色数字">💰 <b id="gold">10</b><span id="interest" style="font-size:11px;color:#8dff9a;margin-left:3px"></span></span>
  <span class="tag">人口 <b id="pop">0</b>/<b id="popMax">4</b></span>
  <span class="tag" title="连胜/连败 2→+1金、3~4→+2金、5+→+3金">🔥 连胜 <b id="streak">0</b></span>
  <div class="fight-btn-row">
    <button class="btn" id="histBtn">📜 战绩</button>
    <button class="btn" id="bookBtn">📖 图鉴</button>
    <button class="btn" id="resetBtn" title="放弃当前进度，重新开一局">🔄 重开</button>
    <span class="tag" style="display:flex;gap:4px;align-items:center;padding:3px 8px">⏩
      <button class="spd-b on" data-s="1">1×</button>
      <button class="spd-b" data-s="1.5">1.5×</button>
      <button class="spd-b" data-s="2">2×</button>
    </span>
  </div>
</div>
<div id="main">
  <div id="synCol">
    <div class="syn-head">🔗 阵营羁绊</div>
    <div id="synFac"></div>
    <div class="syn-head">⚔ 职业羁绊</div>
    <div id="synJob"></div>
  </div>
  <div id="boardwrap">
    <div id="board"></div>
    <div id="bench"></div>
  </div>
  <div id="side">
    <div class="panel"><h3>⚡ 下一个对手</h3><div id="enemyInfo"></div></div>
    <div class="panel"><h3>🎒 装备（点装备→点棋子穿戴；右键棋子卸下全部装备）</h3><div id="equip"></div></div>
    <div class="panel"><h3>战报</h3><div id="log"></div></div>
  </div>
</div>
<div id="shopbar">
  <div id="playerBox">
    <div id="lvlBox">
      <div class="lvl-row"><span>Lv.<b id="lvlNum">4</b>（人口 <b id="pop2">0</b>/<b id="popMax2">4</b>）</span><span id="xpText">经验 0/6</span></div>
      <div class="xpbar"><div class="xpfill" id="xpFill"></div></div>
    </div>
    <div id="pbtns">
      <button class="btn" id="lvlBtn">买经验 (F) +4经验 -4💰</button>
      <button class="btn" id="refreshBtn">刷新 (D) -2💰</button>
      <button class="btn" id="lockBtn" title="锁定当前商店，下回合不自动刷新（L）">🔓 锁定</button>
      <button class="btn" id="deployBtn" title="自动把最强的棋子按坦克前排、输出后排布阵（A）">⚡ 一键上阵</button>
      <button class="btn" id="sellBtn" title="先点击棋子选中，再点此出售（按星级与费用返还金币并回卡池，装备卸回装备栏）" style="background:#5b1e1e;color:#ff9a9a;border-color:#ff9a9a;">💸 出售</button>
      <button class="btn" id="shopBtn" title="打开/关闭商店">🛒 商店</button>
    </div>
  </div>
  <div id="shop"></div>
  <div id="fightBox">
    <button class="btn" id="fightBtn" style="background:#1e5b2a;color:#8dff9a;border-color:#8dff9a;">⚔ 开战<br>(空格)</button>
  </div>
</div>""")

# ---------- 16) 新布局 CSS ----------
rep("""#side { width:310px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; flex-shrink:0; }""",
"""#side { width:300px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; flex-shrink:0; }
/* ===== 多多式左侧羁绊竖栏 ===== */
#synCol { width:136px; display:flex; flex-direction:column; gap:2px; flex-shrink:0; overflow-y:auto; padding:2px 0; }
.syn-head { font-size:11px; color:#a99cd0; padding:3px 6px 2px; border-bottom:1px solid #2a2344; margin-bottom:3px; }
.syn-badge { display:flex; align-items:center; gap:6px; background:#161228; border:1px solid #2a2344; border-left:3px solid #3a3055;
  border-radius:8px; padding:4px 7px; margin:0 2px 4px; font-size:12px; color:#5e5580; cursor:default; }
.syn-badge .ico { font-size:14px; filter:grayscale(1); opacity:.55; }
.syn-badge .cnt { margin-left:auto; font-weight:bold; font-size:11px; white-space:nowrap; }
.syn-badge.on { color:#d8d2ea; }
.syn-badge.on .ico { filter:none; opacity:1; }
.syn-badge.t1 { border-left-color:#c98a4b; background:#231a10; color:#e8cf9a; }
.syn-badge.t2 { border-left-color:#ffd24a; background:#2b2410; color:#ffe9a8; box-shadow:0 0 6px #ffd24a30; }
.syn-empty { color:#565073; font-size:11px; padding:4px 6px; }
/* ===== 多多式底部玩家信息盒 ===== */
#shopbar { gap:10px; }
#playerBox { display:flex; flex-direction:column; gap:5px; width:216px; flex-shrink:0; justify-content:center; }
#lvlBox { background:#161228; border:1px solid #35294f; border-radius:8px; padding:5px 8px; }
.lvl-row { display:flex; justify-content:space-between; font-size:12px; color:#cdd6f4; margin-bottom:4px; }
.xpbar { height:8px; background:#221c38; border-radius:4px; overflow:hidden; border:1px solid #4a3d6e; }
.xpfill { height:100%; width:0%; background:linear-gradient(90deg,#4aa8ff,#8dd0ff); transition:width .3s; }
#pbtns { display:grid; grid-template-columns:1fr 1fr; gap:4px; }
#pbtns .btn { font-size:12px; padding:4px 6px; white-space:nowrap; overflow:hidden; }
#fightBox { display:flex; align-items:center; flex-shrink:0; }
#fightBox .btn { padding:14px 16px; font-size:16px; line-height:1.25; }""")

# ---------- 17) 手机/横屏媒体查询适配新布局 ----------
rep("""@media (max-width:880px){
  #main { flex-direction:column; align-items:center; overflow-y:auto; padding:6px; gap:8px; }
  #side { width:min(96vw,520px); }""",
"""@media (max-width:880px){
  #main { flex-direction:column; align-items:center; overflow-y:auto; padding:6px; gap:8px; }
  #side { width:min(96vw,520px); }
  #synCol { width:min(96vw,520px); flex-direction:row; flex-wrap:wrap; gap:2px; }
  #synCol .syn-head { display:none; }
  #synCol .syn-badge { margin:1px; }
  #playerBox { width:100%; }
  #pbtns { grid-template-columns:repeat(3,1fr); }""")
rep("""  #side { width:262px; flex-shrink:0; overflow-y:auto; }""",
"""  #side { width:262px; flex-shrink:0; overflow-y:auto; }
  #synCol { width:96px; }
  .syn-badge { font-size:10px; padding:3px 4px; gap:3px; }
  .syn-badge .ico { font-size:12px; }
  #playerBox { width:190px; }""")

# ---------- 18) 羁绊渲染：多多式竖栏徽章 ----------
rep("""function chip(cnt, cfg, label, onlyActive){ // 分级羁绊：显示下一档进度，满级显示 MAX；onlyActive 只列出已上场棋子涉及的羁绊
  return Object.entries(cfg).map(([k,c])=>{
    const n=cnt[k]||0;
    if(onlyActive && n===0) return '';
    const maxN=c.need[c.need.length-1];
    let txt;
    if(n>=maxN){ txt=`${label}${k} MAX(${n})`; }
    else { const next=c.need.find(x=>x>n); txt=`${label}${k} ${n}/${next}`; }
    return `<span class="${n>=c.need[0]?'on':''}" title="${c.desc.map((d,i)=>`T${i+1}(${c.need[i]}人)：${d}`).join('\\n')}">${txt}</span>`;
  }).join('');
}
function renderSynergy(){
  const facCnt={}, clsCnt={};
  const seen=new Set(); // 羁绊按不同棋子计数：同名重复副本只算 1 个
  S.board.filter(Boolean).forEach(u=>{ if(seen.has(u.id)) return; seen.add(u.id);
    const d=byId(u.id);
    facCnt[d.fac]=(facCnt[d.fac]||0)+1; clsCnt[d.job]=(clsCnt[d.job]||0)+1; });
  const empty='<span style="color:#6b6288;font-size:11px">上场棋子后显示羁绊</span>';
  $('synergy').innerHTML =
    `<div class="grp"><b style="color:#c8bfe8">阵营</b><br>${chip(facCnt,FACTIONS,'',true)||empty}</div>` +
    `<div class="grp"><b style="color:#c8bfe8">职业</b><br>${chip(clsCnt,CLASSES,'',true)||empty}</div>`;
}""",
"""const FAC_ICON={'深海':'🌊','星际':'🚀','毛茸乐园':'🐾','音律':'🎵','四禧丸子':'🍡','学园':'🎓','夜幕':'🌙','花语':'🌸','魔道':'🔮','森之国':'🌲','工造':'⚙️','P-SP':'🎬'};
const JOB_ICON={'刀客':'🗡️','守护':'🛡️','歌势':'🎤','游侠':'🏹','法师':'☄️','咒术':'☠️','刺客':'🥷','狂战':'🪓','医者':'💊','偶像':'✨'};
/* 多多式羁绊徽章：图标+名称+档位进度；T1 铜色/T2 金色点亮，未达档位灰显 */
function synBadges(cnt,cfg,icons){
  return Object.entries(cfg).map(([k,c])=>{
    const n=cnt[k]||0;
    if(n===0) return '';
    const tier=c.need.filter(x=>x<=n).length;
    const maxN=c.need[c.need.length-1];
    const prog = n>=maxN ? 'MAX' : `${n}/${c.need.find(x=>x>n)}`;
    const tierChip = tier>0 ? `<span style="font-size:10px;color:${tier>=2?'#ffd24a':'#c98a4b'}">T${tier}</span>` : '';
    return `<div class="syn-badge ${tier>0?('on t'+tier):''}" title="${k}\\n${c.desc.map((d,i)=>`T${i+1}(${c.need[i]}人)：${d}`).join('\\n')}">
      <span class="ico">${icons[k]||'❓'}</span><span>${k}</span>${tierChip}<span class="cnt">${prog}</span></div>`;
  }).join('') || '<div class="syn-empty">上场棋子后显示羁绊</div>';
}
function renderSynergy(){
  const facCnt={}, clsCnt={};
  const seen=new Set(); // 羁绊按不同棋子计数：同名重复副本只算 1 个
  S.board.filter(Boolean).forEach(u=>{ if(seen.has(u.id)) return; seen.add(u.id);
    const d=byId(u.id);
    facCnt[d.fac]=(facCnt[d.fac]||0)+1; clsCnt[d.job]=(clsCnt[d.job]||0)+1; });
  $('synFac').innerHTML=synBadges(facCnt,FACTIONS,FAC_ICON);
  $('synJob').innerHTML=synBadges(clsCnt,CLASSES,JOB_ICON);
  // 玩家盒里的人口镜像（多多式：人口紧贴等级显示）
  $('pop2').textContent=S.board.filter(Boolean).length; $('popMax2').textContent=S.lvl;
}""")

# ---------- 19) 开场说明文案 ----------
rep("""    云顶之弈式自动战斗 Demo（VirtuaReal 在籍成员 · 58 人 · 限量卡池）<br>
    ① 每位棋子有 <b style="color:#ffd24a">阵营(13) + 职业(10)</b> 双羁绊，人数达标触发分级强化（T1/T2）<br>
    ② 技能分主动（集蓝自动放）与<b style="color:#8dff9a">被动</b>（战斗中自然生效）<br>
    ③ 拖拽布阵（场上最多 10 人）；卡池限量：1费×45 2费×30 3费×25 4费×15 5费×10，卖出返池<br>
    ④ 对手全部是有主题的阵容，撑过 20 回合即胜利""",
"""    多多自走棋式单机自动战斗（VirtuaReal + P-SP · 46 人 · 限量卡池 · 25 回合）<br>
    ① 经济：基础 5 金 + 利息（每 10 金 +1，上限 5）+ 连胜/连败奖励；刷新 2 金，买经验 4 金 +4<br>
    ② 每位棋子有 <b style="color:#ffd24a">阵营(12) + 职业(10)</b> 双羁绊（左侧竖栏），人数达标触发 T1/T2<br>
    ③ 商店概率随人口等级提升（高等级更易出 4/5 费）；技能带克制：烧蓝克法师、破盾克护盾、减疗克奶妈、荆棘克近战<br>
    ④ 拖拽布阵（场上最多 10 人），撑过 25 回合击败最终 Boss 即通关""")

# ---------- 20) 保存/兼容杂项 ----------
rep("  $('roundMax').textContent = S.endless ? '' : '/20';",
    "  $('roundMax').textContent = S.endless ? '' : '/25';")
rep("  $('lockBtn').textContent=S.lock?'🔒 商店':'🔓 商店';",
    "  $('lockBtn').textContent=S.lock?'🔒 锁定':'🔓 锁定';")
rep("""  log(S.lock?'🔒 商店已锁定（下回合保留货架）':'🔓 商店已解锁');
  $('lockBtn').textContent=S.lock?'🔒 商店':'🔓 商店';""",
    """  log(S.lock?'🔒 商店已锁定（下回合保留货架）':'🔓 商店已解锁');
  $('lockBtn').textContent=S.lock?'🔒 锁定':'🔓 锁定';""")

assert s != orig
io.open(P, 'w', encoding='utf8').write(s)
print('patched OK, replacements:', n_ok, 'size:', len(s))
