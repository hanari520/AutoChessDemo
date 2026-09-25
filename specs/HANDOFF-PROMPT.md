# 《虚拟棋战》经典模式改造 · 交接提示词

> 交给另一个 AI agent 继续执行。**动代码前必须先读完本文件。**
> 项目根目录 `F:\demo`，游戏在 `F:\demo\autochess`。当前状态：可用，14 个测试套件全绿。

---

## 1. 上下文背景

- **产品**：单文件网页游戏《虚拟棋战》（`autochess/index.html`，约 5.7MB / 7300+ 行，HTML+CSS+JS 全内联，无构建步骤）。
- **玩法**：自走棋。经典模式 = 100 回合 / 4 章（每章 25 回合，第 25/50/75/100 回合守关）。另有每日挑战、自定义诅咒、八人竞技。
- **目标用户**：**虚拟偶像粉丝优先，自走棋硬核玩家为辅**。
  → 这决定一切取舍：**「让粉丝看到我推的角色放技能」优先级高于「难度曲线精确」**。粉丝失败后不会复盘阵容，只会觉得不好玩然后退出。
- **已完成的改造**（勿重复做）：见 `autochess/specs/implementation-log-2026-09-25.md`。上游依据：`specs/design-review-2026-09-25.md`（评审）、`specs/classic-mode-replan-2026-09-25.md`（计划）。

---

## 2. 任务目标（按优先级，选一项推进）

| 优先级 | 任务 | 备注 |
|---|---|---|
| P1 | **Step 4 剩余：角色卡 / 语音接口** | 独立 UI 工程，无难度风险 |
| P2 | **每日打卡** | 受 §3.2 红线限制，只能给展示类奖励，需先设计奖励形态 |
| P3 | **B1 经验曲线 / C3 护甲软上限 / B3 连败补贴** | **当前冻结**，须先决定「用 bot 还是真人数据标定难度」 |
| P3 | **难度标定基准** | 建议先上线已完成的体验改动，收 1–2 周真人退出分布再定 |

---

## 3. 硬约束（违反即返工）

1. **禁止调整任何难度参数**（用户明确要求冻结）：`DIFF_TUNE_BASE` / `CH_DIFF` / `CH_BOSS` / `enemyCap` / `BATTLE_HP_MUL` / `BATTLE_START_MANA` / 经验曲线 / 连败补贴 / 扣血公式。**一个数字都不能动。**
2. **收集层与内容层不得附带任何数值加成**。立绘、本命、称号、打卡奖励一律只能给展示内容。一旦能给数值，每新增一份内容都要重测全部难度基线。
3. **改动前先备份**：`cp autochess/index.html autochess/index.html.bak-<日期>`。
4. **A/B 对比必须同种子、同样本量**。`N=100/SEED=11` 与 `N=300/SEED=7` **不可相减**；跨口径只能作方向性参考，且必须显式标注。
5. **任何影响难度或经济产出的改动，必须把 `CAMPAIGN_RULES_VER` +1 并同步后端 `CAMPAIGN_RULES`**（当前均为 `2`）。

---

## 4. 输入与输出规范

**输入**：`autochess/index.html`（唯一要改的游戏文件）、`autochess/tools/sim.js`（无头模拟器，跑批/断言/A-B 的唯一入口）、`tools/_t*_tests.js` 与 `tools/*.test.js`、`autochess/specs/*.md`。

**输出（缺一不可）**：
1. 改动的 `index.html`（保持**单文件、零新增运行时依赖**）
2. **每个新增行为配一条断言**
3. **真实浏览器验收脚本**（新功能必做）
4. 向 `specs/implementation-log-2026-09-25.md` **追加**章节：改了什么 / 为什么 / 实测数据 / 被推翻的结论
5. 更新 `F:\demo\overview.md`
6. 追加当日记忆 `F:\demo\.workbuddy\memory\YYYY-MM-DD.md`

---

## 5. 具体执行步骤

### 5.1 起手（每次必做）

```bash
cd /f/demo/autochess
cp index.html index.html.bak-$(date +%Y%m%d-%H%M)
# 先确认哪些测试本来就是红的，别把既有失败当成自己弄坏的
for t in T1 T2 T3 T4 T5 EFFECT_TEST PACE_TEST CAMPAIGN_TEST DAILY_CAMPAIGN_TEST; do
  printf "%-20s " "$t"; env $t=1 node tools/sim.js >/dev/null 2>&1 && echo OK || echo FAIL
done
for f in daily100_backend daily-campaign daily-curses sound-system solo-modes; do
  printf "%-20s " "$f"; node --test tools/$f.test.js >/dev/null 2>&1 && echo OK || echo FAIL
done
```

### 5.2 改代码 → 加断言 → 跑回归

- 断言写在 `tools/_t2_tests.js`（通用/数据类）或对应套件文件。
- 跑批：`env <套件名>=1 node tools/sim.js`。
- **A/B 对照**：`env SEED=11 HTML=tools/_cv_x.html node tools/sim.js 100`（`HTML=` 可指定任意版本文件）。
- 对比只看三行：`100 回合通关` / `章节守关通过率（条件` / `技能可见性`。

### 5.3 浏览器验收（新功能必须做）

