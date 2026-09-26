# 虚拟棋战 · 完整游戏音频系统设计

> 状态：**设计稿 v1 · 未落地任何代码**
> 适用范围：`index.html`（经典挑战 / 每日挑战 / 八人竞技）与后续单人玩法
> 前置文档：`specs/sound-system-audit.md`（声画事件约定与原实现问题记录）
> 现有实现：`index.html` 内联「声音系统」区块（Web Audio 程序化合成，`SFX_DEF` **62** 个配方键 = 40 通用 + 22 羁绊音，8 路并发）
> **行号会漂移**（本项目多 agent 并发改动同一文件）：21:11 该区块在 `2739–2918`，22:46 已在 `2873–3051`。本文行号仅供定位参考，**一律 grep 复核**。

---

## 0. 设计前提

### 0.1 现状基线（本文档所有取舍的事实依据）

| 维度 | 现状 | 对设计的影响 |
| --- | --- | --- |
| 音频资源 | **零音频文件**。`assets/` 下只有 png/webp，无 mp3/ogg/wav | 资源命名规范必须同时覆盖"程序化配方 ID"与"未来采样路径"两套 |
| 合成方式 | `SFX_DEF` 配方表 + `OscillatorNode` / `AudioBufferSourceNode` 现场合成 | "事件"= 合成配方，不是文件引用 |
| 总线实现 | `const SFX_BUS={ui:.5,battle:.42,global:.6}`，作为**事件创建时的乘法系数** | 无法实时调音、静音、淡变、做快照 → 必须改为真实 `GainNode` 图 |
| 输出链路 | `g.connect(ctx.destination)`，事件直连输出 | 无压缩器兜底，密集战斗会削顶 → 增加母带压缩 |
| 并发控制 | `_sfxVoices` 上限 8，按数字优先级抢占（`_sfxActive.filter(v=>v.priority<(d.priority||2))`） | 抢占粒度只有"数字高低"，同档位无策略 → 引入 tier + tier 内策略 |
| 限流 | `_sfxLast[key]`，同键 110ms | 保留，扩展为分级冷却 |
| 随机隔离 | `sfxNoise()` 独立 LCG，不碰游戏 `rand()` | **必须继承的硬约束** |
| 时间缩放 | `when = now + delay / max(1,SPEED)`，时长同样除以 SPEED | 保留 |
| 音乐 / 环境 / 3D | **全部不存在** | 纯新增范围 |
| 构建方式 | 无构建、零依赖、PWA + Service Worker 预缓存（v21） | 引入 Tone.js/Howler 会破坏"无构建 + 离线"前提 → 继续自研，但按中间件架构重新组织 |
| 部署 | Cloudflare Worker 静态资源，`.assetsignore` 排除 `out/`、`specs/` 等 | 音频资源若引入，会直接计入 Worker 包体与首屏预缓存 → 默认走合成路线 |

### 0.2 三条必须继承的不变量（来自 `sound-system-audit.md`）

1. **纯表现层**：静音、无 `AudioContext`、页面后台、不同播放速度，均不得改变战斗数值、随机数状态、存档或事件顺序。
2. **随机数隔离**：音频合成与音乐生成使用独立确定性序列，绝不调用游戏 `rand()`。
3. **静默安全**：无音频环境、无用户手势、静音偏好切换，均不得抛错；静音偏好（`vc_sfx`）跨重载保持。

### 0.3 与 FMOD / Wwise 的概念映射

本项目不使用中间件（无构建 / 零依赖 / 需离线），但**架构语义完全对齐**，便于未来迁移或与外包音频团队协作：

| 中间件概念 | 本项目对应物 | 说明 |
| --- | --- | --- |
| Event（`event:/Cat/Sub/Name`） | `ae:<domain>/<group>/<name>` 事件 ID + `SFX_DEF` 风格配方 | 事件 ID 是唯一契约 |
| Bus | `GainNode` 总线节点 | music / amb / ui / battle / syn |
| VCA | 快照增益层 | `snapshotGain` 节点 |
| Snapshot | `mixer.snapshots` 配置 | default / combat / story / menu |
| Parameter | `AE.param(name, value)` 全局参数总线 | phase / tension / density / speed / duck |
| Automated Parameter | 参数来源表（§6.2） | 谁写、多快写、如何平滑 |
| Voice Limit / Steal Mode | tier + 抢占策略 + 预留槽 | §3.3 |

---

## 1. 声音身份与体验目标

### 1.1 三个形容词

**明亮 · 电子 · 克制**

- **明亮**：偶像主题，音色偏高、泛音清晰、短促上扬，不用闷暗的模拟铜管。
- **电子**：全场合成器质感（正弦/三角/方波/锯齿 + 噪声层），呼应"虚拟棋战"的赛博舞台设定。
- **克制**：这是关键一条。自走棋的战斗信息密度极高（50 枚棋子、多目标技能、同帧多事件），音效必须**可读而不吵**。现有实现默认音量已经偏克制（`battle` 总线 0.42），设计上继续保持。

### 1.2 听觉层级宣言（本设计的第一原则）

> **信息可读性优先于空间真实感。**

由此派生的三条硬规则：

1. 同一帧内允许叠加的事件数量有上限，且按 tier 决定谁被丢弃 —— 宁可少响，不可糊成一片。
2. 玩家关心的关键事件（技能命中、暴击、致命、结算）**强制居中、不衰减**，即使它发生在棋盘边缘（见 §5.4）。
3. 装饰性事件（`T0`）在容量告急时**第一个被牺牲**，且不允许抢占任何信息类事件。

### 1.3 好设计是听不出来的

玩家应该"感觉到"音乐变紧张了，而不应该"注意到音乐切歌了"。因此：

- 所有音乐状态切换必须在小节线上量化完成，禁止硬切（唯一例外：玩家手动静音）。
- 层进入 2 拍、退出 4 拍，用增益斜坡而非启停。
- 只有在开发者 HUD 里才应该看到"当前处于 battle / bar 7 / tension 0.62"。

---

## 2. 系统架构

### 2.1 四层结构

| 层 | 职责 | 允许做的事 | 禁止做的事 |
| --- | --- | --- | --- |
| **游戏逻辑层** | 战斗、经济、界面、剧情 | 调用 `AE.emit(id, opts)` / `AE.param()` / `AE.music()` | 触碰 `AudioContext`、`GainNode`、任何音频对象 |
| **事件层** | 事件注册表、配方解析、限流、并发配额、抢占 | 读参数、决定"响不响 / 响几次" | 直接创建音频节点 |
| **参数层** | 持有全局参数快照并提供平滑 | 被游戏系统写入、被事件层与渲染层读取 | 主动轮询游戏状态（须由游戏侧推送） |
| **渲染层** | 合成器 / 采样器 / 音乐序列器 | 创建与回收 `OscillatorNode` / `BufferSource` | 反向修改任何参数或游戏状态 |
| **混音总线** | 分类增益、快照、侧链闪避、母带压缩 | 纯增益与动态处理 | 调度事件 |

**单向依赖是硬性约束**：游戏 → 事件 → 参数 → 渲染 → 总线。任何一层都不得反向调用。这条规则让"音频出错不影响战斗"成为结构性保证，而不是靠每个调用点自觉。

### 2.2 文件与作用域划分

现在全部逻辑内联在 `index.html` 的一个注释块里。设计上建议保持**单文件内自包含**（因为无构建），但按逻辑分成 5 个连续区块，边界清晰：

```
/* ===== 音频 1/5：总线与节点图 (BusGraph) ===== */
/* ===== 音频 2/5：事件注册表与配置 (AudioConfig) ===== */
/* ===== 音频 3/5：参数总线 (ParamBus) ===== */
/* ===== 音频 4/5：合成器与采样器 (Synth/Sampler) ===== */
/* ===== 音频 5/5：音乐序列器与事件 API (Music/AE) ===== */
```

理由：`tools/sound-system.test.js` 依赖 `html.indexOf('/* ================= 声音系统')` 做代码切片。区块化后测试可以直接按区块边界切片，比现在的起止字符串匹配更稳。

---

## 3. 音频分类与优先级

### 3.1 五条分类总线

