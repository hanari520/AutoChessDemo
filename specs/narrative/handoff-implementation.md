# 巡演企划 · 实施交接包 v1.0

> **文档类型**：Handoff（实施交接）· 面向下游执行 agent
> **作者角色**：NarrativeDesigner（本包只做「叙事内容 + 实施规格」，**不含代码改动**）
> **上游**：`specs/narrative/tour-project.md`（**主线总纲，先读这一份**）、`specs/narrative/world-bible.md`（设定）、`specs/narrative/tour-script-v1.md`（剧本）、`specs/narrative/narrative-tour.js`（**已写好的完整数据**）、`specs/narrative/codex-50-lines.md`（50 人图鉴）
> **项目纪律**：`AGENTS.md`（角色分工）、`specs/level-design-plan-2026-09-25.md`（冻结项与红线）
> **⚠️ 规则层补充（同点冲突）**：`specs/narrative/expedition-curve-fix.md`（巡演费用曲线修复 C+D）——**它也改 `tools/solo-modes.js:379`**，与本包 **M1** 落在同一行。**必须先做 M1、再做曲线修复，两者不可并行**，详见该文 §8。
> **复核方式**：本包所有 `文件:行号` 均已用 grep 复核；`narrative-tour.js` 已通过 Node 校验（112 句台词 / 25 个声音 / 0 非法 id / 0 禁用词 / 三站零串味）
> **状态**：v1.0。**执行 agent 请严格按 M1→M2→M3→M4→M4b 顺序做，禁止并行改同一文件。**

---

## 0. 这份材料怎么用

| 你是谁 | 做什么 |
| --- | --- |
| **coder** | 按 §3 的精确 diff 做 M1 / M2 / M3 / M4 / M4b，跑 §12 的判据 |
| **reviewer** | 按 §11 验收清单逐条核，重点看 §10 红线 |
| **expert** | 只在 §10 出现「高风险信号」时介入 |
| 编排/主 agent | 按 §13 的分工与顺序派发，保证同一文件只有一个 owner |

**一句话**：叙事内容已经**全部写完**（`narrative-tour.js` + 三份文档），执行方**只需要把字符串搬进代码 + 加一个对白演出层**，不需要再创作。

---

## 1. 交付物清单

| 文件 | 状态 | 用途 |
| --- | --- | --- |
| `specs/narrative/world-bible.md` | ✅ 已完成 | 世界观三规则 + 8 人声音支柱 + 术语↔代码对照 |
| `specs/narrative/tour-script-v1.md` | ✅ 已完成 | 三站剧本 + 接入映射 + 分级方案 |
| `specs/narrative/narrative-tour.js` | ✅ **已完成（本包核心）** | 全量叙事数据，M4 原样复制到 `tools/narrative-tour.js` |
| `specs/narrative/codex-50-lines.md` | ✅ 已完成 | 50 人图鉴文本（Tier 2，可选里程碑） |
| 本文件 | ✅ 已完成 | 实施规格（diff / 断言 / 测试 / 验收 / 回滚） |

---

## 2. 事实锚点总表（全部已复核，可直接 grep）

| 事实 | 位置 | 现值 |
| --- | --- | --- |
| 巡演模式定义 | `tools/solo-modes.js:10` | `{ id:'expedition', name:'巡演企划' }` |
| 压轴机制序列 | `tools/solo-modes.js:16` | `['shield','charge','summon']` |
| 机制世界观名 | `tools/solo-modes.js:18` | 应援屏障 / 压轴蓄势 / 全息伴舞登场 / 侧台惊喜 |
| 纪念物标签 | `tools/solo-modes.js:19-21` | 返场耳返 / 全息伴舞 / 应援手灯 / 巡演纪念章 |
| 演出体力初值 | `tools/solo-modes.js:342` | `hp:20, maxHp:20` |
| 站内格数 | `tools/solo-modes.js:60,76` | 6 格，第 6 格强制压轴 |
| 备选轮换 | `tools/solo-modes.js:69` | `pool[1+random(seed,'route:...',4)]` |
| **subtitle 文案** | `tools/solo-modes.js:369-370` | `第N站 · 节目N/6 · 演出体力…` |
| **objective 文案** | `tools/solo-modes.js:371` | `完成三站巡演，登上终场压轴舞台` |
| enemyHint | `tools/solo-modes.js:372` | `本站压轴演出的特别环节：…` |
| **route 选项 description** | `tools/solo-modes.js:373` | `演出挑战度${n.risk} · 节目单提前公开` |
| **encounter.name** | `tools/solo-modes.js:377` | `巡演公演` / `特别舞台企划` / `第N站压轴演出` |
| **reward:relic description** | `tools/solo-modes.js:379` | `随机获得：返场耳返（…）…` |
| **camp description** | `tools/solo-modes.js:380` | `恢复 5 点演出体力` / `获得巡演收入与团队成长` |
| **event description** | `tools/solo-modes.js:381` | `+4 金币` / `-2 点演出体力，获得巡演纪念章` |
| **shop description** | `tools/solo-modes.js:382` | `花费 5 金币，恢复 5 点演出体力并刷新商店` |
| 面板渲染 | `tools/solo-ui.js:540-575` | `renderPanel()`，插槽 555-566 |
| 面板 DOM 构建 | `tools/solo-ui.js:140-170` | `panelObjectiveNode`(:158) 等 |
| 棋子表（50 id） | `index.html:1324-1380` | `UNITS` |
| 曲目表（50） | `index.html:1601-1652` | `COMBAT_KITS` |
| 音效表（62 键） | `index.html:2905-2968` | `SFX_DEF` |
| 音效播放函数 | `index.html:3012` | `function sfx(key,opt={})` → `window.sfx` |
| 头像资源 | `assets/units/{id}.png` | 50 张，文件名 = 棋子 id（已核对） |
| SW 缓存版本 | `sw.js:2` | `vcache-v64-no-drop-strip` |
| SW 预缓存清单 | `sw.js:4` | `ASSETS` 单行数组 |
| 主页资源版本号 | `sw.js:3` | `INDEX_ASSET='./index.html?v=64'` |

