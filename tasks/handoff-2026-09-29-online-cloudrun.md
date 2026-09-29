# 交接文档：八人联机迁移 CloudBase 云托管 + 机器人功能（2026-09-29）

> 接手更新：第五节疑点已定性。`probe_casts3.mjs` 在云端真实对局第 1 回合取得 4 条 `cast` 事件；客户端同帧播报覆盖是原因。`online/client.js` 已让技能播报保留 700ms，浏览器实测建房、7 机器人、购买上阵及「发动技能」播报通过。前端缓存版本随后升至 v96。下文保留交接时的状态快照与操作记录。

> 交接原因：主流程已完成约 90%，浏览器验收阶段发现一个待查疑点（详见五），用户要求交由其他 agent 检查。
> 本文档自包含：背景、交付物、验证证据、疑点、剩余步骤、全部操作配方。

## 一、任务目标（用户指令拆解）

1. 把八人联机服务从 Cloudflare Durable Objects（原型未部署过）迁移到 **CloudBase 云托管（容器型）**，解决国内连接问题。
2. 新增**房主添加机器人**功能（补位到 8 人开局）。
3. 检查八人模式能否像单人模式正常运行，**棋子都能正确释放技能**。
4. 最终验收：**可创建八人模式进行游玩**。
5. （约束）子 agent 执行任务，最高只允许 glm5.3flash。

## 二、当前状态总览

| 项 | 状态 |
| --- | --- |
| 服务端移植（Node 容器） | ✅ 完成，本地测试 13/13 绿 |
| 技能审计+修复 | ✅ 完成，测试 27/27 绿（已独立复核） |
| 云托管部署 | ✅ 已上线，远程冒烟 PASS |
| 前端接线（client/UI/sw） | ✅ 完成，**尚未推送 GitHub**（线上 CF 站仍是 v94 旧版） |
| 浏览器验收 | ⚠️ 进行中，发现疑点（见五） |
| 文档/CHANGELOG/记忆 | ❌ 未做 |

## 三、交付物清单（文件级）

### server-online/（新形态，旧 CF 版已删）
- `src/server.js` — Node http + ws 入口。全部路由与 CF 版语义一致；**新增** `POST /api/rooms/:code/bots`（房主 token 加机器人）与 `POST /api/rooms/:code/bots/remove`。WS：Origin 校验、每房 16 连接/8 未认证上限、15s 认证超时、30s ping/pong 心跳。`ONLINE_FAST` 环境变量可加速三阶段（测试用）。
- `src/rooms.js` — RoomManager：CF GameRoom 的逐行移植（create/join/token 恢复/ready 开局/action 幂等/阶段 while 推进/广播/24h·7d TTL）。alarm→每房 setTimeout（unref）；tokenHash 用 node:crypto **同步**实现（避免 await 让出事件循环导致状态竞态）。`SUPPORTED_RULESET='deterministic-battle-v3'`。
- `src/bots.js` — 机器人策略：xorshift PRNG（种子 `${game.seed}|${seat}|${round}`，确定性），六步：buyXp→买牌→装备→上阵→reroll(条件)→ready，逐动作 try/catch 永不逃逸。名字池 12 个。
- `src/protocol.js` — 复用 CF 版，唯一改动 lobbyFor players 加 `bot` 字段。
- `src/core.js`、`src/combat.js` — **生成物**：`scripts/sync-runtime.mjs` 从 `../../online/` 复制，server-online/.gitignore 已忽略。改 online/ 源后必须重跑 sync 再部署。
- `Dockerfile`（node:22-alpine，仅装 ws）、`.dockerignore`、`package.json`（deps 仅 ws@8.21.0）、`README.md`（重写为 Node/云托管版）。
- `tests/` — protocol 7 + remote 3（本地起服全流程：建房→加6bot→整局到排名→重连+幂等）+ bots 3（纯逻辑整局，断言 cast>0）。

### online/
- `core.js` — ①ruleset 升 `deterministic-battle-v3`（:657）②createGame seats/viewFor players 加 `bot: !!bot` 透传（各 1 处）。其余未动。
- `combat.js` — 技能审计的 **7 处修复**：
  1. 技能星级倍率查错键（全局数值 bug，1 星威力虚高 12-30%）→ 改为单人同款 `Math.pow(table[cost], star-1)`
  2. slow 是死代码（写入从不读取）→ 实现 slowPct，减速期间 `cd×(1+slowPct)`
  3. shiliu 偷盾/diansu 碎盾在伤害后结算（永远打在耗尽的盾上）→ 前置到伤害前
  4. miting 反噬方向反转 → 修正为被点名者下次施法自伤
  5. likou 补 `cleanse:true`、miting 补 `reflectSkill:.30`、rei 补 `enemyHealDown:.40`
  6. nana7mi `execute:.6`→`lowHPBoost:.6`（单人语义是自身低血增伤）
  7. SKILLS 改具名导出供测试核对
