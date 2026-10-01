"""八人联机 · 经典操作界面验收（经典 UI 移植后）。
运行前提：静态 :8081 + 联机 API :3000（ONLINE_TEST_API 可覆盖）。
覆盖：经典骨架（topbar/main/shopbar）、商店卡、棋盘/备战席、拖拽、
详情面板、快捷键、八人战况面板、战斗层、观战。
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / 'out' / 'online-classic-ui'
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8081/online.html')
    page.locator('.advanced-settings summary').click()
    page.locator('#apiBase').fill(os.environ.get('ONLINE_TEST_API','http://127.0.0.1:3000'))
    page.locator('#playerName').fill('经典UI验收')
    page.locator('#createBtn').click()
    page.locator('#lobbySection').wait_for(state='visible')
    for n in range(7):
        page.locator('#addBotBtn').click()
        page.wait_for_function('(n) => document.querySelectorAll("#lobbySeats .seat-name .bot-badge").length === n', arg=n + 1)
    page.locator('#lobbyReadyBtn').click()
    page.locator('#gameSection').wait_for(state='visible', timeout=15000)
    page.wait_for_function('() => document.body.classList.contains("online-playing")')

    # —— 经典骨架 ——
    assert page.locator('#topbar #round').is_visible(), '经典顶栏缺失'
    assert page.locator('#resHp #hp').is_visible()
    assert page.locator('#resGold #gold').is_visible()
    assert page.locator('#resPop #pop').is_visible()
    assert page.locator('#resStreak #streak').is_visible()
    assert page.locator('#main #synCol #synAll').is_visible()
    assert page.locator('#board .cell').count() == 64, '棋盘 64 格'
    assert page.locator('#board .cell.enemy-side').count() == 32
    assert page.locator('#bench .bslot').count() == 8
    assert page.locator('#shopbar #shop').is_visible()
    assert page.locator('#pbtns #deployBtn').is_visible()
    assert page.locator('#shopctlCol #refreshBtn').is_visible()
    assert page.locator('#fightBox #fightBtn').is_visible()
    # 左栏迁移：详情面板 + 敌方信息并入羁绊列（经典桌面布局）
    inside = page.evaluate('!!document.querySelector("#synCol #inspectPanel") && !!document.querySelector("#synCol #oppBar")')
    assert inside, 'inspectPanel/oppBar 未按经典迁入左栏'
    # 概率行（经典 oddsRow）
    assert page.locator('#oddsRow .oc1').count() == 1
    # 经典三段式布局几何：topbar 顶 / shopbar 底 / main 居中三栏（synCol 左 · board 中 · side 右）
    geo = page.evaluate('''()=>{
      const r = id => { const el=document.getElementById(id); if(!el) return null;
        const b=el.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height}; };
      return {topbar:r('topbar'), main:r('main'), shopbar:r('shopbar'), board:r('board'),
              synCol:r('synCol'), side:r('side'), shop:r('shop'), arena:r('arenaPanel'),
              vw:innerWidth, vh:innerHeight, scrollW:document.documentElement.scrollWidth};
    }''')
    assert geo['topbar']['y'] < geo['main']['y'] < geo['shopbar']['y'], 'topbar/main/shopbar 纵向次序'
    assert geo['shopbar']['y'] + geo['shopbar']['h'] <= geo['vh'] + 1, 'shopbar 贴底'
    assert geo['synCol']['x'] < geo['board']['x'] < geo['side']['x'], 'synCol|board|side 横向次序'
    assert geo['arena']['x'] >= geo['side']['x'], '八人战况在右栏'
    assert page.evaluate('document.querySelector("#side").firstElementChild.id') == 'arenaPanel', '八人战况是右栏第一块面板'
    assert geo['board']['w'] > 400 and geo['board']['h'] > 400, '棋盘实际渲染尺寸'
    assert geo['scrollW'] <= geo['vw'] + 1, f'无横向滚动（{geo["scrollW"]} > {geo["vw"]}）'

    # —— 开局应援三选一（经典 stg 弹层，先选再操作）——
    ov = page.locator('#openingOfferOverlay')
    if ov.count():
        ov.locator('.stg-pick').first.click()
        page.wait_for_function('() => !document.getElementById("openingOfferOverlay")', timeout=8000)

    # —— 商店卡（经典 .card.costN 结构 + 立绘背景）——
    card = page.locator('#shop .card:not(.sold)').first
    card.wait_for(timeout=8000)
    assert card.locator('.costbar').count() == 1
    assert card.locator('.artbg').count() == 1
    assert card.locator('.cn').inner_text() != ''
    page.screenshot(path=str(OUT / '01-prep-classic-shell.png'), full_page=True)

    # —— 购买 → 备战席出现经典棋子 DOM ——
    gold_before = int(page.locator('#gold').inner_text())
    card.click()
    page.wait_for_function('(g)=>parseInt(document.querySelector("#gold").textContent)<g', arg=gold_before)
    piece = page.locator('#bench .bslot .unit.prep-unit').first
    piece.wait_for(timeout=5000)
    assert piece.locator('.pt').count() == 1, '棋子立绘 .pt'
    assert piece.locator('.st').inner_text() == '★'
    assert piece.locator('.syn .sy').count() >= 2, '羁绊角标'

    # —— 拖拽上阵（pointer 拖拽 → 服务器移动 → 棋盘出现棋子）——
    src = page.locator('#bench .bslot .unit').first
    box = src.bounding_box()
    target = page.locator('#board .cell').nth(40).bounding_box()   # 我方半区
    page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
    page.mouse.down()
    page.mouse.move(target['x']+target['width']/2, target['y']+target['height']/2, steps=8)
    assert page.locator('#board .cell.drop-hl').count() == 1, '落点高亮'
    page.mouse.up()
    page.wait_for_function('() => document.querySelectorAll("#board .cell .unit").length > 0', timeout=5000)

    # —— 单击棋子 → 经典详情面板 + 攻击范围高亮 ——
    page.locator('#board .cell .unit').first.click()
    assert '生命' in page.locator('#inspect').inner_text()
    assert '攻击' in page.locator('#inspect').inner_text()
    assert page.locator('#board .cell.rng-src').count() == 1
    assert page.locator('#board .cell.rng-hl').count() > 0
    page.screenshot(path=str(OUT / '02-inspect-range.png'), full_page=True)

    # —— 羁绊列徽章 ——
    assert page.locator('#synAll .syn-badge').count() >= 1, '羁绊徽章'

    # —— 快捷键：D 刷新 ——
    gold_a = int(page.locator('#gold').inner_text())
    page.keyboard.press('d')
    page.wait_for_function('(g)=>parseInt(document.querySelector("#gold").textContent)<g', arg=gold_a, timeout=5000)

    # —— 出售（选中 + E）——
    page.locator('#board .cell .unit').first.click()
    sell_text = page.locator('#sellBtn').inner_text()
    assert '+' in sell_text, f'出售按钮应显示回购价：{sell_text}'
    gold_b = int(page.locator('#gold').inner_text())
    page.keyboard.press('e')
    page.wait_for_function('(g)=>parseInt(document.querySelector("#gold").textContent)>g', arg=gold_b, timeout=5000)
    page.wait_for_function('() => document.querySelectorAll("#board .cell .unit").length === 0')

    # —— 一键上阵 + 锁定（战斗流程）——
    page.locator('#deployBtn').click()
    page.wait_for_function('() => document.querySelectorAll("#board .cell .unit").length > 0', timeout=5000)
    # 八人战况面板
    rows = page.locator('#arenaInfo .pl-row')
    rows.first.wait_for(timeout=5000)
    assert rows.count() == 8, '八人战况 8 行'
    assert '❤' in rows.first.inner_text()
    page.screenshot(path=str(OUT / '03-deployed-players-hud.png'), full_page=True)
    page.locator('#fightBtn').click()

    # —— 战斗：经典战斗层上板 ——
    page.wait_for_function('() => !!document.getElementById("unitLayer")', timeout=30000)
    page.wait_for_function('() => document.querySelectorAll("#unitLayer .unit.battle-unit").length > 0', timeout=20000)
    assert page.locator('#unitLayer .unit.battle-unit.ally').count() >= 1
    assert page.locator('#aliveBar').is_visible(), '战斗存活计数'
    page.wait_for_timeout(2500)
    page.screenshot(path=str(OUT / '04-battle-on-classic-board.png'), full_page=True)
    # 战斗统计（stb）
    page.wait_for_function('() => document.querySelectorAll("#statBar .stb-tab").length === 3', timeout=10000)

    # —— 结果后回到备战：战斗层被清掉、棋盘恢复 ——
    page.wait_for_function('() => document.body.dataset.phase === "prep"', timeout=180000)
    page.wait_for_function('() => !document.getElementById("unitLayer")', timeout=20000)
    assert page.locator('#board .cell').count() == 64

    # —— 观战：点八人战况其他玩家 ——
    page.locator('#arenaInfo .pl-row[data-watch]:not(.me)').first.click()
    page.wait_for_function('() => document.querySelector("#enemyInfo").textContent.includes("观战")', timeout=8000)
    page.screenshot(path=str(OUT / '05-spectate.png'), full_page=True)
    page.locator('#arenaInfo .pl-row.me').click()
    page.wait_for_function('() => !document.querySelector("#enemyInfo").textContent.includes("观战")', timeout=8000)

    # —— 快捷键说明弹窗 ——
    page.locator('#helpBtn').click()
    assert '快捷键' in page.locator('#hotkeyDialog').inner_text()
    page.locator('#hotkeyClose').click()

    # —— 刷新重连（resume）：URL 带房间码时自动回到对局 ——
    page.reload()
    page.locator('#gameSection').wait_for(state='visible', timeout=20000)
    page.wait_for_function('() => document.body.classList.contains("online-playing")')
    page.wait_for_function('() => document.querySelectorAll("#board .cell").length === 64', timeout=15000)
    assert page.locator('#arenaInfo .pl-row').count() == 8

    assert not errors, errors
    browser.close()
    print('经典 UI 联机验收：全部通过')