| 总线 | 内容 | 默认增益 | 参与 SFX 事件槽抢占 | 可被 duck | 备注 |
| --- | --- | --- | --- | --- | --- |
| `master` | 母带链终点 | 0 dB | — | — | 接 `DynamicsCompressorNode` |
| `music` | 四层 stem + 结算主题 | −6 dB | **否**（独立池） | **是** | 音乐永不被音效抢占，只被闪避 |
| `amb` | 环境底噪、氛围点缀 | −14 dB | 否（独立池） | 是 | 最低存在感 |
| `ui` | 面板开合、页签、设置、图鉴翻页 | −6 dB | 是 | 否 | 玩家主动操作，永不被丢 |
| `battle` | 技能、命中、暴击、死亡、蓄力 | −8 dB | 是 | 否 | 战斗主战场，密度最高 |
| `syn` | 22 个羁绊激活音 | −10 dB | 是 | 否 | 独立总线便于统一压低（羁绊音易盖过开战声，见 audit §问题记录） |

**为什么 `syn` 要独立成一条总线**：`sound-system-audit.md` 明确记录了"羁绊不盖过开战声"是验收要求。现有实现靠音量数字硬凑，独立总线后可以一次性把整类音降下来，不用逐个改配方。

### 3.2 八档优先级（tier）

**tier 的定义是"不可丢性"，不是"响度"。** 这是对现有实现最重要的一处概念澄清 —— 现在 `priority: 3/4/5` 同时承担了"抢占权重"和"感觉上的重要性"两个含义，导致 `crit`（战斗信息）和 `win`（结算）被放进同一套数字里比较。

| tier | 名称 | 典型事件 | tier 内抢占策略 | 桌面/移动/低端 软配额 | 预留槽 |
| --- | --- | --- | --- | --- | --- |
| **T7** | 关键节点 | `finalWin`、通关演出、（未来）剧情关键 VO | 不抢占（同级排队） | 1 / 1 / 1 | 1 |
| **T6** | 结算与结果 | `win` / `lose` / `settle` / 章节横幅 | 抢占 T0–T5 | 2 / 2 / 1 | 1 |
| **T5** | 玩家操作确认 | 购买 / 出售 / 刷新 / 买经验 / 人口 / 装备 / 上阵 / 整理 / 拖拽 / 升星 | 抢占 T0–T4 | 4 / 3 / 2 | — |
| **T4** | 战斗节点 | 开战、野怪号角、精英挑战、连败/连胜提示 | 抢占 T0–T3 | 3 / 2 / 2 | — |
| **T3** | 战斗信息 | 技能命中、暴击、控制命中、区域生成、死亡 | 抢占 T0–T2，按**最旧** | 4 / 3 / 2 | — |
| **T2** | 战斗细节 | 普攻 whoosh、闪避、小溅射、角色专属小音 | 抢占 T0–T1，按**最远** | 4 / 3 / 2 | — |
| **T1** | 环境层 | 环境循环、氛围点缀（独立池，不占 SFX 槽） | 自由 | 2 / 2 / 1 | — |
| **T0** | 装饰 | 棋子随彩、非关键 UI 微音、图鉴翻页 | 最先被抢 | 2 / 2 / 1 | — |

**T5 高于 T3 是有意的**：玩家操作反馈必须永远可闻，它是"输入已被接收"的唯一确认渠道。备战期不会有战斗音，所以两者不会真正冲突。

### 3.3 事件槽与抢占算法

**全局事件槽**（沿用并扩展现有 `_sfxVoices` 机制）：

| profile | 事件槽 | 音源并发上限 | 每帧 emit 上限 |
| --- | --- | --- | --- |
| `desktop` | 12 | 40 | 16 |
| `mobile` | 8 | 28 | 10 |
| `lowEnd` | 6 | 20 | 8 |

profile 判定：`navigator.deviceMemory ≤ 2` 或 `navigator.hardwareConcurrency ≤ 4` → `lowEnd`；触屏且非 iPad → `mobile`；其余 `desktop`。判定结果写入 `window.__audioProfile` 供测试断言。

**抢占决策顺序**（在 `_sfxVoices >= eventSlots` 时）：

```
1. 若新事件 tier ≤ T1（装饰/环境）        → 直接丢弃，不抢占
2. 查找 victim = 满足 victim.tier < new.tier 的事件集合
3. 若集合为空                              → 丢弃新事件，计数不增加
4. 在集合中先取 tier 最低的；同 tier 内按该 tier 的策略：
      T3/T4/T6 → 最旧（最早开始）
      T2/T5    → 最远（棋盘距离最大）
      T0/T1    → 最轻（当前实际增益最低）
5. 若 victim 所在 tier 有预留槽且该 tier 当前占用 ≤ 预留数 → 跳过该 tier，继续找
6. victim.stop() → 创建新事件
```

相比现有实现的三点改进：
- 增加 **tier 内策略**（现在只有数字比较，`sort((a,b)=>a.priority-b.priority)[0]` 在等优先级时行为不确定）。
- 增加 **预留槽**：T6/T7 各保留 1 槽，保证"战斗打满 8 路时胜利音仍有位置"，而不是靠抢占打断一首正在播放的战斗音。
- 增加 **同帧去重与配额**，见下。

### 3.4 限流与去重规则

| 规则 | 参数 | 目的 |
| --- | --- | --- |
| 同键冷却 | 110ms（沿用） | 防止重复触发（连点、逐帧调用） |
| 分级冷却 | T3/T4：80ms · T2：120ms · T5：140ms · T6/T7：0（不限） | 关键节点永不被限流吞掉 |
| 同帧同键去重 | 单帧内同键最多 1 次 | 多目标技能不按目标人数叠放（沿用 audit 结论） |
| 全局每帧上限 | 见 §3.3 表 | 防止大范围 AOE 单帧洪泛 |
| 超限丢弃计数 | `AE.debug.dropped` / `throttled` / `preempted` 三个独立计数 | 调试可观测，见 §13 |

**重要**：被限流、被丢弃、被抢占的请求**不得计入已播放计数**（`window.__sfxPlayed`）。现有测试第 3 组已强制这一点，设计扩展后必须保持。

---

## 4. 触发条件与播放策略

### 4.1 备战期（`S.phase === 'prep'`）

| 游戏事件 | 音频事件 ID | 触发时机 | 策略 |
| --- | --- | --- | --- |
| 购买成功 | `ae:shop/buy` | 金币扣除 + 商店卡槽变化同帧 | one-shot，音高抖动 ±1.5% |
| 购买触发升星 | 追加 `ae:board/rankup2|3` | 购后 **90ms**（沿用 audit 结论） | one-shot，顺序明确 |
| 出售 | `ae:shop/sell` | 棋子离开备战席同帧 | one-shot |
| 刷新商店 | `ae:shop/reroll` | 卡槽重绘同帧 | one-shot，音量压低 + 噪声层 |
| 买经验 | `ae:shop/xp` | 经验条变化同帧 | one-shot |
| 人口升级 | `ae:board/levelup` | 等级数字变化同帧 | one-shot，4 音琶音（占 1 槽） |
| 装备穿戴 | `ae:shop/equip` | 装备格出现同帧 | one-shot，金属轻扣 |
| 一键上阵 | `ae:board/deploy` | 站位批量变化同帧 | one-shot，**不按棋子数重复** |
| 整理备战席 | `ae:board/tidy` | 席位置重排同帧 | one-shot，噪声层 |
| 拿起棋子 | `ae:board/pickup` | pointerdown 命中棋子 | one-shot，音量 0.16（极轻） |
| 进入出售区 | `ae:board/sellzone` | 拖拽进入热区 | one-shot，**带退出静音**（离开热区不响） |
| 2★ / 3★ 升星 | `ae:board/rankup2` / `rankup3` | 星级图标变化同帧 | one-shot，长琶音（占 1 槽，禁止按音符数计槽） |
| 羁绊激活/变化 | `ae:syn/<bondId>` | 羁绊栏徽章变化同帧 | one-shot，总线 `syn` 统一压低 |

### 4.2 战斗期（`S.phase === 'battle'`）

