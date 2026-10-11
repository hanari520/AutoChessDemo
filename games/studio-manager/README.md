# 今晚谁来播 · Demo

在项目根目录 `F:/demo/autochess` 运行：

```powershell
python -m http.server 8086 --bind 127.0.0.1
```

打开 [游戏馆](http://127.0.0.1:8086/library/) 或 [直接进入工作室](http://127.0.0.1:8086/games/studio-manager/)。请使用 HTTP 地址，不要双击 HTML 文件。

选三位成员，安排十二档节目，处理事件、轮换休息并升级设备；四周后选择三种终演节目完成战役。双人联动需要两名成员。低资金时可免费休息，不会破产删档。

进度保存在当前浏览器 IndexedDB，支持自动保存及 JSON 导出/导入。导出可备份到文件；其他浏览器或其他端口属于不同存储空间。多标签页出现冲突时按提示刷新，原档不会静默覆盖。存储不可用时页面会明确提示，可导出内存进度。

角色节目偏好和社团故事均为架空设定。岁己立绘和场景是新生成的 AI 测试素材，其他成员沿用项目旧图；来源清单见 `assets/game-library/studio-manager/manifest.json`。无需账号。当前未部署，也未验收离线缓存。

验证命令：

```powershell
node --test games/studio-manager/core.test.mjs library/contracts.test.mjs library/storage.test.mjs library/collectibles.test.mjs tools/game-library-integration.test.mjs
python -X utf8 tools/game-library-browser.py
python -X utf8 tools/game-library-legacy-browser.py
```

自动化验证覆盖桌面 1440×900 与手机 390×844，不能代替真人乐趣/平衡验证。完整交付证据见 `specs/game-library/implementation/G1-report.md`。
