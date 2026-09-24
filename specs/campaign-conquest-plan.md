# 战役征服 v2（ARPG 化重制）实施计划

> 2026-09-24 定稿。目标读者：接手执行的 agent。改动范围：`tools/solo-modes.js`（conquest 分支重写）、`tools/solo-host.js`、`tools/solo-ui.js`、`tools/solo-ui.css`、新增 `tools/campaign-map.js` 与 `assets/campaign/`、`index.html`、`sw.js`。
> 本文件是唯一执行依据；与记忆/口头描述冲突时以本文件为准。

---

## 1. 背景与现状盘点

现有「战役征服」是五种单人模式之一，已实现但只是骨架：

- **规则层** `tools/solo-modes.js`：6 节点固定小图（本营/矿区/城镇/山口/要塞/敌方主城），depth 决定补给消耗；3 支军队（攻占 town/fort 各解锁一队）、行动点、补给、敌军 telegraph（每 3 回合袭击预告）；据点 modifier（fortified/highground）；主城战斗在已占要塞时减员、已占山口时敌攻 -10%。纯函数、可 JSON 序列化、无 DOM，`node --test` 已覆盖。
- **引擎桥** `tools/solo-host.js`：encounter → 敌方棋盘生成（seeded、按 tier 缩放、词缀倍率表）、Boss 机制 tick（护盾/蓄力/召唤/半血狂暴）、`soloRetry` 备战检查点、按模式独立存档 `vc_solo_v1_<mode>`。
- **UI 层** `tools/solo-ui.js`：大厅卡片 + 游戏内面板，全部是**文字按钮**，没有地图可视化。
- **缺口**：无完整战役流程（一场战斗打赢 6 据点就通关）、无地图画面、无幕/难度/奖励循环、无 Boss 差异、无 meta 进度。

其余五种模式的代码结构**不要动**：`expedition/hunt/puzzle/siege` 的分支保持原样。

## 2. 设计目标与非目标

**目标**
1. 完整 ARPG 式战役闭环：选难度 → 幕开场 → 地图选路 → 节点玩法 → 奖励 → 幕 Boss → 结算解锁下一幕 → 通关解锁更高难度 → 失败有检查点重试。
2. 地图可视化：AI 生成幕底图 + 节点路网叠加，节点状态（未探明/可攻/已占/受威胁）一目了然。
3. 保留并深化现有精髓：据点占领、补给线、军队、敌袭 telegraph。
4. 全部规则保持纯函数 + 可序列化（现有架构红线）。

**非目标**
- 不做实时走格子/RTS；战斗仍走现有自动战斗引擎。
- 不做剧情对话系统（幕开场用标题卡 + 一句文案）。
- 榜单上线（P3，见 §9）。
- 其他四种单人模式与经典挑战/每日/竞技的任何行为变化。

## 3. ARPG 参考对照表

| ARPG 元素（参考暗黑破坏神 / 哈迪斯 / 杀戮尖塔） | 本作实现 |
| --- | --- |
| 幕（Act）+ 世界地图 | 4 幕，每幕一张 AI 底图 + 节点 DAG 路网 |
| 难度层 普通/噩梦/地狱 | 难度 I/II/III，通关前一档解锁，敌倍率 + 精英词缀数 + 奖励倍率递增 |
| Waypoint / 区域控制 | 已占节点 = 补给线网络；军队驻防与移动（沿用 armies）；矿区+金、城镇+补给、要塞+减伤 |
| 敌军反攻 | telegraph 保留：预告 2 回合后袭击某已占节点 → 可驻军防守（防守战）或放弃 |
| 精英词缀 | 词缀池：fortified（已有）、highground（已有）+ 新增 swift（+速）、regen（回血）、split（双线，已有 split 机制） |
| Boss 多阶段 | tick 机制扩展为幕 Boss 专属脚本（数据驱动，见 §6.4） |
| 宝箱/装备掉落 | treasure 节点三选一（装备 or 纪念物） |
| 遗物 | 复用 expedition 的 relics 机制（回响护符/召唤核心/坚守旗帜/冒险徽章），战役内全幕生效 |
| 死亡与检查点 | 本营耐久归零 = 战役失败（tombstone 存档）；可从「幕起点检查点」重开本幕 |
| 图鉴/成就（轻量） | `vc_campaign_meta`：最高通关难度、各幕首通、Boss 击杀记录 |

## 4. 幕与世界结构

四幕主题延续现有据点世界观（本营→矿区→城镇→山口→要塞→主城），对应「黑金棋馆」视觉：