| 游戏事件 | 音频事件 ID | 触发时机 | 策略 |
| --- | --- | --- | --- |
| 开战 | `ae:match/battle/start` | 战斗图层出现同帧 | one-shot，与野怪互斥 |
| 野怪回合 | `ae:match/battle/wild` | 同上（替代开战音） | one-shot，号角预警 |
| 精英挑战 | `ae:match/battle/elite` | 同上，叠在开战音之上 | layered |
| 技能蓄力 | `ae:combat/cast` | 蓄力环开始 | one-shot，轻起手 |
| 技能命中（按体系） | `ae:combat/impact/{blade,arc,water,poison,fire,ice,zap,dark,heal,shield,stun}` | 伤害数值命中帧 + `0–70/SPEED` ms | one-shot，**每次施法只排一次主体声** |
| 持续区域生成 | `ae:combat/zone` | 区域 VFX 创建时 | one-shot，**不随 tick 重播** |
| 暴击 | `ae:combat/crit` | 暴击数字出现同帧 | one-shot，音量高于普通命中 |
| 闪避 | `ae:combat/dodge` | MISS 文字出现同帧 | one-shot |
| 死亡 | `ae:combat/death` | 消失动画首帧 | one-shot，**同帧多死只响 1 次**（延续 `die` 限流） |
| 角色专属音 | `ae:unit/<unitId>/<cue>` | 对应特殊机制触发 | one-shot，当前 `splash/bounce/bleat/rockcrack/vampbite` 归入此类 |

### 4.3 结算期

| 游戏事件 | 音频事件 ID | 触发时机 | 策略 |
| --- | --- | --- | --- |
| 回合结算横幅 | `ae:match/result/{win,lose}` | 横幅出现前 **120ms**（沿用） | one-shot，**触发 music duck** |
| 回合收益提示 | `ae:match/round/reward` | 金币结算块出现同帧 | one-shot，极轻 |
| 最终通关 | `ae:match/result/final` | 通关页出现 | one-shot，最长音（1.0s），T7 预留槽 |
| 立即结算（战斗中断） | — | `showResultBanner` | 结束次要战斗声，**保留已调度的技能命中声** |

### 4.4 UI 与剧情

| 游戏事件 | 音频事件 ID | 触发时机 | 策略 |
| --- | --- | --- | --- |
| 面板开 / 关 | `ae:ui/panel/open` / `close` | DOM 出现 / 消失同帧 | one-shot，方向性（上行 / 下行） |
| 页签切换 | `ae:ui/tab/switch` | 页签激活态变化 | one-shot，极轻 |
| 图鉴翻页 | `ae:ui/codex/page` | 翻页动画开始 | one-shot，装饰（T0） |
| 复制 / 分享成功 | `ae:ui/toast/{copy,share}` | toast 出现 | one-shot |
| 设置开关 | `ae:ui/toggle/on` / `off` | 状态翻转 | one-shot，PCM 级别零延迟感 |
| 篇章过场 | `ae:music/chapter/stinger` | 章节标题出现 | one-shot，T6，**触发 music duck** |
| 剧情对白 | `ae:vo/<charId>/<lineId>` | 对白行开始 | 预留，触发 duck −9dB |

### 4.5 五类播放策略的定义

| 策略 | 语义 | 实现要点 |
| --- | --- | --- |
| `one-shot` | 单次播放，播完回收 | 现有 `sfx()` 行为，扩展为多层合成 |
| `loop` | 循环 | 采样用精确 loop 点；合成用长缓冲区 + 无缝包络（起止增益必须归零） |
| `layered` | 同事件多子层并行 | 复用同一事件槽；层数上限 4（音调层）+ 1（噪声层） |
| `variation` | 每次播放不完全相同 | 音高抖动 / 增益抖动 / 起始偏移 / 采样池轮换，四项独立开关 |
| `fade` | 增益斜坡进出 | 用 `setValueAtTime` + `linearRampToValueAtTime`，禁止 `exponentialRamp` 到 0 |
| `quantized` | 量化到拍/小节 | 仅音乐与环境循环使用，见 §6.4 |

**`variation` 的确定性约束**：随机变化必须走音频专属 LCG（现有 `sfxNoise()` 的模式），且**必须可由种子复现**。同一种子下重放同一局，音频变化序列必须完全一致 —— 这样 `tools/sound-system.test.js` 才能断言音频行为。

**`rotate(索引)` 建议**：`variation` 的四项参数不应各自独立随机（会导致某些组合听起来很怪）。建议实现为**变体表轮换**：每个事件预定义 3 个变体（音高/增益/偏移的组合），按 `_audioSeq++ % 3` 顺序轮换，避免连续两次完全相同，同时保证听感可控。

---

## 5. 空间音频与衰减

### 5.1 为什么不做真 3D / HRTF

| 常见做法 | 本项目决策 | 理由 |
| --- | --- | --- |
| HRTF 双耳渲染 | **不做** | 游戏是 2D canvas 俯视固定镜头，玩家视角不在棋盘内部；手机多为单扬声器，HRTF 完全无效 |
| 一阶 Ambisonics | **不做** | 无 VR 目标，解码成本换不来听感收益 |
| 遮挡 raycast | **不做**（预算 = 0） | 棋盘无墙体遮挡物，raycast 是纯浪费 |
| 立体声定位 + 距离衰减 | **做** | 成本近零（1 个 `StereoPannerNode` + 增益），能提供有效的"左右场"信息 |

**这是一处有意识的偏离**：空间音频的通用最佳实践是"所有世界空间音效必须空间化"，但自走棋的核心信息（我方技能命中、暴击、致命）如果被推到声场边缘，玩家会漏听。所以本设计对**每个事件强制声明 `spatial` 模式**，禁止隐式默认。

### 5.2 三种空间模式

| 模式 | 适用 | 行为 |
| --- | --- | --- |
| `none` | UI、结算、开战、音乐、环境 | pan = 0，增益 = 1，无衰减，无低通 |
| `board` | 普攻、小命中、闪避、死亡、角色专属音 | 完整棋盘定位（§5.3） |
| `override` | 我方技能命中、暴击、致命击杀 | 保留 50% 距离衰减，**pan 强制归零**，无低通 |

### 5.3 棋盘定位参数

坐标映射（棋盘格坐标 `(bx, by)`，视口中心 `(cx, cy)`，视口半宽 `halfW`）：

| 参数 | 公式 | 取值 |
| --- | --- | --- |
| 声像 pan | `clamp((bx − cx) / halfW, −1, 1) × 0.85` | 限制在 ±0.85，避免极端贴耳导致左右不均 |
| 格距 d | `max(|bx − cx|, |by − cy|)` 切比雪夫距离 | 俯视棋盘的直觉距离 |
| 距离增益 | `refDist ≤ d ≤ maxDist` 时 `refDist / d` | refDist = **1.5 格**（该距离内满增益），maxDist = **9 格**（超出静音） |
| 后排低通 | `cutoff = 20000 − 9000 × clamp((by − cy) / halfH, 0, 1)` Hz | 前排 20kHz → 后排 11kHz，模拟纵深 |
| 远端微降调 | `playbackRate = 1 − 0.015 × (d / maxDist)` | 心理声学上"更远" |

**为什么用反比衰减（1/d）而不是对数衰减**：对数衰减（`log10`）是为真实 3D 大场景设计的，在 9 格的小棋盘上会导致 3 格之外就几乎听不见，信息丢失严重。反比衰减在这个尺度上更平缓、更可用。

### 5.4 裁决优先级覆盖（verdict override）

| 事件类别 | pan | 距离增益 | 低通 | 理由 |
| --- | --- | --- | --- | --- |
| 我方技能命中 `ae:combat/impact/*` | **0** | 1.0 | 无 | 核心战斗信息，绝不能偏侧 |
| 暴击 / 致命击杀 | 保留 50% | ×0.8 下限 | 无 | 需要方位感，但必须清晰 |
| 敌方技能命中 | 完整 `board` | 完整 | 完整 | 敌方信息可以弱化 |
| 开战 / 结算 / 羁绊 | `none` | 1.0 | 无 | 全局事件 |

### 5.5 混响区

三个预设，随场景切换：

| 场景 | Pre-delay | Decay | Wet | 实现 |
| --- | --- | --- | --- | --- |
| 竞技场（默认棋盘） | 20ms | 0.8s | 12% | 轻量 |
| 后台 / 走廊（备战期菜单） | 30ms | 1.5s | 25% | 中等 |
| 舞台（首领 / 压轴） | 50ms | 3.0s | 40% | 最重 |

**实现建议：不要用 `ConvolverNode`。** 在低端移动设备上卷积混响成本可达 1.5ms+，会直接吃掉整个音频预算。改用**两个 `DelayNode` + `BiquadFilterNode` + 反馈增益**组成的轻量网络，成本 < 0.3ms，听感在短混响下足够。若未来确实需要真实空间感，再考虑程序化生成 IR 的卷积方案（并需要单独的性能预算）。

