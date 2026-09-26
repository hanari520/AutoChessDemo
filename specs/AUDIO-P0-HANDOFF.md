# 《虚拟棋战》音频系统重构 · P0 执行提示词

> **交给另一个 AI agent 执行。动代码前必须按 §6.1 起手，先跑既有测试套件。**
> 项目根目录 `F:\demo`，游戏在 `F:\demo\autochess`。
> 上游依据（必读，按顺序）：
> 1. `autochess/specs/audio-system-design.md` ← **本轮任务书**（重点 §2 架构 / §3 优先级 / §9–10 预算）
> 2. `autochess/specs/sound-system-audit.md` ← **不变量契约**（纯表现层 / 随机数隔离 / 静默安全）
> 3. `autochess/tools/sound-system.test.js` ← **现有 10 组契约**，本轮不得破坏
> 4. `autochess/specs/HANDOFF-PROMPT.md` ← 通用交接与项目级陷阱
>
> **本文只覆盖设计文档 §15 的 P0 部分（6 项任务）。P1–P5 明确不在本轮范围。**

---

## 1. 一句话任务

**在音频行为零变化的前提下，把现有"事件直连 `destination` + 分类音量只是乘法系数"的结构，改造成真实的总线 `GainNode` 图 + 母带压缩 + 8 档 tier 抢占 + 噪声缓冲池化**，并保证 `tools/sound-system.test.js` 现有 10 组用例全绿。

---

## 2. 项目背景与当前状态

- **产品**：单文件网页游戏《虚拟棋战》。`autochess/index.html` 约 600 KB / 7500+ 行，HTML+CSS+JS 全内联，**无构建步骤、零新增运行时依赖**。
- **音频现状（本文所有取舍的事实依据）**：游戏**零音频资源文件**。全部声音由 `index.html` 内一个 179 行的 Web Audio 程序化合成引擎现场生成（`SFX_DEF` 共 **62** 个配方键 = **40 个通用事件 + 22 个 `st*` 羁绊音**；约 **35** 处 `sfx(` 调用点）。
- **本轮要解决的三个真实缺陷**（详见设计文档 §0.1 / §9.3）：

| # | 缺陷 | 现状代码 | 后果 |
|---|---|---|---|
| A | 分类音量只是"创建时的乘法系数" | `vol=(d.vol||.3)*(SFX_BUS[d.t]||.5)` | 总线无法实时调音、静音、做快照、淡变；未来音乐/环境层无从挂载 |
| B | 事件**直连输出**，无压缩器 | `g.connect(ctx.destination)` | 密集战斗（多目标技能同帧）会削顶失真 |
| C | 噪声层每次发声在**主线程现场填充 buffer** | `for(let i=0;i<len;i++) ch[i]=…Math.pow(…)` | 0.5s 音效 @48k = 24000 次迭代 + 一次 `Math.pow`；密集战斗单帧多事件 ≈ 1.4 ms |

- **必须继承的不变量**（`sound-system-audit.md` 已固化）：纯表现层 / 随机数隔离（`sfxNoise()` 独立 LCG，绝不碰游戏 `rand()`）/ 静默安全（无 `AudioContext`、无手势、静音偏好切换均不抛错）/ `delay` 与 `dur` 随 `SPEED` 缩放。

### ⚠ 开工前的协作状态（必看）

`git status -sb` 当前显示 **`index.html` / `CHANGELOG.md` / `specs/implementation-log-2026-09-25.md` / `sw.js` 四个文件已修改未提交**。经核实，这批改动来自**另一个 agent 已经完成**的关卡设计 P0（T1–T6，见 `specs/LEVEL-DESIGN-P0-PROMPT.md`；其记录称 14 个套件全绿、`_verify_level_p0.py` PASS、`SEED=11 N=100` 前后逐字节相同、前端 Service Worker 缓存升到 **v58**）。

- **开工前必须先把这批改动落盘（commit）或与维护者确认边界**，否则音频 P0 会和关卡 P0 混进同一个 diff，一旦测试变红无法归因。
- 本轮的改动物理上都集中在 `index.html` 的「声音系统」区块内，**不要碰 `sw.js`**——音频没有任何新增资源文件，不需要动缓存版本号。
- 音频区块行号**正在漂移**：21:11 时在 `2739–2918`，22:46 已在 `2873–3051`。**一律 grep 定位，不要信任何行号。**

---

## 3. 本轮范围（严格边界）

### 做（P0 六项）

