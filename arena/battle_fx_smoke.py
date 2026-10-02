"""Inspect actual generated battle events without publishing test fixtures to CloudBase."""
import json, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
script="""
import {createRun,battle} from './arena/core.mjs';
const u=(uid,id,atk,hp)=>({uid,id,atk,hp,level:1,xp:0,perk:null});
const a=[u('a0','goutan',2,3),u('a1','songlv',3,4),u('a2','kouichi',3,10),u('a3','pako',2,8),u('a4','kanban',4,12)];
const b=[u('b0','yua',2,12),u('b1','aza',3,10),u('b2','pako',2,7),u('b3','diansu',2,9),u('b4','nox',3,8)];
console.log(JSON.stringify({run:createRun('fx-preview'),lastBattle:{battle:battle(a,b,'fx-preview'),opponent:{name:'反馈验证队伍',source:'training'}}}));
"""
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],encoding='utf-8'))
output=Path('F:/demo/workspace/sap-arena-preview')
with sync_playwright() as p:
 browser=p.chromium.launch()
 for width,height in [(1440,1000),(390,844)]:
  context=browser.new_context(viewport={'width':width,'height':height})
  context.route('**/api/arena/**',lambda route:route.abort())
  context.add_init_script('localStorage.clear();localStorage.setItem("vc_async_arena_preview_v1",'+json.dumps(json.dumps(fixture,ensure_ascii=False),ensure_ascii=False)+');')
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8082/arena.html',wait_until='networkidle')
  page.locator('#replayBtn').click();page.locator('#pauseBattle').click()
  seen=set()
  positions=[]
  page.evaluate("window.__retainedUnit = document.querySelector('[data-uid=a2]')")
  for i,event in enumerate(fixture['lastBattle']['battle']['events']):
   if i:page.locator('#nextEvent').click()
   if event['type'] not in seen and event['type'] in ['attack','shield','support','summon']:
    page.wait_for_timeout(700)
    page.wait_for_function("[...document.querySelectorAll('.battle-unit[data-uid] img')].every(i=>i.complete&&i.naturalWidth>0)")
    page.screenshot(path=str(output/f'fx-{width}-{event["type"]}.png'))
   seen.add(event['type'])
   geometry=page.evaluate('''() => Object.fromEntries(['battleDialog','battleProgress','battleLog','battleText'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,[r.x,r.y,r.width,r.height]]}))''')
   positions.append(geometry)
   if any(u and u['uid']=='a2' for u in event['a']):
    assert page.evaluate("window.__retainedUnit === document.querySelector('[data-uid=a2]')"), 'unit node recreated'
   if len(positions)>1:
    for id in geometry:
     assert all(abs(a-b)<1 for a,b in zip(geometry[id],positions[0][id])), (id,event['type'],geometry[id],positions[0][id])
   assert page.locator('#battleStep').inner_text().startswith(f'{i+1} /')
   assert page.evaluate("document.querySelector('#battleDialog').scrollWidth <= document.querySelector('#battleDialog').clientWidth")
  assert {'attack','shield','snipe','faint','summon','support','cleave','retaliate','buff','heal'} <= seen,seen
  assert page.locator('#continueBtn').is_visible()
  assert not errors,errors
  context.close()
 browser.close()
print(json.dumps({'ok':True,'events':len(fixture['lastBattle']['battle']['events']),'types':sorted(seen),'screens':['1440px','390px']}))
