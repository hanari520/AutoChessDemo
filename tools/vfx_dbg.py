import os, json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel='msedge')
    pg = b.new_page(viewport={'width':1400,'height':900})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8081/index.html')
    pg.wait_for_timeout(800)
    pg.evaluate("""() => {
      const r=document.getElementById('resumeOv');
      if(r&&!r.classList.contains('hidden'))document.getElementById('resumeNo').click();
      const o=document.getElementById('overlay');
      if(o&&!o.classList.contains('hidden'))document.getElementById('ovBtn').click();
    }""")
    pg.wait_for_timeout(300)
    out = pg.evaluate("""() => {
      const g=boardGeo();
      const fx1=fxNode('rune', g.cellX+1*g.sx+g.cw/2, g.cellY+1*g.sy+g.ch/2, 3000);
      const fx2=fxNode('pt', g.cellX+2*g.sx+g.cw/2, g.cellY+1*g.sy+g.ch/2, 3000);
      if(fx2){fx2.style.background='#ffb14a';fx2.style['--dx']='15px';fx2.style['--dy']='-12px';}
      const fx3=fxNode('slashline', g.cellX+3*g.sx+g.cw/2, g.cellY+1*g.sy+g.ch/2, 3000);
      if(fx3) fx3.style['--rot']='30deg';
      const dump=[];
      [fx1,fx2,fx3].forEach(el=>{ if(!el){dump.push(null);return;}
        const r=el.getBoundingClientRect(), cs=getComputedStyle(el);
        dump.push({cls:el.className,left:el.style.left,top:el.style.top,rect:[r.x,r.y,r.width,r.height],anim:cs.animationName,op:cs.opacity,z:cs.zIndex,display:cs.display}); });
      return {dump, n:_vfxN, geo:{cw:g.cw,ch:g.ch,cellX:g.cellX,cellY:g.cellY,sx:g.sx,sy:g.sy},
        boardRect:(()=>{const r=document.getElementById('board').getBoundingClientRect();return [r.x,r.y,r.width,r.height];})(),
        phase:S.phase};
    }""")
    print(json.dumps(out, ensure_ascii=False, indent=1))
    pg.screenshot(path='out/vfx/dbg_0ms.png')
    pg.wait_for_timeout(250)
    n2 = pg.evaluate("() => document.querySelectorAll('#board .vfx').length")
    print('after 250ms vfx count:', n2, 'errors:', errs[:3] if errs else 'none')
    b.close()
