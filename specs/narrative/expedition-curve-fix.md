# 巡演企划 · 费用曲线缺口与修复规格（C + D）

> **状态**：分析已实测完成，修复**未实施**。本文不改任何代码，产出可直接执行的规格与 diff。
> **上游**：`tour-project.md`（巡演总纲）、`handoff-implementation.md`（叙事实施包）。
> **对象**：`expedition`（巡演企划）的**棋子获取曲线**。**经典模式族不受影响是硬前提**。
> **读者**：执行 agent（`index.html` + `tools/solo-modes.js` + `tools/solo-host.js`）。
> **决策**：2026-09-26 用户确认采用 **方案 C（站进度解锁费用档）+ 方案 D（特邀嘉宾兜底）**。

---

## 0. 问题陈述

用户质疑：**「巡演企划有不同费用的棋子，这样设计完全照顾不了高费用的棋子」**。

实测结论：**成立，且比「照顾不到」更严重——费用分层在巡演里塌缩成单层。**

- 5 费棋子共 **8 枚**，占全作 50 枚的 16%；
- 但在巡演的**前 1.5 站（第 1 站全部 + 第 2 站大半），5 费棋子的出现概率是 0%**；
- 玩家的阵容核心被迫停留在 1–3 费，4 费是奢侈品，5 费是传说。

---

## 1. 证据（全部可复现）

### 1.1 棋子获取只有三个入口

| 入口 | 位置 | 说明 |
|---|---|---|
| 开局配给 | `tools/solo-host.js:82-88` | 等级 **Lv3**、**16 金**、直接送 **2 枚 1 费**（守护 + 远程）+ 2 件装备 |
| 商店 | 复用主引擎 `rollShop()`（`index.html:3254`） | 按 `S.lvl` 查 `SHOP_ODDS`（`:3231`）抽费用档 → 再从 `S.pool` 加权抽取（`drawFromPool` `:3234`） |
| 定向邀约 | `tools/solo-modes.js:379` | reward 三选一之一，`reward:recruit:{守护\|游侠\|法师}`——**只保定位，不保费用档** |

> 第三项是关键：即使选了定向邀约，商店仍按等级抽档，低等级下依然抽不出高费。

### 1.2 三条「没有」决定了一切

| 缺失项 | 证据 |
|---|---|
| 没有自然经验 | 巡演经验唯一来源是每场公演 `+3 xp`（`solo-host.js:189`）；经典模式每回合的 `+2` 在 `index.html:6870`，巡演不走该路径 |
| 没有回合基础金币 | `baseIncome()` 对 `S.solo` 直接 `return 0`（`index.html:2233`） |
| 没有利息 | `interestGain()` 对 `S.solo` 直接 `return 0`（`index.html:2237`） |

⇒ 经典模式最核心的「攒钱吃利息、滚雪球升等级」策略，**在巡演里不存在**。

### 1.3 回合数只有经典的 1/5

`S.round = S.soloBattles + 1`（`solo-host.js:186`）——**只有打公演才算一个回合**，休息 / 事件 / 商店都不推进。

- 巡演上限：3 站 × 6 格 = **18 回合**（且必须全部选公演）
- 经典模式：**100 回合**

附带后果：商店**不会自动刷新**（回合不动 ⇒ 货架不动），玩家必须手动花 **2 金/次**刷新（`refreshCost()` `index.html:2185`）。

### 1.4 等级天花板 = 7 级（关键数字）

`XP_NEED = {1:1, 2:1, 3:3, 4:4, 5:8, 6:32, 7:48, 8:56, 9:64, 10:72}`（`index.html:2447`）

从 Lv3 起累计需求：

| 目标 | 3→4 | 3→5 | 3→6 | **3→7** | 3→8 | 3→9 | 3→10 | 3→11 |
|---|---|---|---|---|---|---|---|---|
| 累计 xp | 3 | 7 | 15 | **47** | 95 | 151 | 215 | 287 |

**18 场 × 3 = 54 xp** ⇒ 越过 47、够不到 95 ⇒ **自然等级天花板 = 7 级**（余 7 xp）。

注意 **6→7 的陡坡**：从 8 直接翻到 32，恰好落在巡演第 2 站。

