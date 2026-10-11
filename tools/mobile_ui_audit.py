"""移动端 UI 体检：经典模式（index.html）与八人联机（online.html）。
量测：横向溢出、触控目标尺寸、小字号、安全区、固定栏遮挡。
运行前提：静态 :8081（联机还需 API :3000）。
"""
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / 'out' / 'mobile-ui-audit'
OUT.mkdir(parents=True, exist_ok=True)

TOUCH_PATCH = """
Object.defineProperty(window, 'ontouchstart', {value: () => {}});
const _mm = window.matchMedia.bind(window);
window.matchMedia = q => q.includes('pointer:coarse') ? {matches:true, media:q, addEventListener(){}, removeEventListener(){}} : _mm(q);
"""

MEASURE = """() => {
  const vw = innerWidth, vh = innerHeight;
  const visible = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05;
  };
  const label = el => (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '');
  // 触控目标：可点元素且 <40px 任一维
  const small = [];
  for (const el of document.querySelectorAll('button, [role="button"], .btn, .card, .bslot, .item-chip, a, input, summary')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) small.push({sel: label(el), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || '').trim().slice(0, 14)});
  }
  // 小字号文本
  const tiny = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.children.length > 0) continue;
    const t = (el.textContent || '').trim();
    if (!t) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11) tiny.push({sel: label(el), fs: Math.round(fs * 10) / 10, text: t.slice(0, 16)});
  }
  // 溢出
  const overflow = document.documentElement.scrollWidth - vw;
  // 固定栏遮挡：顶栏/底栏高度
  const bar = id => { const el = document.getElementById(id); if (!el) return null; const r = el.getBoundingClientRect(); return {y: Math.round(r.y), h: Math.round(r.height)}; };
  return {vw, vh, overflow, small: small.slice(0, 40), tiny: tiny.slice(0, 40),
          topbar: bar('topbar'), shopbar: bar('shopbar'),
          safeAreaCss: [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.cssText && r.cssText.includes('safe-area-inset')); } catch { return false; } }),
          theme: document.documentElement.dataset.theme || 'light'};
}"""

def report(tag, m):
    print(f'==== {tag} ====')
    print(f"viewport {m['vw']}x{m['vh']} · 横向溢出 {m['overflow']}px · 安全区CSS {'有' if m['safeAreaCss'] else '无'} · 主题 {m['theme']}")
    if m['topbar']: print('顶栏', m['topbar'])
    if m['shopbar']: print('底栏', m['shopbar'])
    print(f"-- 触控目标 <40px（{len(m['small'])} 个）--")
    for x in m['small'][:18]: print('  ', x)
    print(f"-- 字号 <11px（{len(m['tiny'])} 处）--")
    for x in m['tiny'][:18]: print('  ', x)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')

    # ---------- 经典模式 ----------
    page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    page.add_init_script(TOUCH_PATCH)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8081/index.html')
    page.locator('#homeNew').click()
    page.locator('#setupStart').click()
    page.wait_for_function('() => document.body.classList.contains("touch")', timeout=8000)
    page.wait_for_timeout(1200)
    # 关掉可能的引导/开局弹层
    for sel in ('#guideOverlay [data-skip]', '#guideOverlay button', '#openingOfferOverlay [data-skip]'):
        loc = page.locator(sel)
        if loc.count():
            try: loc.first.click(timeout=1500)
            except Exception: pass
    page.wait_for_timeout(400)
    m = page.evaluate(MEASURE)
    report('经典模式 index.html @390x844', m)
    page.screenshot(path=str(OUT / 'classic-390.png'), full_page=True)
    print('pageerrors:', errors[:3])

    # ---------- 联机模式 ----------
    p2 = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    p2.add_init_script(TOUCH_PATCH)
    errors2 = []
    p2.on('pageerror', lambda e: errors2.append(str(e)))
    p2.goto('http://127.0.0.1:8081/online.html')
    p2.locator('.advanced-settings summary').click()
    p2.locator('#apiBase').fill(os.environ.get('ONLINE_TEST_API', 'http://127.0.0.1:3000'))
    p2.locator('#playerName').fill('体检')
    p2.locator('#createBtn').click()
    p2.locator('#lobbySection').wait_for(state='visible')
    for n in range(7):
        p2.locator('#addBotBtn').click()
        p2.wait_for_function('(n) => document.querySelectorAll("#lobbySeats .seat-name .bot-badge").length === n', arg=n + 1)
    p2.locator('#lobbyReadyBtn').click()
    p2.locator('#gameSection').wait_for(state='visible', timeout=15000)
    p2.wait_for_function('() => document.body.classList.contains("touch")')
    ov = p2.locator('#openingOfferOverlay')
    if ov.count():
        ov.locator('.stg-pick').first.click()
        p2.wait_for_function('() => !document.getElementById("openingOfferOverlay")', timeout=8000)
    p2.wait_for_timeout(600)
    m2 = p2.evaluate(MEASURE)
    report('联机模式 online.html @390x844', m2)
    p2.screenshot(path=str(OUT / 'online-390.png'), full_page=True)
    print('pageerrors:', errors2[:3])

    browser.close()
