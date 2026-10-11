"""Compare actual classic/online HUD computed styles in both themes."""
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[1]/'out'/'online-parity-20260930'
OUT.mkdir(parents=True,exist_ok=True)
fixture='''({online,side})=>{
  if(online)document.body.classList.add('online-playing');
  const node=document.createElement(online?'button':'div');
  node.className=`unit battle-unit ${side} ${online?'battle-piece':''}`;
  node.style.cssText='position:relative;width:44px;height:44px;--cell:52px;margin:120px';
  node.innerHTML='<img class="pt" src="assets/units_big/yua.webp"><div class="mpbar"><div class="mpfill" style="width:65%"></div></div><div class="hpbar"><div class="hpfill" style="width:75%"></div></div><i class="team-badge"></i>';
  document.body.append(node);
  const result={};
  for(const selector of ['.hpbar','.hpfill','.mpbar','.mpfill','.team-badge']){
    const css=getComputedStyle(node.querySelector(selector));
    result[selector]=Object.fromEntries(['bottom','left','right','height','borderRadius','borderColor','backgroundColor','backgroundImage','boxShadow','boxSizing'].map(key=>[key,css[key]]));
  }
  node.remove();return result;
}'''
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,channel='msedge')
    context=browser.new_context(viewport={'width':1440,'height':900})
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    base='http://127.0.0.1:8081/'
    page.goto(base+'online.html')
    assert page.locator('html').get_attribute('data-theme')=='light'
    page.locator('#themeBtn').click()
    assert page.evaluate("localStorage.getItem('vc_theme')")=='dark'
    page.reload()
    assert page.locator('html').get_attribute('data-theme')=='dark'
    page.screenshot(path=str(OUT/'entry-dark.png'))
    page.goto(base+'index.html')
    assert page.locator('html').get_attribute('data-theme')=='dark'
    page.locator('#homeTheme').click()
    assert page.evaluate("localStorage.getItem('vc_theme')")=='light'
    checks=0
    for theme in ['light','dark']:
        classic={}
        page.goto(base+'index.html')
        page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
        for side in ['ally','enemy']:classic[side]=page.evaluate(fixture,{'online':False,'side':side})
        page.goto(base+'online.html')
        page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
        for side in ['ally','enemy']:
            online=page.evaluate(fixture,{'online':True,'side':side})
            assert online==classic[side],(theme,side,online,classic[side])
            checks+=1
    page.set_viewport_size({'width':390,'height':844})
    page.goto(base+'online.html')
    assert page.locator('#themeBtn').is_visible()
    page.locator('#themeBtn').click()
    assert page.locator('html').get_attribute('data-theme')=='dark'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors,errors
    print('PASS HUD comparisons:',checks,'classic/online shared preference, reload, mobile toggle; errors:',errors)
    browser.close()