混响区切换同样走增益斜坡（300ms），禁止瞬时切换导致的"空间跳变"。

---

## 6. 动态音乐系统

### 6.1 设计思路：不做"整曲切换"

因为音频全部是程序化合成的，"stem"没有内存成本，只有 CPU 成本，而 CPU 成本只作用于**增益大于 0 的层**。因此本项目的垂直分层（vertical layering）优于水平重排（horizontal re-sequencing）—— 这与"内存紧张时优先水平重排"的通用建议相反，是本项目的特例。

关键实现点：**当某层的目标增益为 0 时，直接跳过该层的音符调度**，而不是继续调度再静音。这既省 CPU，也让"层级激活"成为真正有意义的性能开关。

### 6.2 音乐参数与来源

| 参数 | 范围 | 来源 | 更新率 | 平滑 |
| --- | --- | --- | --- | --- |
| `music.phase` | `lobby / prep / battle / settle / over` | `S.phase` 变更事件 + 大厅状态 | 事件驱动 | 离散跳变，但**触发量化切段** |
| `music.tension` | 0 – 1 | 回合类型基值（普通 0.4 / 野怪 0.6 / 精英 0.75 / 首领 1.0）+ 双方存活数差 ±0.15 + 我方掉血速度 ±0.1 + 连败层数 ±0.05 | 每 0.5s | 每 tick lerp α=0.15（≈3s 收敛） |
| `music.density` | 0 – 1 | 战场存活单位数 / 12 | 每 1s | lerp α=0.25 |
| `music.duck` | 0 – 1 | 结算 jingle / 剧情 VO 事件驱动 | 事件驱动 | ramp 120ms 入 / 400ms 出 |
| `match.boss` | bool | 第 25/50/75/100 回合、压轴演出 | 回合开始 | 无 |
| `mix.snapshot` | 枚举 | `S.phase` 派生 | 事件驱动 | 见 §3.1 快照 fadeMs |

**参数写入方必须是游戏侧推送**，音频层不得主动读 `S`。这是"纯表现层"不变量的直接落地方式。

### 6.3 四层结构

见前文阶梯图。层次定义：

| 层 | 音区 | 合成方式 | 常驻性 |
| --- | --- | --- | --- |
| `pad` | 和声铺底 | 3–4 个三角波，慢包络（attack 0.8s） | **永远存在**，保证"可无限播放不疲劳" |
| `bass` | 低音脉冲 | 方波 + 低通，跟随 16 步低音序列 | tension ≥ 0.15 |
| `perc` | 打击 | 噪声层 + 短包络（8ms attack） | tension ≥ 0.45 |
| `mel` | 主奏 | 锯齿/正弦 + 延迟，随变奏换旋律 | tension ≥ 0.70 或 `match.boss` |

### 6.4 状态转换规则

| 转换 | 量化对齐 | 过渡方式 | 时长 |
| --- | --- | --- | --- |
| prep → battle | **最近小节线** | 层逐层进入：perc 先、bass 后 | 1 小节（@128bpm ≈ 1.88s） |
| battle → prep | **最近 4 小节边界** | 层逐层退出 | 4 拍 ≈ 1.88s |
| battle → boss | **最近小节线** | BPM 128 → 140 线性插值 + mel 进入 | 2 小节 |
| 任意 → settle | **允许即时**（结算需跟手） | 只做 duck，不改层 | 120ms duck |
| settle → prep | 最近小节线 | duck 恢复 + 段落重置 | 400ms |
| 任意 → over | 最近小节线 | 全层淡出，jingle 接管 | 1 小节 |

**禁止事项**：
- 禁止硬切（唯一例外：玩家静音）。
- 禁止单次调度整首曲子 —— 必须用 200ms lookahead + 60ms tick 的滚动调度。
- 禁止在 `document.hidden` 时推进音乐时钟。恢复可见时**从当前小节重新对齐，不追补丢失的节拍**（否则会瞬间倾泻一堆音符）。
- 禁止音乐序列器调用游戏 `rand()`。

### 6.5 疲劳规避

| 手段 | 参数 |
| --- | --- |
| 变奏轮换 | 每层 4 个变奏（A / B / A′ / B′），每 **8 小节**换一次 |
| 旋律休止 | `mel` 每小节有 **25%** 概率整体休止（休止由音乐专属 LCG 决定） |
| 音阶池随 tension 迁移 | tension < 0.3 用五声音阶 → 0.3–0.7 加自然音 → > 0.7 引入半音张力音 |
| 和声行进 | `pad` 每 4 小节换一次和弦根音，取自 4 个预设行进（避免单调） |
| 鼓组变化 | percussion 每 2 小节在 2 个节奏型之间切换 |

### 6.6 与其他总线的闪避关系

| 触发源 | 目标 | 深度 | 进入 | 保持 | 释放 |
| --- | --- | --- | --- | --- | --- |
| 结算 jingle | `music` | −6 dB | 120ms | jingle 时长 + 300ms | 400ms |
| 剧情 VO | `music` `amb` | −9 dB / −6 dB | 150ms | VO 时长 | 500ms |
| 首领开战 | `amb` | −8 dB | 200ms | 战斗期间 | 600ms |

Web Audio 没有原生侧链，实现方式为**在事件侧调度 `musicBus.gain` 的自动化曲线**，深度与时长从配置读取。

---

## 7. 资源命名与目录组织规范

### 7.1 事件 ID 命名空间

```
ae:<domain>/<group>/<name>
```

规则：
- 全小写；层级用 `/` 分隔；**禁止**大写、空格、中文、连续斜杠。
- 同层级内的多词概念用 `/` 继续分层，不要用下划线拼接（例外：单位 ID 与羁绊 ID 沿用现有小驼峰，如 `ae:syn/stShenhai` 保持向后兼容）。
- **禁止在游戏代码中拼接事件名字符串**（如 `'ae:combat/impact/' + type`）—— 必须走查表函数（现有 `skillImpact()` / `v3Impact()` 的模式是正确的，应保留并扩展到全部领域）。
- 未注册的事件 ID 调用必须静默 no-op，并计入 `AE.debug.unknown` 计数（便于发现拼写错误）。

### 7.2 完整命名空间表

| 命名空间 | 覆盖 | 数量（现状 → 目标） |
| --- | --- | --- |
| `ae:shop/*` | 购买、出售、刷新、经验、装备 | 0 → 5 |
| `ae:board/*` | 上阵、整理、拿起、出售区、升级、升星 2/3 | 0 → 7 |
| `ae:combat/cast` | 蓄力起手 | 1 → 1 |
| `ae:combat/impact/*` | 11 类技能命中音色 | 12 → 11（合并 `slash` 与 `impactBlade`） |
| `ae:combat/{crit,dodge,death,zone}` | 暴击、闪避、死亡、区域 | 3 → 4 |
| `ae:unit/<unitId>/<cue>` | 角色专属机制音 | 5 → 5 |
| `ae:syn/<bondId>` | 22 个羁绊（12 阵营 + 10 职业） | 22 → 22 |
| `ae:match/battle/*` | 开战、野怪、精英 | 2 → 3 |
| `ae:match/result/*` | 胜、负、通关 | 2 → 3（新增 `final`） |
| `ae:match/round/reward` | 回合收益 | 1 → 1 |
| `ae:ui/*` | 面板、页签、图鉴、toast、设置 | 0 → 8 |
| `ae:amb/<scene>` | 环境循环（新） | 0 → 3 |
| `ae:music/<state>/<stem>` | 音乐层（新） | 0 → 20 |
| `ae:vo/<charId>/<lineId>` | 语音（预留） | 0 → 预留 |

**现有 62 键 → 新 ID 的迁移映射（摘要）**（下表只列 40 个通用键；22 个 `st*` 羁绊音统一改为 `ae:syn/<bondId>`）