### 1.5 各等级的高费概率（5 格独立判定，`SHOP_SIZE=5`）

| 等级 | 4 费 / 格 | 5 费 / 格 | 每店至少 1 张 4 费 | 每店至少 1 张 5 费 |
|---|---|---|---|---|
| Lv3 | 0% | 0% | 0% | 0% |
| Lv5 | 2% | 0% | 9.6% | **0%** |
| **Lv6** | 7% | **0%** | 30.4% | **0%** |
| **Lv7（巡演自然上限）** | 10% | 2% | 41.0% | 9.6% |
| Lv8 | 16% | 4% | 58.2% | 18.5% |
| Lv9 | 22% | 7% | 71.1% | 30.4% |
| Lv10 | 27% | 11% | 79.3% | 44.2% |
| Lv11（经典上限） | 32% | 16% | 85.5% | 58.2% |

### 1.6 买等级在经济上不可行

- 上 8 级：还需 41 xp = 11 次买经验 ×5 金 = **55 金**
- 上 9 级：累计 151 xp，即再 97 xp = 25 次 = **125 金**
- 巡演**理论金币上限 ≈ 193 金**（初始 16 + 节点收益 69 + 18 次胜利三选一全选金币 108）

这 193 金还要买棋子（4–5 费单价 4–5 金，凑 2★ 需 3 张）与刷新（2 金/次）。⇒ **靠买经验爬档走不通。**

另：`solo-host.js:119` 把 `levelUp` 封在 `Math.min(10, ...)`，所以即便每站都撞上「彩排」也到不了 Lv11。

### 1.7 敌人却在升级

`solo-modes.js:377`：`encounter(name, s.chapter + (elite?1:0), 3 + s.chapter + (elite?1:0), ...)`

| 站 | tier | count |
|---|---|---|
| 第 1 站 | 1（特别舞台 2） | 4（特别舞台 5） |
| 第 2 站 | 2（3） | 5（6） |
| 第 3 站 | 3（4） | 6（7） |

⇒ **你停在 7 级，对手在升级。** 后期难度实际由「你刷不到人」撑起，而非策略深度。

### 1.8 卡池量（封顶不担心缺货）

`POOL_COPIES = {1:50, 2:40, 3:30, 4:20, 5:10}`（`index.html:1396`）
⇒ 5 费：8 枚 × 10 张 = **80 张**，池量充足。

---

## 2. 根因（四层叠加）

| # | 根因 | 证据 |
|---|---|---|
| 1 | **量级差 5 倍** | 18 回合 vs 100 回合（`solo-host.js:186`） |
| 2 | **经济只出不进** | 无基础金币、无利息（`index.html:2233/2237`） |
| 3 | **XP 陡坡落在中段** | 6→7 需 32 点，超过 3→6 全部所需（15 点）的两倍 |
| 4 | **敌方强度逆势上涨** | `count` 4/5/6、`tier` 1/2/3（`solo-modes.js:377`） |

---

## 3. 设计原则（修复必须满足）

1. **不改经典模式**：`SHOP_ODDS` / `drawFromPool` 是**主引擎与经典模式共用**（`index.html:3231/3234`）。任何改动必须以 `S.solo.mode === 'expedition'` 严格门控。
2. **叙事自洽**：巡演越深 → 舞台越大 → 愿意同台的人越大牌。这正是**「共演律」的具象化**。
3. **降低方差焦虑**：每站的费用池更小、更可预期，玩家能围绕「本站能出什么」做规划。这符合**粉丝优先**的产品定位。
4. **规则层与渲染层分离**：概率表属规则层，放 `tools/solo-modes.js` 并由 `node --test` 覆盖；不得写进 DOM 层。

---

## 4. 方案 C：站进度解锁费用档

### 4.1 核心设计

**用「站」而非「等级」决定商店费用档**——两个维度解耦：

| 维度 | 由谁决定 | 作用 |
|---|---|---|
| **商店能买到多贵** | **站数（chapter）** | 费用档概率 |
| **能同时上几个** | 等级（`S.lvl`） | 人口上限（`lvlCap()` = 11，仍有效） |