| # | 任务 | 层 | 行为变化 |
|---|---|---|---|
| T1 | 建立真实总线节点图（`ui` / `battle` / `global` 三条 `GainNode` → master） | 混音 | **无**（音量数值等价） |
| T2 | 母带压缩链（`DynamicsCompressorNode`） | 混音 | 仅密集负载下峰值下降 |
| T3 | tier 常量表 + tier 内抢占策略（最旧 / 最轻 / 最远） | 事件层 | 同档位抢占从"未定义"变为确定 |
| T4 | 预留槽机制（**默认关闭**） | 事件层 | **无**（配置为空时完全等价） |
| T5 | 噪声 buffer 池化（4 个复用缓冲替代每次现场填充） | 渲染层 | 无（音色有极小差异，见 T5） |
| T6 | `AE` API 收口 + 调试接口冻结 | API | 无（`sfx()` 保留为薄封装） |

### 不做（写进报告即可，不要动）

- **P1**：事件 ID 命名空间迁移（`ae:shop/buy` 等）、配置外置到 `specs/audio-config.json`、profile 化事件槽。
- **P2**：动态音乐系统（四层 stem / tension 参数 / 量化切换 / duck）——**本轮一行都不要写**。
- **P3**：环境音层、混响网络。
- **P4**：棋盘空间化（`StereoPannerNode` / 衰减 / `spatial` 三模式）。
- **P5**：策划调参台（HUD / `AE.tune` / 试听面板）。
- **任何 `SFX_DEF` 的音量、频率、时长数值调整**——本轮是纯结构改造，**一个 `SFX_DEF` 数字都不许动**。

---

## 4. 硬约束（违反任何一条 = 返工）

1. **`SFX_DEF` 全部数值冻结**：`f` / `dur` / `type` / `vol` / `noise` / `priority` **一个数字都不能改**。本轮只改"声音怎么被路由和调度"，不改"声音听起来是什么"。
2. **新增代码必须落在声音系统区块内**（详见 §8 陷阱 6）。`tools/sound-system.test.js` 用字符串切片执行该区块，**写在外面的代码在测试里等于不存在**。
3. **禁止在音频代码里调用 `rand()`**。仅允许 `sfxNoise()`。这是 `sound-system-audit.md` 的硬契约，测试第 1 组直接断言。
4. **音频代码不得读 `S` / `UNITS` / 存档 / 经济数据**。纯表现层，只接受参数。
5. **`sfx(key, opt)` 的签名与语义不许变**。约 35 处调用点、10 组测试都依赖它。`AE.emit` 是新增的更高层入口，`sfx` 是它的薄封装。
6. **调试接口冻结**：`_sfxVoices` / `_sfxActive` / `_sfxLast` / `window.__sfxCount` / `window.__sfxPlayed` 的**名称、类型、语义**不许变，测试直接读它们。
7. **`ARENA_SILENT` 与 `_sfxOn` 两条早退分支必须保留在最前面**（`sfx()` 第一行），且**不得增加计数**。
8. **改动前先备份**：`cp autochess/index.html autochess/index.html.bak-$(date +%Y%m%d-%H%M)`。
9. **改 `sfxCtx()` 或新增节点类型时，必须同步给 `tools/sound-system.test.js` 的 `harness()` 补桩**（详见 §8 陷阱 2/3/4）。不补桩的后果是**测试假绿**，比测试报红危险得多。
10. **`V3_ASSET` 的声明格式不许改**（必须单行 `const V3_ASSET={…;`），测试用正则抽取它。
11. 本轮**不应**递增 `CAMPAIGN_RULES_VER`，**不应**碰任何难度参数——你没做难度改动，如果你动了，说明你跑偏了。

---

## 5. 任务清单

> 行号全部会漂移，**一律 grep 定位**。

### T1 · 真实总线节点图

**为什么**：`SFX_BUS={ui:.5,battle:.42,global:.6}`（grep `const SFX_BUS`）现在只是一个乘法系数，`vol=(d.vol||.3)*(SFX_BUS[d.t]||.5)`。这意味着分类音量在事件创建那一刻就被"烧死"了，无法做任何运行时控制。P2 的音乐层、P3 的环境层、设计文档 §6.6 的侧链 duck 全部依赖真实的总线节点。

**做法**：新增惰性构建的总线图。**总线名与增益值必须与现有 `SFX_BUS` 完全一致**，这样行为严格等价：

