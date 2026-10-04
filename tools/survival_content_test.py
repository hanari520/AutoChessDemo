"""Exercise classic skill adaptations and real weapon collisions in Chromium."""
import json
from pathlib import Path
from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'out/survival/content'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:8081/survival.html'


def ready(page):
    page.wait_for_function('window.StarSurvivor && document.querySelectorAll(".hero-card").length===50')


def start(page, weapons, companions=None):
    page.evaluate('''args=>{const C=StarSurvivor.core,s=C.newRun({id:'ein',job:'守护'},0,42);
      s.phase='shop';s.wave=4;s.hp=20;s.weapons=args.weapons.map(id=>({id,tier:1}));s.companions=args.companions;
      localStorage.setItem(C.SAVE_KEY,JSON.stringify(s));}''', {'weapons': weapons, 'companions': companions or []})
    page.reload()
    ready(page)
    page.locator('#continue').click()
    page.locator('#next').click()
    page.wait_for_function('StarSurvivor.state.phase==="battle"')
    page.evaluate('''()=>{const s=StarSurvivor.scene;s.spawnAt=999;s.invulnerableUntil=999;
      for(const c of s.skills.casters)c.next=999;for(let i=0;i<3;i++)s.spawnEnemy('ranged');}''')
    page.wait_for_function('StarSurvivor.scene.enemies.countActive()===3')
    page.evaluate('''()=>{const s=StarSurvivor.scene;s.enemies.getChildren().filter(e=>e.active).forEach((e,i)=>{
      e.body.reset(s.player.x+90+i*28,s.player.y);e.hp=e.maxHp=10000;e.speed=0;e.nextShot=999;});}''')


