# 联机模式战斗技能系统审计报告（2026-09-29）

审计对象：八人联机模式确定性战斗技能系统
代码基线：`online/combat.js`（ruleset `deterministic-battle-v2`）、`online/core.js`
单人真相源：`index.html` `COMBAT_KITS`（第 1763 行起，经核实为战斗引擎 `castSkill`（第 6640 行）唯一实际引用的技能表；文件中不存在被引擎引用的其它历史版本技能表）
测试：`online/skills.test.js`（新增，12 个用例）、`online/combat.test.js`（6 例，未改动，全过）、`online/core.test.js`（9 例，未改动，全过）

## 一、审计结论

- **50/50 棋子技能可正常发动**：47 个非被动棋子在受控对局中全部产生 `cast` 事件并输出各自模式的签名效果（治疗系出 `heal` 事件、守护系出 `shield` 事件、输出系出 `skill` 伤害事件、控制系可观测地延迟/禁止目标行动）；3 个被动棋子（zhouyi/yuji/youyi）的被动路径全部有行为级断言通过。
- **修复 7 处确凿 bug**（5 处引擎逻辑 + 4 处技能表参数，其中 nana7mi 一项兼属两类），详见「修复清单」。
- **发现并修复 1 个全局性问题**：减速（slow）状态在整个联机引擎中是死代码——多处技能写入 `u.slow` 但没有任何代码读取它，攻速完全不受影响。
- **无需豁免**：整局模拟中「参战 ≥2 场的非被动棋子至少 1 次 cast」断言零违例；未出现「360 tick 内攒不满蓝」的棋子。
- 记录 **21 项设计性偏差**（单人特有的演出/召唤物/变体机制简化），只记录未修改。

## 二、逐棋子验证结果（50 行）

验证方法（`online/skills.test.js`）：
- 受控对局：`initialMana:50`（tick 0 即满蓝；同一 tick 内 A 方按槽位序先行动）+ `maxTicks:1200`。
- 非被动：断言 `events` 含 `{type:'cast', from:<uid>}`；按模式追加 heal/shield/skill 伤害断言。
- 控制系探针：满蓝敌方 ein 在 tick 0 本应立刻施放 guard；断言其首次 cast 被推迟到 ≥ 控制时长-100ms（硬控还断言期间无攻击），非依赖概率、可复现。
- 减速探针：断言被减速目标（基础挥击 1812ms）出现 ≥ 基础×(1+减速量)-250ms 的攻击间隔。