```js
/* 音频总线图：voice → 分类总线 → master → [压缩] → 主增益 → destination
   惰性构建，随 sfxCtx() 首次成功创建。总线增益沿用原 SFX_BUS 数值（P0 行为等价）。 */
let _busGraph=null;
function busGraph(ctx){
  if(_busGraph) return _busGraph;
  const mk=v=>{ const g=ctx.createGain(); g.gain.value=v; return g; };
  const master=mk(1);
  let tail=master;
  if(ctx.createDynamicsCompressor){ /* T2 在此接入 */ }
  const out=mk(1); tail.connect(out); out.connect(ctx.destination);
  const buses={};
  for(const k in SFX_BUS){ const g=mk(SFX_BUS[k]); g.connect(master); buses[k]=g; }
  return (_busGraph={buses, master, out, tail});
}
```

**改调用点**：两处 `g.connect(ctx.destination)`（噪声层与音调层各一）改为 `g.connect(busGraph(ctx).buses[d.t] || busGraph(ctx).master)`。

**关键验收**：
- 事件源**不再**直连 `destination`（新增断言，见 §7）；
- 现有 10 组用例全绿；
- 听感与改造前无差异（浏览器对比 mp4/录屏或人耳 A/B）。

---

### T2 · 母带压缩链

**为什么**：缺陷 B。多目标 AOE 技能同帧命中时，多个事件同时到达输出，无压缩器会削顶。

**做法**：在 T1 的 `master` 之后插入压缩器：

| 参数 | 值 | 理由 |
|---|---|---|
| `threshold` | −12 dB | 只处理峰值，不动日常音量 |
| `knee` | 6 dB | 软拐点，避免音乐/音效被"压扁" |
| `ratio` | 4 : 1 | 中等强度，够用且不产生泵动 |
| `attack` | 0.008 s | 抓住音效首帧瞬态 |
| `release` | 0.25 s | 释放快于 0.3s，避免战斗连击时泵动 |

```js
if(ctx.createDynamicsCompressor){
  const comp=ctx.createDynamicsCompressor();
  comp.threshold.value=-12; comp.knee.value=6; comp.ratio.value=4;
  comp.attack.value=.008; comp.release.value=.25;
  master.connect(comp); tail=comp;
}
```

**必须用 `if(ctx.createDynamicsCompressor)` 守卫**——测试桩没有这个方法（§8 陷阱 2）。

**注意**：Web Audio 的 `DynamicsCompressorNode` 按规范在拐点处包含内部补偿增益，因此正常情况下**不会整体变轻**；但请**以实测听感为准**，若整体偏轻再给 `out` 补 +1~2 dB。**不要在 P0 凭猜测补偿。**

---

### T3 · tier 常量表 + tier 内抢占策略

**为什么**：缺陷来自设计文档 §3.3。现有抢占是 `_sfxActive.filter(v=>v.priority<(d.priority||2)).sort((a,b)=>a.priority-b.priority)[0]`——**同档位内行为未定义**，取决于数组顺序，等于随机。

**做法**：引入 8 档 tier 语义，**但把 `priority` 保留为 tier 的别名**（现有 `SFX_DEF` 的 1/2/3/4/5 语义完全不变）。这样测试里的 `_sfxActive.filter(e=>e.priority===5)` 天然继续成立，不需要改测试。

```js
/* tier = 不可丢性（不是响度）：0 装饰 / 1 环境 / 2 战斗细节 / 3 战斗信息
   / 4 战斗节点 / 5 玩家操作 / 6 结算 / 7 关键节点。
   P0 阶段 tier 直接复用现有 priority 字段的数值（1..5），新增事件可显式写 tier。 */
const SFX_TIER_STEAL={0:'quietest',1:'quietest',2:'farthest',3:'oldest',4:'oldest',5:'farthest',6:'oldest',7:'never'};
function tierOf(d){ return d.tier!=null?d.tier:(d.priority!=null?d.priority:2); }
```

**event 对象新增三个字段**（不得改已有字段）：`tier`（同 priority）、`startedAt`（= `when`）、`gain`（= 实际 `vol`）、`dist`（= `opt.dist||0`，P4 才会真正填值）。

**抢占逻辑改为**（保持"只抢一个"）：

```js
if(_sfxVoices>=slotCap()){
  const vt=tierOf(d);
  const pool=_sfxActive.filter(v=>v.tier<vt);          // 严格小于：同 tier 不许挤占
  if(!pool.length) return;
  const lowest=Math.min(...pool.map(v=>v.tier));
  const cand=pool.filter(v=>v.tier===lowest);
  const mode=SFX_TIER_STEAL[lowest]||'oldest';
  const victim = mode==='farthest' ? cand.slice().sort((a,b)=>(b.dist||0)-(a.dist||0))[0]
               : mode==='quietest' ? cand.slice().sort((a,b)=>(a.gain||0)-(b.gain||0))[0]
               :                     cand.slice().sort((a,b)=>a.startedAt-b.startedAt)[0];
  if(!victim) return;
  victim.stop();
}
```

