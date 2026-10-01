# 联机稳定性与发布操作

2026-09-30。前端仍可托管在 Cloudflare；房间服务独立部署到 CloudBase。

## 已实现的行为

- HTTP 请求 10 秒超时；WebSocket 建连/认证 10 秒超时；状态同步 6 秒超时；操作确认 8 秒超时。
- 前台页面每 15 秒发送应用层心跳，10 秒没有 pong 就重连。回到前台和网络恢复主动同步。重连使用指数退避加随机偏移。
- 操作确认丢失时用服务端 `nextSeq + lastActionId` 判断是否执行；仅在原备战回合重发原始 `id + seq`。服务端校验新客户端发送的回合字段，跨回合操作拒绝执行。
- 每连接每秒最多 20 条消息，单消息 4096 字节，房间队列最多 32 项，发送缓冲超过 256 KiB 断开慢连接。建房/加入按 socket 来源地址每分钟最多 120 次（不直接信任 forwarded headers）；最多 200 个保留房间，可用 `MAX_ROOMS` 修改。代理出口共用 IP 时需按实际负载调整策略。
- **来源强校验（2026-10-01 起）**：所有非 GET 的房间接口（建房/加入/退出/机器人）与 WebSocket 升级必须携带白名单内的 `Origin`，缺失或不匹配返回 403 `origin_forbidden`；无 Origin 的非浏览器脚本不再放行。`GET /api/health`、`GET /api/ready` 与 `/api/admin/*`（已有 Bearer 令牌鉴权，供维护脚本调用）不要求 Origin。**部署此版本前必须确认容器 `ALLOWED_ORIGINS` 已包含线上页面来源**（如 `https://autochess.hanari520.cn`），否则线上客户端全部 403。
- 持久化模式下，房间写入、阶段推进与断线处理串行执行，完整状态成功提交后才发送确认和快照。写入失败停止房间，关闭连接 1012，生产进程自动退出由平台重启。提交结果不明确时不继续用旧内存写入。
- 恢复保存的卡池、随机状态、棋盘、经济、战斗事件、令牌摘要与操作序号。备战恢复给予一个完整备战阶段，战斗恢复保留完整回放窗口且至少 15 秒。大厅重新就绪并提供 90 秒断线保留。
- **恢复隔离（2026-10-01 起）**：单个永远无法恢复的快照（结构损坏、或规则版本低于当前 `SUPPORTED_RULESET` 的进行中对局）不再让启动整体失败进入 crash loop，而是记一条 `room_restore_quarantine` 日志（含房码与原因）、从存储中删除该房间后继续恢复其余房间。存储层（PostgreSQL/CloudBase 文档库）同样逐房隔离损坏快照。被隔离的对局本就无法在新规则下继续，玩家侧表现为房间不存在（404）。

## CloudBase 生产配置

必须固定 `MinNum=1 / MaxNum=1`。生产启动拒绝静默使用内存存储。

1. 环境 `hanari-d6gjqwx683f6c455d` 使用 PostgreSQL。迁移 `cloudbase/migrations/20260930142500_online_room_persistence.sql` 创建 `online_room_state`、`online_room_owner` 和 `online_room_store` RPC。两张表启用 RLS，撤销 PUBLIC / anon / authenticated 权限；表和 RPC 只授予 service_role。不要给浏览器 SDK 开放房间原始快照，其中包含所有玩家私有游戏状态和凭证摘要。
2. 通过 CloudBase 平台创建此服务专用的服务端 API Key，注入 `CLOUDBASE_APIKEY`。不要从本地 CLI 登录文件提取凭证。保留原有 `ALLOWED_ORIGINS` 环境变量。
3. 合并以下环境变量到容器配置（凭证通过控制台/密钥系统填入，不写入仓库）：

```text
ROOM_STORE=cloudbase-pg
TCB_ENV=hanari-d6gjqwx683f6c455d
CLOUDBASE_APIKEY=<服务端专用密钥>
ADMIN_TOKEN=<随机维护密钥>
MAX_ROOMS=200
ONLINE_INVITE_CODE=<邀请人设置的邀请码>
```

API Key 是环境级服务端权限，需要指定轮换负责人，轮换后重新部署。SDK 固定为 `@cloudbase/node-sdk@4.1.0`，锁文件固定依赖；axios 固定为修复版本 0.34.0，避免旧传递依赖漏洞。镜像使用 `npm ci --omit=dev --ignore-scripts`。