| 现状键 | 新 ID | 备注 |
| --- | --- | --- |
| `buy` | `ae:shop/buy` | |
| `sell` / `roll` / `lvlup` / `equip` | `ae:shop/sell` / `reroll` / `xp` / `equip` | `lvlup` 语义是买经验，与 `pop` 区分开 |
| `pop` | `ae:board/levelup` | 现名有歧义，改名 |
| `deploy` / `tidy` / `drag` / `sellhint` | `ae:board/deploy` / `tidy` / `pickup` / `sellzone` | |
| `merge2` / `merge3` | `ae:board/rankup2` / `rankup3` | |
| `cast` | `ae:combat/cast` | |
| `slash` | `ae:combat/impact/blade` | 与 `impactBlade` 合并（两者配方不同但语义重复） |
| `spellFire` / `spellIce` / `spellZap` / `spellDark` | `ae:combat/impact/{fire,ice,zap,dark}` | |
| `heal` / `shield` / `stunHit` | `ae:combat/impact/{heal,shield,stun}` | |
| `impactBlade` / `impactArc` / `impactWater` / `impactPoison` | `ae:combat/impact/{blade,arc,water,poison}` | |
| `crit` / `die` / `zone` / `dodgeleaf` | `ae:combat/{crit,death,zone,dodge}` | `dodgeleaf` 是闪避 |
| `battleStart` / `horn` | `ae:match/battle/{start,wild}` | |
| `win` / `lose` / `finalWin` / `settle` | `ae:match/result/{win,lose,final}` + `ae:match/round/reward` | `settle` 是收益提示，不是结果 |
| `splash` / `bounce` / `bleat` / `rockcrack` / `vampbite` | `ae:unit/<id>/<cue>` | 需确认归属棋子 |
| `st*`（22 个） | `ae:syn/<bondId>` | 批量改名 |

### 7.3 迁移策略（不破坏现有测试）

`tools/sound-system.test.js` 的 10 组用例直接断言 `sfx('buy')` 等旧键与源码正则。因此迁移必须分两步：

1. **P0 阶段**：保留 `sfx(key, opt)` 作为薄封装，内部 `AE.emit(LEGACY_MAP[key] || key, opt)`。新旧 ID 同时可用，旧键标记为 deprecated 但保持可发声。现有 10 组用例不受影响。
2. **P1 之后**：在测试里增加"旧键与新 ID 必须映射到同一配方"的断言，然后逐步替换调用点；全部替换完成后删除 `LEGACY_MAP`。

### 7.4 文件路径规范（仅在未来引入采样时生效）

```
assets/audio/
├─ AUDIO_MANIFEST.json          # 资源清单（幂等构建、校验用）
├─ sfx/
│  ├─ shop/buy_01.ogg           # 多采样池编号从 01 起
│  ├─ shop/buy_02.ogg
│  ├─ combat/impact/blade_01.ogg
│  └─ unit/<unitId>/<cue>_01.ogg
├─ amb/
│  ├─ lobby_day.ogg             # 循环文件，必须带精确 loop 点
│  └─ stage_boss.ogg
├─ music/
│  └─ combat/pad.ogg            # 若改为采样，仍按 stem 拆分
└─ vo/
   └─ <charId>/<lineId>.ogg
```

规则：
- 路径与事件 ID **一一对应**（`ae:shop/buy` → `assets/audio/sfx/shop/buy_01.ogg`），无需在代码里写路径 —— 由 manifest 建立映射。
- 多采样池用两位零填充编号 `_01` … `_04`，禁止 `_1`。
- 禁止在文件名中使用中文、空格、大写。
- `AUDIO_MANIFEST.json` 必须包含：事件 ID、文件列表、字节数、时长、采样率、声道数、loop 点（如有）、SHA-256。构建时校验清单与实际文件一致。

### 7.5 配置目录

```
specs/
├─ audio-system-design.md       # 本文档
├─ audio-config.json            # 事件 / 音乐 / 快照 / 绑定表（单一真相源）
└─ audio-config.schema.json     # 校验用 JSON Schema
tools/
└─ audio-config.test.js         # 配置校验 + 绑定双向一致性
```

---

## 8. 格式与压缩要求

### 8.1 优先级决策

| 优先级 | 方式 | 何时使用 | 体积 |
| --- | --- | --- | --- |
| **1（默认）** | **程序化合成** | 所有当前 62 个事件、全部音乐层、全部环境循环 | **0 字节**，0 网络请求，天然离线 |
| 2 | 短采样（OGG） | 仅当合成无法表现时（真实乐器、特定人声质感） | ~4–12 KB / 个 |
| 3 | 内嵌 base64 | 仅限 < 8 KB 且必须在首次交互前就绪的极短音 | 计入 HTML 体积，增加 33% |
| 4 | 长采样流式 | 仅当音乐改为成品曲目时 | 数百 KB |

**建议：在本项目上坚持优先级 1。** 理由：无构建、零依赖、PWA 离线预缓存、Cloudflare 静态包体 —— 引入音频资源会同时增加部署体积、首屏加载、缓存失效复杂度，而收益（音质）在"明亮·电子"的合成器声学定位下并不显著。

### 8.2 若引入采样：格式规范

| 资产类型 | 格式 | 码率 | 声道 | 流式 | 理由 |
| --- | --- | --- | --- | --- | --- |
| 短 SFX（< 1.5s） | OGG Vorbis q3 | ≈ 48 kbps | **单声道** | 解压到内存 | 单声道减小体积；空间定位由引擎的 `StereoPanner` 负责，**禁止预先烘焙立体声定位** |
| 音乐 stem | OGG Vorbis q4 | ≈ 64 kbps | 立体声 | 流式 | 分层需要独立文件 |
| 长环境（> 10s） | OGG Vorbis q3 | ≈ 48 kbps | 单声道 | 流式 | 必须提供精确 loop 点 |
| 语音 | OGG Vorbis q2 | ≈ 32 kbps | 单声道 | 流式 | |
| 极短 UI（< 0.3s） | 内嵌 PCM | — | 单声道 | 内存常驻 | UI 要求零延迟，解码开销不可接受 |

**明确禁止**：

| 禁止 | 原因 |
| --- | --- |
| MP3 | 编码器前置/后置静音填充导致无缝循环不可靠，也不适合短音效的样本精确触发 |
| 未压缩 WAV 上线 | 单声道 16bit 48kHz 的 1s 音效 = 96 KB，50 个就是 4.8 MB，直接吃掉 PWA 预算 |
| 44.1kHz 重采样到 48kHz 或反之 | 浏览器 `AudioContext` 会自行处理；手工重采样只会引入伪影 |
| 预先烘焙立体声 / 声像 | 与 §5 的空间化冲突，且无法适应不同屏幕比例 |
| 把音频加入 `sw.js` precache 列表 | 会显著膨胀首屏安装体积 |

### 8.3 PWA / Service Worker 策略

- 音频资源**不进入** `sw.js` 预缓存清单。
- 首次播放时 lazy fetch，并按 `Cache Storage` 的 `audio-v1` cache 缓存（`Cache-Control: public, max-age=31536000, immutable`）。
- 离线上线降级：音频 fetch 失败时，该事件静默降级为**合成 fallback**（若配置提供 `synthFallback`），否则静默 no-op —— 绝不抛错，绝不阻塞游戏。
- `.assetsignore` 需要新增 `assets/audio/**` 的例外规则（当前 `assets/campaign` 与 `assets/units_redraw` 已被排除）。

---

## 9. 内存 / 声道 / 并发预算

### 9.1 声道配置

| 项 | 决策 |
| --- | --- |
| 输出声道 | **固定 2.0 立体声** |
| 5.1 / 7.1 / Dolby Atmos | **不支持**。浏览器 canvas 游戏 + 手机扬声器场景，多声道投入产出比为零；对象音频还要求平台认证（主机/杜比），不适用 |
| 源声道 | 全部单声道，定位交给 `StereoPannerNode` |
| 采样率 | 跟随 `AudioContext` 默认（44.1k / 48k），不强制 |
| 位深 | 采样统一 16bit；合成浮点无需关心 |

### 9.2 并发配额汇总

| 池 | desktop | mobile | lowEnd | 是否与其他池互相抢占 |
| --- | --- | --- | --- | --- |
| SFX 事件槽 | 12 | 8 | 6 | 池内按 tier 抢占 |
| 音源（oscillator / buffer）总并发 | 40 | 28 | 20 | 硬上限，创建前检查 |
| 音乐层 | 4 | 4 | 3（去掉 mel） | **不被 SFX 抢占** |
| 环境层 | 2 | 2 | 1 | 不被 SFX 抢占 |
| 混响网络 | 2 | 2 | 1 | — |

**音源并发与事件槽是两个独立的计数**（现有实现只计事件槽，但音源数才是真正的 CPU/内存消耗源）。每个事件最多 4 个音调层 + 1 个噪声层 = 5 个音源，因此 12 事件 × 5 = 60 音源的极端情况必须被 `sourceCap` 截断。