| 幕 | 名称 | 主题 | 节点数 | 幕 Boss（机制） |
| --- | --- | --- | --- | --- |
| 1 | 破晓低地 | 矿区/村落 | 8–10 | 矿监巨像（shield） |
| 2 | 灰烬隘口 | 山口/要塞 | 10–12 | 隘口守将（charge） |
| 3 | 静默王城 | 城镇/王城 | 10–12 | 摄政影卫（summon） |
| 4 | 深渊主城 | 决战 | 8–10 | 深渊之主（组合：半血后依次触发 shield→charge→summon，即真·三阶段） |

- 每幕节点为**分层 DAG**（6–7 层 × 每层 1–3 节点），seeded 生成（种子入存档，同种子同图，满足验收标准的「同一随机种子复现遭遇」）。
- 固定约束：第 1 层全 battle；末层 boss；倒数第 2 层必有 rest；每幕 stronghold（据点）≥2、elite ≥1、shop ≥1。
- 节点类型权重（中间层）：battle 40% / stronghold 15% / elite 12% / treasure 10% / event 10% / shop 8% / rest 5%。

## 5. 完整流程定义

```
主界面 → 单人玩法大厅（conquest 卡片新增难度选择 I/II/III，未解锁置灰）
  → 幕开场标题卡（底图 + 幕名 + 一句文案）
  → [地图] 选节点（相邻可攻）→ 节点玩法：
       battle/elite/stronghold/boss → 备战 → 开战 → 结算 → 奖励 → 回地图
       treasure → 三选一     shop → 折扣购买     rest → 回血/升星
       event → 文本事件 2–3 选项
  → 敌袭预告倒计时归零：若目标节点有驻军 → 防守战（胜=奖励+保据点，败=丢据点+本营耐久-4）
  → 本营耐久 ≤0 → 战役失败：tombstone 结算，提供「重开本幕（检查点）」/「返回大厅」
  → 幕 Boss 胜利 → 幕结算卡（首通记录 + 解锁下一幕）→ 下一幕
  → 第 4 幕 Boss 胜利 → 通关结算：记录 vc_campaign_meta，解锁下一难度
```

- 幕间检查点：进入新幕时自动把「幕起点状态」写入存档（`campaignCheckpoint` 字段），失败重开本幕从这里恢复。战斗内失败仍走现有 `soloRetry`（备战快照）机制，两层不混淆。
- 奖励经济：金币跨节点保留（现有 `fx.gold`）；battle +3、elite +5、stronghold +3（矿区 +5）、幕 Boss +10——沿用现值，难度 II/III 乘 1.3/1.6。
- 军队：沿用 3 队上限与换队机制；v2 中军队 =「驻防标记」，同一时刻只有一队可发起进攻（AP=1），驻防队自动参与该节点防守战。

## 6. 技术设计

### 6.1 数据 schema（`solo-modes.js` conquest 分支，纯数据）

```js
// create('conquest', seed, { difficulty }) 追加：
{
  mode:'conquest', seed, difficulty: 1|2|3,
  act: 1..4, phase: 'map'|'fight'|'reward'|'treasure'|'shop'|'rest'|'event'|'defense'|'actClear'|'finished',
  hp, maxHp,                    // 本营耐久（难度 I: 15）
  map: { nodes: [{ id, kind, links:[...], layer, x, y, cleared, garrison }],
         owned:[ids], cursor:[可进攻节点] },
  armies:[{ id, node, ap }], activeArmy, supply, telegraph:{node, countdown},
  relics:[], itemsSeen:[],      // itemsSeen 仅记 id，供图鉴
  actCheckpoint: {...幕起点快照（clone 自身去掉 actCheckpoint）},
  stats:{ turns, battles, losses },
}
```

红线：**状态里只能存 id 与原始数值，不得存 UNITS/ITEMS 对象引用**；随机一律 `hash(seed, salt)` 确定性派生；所有分支可 `JSON.parse(JSON.stringify())` roundtrip（node --test 已有此类断言，照写）。

### 6.2 存档

- key 仍为 `vc_solo_v1_conquest`，`data.version` 升为 **2**；`solo-host.js read()` 仅对 conquest 接受 `version===2`，读到旧 v1 conquest 档时提示「战役已重制，请重新开始」并按无档处理。
- **其他四模式与 `vc_save4`/`vc_daily3`/`vc_arena3` 的存档字节不得变化**（specs/solo-acceptance.md 硬性要求，验收时会逐字节比对）。
- 新增 `localStorage['vc_campaign_meta']`（JSON：最高难度、各幕首通、Boss 击杀），写入失败静默降级（不影响战役本身）。

### 6.3 敌人生成与词缀（`solo-host.js enemy()` 扩展）