⇒ 玩家决策变清晰：**等级管「上几个」，站数管「买多贵」。**

### 4.2 新概率表（`tools/solo-modes.js`）

```js
/* 巡演专用商店费用档概率（%，1~5 费）。与 SHOP_ODDS 无关：
   巡演用「站」而非「人口等级」决定能买到多贵。每站合计 100，无需归一化。 */
const expeditionOdds = {
  1: [52, 32, 16, 0, 0],   // 第1站：1-3 费（3 费登场）
  2: [30, 30, 24, 16, 0],  // 第2站：4 费登场
  3: [18, 26, 26, 20, 10]  // 第3站：5 费登场
};
```

效果对照（5 格独立判定）：

| 站 | 最高可出 | 每店至少 1 张最高档 | 对比现状 |
|---|---|---|---|
| 第 1 站 | 3 费（16%/格） | **58.2%** | 现状 3 费 ~30%，略降但更稳 |
| 第 2 站 | 4 费（16%/格） | **58.2%** | 现状 4 费仅 7–10% |
| 第 3 站 | 5 费（10%/格） | **41.0%** | 现状 0–2%（几乎不可能） |

### 4.3 新增导出

`tools/solo-modes.js:767` 的导出对象追加一个函数：

```js
return { definitions, create, view, act, settle, expeditionShopOdds };
```

函数实现（放在 `expeditionOptions` 附近，`solo-modes.js:71` 之后）：

```js
/* 巡演商店费用档：按站返回 5 档概率（%）。chapter 越界按第 3 站处理。 */
const expeditionShopOdds = chapter => (expeditionOdds[chapter] || expeditionOdds[3]).slice();
```

### 4.4 `index.html` 的接入（唯一一处引擎改动）

**位置**：`drawFromPool()`，`index.html:3239` 的 `const odds = ...` 之后插入。

现有代码（`:3237-3239`）：
```js
  const dm=dailyMods();
  const lv = dm&&dm.shopLevelByRound ? dm.shopLevel : hasCurse('solo') ? (S.lvl>=lvlCap() ? soloShopLvl() : S.lvl) : S.lvl;
  const odds = (SHOP_ODDS[lv]||SHOP_ODDS[11]).map(x=>x/100);
```

改成：
```js
  const dm=dailyMods();
  const lv = dm&&dm.shopLevelByRound ? dm.shopLevel : hasCurse('solo') ? (S.lvl>=lvlCap() ? soloShopLvl() : S.lvl) : S.lvl;
  /* 巡演企划：商店费用档由「站」决定，不走人口等级（见 specs/narrative/expedition-curve-fix.md） */
  const expedition = S.solo && S.solo.mode === 'expedition';
  const odds = (expedition
    ? SoloModes.expeditionShopOdds(S.solo.chapter)
    : (SHOP_ODDS[lv]||SHOP_ODDS[11])).map(x=>x/100);
```

> ⚠️ **两个必须写对的点**：
> 1. 判断条件是 **`S.solo && S.solo.mode === 'expedition'`**（单人模式状态对象），**不是** `hasCurse('solo')`——后者是「🪑 独木桥」**诅咒**（`index.html:1972`），两者同名但完全无关。混淆会导致经典模式被污染。
> 2. 表内合计已是 100，**直接替换即可，不要做清零 + 归一化**。若采用清零式实现，`drawFromPool` 里 `let primary=5` 的兜底（`:3241-3242`）会把剩下的概率质量**错误地全落到 5 费**——这是个隐蔽陷阱。

---

## 5. 方案 D：特邀嘉宾（高费兜底）

C 解决全局节奏，D 解决「运气差刷不到」，并给玩家一条**确定性的获取路径**。

### 5.1 新增 reward 选项（`tools/solo-modes.js:379`）

现有 `reward` 阶段只有 5 个选项（gold / relic / 3×job）。在其后**按站追加**（不改动任何现有 id）：

| 站 | 新增 choice id | label | description |
|---|---|---|---|
| 第 2 站起 | `reward:guest:4` | `特邀嘉宾 · 4 费` | `下次周边商店保证出现一名 4 费成员` |
| 第 3 站起 | `reward:guest:5` | `特邀嘉宾 · 5 费` | `下次周边商店保证出现一名 5 费成员` |

