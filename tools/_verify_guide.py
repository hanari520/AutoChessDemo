# -*- coding: utf-8 -*-
"""E5 首次上手引导验收：真实浏览器走一遍新手路径。

要验证四件事：
  1. 全新玩家（无 localStorage）进入经典模式时会弹出上手引导
  2. 点「开始游戏」后引导关闭，并且【接着】弹出开局招募（顺序不能反、也不能互相顶掉）
  3. 已看过引导的玩家第二次进入不再弹（localStorage 生效）
  4. 全程无控制台错误
"""
import os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools')
URL = 'http://127.0.0.1:8088/index.html'


def start_classic(pg, wait=700):
    """走真实 UI：新建对局 → 开始普通模式。"""
    pg.click('#homeNew')
    pg.wait_for_timeout(300)
    pg.click('#setupStart')
    pg.wait_for_timeout(wait)


def main():
    errors = []
    with sync_playwright() as p:
        br = p.chromium.launch(channel='chrome')
        ctx = br.new_context(viewport={'width': 900, 'height': 1100})
        pg = ctx.new_page()
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: %s' % e))

        # ---------- 第一次：全新玩家 ----------
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(900)
        pg.evaluate("() => { try { localStorage.clear(); } catch(e){} }")
        pg.reload(wait_until='load')
        pg.wait_for_timeout(900)
        start_classic(pg)

        guide = pg.evaluate("() => !!document.getElementById('guideOverlay')")
        offer_before = pg.evaluate("() => !!document.getElementById('openingOfferOverlay')")
        print('① 首局弹出上手引导:', guide, '（此时不应同时弹招募:', offer_before, '）')
        if guide:
            pg.screenshot(path=os.path.join(OUT, '_vv_guide.png'))

        # 点「开始游戏」
        pg.click('#guideOverlay [data-go]')
        pg.wait_for_timeout(600)
        guide_after = pg.evaluate("() => !!document.getElementById('guideOverlay')")
        offer_after = pg.evaluate("() => !!document.getElementById('openingOfferOverlay')")
        stored = pg.evaluate("() => { try { return localStorage.getItem('vc_guide_v1'); } catch(e){ return 'ERR'; } }")
        print('② 关闭引导后：引导已消失 =', (not guide_after), '｜接着弹出开局招募 =', offer_after, '｜已写入标记 =', stored)

        # ---------- 第二次：老玩家 ----------
        # 只保留引导标记、清掉续玩存档：否则「新的对局」会先弹放弃进度确认页，
        # 脚本点不到开局按钮，会被误判成「招募没弹」。
        pg.evaluate("() => { try { Object.keys(localStorage).filter(k=>k.indexOf('vc_')===0&&k!=='vc_guide_v1').forEach(k=>localStorage.removeItem(k)); } catch(e){} }")
        pg.reload(wait_until='load')
        pg.wait_for_timeout(900)
        start_classic(pg)
        guide2 = pg.evaluate("() => !!document.getElementById('guideOverlay')")
        offer2 = pg.evaluate("() => !!document.getElementById('openingOfferOverlay')")
        diag = pg.evaluate("""() => ({ flowPage: (typeof flowPage!=='undefined'?flowPage:'?'),
            phase: (typeof S!=='undefined'?S.phase:'?'), round: (typeof S!=='undefined'?S.round:'?'),
            daily: (typeof S!=='undefined'?!!S.daily:'?'), auto: (typeof S!=='undefined'?!!S.auto:'?'),
            offerLen: (typeof S!=='undefined'&&S.openingOffer?S.openingOffer.length:-1),
            granted: (typeof S!=='undefined'?S.openingGranted:'?'),
            lsKeys: Object.keys(localStorage||{}).filter(k=>k.indexOf('vc_')===0),
            overlays: Array.from(document.querySelectorAll('[id$=Overlay]')).map(e=>e.id) })""")
        print('③ 老玩家再进：不再弹引导 =', (not guide2), '｜直接弹开局招募 =', offer2)
        print('   诊断:', diag)

        br.close()

    real = [e for e in errors if 'favicon' not in e.lower()]
    print('④ 控制台错误:', len(real))
    for e in real[:5]:
        print('   -', e[:200])
    ok = guide and (not guide_after) and offer_after and (not guide2) and offer2 and not real
    print('RESULT:', 'PASS' if ok else 'CHECK')


if __name__ == '__main__':
    main()