| # | id | 模式 | 发动 | 附加断言 | 修复内容 |
|---|----|------|------|----------|----------|
| 1 | ein | guard | ✔ cast+shield | shield 事件 | — |
| 2 | kouichi | dash | ✔ cast+skill | 伤害命中 | — |
| 3 | yua | single | ✔ cast+skill | 沉默推迟敌施法 1800ms；manaBurn 事件 | — |
| 4 | goutan | guardLink | ✔ cast+shield | 自身+队友 shield | — |
| 5 | yujiu | single | ✔ cast+skill | shred 生效路径 | — |
| 6 | songlv | cleave | ✔ cast+skill | 眩晕 800ms 探针 | — |
| 7 | likou | heal | ✔ cast+heal | 治疗事件 | **补 `cleanse:true`**（单人漏项） |
| 8 | agari | team | ✔ cast+heal | 全队治疗 | — |
| 9 | hoshimi | dash | ✔ cast+skill | 伤害命中 | — |
| 10 | chiharu | cleave | ✔ cast+skill | wound 生效路径 | — |
| 11 | suiji | support | ✔ cast+heal | 除自身外队友治疗 | — |
| 12 | kanban | guard | ✔ cast+shield | block+反击减速路径 | 减速由死代码修复激活 |
| 13 | zhouyi | passive | ✔ 被动 | 攻击剥离护盾出 shieldBreak；永无 cast | — |
| 14 | yuji | passive | ✔ 被动 | 雨露→dodge(reason:rainveil)+8% shield | — |
| 15 | tiandou | heal | ✔ cast+heal | 双目标治疗 | — |
| 16 | aza | team | ✔ cast+heal | 全队治疗+攻击增益 | — |
| 17 | pako | heal | ✔ cast+heal | 治疗事件 | — |
| 18 | zhijin | dash | ✔ cast+skill | noShield 路径 | — |
| 19 | sishi | chain | ✔ cast+skill | 4 跳伤害 | — |
| 20 | sumi | teamShield | ✔ cast+shield | 全队 shield+净化路径 | — |
| 21 | yukie | combo | ✔ cast+skill | 三段伤害；眩晕 450ms 探针 | — |
| 22 | miting | single | ✔ cast+skill | sunder；反噬事件 | **补 `reflectSkill:.30` + 修复反噬方向反转 bug** |
| 23 | xuezhu | zone | ✔ cast+skill | 冻结 2000ms 探针 | — |
| 24 | zeyin | team | ✔ cast+heal | 全队治疗+敌方治疗压制 | — |
| 25 | sanli | chain | ✔ cast+skill | 3 跳；眩晕 600ms 探针 | — |
| 26 | diansu | single | ✔ cast+skill | 石化 2200ms 探针；碎盾事件 | 碎盾改为伤害前结算（原顺序 bug 下基本不可能触发） |
| 27 | lianshiye | single | ✔ cast+skill | 沉默 3000ms 探针；manaBurn | — |
| 28 | huize | single | ✔ cast+skill | 减速 40% 拉长敌挥击间隔 | 减速由死代码修复激活 |
| 29 | shengge | team | ✔ cast+heal | 全队治疗+净化路径 | — |
| 30 | shadow | dash | ✔ cast+skill | 斩杀路径 | — |
| 31 | nox | dash | ✔ cast+skill | 伤害命中 | — |
| 32 | miyue | cleave | ✔ cast+skill | 流血路径 | — |
| 33 | huali | heal | ✔ cast+heal | 双目标治疗 | — |
| 34 | youyu | single | ✔ cast+skill | 纯粹伤害 | — |
| 35 | quanrong | guard | ✔ cast+shield | shield+反甲 | — |
| 36 | ruiya | zone | ✔ cast+skill | 冻结 2400ms 探针 | — |
| 37 | mumu | team | ✔ cast+heal | 全队治疗+护盾 | — |
| 38 | kroya | single | ✔ cast+skill | 260% 法伤（反噬探针中的施法者） | — |
| 39 | shiliu | single | ✔ cast+skill | 窃取开局护盾到自身；眩晕探针 | 窃取改为伤害前结算（原顺序 bug 下护盾必先被伤害吃掉） |
| 40 | seki | cleave | ✔ cast+skill | 沉默 2600ms 探针；manaBurn | — |
| 41 | haruka | cleave | ✔ cast+skill | weaken 生效路径 | — |
| 42 | mahiru | cleave | ✔ cast+skill | 三段旋斩 | — |
| 43 | nana7mi | cleave | ✔ cast+skill | 减速 35% 拉长敌挥击间隔 | **`execute:.6` 改回 `lowHPBoost:.6`**（单人语义是自身血越低伤害越高，被误写成对低血目标的斩杀） |
| 44 | liAn | field | ✔ cast+skill | 冻结 1400ms 探针 | — |
| 45 | youyi | passive | ✔ 被动 | 攻击治疗自身+最低血队友（heal 事件）；永无 cast | — |
| 46 | azi | cleave | ✔ cast+skill | 眩晕 1500ms 探针 | — |
| 47 | taodai | teamShield | ✔ cast+shield | 全队 shield+减伤+嘲讽 | — |
| 48 | miki | heal | ✔ cast+heal | 三目标治疗 | — |
| 49 | rei | cleave | ✔ cast+skill | 沉默 2400ms 探针 | **补 `enemyHealDown:.40`**（单人漏项） |
| 50 | rinco | cleave | ✔ cast+skill | 沉默 1800ms 探针；吸血 | — |

## 三、修复清单（combat.js）