**关键验收**：
- 现有测试第 6 组继续通过（8 个 tier 2 满载 + `win`(tier 5) → 恰好抢占 1 个；`sellhint`(tier 2) → 不发声）；
- 新增断言：同 tier 满载时**抢占目标确定且可复现**（同一序列跑两次结果一致）；
- 新增断言：victim 一定是 `tier < 新事件 tier` 中 tier 最低的那个。

---

### T4 · 预留槽机制（**默认关闭**）

**为什么**：设计文档 §3.3。现在"战斗打满 8 路时胜利音要靠抢占才能响"，会打断一首正在播放的战斗音。预留槽让它永远有位置。

**做法**：**P0 只建立机制，默认配置为空，保证行为等价**：

```js
/* 预留槽：为高 tier 保留固定槽位，避免靠抢占打断正在播放的战斗音。
   P0 默认关闭（空对象 = 行为与改造前完全一致）。开启后需同步更新
   tools/sound-system.test.js 第 6 组断言（win 将走预留槽而非抢占）。 */
const SFX_RESERVED={};        // 例：{6:1, 7:1}
const SFX_EVENT_SLOTS=8;      // 现行为 8；profile 化属 P1
function totalReserved(){ let s=0; for(const k in SFX_RESERVED) s+=SFX_RESERVED[k]; return s; }
function slotCap(){ return SFX_EVENT_SLOTS-totalReserved(); }
function reservedInUse(t){ return _sfxActive.filter(v=>v.tier===t).length; }
```

在 T3 的抢占池里追加一条：**若 `lowest` 档位的 `reservedInUse(lowest) <= (SFX_RESERVED[lowest]||0)`，则该档位跳过，继续找下一个更低的档位。**

`SFX_RESERVED={}` 时 `slotCap()` 恒为 8、跳过条件恒不成立 → **行为严格等价**。

**验收**：
- 默认配置下现有测试全绿；
- **额外**写一组断言，临时把 `SFX_RESERVED` 设为 `{5:1}`，验证：满载 8 时 tier 5 事件仍能发声，且被抢的是 tier 2 而不是 tier 5；
- 报告里必须给出**开启 `{6:1,7:1}` 后的测试差异清单**（设计文档 §14.2 用例 3），但**不要把开启状态提交**。

---

### T5 · 噪声 buffer 池化

**为什么**：缺陷 C，也是本轮**唯一有实测性能收益**的一项。

```js
/* index.html 现状（grep "噪声层"）：每次发声都在主线程填充 dur × sampleRate 次 */
const len=Math.max(1,Math.ceil(ctx.sampleRate*dur));
const buf=ctx.createBuffer(1,len,ctx.sampleRate), ch=buf.getChannelData(0);
for(let i=0;i<len;i++) ch[i]=(sfxNoise()*2-1)*Math.pow(1-i/len,1.6);
src.connect(g); g.connect(ctx.destination);
```

**做法**：预生成 4 个 0.5 s 噪声缓冲，播放时用 `playbackRate` 与 `start(when, offset, duration)` 窗口复用：

```js
/* 噪声池：4 个 0.5s 缓冲复用于全部噪声层，替代每事件 O(n) 现场填充。
   预生成仍走 sfxNoise()，不消耗游戏 RNG。 */
const _noisePool=[]; let _noiseSeq=0;
function noiseBuf(ctx){
  const key=_noiseSeq++%4;
  if(_noisePool[key]) return _noisePool[key];
  const len=Math.max(1,Math.ceil(ctx.sampleRate*.5));
  const buf=ctx.createBuffer(1,len,ctx.sampleRate), ch=buf.getChannelData(0);
  for(let n=0;n<len;n++) ch[n]=(sfxNoise()*2-1)*Math.pow(1-n/len,1.6);
  _noisePool[key]=buf;
  return buf;
}
```

播放处改为：

```js
if(d.noise){
  const src=ctx.createBufferSource();
  src.buffer=noiseBuf(ctx);
  if(src.playbackRate) src.playbackRate.value=1;        // 守卫：测试桩无此属性（§8 陷阱 4）
  const g=ctx.createGain(); g.gain.value=vol*Math.min(1,d.noise);
  src.connect(g); g.connect(busGraph(ctx).buses[d.t]);
  const end=when+dur+.02;
  src.start(when, 0, Math.min(dur+.02, .5));            // 窗口截取，不再依赖 buf.duration
  src.stop(end);
  event.sources.push(src);
  if(end>event.until){event.until=end;event.tail=src;}
}
```