参考实现：
```js
      if (s.phase === 'reward') {
        const rewardChoices = [
          choice('reward:gold', '领取巡演收益', '+6 金币'),
          choice('reward:relic', '领取应援纪念物', '随机获得：返场耳返（施放曲目后获得应援屏障）、全息伴舞（首次演绎曲目时召来伴舞）、应援手灯（台前成员承受伤害降低）'),
          ...['守护', '游侠', '法师'].map(job => choice(`reward:recruit:${job}`, `定向邀约·${job}`, `下次周边商店保证出现${job}定位成员`))
        ];
        if (s.chapter >= 2) rewardChoices.push(choice('reward:guest:4', '特邀嘉宾 · 4 费', '下次周边商店保证出现一名 4 费成员'));
        if (s.chapter >= 3) rewardChoices.push(choice('reward:guest:5', '特邀嘉宾 · 5 费', '下次周边商店保证出现一名 5 费成员'));
        base.choices = rewardChoices;
      }
```

> `label` / `description` 措辞可按 `classic-mode-copy.md` 的声音规范再调，但**必须保持 0 禁用词**（见 §7.1）。

### 5.2 effects 字段

**① `empty()` 增加默认字段**（`solo-modes.js:33`，末尾追加 `guest: null`）：
```js
  const empty = () => ({ gold: 0, hp: 0, items: [], refresh: 0, log: [], levelUp: 0, fortification: null, buildPoints: 0, recruit: null, swapArmy: null, armyUnlocked: null, puzzleReset: false, guest: null });
```

**② `act()` 的 expedition reward 分支**（`solo-modes.js:527` 之后追加一行）：
```js
        if (choiceId.startsWith('reward:guest:')) fx.guest = Number(choiceId.slice('reward:guest:'.length));
```

### 5.3 消费逻辑（`tools/solo-host.js`）

**位置**：`apply()` 内，紧邻现有 `fx.recruit` 分支（`:133-138`）之后；**不要动 recruit 的既有实现**。

```js
    if (fx.guest) {
      /* 特邀嘉宾：在货架首格保底一名指定费用档的成员（不替换整店，与 recruit 的整店替换语义区分） */
      const want = Number(fx.guest);
      const pool = UNITS.filter(d => d.cost === want && S.pool[d.id] > 0);
      if (pool.length) {
        const pick = pool[Math.floor(rand() * pool.length)];
        if (S.shop[0]) S.pool[S.shop[0].id]++;
        S.shop[0] = pick; S.pool[pick.id]--;
        log(`特邀嘉宾登场：货架已为「${pick.name}」保留席位。`);
      } else {
        log('特邀嘉宾档位暂时无货，本次未能安排。');
      }
    }
```

> **语义区别**（写文档时务必保留）：`fx.recruit`（现有）是**整店替换为该定位的棋子**；`fx.guest`（新增）是**只保底货架首格**。不要合并两者。

---

## 6. 影响面与断言

### 6.1 会碰到的

| 项 | 位置 | 处置 |
|---|---|---|
| `solo-modes.js` 导出对象 | `:767` | 追加 `expeditionShopOdds` |
| `solo-modes.js` reward choices | `:379` | 改为按站追加（**不得删除任何现有 id**） |
| `solo-modes.js` `empty()` | `:33` | 追加 `guest: null` |
| `index.html` `drawFromPool` | `:3239` | 插入巡演分支（唯一引擎改动） |
| `solo-host.js` `apply` | `:138` 后 | 追加 guest 消费块 |
| SW 版本 | `sw.js:2` | `CACHE` 升版（现为 `vcache-v64-no-drop-strip` → v65） |

### 6.2 不会碰到的（**已验证**）

