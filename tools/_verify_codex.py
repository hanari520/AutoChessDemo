# -*- coding: utf-8 -*-
"""F5 立绘收集层验收：真实浏览器里检查图鉴的收集进度渲染。

分工说明：
  - 「埋点链路」（终局收录上场棋子、中途卖掉也收录、失败不计胜场）由 tools/_t2_tests.js 断言覆盖；
  - 本脚本只负责「UI 呈现」：0 收集 / 部分收集两种状态下，图鉴是否如实显示进度与每枚棋子的登场数。
真实浏览器 + 真实渲染函数（renderBook）+ 真实终局函数（writeRunHistory），不手写 DOM。
"""
import json, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools')
URL = 'http://127.0.0.1:8088/index.html'


def open_book(pg):
    # 用脚本触发点击：页面初始停在 flow 首页，#flowShell 会挡住顶栏的鼠标点击。
    # （真实玩家是先进入对局、顶栏可用时才开图鉴，这里只为验证渲染结果。）
    # 图鉴是弹窗（#bookModal），会被首页的 flowShell 压住 —— 先切到 game 页再开
    pg.evaluate("() => { if (typeof showFlowPage === 'function') showFlowPage('game'); }")
    pg.wait_for_timeout(400)
    pg.evaluate("() => document.getElementById('bookBtn').click()")
    pg.wait_for_timeout(500)
    return pg.evaluate("() => document.getElementById('bookCount').textContent")


def main():
    errors = []
    with sync_playwright() as p:
        br = p.chromium.launch(channel='chrome')
        ctx = br.new_context(viewport={'width': 1100, 'height': 1200})
        pg = ctx.new_page()
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: %s' % e))

        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(900)
        pg.evaluate("() => { try { localStorage.clear(); } catch(e){} }")
        pg.reload(wait_until='load')
        pg.wait_for_timeout(900)

        c0 = open_book(pg)
        print('① 全新存档的收集进度:', c0)
        cards0 = pg.evaluate("() => document.querySelectorAll('#bookGrid .bcard').length")
        print('   图鉴卡片数:', cards0)

        # 走真实终局函数：给棋盘放 3 枚棋子 → 逐回合累积 → 终局结算
        pg.evaluate("""() => {
            const mk = id => { const d = byId(id); const hp = Math.round(d.hp * HP_SCALE);
              return { uid: S.uid++, id, star: 1, sks: 1, hp, maxhp: hp, atk: d.atk, items: [] }; };
            S.board = Array(64).fill(null); S.bench = Array(8).fill(null);
            ['sanli', 'aza', 'ein'].forEach((id, i) => { S.board[4 * 8 + 2 + i] = mk(id); });
            // 再模拟一枚「中途买过又卖掉」的
            S.bench[0] = mk('miting');
            codexMark();
            S.bench[0] = null;
            S.stats.wins = 6; S.stats.losses = 3;
            writeRunHistory(true);
        }""")
        pg.wait_for_timeout(300)
        raw = pg.evaluate("() => { try { return localStorage.getItem('vc_codex'); } catch(e){ return null; } }")
        print('② vc_codex 条目数:', len(json.loads(raw)) if raw else 0, '｜键:', list(json.loads(raw or '{}').keys()))

        pg.reload(wait_until='load')
        pg.wait_for_timeout(900)
        # 走真实开局：只有真正进到对局里，顶栏才可用、图鉴弹窗才不被首页遮罩压住
        pg.click('#homeNew'); pg.wait_for_timeout(300)
        pg.click('#setupStart'); pg.wait_for_timeout(700)
        if pg.query_selector('#guideOverlay [data-go]'):
            pg.click('#guideOverlay [data-go]'); pg.wait_for_timeout(500)
        if pg.query_selector('#openingOfferOverlay button[data-i="0"]'):
            pg.click('#openingOfferOverlay button[data-i="0"]'); pg.wait_for_timeout(500)
        c1 = open_book(pg)
        print('③ 一局之后的收集进度:', c1)
        # 找一枚已收录棋子的卡片文案
        sample = pg.evaluate("""() => {
            const cards = [...document.querySelectorAll('#bookGrid .bcard')];
            const hit = cards.find(c => /登场 \\d+ 场/.test(c.textContent));
            const miss = cards.find(c => c.textContent.includes('尚未登场'));
            return { hit: hit ? hit.textContent.replace(/\\s+/g, ' ').slice(0, 120) : null,
                     miss: miss ? miss.textContent.replace(/\\s+/g, ' ').slice(0, 80) : null };
        }""")
        print('   已收录卡片示例:', sample['hit'])

        # G3 本命标记：点卡片上的「设为本命」按钮
        pg.evaluate("""() => { const b = document.querySelector('[data-myos-btn="sanli"]'); if (b) b.click(); }""")
        pg.wait_for_timeout(400)
        myos = pg.evaluate("() => { try { return localStorage.getItem('vc_myos'); } catch(e){ return null; } }")
        myos_ui = pg.evaluate("""() => {
            // 用「我的本命」定位：卡片里 「88❤ 7⚔」 也含 ❤ 字符，靠符号找会误判
            const c = [...document.querySelectorAll('#bookGrid .bcard')].find(x => x.textContent.includes('我的本命'));
            return c ? c.textContent.replace(/\s+/g, ' ').slice(0, 70) : null;
        }""")
        print('⑤ 本命标记:', myos, '｜卡片:', myos_ui)
        print('   未收录卡片示例:', sample['miss'])
        # 整页截图会被首页 flowShell 压住，改用元素截图：只截图鉴弹窗本身
        try:
            pg.locator('#bookModal').screenshot(path=os.path.join(OUT, '_vv_codex.png'))
            print('   图鉴截图已保存')
        except Exception as ex:
            print('   图鉴截图失败:', str(ex)[:80])
        br.close()

    real = [e for e in errors if 'favicon' not in e.lower()]
    print('④ 控制台错误:', len(real))
    for e in real[:5]:
        print('   -', e[:200])
    ok = (('0/50' in c0) and raw and ('0/50' not in c1) and sample['hit'] and sample['miss']
          and myos == 'sanli' and myos_ui and not real)
    print('RESULT:', 'PASS' if ok else 'CHECK')


if __name__ == '__main__':
    main()
