# 虚拟棋战 · VirtuaReal 自走棋 Demo

虚拟偶像主题自走棋（VirtuaReal + P-SP 角色阵容），包含单人闯关与 8 人 bot 竞技。游戏规则与战斗仍由 `index.html` 驱动；界面皮肤、舞台演出和施法表现拆分在 `tools/idol-ui.css`、`tools/idol-redesign.css`、`tools/idol-ui.js` 与 `tools/idol-ui-redesign.js`，无需构建或安装依赖。

## 本地游玩

直接用浏览器打开 `index.html`，或：

```bash
python -m http.server 8081
# 访问 http://127.0.0.1:8081
```

## Cloudflare Pages 部署

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → **Connect to Git**
2. 选择本仓库（`hanari520/AutoChessDemo`）
3. 构建设置：
   - **Framework preset**: None
   - **Build command**: 留空
   - **Build output directory**: `/`（仓库根目录）
4. Save and Deploy，之后每次 `git push` 自动重新部署

入口即根目录 `index.html`（含 PWA manifest 与 Service Worker），无需任何构建步骤。

## 玩法速览

- 闯关模式为 25 回合通关；每 5 回合野怪回合（胜利掉装备，失败不扣血）；通关后可进入 ♾ 无限模式
- 八人竞技模式：1 名玩家与 7 名风格各异的 bot 共用卡池，每回合 1 对 1，生命归零淘汰，最后存活者获胜；玩家对局使用完整战斗演算，bot 之间用阵容战力模型快速结算；玩家出局后赛事会继续模拟到冠军产生
- 经济：开局 10 金；基础收入 1→5 金递增；利息每 10 金 +1（上限 5）；胜利奖金 2 金；连胜/连败 3/5/7 → +2/3/4
- 等级=人口（1 级起步，最高 10）；买经验 5 金 +5 经验，每回合自然 +2
- 商店 5 卡槽独立按等级概率表抽取，共享卡池 50/40/30/20/10 张
- 战斗：全棋子统一 100 蓝，攻击回蓝 = 伤害÷2.5（法师系上限 20、其余 10），受击回蓝 10%~20%；护甲边际递减、魔抗百分比乘算、5% 伤害保底
- 50 枚棋子各有专属技能（破甲/减抗/变形/石化/纯粹伤害/斩杀/烧蓝/沉默等克制体系）
- 战斗系统：50 枚棋子逐个配置技能机制；普攻分刃光、箭矢、棱晶弹、节拍脉冲、碎星爆点 5 种表现，并按角色触发流血、减速、回蓝、溅射等效果。技能清单见 `assets/skill_signature_manifest.json`。
- 羁绊徽章：12 个阵营与 10 个职业使用统一重绘的 AI 透明图集，应用于羁绊栏、棋子卡片、战场徽章和图鉴；Service Worker v21 预缓存图集。

## 开发工具（tools/）

- `sim.js`：无头模拟器（Node），统计通关率/战斗时长/野怪胜率：`node tools/sim.js 300`
- `bot_strategy.js`：托管与竞技 bot 共用的自适应运营策略，按经济、血量、战力差、对子进度、羁绊和对手阵容调整买牌、升级、搜牌、装备与站位；竞技 bot 有各自的运营风格与独立状态
- `accept25.py`：浏览器连打 25 局验收：`python tools/accept25.py`
- `duoduo_doc.txt`：数值设计参考文档提取版

## 2026-09-23 立绘与技能签名重制
- 50 枚棋子统一为 hand-painted 二头身棋盘立绘，源文件在 ssets/units_redraw/，生产尺寸同步到 ssets/units_big/ 与 ssets/units/；清单见 ssets/redraw_manifest.json。
- 每名棋子施法时使用独立图腾、形状、色彩与命中印记（ssets/skill_signature_manifest.json），由 signatureFx() 驱动。
- 每名棋子还拥有独有技能印记二段机制：攻击技能在目标下一次受伤时引爆，辅助技能在自身下一次受击时触发减伤回响；名称、倍率、持续时间和视觉主题均逐棋子配置。

