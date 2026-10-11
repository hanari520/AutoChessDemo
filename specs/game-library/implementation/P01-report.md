# P01 资源与入口清点交付

日期：2026-10-11。状态：清点完成。代码清点以真实运行时文件为准，不等于旧游戏全流程回归。

## 输出与证据

- [P01-inventory.json](P01-inventory.json)：50 个稳定角色 ID、名称、生产立绘路径、尺寸、原始清单来源；保留 `liAn` 大小写。
- 原始来源：`tools/units.json`、`assets/redraw_manifest.json`、`tools/export_units.js` 和旧 `index.html` 基础角色清单。
- 50 张 `assets/units_big/<id>.webp` 全部存在且解码为 512×512 RGBA；每条 source 和 production 路径均存在。上次清点抽样目视检查了艾因，本轮游戏内检查了岁己样本及初始队伍显示。

| 入口 | 本轮证据与限制 |
| --- | --- |
| `index.html` | 真实浏览器加载首页并走通游戏馆往返；未做全部自走棋战斗回归 |
| `arena.html` | 页面/资源路径存在；线上对局需要独立服务，未在本任务验证 |
| `online.html` | 页面/资源路径存在；八人房间需要独立服务，未在本任务验证 |
| `survival.html` | 既有单人入口路径存在；未在本任务完整通关 |
| `rpg/index.html` | 独立原型入口路径存在；不把历史原型宣称为正式游戏 |
| `games/studio-manager/index.html` | 新 G1；桌面/手机全战役自动化通过，真人试玩待做 |

发现的文档差异：旧首页/竞技场文档有“100 棋子”描述，但当前 arena 规则与测试只启用 50 原版角色。生产清单以 50 为准。旧素材没有完整生成提示词、模型或许可来源记录，清单明确标记未知，不称为官方美术。

## 复现

```powershell
cd F:\demo\autochess
python -X utf8 tools/game-library-inventory.py
```

实际结果：5 个既有入口、50 角色生产图片和对应源路径核查通过。游戏内 AI 样本另见 `assets/game-library/studio-manager/manifest.json`。

没有修改旧游戏角色、旧存档或线上服务。下一任务 P02 的资源依赖已满足。未部署。
