"""Check real sprite playback and all 50 lazy-loaded characters in Chromium."""
import json
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'out/survival/animations'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:8081'


def ready(page):
    page.wait_for_function('window.StarSurvivor && document.querySelectorAll(".hero-card").length === 50')


def state(page):
    return page.evaluate('''() => {const p=StarSurvivor.scene.player;return {
      key:p.anims.currentAnim.key,frame:p.anims.currentFrame.index,x:p.x,y:p.y,
      flip:p.flipX,radius:p.body.radius,scale:p.scaleX};}''')


def run_test():
    errors, failures, verified = [], [], []
    samples = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-webgl'])
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda r: failures.append(r.url) if r.status >= 400 and '/survival/' in r.url else None)
        page.goto(BASE + '/survival.html')
        ready(page)
        assert page.evaluate('StarSurvivor.scene.textures.getTextureKeys().filter(k=>k.startsWith("actor-")).length') == 6
        # Every character is decoded by Phaser, without accumulating 300 GPU textures.
        roster = json.loads((ROOT / 'survival/roster.json').read_text(encoding='utf-8'))
        page.locator('#panel').evaluate('(panel)=>panel.close()')
        for index, hero in enumerate(roster):
            info = page.evaluate('''async id => {
              const s=StarSurvivor.scene,A=SurvivalActors,m=await (await fetch('survival/animations.json?v=1')).json();
              await A.load(s,m,[id]);s.setActor(s.player,id,.36);A.retain(s,m,[id]);
              const specs=m.characters[id].actions;let frames=0;
              for(const [action,spec] of Object.entries(specs)){
                const name=A.key(id,action),anim=s.anims.get(name);if(anim.frames.length!==spec.count)throw Error(name+' frame count');
                for(const af of anim.frames){const f=af.frame;if(f.cutWidth!==256||f.cutHeight!==256)throw Error(name+' frame dimensions');frames++;}
              }
              return {id,frames,textures:s.textures.getTextureKeys().filter(k=>k.startsWith('actor-')).length};
            }''', hero['id'])
            assert info['frames'] == 44 and info['textures'] == 6, info
            verified.append(info)
            if index % 5 == 0:
                page.wait_for_timeout(170)
                clip = page.evaluate('''() => {const s=StarSurvivor.scene,c=s.cameras.main,p=s.player;
                  return {x:(p.x-c.worldView.x)*c.zoom-65,y:(p.y-c.worldView.y)*c.zoom-85,width:130,height:140};}''')
                file = OUT / (hero['id'] + '.png')
                page.screenshot(path=str(file), clip=clip)
                samples.append((hero['name'], file))
            print(f'{hero["id"]}: {info["frames"]} browser frames, six retained sheets', flush=True)
        page.reload()
        ready(page)
        page.evaluate("localStorage.setItem('vc_save4','animation-test-protected')")
        page.locator('#start').click()
        page.wait_for_function('StarSurvivor.state?.phase === "battle"')
        page.keyboard.down('d')
        page.wait_for_timeout(180)
        first = state(page)
        page.wait_for_timeout(200)
        second = state(page)
        page.keyboard.up('d')
        assert first['key'] == second['key'] == 'actor-ein-move', (first, second)
        assert first['frame'] != second['frame'] and second['x'] > first['x'] + 15, (first, second)
        page.wait_for_function('StarSurvivor.scene.player.anims.currentAnim.key === "actor-ein-idle"')
        page.keyboard.down('a')
        page.wait_for_timeout(180)
        assert state(page)['flip']
        page.keyboard.up('a')
        page.locator('#pause').click()
        frozen = state(page)
        page.wait_for_timeout(500)
        assert state(page) == frozen
        page.locator('#resume').click()
        page.evaluate('StarSurvivor.scene.skills.shield=0;StarSurvivor.scene.hurt(2)')
        assert state(page)['key'] == 'actor-ein-hit'
        page.wait_for_function('StarSurvivor.scene.player.anims.currentAnim.key === "actor-ein-idle"')
        assert state(page)['radius'] == frozen['radius'] == 36
        page.wait_for_function('StarSurvivor.scene.enemies.countActive()>0')
        page.evaluate('''() => {const s=StarSurvivor.scene,e=s.enemies.getChildren().find(e=>e.active);
          s.spawnAt=999;e.body.reset(s.player.x+85,s.player.y);e.hp=10000;e.speed=0;
          s.weaponSprites[0].next=s.sim;}''')
        page.wait_for_function('StarSurvivor.scene.player.anims.currentAnim.key === "actor-ein-attack"')
        page.screenshot(path=str(OUT / 'desktop-attack.png'))
        page.evaluate('''() => {const s=StarSurvivor.scene;s.invulnerableUntil=0;s.hurt(10000);}''')
        assert state(page)['key'] == 'actor-ein-death'
        page.wait_for_timeout(850)
        assert state(page)['frame'] == 6
        assert page.evaluate('StarSurvivor.scene.player.anims.isPlaying') is False
        assert page.evaluate("localStorage.getItem('vc_save4')") == 'animation-test-protected'
        page.locator('#again').click()
        # Real wand attack and a following support character exercise cast and companion poses.
        page.evaluate('''() => {const C=StarSurvivor.core,s=C.newRun({id:'yua',job:'法师'},0,5);
          s.phase='shop';s.wave=2;s.companions=['chiharu','ein','rinco'];localStorage.setItem(C.SAVE_KEY,JSON.stringify(C.snapshot(s)));}''')
        page.reload()
        ready(page)
        page.locator('#continue').click()
        page.locator('#next').click()
        page.wait_for_function('StarSurvivor.state.phase === "battle"')
        assert page.evaluate('StarSurvivor.scene.partnerSprites.length') == 3
        assert page.evaluate('StarSurvivor.scene.textures.getTextureKeys().filter(k=>k.startsWith("actor-")).length') == 24
        page.wait_for_function('StarSurvivor.scene.enemies.countActive()>0')
        page.evaluate('''() => {const s=StarSurvivor.scene,e=s.enemies.getChildren().find(e=>e.active);
          s.spawnAt=999;e.body.reset(s.player.x+200,s.player.y);e.hp=10000;e.speed=0;
          s.weaponSprites[0].next=s.sim;s.partnerSprites[0].next=s.sim;}''')
        page.wait_for_function('StarSurvivor.scene.player.anims.currentAnim.key === "actor-yua-cast"')
        page.wait_for_function('StarSurvivor.scene.partnerSprites[0].anims.currentAnim.key.includes("cast") || StarSurvivor.scene.partnerSprites[0].anims.currentAnim.key.includes("attack")')
        page.screenshot(path=str(OUT / 'desktop-cast-companion.png'))
        page.locator('#pause').click()
        partner_frames = page.evaluate('StarSurvivor.scene.partnerSprites.map(p=>p.anims.currentFrame.index)')
        page.wait_for_timeout(500)
        assert page.evaluate('StarSurvivor.scene.partnerSprites.map(p=>p.anims.currentFrame.index)') == partner_frames
        context.close()
        # A missing sheet cannot start a half-loaded battle; retry succeeds when restored.
        recovery = browser.new_context(viewport={'width': 1280, 'height': 800})
        retry = recovery.new_page()
        retry.on('pageerror', lambda error: errors.append(str(error)))
        retry.goto(BASE + '/survival.html')
        ready(retry)
        retry.route('**/survival/assets/animations/yua/cast.webp', lambda route: route.abort())
        retry.locator('[data-hero="yua"]').click()
        retry.locator('#start').click()
        retry.wait_for_function('document.querySelector("#notice").textContent.includes("动作素材加载失败")')
        assert retry.evaluate('StarSurvivor.state') is None
        assert retry.locator('#start').is_enabled()
        assert retry.evaluate('StarSurvivor.scene.textures.getTextureKeys().filter(k=>k.startsWith("actor-yua-")).length') == 0
        retry.unroute('**/survival/assets/animations/yua/cast.webp')
        retry.locator('#start').click()
        retry.wait_for_function('StarSurvivor.state?.phase === "battle"')
        assert state(retry)['key'].startswith('actor-yua-')
        recovery.close()
        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        phone = mobile.new_page()
        phone.on('pageerror', lambda error: errors.append(str(error)))
        phone.goto(BASE + '/survival.html')
        ready(phone)
        phone.locator('[data-hero="yua"]').tap()
        phone.locator('#start').tap()
        phone.wait_for_function('StarSurvivor.state?.phase === "battle"')
        phone.evaluate('StarSurvivor.scene.pad={x:1,y:0}')
        phone.wait_for_timeout(150)
        a = state(phone)
        phone.wait_for_timeout(200)
        b = state(phone)
        assert a['key'] == b['key'] == 'actor-yua-move' and a['frame'] != b['frame']
        phone.screenshot(path=str(OUT / 'mobile-move.png'))
        assert not phone.evaluate('document.documentElement.scrollWidth>innerWidth')
        mobile.close()
        browser.close()
    # A quick visual overview of ten distinct characters, captured from the real canvas.
    sheet = Image.new('RGB', (650, 320), '#ecf2ed')
    draw = ImageDraw.Draw(sheet)
    for index, (_, file) in enumerate(samples):
        with Image.open(file) as tile:
            x, y = index % 5 * 130, index // 5 * 160
            sheet.paste(tile.convert('RGB'), (x, y))
            draw.text((x + 6, y + 141), file.stem, fill='#263b37')
    sheet.save(OUT / 'roster-contact.png')
    assert not errors and not failures, (errors, failures)
    report = {'characters': len(verified), 'frames': sum(v['frames'] for v in verified),
              'maxRetainedSheets': max(v['textures'] for v in verified),
              'moveAttackCastHitDeathPause': True, 'threeAnimatedCompanions': True,
              'loadFailureRetry': True, 'mobilePlayback': True, 'errors': errors, 'failedAssets': failures}
    (OUT / 'verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    run_test()