### 2.1 不可动的断言（改了直接红）

| 断言 | 位置 | 锁定的值 |
| --- | --- | --- |
| choice id | `tools/solo-modes.test.js:51-52` | `route:battle` / `route:(elite\|camp\|event\|shop)` |
| 常规公演 label | `tools/solo-modes.test.js:53` | `常规公演` |
| 压轴 label | `tools/solo-modes.test.js:74` | `终场压轴舞台` |
| 纪念物 label | `tools/solo-modes.test.js:76` | `领取应援纪念物` |
| 招募 id | `tools/solo-modes.test.js:77` | `reward:recruit:守护` |
| **event:risk 效果签名** | `tools/solo-modes.test.js:83-87` | `hp=-2` `items=['sword']` `relics=['冒险徽章']` |
| **12 词禁用黑名单** | `tools/solo-modes.test.js:68` | `远征生命/遗物/章末首领/精英战/普通战/精英部队/巡逻队/回响护符/召唤核心/坚守旗帜/冒险徽章/购买补给` |
| 三站 18 战 + 机制序 | `tools/solo-modes.test.js:38-39` | `battles===18`、`['shield','charge','summon']` |
| view 可 JSON roundtrip | `tools/solo-modes.test.js:9-17` | 深度相等 |

---

## 3. 里程碑总览

| # | 里程碑 | 改哪 | 断言影响 | 风险 | 建议 owner |
| --- | --- | --- | --- | --- | --- |
| **M1** | P0 叙事文案落地 | `tools/solo-modes.js`（+内联块，改 :373/379/380/381/382） | **0** | 极低 | coder |
| **M2** | P1 站名化 | `tools/solo-modes.js`（:370/371/377）+ 测试 :50/71/72/75 | 改 4 条断言 | 低 | coder |
| **M3** | P2 对话首行 | `tools/solo-modes.js`（+`view.line`）+ `tools/solo-ui.js`（+1 行渲染） | 新增 1 条 | 低 | coder |
| **M4** | P3 数据文件 + SW | 新 `tools/narrative-tour.js`、`sw.js`、`index.html`、新测试 | 新增测试 | 中 | coder |
| **M4b** | 演出字幕条 UI | 新 `tools/narrative-bar.js/.css`、`tools/solo-ui.js` 接线 | 新增 | 中 | coder |
| **M5** | 浏览器验收 | `tools/_verify_*.py` | — | 低 | coder |
| **M6** | 三站三景（可选） | `assets/ui/`、`tools/stage-themes.css` | — | 中 | 美术 |
| **M7** | 50 人图鉴接入（可选） | 图鉴展示位 | — | 低 | coder |
| **M0** | **入口切换（路线图）**：八人竞技下线 → 巡演企划升为首页头牌 | `tools/solo-host.js:376-380`、`index.html:7628`（+ `:1313` 帮助页、`:7683` 分支） | **0** | 低 | coder |

> **强烈建议 M1 单独一次提交先上线**：零断言影响、零数值风险，是本次唯一「一次提交通道最短」的部分。
>
> **M0 说明**：这是**产品路线图阶段**（规格见 `classic-mode-copy.md` §0.5 与 `tour-project.md` §0.4），**未来执行**，不在本包 M1–M5 的规则层链路内。它与 M1–M5 **互相独立**（现有次级入口下 M1–M5 照常可上线），但**下线与入口升级必须整体一次提交**——先删入口、后补新入口会让首页出现「没有主推玩法」的空窗。M0 只动入口字符串，**零断言影响**（`tools/_verify_*.py` 未断言任何 arena 入口串）。

### 3.1 已预验证（本包 diff 不是纸面推导）

在仓库外的临时副本上，已**实测执行**：

| 验证 | 方法 | 结果 |
| --- | --- | --- |
| M1 零断言影响 | 应用 §4 的 5 处 diff 后，跑**未修改**的 `solo-modes.test.js` | ✅ **14/14 全绿** |
| M2 断言同步 | 应用 §5 的 3 处 diff + 改 4 条断言后重跑 | ✅ **14/14 全绿** |
| 三站 18 战 / 机制序 / 数值 | 上述测试内已含 `battles===18`、`['shield','charge','summon']`、金币/体力断言 | ✅ 未被破坏 |
| 叙事数据合法性 | Node 校验 `narrative-tour.js` | ✅ 112 句台词、25 个声音、0 非法 id、0 非法 sfx、0 禁用词、三站零串味 |

> 结论：执行方**照抄 diff 即可**，无需再设计。

---

## 4. M1 · P0 叙事文案落地（零断言影响）

### 4.1 步骤 1：在 `tools/solo-modes.js` 第 21 行之后插入内联块

> 位置：`const relicDescriptions = {...};`（`:21`）之后，`const puzzleCandidates`（`:22`）之前。

