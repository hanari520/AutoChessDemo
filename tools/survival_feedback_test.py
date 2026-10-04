"""Real collision/FX tests for all six weapons, crowded combat, pause and mobile."""
import json
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'out/survival/feedback'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:8081'


def ready(page):
    page.wait_for_function('window.StarSurvivor && document.querySelectorAll(".hero-card").length === 50')


def checkpoint(page, weapons, companions=None, wave=4):
    page.evaluate('''args => {
      const C=StarSurvivor.core,s=C.newRun({id:'ein',job:'守护'},0,42);
      s.wave=args.wave;s.weapons=args.weapons.map(id=>({id,tier:1}));s.companions=args.companions;
      localStorage.setItem(C.SAVE_KEY,JSON.stringify(C.snapshot(s)));
    }''', {'weapons': weapons, 'companions': companions or [], 'wave': wave})
    page.reload()
    ready(page)
    page.locator('#continue').click()
    page.locator('#next').click()
    page.wait_for_function('StarSurvivor.state.phase === "battle"')
    page.evaluate('StarSurvivor.scene.spawnAt=999;StarSurvivor.scene.invulnerableUntil=999')


def run_test():
    errors, failures, weapons = [], [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-webgl'])
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('response', lambda r: failures.append(r.url) if r.status >= 400 and '/survival/' in r.url else None)
        page.goto(BASE + '/survival.html')
        ready(page)
        page.evaluate("localStorage.setItem('vc_save4','feedback-protected')")
        for weapon in ['blade', 'wand', 'bow', 'mic', 'fan', 'satellite']:
            checkpoint(page, [weapon])
            page.evaluate("StarSurvivor.scene.spawnEnemy('walker')")
            page.wait_for_function('StarSurvivor.scene.enemies.countActive()>0')
            page.evaluate('''weapon => {
              const s=StarSurvivor.scene,e=s.enemies.getChildren().find(e=>e.active),w=s.weaponSprites[0];
              const distance={blade:90,wand:190,bow:240,mic:110,fan:185,satellite:90}[weapon];
              e.body.reset(weapon==='satellite'?w.x:s.player.x+distance,weapon==='satellite'?w.y:s.player.y);
              e.hp=e.maxHp=1000;e.speed=0;window.feedbackTarget=e;w.next=s.sim;
            }''', weapon)
            before = OUT / f'{weapon}-before.png'
            page.screenshot(path=str(before))
            baseline = page.evaluate('StarSurvivor.scene.feedback.counts.hits')
            info = page.wait_for_function('''args => {
              const weapon=args.weapon;
              const s=StarSurvivor.scene,e=window.feedbackTarget,f=s.feedback,d=StarSurvivor.core.WEAPONS[weapon].damage;
              if(f.counts.hits<=args.baseline||!f.texts.some(t=>t.merge==='damage'))return false;
              return {weapon,hits:f.counts.hits,damage:1000-e.hp,baseDamage:d,numbers:f.texts.filter(t=>t.merge==='damage').length,
                bar:e.barUntil>s.sim,knock:e.knockUntil>s.sim,particles:f.particles.length,images:f.images.length,
                projectileKeys:s.shots.getChildren().map(p=>p.texture.key),bodyRadius:s.player.body.radius};
            }''', arg={'weapon': weapon, 'baseline': baseline}, polling='raf', timeout=10000).json_value()
            assert info['hits'] > 0 and info['damage'] > 0 and info['numbers'] > 0, info
            assert info['bar'] and info['knock'], info
            assert abs(info['damage'] / info['baseDamage'] - round(info['damage'] / info['baseDamage'])) < .001, info
            assert info['bodyRadius'] == 36
            if weapon in ['wand', 'bow', 'fan']:
                assert 'shot-' + weapon in info['projectileKeys'], info
            after = OUT / f'{weapon}-impact.png'
            page.screenshot(path=str(after))
            with Image.open(before) as a, Image.open(after) as b:
                assert ImageChops.difference(a.convert('RGB'), b.convert('RGB')).getbbox(), weapon
            weapons.append(info)
            print(json.dumps(info), flush=True)
        # A real full loadout and three supporters test budgets under sustained fire.
        checkpoint(page, ['blade', 'wand', 'bow', 'mic', 'fan', 'satellite'], ['yua', 'chiharu', 'rinco'], 10)
        page.evaluate('''() => {const s=StarSurvivor.scene;s.bossSpawned=true;
          for(let i=0;i<26;i++)s.spawnEnemy(i%4===0?'ranged':'walker');s.spawnEnemy('boss',true);}''')
        page.wait_for_function('StarSurvivor.scene.enemies.countActive()>=27')
        page.evaluate('''() => {const s=StarSurvivor.scene;
          s.enemies.getChildren().filter(e=>e.active).forEach((e,i)=>{
            const a=i*Math.PI*2/27,r=e.boss?240:95+(i%4)*40;
            e.body.reset(s.player.x+Math.cos(a)*r,s.player.y+Math.sin(a)*r);e.speed=0;
          });}''')
        page.wait_for_function('StarSurvivor.scene.feedback.counts.kills>0')
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / 'desktop-full-loadout.png'))
        peak = {}
        for _ in range(15):
            sample = page.evaluate('''() => ({...StarSurvivor.scene.feedback.active,voices:StarSurvivor.scene.feedback.audio.voices})''')
            for key, value in sample.items():
                peak[key] = max(value, peak.get(key, 0))
            page.wait_for_timeout(120)
        limits = page.evaluate('SurvivalFeedback.LIMITS')
        assert all(peak[key] <= value for key, value in limits.items()), peak
        assert peak['voices'] <= 8, peak
        page.locator('#pause').click()
        frozen = page.evaluate('''() => {const f=StarSurvivor.scene.feedback;return {
          clock:f.clock,particles:f.particles.map(p=>[p.age,p.x,p.y]),images:f.images.map(p=>[p.age,p.sprite.x,p.sprite.y]),
          texts:f.texts.map(p=>[p.age,p.sprite.x,p.sprite.y])};}''')
        page.wait_for_timeout(450)
        assert page.evaluate('''() => {const f=StarSurvivor.scene.feedback;return {
          clock:f.clock,particles:f.particles.map(p=>[p.age,p.x,p.y]),images:f.images.map(p=>[p.age,p.sprite.x,p.sprite.y]),
          texts:f.texts.map(p=>[p.age,p.sprite.x,p.sprite.y])};}''') == frozen
        page.locator('#less-fx').check()
        assert page.evaluate('StarSurvivor.scene.feedback.reduced')
        assert page.evaluate("localStorage.getItem('star_survivor_fx')") == 'light'
        page.locator('#resume').click()
        page.locator('#sound').click()
        assert page.evaluate('StarSurvivor.scene.feedback.audio.enabled') is False
        assert page.evaluate('StarSurvivor.scene.feedback.audio.voices') == 0
        page.evaluate('''() => {const s=StarSurvivor.scene;s.invulnerableUntil=0;s.skills.shield=0;s.hurt(5);}''')
        assert page.evaluate('Number(document.querySelector("#hurt-screen").style.opacity)') > 0
        page.wait_for_timeout(500)
        assert page.evaluate('Number(document.querySelector("#hurt-screen").style.opacity)') == 0
        # Actual kill pickup and level-up, without awarding currency from the test itself.
        page.wait_for_function('StarSurvivor.scene.drops.countActive()>0')
        page.evaluate('''() => {const s=StarSurvivor.scene;
          s.drops.getChildren().filter(d=>d.active).forEach(d=>d.body.reset(s.player.x,s.player.y));}''')
        page.wait_for_function('StarSurvivor.scene.feedback.counts.pickups>0')
        assert page.evaluate('StarSurvivor.state.coins') > 0
        assert page.evaluate('StarSurvivor.scene.feedback.counts.levels') > 0
        assert page.evaluate("localStorage.getItem('vc_save4')") == 'feedback-protected'
        page.evaluate('StarSurvivor.scene.elapsed=StarSurvivor.core.duration(StarSurvivor.state.wave)-.01')
        page.wait_for_function('StarSurvivor.state.phase!=="battle"')
        assert page.evaluate('StarSurvivor.scene.player.anims.timeScale') == 1
        assert page.evaluate('StarSurvivor.scene.feedback.active') == {'particles': 0, 'images': 0, 'texts': 0, 'rings': 0}
        context.close()
        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        phone = mobile.new_page()
        phone.on('pageerror', lambda e: errors.append(str(e)))
        phone.goto(BASE + '/survival.html')
        ready(phone)
        checkpoint(phone, ['blade', 'wand', 'bow', 'mic', 'fan', 'satellite'], ['yua'], 4)
        phone.evaluate("StarSurvivor.scene.spawnEnemy('walker')")
        phone.wait_for_function('StarSurvivor.scene.enemies.countActive()>0')
        phone.evaluate('''() => {const s=StarSurvivor.scene,e=s.enemies.getChildren().find(e=>e.active);
          e.body.reset(s.player.x+90,s.player.y);e.hp=e.maxHp=1000;e.speed=0;}''')
        phone.wait_for_function('StarSurvivor.scene.feedback.counts.hits>0', polling='raf')
        phone.screenshot(path=str(OUT / 'mobile-impact.png'))
        assert not phone.evaluate('document.documentElement.scrollWidth>innerWidth')
        assert phone.locator('.combat-readout').bounding_box()['x'] > 0
        for width, height in [(320, 740), (844, 390), (2559, 1277)]:
            phone.set_viewport_size({'width': width, 'height': height})
            phone.wait_for_timeout(250)
            assert not phone.evaluate('document.documentElement.scrollWidth>innerWidth')
            phone.screenshot(path=str(OUT / f'feedback-{width}x{height}.png'))
        mobile.close()
        browser.close()
    assert not errors and not failures, (errors, failures)
    report = {'weapons': weapons, 'peakEffects': peak, 'realKillPickupLevel': True, 'pauseFreezesEffects': True,
              'lightModeAndMute': True, 'bodyAndSaveProtected': True, 'mobile': True, 'errors': errors, 'failedAssets': failures}
    (OUT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    run_test()
