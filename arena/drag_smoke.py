"""Exercise selection recovery and pointer dragging without cloud writes."""
import json, subprocess
from playwright.sync_api import sync_playwright
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createRun,act,ROSTER} from './arena/core.mjs';const r=createRun('drag');r.shop[0]={id:ROSTER[0].id};act(r,{type:'buy',slot:0,to:0});r.shop[0]={id:ROSTER[1].id};act(r,{type:'buy',slot:0,to:1});r.shop[0]={id:ROSTER[2].id};r.shop[1]={id:ROSTER[0].id};r.foods[0]={id:'snack'};r.gold=30;console.log(JSON.stringify({run:r,lastBattle:null}));"],text=True))
with sync_playwright() as p:
 browser=p.chromium.launch()
 for touch,width,height in [(False,1440,1000),(True,390,844)]:
  context=browser.new_context(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/api/arena/**',lambda route:route.abort())
  page.add_init_script('localStorage.setItem("vc_async_arena_preview_v1",'+json.dumps(json.dumps(fixture))+');')
  page.goto('http://127.0.0.1:8082/arena.html',wait_until='networkidle')
  page.wait_for_function('!document.querySelector("#rollBtn").disabled')
  def card(zone,slot):return page.locator(f'[data-zone="{zone}"][data-slot="{slot}"]')
  def state():return page.evaluate('JSON.parse(localStorage.getItem("vc_async_arena_preview_v1")).run')
  card('shop',0).click();card('team',0).click()
  assert card('team',0).evaluate('(e)=>e.classList.contains("selected")')
  assert not page.locator('#sellBtn').is_disabled()
  assert state()['gold']==30
  card('team',0).click();assert page.locator('#sellBtn').is_disabled()
  session=context.new_cdp_session(page)
  def drag(source,target):
   source.scroll_into_view_if_needed();target.scroll_into_view_if_needed()
   a=source.bounding_box();b=target.bounding_box()
   x,y=a['x']+a['width']/2,a['y']+a['height']/2
   tx,ty=b['x']+b['width']/2,b['y']+b['height']/2
   if touch:
    def send(kind,x,y):session.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind=='touchEnd' else [{'x':x,'y':y}]})
    send('touchStart',x,y)
    for i in range(1,11):send('touchMove',x+(tx-x)*i/10,y+(ty-y)*i/10)
    send('touchEnd',tx,ty)
   else:
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(tx,ty,steps=10);page.mouse.up()
   page.wait_for_timeout(500)
   assert page.locator('.drag-token').count()==0
  drag(card('shop',0),card('team',2));assert state()['gold']==27 and state()['team'][2]
  drag(card('shop',1),card('team',0));assert state()['gold']==24 and state()['team'][0]['xp']==1
  hp=state()['team'][0]['hp'];drag(card('foods',0),card('team',0));assert state()['gold']==21 and state()['team'][0]['hp']==hp+1
  uid=state()['team'][0]['uid'];drag(card('team',0),card('team',2));assert state()['team'][2]['uid']==uid
  old=state();drag(card('shop',2),page.locator('#sellBtn'));assert state()==old
  drag(card('team',2),page.locator('#sellBtn'));assert state()['team'][2] is None and state()['gold']>21
  assert not errors,errors
  context.close()
 browser.close()
print(json.dumps({'ok':True,'input':['mouse','touch'],'checks':['selection recovery','deselect','buy','merge','food','insert','invalid drop','sell']}))