```js
  /* ===== 巡演叙事文案（唯一来源 specs/narrative/narrative-tour.js，由 narrative-tour.test.js 漂移测试守护） ===== */
  const tourStation = { 1: { name: '潮声港', venue: '灯塔剧场' }, 2: { name: '霓虹街', venue: '天桥圆形广场' }, 3: { name: '长夜台', venue: '星轨穹顶' } };
  const tourObjective = { 1: '把声音送到第三十八步——没人站的地方', 2: '让围观的人真的开始听', 3: '把没唱完的那一首唱完' };
  const tourShow = {
    1: { battle: '潮声港·灯塔夜演', elite: '灯塔剧场·加演场', boss: '灯塔剧场·压轴夜' },
    2: { battle: '霓虹街·天桥快闪', elite: '天桥圆形广场·加演场', boss: '天桥圆形广场·压轴夜' },
    3: { battle: '长夜台·星轨演出', elite: '星轨穹顶·加演场', boss: '星轨穹顶·压轴夜' }
  };
  const tourNodeFlavor = {
    1: { battle: '第一夜的票是免费的，来的人比想象中多。', elite: '主办方临时加了场次：同一首，只给一次机会。', camp: '灯塔的二楼有一张旧沙发，坐下去会响。', shop: '灯塔下的临时摊位，老板是本地人，只收现金。' },
    2: { battle: '没有节目单，只有人流量。路过的每一秒都算数。', elite: '围观的人开始排队了。排队的人会变成什么，取决于这一首。', camp: '天桥下的便利店，关东煮只卖到两点。', shop: '天桥底下的摊子，卖什么取决于今天来了谁。' },
    3: { battle: '这里没有观众席，只有一片还没有被抹掉的地方。', elite: '在长夜里加一场，等于把灯多举十分钟。', camp: '穹顶的休息室是上一轮巡演留下来的，杯子还在原处。', shop: '穹顶后台的自动贩卖机，只剩最后几样。' }
  };
  const tourEvents = {
    1: [
      { title: '借来的音响', situation: '主办方的音响比设备清单上旧十年。', safe: '用他们那台，稳', risk: '把两台接在一起' },
      { title: '多余的座位', situation: '第一排有两个座位始终没人坐。', safe: '空着', risk: '把手灯放上去，唱完一整首' }
    ],
    2: [
      { title: '雨中的天桥', situation: '雨来了，主办方建议改到室内。', safe: '转移室内', risk: '在雨里唱完' },
      { title: '一位退场者', situation: '广场边缘站着一个只剩轮廓的人。她也在跟着哼。', safe: '绕开', risk: '把麦克风递过去' }
    ],
    3: [
      { title: '旧录音带', situation: '抽屉里有一盘带子，标签写着上一轮巡演的日期。', safe: '收好', risk: '当场放出来' },
      { title: '调音的邻居', situation: '隔壁场馆也在排练，两边的声音撞在一起。', safe: '错开时间', risk: '一起唱' }
    ]
  };
  const tourLead = {
    1: { who: 'nana7mi', name: '七海', text: '台口到最远那排，三十七步。' },
    2: { who: 'azi', name: '阿梓', text: '先别开麦，这个返听在嗡。' },
    3: { who: 'haruka', name: '白神遥', text: '左边。' }
  };
```

### 4.2 步骤 2：替换 5 处 description（old → new）

**① `tools/solo-modes.js:373`（route 选项）**

```js
// OLD
      if (s.phase === 'route') base.choices = expeditionOptions(s).map(n => choice(`route:${n.id}`, n.label, `演出挑战度${n.risk} · 节目单提前公开`));
```
```js
// NEW
      if (s.phase === 'route') base.choices = expeditionOptions(s).map(n => {
        const flavor = n.id === 'event'
          ? tourEvents[s.chapter][random(s.seed, `event:${s.chapter}`, 2)].situation
          : (tourNodeFlavor[s.chapter][n.id] || '');
        return choice(`route:${n.id}`, n.label, `${flavor ? flavor + ' · ' : ''}演出挑战度${n.risk} · 节目单提前公开`);
      });
```

**② `tools/solo-modes.js:379`（纪念物）** — label `领取应援纪念物` **不动**，只给 description 加来历：

```js
// 把这段字符串
'随机获得：返场耳返（施放曲目后获得应援屏障）、全息伴舞（首次演绎曲目时召来伴舞）、应援手灯（台前成员承受伤害降低）'
// 换成
'观众留下的应援 · 随机获得：返场耳返（施放曲目后获得应援屏障）、全息伴舞（首次演绎曲目时召来伴舞）、应援手灯（台前成员承受伤害降低）'
```

**③ `tools/solo-modes.js:380`（camp）**

```js
// OLD
      if (s.phase === 'camp') base.choices = [choice('camp:heal', '后台休息', '恢复 5 点演出体力'), choice('camp:train', '彩排', '获得巡演收入与团队成长')];
```
```js
// NEW
      if (s.phase === 'camp') base.choices = [choice('camp:heal', '后台休息', `${tourNodeFlavor[s.chapter].camp} · 恢复 5 点演出体力`), choice('camp:train', '彩排', '把今天的段落再过一遍 · 获得巡演收入与团队成长')];
```

**④ `tools/solo-modes.js:381`（event）** — label 与**效果签名不动**，只换情境与动作文案：

```js
// OLD
      if (s.phase === 'event') base.choices = [choice('event:safe', '稳妥合作', '+4 金币'), choice('event:risk', '尝试临时联动', '-2 点演出体力，获得巡演纪念章')];
```
```js
// NEW
      if (s.phase === 'event') {
        const ev = tourEvents[s.chapter][random(s.seed, `event:${s.chapter}`, 2)];
        base.objective = `${ev.title}：${ev.situation}`;
        base.choices = [choice('event:safe', '稳妥合作', `${ev.safe} · +4 金币`), choice('event:risk', '尝试临时联动', `${ev.risk} · -2 点演出体力，获得巡演纪念章`)];
      }
```