1. **技能星级倍率查错键（全局数值 bug）**：原 `power=...*({1:1.30,...,5:1.12}[u.star]||1)` 把「按费用索引」的 SKILL_STAR_M 表当成了星级表来查，且漏了指数。结果：1 星棋子技能威力被抬高 12%–30%（任何费用 1 星都吃到 1.30），3 星严重偏低（如 1 费 3 星应为 1.30²=1.69，实际只有 1.20）。已改为与单人一致的 `Math.pow(({1:1.30,...})[cost]||1.1, star-1)`。
2. **减速（slow）完全失效（死代码）**：`applyHitEffects`、kanban 格挡、yuji 雨幕、弓先机、荆棘、sishi 季节弹等多处写 `u.slow`，但攻速公式 `u.cd=1450/speed*(1+haste)` 从不读它。新增 `slowPct` 字段（携带单人 slowA 减速比例），减速期间 `cd×(1+slowPct)`，过期随 `slow` 归零清空。单人 slowA 取值对照：huize .4 / nana7mi .35 / kanban .20 / sishi 春 .25 / 雨幕 .20 / 先机 .20 / 荆棘 .18。
3. **护盾窃取/碎盾在伤害之后结算（顺序 bug）**：`shiliu` 窃取、`diansu` 碎盾挂在命中后置的 `applyHitEffects` 里，而技能伤害先行消耗护盾——凡一击能打穿的护盾（几乎所有开局盾）轮到结算时已是 0，两个机制形同虚设。已改为伤害前结算（对齐单人 `v3ApplyHit` 的 pre-damage 检查），碎盾同时附加单人同款的 2.5s 禁盾。
4. **miting 技能反噬方向反转（语义 bug）**：原实现在「持有 reflect 标记的单位**被打出技能伤害**时」把反噬打给攻击者；单人语义是「被点名的敌人**自己下次施放技能**时反噬自身」。已改为施法者自伤（一次性消耗，对齐单人单次触发）。
5. **likou 补 `cleanse:true`**：单人急救快闪带净化，联机表漏项（引擎 `castSkill` 末尾本就支持该分支）。
6. **miting 补 `reflectSkill:.30`**：单人「其下一次技能伤害反噬自身」漏项（引擎本支持该字段）。
7. **rei 补 `enemyHealDown:.40`**：单人灵界之门治疗压制 40% 漏项（引擎本支持该字段）。
8. **nana7mi `execute:.6`→`lowHPBoost:.6`**：单人鲨皇潮是「自身血量越低伤害越高」（引擎有现成 `lowHPBoost` 分支），被误键为对残血目标的斩杀（`execute`）。
9. 附带：`SKILLS` 表改为具名导出供审计测试直接核对表结构（不影响运行时入口 `resolveBattle`）。

`online/core.js` 未发现确凿 bug，本次未改动（`resolveRound` 的 maxTicks:360、400 条事件截断、种子派生均按设计工作；截断问题由审计测试通过同种子重放全量事件绕开）。

## 四、整局释放覆盖（layer 2）

方法：仅用 `online/core.js` 驱动 5 局完整八人局（种子 `skills-audit-2026-09-29-a..e`）：每回合各席回收替补席、buyXp 升级、按费用从高到低购买、替补上板至人口上限、全员 ready、`advancePhase` 三连推进直至 complete。每场战斗在进入 combat 前捕获 `state.rng`、按 core 同款 FNV 种子公式同种子重放 `resolveBattle(maxTicks:360)` 取未截断事件（重放胜者与房间记录 100% 一致，交叉验证种子重建正确）。

- 合计 87 回合、4283 次 cast；44/50 棋子至少登场 1 场。
- **断言「参战 ≥2 场的非被动棋子 ≥1 次 cast」：零违例、零豁免。**
- 未登场（6 个，商店随机性，与引擎无关，均由 layer 1 受控对局覆盖）：songlv(1费,纯商店运气)、sishi(5)、mahiru(5)、nana7mi(5)、liAn(5)、azi(5)。
- 回蓝经济结论：**不存在「360 tick 内放不出技能」的棋子**。开战 15 蓝 + 每次攻击回 15（法师/咒术/医者 30）+ maxmana 50 + skillCd 3000ms，意味着坦克型（攻速 0.8，~1.8s/击）约 3–4 击回满、施法型 2 击回满，36s 战斗中典型 2–8 次施放（统计见下）。与单人 `min(8+伤害/6, 15/30)` 相比，联机是「取上限的平铺」——对低攻前排更宽松，属可接受偏差（见偏差表 E-1）。

整局 cast 统计（5 局合计，节选；完整表由 `node --test online/skills.test.js` 输出）：

```
pako      heal       battles=128 casts=446    miting  single   battles=175 casts=354
zhijin    dash       battles=126 casts=237    tiandou heal     battles=105 casts=228
sumi      teamShield battles=113 casts=222    kanban  guard    battles= 95 casts=215
aza       team       battles= 83 casts=211    zeyin   team     battles= 81 casts=191
likou     heal       battles= 58 casts=187    suiji   support  battles=101 casts=160
yua       single     battles= 81 casts=150    sanli   chain    battles= 72 casts=149
huize     single     battles= 73 casts=140    xuezhu  zone     battles= 74 casts=136
shadow    dash       battles= 58 casts=120    goutan  guardLink battles= 47 casts=112
…（44 个登场棋子全部 casts>0；3 个被动棋子 casts=0 符合预期）
games=5 rounds=87 totalCasts=4283 fielded=44/50
```

## 五、与单人版数值差异表

### 5.1 数值一致（关键参数逐个比对，共 50 项）

