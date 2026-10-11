"""Homepage/navigation/SW smoke checks in a dedicated browser profile."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE='http://127.0.0.1:8086'
OUT=Path('out/game-library')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    ctx=browser.new_context(viewport={'width':1440,'height':900})
    page=ctx.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE+'/classic.html')
    entry=page.locator('#flowHome a[href="./index.html"]')
    expect(entry).to_be_visible(timeout=15000)
    # These are fixtures in this isolated profile, not the user's stored saves.
    fixtures={key:json.dumps({'integrationFixture':key}) for key in ['vc_save4','vc_daily3','vc_arena3','star_survivor_v1']}
    page.evaluate('(items)=>{for(const [key,value] of Object.entries(items))localStorage.setItem(key,value)}',fixtures)
    page.screenshot(path=str(OUT/'legacy-home-desktop.png'),full_page=True)
    entry.click()
    expect(page.locator('.game-card')).to_have_count(8)
    page.locator('.play-link[data-game=studio-manager]').click()
    expect(page.locator('[data-action=start]')).to_be_enabled()
    page.locator('[data-action=start]').click()
    expect(page.locator('#save-status')).to_contain_text('已保存')
    page.reload()
    expect(page.locator('[data-action=show]')).to_be_visible()
    preserved=page.evaluate('(keys)=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]))',list(fixtures))
    assert preserved==fixtures,'New demo overwrote a legacy storage key'
    page.locator('.brand').click()
    expect(page.locator('.play-link[data-game=studio-manager]')).to_have_text('继续游戏↗')
    page.locator('.play-link[data-game=classic]').click()
    expect(page.locator('#flowHome')).to_be_visible(timeout=15000)
    assert not errors,errors
    results=['Legacy homepage loads and links to the game library','Homepage → library → G1 → refresh → library → homepage navigation passes','Four legacy save-key fixtures remain byte-for-byte unchanged','No pageerror on navigation smoke path']
    ctx.close()
    # P05 fixture only: cached module/catalog can record a local reward offline.
    # This does not claim that the game page itself can reload offline.
    ctx=browser.new_context()
    page=ctx.new_page()
    page.goto(BASE+'/games/studio-manager/')
    expect(page.locator('[data-action=start]')).to_be_enabled()
    page.evaluate('''async()=>{
        const {createCollectibles}=await import('/library/collectibles.mjs');
        const rewards=await (await fetch('/library/rewards.json')).json();
        window.offlineFixture=createCollectibles({rewards});
    }''')
    ctx.set_offline(True)
    grant=page.evaluate('''async()=>offlineFixture.recordCompletion({
        gameId:'studio-manager',runId:'offline-fixture',completionId:'offline-fixture:complete',
        rulesVersion:'1',outcome:'test-fixture',rewardIds:['studio-first'],verification:'local'
    })''')
    assert grant['ok'],grant
    ctx.set_offline(False)
    page.goto(BASE+'/library/')
    expect(page.locator('.souvenir')).to_have_count(1)
    expect(page.locator('.souvenir')).to_contain_text('首场开演')
    results.append('P05 cached-module fixture: local reward records while offline and survives page reopen')
    (OUT/'legacy-browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print('\n'.join(results))
    browser.close()
