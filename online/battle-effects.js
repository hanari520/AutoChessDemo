import '../tools/battle-presentation.js?v=1';

// The server owns outcomes and targets; the classic renderer owns the visuals.
export function createBattleEffects(layer, nodes, units, visuals, speed = 1) {
  const timers = new Set();
  const activeNodes = new Set();
  let disposed = false;
  const schedule = (callback, delay) => {
    const timer = setTimeout(() => { timers.delete(timer); if (!disposed) callback(); }, delay);
    timers.add(timer);
    return timer;
  };
  const cancel = timer => { clearTimeout(timer); timers.delete(timer); };
  const geo = () => ({cw:layer.clientWidth / 8,ch:layer.clientHeight / 8});
  const resize=()=>{const size=`${geo().cw}px`;layer.style.setProperty('--cell',size);layer.parentElement.querySelector('.battle-unit-layer')?.style.setProperty('--cell',size);};
  const observer=new ResizeObserver(resize);observer.observe(layer);resize();
  const position = u => {
    const g=geo(),el=nodes.get(u.uid),css=el?getComputedStyle(el):null;
    return {x:css?(parseFloat(css.left)||0)+(g.cw-8)/2:(u.x+.5)*g.cw,y:css?(parseFloat(css.top)||0)+(g.ch-8)/2:(u.y+.5)*g.ch,el};
  };
  function fxNode(cls, x, y, duration = 500, parent = layer) {
    if (disposed || activeNodes.size >= 40) return null;
    const el = document.createElement('div');
    el.className = `vfx ${cls}`;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    parent.append(el);activeNodes.add(el);
    schedule(() => {el.remove();activeNodes.delete(el);}, duration / speed);
    return el;
  }
  const sigFor = u => globalThis.ClassicBattlePresentation.signature(u.id,{glyph:'✦',shape:'seal',art:'prism',color:'#dcb8ff',...visuals.get(u.id)});
  const impact = (u, color) => { const p=position(u);fxNode('impact',p.x,p.y,380);sparks(u,color==='#c77dff'?'#c77dff':'#ffd24a',2,14); };
  const sparks = (u,color,count=3,radius=20) => {
    const p=position(u);
    for(let i=0;i<count;i++) {
      const el=fxNode('pt',p.x,p.y,480); if(!el)break;
      const angle=Math.random()*Math.PI*2,distance=10+Math.random()*radius;
      el.style.setProperty('--dx',`${Math.cos(angle)*distance}px`);
      el.style.setProperty('--dy',`${Math.sin(angle)*distance}px`);
      el.style.background=color;el.style.color=color;
    }
  };
  const shared=globalThis.ClassicBattlePresentation.create({
    speed:()=>speed,scale:()=>1,unitVisual:position,boardGeo:geo,fxNode,
    vfxAt:(u,cls,duration)=>{const host=nodes.get(u.uid);return host?fxNode(`attached ${cls}${u.star>=3?' s3':''}`,0,0,duration,host):null;},
    fxSparks:sparks,sigFor,byId:id=>({rng:units.find(u=>u.id===id)?.range||1}),
    unitIndex:id=>[...visuals.keys()].indexOf(id),kit:id=>({...sigFor({id}),asset:visuals.get(id)?.asset}),
    unitDist:(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y),
    nearCells:()=>[],v3NearestFoes:()=>[],eatk:u=>u.atk||0,
    fxDir:(u,t)=>{const a=position(u),b=position(t);return {a,b,ang:Math.atan2(b.y-a.y,b.x-a.x)};},
    impactFx:impact,boltFx:(u,t,su)=>{const a=position(u),b=position(t),el=fxNode(`bolt${su?' su':''}`,(a.x+b.x)/2,(a.y+b.y)/2,420);if(el){el.style.width=`${Math.max(16,Math.round(Math.hypot(b.x-a.x,b.y-a.y)))}px`;el.style.setProperty('--rot',`${Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI}deg`);}},schedule,cancel,
  });
  function pulse(u,cls,duration) {
    const node=nodes.get(u?.uid);if(!node)return;
    node.classList.remove(cls);void node.offsetWidth;node.classList.add(cls);
    const key=`_${cls}Timer`;cancel(node[key]);node[key]=schedule(()=>node.classList.remove(cls),duration/speed);
  }
  function floating(u,event) {
    const p=position(u),el=fxNode('dmg',p.x,p.y-geo().ch*.6,850);
    if(!el)return;
    const positive=['heal','shield'].includes(event.type);
    el.classList.add(positive?'heal':'normal');
    el.textContent=event.label|| (event.type==='dodge'?'闪避':`${positive?'+':'−'}${Math.round(event.amount||0)}`);
    el.style.setProperty('--float-dur',`${.85/speed}s`);
  }
  return {
    event(event, recipients = []) {
      const u=units.find(u=>u.uid===String(event.from)),t=units.find(u=>u.uid===String(event.target));
      const profile=u?sigFor(u):{color:'#dcb8ff'};
      if(event.type==='mark'&&t){const host=nodes.get(t.uid),el=host&&fxNode('attached ring',0,0,720,host);if(el){el.style.borderColor=profile.color;el.style.boxShadow=`0 0 11px ${profile.color}`;}}
      else if(event.type==='markBurst'&&t){const p=position(t),el=fxNode('markburst',p.x,p.y,680);if(el){el.dataset.label=event.label;el.dataset.kind=event.kind;el.style.setProperty('--mark-color',profile.color);}sparks(t,profile.color,3,18);}
      else if(event.type==='zone'&&u){
        const p=position(u),size=(2*event.radius+1)*geo().cw,el=fxNode('aoe frost',p.x-size/2,p.y-size/2,event.duration);if(el){el.style.width=`${size}px`;el.style.height=`${size}px`;}
      } else if(event.type==='move') {
        const mover=units.find(u=>u.uid===String(event.unit));
        pulse(mover,event.kind==='walk'?'walking':'online-leaping',event.kind==='walk'?520:450);
      } else if(event.type==='cast'&&u) {
        u._skillArch=event.mode;
        shared.skillAct(u,t);shared.signatureFx(u,null);
        if(['field','cleave','team','teamShield','support'].includes(event.mode)&&recipients.length) {
          const targets=recipients.map(uid=>units.find(unit=>unit.uid===String(uid))).filter(Boolean);
          if(targets.length)shared.spawnSkillWave(u,targets,profile.color,event.mode==='teamShield',['team','support','teamShield'].includes(event.mode)?'support':'',false);
        }
      } else if(['skillLaunch','healLaunch','shieldLaunch'].includes(event.type)&&u&&t){
        if(event.type!=='skillLaunch'||event.detached)shared.launchSkillProjectile(u,t,{...profile,mode:event.mode},event.type==='skillLaunch'?'attack':'healing',0,u.id,event.duration);
        else shared.spawnSkillSlash(u,t,profile.color);
      } else if(t&&['bond','counter','echo','tempo','spark','zoneDamage','afterimage','attack','skill','bounce','heal','shield','dot','item','dodge','burn'].includes(event.type)) {
        floating(t,event);
        if(event.type==='shield') shared.spawnShieldImpact(t,profile.color,u?.id);
        else if(event.type==='heal'&&u)impact(t,profile.color);
        else if(u&&['skill','bounce'].includes(event.type)) {
          const kit={...profile,mode:u._skillArch||'single',attackStyle:profile.attackStyle};
          if(shared.skillIsDetached(u,kit))impact(t,profile.color);else shared.spawnSkillSlash(u,t,profile.color);
        } else if(event.type==='attack'&&u) {
          const a=position(u),b=position(t),distance=Math.hypot(b.x-a.x,b.y-a.y)||1;
          const node=nodes.get(u.uid);node?.style.setProperty('--lx',`${(b.x-a.x)/distance*8}px`);node?.style.setProperty('--ly',`${(b.y-a.y)/distance*8}px`);
          pulse(u,'lunge',300);
          shared.v3AttackFx(u,t,{style:profile.attackStyle||((u.range||1)>1?'shot':'blade'),color:profile.color});
          if((u.range||1)>1)shared.fireProjectile(u,t,profile.color,{...profile,style:profile.attackStyle||'shot'});
        }
        if(!['shield','dodge'].includes(event.type))pulse(t,'hitfx',180);
      } else if(event.type==='death'&&t) pulse(t,'dying',600);
    },
    get count() { return activeNodes.size; },
    destroy() { disposed=true;observer.disconnect();for(const timer of timers)clearTimeout(timer);timers.clear();for(const node of activeNodes)node.remove();activeNodes.clear(); },
  };
}