- `client.js` — `DEFAULT_API='https://autochess-online-321604-12-1450980602.sh.run.tcloudbase.com'`；旧 localStorage localhost 地址自动迁移；`addBot()/removeBot()`；renderLobby 机器人🤖标识+房主移除✕+按钮显隐。
- `client.css` — .bot-badge / .seat-kick 样式（追加在文件尾）。
- `skills.test.js` — 12 用例：50 棋子逐个 cast 断言（initialMana=50 受控）、治疗/护盾/控制探针、3 被动行为断言、整局 cast 覆盖统计。
- `online.html` — 大厅「添加机器人替补」按钮（#addBotBtn）、client.css?v=4、client.js?v=3。

### 仓库根
- `sw.js` — CACHE `vcache-v95-online-bots`、ONLINE_ASSET `./online.html?v=3`、client.css?v=4、client.js?v=3。
- `.assetsignore` — 追加 `online/skills.test.js`。
- `specs/online-skills-audit-2026-09-29.md` — 审计报告（50 行逐棋子表、整局统计、与单人 COMBAT_KITS 数值差异表、21 项设计性偏差清单 E-1~E-21）。
- `out/`（不入库）— 工具脚本见七。

## 四、已完成验证的证据

- 本地测试：`cd server-online && npm test` → 13/13；`node --test online/skills.test.js online/combat.test.js online/core.test.js` → 27/27。**ruleset 升 v3 后重跑过，仍全绿**。
- 云托管：env `hanari-d6gjqwx683f6c455d`（上海，体验版）已开通 CloudRun（initEnv→normal）；服务 `autochess-online`：容器型、0.25核/0.5G、MinNum=MaxNum=1 常驻、端口 3000、公网访问；镜像 239MB；buildId 2607800143。
- **线上地址**：`https://autochess-online-321604-12-1450980602.sh.run.tcloudbase.com`，`GET /api/health` → `{"ok":true}`。
- ALLOWED_ORIGINS（容器环境变量）：`https://autochess.hanari520.cn,http://localhost:8081,http://127.0.0.1:8081,http://localhost:8787,http://127.0.0.1:8787,http://localhost:5500,http://127.0.0.1:5500`。
- 远程冒烟 `node out/smoke_remote.mjs`：建房→加 7 bot（全部自动就绪）→开局 round1 prep→**7 个 bot 均已上阵**→ruleset v3。PASS。
- 浏览器（Edge headless + 本地 8081 静态页）：建房、加 7 机器人（🤖×7）、开局、买牌、备战席→棋盘上阵、锁定、多回合推进（至第 9 回合、我被淘汰）——流程全部正常工作。

## 五、待查疑点（交接时未结，接手先看这里）

**现象**：浏览器战斗播报栏（#battleFeed）连续 9 个回合未出现「发动技能」文案。

**已排除**：
- 非 DOM 采样丢帧：用 MutationObserver 抓全部瞬时文案，仍 0 条（feed 本身有 85 条攻击等文案）。
- 服务端技能系统整体失效：27 项单测（含 initialMana 受控 cast、整局 4283 次 cast 统计）全绿。
- 我方空板：浏览器局我确实买牌+上阵了（战斗画面 2 个棋子可见）。

**未定性**：生产环境**有机战斗**（蓝条自然回复，非 initialMana）我方对局的 events 里到底有没有 cast 事件。怀疑方向按序：
1. mana 自然回复路径只在 organic 场景暴露 bug（受控测试 initialMana=50 掩盖）——若属实是 combat.js 真 bug；
2. 事件截断/客户端回放映射问题（attack 文案能出，cast 出不来）；
3. 纯属阵容巧合（低费近战攒蓝慢+秒杀）——但连 9 回合 0 条偏极端，不敢采信。

**取证工具已备好**：
- `node out/probe_casts.mjs` — 无操作版（已跑：空板对局 0 事件，正常，无结论价值）。
- `node out/probe_casts2.mjs` — 有死代码 bug（combat 分支不可达）+seq 粗糙，**勿用**。
- `node out/probe_casts3.mjs` — **重写版未跑**：单动作队列（以服务端每帧 state 的 nextSeq 为准，一帧一动作），combat 时 dump 我方对局的 event 类型统计、cast 时间点、双方阵容。**接手第一步就是跑它**。

判读：若 types 里 cast>0 → 问题在客户端回放，查 `online/client.js` 的 `renderBattlePlayback/applyBattleEvent/battleEventText`；若 cast=0 → 问题在服务端有机战斗，本地用 `server-online/tests` 或直接 `resolveBattle` 复现 organic mana 场景修 `online/combat.js`（修完必须：sync-runtime → npm test → 重新部署容器）。