### 9.3 内存预算

| 类别 | desktop | mobile | lowEnd | 说明 |
| --- | --- | --- | --- | --- |
| 噪声 buffer 池（4 × 0.5s @48k float） | 384 KB | 384 KB | 192 KB（2 个） | **预生成 + 复用**，见下 |
| 常驻合成节点 | < 200 KB | < 200 KB | < 150 KB | 总线图 + 未播放的音源对象 |
| 音乐序列器状态 | < 50 KB | < 50 KB | < 50 KB | 纯 JS 对象 |
| 单事件瞬时分配 | ≤ 12 KB | ≤ 12 KB | ≤ 12 KB | 纯合成事件不分配 buffer |
| **稳态总量** | **≤ 1.5 MB** | **≤ 1.0 MB** | **≤ 0.8 MB** | 不含 `AudioContext` 自身开销 |
| 若引入采样：SFX 池 | ≤ 8 MB | ≤ 8 MB | ≤ 8 MB | 按需解码 + LRU 淘汰 |

**必须修正的真实缺陷**：现有实现的噪声层每次播放都在主线程现场填充 `AudioBuffer`：

```js
// index.html「噪声层」分支 —— 每次发声都在主线程跑 dur × sampleRate 次循环
// （grep "噪声层（纸声" 定位；行号会漂移）
const len = Math.max(1, Math.ceil(ctx.sampleRate * dur));
const buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
for (let i = 0; i < len; i++) ch[i] = (sfxNoise()*2-1) * Math.pow(1-i/len, 1.6);
```

一个 0.5s 的 `zone` 音效在 48kHz 下是 **24000 次迭代 + 一次 `Math.pow`**。在密集战斗中单帧多个噪声事件会直接造成主线程卡顿（虽然每个 `Math.pow` 只有 ~20ns，但 24000 × 3 个事件 ≈ 1.4ms，已经吃满预算）。

**建议修正**：预生成 4 个 0.5s 的噪声 buffer（不同种子，含不同的衰减包络预置），播放时通过 `playbackRate`（音色变化）与 `start(when, offset, duration)`（窗口截取）复用。成本从"每事件 O(n)"降为"每事件 O(1)" + 一次性 O(4n) 初始化。

---

## 10. 性能预算

### 10.1 预算表

| 指标 | desktop | mobile | lowEnd | 测量方法 |
| --- | --- | --- | --- | --- |
| 单帧音频主线程耗时 | ≤ 0.35 ms | ≤ 0.5 ms | ≤ 0.8 ms | `performance.now()` 包住每帧 emit 批处理 |
| 音频线程 DSP | ≤ 1.2 ms | ≤ 1.5 ms | ≤ 2.0 ms | `AudioContext.renderCapacity`（支持时）或回退到帧率差 |
| 单事件创建（无噪声层） | ≤ 0.05 ms | ≤ 0.05 ms | ≤ 0.08 ms | microbenchmark，1000 次取中位数 |
| 单事件创建（含噪声层） | ≤ 0.06 ms | ≤ 0.06 ms | ≤ 0.09 ms | 噪声池化后的目标值（现状 ≈ 0.5ms，**这是要修的点**） |
| 每帧 emit 调用次数 | ≤ 16 | ≤ 10 | ≤ 8 | 计数器 + 门禁 |
| 首次发声延迟（手势 → 首音） | ≤ 30 ms | ≤ 50 ms | ≤ 60 ms | 记录 pointerdown 到首个 `osc.start` |
| 稳态内存增量 | ≤ 1.5 MB | ≤ 1.0 MB | ≤ 0.8 MB | heap diff / `measureUserAgentSpecificMemory` |
| 音乐调度抖动 | ≤ 15 ms | ≤ 25 ms | ≤ 35 ms | 实际 `currentTime` 与目标节拍时间差 |

> 上表为**预算目标**，不是已测得的数值。P0 落地时必须先建立基线测量脚本，再用真实数字回填。

### 10.2 验收门禁

- 音频资源总体积增量 ≤ 目标值（当前为 **0 字节**，若引入采样则 ≤ 200 KB）。
- 首屏 precache 体积增量 ≤ **0**（音频不进 precache）。
- 无 `Uncaught` / `Unhandled` 异常；无 AudioContext 环境下 `emit` 不抛错。
- 压测场景：第 100 回合最终首领战，50 枚棋子同场，全部技能同帧释放 —— 事件槽与音源并发均不超上限，帧率下降 ≤ 5%。

---

## 11. 音频事件 ↔ 游戏事件对接

### 11.1 API 契约

| API | 签名 | 职责 |
| --- | --- | --- |
| `AE.emit(id, opts)` | `opts = { pos?, delay?, scale?, tier?, params?, spatial? }` | 触发一次性事件 |
| `AE.loop(id, opts)` / `AE.stopLoop(handle, fadeMs)` | | 启动/停止循环（环境、持续音） |
| `AE.param(name, value, rampMs?)` | | 写全局参数（含平滑） |
| `AE.music(state, opts)` | `opts = { tension?, bpm?, quantize? }` | 请求音乐状态转换 |
| `AE.snapshot(name, fadeMs?)` | | 切换混音快照 |
| `AE.setMuted(bool)` | | 总静音（合并 `_sfxOn` 与 `ARENA_SILENT` 两套语义） |
| `AE.setVolume(bus, db)` | | 按总线调音量，持久化到 `vc_vol` |
| `AE.debug` | `{ active, sources, dropped, throttled, preempted, unknown, music: {state, bar, beat, tension} }` | 只读观测 |

**兼容层**：`sfx(key, opt)` 保留为 `AE.emit` 的薄封装（§7.3），`toggleSfx()` 保留并映射到 `AE.setMuted`。

### 11.2 时机规则

| 类别 | 规则 | 依据 |
| --- | --- | --- |
| 与视觉同帧 | 绝大多数 SFX | audit《声画事件约定》 |
| 早于视觉 | 结算横幅（−120ms）、野怪号角 | 让玩家"预感到"结果 |
| 晚于视觉 | 升星音（购后 +90ms） | audit 记录的组合动作顺序 |
| 技能主体声 | 伤害命中帧 + `0–70/SPEED` ms | audit 已确定；蓄力环 260ms 不该推迟主体声 |
| 受 SPEED 缩放 | 所有战斗内事件的 `delay` 与 `dur` | `max(1, SPEED)` |
| 不受 SPEED 缩放 | UI、结算、音乐（音乐有自己的 BPM） | |

### 11.3 接线示例（现状 → 目标）

| 游戏函数 / 位置 | 现状 | 目标 |
| --- | --- | --- |
| 购买成功分支 | `sfx('buy')` | `AE.emit('ae:shop/buy')` |
| 升星判定 | `sfx('merge2'/'merge3')` | `AE.emit(rank===3?'ae:board/rankup3':'ae:board/rankup2')` |
| `castV3Skill` | `skillSound(v3Impact(k, u))` | 保留：`skillSound()` 内部改调 `AE.emit` |
| `castSkill` | `skillSound(skillImpact(arch))` | 保留 |
| `spawnZone` | `sfx('zone')` | `AE.emit('ae:combat/zone', {spatial:'board', pos})` |
| `showResultBanner` | 结束次要声、保留技能命中声 | 保留该语义，并追加 `AE.snapshot('story')` + `AE.duck('music', -6)` |
| 回合开始 | `sfx(S.round%5===0?'horn':'battleStart')` | `AE.emit(S.round%5===0?'ae:match/battle/wild':'ae:match/battle/start')` + `AE.music('battle', {tension})` |
| `S.phase` 变更 | 无 | 推送 `AE.param('music.phase', …)` + `AE.snapshot(…)` |
| 羁绊变化 | `sfx('stXxx')` | `AE.emit('ae:syn/'+bondId)`（**允许拼接，因为 bondId 来自数据表，且需注册表校验**） |

### 11.4 禁止事项

- 音频代码**不得**读 `S`、`UNITS`、经济数据或存档。
- 音频代码**不得**调用 `rand()`、`sfxNoise()` 之外的任何随机源用于游戏逻辑；`sfxNoise()` 也不得被游戏逻辑调用。
- 音频代码**不得**改变事件顺序、DOM 顺序或计时器顺序。
- 静音 / 无 `AudioContext` / `document.hidden` 时，`emit` 必须走**完全相同的分支路径直到丢弃点**，保证计数可预测（现有测试第 3 组依赖此性质）。

