# 八人联机房间服务（Node / 腾讯云托管版）

这是《星域棋战》的**八人联机服务**，代码位于 `server-online/`。一个 Node.js（`node:http` + `ws`）单进程服务：每个邀请码对应一个房间对象，由服务端独占写入共享卡池、经济、布阵和阶段结算。规则核心由 `scripts/sync-runtime.mjs`（`npm run sync`）从 `../online/core.js`、`../online/combat.js` 等复制为 `src/` 下的生成拷贝（**随源入库**，保证干净克隆即可构建镜像；根套件 `online/runtime-sync.test.js` 会拦截拷贝漂移），每轮对战由确定性模拟器结算并把战斗事件发给对应玩家回放。

2026-09-30 新增客户端超时恢复、限流监控、维护排空与 CloudBase 数据库持久化。**生产上线必须先配置PostgreSQL 持久化表和服务端凭证**，具体设置、发布交接和验证见 [STABILITY.md](STABILITY.md)。下文的内存模式仅适用于本地开发。

本版本由原 Cloudflare Workers + Durable Objects 实现移植而来，面向**腾讯 CloudBase 云托管（容器型）单实例常驻部署**，并新增**房主添加/移除机器人**功能。

## 与 Cloudflare 版的差异

- **可选持久化**：开发模式房间状态保存在进程内 `Map`，重启会丢房；生产使用 CloudBase 数据库事务保存完整快照并恢复。未开局房间 24 小时、已结束对局 7 天后由清理定时器回收。
- **单实例**：必须以 MinNum=1 / MaxNum=1 部署。持久化模式用每房队列串行处理消息、HTTP 变更与定时器，并用数据库租约防止发布时新旧实例同时写入；不支持直接扩成多个房间服务实例。
- **阶段推进**：原 DO alarm 由每房一个 `setTimeout` 时钟替代（到期执行与 `alarm()` 逐行对应的 tick：过期清理→阶段 while 推进→重排定时器→广播）。WS 层另有 30 秒 ping/pong 心跳清理死连接。
- **同步 token 校验**：token 哈希用 `node:crypto` 的同步 `createHash('sha256')` 完成；异步持久化期间同房间的后续变更排队，避免共享卡池和序号竞态。
- **状态快照兼容**：广播格式与 CF 版完全一致（`{type:'state',code,seat,serverTime,deadline,nextSeq,lobby,view}`），现有浏览器客户端零改动即可使用。

## 本地运行

需要 Node.js 22+。在本目录执行：

```bash
npm install
npm run dev
```

联机入口启用邀请模式。启动前设置 `ONLINE_INVITE_CODE`（邀请码通过服务端环境变量配置，不写入前端）；生产缺少该变量时拒绝启动。本地浏览器验收同时设置 `ONLINE_TEST_INVITE` 为相同值。

`npm run dev` 会先同步规则运行时再启动服务，默认监听 `3000` 端口（`PORT` 环境变量可覆盖）。`ONLINE_FAST` 环境变量（毫秒数，非零则备战/战斗/结算三个阶段都用该值）用于测试与本地联调加速，缺省用 `protocol.js` 的 `PHASE_MS`（45s/8s/7s）。

静态前端可从 `http://localhost:8081` 打开 `autochess/online.html`。其他前端来源需加入 `ALLOWED_ORIGINS` 精确列表（逗号分隔，本地默认值见 `src/server.js`）；没有 Origin 头的脚本客户端可直接访问 API，浏览器请求会做来源校验。

## API 契约

