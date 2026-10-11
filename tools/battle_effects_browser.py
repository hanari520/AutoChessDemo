"""Exercise every classic gesture in the real online renderer, including disposal."""
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[1]/'out'/'online-parity-20260930'
OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,channel='msedge')
    page=browser.new_page(viewport={'width':1200,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8081/online.html')
    result=page.evaluate('''async()=>{
      const {createBattleEffects}=await import('./online/battle-effects.js?v=1');
      const {SKILLS}=await import('./online/combat.js');
      const manifest=await (await fetch('assets/skill_signature_manifest.json')).json();
      document.body.classList.add('online-playing');
      document.body.innerHTML='<div id="arena" class="battle-arena" style="width:650px;height:650px;margin:40px"><div class="battle-unit-layer"></div><div class="battle-effects"></div></div>';
      const arena=document.querySelector('#arena'),layer=arena.lastElementChild,nodes=new Map();
      const visuals=new Map(manifest.units.map(u=>[u.id,{...u,asset:u.aiVfx}]));
      const units=[{uid:'caster',id:'ein',hp:100,range:3,x:2,y:5,side:'A'},{uid:'target',id:'goutan',hp:100,x:4,y:2,side:'B'}];
      for(const unit of units){
        const node=document.createElement('button');node.className='battle-piece unit battle-unit';
        node.style.setProperty('--battle-x',unit.x);node.style.setProperty('--battle-y',unit.y);
        node.innerHTML=`<img class="piece-art pt" src="assets/units_big/${unit.id}.webp">`;
        arena.firstElementChild.append(node);nodes.set(unit.uid,node);
      }
      layer.style.setProperty('--spd',1);arena.firstElementChild.style.setProperty('--spd',1);
      const renderer=createBattleEffects(layer,nodes,units,visuals);
      const gestures=[];let peak=0;
      for(const id of Object.keys(SKILLS)){
        units[0].id=id;nodes.get('caster').querySelector('img').src=`assets/units_big/${id}.webp`;
        renderer.event({type:'cast',from:'caster',mode:SKILLS[id].mode},['target']);
        const expected=ClassicBattlePresentation.actions[id][0];
        const node=nodes.get('caster'),animation=getComputedStyle(node.querySelector('img')).animationName;
        if(node.dataset.gesture!==expected||!animation.startsWith('skill'))throw Error(`${id}: missing classic gesture ${expected}, ${animation}`);
        renderer.event({type:'skill',from:'caster',target:'target',amount:30});
        renderer.event({type:'heal',from:'caster',target:'target',amount:10});
        renderer.event({type:'shield',from:'caster',target:'target',amount:20});
        gestures.push({id,gesture:expected,animation});peak=Math.max(peak,renderer.count);
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      await new Promise(resolve=>setTimeout(resolve,1600));
      renderer.event({type:'mark',from:'caster',target:'target',label:'test'});
      renderer.event({type:'markBurst',from:'caster',target:'target',label:'test',kind:'prism'});
      if(!layer.querySelector('.markburst'))throw Error('signature mark burst missing');
      renderer.event({type:'shieldLaunch',from:'caster',target:'target',duration:400});
      renderer.event({type:'move',unit:'caster',kind:'walk'});
      if(!nodes.get('caster').classList.contains('walking'))throw Error('walking missing');
      peak=Math.max(peak,renderer.count);
      renderer.destroy();await new Promise(resolve=>setTimeout(resolve,900));
      if(layer.childElementCount!==0)throw Error('effects recreated after disposal');
      if(renderer.count!==0||arena.querySelector('.vfx'))throw Error('attached effects retained after disposal');
      return {gestures:gestures.length,effectBudget:peak,disposed:true};
    }''')
    assert result['gestures']==50,result
    assert result['effectBudget']<=40,result
    assert not errors,errors
    # Verify the classic page still initializes with the extracted module.
    page.goto('http://127.0.0.1:8081/index.html')
    page.wait_for_timeout(1000)
    assert page.evaluate('typeof ClassicBattlePresentation.create')=='function'
    assert not errors,errors
    print('PASS',result,'classic startup; page errors:',errors)
    browser.close()
