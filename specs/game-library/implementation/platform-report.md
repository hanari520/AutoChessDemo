# P02–P05 共享基础交付

日期：2026-10-11。状态：P02/P03/P04/P05 完成；P06 及联网/云端任务未执行。

## P02：共享合同

实现：`library/contracts.md`、`contracts.mjs`、`contracts.test.mjs`。定义游戏清单、角色、档案、结算、纪念物和档案展示字段；统一结构化结果和错误。受控站内路径、重复 manifest ID、版本字段、跨游戏字段及本地信任标记有校验。

所有游戏/存档/奖励 ID 保留原规范；Character ID 和 Profile 本命字段允许旧稳定 ID `liAn`，保留大小写。采用 IndexedDB 事务比较 revision；多标签页冲突不静默覆盖。客户端不能自报 server 验证。

## P03：大厅闭环

实现：`library/index.html`、`app.mjs`、`style.css`、`games.json`。G1 可试玩，其他七作品标开发中且无可点击假入口。可按可试玩/单人/多人筛选，展示人数、联网、输入、继续状态和本地纪念物。旧首页新增游戏馆链接；新路由不共享旧 Service Worker HTML fallback。

验证：1440×900、390×844 大厅→G1→结算→大厅；旧首页→大厅→G1→刷新→大厅→旧首页。手机无水平溢出。六槽个人展示 P06 尚未实现。

## P04：存档与恢复

实现：`library/storage.mjs`、`storage.test.mjs`、`save-transfer.mjs`。IndexedDB `vtlib-game-library` v1，独立 `vtlib:<gameId>:<slotId>`。支持版本策略、CAS、JSON 包装导出导入、大小/字段/gameId 校验。坏档/未来版本保留隔离副本；显式恢复须 quarantine token、原始快照及观察到的 revision 一致。G1 注册专属 payload validator。

验证：两个 gameId 测试隔离、并发陈旧写、写入失败、坏 JSON、错误 gameId、未来版本、损坏内部数据、恢复冲突；真实浏览器刷新、导入、隔离副本和断存储内存导出。原有 `vc_save4`、`vc_daily3`、`vc_arena3`、`star_survivor_v1` 四类测试键逐字节保持。

## P05：纪念物

实现：`library/collectibles.mjs`、`collectibles.test.mjs`、`rewards.json`。同 completionId 重试幂等，复用 ID 却改变结果会拒绝；结算记录/奖励同事务写入；两游戏测试适配器隔离；客户端不能升级信任等级。奖励目录临时失败后可以重新加载。

验证：重复提交、事务中断后重试、无效奖励 ID、跨游戏夹具；真实 IndexedDB 本地奖励在模块/目录已加载后断网写入并在恢复网络重新打开页面后可见。该夹具验证登记模块，不代表新游戏资源已支持断网重载。G1 重试领奖和完成档多标签页不再重复保存进度。

## 命令与实际结果

先从项目根启动 `python -m http.server 8086 --bind 127.0.0.1`，访问 `http://127.0.0.1:8086/library/`。

```powershell
node --test games/studio-manager/core.test.mjs library/contracts.test.mjs library/storage.test.mjs library/collectibles.test.mjs tools/game-library-integration.test.mjs
python -X utf8 tools/game-library-browser.py
python -X utf8 tools/game-library-legacy-browser.py
```

- Node：35/35 通过，其中共享库 20、G1 12、缓存集成 3。
- G1/大厅浏览器：37 项通过，桌面与手机各完整战役、恢复和领奖。
- 旧入口/独立离线登记夹具：5 项通过。
- `git diff --check` 通过。
- 证据：`out/game-library/browser-results.json`、`legacy-browser-results.json`；同目录各阶段截图。

没有新增运行时 npm 依赖，没有建立云账号/多人服务；本地记录不具备服务端真实性。存档包 save/rules/contentVersion 均为 `1`；G1 payload 内规则标识为 `g1-rules-0.1.0`，其对应当前 v1 游戏规则。未来改规则时必须同时更新版本策略并设计迁移，不静默清档。

真人试玩未做；离线页面缓存未验收；旧游戏只做导航与存档键兼容 smoke，未声称全部旧玩法回归。未部署。下一阶段为第二款不同类型游戏与 P06；本轮只完成首款 demo 收尾。