---

## 12. 可配置数据格式

### 12.1 单一真相源

`specs/audio-config.json` 是所有音频行为的唯一真相源。代码只包含配置校验与执行逻辑，**不含任何音量、频率、优先级硬编码**。

### 12.2 Schema 摘要

```jsonc
{
  "$schema": "./audio-config.schema.json",
  "version": 1,

  "mixer": {
    "buses": {
      "master": { "gainDb": 0, "compressor": { "threshold": -12, "knee": 6, "ratio": 4, "attack": 0.008, "release": 0.25 } },
      "music":  { "gainDb": -6 },
      "amb":    { "gainDb": -14 },
      "ui":     { "gainDb": -6 },
      "battle": { "gainDb": -8 },
      "syn":    { "gainDb": -10 }
    },
    "snapshots": {
      "default": { "music": 0,  "amb": 0,   "ui": 0,  "battle": 0,  "syn": 0,  "fadeMs": 300 },
      "combat":  { "music": 2,  "amb": -6,  "ui": 0,  "battle": 2,  "syn": 0,  "fadeMs": 900 },
      "story":   { "music": -9, "amb": -12, "ui": 0,  "battle": -6, "syn": -4, "fadeMs": 600 },
      "menu":    { "music": 0,  "amb": -4,  "ui": 0,  "battle": -20, "syn": -20, "fadeMs": 300 }
    }
  },

  "limits": {
    "profiles": {
      "desktop": { "eventSlots": 12, "sourceCap": 40, "perFrame": 16 },
      "mobile":  { "eventSlots": 8,  "sourceCap": 28, "perFrame": 10 },
      "lowEnd":  { "eventSlots": 6,  "sourceCap": 20, "perFrame": 8 }
    },
    "reservedTiers": { "6": 1, "7": 1 },
    "rateLimitMs": { "default": 110, "t2": 120, "t3": 80, "t4": 80, "t5": 140, "t6": 0, "t7": 0 }
  },

  "events": {
    "ae:shop/buy": {
      "bus": "ui",
      "tier": 5,
      "spatial": "none",
      "rateLimitMs": 140,
      "layers": [
        { "type": "tone", "wave": "sine", "freq": [880, 1318], "dur": 0.10, "vol": 0.5, "attackMs": 12 }
      ],
      "variation": { "variantCount": 3, "pitchJitter": 0.015, "gainJitterDb": 1.5, "startOffsetMs": 4 }
    },

    "ae:combat/impact/fire": {
      "bus": "battle",
      "tier": 3,
      "spatial": "override",
      "layers": [
        { "type": "tone",  "wave": "sawtooth", "freq": [210, 90], "dur": 0.24, "vol": 0.32 },
        { "type": "noise", "dur": 0.24, "vol": 0.25, "filter": { "type": "lowpass", "freq": 2400 } }
      ],
      "variation": { "variantCount": 2, "pitchJitter": 0.02 }
    },

    "ae:amb/stage": {
      "bus": "amb",
      "tier": 1,
      "mode": "loop",
      "spatial": "none",
      "layers": [
        { "type": "noise", "dur": 4.0, "vol": 0.10, "filter": { "type": "bandpass", "freq": 400, "q": 0.7 } }
      ],
      "loop": { "fadeInMs": 800, "fadeOutMs": 1200 }
    }
  },

  "music": {
    "states": {
      "prep":   { "bpm": 92,  "tension": 0.20, "quantize": "bar",   "layers": ["pad", "bass"] },
      "battle": { "bpm": 128, "tension": 0.55, "quantize": "bar",   "layers": ["pad", "bass", "perc"] },
      "boss":   { "bpm": 140, "tension": 1.00, "quantize": "bar",   "layers": ["pad", "bass", "perc", "mel"] },
      "settle": { "bpm": null, "duckDb": -6,       "quantize": "immediate" },
      "over":   { "bpm": 92,  "quantize": "bar",   "layers": [] }
    },
    "layers": {
      "pad":  { "enterTension": 0.00, "steps": 16, "variants": 4, "gainDb": -12, "attackMs": 800 },
      "bass": { "enterTension": 0.15, "steps": 16, "variants": 4, "gainDb": -10, "attackMs": 20 },
      "perc": { "enterTension": 0.45, "steps": 16, "variants": 2, "gainDb": -14, "attackMs": 8 },
      "mel":  { "enterTension": 0.70, "steps": 16, "variants": 4, "gainDb": -9,  "restProbability": 0.25 }
    },
    "transitions": {
      "layerInBeats": 2, "layerOutBeats": 4, "bpmRampBars": 2, "lookaheadMs": 200, "tickMs": 60
    },
    "scales": {
      "calm":   [0, 2, 4, 7, 9],
      "normal": [0, 2, 4, 5, 7, 9, 11],
      "tense":  [0, 2, 3, 5, 6, 8, 10, 11]
    }
  },

  "bindings": [
    { "game": "shop.buy.success",       "audio": "ae:shop/buy",              "timing": "sameFrame" },
    { "game": "shop.buy.rankup",        "audio": "ae:board/rankup2",         "timing": "delayMs:90" },
    { "game": "combat.skill.cast",      "audio": "ae:combat/cast",           "timing": "sameFrame" },
    { "game": "combat.skill.impact",    "audio": "ae:combat/impact/*",       "timing": "delayMs:0-70/SPEED" },
    { "game": "match.battle.start",     "audio": "ae:match/battle/start",    "timing": "sameFrame" },
    { "game": "match.result.win",       "audio": "ae:match/result/win",      "timing": "delayMs:-120" }
  ]
}
```

### 12.3 校验规则

| 规则 | 违反后果 |
| --- | --- |
| `tier` ∈ {0..7} | 配置加载报错 |
| `bus` ∈ `mixer.buses` 的键 | 配置加载报错 |
| `spatial` ∈ {none, board, override}，**必填** | 配置加载报错（禁止隐式默认） |
| `rateLimitMs` 缺失时从 `limits.rateLimitMs.t<tier>` 继承；T6/T7 为 0 | 校验告警 |
| `gainDb` / `vol` 区间：`vol` ∈ (0, 1]，`gainDb` ∈ [−60, +6] | 校验报错 |
| 事件 ID 匹配 `^ae:[a-z0-9]+(/[a-zA-Z0-9]+)+$` | 校验报错 |
| `layers` 长度 ≤ 5（4 音调 + 1 噪声） | 校验报错 |
| `layer.dur ≤ 8s`（超过必须声明为 loop） | 校验告警 |
| 每个 `bindings[].audio` 必须存在于 `events` 或匹配通配规则 | 校验报错 |
| **每个代码中的 `AE.emit` 调用点必须在 `bindings` 中有对应条目，且每条 binding 必须有代码调用点** | 校验报错（双向一致性，见 §14） |

### 12.4 加载与热重载

- 构建时：配置以 `const AUDIO_CONFIG = {...}` 内联进 `index.html`（保持单文件无构建）；`specs/audio-config.json` 是源，由脚本同步。
- 开发时：支持 `?audio=dev` 时通过 `fetch('./specs/audio-config.json')` 覆盖内联版本（**仅开发模式**，生产环境不发起任何 fetch）。
- 热重载：`AE.reload()` 重新校验并应用配置；正在播放的事件不受影响（新配置只作用于后续事件）。

---

## 13. 参数暴露与协作方案

### 13.1 三类参数

| 类别 | 归属 | 内容 | 修改方式 |
| --- | --- | --- | --- |
| **策划可调** | `audio-config.json` | 音量、音高、时长、限流、tier、空间模式、变化幅度、音乐 BPM、音阶、层次进入阈值、衰减距离、快照增益、duck 深度 | 改 JSON → 跑校验 → 试听 |
| **程序专有** | 代码 | 合成算法（波形/滤波器/包络形状）、混响网络拓扑、调度器实现、抢占算法 | 改代码 + 单测 |
| **只读观测** | `AE.debug` | 活动事件槽 / 音源数 / 被丢弃 / 被限流 / 被抢占 / 未知 ID / 音乐 state·bar·beat·tension | 只读，不可写 |

### 13.2 策划调参台

三条能力，缺一不可：

**1. 开发者 HUD**（`?audio=dev` 开启）