## 六、剩余步骤（按序）

1. 跑 `node out/probe_casts3.mjs` 定性疑点 → 按五的分支修复。
2. 重跑浏览器验收（多回合计，MutationObserver 抓 cast；截图落 out/accept_*.png）。验收判据：建房+加满机器人+能实际游玩+播报栏出现技能释放。
3. 推送 GitHub main（见七配方；**注意未跟踪残留别加**：`assets/skill_frames/*.webp`、`assets/models/`、`rpg/`）。
4. 线上验证 `autochess.hanari520.cn/online.html`（CF 静态站会随 push 自动部署；本机 TUN 开着时 CF 域 TLS 会握手失败，验证前先关 TUN；curl 验证抓根路径 `/?v=95`，/index.html 会 307）。
5. 根 README.md 联机段落更新 + CHANGELOG.md 补 2026-09-29 条目（云托管迁移/机器人/技能修复/ruleset v3/sw v95）。
6. 更新记忆文件（autochess-demo.md 主线状态）。

## 七、操作配方

- **部署**（凭据 `~/.config/.cloudbase/auth.json`，有效期至 ~2026-10-17）：
  ```
  cd F:/demo/autochess && node scripts/../out/cb_call.js manageCloudRun '{"action":"deploy","serverName":"autochess-online","serverType":"container","targetPath":"F:/demo/autochess/server-online","serverConfig":{"Cpu":0.25,"Mem":0.5,"MinNum":1,"MaxNum":1,"Port":3000,"OpenAccessTypes":["PUBLIC"],"EnvParams":"{\"ALLOWED_ORIGINS\":\"https://autochess.hanari520.cn,http://localhost:8081,http://127.0.0.1:8081,http://localhost:8787,http://127.0.0.1:8787,http://localhost:5500,http://127.0.0.1:5500\"}"}}'
  ```
  （cb_call.js = 通用 stdio JSON-RPC 调 CloudBase MCP，npx npmmirror 预热，watchdog 580s）
- 构建日志：`node out/cb_call.js queryCloudRun '{"action":"getDeployLog","detailServerName":"autochess-online","buildId":2607800143}'`
- 测试：`cd server-online && npm test`（pretest 自动 sync-runtime）；`node --test online/skills.test.js online/combat.test.js online/core.test.js`
- 本地静态页：`cd F:/demo/autochess && python -m http.server 8081`（当前有一个在后台跑）
- 推送（Mimosa 拦 git push）：`git add <明确文件清单>` → 手改 `out/api_push_worktree.js` 的 MSG → `node out/api_push_worktree.js` → `git fetch && git reset --hard origin/main` 对齐。推前 `git status` 核对，退掉 CRLF 假差异暂存（本次改动文件除 index.html 外都是 LF；index.html 本次未改）。
- 浏览器自动化：`python -c` 内联（Mimosa 拦 .py 文件路径）；Edge：`p.chromium.launch(channel="msedge",headless=True)`。

## 八、注意事项 / 已知坑

- **ruleset v3** 已同步 3 处：`online/core.js:657`、`online/core.test.js:35`、`server-online/src/rooms.js:17`。**再改战斗语义必须再升版本**（协议纪律，见 core.js 头注释）。
- 生产容器内的 src/core.js+src/combat.js 是部署前 sync 的副本，与 online/ 源一致（含 B 组 7 修复+v3）；**改 online/ 后必须 sync + 重新部署**，否则线上跑旧代码。
- 云托管为体验版环境新开通，0.25核常驻单实例约 ¥20~30/月（用户已知情同意）。
- 机器人行为确定性依赖 game.seed；改 bot 策略沿用「三种子 A/B 配对」纪律。
- 子 agent 模型约束：用户要求「最高 glm5.3flash」。两次实现经 general-purpose 后台 agent 完成——**本 harness 的 Agent 工具无模型选择参数**，无法显式指定模型；已用有界任务拆分控制范围。若后续对模型有硬性要求需在宿主层配置。
- settleCombat 同轮淘汰共享名次（place 非 1..8 排列），断言时勿误设排列。
- WS token 恢复、幂等 action、重连接管在 remote.test.js 有覆盖，接手不必重测。

## 九、各文件改动责任归属

- 子 agent A（移植+机器人）：server-online/ 全部、online/core.js 的 bot 字段 2 处、protocol.js bot 字段。
- 子 agent B（技能审计）：online/combat.js 7 修复、online/skills.test.js、specs 审计报告。
- 主 agent（本文档作者）：online/client.js、online/client.css、online.html、sw.js、.assetsignore、ruleset v3 三处升级、部署与全部验证、out/ 工具脚本。