**必须注意的三点**：
1. **不要依赖 `buf.duration` 或 `buf.sampleRate`**——测试桩的假 buffer 没有这两个属性（§8 陷阱 3）。窗口长度直接写 `Math.min(dur+.02, .5)`。
2. **缓冲区长度必须用 `ctx.sampleRate` 计算**，禁止硬编码 48000——测试桩的 `sampleRate` 是 **1000**（§8 陷阱 5）。
3. **`src.start(when, 0, duration)` 的三参形式不能省**——否则 0.05s 的音效会播满 0.5s。

**验收**：
- 现有测试全绿（特别是第 1 组 RNG 隔离、第 8 组区域音落点 `starts[1]-1.03`）；
- **新增断言**：连续触发 20 次带噪声的事件后，假 `ctx.createBuffer` 的调用次数 **≤ 4**（证明池化生效，而不是仍然每事件一次）；
- 报告里给出改造前后**单事件创建耗时**的微基准（`performance.now()` 包 1000 次，取中位数），这是设计文档 §10.1 那一行"含噪声层 ≤ 0.06ms"的目标值来源。

---

### T6 · `AE` API 收口 + 调试接口冻结

**为什么**：设计文档 §11.1。游戏侧不应该直接调 `sfx()`，需要一个能承载未来参数/快照/空间化的入口；但 P0 不能改调用点。

**做法**：新增 `AE` 命名空间，`sfx()` 变成它的薄封装，**调用点一行不改**：

```js
const AE={
  emit:(id,opts)=>sfx(id,opts),                       // P1 迁到 ae: 命名空间后在此做映射
  setMuted(v){ if(!!v===!_sfxOn) toggleSfx(); },
  get muted(){ return !_sfxOn; },
  debug:{ get active(){return _sfxActive.length}, get voices(){return _sfxVoices},
          get last(){return _sfxLast}, get graph(){return _busGraph} },
};
if(typeof window!=='undefined') window.AE=AE;
```

**验收**：`window.AE.emit === sfx`（或至少行为一致）；`AE.debug.graph` 在发声后非空；`AE.setMuted` 与 `toggleSfx` 行为一致且 `localStorage.vc_sfx` 同步。

---

## 6. 执行流程

### 6.1 起手（每次必做）

```bash
cd /f/demo/autochess
git status -sb                       # 先确认工作区里别人未提交的改动，别覆盖
cp index.html index.html.bak-$(date +%Y%m%d-%H%M)

# 先确认哪些测试本来就是红的，别把既有失败当成自己弄坏的
for t in T1 T2 T3 T4 T5 EFFECT_TEST PACE_TEST CAMPAIGN_TEST DAILY_CAMPAIGN_TEST; do
  printf "%-20s " "$t"; env $t=1 node tools/sim.js >/dev/null 2>&1 && echo OK || echo FAIL
done
for f in daily100_backend daily-campaign daily-curses sound-system solo-modes; do
  printf "%-20s " "$f"; node --test tools/$f.test.js >/dev/null 2>&1 && echo OK || echo FAIL
done
```

**基线应全绿（14 套件）**。有红的先记录在报告里，再开工。
**本轮的 10 组音频契约集中在 `sound-system` 套件**，单项查看：

```bash
node tools/sound-system.test.js       # 期望输出 10 行 ✅，无 AssertionError
```

### 6.2 每次改完必做的三项验证

```bash
# ① 语法检查（改 index.html 后必跑）
node -e "const s=require('fs').readFileSync('index.html','utf8'); new Function(s.match(/<script>([\s\S]*?)<\/script>/)[1]); console.log('OK')"

# ② 音频契约（本轮的核心验收，10 组必须全绿）
node tools/sound-system.test.js

# ③ 同种子逐字节对比（兜底：证明没碰坏别的东西）
env SEED=11 node tools/sim.js 100 > /tmp/after.txt 2>&1
env SEED=11 HTML=index.html.bak-<你的备份文件名> node tools/sim.js 100 > /tmp/before.txt 2>&1
diff /tmp/before.txt /tmp/after.txt && echo "IDENTICAL"   # 期望 IDENTICAL
```

> **⚠ 关于 ② 和 ③ 的分工，务必理解**：`sim.js` 无头环境下 `window.AudioContext` 不存在 → `sfxCtx()` 返回 `false` → `sfx()` 在第三行就 `return`。**音频代码在无头下根本不执行，所以逐字节 diff 对本轮是空验证**——它只能证明"你没顺手改坏战斗逻辑"，**不能证明音频改造正确**。音频改造的正确性**完全由 `sound-system.test.js` 承担**。不要把 `IDENTICAL` 当成"音频做对了"。

