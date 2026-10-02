"""Check each new skill replay in isolated desktop/mobile browsers."""
import json, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
source="""
import {createRun,battle} from './arena/core.mjs';
const u=(id,atk=2,hp=20,extra={})=>({uid:id,id,atk,hp,level:1,xp:0,perk:null,...extra});
const pairs=[
 [[u('shadow',1,30),u('xuezhu'),u('tiandou'),u('diansu'),u('miyue')],[u('agari',2,50)]],
 [[u('mahiru',5,1,{level:3}),u('youyi',10),u('zeyin'),u('rinco'),u('kanban')],[u('agari',2,50)]],
 [[u('quanrong',5,30)],[u('agari',1,1),u('agari',1,3,{uid:'b2'}),u('agari',1,3,{uid:'b3'}),u('agari',1,10,{uid:'b4'})]],
 [[u('youyu',10),u('rinco',9,20,{level:3})],[u('agari',1,40)]],
 [[u('ein',1)],[u('agari',1,20)]],
 [[u('songlv',1,1),u('kanban'),u('miyue')],[u('agari',3,50)]]
];
console.log(JSON.stringify(pairs.map(([a,b])=>({run:createRun('skills-fx'),lastBattle:{battle:battle(a,b,'skills-fx'),opponent:{name:'技能配合展示',source:'training'}}}))));
"""
fixtures=json.loads(subprocess.check_output(['node','--input-type=module','-e',source],encoding='utf-8'))
seen=set(); output=Path('F:/demo/workspace/sap-arena-preview'); checked=0
with sync_playwright() as p:
 browser=p.chromium.launch()
 for width,height in [(1440,1000),(390,844)]:
  for f,fixture in enumerate(fixtures):
   context=browser.new_context(viewport={'width':width,'height':height})
   context.route('**/api/arena/**',lambda route:route.abort())
   context.add_init_script('localStorage.clear();localStorage.setItem("vc_async_arena_preview_v1",'+json.dumps(json.dumps(fixture,ensure_ascii=False),ensure_ascii=False)+');')
   page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto('http://127.0.0.1:8082/arena.html',wait_until='networkidle')
   if f==0:
    page.locator('#codexBtn').click();page.locator('#codexSearch').fill('镜像合演')
    assert page.locator('#codexGrid .codex-card').count()==3
    page.locator('#codexGrid .codex-card').first.click()
    assert '配合建议' in page.locator('#codexDetail').inner_text()
    page.locator('#closeCodex').click()
   page.locator('#replayBtn').click();page.locator('#pauseBattle').click();geometry=None
   for i,event in enumerate(fixture['lastBattle']['battle']['events']):
    if i: page.locator('#nextEvent').click()
    assert page.locator('#battleText').inner_text()==event['text']
    assert page.locator('#battleStep').inner_text().startswith(f'{i+1} /')
    current=page.evaluate("() => Object.fromEntries(['battleDialog','battleProgress','battleLog','battleText'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,[r.x,r.y,r.width,r.height]]}))")
    if geometry:
     for id in current: assert all(abs(a-b)<1 for a,b in zip(current[id],geometry[id])),(width,event['type'],id)
    else: geometry=current
    assert page.evaluate("document.querySelector('#battleDialog').scrollWidth <= document.querySelector('#battleDialog').clientWidth")
    if event['type'] not in ['start','attack','faint','end','summon']:
     assert '技能触发' not in page.locator('#eventBadge').inner_text()
     for actor in event.get('actors',[]):
      node=page.locator('[data-side="'+actor['side']+'"][data-uid="'+actor['uid']+'"] .skill-badge')
      if node.count(): assert node.first.is_visible()
    if f==0 and event['type']=='hurtGift' and i==3:
     page.screenshot(path=str(output/f'skills-chain-{width}.png'))
    seen.add(event['type']);checked+=1
   assert not errors,errors
   context.close()
 browser.close()
required={'copy','rearGrow','hurtGift','friendlyHit','knockout','faintGrow','summonTrain','weakening','relayAttack','hurtGrow','shield'}
assert required<=seen,required-seen
print(json.dumps({'ok':True,'checkedEvents':checked,'types':sorted(seen),'viewports':[1440,390]}))
