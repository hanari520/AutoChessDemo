(function(root){
  const kits={
  "ein": {
    "name": "棱镜守夜",
    "mode": "guard",
    "desc": "展开棱镜壁垒，获得 34% 最大生命护盾并嘲讽 2.2 秒；护盾被击破时反射一次 24% 伤害。",
    "color": "#78efff",
    "asset": "ward",
    "shield": 0.34,
    "taunt": 2.2,
    "counter": 0.24,
    "attackStyle": "blade"
  },
  "kouichi": {
    "name": "霓虹轮刃",
    "mode": "dash",
    "desc": "滑向最远敌人，造成 215% 攻击伤害并波及相邻目标；每命中一人回复 18% 伤害生命。",
    "color": "#ff7bd4",
    "asset": "blade",
    "target": "far",
    "mult": 2.15,
    "splash": 0.5,
    "lifesteal": 0.18,
    "attackStyle": "blade"
  },
  "yua": {
    "name": "记忆回收站",
    "mode": "single",
    "desc": "向最远敌人发射记忆碎片，造成 225% 法术伤害，烧毁 45% 当前法力并沉默 1.8 秒。",
    "color": "#b989ff",
    "asset": "void",
    "target": "far",
    "mult": 2.25,
    "manaBurn": 0.45,
    "silence": 1.8,
    "attackStyle": "arc"
  },
  "goutan": {
    "name": "忠犬拦截",
    "mode": "guardLink",
    "desc": "给生命最低的队友与自身各套上护盾，并建立拦截链接：队友下一次受击由勾檀分担 30%。",
    "color": "#ffb36b",
    "asset": "ward",
    "allyShield": 0.3,
    "selfShield": 0.2,
    "taunt": 1.8,
    "link": 0.3,
    "attackStyle": "blade"
  },
  "yujiu": {
    "name": "天线锁定",
    "mode": "single",
    "desc": "锁定最远敌人，造成 180% 远程伤害并削减 24 点护甲；命中后下一枚普攻自动弹向附近敌人。",
    "color": "#8fe8ff",
    "asset": "arc",
    "target": "far",
    "mult": 1.8,
    "shred": 24,
    "bounce": true,
    "attackStyle": "shot"
  },
  "songlv": {
    "name": "根系重击",
    "mode": "burst",
    "desc": "以根锤砸向出手时锁定的前方扇区（纵深 2 格），造成 150% 伤害、眩晕 0.8 秒并回复自身 20% 造成伤害的生命。",
    "color": "#9be36a",
    "asset": "blade",
    "mult": 1.5,
    "stun": 0.8,
    "lifesteal": 0.2,
    "front": {
      "depth": 2,
      "cone": 1
    },
    "attackStyle": "blade"
  },
  "likou": {
    "name": "急救快闪",
    "mode": "heal",
    "desc": "治疗生命比例最低的队友 210% 攻击生命，同时附加 10% 最大生命护盾并净化其控制。",
    "color": "#ff9ab6",
    "asset": "ward",
    "heal": 2.1,
    "shield": 0.1,
    "cleanse": true,
    "attackStyle": "arc"
  },
  "agari": {
    "name": "应援心拍",
    "mode": "team",
    "desc": "全队回复 90% 攻击生命并获得 8% 最大生命护盾；3 秒内首次普攻额外产生一次心拍爆发。",
    "color": "#ff6fae",
    "asset": "arc",
    "heal": 0.9,
    "shield": 0.08,
    "tempo": true,
    "attackStyle": "pulse"
  },
  "hoshimi": {
    "name": "月猫跃迁",
    "mode": "dash",
    "desc": "扑向生命比例最低的敌人，造成 235% 伤害并施加 2 秒流血；击杀后立刻刷新一次位移。",
    "color": "#dca3ff",
    "asset": "blade",
    "target": "low",
    "mult": 2.35,
    "bleed": 0.018,
    "bleedDuration": 2,
    "attackStyle": "blade"
  },
  "chiharu": {
    "name": "夜岚折返",
    "mode": "cleave",
    "desc": "向出手时锁定的前方扇区（纵深 2 格）斩出两道夜岚，合计造成 165% 伤害并使命中者受到的下一次普攻伤害提高 25%。",
    "color": "#8fbcff",
    "asset": "blade",
    "mult": 0.825,
    "hits": 2,
    "wound": 0.25,
    "front": {
      "depth": 2,
      "cone": 1
    },
    "attackStyle": "blade"
  },
  "suiji": {
    "name": "十小时续航",
    "mode": "support",
    "desc": "为除自身外的队友回复 28 点法力并治疗 60% 攻击生命；同时获得 18% 攻速，持续 4 秒。",
    "color": "#8ddc9b",
    "asset": "ward",
    "mana": 28,
    "heal": 0.6,
    "haste": 0.18,
    "attackStyle": "pulse"
  },
  "kanban": {
    "name": "海獭缓冲层",
    "mode": "guard",
    "desc": "吸收 45% 最大生命伤害，获得 35% 格挡，持续 4 秒；格挡成功时向攻击者喷出水花减速。",
    "color": "#7ed7d9",
    "asset": "ward",
    "shield": 0.45,
    "block": 0.35,
    "slow": 0.2,
    "attackStyle": "blade"
  },
  "zhouyi": {
    "name": "破盾读秒",
    "mode": "passive",
    "desc": "被动：普通攻击优先拆除护盾；目标无护盾时，下一次攻击造成额外 80% 破防伤害。",
    "color": "#c77dff",
    "asset": "void",
    "passive": true,
    "attackHit": "shieldbreak",
    "attackStyle": "blade"
  },
  "yuji": {
    "name": "雨幕偏航",
    "mode": "passive",
    "desc": "被动：雨幕庇护——雨纪每 2 次普攻凝结 1 层「雨露」（至多 2 层）；受到攻击时消耗 1 层雨露必定闪避该次攻击，并召唤雨幕：获得 8% 最大生命护盾、下一次普攻附带减速。无雨露时保留 25% 概率格挡（伤害减半）兜底。",
    "color": "#72c9ff",
    "asset": "ward",
    "passive": true,
    "attackHit": "rainveil",
    "attackStyle": "shot"
  },
  "tiandou": {
    "name": "点心补给线",
    "mode": "heal",
    "desc": "把点心投向两名最需要治疗的队友，各回复 145% 攻击生命并获得 8% 护盾；护盾破裂时回复 8 点法力。",
    "color": "#ffc56d",
    "asset": "ward",
    "heal": 1.45,
    "healN": 2,
    "shield": 0.08,
    "mana": 8,
    "attackStyle": "arc"
  },
  "aza": {
    "name": "节拍装甲",
    "mode": "team",
    "desc": "以鼓点强化全队：回复 70% 攻击生命、攻击 +12%，并在施法者脚下留下 2 秒震荡圈（3×3 格）。",
    "color": "#ff8b8b",
    "asset": "arc",
    "heal": 0.7,
    "attack": 0.12,
    "zone": {
      "r": 1,
      "dur": 2000,
      "dps": 0.18
    },
    "attackStyle": "pulse"
  },
  "pako": {
    "name": "善意溢出",
    "mode": "heal",
    "desc": "治疗生命最低的队友 230% 攻击生命，溢出治疗转化为 18% 最大生命护盾，并压低其受到的治疗削减。",
    "color": "#73d6e8",
    "asset": "ward",
    "heal": 2.3,
    "shield": 0.18,
    "attackStyle": "arc"
  },
  "zhijin": {
    "name": "紫藤追迹",
    "mode": "dash",
    "desc": "沿紫藤轨迹突进最远敌人，造成 240% 伤害并窃取 18% 伤害生命；命中后目标 2 秒内无法获得护盾。",
    "color": "#e69bff",
    "asset": "blade",
    "target": "far",
    "mult": 2.4,
    "lifesteal": 0.18,
    "noShield": 2,
    "attackStyle": "blade"
  },
  "sishi": {
    "name": "四季转盘",
    "mode": "chain",
    "desc": "向最多 4 个敌人发射季节弹：春减速、夏烧蓝、秋流血、冬冻结，每跳伤害递减。",
    "color": "#ffd27d",
    "asset": "arc",
    "targets": 4,
    "mults": [
      1.25,
      1.05,
      0.88,
      0.72
    ],
    "season": true,
    "attackStyle": "shot"
  },
  "sumi": {
    "name": "墨龙入砚",
    "mode": "teamShield",
    "desc": "为全队附加 18% 最大生命护盾并获得 10% 减伤；墨龙会优先吞掉一次控制效果。",
    "color": "#a58bff",
    "asset": "void",
    "shield": 0.18,
    "dr": 0.1,
    "cleanse": true,
    "attackStyle": "arc"
  },
  "yukie": {
    "name": "上勾拳三连",
    "mode": "combo",
    "desc": "连续三段锁定同一目标：100%／110%／160% 伤害，第三段击飞并附加 1.5 秒流血。",
    "color": "#ff9b7b",
    "asset": "blade",
    "target": "near",
    "hits": 3,
    "mults": [
      1,
      1.1,
      1.6
    ],
    "stun": 0.45,
    "bleed": 0.015,
    "bleedDuration": 1.5,
    "attackStyle": "blade"
  },
  "miting": {
    "name": "看破真相",
    "mode": "single",
    "desc": "揭开攻击最高敌人的弱点，造成 205% 法术伤害并削减 35% 魔抗；其下一次技能伤害反噬自身。",
    "color": "#ffe49b",
    "asset": "arc",
    "target": "hi",
    "mult": 2.05,
    "sunder": 0.35,
    "reflectSkill": 0.3,
    "attackStyle": "arc"
  },
  "xuezhu": {
    "name": "冰烛禁区",
    "mode": "zone",
    "desc": "冻结最远敌人 2 秒并造成 170% 伤害，在其脚下生成 2.7 秒冰封禁区（3×3 格）。",
    "color": "#9fe8ff",
    "asset": "arc",
    "target": "far",
    "mult": 1.7,
    "freeze": 2,
    "zone": {
      "r": 1,
      "dur": 2700,
      "dps": 0.35
    },
    "attackStyle": "arc"
  },
  "zeyin": {
    "name": "泽畔回声",
    "mode": "team",
    "desc": "治疗全队 100% 攻击生命，并让敌方全体受到的治疗降低 25%，持续 4 秒；每个受伤队友回响一次水波。",
    "color": "#79e6d5",
    "asset": "ward",
    "heal": 1,
    "enemyHealDown": 0.25,
    "attackStyle": "pulse"
  },
  "sanli": {
    "name": "梦境三拍",
    "mode": "chain",
    "desc": "对 3 名敌人进行梦境连锁，造成 160%／120%／90% 法术伤害；最后一跳使目标沉睡 0.6 秒。",
    "color": "#f29eff",
    "asset": "arc",
    "targets": 3,
    "mults": [
      1.6,
      1.2,
      0.9
    ],
    "stun": 0.6,
    "attackStyle": "pulse"
  },
  "diansu": {
    "name": "邪修石符",
    "mode": "single",
    "desc": "在攻击最高敌人身上刻下石符，造成 200% 伤害并石化 2.2 秒；若目标有护盾则额外碎盾。",
    "color": "#d9c8a6",
    "asset": "void",
    "target": "hi",
    "mult": 2,
    "petrify": 2.2,
    "shieldbreak": true,
    "attackStyle": "arc"
  },
  "lianshiye": {
    "name": "失忆挽歌",
    "mode": "single",
    "desc": "对最近敌人造成 180% 伤害、沉默 3 秒并烧毁 40% 当前法力；目标每次施法都会再受一次回响伤害。",
    "color": "#c99dff",
    "asset": "void",
    "mult": 1.8,
    "silence": 3,
    "manaBurn": 0.4,
    "echo": 0.35,
    "attackStyle": "blade"
  },
  "huize": {
    "name": "果冻封印",
    "mode": "single",
    "desc": "用果冻领域束缚最近敌人，造成 160% 伤害、减速 40% 并附加 3 秒毒伤，同时禁止其获得治疗。",
    "color": "#ff83cf",
    "asset": "ward",
    "mult": 1.6,
    "slow": 0.4,
    "bleed": 0.015,
    "enemyHealDown": 0.35,
    "healBlock": 3.2,
    "attackStyle": "arc"
  },
  "shengge": {
    "name": "净音祷歌",
    "mode": "team",
    "desc": "治疗全队 95% 攻击生命并净化控制；净化成功的队友获得 15% 攻速，持续 3 秒。",
    "color": "#fff2a6",
    "asset": "ward",
    "heal": 0.95,
    "cleanse": true,
    "haste": 0.15,
    "hasteDuration": 3,
    "attackStyle": "pulse"
  },
  "shadow": {
    "name": "熊跃终点",
    "mode": "dash",
    "desc": "跳向生命最低的敌人，造成 280% 伤害；目标生命低于 40% 时追加 45% 斩杀伤害。",
    "color": "#ffad66",
    "asset": "blade",
    "target": "low",
    "mult": 2.8,
    "execute": 0.45,
    "attackStyle": "blade"
  },
  "nox": {
    "name": "夜莺回响",
    "mode": "dash",
    "desc": "突进最远敌人造成 240% 伤害，留下一个 2 秒后爆裂的残影；残影爆炸会沉默周围敌人。",
    "color": "#ad8dff",
    "asset": "void",
    "target": "far",
    "mult": 2.4,
    "afterimage": true,
    "attackStyle": "blade"
  },
  "miyue": {
    "name": "月影留痕",
    "mode": "dashCleave",
    "desc": "切入目标后回旋斩击周围敌人，造成 185% 伤害并施加 2 秒流血；每命中一人获得 5% 吸血。",
    "color": "#c39bff",
    "asset": "blade",
    "target": "near",
    "mult": 1.85,
    "bleed": 0.02,
    "bleedDuration": 2,
    "lifesteal": 0.05,
    "attackStyle": "blade"
  },
  "huali": {
    "name": "花礼绽放",
    "mode": "heal",
    "desc": "治疗两名队友各 160% 攻击生命并回复 18 点法力；受疗者生命越低，治疗越高。",
    "color": "#ffb7d0",
    "asset": "ward",
    "heal": 1.6,
    "healN": 2,
    "mana": 18,
    "attackStyle": "arc"
  },
  "youyu": {
    "name": "幽魂相位",
    "mode": "dash",
    "desc": "化为幽魂穿过敌阵，对最近敌人造成 220% 纯粹伤害并获得 1.5 秒相位闪避。",
    "color": "#78d9ff",
    "asset": "void",
    "target": "near",
    "mult": 2.2,
    "dtype": "pure",
    "phase": 1.5,
    "attackStyle": "blade"
  },
  "quanrong": {
    "name": "小狗反甲",
    "mode": "guard",
    "desc": "获得 50% 最大生命护盾并嘲讽 2.5 秒；护盾期间每次受击反弹 8% 最大生命。",
    "color": "#d7a76b",
    "asset": "ward",
    "shield": 0.5,
    "taunt": 2.5,
    "thorns": 0.08,
    "attackStyle": "blade"
  },
  "ruiya": {
    "name": "时空封存",
    "mode": "zone",
    "desc": "冻结最远敌人 2.4 秒并造成 200% 伤害；在其脚下生成 3×3 格时空区，区域内敌人攻速降低 60%。",
    "color": "#a8b9ff",
    "asset": "void",
    "target": "far",
    "mult": 2,
    "freeze": 2.4,
    "slow": 0.6,
    "zone": {
      "r": 1,
      "dur": 3000,
      "dps": 0.22
    },
    "attackStyle": "arc"
  },
  "mumu": {
    "name": "东风润物",
    "mode": "team",
    "desc": "全队回复 105% 攻击生命并获得 20% 攻速，持续 4 秒；生命满的队友改为获得 10% 护盾。",
    "color": "#9cffb4",
    "asset": "ward",
    "heal": 1.05,
    "haste": 0.2,
    "shield": 0.1,
    "attackStyle": "pulse"
  },
  "kroya": {
    "name": "混沌裂界",
    "mode": "chaos",
    "desc": "对攻击最高敌人造成 260% 法术伤害并裂变一次：随机附加冻结、沉默或烧蓝。",
    "color": "#ff8dce",
    "asset": "void",
    "target": "hi",
    "mult": 2.6,
    "chaos": true,
    "attackStyle": "arc"
  },
  "shiliu": {
    "name": "浣熊洗劫",
    "mode": "single",
    "desc": "偷走最近敌人的全部护盾并造成 215% 伤害；若偷到护盾，额外眩晕 0.6 秒。",
    "color": "#f5b46b",
    "asset": "blade",
    "mult": 2.15,
    "stealShield": true,
    "stun": 0.6,
    "attackStyle": "blade"
  },
  "seki": {
    "name": "星蚀低语",
    "mode": "field",
    "desc": "以自身为中心展开星蚀领域，3 格内敌人受到 150% 伤害、沉默 2.6 秒并持续烧蓝。",
    "color": "#7e75ff",
    "asset": "void",
    "mult": 1.5,
    "silence": 2.6,
    "manaBurn": 0.35,
    "attackStyle": "pulse"
  },
  "haruka": {
    "name": "白刃拍击",
    "mode": "cleave",
    "desc": "白刃横扫出手时锁定的前方扇区（纵深 2 格），造成 180% 伤害并削减 25% 攻击；被削弱者攻击会给白神遥回 4 点法力。",
    "color": "#f6f3ff",
    "asset": "blade",
    "mult": 1.8,
    "weaken": 0.25,
    "mana": 4,
    "front": {
      "depth": 2,
      "cone": 1
    },
    "attackStyle": "blade"
  },
  "mahiru": {
    "name": "绯红旋风",
    "mode": "cleave",
    "desc": "旋转三圈，每圈对周围敌人造成 90% 伤害并回复 25% 伤害生命；第三圈附加流血。",
    "color": "#ff6b75",
    "asset": "blade",
    "mult": 0.9,
    "hits": 3,
    "lifesteal": 0.25,
    "bleed": 0.02,
    "attackStyle": "blade"
  },
  "nana7mi": {
    "name": "鲨皇潮",
    "mode": "burst",
    "desc": "短引导 0.6 秒，鲨潮沿出手锁定的方向冲撞正前方直线 3 格：造成 210% 伤害、拉近敌人并减速 35%；血量越低伤害越高。引导被打断则损失一半法力。",
    "color": "#67d4e8",
    "asset": "arc",
    "mult": 2.1,
    "slow": 0.35,
    "pull": true,
    "lowHPBoost": 0.6,
    "front": {
      "depth": 3,
      "width": 0
    },
    "castT": 0.6,
    "attackStyle": "blade"
  },
  "liAn": {
    "name": "晨露凝霜",
    "mode": "field",
    "desc": "锁定攻击最高的敌人，将其周围 4 格内的敌人群体冻结 1.4 秒并造成 125% 伤害；冻结结束后目标获得易伤。",
    "color": "#e6fbff",
    "asset": "arc",
    "mult": 1.25,
    "freeze": 1.4,
    "brittle": 0.22,
    "attackStyle": "arc"
  },
  "youyi": {
    "name": "一心同体",
    "mode": "passive",
    "desc": "被动：每次普通攻击为自身与生命最低的队友各回复 3% 最大生命；任意一方濒死时共享 20% 护盾。",
    "color": "#ff9f9f",
    "asset": "ward",
    "passive": true,
    "attackHit": "soulmate",
    "attackStyle": "blade"
  },
  "azi": {
    "name": "高音震魂",
    "mode": "field",
    "desc": "引导 1.2 秒，向出手锁定的方向释放高音震魂波：前方 3 格（宽 3 格）内敌人受到 160% 伤害并眩晕 1.5 秒，每命中一人阿梓获得 6 点法力。引导被打断则损失一半法力。",
    "color": "#ffbd6a",
    "asset": "arc",
    "mult": 1.6,
    "stun": 1.5,
    "mana": 6,
    "front": {
      "depth": 3,
      "width": 1
    },
    "castT": 1.2,
    "attackStyle": "pulse"
  },
  "taodai": {
    "name": "桃香结界",
    "mode": "teamShield",
    "desc": "全队获得 22% 最大生命护盾；桃香结界持续 4 秒，期间全队减伤 20%，桃代嘲讽 2.7 秒。",
    "color": "#ffb1c9",
    "asset": "ward",
    "shield": 0.22,
    "dr": 0.2,
    "taunt": 2.7,
    "attackStyle": "blade"
  },
  "miki": {
    "name": "星海庇护",
    "mode": "heal",
    "desc": "治疗 3 名队友各 150% 攻击生命，附加 12% 护盾并回复 12 点法力；优先濒危单位。",
    "color": "#8fd9ff",
    "asset": "ward",
    "heal": 1.5,
    "healN": 3,
    "shield": 0.12,
    "mana": 12,
    "attackStyle": "arc"
  },
  "rei": {
    "name": "灵界之门",
    "mode": "field",
    "desc": "引导 1.5 秒开启灵界之门，向出手锁定的方向喷涌灵界洪流：前方 3 格（宽 3 格）内敌人受到 150% 伤害并沉默 2.4 秒，门会把其中一次治疗的 40% 转成伤害。引导被打断则损失一半法力。",
    "color": "#b78cff",
    "asset": "void",
    "mult": 1.5,
    "silence": 2.4,
    "enemyHealDown": 0.4,
    "front": {
      "depth": 3,
      "width": 1
    },
    "castT": 1.5,
    "attackStyle": "pulse"
  },
  "rinco": {
    "name": "十二点拉闸",
    "mode": "cleave",
    "desc": "引导 1.2 秒，沿出手锁定的方向拉下总闸，电浪席卷正前方直线纵深 3 格：造成 210% 伤害并沉默 1.8 秒；自身获得 25% 吸血，直到战斗结束。引导被打断则损失一半法力。",
    "color": "#ff5f70",
    "asset": "void",
    "mult": 2.1,
    "silence": 1.8,
    "lifesteal": 0.25,
    "front": {
      "depth": 3,
      "width": 0
    },
    "castT": 1.2,
    "attackStyle": "blade"
  }
};
  if(typeof module==='object'&&module.exports)module.exports=kits;else root.SurvivalClassicKits=kits;
})(globalThis);