**⑤ `tools/solo-modes.js:382`（shop）**

```js
// OLD
      if (s.phase === 'shop') base.choices = [choice('shop:buy', '购买后台能量包', '花费 5 金币，恢复 5 点演出体力并刷新商店', gold < 5), choice('shop:leave', '继续巡演', '保留金币')];
```
```js
// NEW
      if (s.phase === 'shop') base.choices = [choice('shop:buy', '购买后台能量包', `${tourNodeFlavor[s.chapter].shop} · 花费 5 金币，恢复 5 点演出体力并刷新商店`, gold < 5), choice('shop:leave', '继续巡演', '保留金币')];
```

### 4.3 M1 判据

```bash
node --test tools/solo-modes.test.js     # 必须全绿，且【不需要改任何断言】
```

> ✅ **本条已预验证**：在临时副本上执行本节的 5 处 diff 后，跑**未做任何修改**的 `solo-modes.test.js`，结果 **14/14 全绿**。这就是「P0 零断言影响」的实证。

> ⚠️ **不要用 grep 直接扫 `solo-modes.js` 找禁用词** —— `relicNames`（`:19`，含「回响护符/召唤核心/坚守旗帜」）、`expeditionRelicLabels`（`:20`，含「冒险徽章」）、`conquestRelicPool`（`:98`）是**内部标识符**，合法包含这些词。禁用词判定**只针对渲染后的可见文案**，由 `solo-modes.test.js:67-69` 收集 `visibleCopy` 完成（该断言在 M1/M2 后仍全绿）。这 4 个 key 是数据，不是文案，**不要动**。

---

## 5. M2 · P1 站名化（改 4 条断言）

### 5.1 `tools/solo-modes.js:370`（subtitle 加站名）

```js
// NEW（把 第${s.chapter}站 之后补上站名·场馆）
      base.subtitle = s.phase === 'finished' ? (s.outcome === 'won' ? '三站巡演圆满收官' : '巡演暂告一段落')
        : `第${s.chapter}站·${tourStation[s.chapter].name}·${tourStation[s.chapter].venue} · 节目${s.node + 1}/6 · 演出体力${s.hp}/${s.maxHp} · 应援纪念物：${s.relics.length ? s.relics.map(id => `${expeditionRelicLabels[id] || id}（${relicDescriptions[id]}）`).join('、') : '无'}`;
```

### 5.2 `tools/solo-modes.js:371`（objective 逐站）

```js
// OLD
      base.objective = s.phase === 'finished' ? '巡演记录已保存' : '完成三站巡演，登上终场压轴舞台';
// NEW
      base.objective = s.phase === 'finished' ? '巡演记录已保存' : tourObjective[s.chapter];
```

### 5.3 `tools/solo-modes.js:377`（encounter.name 站名化）

```js
// OLD
        base.encounter = encounter(boss ? `第${s.chapter}站压轴演出` : elite ? '特别舞台企划' : '巡演公演', s.chapter + (elite ? 1 : 0), 3 + s.chapter + (elite ? 1 : 0), boss, boss ? bossKinds[s.chapter - 1] : elite ? 'flank' : 'none', hash(s.seed, `exp:${s.chapter}:${s.node}:${s.current}`), elite ? 'elite' : 'none');
// NEW
        base.encounter = encounter(
          boss ? tourShow[s.chapter].boss : elite ? tourShow[s.chapter].elite : tourShow[s.chapter].battle,
          s.chapter + (elite ? 1 : 0), 3 + s.chapter + (elite ? 1 : 0), boss,
          boss ? bossKinds[s.chapter - 1] : elite ? 'flank' : 'none',
          hash(s.seed, `exp:${s.chapter}:${s.node}:${s.current}`), elite ? 'elite' : 'none');
```

### 5.4 必须同步修改的 4 条断言（`tools/solo-modes.test.js`）

| 行 | OLD | NEW |
| --- | --- | --- |
| `:50` | `'完成三站巡演，登上终场压轴舞台'` | `'把声音送到第三十八步——没人站的地方'` |
| `:71` | `'巡演公演'` | `'潮声港·灯塔夜演'` |
| `:72` | `'特别舞台企划'` | `'灯塔剧场·加演场'` |
| `:75` | `'第1站压轴演出'` | `'灯塔剧场·压轴夜'` |

> 依据：`test:50` 用的是 `M.create('expedition',31)`（第 1 站）；`:71/:72/:75` 同理都是第 1 站，所以取第 1 站名。

### 5.5 M2 判据

```bash
node --test tools/solo-modes.test.js     # 更新 4 条断言后全绿
git diff tools/solo-modes.js             # 规则层只应多出字符串，不应出现任何数字/逻辑分支变化
```

---

## 6. M3 · P2 对话首行（新增 `view.line`）

### 6.1 `tools/solo-modes.js:367`（base 增字段）

```js
// OLD
    const base = { title: definitions.find(d => d.id === s.mode).name, subtitle: '', objective: '', enemyHint: '', choices: [], canFight: false, encounter: null, finished: s.phase === 'finished', outcome: s.outcome };
// NEW（追加 line: null）
    const base = { title: definitions.find(d => d.id === s.mode).name, subtitle: '', objective: '', enemyHint: '', choices: [], canFight: false, encounter: null, finished: s.phase === 'finished', outcome: s.outcome, line: null };
```