- 现有 scale 公式 `(0.8+tier*0.10)*mod` 不动；难度乘数 `diffMul = {1:1, 2:1.25, 3:1.5}`，词缀数 `{1:0, 2:1, 3:2}`（boss/elite 必带满）。
- 新词缀在 `modifyUnit`/`tick` 实现：swift（spdMul×1.2）、regen（每秒 1.5% maxhp）。
- 防守战：encounter.modifier = `'counterattack'`（敌 ×1.05），胜负后果由 `SoloModes.settle` 按 defense 分支处理。
- 幕 Boss：encounter 增加 `bossScript:{act}` 字段，`tick()` 里按脚本驱动多阶段（§3 表），全部走现有 `soloMechanic`/`soloEnraged` 通道，日志文案沿用现有双语段风格。

### 6.4 UI（新增 `tools/campaign-map.js`，扩展 `solo-ui.css`）

- 地图渲染：`position:absolute` 的节点按钮（SVG 图标 + 名称 + 状态描边）叠在底图 `<div>` 上；连线用内联 SVG `<path>`。状态样式：未探明（暗）/可攻（高亮呼吸）/已占（金色描边）/受威胁（红脉冲，telegraph）。
- 节点点击 → `SoloHost.action('attack:<id>' | 'move:<id>' | 'defend')`，复用现有 action 通道，**不新增并行调用入口**。
- 大厅：conquest 卡片加难度 select（复用 hunt/puzzle 的 `addModeSelector` 模式）。
- 手机端 ≤880px：**底图退化为纯背景，节点图改为纵向列表**（每行一个节点按钮）。教训：非触屏窄屏必须回退堆叠 flex 且防 `#main>*` flex 挤压，否则棋盘会盖住左栏（idol-redesign v10 事故）。底图必须 `background-image`，绝不参与布局流。
- 图标走现有 SVG mask 图标体系，不自造第五套风格。

### 6.5 AI 美术生成（M4）

| 资产 | 规格 | 数量 |
| --- | --- | --- |
| 幕底图 `assets/campaign/act{1..4}.webp` | 1920×1200，WebP q80，单张 ≤300KB | 4 |
| Boss 立绘 `assets/campaign/boss{1..4}.webp` | 512px，WebP q85（对齐 units_big 规格），用于幕开场卡/结算卡 | 4 |

- 生成工具：优先现有 GPT 重绘管线（先例 `assets/units_redraw` + `redraw_manifest.json`），或 Ark seedream（`~/.ark_key`，旧配方可复用）；prompt 要点：暗黑奇幻 + 黑金配色 + 俯视战棋地图感 + 顶部留空避 UI。
- **占位策略**：M1–M3 用 CSS 渐变 + SVG 完全跑通流程，文件名先定死；M4 生成后同名替换，代码零改动。
- sw 预缓存体积增量 ≈ 2–2.5MB，可接受（现有 ui 目录 6.7MB 先例）。

## 7. 里程碑（可分派给不同 agent，顺序执行，禁止并行改同一文件）

| # | 内容 | 文件触点 | 建议角色 | 完成判据 |
| --- | --- | --- | --- | --- |
| M1 | conquest v2 纯规则重写（§4/§5/§6.1）+ 单测 | `tools/solo-modes.js`、`tools/solo-modes.test.js` | coder | `node --test tools/solo-modes.test.js` 全绿；新增用例至少覆盖：seeded 地图确定性、JSON roundtrip、四幕全流程模拟通关、防守战胜负分支、幕检查点恢复、难度参数生效 |
| M2 | 引擎接线（§6.2/6.3） | `tools/solo-host.js` | coder | 存档 v2 读写 + 旧档降级；词缀/防守战/Boss 脚本生效；其他四模式存档字节不变（手测） |
| M3 | 地图 UI + 大厅难度选择 + 移动端 | 新增 `tools/campaign-map.js`、`tools/solo-ui.js`、`tools/solo-ui.css`、`index.html`、`sw.js`（登记新文件） | coder → reviewer 复审 a11y/焦点陷阱/回归 | 桌面地图可点选推进整局；≤880px 列表模式可用；Tab 焦点循环正常；sw CACHE 升 v53 且新文件已列入预缓存 |
| M4 | AI 美术生成与替换（§6.5） | `assets/campaign/*` | coder/主 agent | 8 张图入库且体积达标；同名替换后无代码改动、线上可见 |
| M5 | 平衡与自动化验收 | `tools/solo_browser_test.py`、`specs/solo-acceptance.md` | coder + reviewer | 浏览器集成用例新增 campaign 场景（启动/存档隔离/幂等结算/幕检查点/手机宽度冒烟）并全绿；模拟 3 种子 × 难度 I 通关率落在 60–85% 区间（超界调 `diffMul`/词缀，不动 bot） |
| M6 | 发布 | git + wrangler | coder | `wrangler deploy` 成功且线上抽查通过；specs 追加验收记录表 |

