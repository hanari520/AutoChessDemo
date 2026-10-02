"""Check real Web Audio voices, event cues and persisted mute without cloud writes."""
import ast,json,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
module=ast.parse(Path('arena/battle_fx_smoke.py').read_text(encoding='utf-8'))
script=next(ast.literal_eval(n.value) for n in module.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='script' for t in n.targets))
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],encoding='utf-8'))
with sync_playwright() as p:
 browser=p.chromium.launch();context=browser.new_context()
 context.route('**/api/arena/**',lambda route:route.abort())
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8082/arena.html',wait_until='networkidle')
 page.evaluate('(v)=>{localStorage.clear();localStorage.setItem("vc_async_arena_preview_v1",JSON.stringify(v))}',fixture)
 page.reload(wait_until='networkidle');page.evaluate('window.__sfxCount={};window.__sfxPlayed=0')
 page.locator('#rollBtn').click();page.wait_for_timeout(250)
 assert page.evaluate('window.__sfxCount.roll')==1
 page.locator('#replayBtn').click();page.locator('#pauseBattle').click();page.wait_for_timeout(200)
 assert page.evaluate('window.__sfxCount.battleStart')==1
 for event in fixture['lastBattle']['battle']['events'][1:]:
  page.wait_for_timeout(140);page.locator('#nextEvent').click()
 counts=page.evaluate('window.__sfxCount')
 for key in ['slash','shield','spellZap','die','cast','heal']:
  assert counts.get(key,0)>0,(key,counts)
 assert counts.get('win',0)+counts.get('lose',0)+counts.get('settle',0)>0
 page.locator('#continueBtn').click();page.locator('#resultNext').click()
 page.locator('#sfxBtn').click();assert page.evaluate('localStorage.getItem("vc_sfx")')=='0'
 count=page.evaluate('window.__sfxPlayed');page.locator('#rollBtn').click();page.wait_for_timeout(200)
 assert page.evaluate('window.__sfxPlayed')==count
 page.reload(wait_until='networkidle');assert page.locator('#sfxBtn').get_attribute('aria-pressed')=='false'
 page.evaluate('window.__sfxPlayed=0');page.locator('#sfxBtn').click();page.wait_for_timeout(200)
 assert page.evaluate('window.__sfxPlayed')>0
 assert not errors,errors
 browser.close()
print(json.dumps({'ok':True,'checks':['classic audio loaded','refresh','battle nodes','result','mute stops playback','mute persists','gesture resumes audio'],'cues':sorted(counts)}))