### 6.3 浏览器验收（必须做）

音频是本轮唯一"测试全绿但可能完全没声音"的模块。**必须真机听一遍**：

```bash
# 在 autochess/ 下起服务
python -m http.server 8088
```

- **必须用 `channel='chrome'`**（playwright 自带内核未安装）；**用 `D:/anaconda3/python.exe`**（装了 playwright）。
- 参考现成脚本：`tools/_verify_guide.py`、`_verify_20260925.py`。
- **必须走真实 UI 路径**（点真实按钮），不要手写 DOM 注入。
- 新增 `tools/_verify_audio_p0.py`，至少覆盖：
  1. 打开页面 → 点一次真实按钮解锁 `AudioContext` → 断言 `ctx.state==='running'`；
  2. 触发一次购买 → 断言 `window.__sfxCount.buy >= 1`；
  3. 断言 `window.AE.debug.graph` 非空，且其中每个分类总线的 `gain.value` 等于 `SFX_BUS` 的配置值；
  4. 断言**没有任何音源直连 `destination`**（用 `AudioNode.connect` 的 monkey-patch 记录连接目标，检查目标不在 master 链之外）；
  5. 输出 `RESULT: PASS` 且 **0 console 错误**。
- 补充人工听感 A/B：改造前 vs 改造后各听一遍「连续买 10 次棋子」和「第 100 回合最终首领战」，确认**没有变轻、变糊或削顶**。

### 6.4 建议顺序

```
T1 总线图 → T2 压缩器 → T3 tier/抢占 → T5 噪声池化 → T4 预留槽 → T6 AE 收口
每项独立 commit，commit 前跑 §6.2 三项。
```

**理由**：T1/T2 是同一处结构改造，必须一起做（压缩器要接在 master 后面）；T3 独立但改动核心调度逻辑，放中段；T5 触及合成核心、风险最集中，放在 T1–T3 稳定之后做，一旦测试变红能立刻归因；T4 默认关闭且依赖 T3，靠后；T6 是纯收口，最后做。

---

## 7. 验收标准

| 项 | 标准 |
|---|---|
| **14 个测试套件** | **全绿**（9 个 `sim` 断言套件 + 5 个 `node --test`） |
| **`sound-system` 10 组** | **全绿且不得删改任何一条断言的原意**（若因契约变更必须改，见 §8 陷阱 8） |
| 本轮新增断言 | **≥ 4 组**：① 音源不直连 destination；② 压缩器存在且 5 个参数正确；③ 同 tier 满载时抢占目标确定可复现；④ 20 次带噪声发声后 `createBuffer` 调用 ≤ 4 |
| 预留槽 | 默认 `SFX_RESERVED={}` 下行为等价；开启状态的验证写在报告里，**不提交开启状态** |
| 浏览器验收 | `tools/_verify_audio_p0.py` 输出 `RESULT: PASS` 且 0 console 错误 |
| 行为中性 | `diff /tmp/before.txt /tmp/after.txt` 为 `IDENTICAL`（兜底，非音频正确性证明） |
| 性能 | 报告给出噪声池化前后单事件创建耗时的实测中位数 |
| `SFX_DEF` 数值 | **零改动**（断言：改造前后 `SFX_DEF` 的 JSON 序列化逐字节相同） |
| 无新增运行时依赖 | 断言 `index.html` 中 `import` / `require(` / `<script src=` 数量不增加 |

---

## 8. 已知陷阱（每条都真实踩过 / 已核实）

1. **「假绿」是本轮最危险的失败模式。** `sfxCtx()` 内部是 `try{…}catch(e){ return (_actx=false); }`。如果新增的节点图构建代码抛错，异常被吞掉 → `_actx=false` → **`sfx()` 从此静默 return**。此时：断言"不抛错"的组会**通过**，断言"有音源"的组会失败——但如果你只跑了 `node --test` 看了退出码，很容易当成通过。**每次改完必须看 `sound-system.test.js` 的 10 行 ✅ 全部输出，而不是只看退出码。**

2. **测试桩没有 `createDynamicsCompressor`。** `harness()` 的假 ctx 只有：`currentTime` / `state` / `sampleRate` / `destination` / `createBuffer` / `createBufferSource` / `createOscillator` / `createGain`。新增任何节点类型都必须 ① 用 `ctx.createXxx?.()` 或 `if(ctx.createXxx)` 守卫，② **同时给 `harness()` 补桩**。只做①会让压缩器在测试里被静默跳过（假绿），只做②不够因为它们都要做。

