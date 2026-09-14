# 特效画廊：冻结战斗时钟，在棋盘网格上同时生成全部新特效原型，逐帧截图供观感验收
import os
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'vfx')
os.makedirs(OUT, exist_ok=True)

GALLERY = """() => {
  // 交火中冻结时钟：保留已渲染的战斗棋子
  stopTickLoop();
  const g = boardGeo();
  const at = (x, y) => ({ x: g.cellX + x*g.sx + g.cw/2, y: g.cellY + y*g.sy + g.ch/2 });
  const fx = [];
  const pt = (c, dx, dy) => (x,y) => { const p=at(x,y); const el=fxNode('pt',p.x,p.y,2600);
    if(el){ el.style.background=c; el.style['--dx']=dx; el.style['--dy']=dy; } };
  const shard = (cls, dx, dy) => (x,y) => { const p=at(x,y); const el=fxNode('shard '+cls,p.x,p.y,2600);
    if(el){ el.style['--dx']=dx; el.style['--dy']=dy; } };
  const put = (cls, extra) => (x,y) => { const p=at(x,y); const el=fxNode(cls,p.x,p.y,2600);
    if(el&&extra) extra(el); };
  const items = [
    pt('#ffb14a','18px','-10px'),                                      // 0 物理火花
    pt('#ffd24a','-16px','8px'),
    put('slashline', e=>{e.style['--rot']='35deg';}),                  // 2 斩击线
    put('rune'),                                                       // 3 法术符文
    put('impact'),                                                     // 4 命中冲击圈
    put('crit'),                                                       // 5 暴击紫爆
    put('sweep', e=>{e.style['--rot']='90deg';}),                      // 6 扇形剑气
    put('shock'),                                                      // 7 地面冲击波
    shard('ice','-14px','-12px'),                                      // 8 冰晶
    shard('gl','14px','-10px'),                                        // 9 玻璃渣
    shard('stone','8px','6px'),                                        // 10 石化碎屑
    put('smoke'),                                                      // 11 变形烟雾
    put('crack'),                                                      // 12 石化裂纹
    put('staticring'),                                                 // 13 静电环
    put('bolt', e=>{e.style.width='120px';e.style['--rot']='15deg';}), // 14 闪电
    put('bolt su', e=>{e.style.width='90px';e.style['--rot']='-20deg';}), // 15 紫电弧
    put('ember', e=>{e.style['--dx']='-4px';}),                        // 16 余烬
    put('mote', e=>{e.style['--dx']='4px';}),                          // 17 治疗光点
    put('pillar'),                                                     // 18 光柱
    put('thread', e=>{e.style.width='110px';e.style['--rot']='25deg';}), // 19 吸血丝线
    put('chip', e=>{e.style.background='#ffb14a';e.style['--dx']='-10px';e.style['--dy']='18px';}), // 20 碎屑
    pt('#ff6b81','-20px','-6px'),                                      // 21 四禧丸子（阵营暖红）
    pt('#6b5bd6','12px','-16px'),                                      // 22 夜幕（阵营冷紫）
    pt('#6bffab','20px','10px'),                                       // 23 森之国（阵营薄荷绿）
    put('charge'),                                                     // 24 施法蓄力预兆
    put('staticring s3'),                                              // 25 3★ 分层（放大+金晕）
    put('crit gold'),                                                  // 26 专属暴击金色爆闪
  ];
  // 铺在我方半区空行（4~6 行），每格一个原型，间隔铺开避免重叠
  items.forEach((fn, i) => { const col = 1 + (i % 7), row = 4 + Math.floor(i / 7); fn(col, row); });
  // 另取一枚存活棋子演示 dying 灰化 + squash 弹性 + 暴击大数字
  const bu = window.__bu || [];
  const mine = bu.filter(u => u.side === 0 && u.hp > 0);
  if (mine.length) {
    const u = mine[0], el = document.querySelector('#unitLayer [data-uid="'+u.uid+'"]');
    if (el) deathFx(el, document.getElementById('unitLayer'));
    if (mine[1]) { const u2 = mine[1];
      const p2 = unitVisual(u2); fxNode('smoke', p2.x, p2.y, 2600);
      const e2 = document.querySelector('#unitLayer [data-uid="'+u2.uid+'"]');
      if (e2) e2.classList.add('squash');
      dmgPopup(u2, u2, '⚡暴击×4', 'crit');
      const f = bu.find(v => v.side === 1 && v.hp > 0);
      if (f) { fireProjectile(u2, f, '#c77dff'); }
    }
  }
  return items.length;
}"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel='msedge')
    pg = b.new_page(viewport={'width': 1400, 'height': 900}, device_scale_factor=2)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8081/index.html')
    pg.wait_for_timeout(800)
    pg.evaluate("""() => {
      const r = document.getElementById('resumeOv');
      if (r && !r.classList.contains('hidden')) document.getElementById('resumeNo').click();
      const o = document.getElementById('overlay');
      if (o && !o.classList.contains('hidden')) document.getElementById('ovBtn').click();
    }""")
    pg.wait_for_timeout(300)
    pg.evaluate(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bot_strategy.js'), encoding='utf8').read())
    # 先滚几回合攒满人口，画面更接近真实后期
    for i in range(14):
        pg.evaluate("() => { if(S.phase==='prep'){ botPrep(); startBattle(); } }")
        pg.wait_for_timeout(2500)
        if pg.evaluate("() => S.phase") == 'over':
            pg.evaluate("() => { newGame(); }")
    pg.evaluate("() => { if(S.phase==='prep'){ botPrep(); startBattle(); } }")
    pg.wait_for_timeout(900)
    br = pg.evaluate("() => { const r=document.getElementById('board').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }")
    n = pg.evaluate(GALLERY)
    half_h = br['h'] * 0.52
    board_clip = {'x': br['x'], 'y': br['y'] + half_h, 'width': br['w'], 'height': br['h'] - half_h}
    pg.screenshot(path=os.path.join(OUT, 'gallery_0ms.png'), clip=board_clip)
    pg.wait_for_timeout(160)
    pg.screenshot(path=os.path.join(OUT, 'gallery_160ms.png'), clip=board_clip)
    pg.wait_for_timeout(140)
    pg.screenshot(path=os.path.join(OUT, 'gallery_300ms.png'), clip=board_clip)
    print('gallery items:', n, 'errors:', errs[:3] if errs else 'none')
    b.close()
