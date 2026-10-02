# 星域小队原型

100 个棋子，限定现有 50 位主播：50 个原版 + 50 个衣装变体，五人队列，十金商店，合并、升级、冻结、永久培养、携带道具、事件技能和十胜五命。队伍最右侧为前排，先交战；点击商品后点空位招募，点同名角色合并，点队员再点另一位置插入排序或合并同衣装，支持拖拽及触屏。

## 试玩

```powershell
node arena/server.mjs
# http://127.0.0.1:8082/arena.html
```

本机预览会连接 8082 服务；线上页面连接下方公开 CloudBase HTTP API。新用户连接失败时可使用明确标注的本地训练模式，并在此浏览器保存进度。不会请求线上访客的本机地址。有联机凭证的对局不会静默切换成训练模式。`arena/server.mjs` 仅供本机预览；线上使用独立 HTTP 云函数。

## CloudBase 阵容库

2026-10-02 已在现有上海环境 `hanari-d6gjqwx683f6c455d` 应用迁移 `cloudbase/migrations/20261002014546_idol_arena_snapshots.sql`，创建独立 `idol_arena_snapshots` 表。该表启用 RLS，PUBLIC、anon、authenticated 均无读写权限，只有服务端 service_role 访问。

```powershell
$env:ARENA_SNAPSHOT_STORE = 'cloudbase-pg'
$env:TCB_ENV = 'hanari-d6gjqwx683f6c455d'
$env:CLOUDBASE_APIKEY = '<通过安全配置注入的服务端 API Key>'
node arena/server.mjs
```

适配器使用项目 `server-online` 已安装的 `@cloudbase/node-sdk@4.1.0`，从服务端调用 `app.rdb()`。运行此模式前需安装该目录的已有依赖；凭证绝不放进前端、仓库或日志。此次创建的预览专用 API Key 名为 `idol-arena-preview-20261002`，有效期七天，运行时文件保存在仓库外。续用时通过环境配置注入有效服务端凭证。

初次启动幂等补充 150 支预设训练小队（前 30 回合各五支，含换装成长会、衣装登台团）。优先同版本、同回合真人历史队伍，排除本局和尽量避免上一对手；没有合格真人才用训练队伍。出战快照发布为不可变记录，不会因被挑战而改变对方的个人局。

个人局、幂等结果和待上传快照首先原子保存到 `F:/demo/workspace/sap-arena-data/arena.json`，随后幂等上传云端；只有两步成功才回复出战确认。上传中断可用同一请求标识重试，服务重启也会补传。上述文件保存仅属于本机预览；正式线上服务的个人局、幂等记录及阵容全部保存在 CloudBase PostgreSQL。

本原型是单写者，使用目录锁防止两个服务共写局状态。异常杀进程留下锁时，核实原进程已停止后再清理 `.owner.lock`。云端表不会随本地数据目录清理而被删掉。

## 验证

```powershell
node --test arena/core.test.mjs arena/server.test.mjs arena/replay.test.mjs
python arena/browser_smoke.py
python arena/battle_fx_smoke.py
python arena/flow_smoke.py
```

测试覆盖确定性商店和回放、升级阈值、冻结跨回合、养成不重复、互攻同时退场、召唤配合、训练阵容全回合模拟、两位玩家异步匹配、幂等重试、版本冲突、对手局不被修改、服务重启恢复、来源校验、私有文件不可访问及桌面/手机操作。

技能数值尚属首版，没有声明竞技平衡完成。经典模式和八人同步房间继续使用原规则；主页及新建对局中的剧情卡已替换为竞技场，旧剧情代码及存档保留。

## 衣装棋子与图鉴

100 个可招募棋子对应原有 50 位主播，未增加主播身份。50 套新衣装按萌娘百科的衣装名称和介绍命名，桃濑雪绘部分服装另参考日文衣装索引。立绘为 AI 创作，不是原立绘复制；来源未说明的配色、剪裁与配件是美术补充。每个衣装的资料链接、说明都可在「图鉴」中查看，图鉴支持姓名/衣装/技能搜索、阶级筛选与原版/衣装筛选。

同一主播的不同衣装有独立 ID、属性与技能，不相互合并；同一衣装按正常合并经验升级。所有衣装进入同一六阶商店池，随回合解锁。三张透明图集包含 16 + 16 + 18 个新立绘槽，前端通过 CSS 显示各独立格。

## 战斗反馈