3. **测试桩的 buffer 是假的**：`createBuffer(_channels,length)` 返回 `{ getChannelData(){ return new Float32Array(length) } }`——**没有 `duration`，没有 `sampleRate`**。噪声池化不要依赖这两个属性。

4. **测试桩的 source 没有 `playbackRate`**：`createBufferSource()` 返回的对象只有 `starts` / `stopped` / `connect` / `start` / `stop`。写 `src.playbackRate.value=1` 会抛 `Cannot set property of undefined`。**必须 `if(src.playbackRate)` 守卫**。

5. **测试桩的 `sampleRate` 是 `1000`，不是 48000。** 任何按采样率计算的长度/偏移都必须用 `ctx.sampleRate`，**禁止硬编码 48000**。

6. **新增代码必须落在声音系统区块内。** `tools/sound-system.test.js` 的执行范围是：

   ```js
   const begin = html.indexOf('/* ================= 声音系统');
   const end   = html.indexOf('function byId(', begin);
   ```

   写在区间外的函数/常量在测试里**根本不存在**（`undefined` 调用会抛错，或更糟：被 `try/catch` 吞掉后假绿）。同时：**不要把 `function byId(` 这一串字符写进任何新增代码或注释**，否则切片提前截断。

7. **`V3_ASSET` 由测试单独抽取**，正则 `const V3_ASSET=\{[^\n]+;` 要求**单行声明**。不要格式化拆行。`COMBAT_KITS` 同理（测试用 `\n};` 找结尾）。

8. **测试固化了旧契约。** 如果 T3/T4 导致测试变红，先用备份版判断"既有失败 vs 我引入的"，再**跟着新契约改而保留断言原意**，不要删断言。特别是第 6 组的 `old.filter(e=>e.ended).length===1`——这条是"只抢一个"的护栏，改坏了会让抢占变成批量静音。

9. **`__sfxPlayed` 只统计通过限流与容量检查的事件。** 任何新增的提前 `return` 都**不能**增加它。测试第 3 组强制此点。

10. **限流键必须稳定。** `_sfxLast[key]` 用的是调用传入的 `key`。如果 T6/T1 引入新旧 ID 别名，**限流必须用同一个稳定键**，否则同一音效走两个键会绕过 110ms 冷却。

11. **`event.tail` 的语义是"最后结束的那个音源"**（`if(end>event.until){event.until=end;event.tail=src;}`），槽位回收靠 `event.tail.onended`。噪声池化或多源改造后**必须保证 `tail` 仍指向 `until` 最大的源**，否则槽位回收时机错乱（测试第 5、6 组会抓到）。

12. **`_sfxVoices` 递减必须走 `stop()` 且受 `registered` 保护**。测试第 5 组断言重复触发 `onended` 不会把计数减成负数。

13. **同 tier 不许挤占**（`v.tier<vt` 严格小于）。测试第 6 组明确断言 `sfx('sellhint')` 在 8 个同优先级满载时不发声。写成 `<=` 会让它错误地抢掉一个。

14. **`spatial` / `dist` 字段现在填了也没用。** P0 不做空间化，`dist` 全部为 0，`farthest` 策略会退化为"取数组第一个"。这是预期的，**不要为此在 P0 引入 `StereoPannerNode`**（那是 P4）。

15. **行号正在漂移，且工作区有别人未提交的改动。** 见 §2 的协作状态警告。

16. **`isPassive()` / `getComputedStyle` 等热路径禁忌与本轮无关**（音频不在战斗 tick 内），但如果你顺手碰了战斗代码，记得 `HANDOFF-PROMPT.md` 第 5 条。

---

## 9. 参考基线与常量表

### 现状音频常量（**只读，P0 一个都不改**）

| 常量 / 字段 | 当前值 | 作用 |
|---|---|---|
| `SFX_BUS` | `{ui:.5, battle:.42, global:.6}` | 分类音量（P0 变成总线节点增益，**数值不变**） |
| 事件槽上限 | `8`（硬编码 `_sfxVoices>=8`） | P0 抽成 `SFX_EVENT_SLOTS`，值仍为 8 |
| 默认优先级 | `2`（`d.priority\|\|2`） | P0 成为 tier 2 |
| 限流 | `110 ms`（`when-_sfxLast[key]<.11`） | 同键冷却 |
| `SFX_DEF` 键数 | **62**（40 个通用事件 + 22 个 `st*` 羁绊音） | 一个都不改 |
| `sfx(` 调用点 | **约 35 处** | 一行都不改 |
| `delay` 缩放 | `/(opt.scale ? max(1,SPEED) : 1)` | 保留 |
| `dur` 缩放 | `(d.dur\|\|.1)/speed` | 保留 |
| `priority` 分布 | `cast:1` · 默认 `2` · `impact*:3` · `battleStart:4` · `win/lose/finalWin:5` | P0 直接当 tier 用 |
| `exp` 包络 | `exponentialRampToValueAtTime(…, st+min(.012,.012/speed))` | 保留 |
| 噪声包络 | `Math.pow(1-i/len, 1.6)` | 池化后仍用同一曲线 |

