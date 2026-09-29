# 八人联机房间服务（Node / 腾讯云托管版）

这是《星域棋战》的**八人联机服务**，代码位于 `server-online/`。一个纯 Node.js（`node:http` + `ws`）单进程服务：每个邀请码对应一个内存中的房间对象，由服务端独占写入共享卡池、经济、布阵和阶段结算。规则核心由 `scripts/sync-runtime.mjs` 从 `../online/core.js`、`../online/combat.js` 复制为 `src/core.js`、`src/combat.js`（生成物，不入库），每轮对战由确定性模拟器结算并把战斗事件发给对应玩家回放。

本版本由原 Cloudflare Workers + Durable Objects 实现移植而来，面向**腾讯 CloudBase 云托管（容器型）单实例常驻部署**，并新增**房主添加/移除机器人**功能。

## 与 Cloudflare 版的差异

- **内存态，无持久化**：房间状态保存在进程内 `Map`，没有 DO 的 SQLite 存储。服务重启会丢失全部房间与对局（demo 阶段可接受）；未开局房间 24 小时、已结束对局 7 天后由清理定时器回收。
- **单实例**：必须以 MinNum=1 / MaxNum=1 部署。进程内 JS 事件循环天然串行化所有消息处理器与定时器回调，等价于 DO 的单写者语义；扩到多实例会拆分房间状态。
- **阶段推进**：原 DO alarm 由每房一个 `setTimeout` 时钟替代（到期执行与 `alarm()` 逐行对应的 tick：过期清理→阶段 while 推进→重排定时器→广播）。WS 层另有 30 秒 ping/pong 心跳清理死连接。
- **同步 token 校验**：WebSocket 消息处理中的 token 哈希用 `node:crypto` 的同步 `createHash('sha256')` 完成，整个处理器不 await，避免事件循环让出引入房间状态竞态。
- **状态快照兼容**：广播格式与 CF 版完全一致（`{type:'state',code,seat,serverTime,deadline,nextSeq,lobby,view}`），现有浏览器客户端零改动即可使用。

## 本地运行

需要 Node.js 22+。在本目录执行：

```bash
npm install
npm run dev
```

`npm run dev` 会先同步规则运行时再启动服务，默认监听 `3000` 端口（`PORT` 环境变量可覆盖）。`ONLINE_FAST` 环境变量（毫秒数，非零则备战/战斗/结算三个阶段都用该值）用于测试与本地联调加速，缺省用 `protocol.js` 的 `PHASE_MS`（45s/8s/7s）。

静态前端可从 `http://localhost:8081` 打开 `autochess/online.html`。其他前端来源需加入 `ALLOWED_ORIGINS` 精确列表（逗号分隔，本地默认值见 `src/server.js`）；没有 Origin 头的脚本客户端可直接访问 API，浏览器请求会做来源校验。

## API 契约

- `GET /api/health` → `200 {"ok":true}`。
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
6. 重启即丢房（内存态）；如需跨重启保留对局，需要外部持久化，当前版本不提供。

## 验证

```bash
npm test
```

测试套件（`node --test`）覆盖：协议层校验（`tests/protocol.test.js`）、无定时器的机器人完整对局（`tests/bots.test.js`，直接驱动规则核心）、以及真实 HTTP+WebSocket 服务器全流程（`tests/remote.test.js`，随机端口启动本地服务、`ONLINE_FAST=80` 加速：建房→加 bot→自动开局→bot 自动买牌上阵→打完整局到排名→token 重连与重复动作幂等）。仓库根下 `node --test online/core.test.js online/combat.test.js` 也必须保持通过。
