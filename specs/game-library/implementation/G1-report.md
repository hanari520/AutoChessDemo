# G1《今晚谁来播》交付

日期：2026-10-11。**G1-01/G1-02/G1-03 完成；G1-04 自动化与表现部分完成，真人试玩待验收。**

## 实现范围

六名角色选三名建团；五节目、十二个无放回事件、四周十二档、三类设备各两级升级、三档终演评价、三类本地纪念物。没有现实时间等待或破产删档。成员特长、组合默契、设备、疲劳、事件的 Q 明细可见；节目与事件资金、收入、精力变化可解释。

规则位于 `games/studio-manager/core.mjs`，配置为 `content.mjs`，界面为 `index.html` / `app.mjs` / `style.css`。规则与 UI 分离。固定种子、actionId 幂等；零资金可免费休息，零精力可低质量出场。终演允许三种不同配置节目，避免全休息/单节目玩家卡住。

初始安全点、事件选择前后和结算后可恢复；刷新不会重抽事件或重复扣款。坏档、未来版本、不同 gameId 与坏内部状态受校验；原档保留并支持显式备份恢复。新战役替换当前槽位并保留已领纪念物。完成档刷新/重试领奖不增加存档 revision，多标签页冲突不会覆盖。

## 打开与测试

```powershell
cd F:\demo\autochess
python -m http.server 8086 --bind 127.0.0.1
```

打开 [游戏馆](http://127.0.0.1:8086/library/) 或 [G1](http://127.0.0.1:8086/games/studio-manager/)。不支持通过双击 HTML 直接加载 ES modules。

```powershell
node --test games/studio-manager/core.test.mjs library/contracts.test.mjs library/storage.test.mjs library/collectibles.test.mjs tools/game-library-integration.test.mjs
python -X utf8 tools/game-library-browser.py
python -X utf8 tools/game-library-legacy-browser.py
node tools/game-library-simulate.mjs
```

实际结果：Node 35/35，G1/大厅浏览器 37 项，旧导航与独立离线登记夹具 5 项通过。两个视口分别为 1440×900、390×844，完整十二档和终演。检查了双人节目人数提示、手机底部确认、音效偏好刷新、事件/结算恢复、独立重开、导入导出、失败提示、奖励重试、陈旧标签页，以及 console/素材请求无错误。

## 可复现经营路线

| 路线 | 种子 | 终演分 | 结局 |
| --- | --- | --- | --- |
| 杂谈专精 | 14 | 50 | 默契成团 `steady-debut` |
| 五节目均衡轮换 | 27 | 82 | 星光初绽 `spotlight` |
| 每四档休息恢复 | 88 | 51 | 默契成团 `steady-debut` |

最新模拟命令会输出 `out/game-library/simulations.json`，含全部 36 档资金、精力、Q、事件和结算原因。恢复路线以该脚本的当前选择规则与输出 51 为准；早期交接口述 49 不作为新验收依据。另有全休息测试可达 `first-steps`，共三结局可达。模拟不能证明真人乐趣或平衡。

## 美术与界面

深蓝导播台、薄荷绿操作区、桌面三栏；手机档期/成员/设备分栏。新生成工作室场景及岁己透明立绘已接入，其他角色沿用项目旧图。资产路径/提示词/来源/优化方式见 `assets/game-library/studio-manager/manifest.json`，源稿在 `out/game-library/`。未批量生成其余四名优先角色，也未把样本标为最终美术或官方素材。

截图在 `out/game-library/`：`library-1440.png`、`planning-1440.png`、`event-1440.png`、`result-1440.png`、`complete-1440.png` 及对应 `390` 图片。结果文件为 `browser-results.json`、`legacy-browser-results.json`。旧首页回归截图 `legacy-home-desktop.png`。

## 剩余验收与边界

- **真人试玩未做**：需要真实玩家完整经营一局，记录困惑点、退出点、重玩原因和实际时长；G1-04 与交付检查点因此保留未完成。
- 当前 Q/终演阈值为实验规则；没有真人参数调整记录，不能声称目标 25–40 分钟已达到。
- 单人无需注册，存档只在当前浏览器/来源；没有云同步或公开可信排行榜。新游戏没有断网页面缓存验收。
- 旧首页/缓存/旧存档键 smoke 通过，未执行所有旧游戏战斗回归。
- G1 收尾当时保留原有入口与存档格式，未新增 npm 运行依赖；新增测试和开发文档已从部署排除。后续统一大厅改造将经典入口迁至 classic.html，G1 与大厅已正式上线，详见 HALL-report.md。

下一阶段按总计划优先第二款不同类型的 G5 卡牌或 G6 推理，再验证两游戏与 P06。真人反馈仍待收集；不为此虚构反馈或自动上线。