### 6.2 expedition 分支内（建议加在 `:372` 之后）

```js
      base.line = s.phase === 'finished' ? null : tourLead[s.chapter];
```

### 6.3 `tools/solo-ui.js` 渲染 1 行

在 `:159` 之后新增节点（放在 identity/details 区均可，建议 details 顶部）：

```js
    panelLineNode = appendText(details, 'p', 'solo-panel-line', '');
    panelLineNode.hidden = true;
```
并在文件顶部变量区（`:25` 附近）加 `let panelLineNode = null;`。
在 `renderPanel()` 的 `:562` 之后（enemyHint 块之后）加入：

```js
    const lead = view.line && view.line.text ? `${view.line.name}：「${view.line.text}」` : '';
    if (panelLineNode) { panelLineNode.textContent = lead; panelLineNode.hidden = !lead; }
```

### 6.4 测试（可选但推荐）：把 `line` 纳入禁用词扫描

在 `tools/solo-modes.test.js:67` 的 `visibleCopy` 里追加 `v.line && v.line.text`：

```js
  const visibleCopy = phases.flatMap(v => [v.title, v.subtitle, v.objective, v.enemyHint, v.line && v.line.text, ...v.choices.flatMap(c => [c.label, c.description]), v.encounter && v.encounter.name]).filter(Boolean).join(' ');
```

### 6.5 M3 判据

```bash
node --test tools/solo-modes.test.js     # 全绿（roundtrip 断言仍成立：line 是确定性派生）
```
> 数值零影响验证：`settle()` 的返回值与改动前逐字节一致（M3 不碰 settle/act）。

---

## 7. M4 · P3 数据文件 + SW 接入

### 7.1 创建 `tools/narrative-tour.js`

**直接复制** `specs/narrative/narrative-tour.js` 的全部内容，保存为 `tools/narrative-tour.js`，**一字不改**（该文件已是终态数据）。

### 7.2 `sw.js` 三件事（漏一步线上就是旧缓存）

1. `sw.js:4` 的 `ASSETS` 数组加入 `'./tools/narrative-tour.js?v=1'`
2. `sw.js:3`：`INDEX_ASSET` 由 `'./index.html?v=64'` → `'./index.html?v=65'`
3. `sw.js:2`：`CACHE` 由 `'vcache-v64-no-drop-strip'` → `'vcache-v65-tour-narrative'`

### 7.3 `index.html` 引用

在加载其它 `tools/*.js` 的同一处，加入：

```html
<script src="./tools/narrative-tour.js?v=1" defer></script>
```

> 位置选择原则：与 `tools/daily-curses.js`、`tools/solo-modes.js` 同批，确保在 `solo-ui.js` 之前。

### 7.4 新增测试 `tools/narrative-tour.test.js`（完整代码，可直接落盘）

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const N = require('./narrative-tour');

const unitIds = (() => {
  const start = html.indexOf('const UNITS = [');
  const block = html.slice(start, html.indexOf('];', start));
  return new Set([...block.matchAll(/id:'([A-Za-z0-9_]+)'/g)].map(m => m[1]));
})();
const sfxKeys = (() => {
  const start = html.indexOf('const SFX_DEF={');
  const block = html.slice(start, html.indexOf('\n};', start));
  return new Set([...block.matchAll(/([A-Za-z0-9_]+)\s*:\s*\{/g)].map(m => m[1]));
})();
const BANNED = ['远征生命', '遗物', '章末首领', '精英战', '普通战', '精英部队', '巡逻队', '回响护符', '召唤核心', '坚守旗帜', '冒险徽章', '购买补给'];
const WB_BANNED = ['打败', '消灭', '邪恶', '深渊的爪牙', '拯救世界', '牺牲', '复仇'];

const collectLines = root => {
  const out = [];
  const walk = v => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      if (typeof v.text === 'string' && 'who' in v) return out.push(v);
      Object.values(v).forEach(walk);
    }
  };
  walk(root);
  return out;
};

test('narrative tour data is pure and roundtrips', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(N)), N);
  assert.equal(Object.keys(N.STATIONS).length, 3);
  assert.equal(N.EVENTS.length, 6);
});

test('every narrative line references a real unit, a real sfx, and no banned term', () => {
  const lines = collectLines(N.STATIONS).concat(collectLines(N.FINALE), collectLines(N.EVENTS.map(e => e.after)));
  assert(lines.length >= 100, `enough lines: ${lines.length}`);
  for (const line of lines) {
    if (line.who !== null) assert(unitIds.has(line.who), `unknown unit: ${line.who}`);
    else assert(['旁白', '静默'].includes(line.name), `null who must be 旁白/静默: ${line.name}`);
    if (line.sfx) assert(sfxKeys.has(line.sfx), `unknown sfx: ${line.sfx}`);
    for (const term of BANNED.concat(WB_BANNED)) {
      assert.equal(String(line.text).includes(term), false, `banned term "${term}" in: ${line.text}`);
    }
  }
});

test('narrative COPY is mirrored verbatim into the rules layer', () => {
  const src = fs.readFileSync(path.join(__dirname, 'solo-modes.js'), 'utf8');
  const strings = [];
  const push = v => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(push); };
  push(N.COPY);
  N.EVENTS.forEach(e => { strings.push(e.title, e.situation, e.safe.action, e.risk.action); });
  for (const s of strings) assert(src.includes(s), `solo-modes.js is missing narrative copy: ${s}`);
});