以下字段与 `COMBAT_KITS` 逐项一致：ein(shield .34/taunt 2.2s)、kouichi(2.15/splash .5/吸 .18)、yua(2.25/烧蓝 .45/沉默 1.8s)、goutan(.20/.30/1.8s/link .30)、yujiu(1.8/shred 24/bounce)、songlv(1.5/晕 .8s/吸 .20)、likou(2.1/.10)、agari(.9/.08)、hoshimi(2.35/流血 .018)、suiji(.6/蓝 28/急速 .18)、kanban(.45/格挡 .35)、tiandou(1.45×2/.08)、aza(.7/攻 .12)、pako(2.3/.18)、zhijin(2.4/吸 .18/禁盾 2s)、sishi(4 跳 1.25/1.05/.88/.72)、sumi(.18/减伤 .10)、yukie(1/1.1/1.6/晕 .45s/流血 .015)、miting(2.05/sunder .35)、zeyin(1/压疗 .25)、sanli(1.6/1.2/.9/晕 .6s)、diansu(2/石化 2.2s)、lianshiye(1.8/沉默 3s/烧蓝 .4)、huize(1.6/减速 .4/流血 .015/压疗 .35)、shengge(.95/急速 .15)、shadow(2.8/斩 .45)、nox(2.4)、miyue(1.85/流血 .02/吸 .05)、huali(1.6×2/蓝 18)、youyu(2.2 纯净)、quanrong(.50/2.5s/反 .08)、mumu(1.05/急速 .20/.10)、kroya(2.6)、shiliu(2.15/晕 .6s)、seki(1.5/沉默 2.6s/烧蓝 .35)、haruka(1.8/削攻 .25)、mahiru(.9×3/吸 .25/流血 .02)、nana7mi(2.1/减速 .35/低血增伤 .6)、liAn(1.25/冻 1.4s)、azi(1.3/晕 1.5s)、taodai(.22/减伤 .20/2.7s)、miki(1.5×3/.12/蓝 12)、rei(1.35/沉默 2.4s/压疗 .40)、rinco(2.1/沉默 1.8s/吸 .25)、zhouyi/yuji/youyi 被动数值。共享常数也一致：SKILL_CD 3000ms、基础攻击间隔 1450ms、开局蓝 15、maxmana 50、受击回蓝区间 min(伤/5,15)~min(伤/2.5,30)。

### 5.2 本次修复的差异（笔误/漏项级）

| 棋子 | 单人 | 联机原值 | 修复 |
|------|------|----------|------|
| 全体 | 技能倍率 ×SKILL_STAR_M[费用]^(星-1) | ×{按星级误查的常数} | 改为费用键+指数 |
| 全体带减速技能 | slowA 生效于攻速/移速 | slow 无任何效果 | 实现 slowPct×攻速 |
| likou | 净化 | 无 | +cleanse |
| miting | 技能反噬 .30 | 无 | +reflectSkill（并修方向） |
| rei | 压疗 .40 | 无 | +enemyHealDown |
| nana7mi | lowHPBoost .6 | execute .6（语义错位） | 改键 |
| shiliu/diansu | 偷盾/碎盾先于伤害 | 后于伤害（永不触发） | 前置结算 |

### 5.3 保留的设计性偏差（已知、未修改）

| # | 偏差 | 涉及 |
|---|------|------|
| E-1 | 攻击回蓝：单人 `min(8+伤/6, 15/30)`，联机平铺 15/30（联机对低攻单位更宽松） | 全体 |
| E-2 | dash 不做位移（单人会突进到目标身侧） | kouichi/hoshimi/zhijin/shadow/nox/miyue/youyu |
| E-3 | ein 破盾反击（counter .24）未移植 | ein |
| E-4 | agari 心拍爆发（tempo）未移植 | agari |
| E-5 | hoshimi 击杀刷新位移未移植 | hoshimi |
| E-6 | chiharu 两段合计 165% 合并为单次 165%（总量等价） | chiharu |
| E-7 | tiandou 盾破回蓝 8（v3ShieldMana 触发时机不同）未移植 | tiandou |
| E-8 | aza 震荡圈（zone dps .18）未移植 | aza |
| E-9 | pako 溢疗转盾改为固定 18% 盾 | pako |
| E-10 | sishi 季节效果单人按跳数轮换、联机随机 | sishi |
| E-11 | suiji 急速单人只给自己、联机给全队；shengge 急速单人只给被净化者、联机给全队 | suiji/shengge |
| E-12 | xuezhu 冰封禁区（目标脚下 r1 持续区）简化为自身半径 3 的即时范围 | xuezhu |
| E-13 | zeyin 每个受伤队友的水波回响未移植 | zeyin |
| E-14 | sanli 沉默仅末跳 vs 联机每跳；shiliu 眩晕需偷到盾 vs 联机无条件 | sanli/shiliu |
| E-15 | lianshiye 施法回响（echo .35）未移植 | lianshiye |
| E-16 | huize 禁疗（healBlock 3.2s）未移植 | huize |
| E-17 | nox 残影爆炸未移植 | nox |
| E-18 | miyue dashCleave 简化为原地 cleave | miyue |
| E-19 | huali 低血加成、mumu 满血转盾、kroya 混沌裂变、seki 半径3 领域→半径1 cleave、haruka 被削弱者回蓝(mana:4 目前为表中惰性参数)、azi 每命中回蓝 6、liAn 锚点高攻敌+半径4+易伤、rei 疗转伤、rinco 吸血永久化等子机制简化 | 各自 |
| E-20 | zhouyi 破盾：单人仅「击破护盾后强化下一击 80%」，联机额外每击直接剥盾（更强）；联机无盾时也置强化标记 | zhouyi |
| E-21 | youyi 共护：单人 8s 冷却+22% 阈值，联机每战一次+20% 阈值；soulmate 无 22% 触发条件的细节差异 | youyi |

