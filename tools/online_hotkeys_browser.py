"""Exercise classic keyboard actions against a real local online room server."""
import json
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    def room():
        page = browser.new_page(viewport={'width':1440,'height':900})
        sent, acknowledged = [], []
        def socket(ws):
            ws.on('framesent', lambda frame: sent.append(json.loads(frame)))
            ws.on('framereceived', lambda frame: acknowledged.append(json.loads(frame)))
        page.on('websocket', socket)
        page.goto('http://127.0.0.1:8081/online.html')
        page.locator('.advanced-settings summary').click()
        page.locator('#apiBase').fill(os.environ.get('ONLINE_TEST_API','http://127.0.0.1:3015'))
        page.locator('#playerName').fill('快捷键验收')
        page.locator('#createBtn').click()
        page.locator('#lobbySection').wait_for(state='visible')
        for n in range(7):
            page.locator('#addBotBtn').click()
            page.wait_for_function('(n)=>document.querySelectorAll(".bot-badge").length===n',arg=n+1)
        page.locator('#lobbyReadyBtn').click()
        page.locator('#gameSection').wait_for(state='visible')
        return page, sent, acknowledged
    def key(page, sent, acknowledged, key, action):
        before = len(sent)
        page.keyboard.press(key)
        page.wait_for_timeout(250)
        command = next((m for m in sent[before:] if m.get('type')=='action'),None)
        assert command and command['action']['type']==action,(key,sent[before:])
        assert any(m.get('type')=='ack' and m.get('id')==command['id'] for m in acknowledged),(key,acknowledged[-3:])
    page, sent, ack = room()
    key(page,sent,ack,'f','buyXp')
    assert page.locator('#playerStats .stat').nth(1).locator('b').inner_text()=='0'
    page.close()
    for alias in ['e','x','Delete']:
        page, sent, ack = room()
        affordable=page.locator('#shopList .cost1:not([disabled]),#shopList .cost2:not([disabled]),#shopList .cost3:not([disabled])')
        affordable.first.click()
        page.locator('#benchGrid .unit-slot:not(.empty)').first.wait_for()
        key(page,sent,ack,'t','tidy')
        key(page,sent,ack,'d','reroll')
        key(page,sent,ack,'a','autoDeploy')
        page.locator('#boardGrid .occupied').first.click()
        key(page,sent,ack,alias,'sell')
        assert page.locator('#boardGrid .occupied').count()==0
        page.close()
    browser.close()
    print('PASS F experience, D refresh, T tidy, A deployment, E/X/Delete sales: server acknowledgements and resulting state')