test('stations do not leak each other landmarks', () => {
  const bag = n => JSON.stringify(N.STATIONS[n]);
  assert.equal(/霓虹街|长夜台/.test(bag(1)), false, 'station 1 leaks 2/3');
  assert.equal(/灯塔|长夜台/.test(bag(2)), false, 'station 2 leaks 1/3');
  assert.equal(/霓虹街|灯塔/.test(bag(3)), false, 'station 3 leaks 1/2');
});

test('finale exposes three distinct outcomes', () => {
  ['opening', 'encore', 'curtain', 'resume'].forEach(k => {
    assert(Array.isArray(N.FINALE[k]) && N.FINALE[k].length > 0, `finale.${k}`);
  });
});
```

> ⚠️ 漂移测试会要求 `solo-modes.js` 里出现 `COPY` 的全部字符串 —— 这正是 M1/M2 已内联的那些。**所以 M4 必须在 M1/M2 之后做。**

### 7.5 M4 判据

```bash
node --test tools/narrative-tour.test.js tools/solo-modes.test.js   # 全绿
grep -n "vcache-v65-tour-narrative" sw.js                            # 命中
grep -n "narrative-tour.js" sw.js                                    # 命中
```

---

## 8. M4b · 演出字幕条 UI（把对白演出来）

> ⚠️ **字幕条 = 纯文字层，不含配音。**
> 本阶段**不引入任何人声配音（VO）、语音合成或新音频文件**；`line.sfx` 只调现有 `window.sfx()`（`index.html:3012`），键全部来自 `SFX_DEF`（62 键，`index.html:2905-2968`）。
> 若执行方收到「为 112 句台词配音」的指令，那**超出本包范围**，须另行评估（涉及录音/资源加载/包体，与纯字幕完全两回事）。

> 这是 P3 的「演出层」。M3 只在面板露一行；M4b 让三站开场、压轴前后、站末、终场真正**逐句播放**。

### 8.1 新文件 `tools/narrative-bar.js`（参考实现，可直接落盘）

```js
/* 演出字幕条 · 主线巡演对白演出层（纯 DOM） */
(function (root) {
  'use strict';
  let el = null, portrait = null, nameEl = null, textEl = null;
  let queue = [], idx = 0, done = null, onKey = null;

  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'narrativeBar';
    el.className = 'narrative-bar';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '演出对白');
    el.innerHTML = '<div class="narrative-bar-portrait" aria-hidden="true"></div>'
      + '<div class="narrative-bar-body"><p class="narrative-bar-name"></p><p class="narrative-bar-text"></p></div>'
      + '<button type="button" class="narrative-bar-next">继续 ›</button>'
      + '<button type="button" class="narrative-bar-skip">跳过</button>';
    (document.body || document.documentElement).appendChild(el);
    portrait = el.querySelector('.narrative-bar-portrait');
    nameEl = el.querySelector('.narrative-bar-name');
    textEl = el.querySelector('.narrative-bar-text');
    el.querySelector('.narrative-bar-next').addEventListener('click', next);
    el.querySelector('.narrative-bar-skip').addEventListener('click', finish);
    return el;
  }

  function render() {
    const line = queue[idx];
    if (!line) return finish();
    nameEl.textContent = line.name || '';
    textEl.textContent = line.text || '';
    if (line.who) {
      portrait.style.backgroundImage = 'url("assets/units/' + line.who + '.png")';
      portrait.hidden = false;
    } else {
      portrait.style.backgroundImage = '';
      portrait.hidden = true;
    }
    if (line.sfx && typeof root.sfx === 'function') root.sfx(line.sfx);
  }

  function next() { idx += 1; if (idx >= queue.length) return finish(); render(); }

  function finish() {
    if (el) el.hidden = true;
    queue = []; idx = 0;
    if (onKey) document.removeEventListener('keydown', onKey);
    onKey = null;
    const cb = done; done = null;
    if (typeof cb === 'function') cb();
  }

  function play(lines, onDone) {
    if (!Array.isArray(lines) || !lines.length) { if (typeof onDone === 'function') onDone(); return; }
    ensure();
    queue = lines.slice(); idx = 0; done = onDone || null;
    el.hidden = false;
    onKey = e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); next(); } };
    document.addEventListener('keydown', onKey);
    render();
  }

  root.NarrativeBar = { play: play, next: next, finish: finish };
})(typeof window !== 'undefined' ? window : undefined);
```

### 8.2 新文件 `tools/narrative-bar.css`

```css
.narrative-bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;
  display:flex;align-items:center;gap:12px;max-width:min(880px,94vw);padding:12px 16px;
  background:rgba(18,20,32,.92);color:#f4f6ff;border-radius:14px;
  box-shadow:0 10px 32px rgba(0,0,0,.4);font-size:15px;line-height:1.5}
.narrative-bar[hidden]{display:none}
.narrative-bar-portrait{width:56px;height:56px;flex:0 0 56px;border-radius:10px;
  background-size:cover;background-position:center top;background-color:rgba(255,255,255,.08)}