- 在 `autochess/` 下起服务：`python -m http.server 8088`
- **必须用 `channel='chrome'`**（playwright 自带内核未安装）、**用 `D:/anaconda3/python.exe`**（装了 playwright）
- 参考现成脚本：`tools/_verify_share.py`、`_verify_guide.py`、`_verify_codex.py`
- **必须走真实 UI 路径**（点真实按钮），不要手写 DOM 注入

---

## 6. 验收标准

| 项 | 标准 |
|---|---|
| 14 个测试套件 | 全绿（9 个 `sim` 断言套件 + 5 个 `node --test` 套件） |
| 后端语法 | `node --check autochess-api/cloudbase-functions/lb/index.js`；`node --input-type=module --check < autochess-api/src/index.js` |
| 浏览器验收 | 新功能有 `_verify_*.py`，输出 `RESULT: PASS` 且 **0 console 错误** |
| 行为中性声明 | 若声明"不影响现有行为"，须同种子逐字节 diff 证明（用 `HTML=` 指定备份版对比 r1–24 输出） |
| 数值红线 | 收集/内容层新增数据字段**只能有展示字段**，断言 `Object.keys(e).every(k=>['used','win','first'].includes(k))` |

---

## 7. 已知陷阱（每条都真实踩过）

1. **跨口径对比会得出错误结论。** 曾用 `N=100/SEED=11` 与 `N=300/SEED=7` 相减得出"通关率 −6.7pp"，补跑同口径后真实值是 **−4pp**。先确认口径再下结论。
2. **`#flowShell` 会拦截所有点击。** 页面初始停在 flow 首页，顶栏与弹窗都被遮罩压住。须 `showFlowPage('game')` 或真正开局后再操作。图鉴是弹窗 `#bookModal`，同样被压。
3. **整页截图可能空白但 DOM 是对的。** 用 `locator('#元素').screenshot()` 元素截图，并用**文件体积**判断有效性（真实 UI 截图 ~1MB，纯空白远小于此）。
4. **残留存档会让流程卡住。** 有 `vc_save4` 时点「新的对局」先弹放弃进度确认页（`flowPage='confirm'`），后续点击全失效。清 localStorage 要"保留引导标记、清掉存档"。
5. **热路径禁用 `isPassive()`**（内部是 50 元素线性查找）。战斗中必须用缓存标记 `u.isPassiveFlag`——曾因此在每 tick 每单位调用它引入性能回归。
6. **测试可能固化了旧契约。** 改契约后测试变红，先用备份版判断"既有失败 vs 我引入的"，再**跟着新契约改而保留断言原意**，不要删。
7. **修 bug 也是加强度。** 例如修复"不可达羁绊档位"等于给玩家开了新选项。任何"修正"都要问：这会不会移动通关率？会的话就按 nerf/buff 对待并实测。
8. **控制类改动有隐式耦合。** 把"沉默封受击回蓝"放宽为"减半"，会让持续伤害反过来给被沉默者喂蓝，直接废掉"沉默+烧蓝"锁杀体系（EFFECT_TEST 抓到）。

---

## 8. 参考基线（改动后务必复核，防无声回退）

**完全同口径（`N=100, SEED=11`）**：100 回合通关 `75%`；每场我方施法 `≈11.4` 次；技能覆盖率 `≈63%`；第 1 章失败局数 `14`。

**关键常量（当前值）**

| 常量 | 值 | 作用 |
|---|---|---|
| `CAMPAIGN_RULES_VER`（index.html） | 2 | 经典榜规则版本戳 |
| `CAMPAIGN_RULES`（两个后端） | 2 | 与上同步 |
| `CAMPAIGN100_BOARD`（CloudBase） | `'normal100v2'` | 已清分 |
| `BATTLE_START_MANA` | 25 | 双方开局蓝。微调难度最精准的旋钮，但**当前冻结** |
| `DIFF_TUNE_BASE` | 0.612 | 全局难度（**冻结**） |
| `SKILL_STAGGER` | 800 | 施法闸门间隔；已改为**分边**（每方各自 800ms） |

**工具链开关**

| 开关 | 用途 |
|---|---|
| `env T1..T5=1` | 功能断言套件 |
| `env EFFECT_TEST=1` / `PACE_TEST=1` | 特效 / 节奏契约 |
| `env CAMPAIGN_TEST=1` / `DAILY_CAMPAIGN_TEST=1` | 四章边界 / 每日 |
| `env SEED=<n> MAXR=<n>` | 固定种子 / 限制回合 |
| `env HTML=<路径>` | 指定版本文件跑批（A/B 关键） |
| `env DBGLOG=<关键词>` | 导出战报日志 |
| `env CURSE=<id>` | 带自定义诅咒跑批 |
| `globalThis.__HEADLESS` | 无头标记（需 UI 的交互走自动分支） |

---

## 9. 部署提醒

- **经典榜清分代码已改但需部署才生效**：CloudBase 云函数重新部署 + Worker `wrangler deploy`，否则线上仍是旧榜。
- 物理删除旧榜记录：Worker 有 `POST /api/admin/reset`（带 `X-Admin-Key`）；CloudBase 需控制台操作。
- 回滚点：`autochess/index.html.bak-20260925`。