def run_test():
    errors, failures, weapon_results = [], [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-webgl'])
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('response', lambda r: failures.append(r.url) if r.status >= 400 else None)
        page.goto(BASE)
        ready(page)
        page.evaluate("localStorage.setItem('vc_save4','content-protected')")
        for weapon in page.evaluate('Object.keys(SurvivalContent.WEAPONS)'):
            start(page, [weapon])
            info = page.wait_for_function('''id=>{const s=StarSurvivor.scene,e=s.enemies.getChildren().find(e=>e.active),t=s.sim;
              if(!e||e.hp>=10000)return false;const effect=SurvivalContent.WEAPONS[id].effect;
              const real={wound:e.vulnerableUntil>t,slow:e.slowUntil>t,chain:s.enemies.getChildren().filter(e=>e.hp<10000).length>=2,
                shield:s.skills.shield>0,bleed:e.dotUntil>t&&StarSurvivor.state.hp>20,silence:e.silenceUntil>t,
                heal:StarSurvivor.state.hp>20,stun:e.freezeUntil>t}[effect];
              if(!real)return false;return {id,effect,damage:10000-e.hp,hp:StarSurvivor.state.hp,shield:s.skills.shield,
                projectileIds:s.shots.getChildren().map(p=>p.weaponId),texture:s.weaponSprites[0].texture.key};}''', arg=weapon, polling='raf').json_value()
            assert info['damage'] > 0 and info['texture'] == weapon, info
            weapon_results.append(info)
            print(json.dumps(info), flush=True)
        # Invoke every adaptation against real pooled Phaser bodies, without changing assets or source games.
        start(page, ['blade'])
        adapted = page.evaluate('''async()=>{const s=StarSurvivor.scene,r=await(await fetch('survival/roster.json?v=2')).json();
          s.paused=true;s.physics.pause();const results=[];
          for(const h of r){s.skills.reset();s.skills.begin();s.skills.getRun().hp=20;
            const enemies=s.enemies.getChildren().filter(e=>e.active);enemies.forEach((e,i)=>{e.body.reset(s.player.x+90+i*28,s.player.y);
              e.hp=e.maxHp=10000;e.freezeUntil=e.dotUntil=e.silenceUntil=e.vulnerableUntil=e.slowUntil=0;e.vulnerable=0;e.dot=0;e.boss=false;});
            const c=s.skills.casters[0];c.signature=SurvivalContent.signature(h.id);c.next=999;
            if(c.signature.mode==='passive')for(let i=0;i<8;i++)s.skills.weaponHit(enemies[0],'blade',10);
            else s.skills.cast(c,enemies[0]);
            const effect={id:h.id,mode:c.signature.mode,damage:enemies.reduce((sum,e)=>sum+10000-e.hp,0),hp:s.skills.getRun().hp,
              shield:s.skills.shield,zones:s.skills.zones.length,rain:s.skills.rainCharges,vulnerable:enemies[0].vulnerable||0};
            if(![effect.damage>0,effect.hp>20,effect.shield>0,effect.zones>0,effect.rain>0,effect.vulnerable>0].some(Boolean))throw Error(h.id+' has no actual effect');
            results.push(effect);s.feedback.clear();
          }return results;}''')
        assert len(adapted) == 50
        start(page, ['nightblade', 'frostseal', 'seasonchain', 'prismshield', 'crimsonblade', 'lotusbell'], ['xuezhu', 'sishi', 'likou'])
        page.evaluate('''()=>{const s=StarSurvivor.scene;s.skills.casters.forEach(c=>c.next=s.sim);s.skills.getRun().hp=20;}''')
        page.wait_for_function('StarSurvivor.scene.skills.casts>=4 && StarSurvivor.scene.skills.zones.length>0')
        page.wait_for_timeout(220)
        assert page.evaluate('StarSurvivor.scene.textures.getTextureKeys().filter(k=>k.startsWith("actor-")).length') == 24
        page.screenshot(path=str(OUT / 'skill-party-desktop.png'))
        assert page.evaluate('StarSurvivor.scene.skills.stats.skillPower') >= 12
        page.locator('#pause').click()
        frozen = page.evaluate('''()=>{const s=StarSurvivor.scene;return {sim:s.sim,shield:s.skills.shield,zones:s.skills.zones.map(z=>[z.next,z.until]),casters:s.skills.casters.map(c=>c.next)};}''')
        page.wait_for_timeout(350)
        assert frozen == page.evaluate('''()=>{const s=StarSurvivor.scene;return {sim:s.sim,shield:s.skills.shield,zones:s.skills.zones.map(z=>[z.next,z.until]),casters:s.skills.casters.map(c=>c.next)};}''')
        page.locator('#resume').click()
        # Simulate a critical hit, resisted boss control and shield absorption using the same battle handlers.
        check = page.evaluate('''()=>{const s=StarSurvivor.scene,e=s.enemies.getChildren().find(e=>e.active);
          s.skills.stats.crit=100;e.hp=e.maxHp=10000;e.vulnerableUntil=0;
          const random=SurvivalCore.random;SurvivalCore.random=()=>0;s.damageEnemy(e,10,{weapon:'blade'});SurvivalCore.random=random;
          const crit=10000-e.hp;s.skills.stats.crit=0;s.skills.grantShield(5);s.invulnerableUntil=0;const hp=StarSurvivor.state.hp;s.hurt(2);
          e.boss=true;s.skills.status(e,{freeze:2});return {crit,absorbed:hp===StarSurvivor.state.hp,bossFreeze:e.freezeUntil-s.sim};}''')
        assert abs(check['crit'] - 17.5) < .01 and check['absorbed'] and check['bossFreeze'] <= .6, check
        # The entire advanced shop and growth dialog remain inside narrow and wide viewports.
        page.evaluate('''()=>{const s=StarSurvivor.scene;s.skills.getRun().pendingLevels=1;s.elapsed=SurvivalCore.duration(StarSurvivor.state.wave);s.finishWave();}''')
        page.wait_for_selector('[data-upgrade="0"]')
        assert '觉醒' in page.locator('[data-upgrade="0"]').inner_text()
        page.locator('[data-upgrade="0"]').click()
        assert page.evaluate('StarSurvivor.state.skillRank') == 2
        for width, height in [(320, 740), (390, 844), (844, 390), (2559, 1277)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_timeout(180)
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            assert not page.locator('#panel-content').evaluate('(p)=>p.scrollWidth>p.clientWidth')
            page.screenshot(path=str(OUT / f'content-shop-{width}x{height}.png'))
        assert page.evaluate("localStorage.getItem('vc_save4')") == 'content-protected'
        with Image.open(OUT / 'skill-party-desktop.png') as im:
            assert max(ImageStat.Stat(im.convert('RGB')).stddev) > 15
        context.close()
        browser.close()
    assert not errors and not failures, (errors, failures)
    report = {'weapons': weapon_results, 'signatures': adapted, 'criticalShieldBoss': check, 'threeSkillCompanions': True,
              'pauseFreezesSkills': True, 'awakeAndResponsiveShop': True, 'classicSaveProtected': True, 'errors': errors, 'failedAssets': failures}
    (OUT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': True, 'weapons': len(weapon_results), 'signatures': len(adapted), 'errors': errors}), flush=True)


if __name__ == '__main__':
    run_test()