### 音频事件槽位的实际占用（改抢占逻辑时对照）

测试第 6 组的场景：`['buy','sell','roll','lvlup','equip','deploy','tidy','drag']` 全部为 tier 2（默认优先级），第 9 个 `win` 为 tier 5 → 恰好抢占 1 个 tier 2。改造后行为必须一致。

### 工具链开关

| 开关 | 用途 |
|---|---|
| `node tools/sound-system.test.js` | **本轮核心验收**，10 组音频契约 |
| `node --test tools/*.test.js` | 5 个 `node --test` 套件 |
| `env T1..T5=1 node tools/sim.js` | 功能断言套件 |
| `env SEED=<n> MAXR=<n>` | 固定种子 / 限制回合 |
| `env HTML=<路径>` | 指定版本文件跑批（A/B 关键） |
| `globalThis.__HEADLESS` | 无头标记 |
| `python -m http.server 8088` | 浏览器验收起服务 |

### 测试桩的关键事实（写代码前必读）

```
harness() 提供的假 AudioContext：
  currentTime: 1        （可写，测试会 += 做时间推进）
  state: 'running'
  sampleRate: 1000      ← 不是 48000！
  destination: {}
  createBuffer(ch, len) → { getChannelData() { return new Float32Array(len) } }   ← 无 duration/sampleRate
  createBufferSource()  → { starts:[], stopped, connect(){}, start(t), stop() }     ← 无 playbackRate
  createOscillator()    → 上述 + { frequency:{} }
  createGain()          → { gain:{ value, setValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){} }

测试可直接读的沙箱变量：
  _sfxVoices / _sfxActive / _sfxLast / sfx / skillSound / v3Impact / skillImpact / toggleSfx / SFX_DEF
  window.__sfxCount / window.__sfxPlayed
  sandbox 里的 ARENA_SILENT=false / SPEED=1 / localStorage(桩) / document.addEventListener(桩) / rand(桩，会计数)
```

---

## 10. 收尾与输出（缺一不可）

1. 改动的 `index.html`（保持**单文件、零新增运行时依赖**）。
2. **每个新增行为配一条断言**（写进 `tools/sound-system.test.js`，追加而不覆盖）。
3. **真实浏览器验收脚本** `tools/_verify_audio_p0.py`（`RESULT: PASS`，0 console 错误，含 §6.3 的 5 项）。
4. 向 `specs/implementation-log-2026-09-25.md` **追加**章节：改了什么 / 为什么 / 实测数据 / 被推翻的结论。
5. 向 `F:\demo\overview.md` 追加本轮交付摘要。
6. 追加当日记忆 `F:\demo\.workbuddy\memory\YYYY-MM-DD.md`。
7. **报告必须显式包含**：
   - `sound-system.test.js` 的 **10 组逐项结果**（不是退出码，是每一条 ✅）；
   - 新增 4 组断言的输出；
   - `diff /tmp/before.txt /tmp/after.txt` 的结果（预期 `IDENTICAL`）+ **一句"这不是音频正确性证明"的说明**；
   - 噪声池化前后**单事件创建耗时中位数**；
   - **`SFX_RESERVED={6:1,7:1}` 开启后的测试差异清单**（仅供后续决策，不提交）；
   - 浏览器听感 A/B 结论（是否变轻/变糊/削顶）。
8. `CHANGELOG.md` 顶部加条目。**本轮不应递增 `CAMPAIGN_RULES_VER`，不应碰任何难度参数。**

### 如果只能做一半

按此优先级：**T1+T2（总线图+压缩器） → T5（噪声池化） → T3（tier/抢占） → T6（AE 收口） → T4（预留槽）**。

理由：T1+T2 是同一处结构改造且解锁后续全部阶段（音乐/环境/快照都挂在总线上），收益最大、风险最低；T5 是唯一有实测性能收益的一项；T3 改动核心调度逻辑，需要有充裕时间做回归；T4 默认关闭、对玩家零影响，最可以先放；T6 是纯收口，不做也不影响正确性。

---

*本提示词基于 `autochess/index.html` 22:46 版本的代码事实，行号会漂移，一律 grep 复核。上游设计文档：`specs/audio-system-design.md`。*