```
音频 | 事件槽 7/8 | 音源 21/28 | 丢 3 | 限 12 | 抢 2
music: battle bar 7 beat 3 tension 0.62 | pad -12.0 bass -10.0 perc -14.0 mel -inf
master -2.1 dB | music -8.4 | amb -14.0 | ui -6.0 | battle -8.0 | syn -10.0
```

每 250ms 刷新一次，覆盖在画布角落（开发模式专用，生产环境不创建 DOM）。

**2. 控制台即时调参**

```js
AE.tune('ae:shop/buy', { bus: 'ui', vol: 0.4, tier: 5 });   // 立即生效，无需重载
AE.tune('music.battle.bpm', 132);
AE.reset();                                                  // 恢复配置默认值
AE.exportTuning();                                           // 输出可提交的 patch JSON
```

调参结果持久化到 `localStorage.vc_audio_tune`，只保存与基线不同的差异项。

**3. 试听面板**（可选，开发模式）

枚举全部事件 ID，点击单个播放；支持"满负载试听"（一次性触发 12 个事件，验证抢占行为）和"同键连点"（验证限流）。

**上线前必须清空 `vc_audio_tune`**，并有一条测试断言：生产构建不含调参增量。

### 13.3 协作流程

```
策划    → 改 specs/audio-config.json（只动"策划可调"字段）
       → node tools/audio-config.test.js（Schema + 双向绑定校验）
       → 浏览器 ?audio=dev 试听 + AE.tune 临时试
       → AE.exportTuning() 导出 patch
程序    → 审查 patch（确认未触碰"程序专有"字段）
       → 合入 audio-config.json + 同步内联副本
       → node tools/sound-system.test.js（回归 10 组 + 新增 12 组）
       → 提 PR，附试听结论
```

### 13.4 命名与提交规范

| 项 | 规范 |
| --- | --- |
| 事件 ID | §7.1；新增事件必须先在 `audio-config.json` 注册，否则静默 no-op |
| 提交信息 | `audio(<domain>): <动作>`，例：`audio(combat): 拆分护盾与治疗命中音色` |
| 附带要求 | 任何改动音量/优先级/空间模式的 PR 必须附 `?audio=dev` 截图或试听结论 |
| 破坏性变更 | 删除/重命名事件 ID 属于破坏性变更，必须在 PR 描述中列出全部调用点 |

---

## 14. 验收与回归

### 14.1 现有测试必须继续通过

`node tools/sound-system.test.js` 的 10 组用例（RNG 隔离、并发回收、限流后计数、静音与无音频环境、尾音回收槽位、高优先级抢占、真实 V3 技能映射、区域音与速度缩放、立即结算保留命中声、系统音接线）是回归底线，**P0 阶段不得破坏任何一组**。

### 14.2 新增测试用例（12 组）

| # | 用例 | 断言 |
| --- | --- | --- |
| 1 | 总线图存在性 | 每条 bus 是一个独立 `GainNode`；任何事件都**不直接** connect 到 destination |
| 2 | 快照切换 | 只改 `gain`，不重建节点；实际淡化时长 = 配置值 ±10ms |
| 3 | 预留槽 | 满载 12 事件时 T6 事件仍可发声，且**不打断**正在播放的 T3 事件 |
| 4 | 每帧上限 | 单帧 emit 超过 `perFrame` 时按 tier 丢弃，`__sfxPlayed` 不增加 |
| 5 | 音源并发 | 极端场景下音源数不超过 `sourceCap` |
| 6 | 空间化 | `spatial:board` 事件的 pan 随棋盘 x 单调；`spatial:override` 的 pan 恒为 0 |
| 7 | 音乐量化切换 | phase 切换在最近小节线生效；过渡期间各层增益之和 > 0（无静音间隙） |
| 8 | 音乐 BPM 渐变 | BPM 变化在 2 小节内线性完成，单步跳变 ≤ 3% |
| 9 | 可见性恢复 | `hidden → visible` 后节拍相位对齐，不追补丢失节拍 |
| 10 | 音乐 RNG 隔离 | 音乐调度全程 `rand()` 调用数为 0，且不写 `S` |
| 11 | Duck | jingle 期间 `musicBus.gain` ≤ −6dB；结束后 400ms 内恢复至基线 ±0.5dB |
| 12 | 配置校验 | 未知 tier / 未知 bus / 缺 `spatial` 加载报错；`AE.emit` 调用点与 `bindings` 双向一致 |

### 14.3 人工试听清单

| 场景 | 检查点 |
| --- | --- |
| 连续买 10 次棋子 | 无叠音、无卡顿、升星音顺序正确（先购后升） |
| 第 100 回合最终首领战 | 音乐层次在首领出现时升到满配；结算音可闻；无削顶 |
| 多目标 AOE 技能 | 群体技能只响一次主体声 |
| 同帧 3 个棋子死亡 | 死亡音不齐响（限流生效） |
| 备战后切页签、开图鉴 | UI 音不盖过任何战斗音（备战期本无战斗音，应验证不盖过音乐） |
| 战斗中切后台 30s 再回来 | 音乐从当前小节继续，无音符倾泻 |
| 静音开关切换 | 已在播放的音全部停止；重载后偏好保持 |
| 手机外放 + 耳机各听一遍 | 声像决策在两种输出下都不失衡（§5 单声道源 + pan 的核心验证） |

---

## 15. 分期落地路线

| 阶段 | 范围 | 交付物 | 风险 |
| --- | --- | --- | --- |
| **P0** | 总线节点图替换 `SFX_BUS` 乘法系数；母带压缩；tier 重编为 8 档；预留槽；`sfx()` 兼容层 | 现有 10 组测试全绿 + 新增用例 1/2/3/12 | 低。纯重构，行为等价 |
| **P1** | 事件 ID 命名空间迁移 + `audio-config.json` 外置 + 配置校验 | 新增用例 4/5/12；旧 ID 映射断言 | 中。调用点较多（37 处 `sfx(`），需逐个替换 |
| **P2** | 动态音乐系统（四层 + 参数 + 量化切换 + duck） | 新增用例 7/8/9/10/11 | **高**。新增调度器 + 时钟，是唯一引入"时序"的模块 |
| **P3** | 环境层 + 混响网络 + 噪声 buffer 池化 | 噪声池化后可测单事件耗时下降 | 中。池化改动触及合成核心 |
| **P4** | 棋盘空间化 + 三种 spatial 模式 + 裁决覆盖 | 新增用例 6 | 中。需要与战斗事件的坐标来源对齐 |
| **P5** | 策划调参台（HUD + tune API + 试听面板）+ CI 门禁 | 开发模式工具 + 生产环境零痕迹断言 | 低 |

**建议顺序理由**：P0 和 P1 是纯结构改造，风险最低且立刻消除三处真实缺陷（总线不可调、无压缩、无预留槽）；P2 是价值最高但风险也最高的一块，应该在配置体系稳定后再做；P4 的空间化收益最小（听觉可读性优先意味着大部分关键音其实是 `none` 或 `override`），放最后。

---

## 16. 待确认的决策点

| # | 决策 | 建议 | 影响面 |
| --- | --- | --- | --- |
| 1 | 是否坚持 100% 程序化合成，还是引入采样资源 | **坚持合成**。零字节、零请求、离线天然可用、无构建。仅当出现合成无法表现的音色（如真实人声质感）再局部引入 | §7.4 / §8 / §9.3 |
| 2 | 混响实现：轻量延迟网络 vs `ConvolverNode` | **轻量网络**。卷积在低端移动上 ≥ 1.5ms，吃掉整个预算 | §5.5 / §10.1 |
| 3 | `ae:unit/*` 五个角色音的归属确认 | 需核对 `splash/bounce/bleat/rockcrack/vampbite` 当前绑定的是哪几个棋子，再定 `<unitId>` | §7.2 |
| 4 | 音乐是否覆盖"八人竞技"模式（bot 对战期间） | 建议竞技模式沿用 `battle` 状态但 BPM 降至 120，避免长时间高张力疲劳 | §6.4 |
| 5 | 单人玩法（巡演企划等）是否已下线 | `.assetsignore` 注释称已下线，但 `README.md` 仍描述五种玩法。若已下线，音乐状态机的 `chapter` 分支可暂不实现 | §4.4 / §6.4 |

---

**免责声明**：本文档为音频系统设计规格，不构成任何投资建议，与游戏数值平衡无关联。本文档描述的行为变更均需经 `tools/sound-system.test.js` 与 `tools/audio-config.test.js` 双回归验证后方可合入。