## 六、测试证据

命令：`cd F:/demo/autochess && node --test online/skills.test.js online/combat.test.js online/core.test.js`

```
✔ SKILLS covers exactly the 50 roster pieces with the documented passives
✔ every active piece casts and produces its mode signature output
✔ hard control kits (stun/freeze/petrify) freeze the enemy timeline
✔ silence kits delay the enemy cast past the silence duration
✔ mana burn kits emit manaBurn and strip enemy mana
✔ slow kits stretch the enemy swing timer
✔ shield interaction kits: shiliu steals, diansu shatters, zhouyi strips passively
✔ yuji rainveil: builds rain stacks, converts them into guaranteed dodges and shields
✔ youyi soulmate: attacks heal self and the lowest ally
✔ miting reflectSkill punishes the next enemy skill
✔ skill power follows the solo cost/star curve (star-2 hits harder, cost curves intact)
✔ full eight-player game: fielded non-passive pieces cast across the season
✔ same seed and formations give byte-identical battle and do not mutate inputs   (combat.test.js)
✔ every active solo combat kit can cast through the deterministic resolver       (combat.test.js)
✔ seeded bond procs, healing skills, and equipment triggers are replayable        (combat.test.js)
✔ incomplete rounds retain both survivor lists; a knockout marks the result complete (combat.test.js)
✔ real 8x8 placement changes the travel path and rejects overlapping anchors      (combat.test.js)
✔ solo armor, item and distinct-ID bond calculations affect combat events          (combat.test.js)
✔ invalid IDs, item IDs, and board lengths fail closed                             (combat.test.js)
✔ seed replay, eight seats and private shop/bench ... （core.test.js 9 例全部通过）
ℹ tests 27  ℹ pass 27  ℹ fail 0  ℹ cancelled 0  ℹ skipped 0
```

（连续两次运行结果集完全一致，仅耗时数字不同——确定性验证通过。）

## 七、修改文件清单

- `online/combat.js` — 修复 7 处（星级倍率查键、减速死代码、偷盾/碎盾顺序、反噬方向、likou/miting/rei 漏项、nana7mi 误键），`SKILLS` 改为导出。
- `online/skills.test.js` — 新增（12 用例：50 棋子逐个验证、控制/减速/被动探针、5 局整局覆盖统计）。
- `specs/online-skills-audit-2026-09-29.md` — 本报告。
- 未改动：`online/core.js`（未发现确凿 bug）、`index.html`、`online/client.js`、`online.html`、`server-online/`、`tools/`、`sw.js`、既有两个测试文件。

## 八、遗留建议（未实施）

1. E-2 dash 位移：联机引擎有 BFS 寻路，可为 dash 模式加「施放时贴到目标身侧」，消除最大的一类体感差异。
2. E-19 haruka 的 `mana:4` 目前是表中惰性参数，建议要么实现「被削弱者攻击时回蓝」要么从表中去掉以免误导。
3. 净化（cleanse）的实战价值受 skillCd(3000) ≥ 最长控制(3000) 限制，多数情况下与自然解控赛跑；若要贴近单人体验，可考虑施法前置净化或缩短 skillCd。
4. 移动速度未受减速影响（仅攻速受影响），如需对齐单人可给 `tick%3` 步频加同样的 (1+slowPct) 因子（会显著改变现有对局时间线，建议随下个 ruleset 版本一起做）。
