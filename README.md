# 虚拟棋战 · VirtuaReal 自走棋 Demo

虚拟偶像主题单机闯关自走棋（VirtuaReal + P-SP 角色阵容）。游戏规则与战斗仍由 `index.html` 驱动；界面皮肤、舞台演出和施法表现拆分在 `tools/idol-ui.css`、`tools/idol-redesign.css`、`tools/idol-ui.js` 与 `tools/idol-ui-redesign.js`，无需构建或安装依赖。

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

- 25 回合通关；每 5 回合野怪回合（胜利掉装备，失败不扣血）；通关后可进入 ♾ 无限模式
- 经济：开局 10 金；基础收入 1→5 金递增；利息每 10 金 +1（上限 5）；胜利奖金 2 金；连胜/连败 3/5/7 → +2/3/4
- 等级=人口（1 级起步，最高 10）；买经验 5 金 +5 经验，每回合自然 +2
- 商店 5 卡槽独立按等级概率表抽取，共享卡池 50/40/30/20/10 张
- 战斗：全棋子统一 100 蓝，攻击回蓝 = 伤害÷2.5（法师系上限 20、其余 10），受击回蓝 10%~20%；护甲边际递减、魔抗百分比乘算、5% 伤害保底
- 46 名主播各有专属技能（破甲/减抗/变形/石化/纯粹伤害/斩杀/烧蓝/沉默等克制体系）

## 开发工具（tools/）

- `sim.js`：无头模拟器（Node），统计通关率/战斗时长/野怪胜率：`node tools/sim.js 300`
- `bot_strategy.js`：普通玩家机器人策略（sim 与浏览器共用）
- `accept25.py`：浏览器连打 25 局验收：`python tools/accept25.py`
- `duoduo_doc.txt`：数值设计参考文档提取版