说明：
- M5 平衡只允许调 solo-modes/solo-host 内的**数值表**；`tools/bot_strategy.js` 一旦被触碰必须三种子配对回归并升 `?v=`——本计划默认**不触碰** bot。
- M3 完成前 M4 的图不会生效，二者无代码耦合，可并行。
- 角色定义见根 `AGENTS.md`（researcher/coder/reviewer/expert）；schema 或平衡框架若在 M1 中途发现矛盾，升级 expert，不要自行扩范围。

## 8. 每个里程碑都适用的不变量（背下来再动手）

1. **sw.js**：任何新文件或 `?v=` 变化 → 同步更新 ASSETS 预缓存列表 + `CACHE` 升版（当前 `vcache-v52-ally-outline` → 改动时 +1）+ `index.html` 引用处升 `?v=`。漏一步线上就是旧缓存。
2. **存档隔离**：动存档必须跑 specs/solo-acceptance.md 的逐字节隔离检查；`checkpoint()` 会 clone 整个 S，战役新增字段必须全部可 JSON 序列化。
3. **纯规则层纪律**：`solo-modes.js` 不得出现 DOM/window/游戏全局；host 层才允许碰引擎。
4. **playwright 页内断言用裸 `S`**（顶层 `let` 不挂 window；indirect eval 取不到 `curseSel` 这类顶层 let——已踩过）。
5. **Edit 工具可能把行尾翻成 CRLF**：提交/推送前 `git diff` 确认无假差异；远端推送走 `tools/api_push_multi.js` 时先确保 LF。
6. **`wrangler deploy` 偶发 fetch failed**：瞬态，重试即可；push 不自动上线，必须 deploy。
7. 特效/浮层定位若涉及：中心坐标 + `translate(-50%,-50%)` 契约。
8. 终局存档是 tombstone（保留 finished 状态）不是删除——失败结算后「重开本幕」基于 `actCheckpoint`，不要清档。

## 9. 榜单（P3，默认不做）

若后续要上「战役征服」榜（如：最低回合通关），前端先本地榜 + 预留 `vc_save` 提交位；**上线前必须同步部署 lb 云函数**（CloudBase MCP updateFunctionCode）——daily100 榜只发前端未部署云函数导致线上回退，是现成反例。做之前需用户确认。

## 10. 风险清单

| 风险 | 缓解 |
| --- | --- |
| 地图 UI 与战斗面板抢主区空间（棋盘 8081 布局已很满） | 地图放 `solo-panel` 上方独立区块，战斗阶段折叠；≤880px 列表化 |
| AI 底图风格跑偏（黑金棋馆体系） | prompt 固定风格关键词 + 先出 1 张样图给用户确认再批量 |
| conquest 状态膨胀导致存档超限 | 检查点只存幕起点（去重后 <20KB）；localStorage 写失败已有 catch 路径 |
| 4 幕全流程手动测试太长 | node --test 规则层全流程模拟 + 浏览器冒烟只跑幕 1 + `CAMPAIGN_FAST=1` 钩子（M2 实现：跳过战斗动画、每幕固定 3 节点） |
| 难度 III 过难/过易 | M5 用 3 种子模拟通关率校准，只调数值表 |

## 11. 实现备注（2026-09-25，以实现为准）

- **vc_campaign_meta 字段裁剪**：实际写入 `maxClearedDifficulty` + `lastClearedAt`（§6.2 的各幕首通/Boss 击杀记录暂不实现，难度门控消费已闭环）。
- **CAMPAIGN_FAST 语义**：仅战斗速度倍率（`window.CAMPAIGN_FAST`，≤1 视为 ×3，>1 为 ×N），spec §10 的「跳过动画/每幕固定 3 节点」未实现——浏览器验收靠 ×3 倍速已足够。
- **复审修复记录（A6）**：P1-1 checkpoint:retry 不再套用 soloRetry 战斗快照（防军队阵容错位）；P1-2 旧档「已重制」提示仅战役活跃时显示 + 大厅卡片显示失效摘要；P1-3 事件付费选项零金币禁用；P2-1 通关墓碑不可被 menuEnd 改写；P2-5 战役终局隐藏整局重开按钮；P2-6 地图 locked 节点真 disabled + destroy 焦点归还；P2-7 rest:heal 满血禁用；P2-8 防守失败撤回全部驻军；P2-3 actClear 显示 Boss 立绘角卡。
