"""Local integration checks. Run from project root: python -X utf8 tools/game-library-browser.py."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:8086'
OUT = Path('out/game-library')
OUT.mkdir(parents=True, exist_ok=True)
checks = []

def check(value, label):
    assert value, label
    checks.append(label)

def settled(page):
    page.wait_for_function("!document.querySelector('main button[data-action]:disabled.primary') || document.querySelector('[data-action=finale-select]')")
    page.wait_for_timeout(70)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width, height in [(1440, 900), (390, 844)]:
        ctx = browser.new_context(viewport={'width': width, 'height': height}, accept_downloads=True)
        page = ctx.new_page()
        errors, failed = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('response', lambda r: failed.append(r.url) if r.status >= 400 else None)
        page.goto(BASE + '/library/')
        expect(page.locator('.game-card')).to_have_count(8)
        check(page.locator('.upcoming-item').count() == 6, f'{width}: future games have no entry links')
        page.screenshot(path=str(OUT / f'library-{width}.png'), full_page=True)
        page.locator('.play-link[data-game=studio-manager]').click()
        expect(page.locator('[data-action=start]')).to_be_enabled()
        page.screenshot(path=str(OUT / f'welcome-{width}.png'), full_page=True)
        page.locator('#sound').click()
        page.reload()
        expect(page.locator('#sound')).to_have_text('音效：开')
        page.locator('#sound').click()
        check(True, f'{width}: sound preference survives refresh')
        page.locator('[data-action=start]').click()
        expect(page.locator('#save-status')).to_contain_text('已保存')
        check(page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'{width}: no horizontal overflow')
        page.screenshot(path=str(OUT / f'planning-{width}.png'), full_page=True)
        page.locator('[data-action=program][data-id=duo]').click()
        expect(page.locator('[data-action=show]')).to_be_disabled()
        check('2' in page.locator('.preview').inner_text(), f'{width}: duo roster requirement explained in Chinese')
        page.locator('[data-action=program][data-id=talk]').click()

        for slot in range(12):
            if width == 390:
                page.locator('[data-action=tab][data-id=members]').click()
            # Rotate across one-member programs and members; duo requires two.
            ids = ['suiji', 'huize', 'kanban']
            selected = page.locator('[data-action=cast][aria-pressed=true]')
            while selected.count():
                selected.first.click()
                selected = page.locator('[data-action=cast][aria-pressed=true]')
            page.locator(f'[data-action=cast][data-id={ids[slot % 3]}]').click()
            if width == 390:
                page.locator('[data-action=tab][data-id=schedule]').click()
            page.locator(f'[data-action=program][data-id={"game" if slot%3==0 else "talk" if slot%3==1 else "lesson"}]').click()
            page.locator('[data-action=show]').click()
            expect(page.locator('[data-action=event]')).to_have_count(2)
            if slot == 0:
                title = page.locator('.modal-panel h1').inner_text()
                page.screenshot(path=str(OUT / f'event-{width}.png'), full_page=True)
                page.reload()
                expect(page.locator('.modal-panel h1')).to_have_text(title)
                check(True, f'{width}: event survives refresh unchanged')
                with page.expect_download() as download:
                    page.locator('#export').click()
                saved = OUT / f'event-save-{width}.json'
                download.value.save_as(str(saved))
                saved_doc = json.loads(saved.read_text(encoding='utf-8'))
                check(saved_doc['envelope']['payload']['phase'] == 'event', f'{width}: export captures event checkpoint')
            page.locator('[data-action=event]:enabled').last.click()
            expect(page.locator('[data-action=advance]')).to_be_enabled()
            if slot == 0:
                page.screenshot(path=str(OUT / f'result-{width}.png'), full_page=True)
                page.reload()
                expect(page.locator('[data-action=advance]')).to_be_enabled()
                check(True, f'{width}: result survives refresh')
            page.locator('[data-action=advance]').click()
        expect(page.locator('[data-action=finale-select]')).to_have_count(5)
        for program in ['game', 'talk', 'lesson']:
            page.locator(f'[data-action=finale-select][data-id={program}]').click()
        page.locator('[data-action=finale]').click()
        expect(page.locator('.collection')).to_contain_text('首场开演')
        page.screenshot(path=str(OUT / f'complete-{width}.png'), full_page=True)
        before = page.locator('.collection').inner_text()
        page.reload()
        expect(page.locator('.collection')).to_contain_text('首场开演')
        check(page.locator('.collection').inner_text() == before, f'{width}: rewards unchanged after refresh')
        check(True, f'{width}: whole campaign and reward refresh idempotency')
        revision_before = page.evaluate("async()=>{const m=await import('/library/storage.mjs');return (await m.loadSave('studio-manager')).value.revision}")
        completed_tab=ctx.new_page()
        completed_tab.goto(BASE + '/games/studio-manager/')
        expect(completed_tab.locator('.collection')).to_contain_text('首场开演')
        page.locator('[data-action=reward]').click()
        expect(page.locator('[data-action=new]')).to_be_enabled()
        revision_after = page.evaluate("async()=>{const m=await import('/library/storage.mjs');return (await m.loadSave('studio-manager')).value.revision}")
        check(revision_before == revision_after, f'{width}: completed tabs and reward retry do not rewrite save')
        completed_tab.close()
        page.on('dialog', lambda d: d.accept())
        page.locator('[data-action=new]').click()
        page.locator('[data-action=start]').click()
        expect(page.locator('[data-action=show]')).to_be_enabled()
        fresh=page.evaluate("async()=>{const m=await import('/library/storage.mjs');return (await m.loadSave('studio-manager')).value.payload}")
        check(fresh['phase']=='planning' and fresh['history']==[], f'{width}: independent new campaign starts at slot one')

        page.locator('a[href="../../index.html"]').first.click()
        expect(page.locator('.souvenir')).to_have_count(3 if '全场最佳' in before else 2)
        # Restore the exported event save through the visible import control.
        page.locator('.play-link[data-game=studio-manager]').click()
        expect(page.locator('[data-action=show]')).to_be_enabled()
        page.locator('#import').set_input_files(str(OUT / f'event-save-{width}.json'))
        page.wait_for_timeout(500)
        expect(page.locator('[data-action=event]')).to_have_count(2)
        check(True, f'{width}: JSON import restores event safely')
        # Separate tab, same IndexedDB: stale writer must not overwrite.
        other = ctx.new_page()
        other.goto(BASE + '/games/studio-manager/')
        expect(other.locator('[data-action=event]')).to_have_count(2)
        page.locator('[data-action=event]:enabled').last.click()
        expect(page.locator('[data-action=advance]')).to_be_enabled()
        other.locator('[data-action=event]:enabled').last.click()
        expect(other.locator('#save-status')).to_contain_text('保存失败')
        check(other.locator('[data-action=advance]').is_disabled(), f'{width}: stale tab is blocked instead of overwriting')
        check(not errors, f'{width}: no console errors: {errors}')
        check(not failed, f'{width}: no failed assets: {failed}')
        ctx.close()
    # Exercise the production IndexedDB recovery path with three broken records.
    seed_save = json.loads((OUT / 'event-save-1440.json').read_text(encoding='utf-8'))['envelope']
    for kind in ['malformed', 'future-version', 'bad-payload']:
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()
        page.goto(BASE + '/games/studio-manager/')
        expect(page.locator('[data-action=start]')).to_be_enabled()
        broken = json.loads(json.dumps(seed_save))
        if kind == 'malformed':
            broken = {'revision': 7, 'damage': 'broken-envelope'}
        elif kind == 'future-version':
            broken['saveVersion'] = '2'
        else:
            del broken['payload']['currentShow']['memberIds']
        page.evaluate('''async envelope => {
            const db = await new Promise((resolve,reject) => {
                const r = indexedDB.open('vtlib-game-library',1);
                r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
            });
            await new Promise((resolve,reject) => {
                const tx=db.transaction('gameSaves','readwrite');
                tx.objectStore('gameSaves').put({key:'vtlib:studio-manager:main',gameId:'studio-manager',slotId:'main',envelope});
                tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
            });db.close();
        }''', broken)
        page.reload()
        expect(page.locator('#save-status')).to_contain_text('读取失败')
        expect(page.locator('[data-action=start]')).to_be_disabled()
        with page.expect_download() as download:
            page.locator('#export').click()
        download.value.save_as(str(OUT / f'recovery-{kind}.json'))
        check((OUT / f'recovery-{kind}.json').stat().st_size > 0, f'{kind}: damaged original remains exportable')
        page.on('dialog', lambda d: d.accept())
        page.locator('#import').set_input_files(str(OUT / 'event-save-1440.json'))
        expect(page.locator('[data-action=event]')).to_have_count(2)
        quarantined = page.evaluate('''async () => {
            const db=await new Promise(resolve=>{const r=indexedDB.open('vtlib-game-library',1);r.onsuccess=()=>resolve(r.result)});
            const count=await new Promise(resolve=>{const r=db.transaction('corruptSaves','readonly').objectStore('corruptSaves').count();r.onsuccess=()=>resolve(r.result)});
            db.close();return count;
        }''')
        check(quarantined >= 1, f'{kind}: confirmed import restores playable save and retains quarantine')
        ctx.close()
    # A browser without IndexedDB can still explicitly export an in-memory game.
    ctx = browser.new_context(accept_downloads=True)
    ctx.add_init_script("Object.defineProperty(window,'indexedDB',{value:undefined})")
    page = ctx.new_page()
    page.goto(BASE + '/games/studio-manager/')
    expect(page.locator('[data-action=start]')).to_be_enabled()
    page.locator('[data-action=start]').click()
    expect(page.locator('#save-status')).to_contain_text('保存失败')
    with page.expect_download() as download:
        page.locator('#export').click()
    download.value.save_as(str(OUT / 'memory-backup.json'))
    check(json.loads((OUT / 'memory-backup.json').read_text(encoding='utf-8'))['envelope']['payload']['phase'] == 'planning', 'storage unavailable: honest failure status and memory export')
    ctx.close()
    browser.close()

(OUT / 'browser-results.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding='utf-8')
print('\n'.join(checks))
print(f'PASS: {len(checks)} browser checks')
