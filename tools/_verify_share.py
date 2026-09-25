# -*- coding: utf-8 -*-
"""G5 战绩分享卡验收：真实浏览器里驱动一局 → 结算 → 点「生成战绩分享卡」→ 校验图片产出。

关注三件事：
  1. Canvas 能否正常绘制 webp 立绘（同源不污染画布）
  2. toBlob 是否成功（被污染的画布会抛 SecurityError）
  3. 下载/分享是否真的产出 PNG，以及控制台有无报错
"""
import os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools')
URL = 'http://127.0.0.1:8088/index.html'

def main():
    errors, dl_path = [], None
    with sync_playwright() as p:
        br = p.chromium.launch(channel='chrome')
        ctx = br.new_context(viewport={'width': 900, 'height': 1100}, accept_downloads=True)
        pg = ctx.new_page()
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: %s' % e))
        pg.goto(URL, wait_until='load')
        pg.wait_for_timeout(1200)

        # 造一个像样的局面：4 名棋子 + 两个可凑的羁绊
        pg.evaluate("""() => {
          const mk = id => { const d = byId(id); const hp = Math.round(d.hp * HP_SCALE);
            return { uid: S.uid++, id, star: 1, sks: 1, hp, maxhp: hp, atk: d.atk, items: [] }; };
          S.lvl = 4; S.board = Array(64).fill(null); S.bench = Array(8).fill(null);
          const picks = ['sanli', 'aza', 'ein', 'miting'];
          picks.forEach((id, i) => { S.board[4 * 8 + 2 + i] = mk(id); });
          S.stats.wins = 17; S.stats.losses = 5; S.stats.maxStreak = 9; S.stats.kills = 128;
          S.stats.goldEarned = 214; S.stats.goldBy = { base: 120, interest: 30, streak: 20, loss: 0, win: 34, syn: 6, sell: 4 };
          S.stats.mvp = { '三理': { name: '三理', deal: 8420, take: 2100, heal: 300, kills: 41 } };
          S.round = 100; S.hp = 12; S.finished = true;
          showFinalResult('✦ 通 关 ✦', reportHTML('win'));
        }""")
        pg.wait_for_timeout(400)

        has_btn = pg.evaluate("() => !!document.getElementById('shareCardBtn')")
        print('① 结算面板含分享卡按钮:', has_btn)
        snap = pg.evaluate("() => shareCardData()")
        print('② 分享卡数据快照:', {k: snap[k] for k in ('round', 'hp', 'win', 'loss', 'maxStreak', 'kills')},
              '阵容数=%d 羁绊数=%d' % (len(snap['board']), len(snap['tiers'])),
              'MVP=%s' % (snap['mvp']['name'] if snap['mvp'] else None))

        # 点按钮 → 用监听器捕获下载（比 expect_download 更能暴露「静默失败」）
        downloads = []
        pg.on('download', lambda d: downloads.append(d))
        pg.click('#shareCardBtn')
        for _ in range(40):
            pg.wait_for_timeout(250)
            if downloads: break
            m = pg.evaluate("() => (document.getElementById('shareCardMsg') || {}).textContent || ''")
            if m.startswith('❌'): break
        if downloads:
            dl = downloads[0]
            dl_path = os.path.join(OUT, '_vv_sharecard.png')
            dl.save_as(dl_path)
            print('③ 触发下载:', dl.suggested_filename)
        else:
            print('③ ❌ 未触发下载')
        msg = pg.evaluate("() => (document.getElementById('shareCardMsg') || {}).textContent || ''")
        print('④ 面板提示:', msg)
        pg.wait_for_timeout(300)
        br.close()

    if dl_path and os.path.exists(dl_path):
        print('⑤ 产出文件: %s （%d 字节）' % (os.path.basename(dl_path), os.path.getsize(dl_path)))
    else:
        print('⑤ ❌ 未产出文件')
    real = [e for e in errors if 'favicon' not in e.lower()]
    print('⑥ 控制台错误:', len(real))
    for e in real[:6]:
        print('   -', e[:200])
    print('RESULT:', 'PASS' if (dl_path and os.path.exists(dl_path) and not real) else 'CHECK')

if __name__ == '__main__':
    main()
