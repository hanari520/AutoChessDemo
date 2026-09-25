# -*- coding: utf-8 -*-
"""P0 关卡体验验收：真实 Chrome + 游戏渲染与按钮事件。"""
import json
import os
import sys
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools')
URL = os.environ.get('URL', 'http://127.0.0.1:8088/index.html')


def check(ok, label, details=None):
    print(('[PASS] ' if ok else '[FAIL] ') + label + (('：' + str(details)) if details is not None else ''))
    return bool(ok)


def main():
    errors, failed_requests, checks = [], [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True,
                                    args=['--autoplay-policy=no-user-gesture-required'])
        context = browser.new_context(viewport={'width': 1280, 'height': 1000})
        page = context.new_page()
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        page.on('pageerror', lambda err: errors.append('pageerror: ' + str(err)))
        page.on('requestfailed', lambda req: failed_requests.append(req.url))
        page.goto(URL, wait_until='load')
        page.wait_for_timeout(700)
        page.evaluate("() => { localStorage.clear(); navigator.serviceWorker?.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())); }")
        page.reload(wait_until='load')
        page.wait_for_timeout(700)

        # 真实 UI 开局：引导 → 招募 → 点真实开战按钮，完成第一场来验证回合末遥测落盘。
        page.click('#homeNew')
        page.wait_for_timeout(250)
        page.click('#setupStart')
        page.wait_for_timeout(500)
        if page.locator('#guideOverlay [data-go]').count():
            page.click('#guideOverlay [data-go]')
            page.wait_for_timeout(300)
        if page.locator('#openingOfferOverlay button[data-i="0"]').count():
            page.click('#openingOfferOverlay button[data-i="0"]')
            page.wait_for_timeout(400)
        page.wait_for_function("() => typeof S !== 'undefined' && S.phase === 'prep' && S.round === 1")
        page.evaluate("() => localStorage.removeItem('vc_tele_v1')")
        before = page.evaluate("() => localStorage.getItem('vc_tele_v1')")
        page.click('#fightBtn')
        page.wait_for_function("() => typeof S !== 'undefined' && S.phase === 'prep' && S.round === 2", timeout=60000)
        telemetry = page.evaluate("""() => {
          const raw=localStorage.getItem('vc_tele_v1');
          return raw ? JSON.parse(raw) : null;
        }""")
        save_event = next((event for session in (telemetry or {}).get('sessions', [])
                           for event in session.get('events', []) if event.get('kind') == 'save'), None)
        checks.append(check(before is None, '回合末之前没有遥测落盘'))
        checks.append(check(bool(telemetry and telemetry.get('v') == 1 and telemetry.get('sessions') and telemetry.get('counters')),
                            '真实完成一回合后写入 vc_tele_v1'))
        checks.append(check(bool(telemetry and telemetry['counters'].get('prepDecisionCount') == 1 and
                                 telemetry['counters'].get('sessionDurationMs', 0) >= 0 and
                                 save_event and save_event.get('savedRound') == 1),
                            '遥测包含备战时长与存档回合快照', telemetry.get('counters') if telemetry else None))

        # 后续场景由真实渲染函数绘制，关键确认操作仍点击实际按钮。
        page.evaluate("""() => {
          S.auto=false; S.autoFight=false; S.phase='prep'; S.ms.forecastRounds=[];
          S.round=5; S.challengeRound=0; renderAll();
        }""")
        rest = page.evaluate("() => ({display:getComputedStyle(document.getElementById('restTag')).display,text:document.getElementById('restTag').textContent})")
        checks.append(check(rest['display'] != 'none' and '失败不扣血' in rest['text'], '普通野怪回合显示休整标识', rest))
        page.evaluate("() => { S.round=25; renderAll(); }")
        rest_boss = page.evaluate("() => getComputedStyle(document.getElementById('restTag')).display")
        checks.append(check(rest_boss == 'none', '守关回合隐藏休整标识'))

        # 守关预告只在 r24 / r49 触发，确认后实际点击按钮关闭。
        page.evaluate("() => { S.round=23; S.ms.forecastRounds=[]; renderAll(); }")
        r23_hidden = page.evaluate("() => getComputedStyle(document.getElementById('levelGuideModal')).display === 'none'")
        page.evaluate("() => { S.round=24; renderAll(); }")
        boss_notice = page.evaluate("""() => ({display:getComputedStyle(levelGuideModal).display,
          title:levelGuideTitle.textContent, body:levelGuideCopy.textContent})""")
        checks.append(check(r23_hidden, 'r23 不提前弹出守关预告'))
        checks.append(check(boss_notice['display'] != 'none' and '守关战' in boss_notice['title'] and
                            '最终魔王' in boss_notice['body'] and
                            '主要威胁' in boss_notice['body'] and '失败即结束本局' in boss_notice['body'],
                            'r24 守关预告包含身份、威胁和失败后果', boss_notice))
        page.click('#levelGuideAck')
        page.wait_for_function("() => getComputedStyle(document.getElementById('levelGuideModal')).display === 'none'")

        page.evaluate("() => { S.round=49; S.ms.forecastRounds=[]; S.ms.ticketGuidePending=0; renderAll(); }")
        ticket_forecast = page.evaluate("() => levelGuideCopy.textContent")
        checks.append(check('升星券' in ticket_forecast and '失败即结束本局' in ticket_forecast,
                            'r49 预告同时说明升星券与守关失败后果', ticket_forecast))
        page.click('#levelGuideAck')
        page.evaluate("() => { S.round=51; S.tickets=1; S.ms.ticketGuidePending=1; renderAll(); }")
        ticket_guide = page.evaluate("() => levelGuideCopy.textContent")
        checks.append(check('3★' in ticket_guide and '4★' in ticket_guide and '最多拥有一枚' in ticket_guide,
                            '获得升星券后指导 3★ 升 4★ 并说明单枚上限', ticket_guide))
        page.click('#levelGuideAck')

        # 装备配方提示走掉落待办与真实确认按钮，按钮会打开配方面板。
        page.evaluate("""() => {
          localStorage.removeItem('vc_item_recipe_guide_v1');
          S.round=6; S.phase='prep'; S.ms.recipeGuidePending=1; S.ms.recipeGuideHandled=0;
          S.ms.growthRound=1; S.ms.growthSnapshot={unitTiers:[],bondTiers:[],lvlDisplay:2};
          S.lvl=3; S.board=Array(64).fill(null); S.board[0]={id:'kanban',star:2};
          S.lastGearDrops=['sword']; renderAll();
        }""")
        recipe = page.evaluate("""() => ({display:getComputedStyle(levelGuideModal).display,
          body:levelGuideCopy.textContent, growth:chapterGrowth.textContent,
          gear:gearDropCards.textContent, card:gearDropCards.innerHTML})""")
        checks.append(check(recipe['display'] != 'none' and '21' in recipe['body'] and '6' in recipe['body'],
                            '首次装备掉落教学说明 6 件基础装与 21 条配方', recipe['body']))
        checks.append(check('新增 2★' in recipe['growth'] and '人口提升' in recipe['growth'],
                            '小节成长行显示升星与人口变化', recipe['growth']))
        checks.append(check('装备到手' in recipe['gear'] and 'gear-drop-card' in recipe['card'] and
                            '裂星刃' in recipe['gear'],
                            '装备到手卡片显示图标与名称', recipe['gear']))
        page.locator('#levelGuideModal').screenshot(path=os.path.join(OUT, '_vv_level_p0.png'))
        page.click('#levelGuideAck')
        book_open = page.evaluate("() => !document.getElementById('bookModal').classList.contains('hidden')")
        checks.append(check(book_open, '配方教学确认后打开图鉴面板'))
        page.click('#bookClose')

        # 第 2 章敌方信息与羁绊卡池提示；迷雾下隐藏。
        page.evaluate("""() => {
          S.round=26; S.phase='prep'; S.curses=[]; S.enemyBoard=[{id:'xuezhu',star:1}];
          S.board=Array(64).fill(null); S.board[0]={id:'kanban',star:1}; S.board[1]={id:'goutan',star:1}; renderAll();
        }""")
        info = page.evaluate("() => ({enemy:enemyInfo.textContent,pool:synAll.textContent})")
        checks.append(check('法师' in info['enemy'] and '主要威胁' in info['enemy'] and
                            any(x in info['enemy'] for x in ['控制', '爆发', '持续伤害']),
                            '第 2 章敌方预览说明职业与主要威胁', info['enemy']))
        checks.append(check('卡池' in info['pool'] and '池中' in info['pool'] and 'undefined' not in info['pool'],
                            '羁绊可视化显示候选棋子与池中余量', info['pool'][:240]))
        page.evaluate("() => { S.curses=['fog']; renderAll(); }")
        fog = page.evaluate("() => ({enemy:enemyInfo.textContent,pool:synAll.textContent})")
        checks.append(check('主要威胁' not in fog['enemy'] and '卡池' not in fog['pool'],
                            '迷雾诅咒隐藏威胁和卡池信息'))

        # 章回顾和评级走现有章节结算渲染，再点击增强卡。
        page.evaluate("""() => {
          S.curses=[]; S.round=25; S.phase='battle'; S.hp=30;
          S.stats.losses=2; S.stats.wins=10; S.stats.mvp={}; S.stats.maxTier2Bonds=0;
          S.stats.chapterStart={chapter:1,healthValue:40,failures:0,mvpTotals:{},codexSeen:[],codexKnown:[]};
          chapterSettle(true);
        }""")
        review = page.locator('#chapterBody').inner_text()
        checks.append(check('章回顾' in review and '级' in review and 'playtest' in review,
                            '章结算显示回顾、评级及门槛待验证说明', review[:240]))
        page.click('#chapterBody [data-aug="0"]')
        aug_stats = page.evaluate("() => ({picked:S.stats.tele?.augPick||0,id:Object.keys(S.stats.tele||{}).find(k=>k.startsWith('augPick.'))})")
        checks.append(check(aug_stats['picked'] == 1 and bool(aug_stats['id']),
                            '真实点击增强卡后记录选择与增强 id', aug_stats))
        page.click('#chapterContinue')

        # 精英挑战接受走敌方信息按钮，拒绝由真实开战按钮结算决策。
        page.evaluate("() => { S.round=10; S.phase='prep'; S.challengeRound=0; S.curses=[]; S.enemyBoard=[]; renderAll(); }")
        page.click('#enemyInfo button')
        elite_accept = page.evaluate("() => ({count:S.stats.tele.eliteAccept||0,round:S.stats.tele._events?.find(e=>e.name==='eliteAccept')?.round})")
        checks.append(check(elite_accept['count'] == 1 and elite_accept['round'] == 10,
                            '精英挑战接受事件记录回合', elite_accept))
        page.evaluate("() => { S.round=20; S.phase='prep'; S.challengeRound=0; S.enemyBoard=[]; renderAll(); }")
        page.click('#fightBtn')
        elite_decline = page.evaluate("() => ({count:S.stats.tele.eliteDecline||0,round:S.stats.tele._events?.find(e=>e.name==='eliteDecline')?.round})")
        checks.append(check(elite_decline['count'] == 1 and elite_decline['round'] == 20,
                            '未选精英挑战并开战时记录拒绝事件', elite_decline))

        browser.close()

    print('console errors:', len(errors), errors[:5] if errors else 'none')
    print('failed requests:', len(failed_requests), failed_requests[:5] if failed_requests else 'none')
    ok = all(checks) and not errors and not failed_requests
    print('RESULT:', 'PASS' if ok else 'FAIL')
    if not ok:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