`online_room_owner` 保存独占写入租约，`online_room_state` 保存完整 JSON 快照。服务通过 Node SDK `app.rdb().rpc()` 调用数据库函数；每次保存和删除在同一事务里锁定租约行、验证 owner/epoch 并更新快照及租约。租约 60 秒、每 20 秒续期；旧实例未释放时新实例启动被拒绝。异常终止后最多等待约 60 秒才能重新获得租约；不要直接删除租约行。过期判断使用数据库时钟。

真实云端已验证保存、重叠实例拒绝、交接恢复、旧实例拒绝写入及删除不复活。专用密钥名为 `autochess-online-room-store`，由项目环境管理员负责轮换，在 CloudBase API Key 管理中创建替代密钥、更新容器变量并重新部署，确认后撤销旧密钥。全量快照每操作一写，容量需按数据库延迟和资源用量继续监测。

## 发布与排空

维护接口需要 `Authorization: Bearer <ADMIN_TOKEN>`。不要把密钥放在 URL、浏览器代码或日志里。

1. `POST /api/admin/drain`，JSON `{}`：停止建新房和启动新对局；已经开局的玩家继续操作和结算。
2. `GET /api/admin/metrics`：等待 `activeGames=0`、`drainComplete=true`。房间总数可能包含大厅和已结束的对局，不需要等到 `rooms=0`。
3. `POST /api/admin/handoff`：在排空后释放存储租约并进入待机，保留健康检查监听端口。新旧容器有启动重叠时必须先交接，否则新容器无法获得租约。此步骤之后玩家暂时无法加入，直到新版本接管。
4. 发布新的容器版本，启动恢复成功后验证 `/api/ready` 返回 200，凭原令牌恢复同一座位，再发布前端（`sync` 和 `lastActionId` 需要新后端）。
5. 发布失败时重新启动持有最新兼容代码的服务，使其接管租约。交接后的旧实例不会自动重新抢锁；不要仅切回一个已经待机的旧版本。

交接前取消维护可 `POST /api/admin/drain`，JSON `{"draining":false}`。交接后需要重新启动服务才能恢复。

首次升级旧内存版本时无法恢复它未保存的房间，应等旧版当前对局结束后再发布。SIGTERM 的平台宽限期不足以等待整场对局结束，不能替代上述主动排空步骤。

## 监控与本地验证

`GET /api/health` 是固定存活检查；`GET /api/ready` 检查存储可用性。管理指标包括活跃对局、断线关闭码、重连数、操作数、限流数、慢客户端数、持久化失败、提交耗时、事件循环 P99 延迟和 RSS 内存。每分钟输出一次固定字段 JSON 日志，不包含玩家令牌、云凭证、完整请求头或原始房间内容。平台告警需在控制台根据这些指标另行绑定。

```text
# server-online 目录
npm test

# autochess 目录
node --test online/core.test.js online/combat.test.js online/runtime-sync.test.js
node --test tools/online_connection.test.mjs
python tools/online_live_browser.py    # 双浏览器真云服务冒烟（先起 :8081；见脚本头部说明）
python tools/online_parity_browser.py  # 经典 UI 联机验收（:8081 + 本地 :3000，ONLINE_TEST_API 可覆盖）
```

共享规则运行时的服务端拷贝（`src/core.js`、`src/combat.js` 等）**随源入库**：干净克隆即可构建可用镜像，`npm run sync`（`scripts/sync-runtime.mjs`）在 dev/test/predeploy 前刷新它们，根套件的 `online/runtime-sync.test.js` 在拷贝落后于 `online/`、`tools/` 源时直接失败——改规则源后忘记同步无法通过测试。

开发默认使用 `ROOM_STORE=memory`。可用 `ROOM_STORE=file` 和 `ROOM_STORE_DIR` 测试文件恢复，必须是单写者持久挂载卷，不能使用 CloudBase 容器临时目录。POSIX 文件保存会 fsync 数据与目录，Windows 不支持目录 fsync。文件模式异常退出后保留 `.owner.lock`，须核实旧进程已结束后由操作员清理；CloudBase 生产应使用数据库租约模式。

参考：[CloudBase 事务](https://docs.cloudbase.net/database/transaction)、[云托管迁移与持久化约束](https://docs.cloudbase.net/run/best-practice/migration)、[Node SDK 凭证](https://docs.cloudbase.net/en/api-reference/server/node-sdk/initialization)。
