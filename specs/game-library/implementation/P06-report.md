# P06：六槽个人展示页

日期：2026-10-11。入口：`/library/profile.html`。本任务只新增个人展示页、纯函数测试与本报告；未修改大厅、任务清单、奖励目录、共享合同或 IndexedDB 实现。

## 实现

- `library/profile.html` 与 `profile.css` 提供白色与浅薰衣草色舞台、昵称和本命预览、六个展示位、空态、回到首页/大厅入口，以及窄屏布局。六个可访问的选择器是 `#display-slot-1` 至 `#display-slot-6`（也可用 `[data-slot-index]` 定位）；本命选择器为 `#favorite-character`，昵称为 `#display-name`，主按钮为 `#save-profile`。
- `library/profile.mjs` 将资料以合同字段保存至独立 `localStorage` 键 `vtlib:profile:v1`。本命仅提供当前演示聚焦的岁己与栞栞；旧资料若引用其他角色会回退为岁己。当前页会即时预览；读写失败会保留内存编辑并明确说明刷新后是否可恢复。错误 JSON 不会中断页面。
- 纪念物选项只来自 `listCollectibles()` 当前返回的本地记录。空库存和 IndexedDB 读取失败分别显示空态与不可读取状态；读取失败时展示位只读，可重试。加载旧资料时会将不再拥有、无效或重复的槽位留空，不自动写回；用户保存后才保存修正。
- 展示卡保留作品来源、本地/服务端标记，并为 G1、G2 配置独立链接：`studio-manager` → `../games/studio-manager/index.html`，`midnight-store` → `../games/midnight-store/index.html`。未知来源只显示来源 ID，不生成导航链接。缺图和加载失败均显示舞台占位符。
- 合同的 `displaySlots` 只容纳裸纪念物 ID，而存储以 `(gameId, id)` 区分记录。若相同 ID 同时出现在两款游戏，页面会隐藏这类歧义选项，避免错误链接或展示来源；没有变更共享合同。

## 验证

运行：

```powershell
node --test library/profile.test.mjs
node --check library/profile.mjs
node --check library/profile.test.mjs
```

结果：个人资料测试 **6/6 通过**；两个 JavaScript 文件语法检查通过。测试覆盖合同形状、两张当前角色头像、G1/G2 选择与独立来源链接、stale ID 清除、重复槽位清除、刷新序列化恢复、旧角色偏好回退、跨游戏 ID 歧义拒绝、资料校验及无效 JSON。

页面可复现入口：在项目根目录运行 `python -m http.server 8086 --bind 127.0.0.1` 后访问 `http://127.0.0.1:8086/library/profile.html`。本任务没有运行浏览器端检查；请在桌面和手机视口补测保存刷新、素材失败、空库存与 IndexedDB 不可用。主要浏览器断言选择器为 `#profile-status`、`#collectible-status`、`#stage-slots [data-stage-slot]`、`a[data-source-game="studio-manager"]`、`a[data-source-game="midnight-store"]`、`#retry-collectibles`。

## 剩余事项

- 当前奖励目录里的 G1 图片字段为 `null`，因此实际纪念物卡片使用设计占位符；图片加载失败的图片隐藏回退逻辑由可带图片的记录路径覆盖，仍需浏览器视觉复核。
- 没有新增 G2 奖励；G2 来源映射已固定到其游戏入口，待该游戏产生真实本地纪念物后进行浏览器集成验证。
- 资料写入使用本地存储，不包含云同步或跨设备身份；未部署。