回放记录技能发动者，按阵营和单位 ID 对比每步生命、攻击、护盾变化。前排互攻使用指向目标的冲击与弹道；狙击、支援、反击、增益、治疗、召唤和退场分别显示事件标签与局部反馈。棋子有血条、伤害/治疗浮字、护盾数值和技能高亮，底部保留最近三条事件记录。

正常/快速/慢速播放支持暂停、逐步查看和重播。旧回放不含发动者元数据时兼容推断；减少动态效果设置保留静态数值提示。展示不改变战斗伤害、结算或阵容匹配规则。

## 完整阶段界面与操作

参考 Super Auto Pets 的完整 Arena 流程，主菜单进入卡组/队名选择，默认主播衣装包包含现有 100 棋子；开局后是上方五人队伍、下方角色/道具商店。底部刷新、冻结、出售、结束回合固定。点商品再点目标购买/喂食；同衣装直接合并；移动采用插入排序；支持拖拽购买、排序和拖至出售按钮。冻结支持选中商品操作或连续冻结模式。

结束回合若金币尚可购买会提示。回放先逐个显示回合结束成长，再进入开战技能和战斗；单场结果显示奖杯/生命变化，下一回合显示基础十金及每位收益角色的额外金币。十胜/生命耗尽使用终局结果与再来一局入口。菜单可返回正在进行的对局，重播只播放结果，不重复结算。

所有阶段沿用浅蓝天空、浅绿草地和暖色按钮。立绘动作与名字/数值分层；存活棋子保留显示节点，前移使用位置插值。战斗区域、日志、提示、按钮均预留固定高度；桌面和手机 44 步连锁回放逐步测量面板坐标，验证不因触发变化而挤压布局。

来源：[官方 Steam 页面](https://store.steampowered.com/app/1714040/Super_Auto_Pets/)、[实机流程截图目录](https://www.mobygames.com/game/172894/super-auto-pets/screenshots/)。保留主播棋子、当前六阶技能数值与 CloudBase 异步阵容系统；该原型只有主播衣装标准包，没有增加未接通的 Versus 或付费包入口。


## 线上异步联机（2026-10-02）

生产环境 `hanari-d6gjqwx683f6c455d` 的 HTTP 云函数为 `idol-arena-api`（Nodejs18.15，9000端口），入口：
`https://hanari-d6gjqwx683f6c455d-1450980602.ap-shanghai.app.tcloudbase.com/api/arena`。

`arena/cloud-service.mjs` 提供公开游戏API；`arena/cloud-entry.mjs` 初始化服务端SDK。个人局在 `idol_arena_runs`，请求幂等记录在 `idol_arena_requests`，阵容在 `idol_arena_snapshots`。`idol_arena_commit` 在一个数据库事务中锁定该局、检查修订号、发布快照并保存结算/幂等结果；不同实例不依赖共享内存或本地文件。重复请求先验证内容指纹，同一修订号并发操作仅一个成功。匹配不修改对手局。

三张表均启用RLS，anon/authenticated没有读写权限；事务函数仅service_role可执行。对局凭证由服务端生成192位随机值，浏览器保存原值，数据库只保存SHA-256摘要；没有跨设备账号绑定，清除浏览器凭证后无法自动找回该局。CORS精确允许正式站点和本机预览来源，API限流并限制JSON体积。只公开竞技场路由，OPA配置见 `cloudbase/arena-gateway.rego`，不放开所有云函数。

生产专用服务端API Key名为 `idol-arena-http-production`，keyId为 `Dwxqki0vT5WgZGeArqOezg`，由项目维护者负责轮换。密钥无自动过期，值仅通过云函数环境变量 `CLOUDBASE_APIKEY` 注入，不在代码、浏览器或Git仓库。轮换：平台创建同用途新Key → 合并更新函数环境变量 → 健康检查及真实读写验证 → 删除旧keyId。更新环境变量时保留TCB_ENV及ALLOWED_ORIGINS等原配置。

可复现打包（输出到仓库外）：
```powershell
node arena/package-cloud-function.mjs F:/demo/workspace/arena-release-functions
# 在生成的 idol-arena-api 目录安装 npm install --omit=dev
# HTTP云函数部署需包含 node_modules 与 scf_bootstrap
$env:ARENA_API_BASE='https://hanari-d6gjqwx683f6c455d-1450980602.ap-shanghai.app.tcloudbase.com'
node arena/cloud-live-smoke.mjs
```

实测覆盖两次数据库健康读、CORS预检、非法来源、无凭证拒绝、并发购买重试只扣一次、请求指纹冲突、出战只结算一次、云端重新读取、真人阵容匹配、对手局不受影响与不同请求的并发修订号保护。线上无需本机8082服务。