.narrative-bar-portrait[hidden]{display:none}
.narrative-bar-body{flex:1 1 auto;min-width:0}
.narrative-bar-name{margin:0 0 2px;font-weight:700;color:#ffd27d;font-size:13px}
.narrative-bar-text{margin:0}
.narrative-bar-next,.narrative-bar-skip{flex:0 0 auto;border:0;border-radius:10px;padding:8px 12px;
  cursor:pointer;font:inherit}
.narrative-bar-next{background:#5b6bff;color:#fff}
.narrative-bar-skip{background:rgba(255,255,255,.14);color:#e7eaff}
@media (max-width:520px){.narrative-bar{bottom:8px;padding:10px}.narrative-bar-portrait{width:44px;height:44px;flex-basis:44px}}
```

### 8.3 接线（`tools/solo-ui.js`）

- **站开场**：检测到「首次进入第 N 站」（`state.chapter` 变化）时，`NarrativeBar.play(NarrativeTour.STATIONS[chapter].opening)`，播完再放开面板交互。
- **压轴前**：`view.canFight && state.current === 'boss'` 且尚未播过 → `play(nodes.boss.intro)`。
- **压轴后**：结算回 `reward` 且刚打完 boss → `play(nodes.boss.clear)`。
- **站末**：`state.chapter` 递增时 → `play(上一站.cleared)`。
- **终场**：`view.finished && outcome === 'won'` → `play(FINALE.opening)` → 按 §9 判据选 `encore/curtain/resume`。
- **打点**：用一个 `Set` 记录已播过的 `chapter+phase+boss` 键，避免重复播放（存档续玩时不重播开场）。

### 8.4 终场三收尾判据（纯展示，不引入任何奖励）

| 收尾 | 条件（只读 `state.hp` / `state.route`） | 数据键 |
| --- | --- | --- |
| **安可** | `hp >= 15` 且 route 中失败次数 ≤ 1 | `FINALE.encore` |
| **谢幕** | 其余通关 | `FINALE.curtain` |
| **继续** | `hp < 15` 通关（**不写失败**） | `FINALE.resume` |

### 8.5 M4b 判据

```bash
# SW 追加两个新文件
#   sw.js ASSETS 加 './tools/narrative-bar.js?v=1'、'./tools/narrative-bar.css?v=1'
#   CACHE 再升一版：vcache-v65-tour-narrative → vcache-v66-tour-bar
#   index.html 加 <script src="./tools/narrative-bar.js?v=1" defer></script> 与 <link rel="stylesheet" href="./tools/narrative-bar.css?v=1">
node --test tools/solo-modes.test.js tools/narrative-tour.test.js tools/sound-system.test.js
```

---

## 9. M5 · 浏览器验收

| # | 步骤 | 期望 |
| --- | --- | --- |
| 1 | 首页 → 单人玩法 → 巡演企划 | 面板显示「演出体力 20」、objective 为第 1 站主题句、副标题含「潮声港·灯塔剧场」 |
| 2 | 连点 6 格到压轴 | 第 6 格 label 仍为「终场压轴舞台」；encounter.name =「灯塔剧场·压轴夜」；enemyHint 含「应援屏障」 |
| 3 | 走完第 2 站压轴 | 机制名「压轴蓄势」；开战前字幕条按 §8.3 播放，含「他们在等下一个节目」 |
| 4 | 走完第 3 站压轴 | 机制名「全息伴舞登场」；字幕条出现唯一一次的静默台词「你也……」 |
| 5 | 触发突发企划 | 3 站共 6 条事件按站轮换，文案含情境句；选项 label 仍是「稳妥合作/尝试临时联动」 |
| 6 | 通关 | 终场播放；三收尾按 hp 命中其一 |
| 7 | 窄屏 ≤520px | 字幕条不溢出、不遮死「开启演出」按钮 |
| 8 | 离线（断网刷新） | 字幕条与数据仍可加载（SW 命中） |

> 窄屏教训参考 `specs/campaign-conquest-plan.md` §6.4。验收脚本模板用 `tools/_verify_*.py`（playwright）。

---

## 10. 红线与风险（违反即返工）

| # | 红线 | 依据 |
| --- | --- | --- |
| R1 | **叙事层不得附带任何数值加成**（对白/图鉴不得含战斗数值，终场判据只读不写） | `level-design-plan-2026-09-25.md:692` |
| R2 | **不改 50 人名单 / 12 阵营 / 10 职业 / 羁绊档位** | `index.html:1324-1476` 冻结 |
| R3 | **不改任何战斗/经济/难度数值** | `level-design-plan-2026-09-25.md` §0.2 |
| R4 | 规则层**只允许新增字符串字段**（可 JSON roundtrip） | `campaign-conquest-plan.md` §8.3 |
| R5 | **不编造真实主播负面情节**（无死亡/背叛/恋爱/现实矛盾） | `world-bible.md` §8.0 |
| R6 | **12 词禁用术语**在任何可见文案中 0 命中 | `solo-modes.test.js:68` |
| R7 | **`event:risk` 效果签名不可改** | `solo-modes.test.js:83-87` |
| R8 | **SW 三件事齐做**（ASSETS + CACHE 升版 + `?v=`） | `campaign-conquest-plan.md` §8.1 |
| **R9** | **零新增配音**：对白只做**文字字幕**，不做人声配音（VO）/语音合成，**不新增任何音频文件**；音效只复用 `SFX_DEF` 现有键 | 用户要求（2026-09-26）；见 §8 |

### 10.1 高风险信号（出现请交 expert）

- 若为了「让对白出现在战斗里」，需要改动 `tools/solo-host.js` 的战斗流程 → **停下**，交 expert 评估（战斗流程是高风险区）。
- 若发现 `view()` 新增字段导致 `solo-modes.test.js:9-17` 的 roundtrip 失败 → 说明引入了非序列化数据，须回退改纯字符串。
- 若 `solo-host.js:338` 的存档 summary 因 subtitle 变长而破坏存档兼容 → 交 expert。
- 若需求变成「给对白**配音**/加语音」（引入 mp3/ogg、TTS、真人录音）→ **停下**：这**违反红线 R9**，且涉及新资源加载与包体，必须另行评估，不能顺手做进 M4b。

### 10.2 已知边界（不是 bug）

- **三站三景当前不具备**：舞台背景是主题驱动（`tools/stage-themes.css:3`），非站点驱动。做三站三景属 M6 可选，不做也完全成立。
- **6 格里有 5 格是「常规公演 + 随机备选」**：所以数据按「站 × 节点类型」组织，不写死固定节目单。若将来要做「固定路线变体」，可直接用 `tour-script-v1.md` §2.5 的编剧推荐节目单。

---

## 11. 验收清单

| # | 项 | 判据 |
| --- | --- | --- |
| 1 | M1 零断言影响 | `node --test tools/solo-modes.test.js` 全绿且未改断言 |
| 2 | 数值零影响 | 同种子 `settle()`/`act()` 返回值与改动前逐字节一致 |
| 3 | 禁用术语 | 12 词在 `solo-modes.js` 与 `narrative-tour.js` 的可见文案中 0 命中 |
| 4 | 关键路径可读 | 不看字幕条，仅凭 subtitle+objective+enemyHint 也能读懂「第几站、在干什么、压轴机制」 |
| 5 | 台词对象合法 | 全部 `who ∈ UNITS ∪ {null}`；`sfx ∈ SFX_DEF`（漂移测试覆盖） |
| 6 | 数据可序列化 | `JSON.parse(JSON.stringify(N))` 深度相等 |
| 7 | COPY 不漂移 | 漂移测试全绿 |
| 8 | 三站不串味 | 漂移测试「landmarks」用例全绿 |
| 9 | SW 纪律 | CACHE 已升版；两个新文件都在 ASSETS |
| 10 | 合规 | 无负面情节、无现实关系、无立场表达 |
| 11 | 无「as you know」 | 逐句过：角色不互相解释彼此已知的事 |
| 12 | 窄屏 | ≤520px 字幕条不遮死主操作按钮 |

---

## 12. 一键核验脚本（执行方自测用）

```bash
cd F:/demo/autochess
node --test tools/solo-modes.test.js          # M1 阶段须全绿且未改断言
node --test tools/narrative-tour.test.js      # M4 起生效（含禁用词/漂移/串味校验）
node --test tools/sound-system.test.js
grep -n "vcache-v6" sw.js                     # 确认 CACHE 已升版
grep -n "narrative-tour.js\|narrative-bar" sw.js
```

> 禁用词**不要**用 grep 扫源码（内部 key 误报，见 §4.3）；判定一律走 `narrative-tour.test.js` 与 `solo-modes.test.js:67-69`。

---

## 13. 分工与执行顺序（同一文件只有一个 owner）

```
[M0] coder  → solo-host.js(:376-380) + index.html(:7628,:1313,:7683)   ← 路线图阶段，独立提交
      （八人竞技下线 + 巡演企划升为首页头牌；必须同批，否则首页空窗）

[M1] coder  → solo-modes.js（插入块 + 5 处 description）           ← 可单独提交上线
      ↓
[M2] coder  → solo-modes.js(:370,371,377) + solo-modes.test.js(:50,71,72,75)
      ↓
[M3] coder  → solo-modes.js(加 view.line) + solo-ui.js(加 1 行渲染)
      ↓
[M4] coder  → 新建 tools/narrative-tour.js + tools/narrative-tour.test.js + sw.js + index.html
      ↓
[M4b] coder → 新建 tools/narrative-bar.js/.css + solo-ui.js 接线 + sw.js 再升版
      ↓
[M5] coder  → 浏览器验收（tools/_verify_*.py）
      ↓
[M6] 美术   → 三站三景（可选）   [M7] coder → 50 人图鉴接入（可选）
```

- **M0 是路线图阶段**（未来执行），与 M1–M5 **链路独立**：M0 只改入口字符串（`solo-host.js` / `index.html` 的入口与说明），M1–M5 只改规则层（`solo-modes.js` 等）。两者唯一交叠是 `index.html`——**若 M0 与 M4 同期执行，必须同一人**（同一文件）。
- **M1–M3 必须同一人顺序做**（都改 `solo-modes.js`），禁止并行。
- **M4b 的 `solo-ui.js` 与 M3 的 `solo-ui.js` 必须同一人**（同一文件）。
- `reviewer` 在 M2 与 M4 后各做一次独立复核（重点：断言是否被「顺手改宽」、数值是否被动过）。

---

## 14. 回滚

| 里程碑 | 回滚方式 |
| --- | --- |
| **M0（入口切换）** | `git revert` 对应提交；`solo-host.js` 与 `index.html` 三处入口串还原即回到现状（八人竞技入口恢复）。**注意**：arena 引擎与 `ARENA_SAVE_KEY` 从未改动，回滚无数据影响 |
| M1 / M2 / M3 | `git revert` 对应提交（都是单文件小改） |
| M4 | 删 `tools/narrative-tour.js` + 还原 `sw.js`/`index.html`；CACHE 回退到 `vcache-v64-no-drop-strip` |
| M4b | 删两个新文件 + 还原 `solo-ui.js`/`sw.js`/`index.html` |

> 全链路均为**增量**：删掉叙事文件后，游戏回到「无对白、纯面板」状态，功能不受影响。

---

*本包所有 `文件:行号` 均已复核；`narrative-tour.js` 已通过 Node 校验。设定与角色声音见 `specs/narrative/world-bible.md`，剧本见 `specs/narrative/tour-script-v1.md`，图鉴见 `specs/narrative/codex-50-lines.md`。*