| 现有断言 | 为什么不受影响 |
|---|---|
| `solo-modes.test.js:77` `reward:recruit:守护` 存在 | D 只**新增** choice，不删不改 |
| `solo-modes.test.js:95-96` recruit effects | recruit 链路零改动 |
| `solo-modes.test.js:67-69` visibleCopy 禁用词 | 新文案「特邀嘉宾 / 4 费 / 5 费」不在 12 个黑名单词内 |
| `solo-modes.test.js:41` `route.length === 18` | 改的是商店抽取，不是节点结构 |
| 三站 18 战 / 压轴机制序（`shield/charge/summon`） | 未触及 `settle` 与 `bossKinds` |
| `solo-modes.test.js:83-87` 事件效果签名 | 未触及 event 分支 |
| `solo-modes.test.js:90` `camp:heal` → hp 20 | 未触及 camp 分支 |
| **经典模式全部平衡** | `S.solo` 为 null 时走原路径（§4.4 的条件判断是唯一保障） |

> ⚠️ 与叙事实施包的关系：**本方案不冲突，但会改 `solo-modes.js` 的同一个 reward 分支（`:379`）**。若 `handoff-implementation.md` 的 **M1** 尚未执行（M1 会改 `:373/379/380/381/382` 的 description），**必须让 M1 先行**，否则两批改动在 `:379` 上产生冲突。见 §8 顺序。

---

## 7. 红线

1. **不得改 `SHOP_ODDS` 本体**（`index.html:3231`）——它是经典模式的平衡基准。
2. **不得动 `hasCurse('solo')` / `soloShopLvl()` / `soloBoostBuy()` 这条「独木桥」链路**（`index.html:2192/2221`）。它是每日挑战的规则，**与巡演同名但无关**。巡演若直接挂该诅咒，人口会被封死在 5，而第 3 站敌人有 6–7 人 ⇒ 必然打不过。
3. **不得删除或改名任何现有 choice id**：`reward:gold` / `reward:relic` / `reward:recruit:{守护\|游侠\|法师}`（`solo-modes.test.js:77` 锁死）。
4. **不得改节点收益数值**（+3/+5/+8 金币、−3/−5/−7 体力、+5 体力等）——那是体力经济，与本缺口无关。
5. **不得顺手改 XP 曲线或加基础金币/利息**——超出本规格范围，会撞 §6.2 的多条断言。
6. **零新增配音**（`tour-project.md` §0.3 R6）：本方案纯数值，不涉及任何音频。

---

## 8. 实施顺序与 owner

```
[C-1] solo-modes.js  新增 expeditionOdds 表 + expeditionShopOdds + 导出      ← 纯规则层
[C-2] index.html     drawFromPool 插入巡演分支                               ← 引擎层，唯一改动点
[D-1] solo-modes.js  empty() 加 guest + reward 追加 2 个 choice + act 处理
[D-2] solo-host.js   apply 追加 guest 消费块
[T]   solo-modes.test.js 新增断言（见 §9）
[SW]  sw.js CACHE 升版
```

- **C-1 与 D-1 必须同一人顺序做**（都改 `solo-modes.js`）。
- **C-2 与 D-2 建议同一人**（都属主引擎域，且都在「按 effects 落地」这条链上）。
- **与叙事实施包的顺序约束**：若 `handoff-implementation.md` 的 **M1** 未执行，**先做 M1**（它改 `:379` 的 description）→ 再做本方案（它也改 `:379` 的结构）。两者不可并行。
- **C 与 D 可分别提交**：D 不依赖 C 的函数（`fx.guest` 只依赖新的费用档概率才有意义，但代码上独立）→ 允许分两次提交、分别回滚。

---

## 9. 验收

### 9.1 自动化

```bash
cd F:/demo/autochess
node --test tools/solo-modes.test.js     # 原有 14 条必须全绿 + 新增断言
node tools/sim.js 300                    # 经典模式通关率/TTK 不应显著变化（sim 跑经典模式）
```

**新增断言建议**（追加到 `tools/solo-modes.test.js`）：

