import os
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='msedge')
    page=browser.new_page(viewport={'width':1440,'height':900})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8081/online.html')
    page.locator('.advanced-settings summary').click()
    page.locator('#apiBase').fill(os.environ.get('ONLINE_TEST_API','http://127.0.0.1:3013'))
    page.locator('#playerName').fill('操作验收')
    page.locator('#createBtn').click();page.locator('#lobbySection').wait_for(state='visible')
    for n in range(7):
        page.locator('#addBotBtn').click()
        page.wait_for_function('(n)=>document.querySelectorAll(".bot-badge").length===n',arg=n+1)
    page.locator('#lobbyReadyBtn').click();page.locator('#gameSection').wait_for(state='visible')
    page.locator('#shopList [data-buy]:not([disabled])').first.click()
    page.locator('#benchGrid .unit-slot:not(.empty)').first.wait_for()
    page.locator('#boardGrid').click(position={'x':10,'y':10})
    page.keyboard.press('r')
    page.locator('#boardGrid .board-position.occupied').first.wait_for()
    page.locator('#autoEquipBtn').click()
    page.wait_for_function('document.querySelectorAll("#inventoryList .inventory-item").length===0')
    page.locator('#boardGrid .board-position.occupied').first.click()
    page.locator('#unequipBtn').click()
    page.locator('#inventoryList .inventory-item').first.wait_for()
    source=page.locator('#boardGrid .board-position.occupied').first
    page.evaluate('''window.dragTrace=[];for(const name of ['dragstart','dragover','drop','dragend'])document.addEventListener(name,e=>dragTrace.push([name,e.target.outerHTML?.slice(0,160)]),true)''')
    source.drag_to(page.locator('#benchGrid .unit-slot.empty').first)
    try: page.locator('#benchGrid .unit-slot:not(.empty)').first.wait_for(timeout=5000)
    except Exception:
        print(page.evaluate('({trace:dragTrace,toasts:document.querySelector("#toast")?.textContent,html:document.querySelector("#boardGrid .occupied")?.outerHTML})'))
        raise
    page.locator('#benchGrid .unit-slot:not(.empty)').first.drag_to(page.locator('#boardGrid .board-position.empty:not([disabled])').first)
    page.locator('#boardGrid .board-position.occupied').first.wait_for()
    page.locator('#inventoryList .inventory-item').first.drag_to(page.locator('#boardGrid .board-position.occupied').first)
    page.wait_for_function('document.querySelectorAll("#inventoryList .inventory-item").length===0')
    page.locator('#boardGrid .board-position.occupied').first.click(button='right')
    page.locator('#inventoryList .inventory-item').first.wait_for()
    page.keyboard.press('l');page.wait_for_function('document.querySelector("#lockShopBtn").getAttribute("aria-pressed")==="true"')
    page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'д',code:'KeyL',bubbles:true}))")
    page.wait_for_function('document.querySelector("#lockShopBtn").getAttribute("aria-pressed")==="false"')
    page.set_viewport_size({'width':390,'height':844})
    page.locator('[data-panel=equipment]').click()
    page.keyboard.press('l')
    assert page.locator('#lockShopBtn').get_attribute('aria-pressed')=='false','dialog must block hotkeys'
    assert page.locator('#autoEquipBtn').is_visible()
    page.locator('#matchPanelClose').click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    touch=page.context.new_cdp_session(page)
    touch.send('Emulation.setTouchEmulationEnabled',{'enabled':True,'maxTouchPoints':1})
    # Scroll the arena, as a player would, to put the bench above the fixed shop.
    page.evaluate('''()=>{const stage=document.querySelector('.match-stage'),bench=document.querySelector('#benchGrid'),shop=document.querySelector('.shop-panel');stage.scrollTop+=Math.max(0,bench.getBoundingClientRect().bottom-shop.getBoundingClientRect().top+12);}''')
    origin=page.locator('#boardGrid .board-position.occupied').first.bounding_box()
    destination=page.locator('#benchGrid .unit-slot.empty').first.bounding_box()
    x,y=origin['x']+origin['width']/2,origin['y']+origin['height']/2
    tx,ty=destination['x']+destination['width']/2,destination['y']+destination['height']/2
    touch.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    page.wait_for_timeout(420)
    assert page.locator('.online-drag-ghost').count()==1
    assert page.evaluate('([x,y])=>!!document.elementFromPoint(x,y)?.closest("#benchGrid")',[tx,ty]),'bench must be visible during touch drag'
    touch.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':tx,'y':ty}]})
    touch.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    page.locator('#benchGrid .unit-slot:not(.empty)').first.wait_for()
    assert page.locator('#boardGrid .occupied').count()==0
    assert page.locator('.online-drag-ghost').count()==0
    page.wait_for_timeout(450)
    touch.send('Emulation.setTouchEmulationEnabled',{'enabled':False})
    page.keyboard.press('r')
    page.locator('#boardGrid .occupied').first.wait_for()
    out=Path('out/online-parity-20260930');out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/'mobile-controls.png'))
    page.set_viewport_size({'width':1440,'height':900})
    page.screenshot(path=str(out/'desktop-controls.png'))
    page.locator('#boardGrid').click(position={'x':10,'y':10})
    page.keyboard.press('Space')
    page.wait_for_function('document.querySelector("#gameReadyBtn").disabled')
    assert page.locator('#autoEquipBtn').is_disabled()
    assert not errors,errors
    print('PASS keyboard deployment/shop lock, equip/unequip, drag board/bench/equipment, right click, mobile panels and overflow, ready guards; errors:',errors)
    browser.close()