- `GET /api/health` → `200 {"ok":true,"ruleset":"deterministic-battle-v6","boardCells":64,"deployStart":32}`。
- `POST /api/invitation`，JSON `{ "inviteCode": "<邀请码>" }`：验证成功返回 `{ok:true}`；缺失或错误返回 403 `invite_required`。建房、加入和凭 token 恢复座位的请求也必须携带 `inviteCode`，仅隐藏前端按钮无法绕过服务端验证。WebSocket 仍凭入座后签发的房间 token 认证。
- `POST /api/rooms`，JSON `{ "name": "玩家" }` → `201 {code,seat,token,lobby}`：创建房间并取得房主（0 号席）座位。
- `POST /api/rooms/:code/join`，JSON `{ "name": "玩家" }`：入座；八人满后拒绝第九人（409 `room_full`）。
- 同一路由，JSON `{ "token": "..." }`：用原凭证恢复座位，包括对局开始或淘汰之后。
- `POST /api/rooms/:code/bots`，JSON `{ "token": "房主token", "name": "可选昵称" }` → `201 {code,seat,lobby}`：**房主专用**（token 必须匹配 0 号席，否则 403 `not_host`），仅限 `waiting` 状态（否则 409 `game_started`）、未满 8 人（否则 409 `room_full`）。机器人玩家 `ready:true` 自动就绪、无 token、在 lobby 中带 `bot:true` 标记并视为已连接；昵称缺省时从名字池（阿铁、阿芯、啾啾…）按序取用。
- `POST /api/rooms/:code/bots/remove`，JSON `{ "token": "房主token", "seat": n }` → `200 {lobby}`：房主在 `waiting` 状态移除一个 bot 席（目标必须是 bot，否则 400 `not_a_bot`）；其后座次自动压缩重排。
- 失败响应为 `{error:{code,message}}`，状态码按 400/401/403/404/409/413/415/426/429 等区分。客户端必须自行保存 `token`；服务端只保存 SHA-256 摘要。
- `GET /api/rooms/:code/ws`：升级 WebSocket。连接后第一条发送 `{ "type":"auth", "token":"..." }`；15 秒未认证关闭(4003)。同一座位新连接接管旧连接(4001)；每房间活跃连接上限 16，未认证上限 8（超限逐出最旧未认证连接，4004）。
- 大厅中发送 `{ "type":"ready", "ready":true }`。八席全部入座且就绪（bot 自动就绪）后自动开局。
- 对局中发送 `{ "type":"action", "id":"unique-id", "seq":1, "action":{"type":"buy","slot":0} }`。允许 `buy`、`sell`、`move`、`reroll`、`buyXp`、`equip`、`ready`。`seq` 按座位递增并从状态消息的 `nextSeq` 恢复；同一 `id`+`seq` 的重发收到 `duplicate` 确认，不会再次执行。
- 成功操作先收到 `{type:"ack",id,seq}`，再收到 `{type:"state",...}`；错误为 `{type:"error",id?,code,message}`。`view` 由 `viewFor(game, seat)` 生成，别人的商店、金币和备战席不会公开。

**机器人对局行为**：开局瞬间和每次结算→下一轮备战时，服务端对每个存活 bot 席执行确定性策略（基于 `${seed}|${seat}|${round}` 的 xorshift PRNG）：升级经验（round≥2 且金币≥12）、按"凑对子/未达上场上限"买牌、给场上最强棋子装备、从备战席上阵、没买到且金币≥6 时重搜一次，最后自动 ready。bot 动作走房间内部路径，不占用任何座位的 action 序号。

## CloudBase 云托管部署（容器型）

1. 先运行 `npm run predeploy`（即 `node scripts/sync-runtime.mjs`）生成 `src/core.js`、`src/combat.js`，再构建镜像——Dockerfile 不做同步，构建上下文必须已包含生成物。
2. 构建上下文 = 本目录（`.dockerignore` 已排除 `node_modules`、`tests`、`.wrangler`、`*.md` 等，实际上传约 100 KB 量级）。镜像基于 `node:22-alpine`，仅运行时依赖 `ws`。
3. 服务监听容器内 `3000` 端口（`EXPOSE 3000`），云托管服务端口按 3000 配置。
4. **实例数固定 1**（MinNum=1 / MaxNum=1）：多实例会导致房间状态拆分。
5. 通过 EnvParams 传 `ALLOWED_ORIGINS`（逗号分隔的精确来源列表，生产必须显式设置，例如 `https://autochess.hanari520.cn`）。
6. 按 [STABILITY.md](STABILITY.md) 配置 `ROOM_STORE=cloudbase-pg`、PostgreSQL 表与服务端凭证；发布前排空并交接存储租约。内存模式仍然重启即丢房。

## 验证

```bash
npm test
```

测试套件（`node --test`）覆盖：协议层校验（`tests/protocol.test.js`）、无定时器的机器人完整对局（`tests/bots.test.js`，直接驱动规则核心）、以及真实 HTTP+WebSocket 服务器全流程（`tests/remote.test.js`，随机端口启动本地服务、`ONLINE_FAST=80` 加速：建房→加 bot→自动开局→bot 自动买牌上阵→打完整局到排名→token 重连与重复动作幂等，并校验非白名单/缺失 Origin 的变更请求被 403）。仓库根下 `node --test online/core.test.js online/combat.test.js online/runtime-sync.test.js` 也必须保持通过（最后一项拦截服务端运行时拷贝漂移）。

## 房主与退出生命周期（v113）

- POST `/api/rooms/:code/leave` 使用 `{token}`。大厅立即释放座位并移交房主给在线真人；旧凭证失效。开局后保持座位和战斗数据，退出者不再参与房间保留判定。
- 大厅意外断线取消就绪，座位保留 90 秒后释放；期间可凭原 token 重连。房主断线立即将管理权限交给在线真人，原房主重连不会抢回权限。大厅开局要求八席就绪且所有真人在线。
- 大厅无真人座位、对局中所有真人主动退出，或所有存活玩家均为机器人时，立即回收房间。大厅断线座位在保留期内仍计作真人。其他房间不受影响。
- 房间关闭使用 WS 4000；同座位接管 4001；座位释放/主动退出 4005。客户端停止这些终止连接的自动重连。
- 普通网络断线的已开局真人不立即移除，服务器继续推进对局，可重连；被淘汰真人可以观战，直到纯机器人房间被清理。
