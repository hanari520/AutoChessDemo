"""Two independent browsers verify room ownership, leaving and closed-room recovery."""
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,channel='msedge')
    contexts=[browser.new_context() for _ in range(2)]
    pages=[context.new_page() for context in contexts]
    errors=[]
    for i,page in enumerate(pages):
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8081/online.html')
        page.locator('.advanced-settings summary').click()
        page.locator('#apiBase').fill(os.environ.get('ONLINE_TEST_API','http://127.0.0.1:3017'))
        page.locator('#playerName').fill(['房主','接任玩家'][i])
    owner,guest=pages
    owner.locator('#createBtn').click()
    owner.locator('#lobbySection').wait_for(state='visible')
    code=owner.locator('#roomCode').inner_text()
    guest.locator('#roomCodeInput').fill(code)
    guest.locator('#joinBtn').click()
    guest.locator('#lobbySection').wait_for(state='visible')
    owner.locator('#addBotBtn').click()
    owner.wait_for_function('document.querySelectorAll(".bot-badge").length===1')
    owner.locator('#leaveBtn').click()
    owner.locator('#entryScreen').wait_for(state='visible')
    assert owner.evaluate('localStorage.getItem("star-stage-online-session-v1")') is None
    guest.locator('#addBotBtn').wait_for(state='visible')
    assert '房主' in guest.locator('#lobbySeats .seat.mine .seat-status').inner_text()
    guest.locator('#addBotBtn').click()
    guest.wait_for_function('document.querySelectorAll(".bot-badge").length===2')
    guest.locator('#leaveBtn').click()
    guest.locator('#entryScreen').wait_for(state='visible')
    response=guest.request.post(os.environ.get('ONLINE_TEST_API','http://127.0.0.1:3017')+f'/api/rooms/{code}/join',data={'name':'后来玩家'})
    assert response.status==404
    # The room can disappear on the server before a player clicks return.
    owner.locator('#createBtn').click()
    owner.locator('#lobbySection').wait_for(state='visible')
    session=owner.evaluate('JSON.parse(localStorage.getItem("star-stage-online-session-v1"))')
    response=owner.request.post(session['api']+f"/api/rooms/{session['code']}/leave",data={'token':session['token']})
    assert response.status==200
    owner.wait_for_timeout(1000)
    owner.locator('#leaveBtn').click()
    owner.locator('#entryScreen').wait_for(state='visible')
    assert not errors,errors
    browser.close()
    print('PASS independent clients: ownership UI transfer, released seat, bot-only cleanup, session removal and returning from a deleted room; errors:',errors)