```js
test('expedition shop odds unlock by station and never expose high tiers early', () => {
  const o1 = M.expeditionShopOdds(1), o2 = M.expeditionShopOdds(2), o3 = M.expeditionShopOdds(3);
  assert.equal(o1.length, 5);
  [o1, o2, o3].forEach(o => assert.equal(o.reduce((a, b) => a + b, 0), 100, 'each station must total 100'));
  assert.equal(o1[3], 0, 'station 1 must not expose 4-cost');
  assert.equal(o1[4], 0, 'station 1 must not expose 5-cost');
  assert.equal(o2[4], 0, 'station 2 must not expose 5-cost');
  assert(o2[3] > 0, 'station 2 must expose 4-cost');
  assert(o3[4] > 0, 'station 3 must expose 5-cost');
  assert.equal(M.expeditionShopOdds(9).join(), o3.join(), 'out-of-range chapter falls back to station 3');
});

test('expedition guest reward appears from station 2 and carries a cost tier', () => {
  const s = M.create('expedition', 41);
  const st1 = M.view({ ...s, phase: 'reward', chapter: 1 });
  assert.equal(st1.choices.some(c => c.id === 'reward:guest:4'), false, 'no guest at station 1');
  const st2 = M.view({ ...s, phase: 'reward', chapter: 2 });
  assert(st2.choices.some(c => c.id === 'reward:guest:4'));
  assert.equal(st2.choices.some(c => c.id === 'reward:guest:5'), false, 'no 5-cost guest before station 3');
  const st3 = M.view({ ...s, phase: 'reward', chapter: 3 });
  assert(st3.choices.some(c => c.id === 'reward:guest:5'));
  assert.equal(M.act({ ...s, phase: 'reward', chapter: 3 }, 'reward:guest:5').effects.guest, 5);
  /* 既有邀约不得被破坏 */
  assert(st3.choices.some(c => c.id === 'reward:recruit:守护'));
});
```

### 9.2 浏览器手工验收

| 检查 | 期望 |
|---|---|
| 新开巡演，第 1 站任意商店 | 货架**不出现** 4 费、5 费 |
| 第 2 站商店 | 能见到 4 费；**不出现** 5 费 |
| 第 3 站商店 | 能见到 5 费（多刷几次） |
| 第 2 站 reward 面板 | 出现「特邀嘉宾 · 4 费」；第 1 站不出现 |
| 选「特邀嘉宾 · 5 费」后 | 货架首格确为某张 5 费棋子，且日志有播报 |
| **新开经典模式普通模式** | 商店概率与改动前**完全一致**（这是最重要的回归项） |
| 每日挑战「独木桥」诅咒 | 行为不变（仍走 `soloShopLvl()`） |

---

## 10. 回滚

| 范围 | 方式 |
|---|---|
| C | `git revert`（改 `solo-modes.js` + `index.html`） |
| D | `git revert`（改 `solo-modes.js` + `solo-host.js`）—— **不依赖 C**，可单独回滚 |
| 存档 | `fx.guest` 是新增的可选字段，旧存档不含它 ⇒ 读到 `undefined` 即不触发；**无需迁移** |

> 触发回滚的信号：经典模式商店概率发生变化（说明 §4.4 的条件判断写错或被绕过）。

---

## 11. 未采用方案（供后续参考）

| 方案 | 内容 | 为什么不选 |
|---|---|---|
| **A. 商店升档** | 借用项目现成的 `soloShopLvl()`（`index.html:2192`）让商店品质随回合升档至 11 级 | 机制现成、测试齐（`tools/_solo_tests.js:15-105`），但**不能直接挂该诅咒**（会把人口封死 5，见 §7.2），只能借函数重写计时；且「排班 + 提前升档」比「站进度」更难向玩家解释，叙事上也接不上「共演律」 |
| **B. 巡演专用 XP 曲线** | 重做 `XP_NEED` 让 18 场能升到 9–10 级 | 纯数值调参、无叙事收益；需新增一张表 + 测试；且会让「巡演」和「经典」的等级语义分叉 |
| （备选）给巡演加基础金币/利息 | 缓解经济紧张 | 直接改节点经济平衡，撞多条金币/体力断言，风险高于收益。**如确有需要，应另立规格** |

---

## 12. 一句话总结

**巡演的问题不是「高费棋子太难拿」，而是「费用分层根本不存在」。**

C 用「站」替代「等级」决定商店档位，让 4 费在第 2 站、5 费在第 3 站**确定性地入场**；D 用「特邀嘉宾」给玩家一条不依赖运气的获取路径。两者都只用一句话就能向玩家解释：

> **巡演越深，舞台越大，愿意同台的人越大牌。**
