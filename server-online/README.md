# 八人联机原型房间服务

这是《星域棋战》的**八人联机服务**，代码位于仓库 `server-online/`。每个邀请码映射到一个 Cloudflare Durable Object，由服务端独占写入共享卡池、经济、布阵和阶段结算。规则核心位于 `../online/core.js`，每轮对战由 `../online/combat.js` 确定性模拟并把战斗事件发给对应玩家回放。房间、卡池和战果由服务器决定；技能和羁绊效果仍需与单机版逐项验收。

## 本地运行

需要 Node.js 22+。在本目录执行：

```powershell
npm install
npm run dev -- --local --port 8787
```

若当前机器限制 Wrangler 写入用户配置目录，可只给这个终端进程指定本目录下的配置目录：

```powershell
$env:XDG_CONFIG_HOME='F:\demo\autochess\server-online\.wrangler\config'
$env:WRANGLER_LOG_PATH='F:\demo\autochess\server-online\.wrangler\logs'
$env:WRANGLER_SEND_METRICS='false'
npm run dev -- --local --port 8787
```

静态前端可从 `http://localhost:8081` 打开 `autochess/online.html`。其他前端地址需要加入 `wrangler.toml` 的 `ALLOWED_ORIGINS` 精确列表；生产环境也必须显式设置该变量。没有 Origin 头的脚本客户端可访问 API；浏览器请求会做来源校验。此服务未部署。

## API 契约

- `POST /api/rooms`，JSON `{ "name": "玩家" }`：创建房间并取得房主座位。
- `POST /api/rooms/:code/join`，JSON `{ "name": "玩家" }`：入座；八人满后拒绝第九人。
- 同一路由，JSON `{ "token": "..." }`：用原凭证恢复座位，包括对局开始或淘汰之后。
- 成功响应为 `{code,seat,token,lobby}`。客户端必须自行保存 `token`；服务端只持久化 SHA-256 摘要。失败响应为 `{error:{code,message}}`，状态码按 400/401/403/404/409 等区分。
- `GET /api/rooms/:code/ws`：升级 WebSocket。连接后第一条发送 `{ "type":"auth", "token":"..." }`。令牌不放在 URL 中；同一座位新连接接管旧连接。
- 大厅中发送 `{ "type":"ready", "ready":true, "id":"optional" }`。八席都入房并准备后自动开局。
- 对局中发送 `{ "type":"action", "id":"unique-id", "seq":1, "action":{"type":"buy","slot":0} }`。允许的操作由规则核心定义，包括 `buy`、`sell`、`move`、`reroll`、`buyXp`、`equip`、`ready`。`seq` 按座位递增，并从每条状态消息的 `nextSeq` 恢复；同一 `id` 和 `seq` 的重发会收到 `duplicate` 确认，不会再次执行。
- 成功操作先收到 `{type:"ack",id,seq}`，再收到该座位的 `{type:"state",code,seat,serverTime,deadline,nextSeq,lobby,view}`。错误为 `{type:"error",id?,code,message}`。状态中的 `view` 由 `viewFor(game, seat)` 按座位生成，别人的商店、金币和备战席不会公开。

备战、战斗展示、结果展示阶段分别为 45、8、7 秒，由 Durable Object alarm 推进。存储先于广播，重启后可从 SQLite 持久状态和闹钟恢复。服务端时间和阶段截止时间用于前端显示倒计时，客户端不能自行结算。

未开局房间在创建后 24 小时清理；已结束对局保留 7 天后清理。正在进行的对局由阶段闹钟继续推进，即使全部玩家断线也会进入结算。过期房间的 WebSocket 会被关闭，原凭证不再可用。

服务端仅接受 `version:1` 且 `ruleset:deterministic-battle-v2` 的持久对局。若后续发布改变规则语义，必须同步变更此版本标识，并提供旧规则执行器或显式迁移；当前行为是拒绝旧房间继续结算，避免新代码静默重算旧对局。

## 验证

```powershell
npm test
$env:ONLINE_TEST_URL='http://127.0.0.1:8787'
npm test
```

第二次运行会执行真实 Worker 的八座位、CORS、WebSocket、幂等和重连测试。测试创建临时房间。当前尚未覆盖长时间运行下的闹钟恢复、跨地区延迟和完整单机战斗规则；上线前应补充这些验收。
