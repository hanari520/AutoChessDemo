(async function() {
  'use strict';
  const C=SurvivalCore, A=SurvivalActors, F=SurvivalFeedback, D=SurvivalContent, $=id=>document.getElementById(id), panel=$('panel');
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let roster=[],animations=null,run=null,scene=null,selected='ein',difficulty=0,noticeTimer,loadoutSignature='';
  const audio=ClassicBattleAudio.create({silent:()=>document.hidden,speed:()=>1});
  let reducedFx=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try{const mode=localStorage.getItem('star_survivor_fx');if(mode)reducedFx=mode==='light';}catch{}
  function pulseHud(id){const el=$(id);if(!reducedFx&&el){el.getAnimations().forEach(a=>a.cancel());el.animate([{filter:'brightness(1.65)'},{filter:'brightness(1)'}],{duration:180});}}
  const icon=name=>`<i data-lucide="${name}"></i>`;
  function icons(){if(window.lucide)lucide.createIcons();}
  document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});icons();
  function toast(text){$('notice').textContent=text;$('notice').classList.add('on');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('on'),2200);}
  function hero(id){return roster.find(h=>h.id===id)||roster[0];}
  function art(id){return `assets/units_big/${encodeURIComponent(id)}.webp`;}
  function weaponArt(id){return scene?.textures.exists(id)?scene.textures.getBase64(id):'';}
  function show(html){$('panel-content').innerHTML=html;if(!panel.open)panel.showModal();icons();requestAnimationFrame(()=>panel.querySelector('button.primary,button,input')?.focus());}
  function hide(){panel.close();}
  async function withActors(ids,button,done){
    const label=button.textContent,buttons=[...panel.querySelectorAll('button,input,select')],disabled=buttons.map(b=>b.disabled);
    buttons.forEach(b=>b.disabled=true);button.textContent='载入动作中';
    try{await A.load(scene,animations,ids);done();}
    catch(error){toast(error.message);}
    finally{buttons.forEach((b,i)=>b.disabled=disabled[i]);button.textContent=label;}
  }
  function save(){const data=C.snapshot(run);if(data)try{localStorage.setItem(C.SAVE_KEY,JSON.stringify(data));}catch{toast('浏览器未能保存这次备战进度');}}
  function saved(){try{return C.restore(JSON.parse(localStorage.getItem(C.SAVE_KEY)),roster);}catch{return null;}}
  function clearSave(){try{localStorage.removeItem(C.SAVE_KEY);}catch{}}
  function statsHtml(){const bonus=D.bonuses(run,roster),s={...run.stats};for(const [k,v] of Object.entries(bonus.stats))s[k]+=v;
    return `<div class="stats"><span>生命 <b>${s.maxHp}</b></span><span>伤害 <b>+${s.damage}%</b></span><span>攻速 <b>+${s.haste}%</b></span><span>移速 <b>+${s.speed}%</b></span><span>护甲 <b>${s.armor}</b></span><span>恢复 <b>${s.regen}/5秒</b></span><span>收获 <b>${s.harvest}</b></span><span>材料储备 <b>${run.reserve||0}</b></span><span>技能 <b>+${s.skillPower}%</b></span><span>回转 <b>+${s.skillHaste}%</b></span><span>暴击 <b>${Math.min(75,s.crit)}%</b></span><span>闪避 <b>${Math.min(45,s.dodge)}%</b></span><span>汲取 <b>${Math.min(20,s.lifesteal)}%</b></span><span>余波 <b>+${s.statusPower}%</b></span><span>治疗 <b>+${s.healBoost}%</b></span><span>护盾 <b>+${s.shieldBoost}%</b></span></div><div class="build-bonuses">${bonus.entries.map(b=>`<span class="${b.active?'':'inactive'}" title="${escape(D.bonusText(b.bonus))}">${escape(b.name)} ${b.count}${b.active?'':' / 2'} · ${escape(D.bonusText(b.bonus))}${b.active?'':'（未激活）'}</span>`).join('')}</div>`;}
  function updateHud(){
    if(!run)return;
    $('hero-name').textContent=hero(run.hero).name;
    $('wave').textContent=`第 ${run.wave} / 20 波`;
    $('timer').textContent=run.phase==='battle'?(scene.remaining>0?`${Math.ceil(scene.remaining)}s`:'首领'):'准备';
    $('hp').max=run.stats.maxHp;$('hp').value=run.hp;$('hp-label').textContent=`${Math.ceil(run.hp)} / ${run.stats.maxHp}`;
    $('xp').max=C.xpNeed(run.level);$('xp').value=run.xp;$('xp-label').textContent=`${run.xp} / ${C.xpNeed(run.level)}`;
    $('level').textContent=`等级 ${run.level}`;$('coins').textContent=run.coins;$('coins').parentElement.title=`未拾取材料储备：${run.reserve||0}`;
    $('kills').textContent=run.kills;$('timer').classList.toggle('urgent',run.phase==='battle'&&scene.remaining<=5);
    const ability=D.signature(run.hero),caster=scene.skills?.casters[0];$('signature-name').textContent=`${ability.name} ${['','I','II','III','IV','V'][run.skillRank]}`;
    $('signature-hud').title=ability.desc;$('signature-shield').textContent=scene.skills?.shield>.05?`护盾 ${scene.skills.shield.toFixed(1)}`:'';
    $('signature-state').textContent=ability.mode==='passive'?'命中触发':run.phase!=='battle'?'就绪':`${Math.max(0,(caster?.next||0)-scene.sim).toFixed(1)}s`;
    $('signature-ready').value=ability.mode==='passive'?1:run.phase!=='battle'?1:Math.max(0,1-((caster?.next||0)-scene.sim)/(ability.cooldown/(1+(scene.skills?.stats?.skillHaste||0)/100)));
    const signature=JSON.stringify([run.weapons,run.companions]);
    if(signature!==loadoutSignature){loadoutSignature=signature;
      $('weapons').innerHTML=Array.from({length:6},(_,i)=>{const w=run.weapons[i];return w?`<div class="weapon-slot" title="${escape(C.WEAPONS[w.id].desc)}"><img src="${weaponArt(w.id)}" alt=""><span>${C.WEAPONS[w.id].name}</span><small>${['','I','II','III','IV'][w.tier]}</small><span class="weapon-ready" data-cooldown="${i}"></span></div>`:`<div class="weapon-slot empty" aria-label="空武器位">${icon('plus')}</div>`;}).join('');
      $('companions').innerHTML=run.companions.map(id=>`<div class="companion-slot"><img src="${art(id)}" alt=""><span>${escape(hero(id).name)}</span></div>`).join('');icons();}
    panel.ownerDocument.querySelectorAll('[data-cooldown]').forEach(el=>{const w=scene.weaponSprites[Number(el.dataset.cooldown)],progress=run.phase==='battle'&&w?Math.max(0,Math.min(1,1-(w.next-scene.sim)/(w.cooldown||1))):1;el.style.transform=`scaleX(${progress})`;});
  }
  function selection(){
    show(`<h2 id="panel-title">选择出战角色</h2><p class="sub">20 波 · 单人远征</p><div class="search-row"><input id="hero-search" type="search" placeholder="查找角色 / 职业" aria-label="查找角色"><select id="difficulty" aria-label="难度"><option value="0">初演</option><option value="1">巡演</option><option value="2">终夜</option></select></div><div class="hero-grid" id="hero-grid"></div><div class="selection" id="selection"></div><div class="actions">${saved()?'<button id="continue">继续备战存档</button>':''}<a href="index.html">返回星域棋战</a><button id="start" class="primary">出发</button></div>`);
    $('difficulty').value=difficulty;
    const render=()=>{const query=$('hero-search').value.trim();$('hero-grid').innerHTML=roster.filter(h=>`${h.name} ${h.job} ${h.fac}`.includes(query)).map(h=>`<button class="hero-card ${h.id===selected?'selected':''}" data-hero="${h.id}" aria-pressed="${h.id===selected}"><img src="${art(h.id)}" alt=""><b>${escape(h.name)}</b><small>${escape(h.job)}</small></button>`).join('');
      const h=hero(selected),ability=D.signature(h.id);$('selection').innerHTML=`<div><strong>${escape(h.name)}</strong><p>${C.perk(h).text}</p><p class="signature-description"><b>${escape(ability.name)}</b> · ${escape(ability.desc)}</p></div>`;
      $('hero-grid').querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.hero;render();});};
    render();$('hero-search').oninput=render;$('difficulty').onchange=e=>difficulty=Number(e.target.value);
    $('start').onclick=e=>{audio.sfxCtx();const id=selected,level=difficulty;withActors([id],e.currentTarget,()=>{run=C.newRun(hero(id),level);loadoutSignature='';save();scene.begin();});};
    if($('continue'))$('continue').onclick=e=>{const checkpoint=saved();if(!checkpoint){toast('存档无法读取，请开始新远征');selection();return;}withActors([checkpoint.hero,...checkpoint.companions],e.currentTarget,()=>{run=checkpoint;selected=run.hero;difficulty=run.difficulty;loadoutSignature='';scene.prepare(run);run.phase==='upgrade'?upgrades():shop();});};
  }
  function canBuy(o){return o&&run.coins>=o.price&&(o.type!=='weapon'||C.weaponCanFit(run,o.id))&&(o.type!=='companion'||run.companions.length<3&&!run.companions.includes(o.id));}
  function shop(){
    updateHud();const isReady=run.phase==='ready';
    const offers=isReady?'':`<div class="shop-grid">${run.offers.map((o,i)=>{
      if(!o)return '<article class="offer empty">已购买</article>';
      const def=o.type==='weapon'?C.WEAPONS[o.id]:o.type==='item'?C.ITEMS[o.id]:hero(o.id);
      const image=o.type==='weapon'?`<img src="${weaponArt(o.id)}" alt="">`:o.type==='companion'?`<img src="${art(o.id)}" alt="">`:icon(def.icon==='shield'?'shield':def.icon==='boots'?'footprints':def.icon==='blade'?'sword':def.icon==='mic'?'audio-lines':def.icon);
      const desc=o.type==='companion'?`${def.job} · ${D.signature(def.id).name} · ${D.signature(def.id).desc}`:def.desc;
      return `<article class="offer ${o.locked?'locked':''}"><button class="lock" data-lock="${i}" aria-label="${o.locked?'解锁':'锁定'}${escape(def.name)}" title="${o.locked?'解锁':'锁定'}">${icon(o.locked?'lock-keyhole':'lock-keyhole-open')}</button><div class="offer-art">${image}</div><h3>${escape(def.name)}</h3><p>${escape(desc)}</p><button class="buy" data-buy="${i}" ${canBuy(o)?'':'disabled'}>${icon('gem')}${o.price}${o.type==='weapon'&&run.weapons.some(w=>w.id===o.id&&w.tier===1)?' · 合成':' · 购买'}</button></article>`;
    }).join('')}</div>`;
    show(`<div class="dialog-head"><div><h2 id="panel-title">${isReady?'远征准备':`第 ${run.wave-1} 波完成`}</h2><p class="sub">${isReady?escape(hero(run.hero).name):'星间补给站'} · ${escape(D.signature(run.hero).name)} ${['','I','II','III','IV','V'][run.skillRank]}</p></div><div class="currency">${icon('gem')}<strong>${run.coins}</strong></div></div>${offers}${statsHtml()}<h3>武器 · ${run.weapons.length} / 6</h3><div class="inventory">${run.weapons.map((w,i)=>`<button data-sell="${i}" ${isReady||run.weapons.length===1?'disabled':''} title="回收材料"><img src="${weaponArt(w.id)}" alt=""><span>${C.WEAPONS[w.id].name} ${['','I','II','III','IV'][w.tier]}</span>${icon('recycle')}</button>`).join('')}</div>${run.companions.length?`<h3 class="party-heading">伙伴 · ${run.companions.length} / 3</h3><div class="party-details">${run.companions.map(id=>`<div><img src="${art(id)}" alt=""><span><b>${escape(hero(id).name)}</b><small>${escape(D.signature(id).name)} · ${escape(D.signature(id).desc)}</small></span></div>`).join('')}</div>`:''}<div class="actions">${isReady?'':`<button id="reroll" ${run.coins<C.refreshCost(run)?'disabled':''}>${icon('refresh-cw')} 刷新 · ${C.refreshCost(run)}</button>`}<button id="save-menu">保存并返回</button><button id="next" class="primary">开始第 ${run.wave} 波</button></div>`);
    panel.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{if(C.buy(run,Number(b.dataset.buy))){audio.sfx('buy');save();shop();}});
    panel.querySelectorAll('[data-lock]').forEach(b=>b.onclick=()=>{C.lock(run,Number(b.dataset.lock));save();shop();});
    panel.querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>{if(C.sell(run,Number(b.dataset.sell))){audio.sfx('sell');save();shop();}});
    if($('reroll'))$('reroll').onclick=()=>{if(C.refresh(run,roster)){audio.sfx('roll');save();shop();}};
    $('next').onclick=e=>withActors([run.hero,...run.companions],e.currentTarget,()=>{save();scene.begin();});$('save-menu').onclick=()=>{save();run=null;scene.idle();selection();};
  }
  function upgrades(){updateHud();show(`<h2 id="panel-title">成长 · 等级 ${run.level}</h2><p class="sub">待选择 ${run.pendingLevels} 项</p><div class="upgrade-grid">${run.upgrades.map((u,i)=>`<button class="upgrade" data-upgrade="${i}"><strong>${u.name}</strong><span>${u.desc}</span></button>`).join('')}</div>${statsHtml()}`);panel.querySelectorAll('[data-upgrade]').forEach(b=>b.onclick=()=>{C.pickUpgrade(run,Number(b.dataset.upgrade));audio.sfx('lvlup');save();run.phase==='upgrade'?upgrades():shop();});}
  function pause(){if(!run||run.phase!=='battle'||scene.paused)return;scene.paused=true;scene.physics.pause();scene.pauseActors(true);scene.resetInput();audio.stopBattle();show(`<h2 id="panel-title">远征暂停</h2><p class="sub">第 ${run.wave} 波 · ${Math.ceil(scene.remaining)} 秒</p>${statsHtml()}<label class="fx-setting"><input id="less-fx" type="checkbox" ${reducedFx?'checked':''}>轻量反馈</label><div class="actions"><button id="retreat">退回本波备战</button><button id="resume" class="primary">继续战斗</button></div>`);$('less-fx').onchange=e=>{reducedFx=e.target.checked;scene.feedback.setReduced(reducedFx);try{localStorage.setItem('star_survivor_fx',reducedFx?'light':'full');}catch{}};$('resume').onclick=resume;$('retreat').onclick=()=>{const checkpoint=saved();if(checkpoint){run=checkpoint;scene.prepare(run);run.phase==='upgrade'?upgrades():shop();}else{run=null;scene.idle();selection();}};}
  function resume(){if(!scene.paused)return;hide();scene.paused=false;scene.physics.resume();scene.pauseActors(false);scene.resetInput();}
  function result(){clearSave();updateHud();audio.stopBattle();audio.sfx(run.phase==='victory'?'finalWin':'lose');const won=run.phase==='victory';show(`<h2 id="panel-title">${won?'远征成功':'远征结束'}</h2><p class="sub">${escape(hero(run.hero).name)} · ${['初演','巡演','终夜'][run.difficulty]}</p><div class="result-grid"><div><strong>${won?20:run.wave}</strong><span>波次</span></div><div><strong>${run.kills}</strong><span>击败敌人</span></div><div><strong>${run.level}</strong><span>等级</span></div></div>${statsHtml()}<div class="actions"><a href="index.html">返回星域棋战</a><button id="again" class="primary">再来一局</button></div>`);$('again').onclick=()=>{run=null;scene.idle();selection();};}
  $('pause').onclick=()=>scene?.paused?resume():pause();
  $('sound').onclick=()=>{audio.toggleSfx();$('sound').innerHTML=icon(audio.enabled?'volume-2':'volume-x');$('sound').setAttribute('aria-label',audio.enabled?'关闭音效':'开启音效');icons();};
  $('sound').innerHTML=icon(audio.enabled?'volume-2':'volume-x');icons();
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  window.addEventListener('blur',()=>pause());
  window.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();scene?.paused?resume():pause();}});
  panel.addEventListener('cancel',e=>{e.preventDefault();if(scene?.paused)resume();});
  const stick=$('stick'),pad=$('joystick');let pointerId=null;
  function padMove(e){if(pointerId!==e.pointerId||!scene)return;const r=pad.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,length=Math.hypot(dx,dy),scale=Math.min(1,32/Math.max(1,length));stick.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;scene.pad={x:dx*scale/32,y:dy*scale/32};}
  pad.addEventListener('pointerdown',e=>{if(!run||run.phase!=='battle'||scene.paused)return;pointerId=e.pointerId;pad.setPointerCapture(pointerId);padMove(e);});
  pad.addEventListener('pointermove',padMove);
  const resetPad=()=>{pointerId=null;stick.style.transform='';if(scene)scene.pad={x:0,y:0};};
  pad.addEventListener('pointerup',resetPad);pad.addEventListener('pointercancel',resetPad);pad.addEventListener('lostpointercapture',resetPad);
  class Field extends Phaser.Scene {
    constructor(){super('Field');this.paused=false;this.remaining=0;this.pad={x:0,y:0};this.sim=0;this.serial=0;}
    preload(){
      this.load.on('loaderror',file=>this.assetError=file.key);this.load.image('arena','assets/ui/idol-arena-v2.png');this.load.image('fx-slash','assets/fx/v3-blade.png');this.load.image('fx-impact','assets/fx/v3-arc.png');
      for(const key of ['blade','arc','ward','void'])if(key!=='blade')this.load.image('fx-'+key,'assets/fx/v3-'+key+'.png');
      this.load.image('fx-blade','assets/fx/v3-blade.png');
      for(const [id,def] of Object.entries(D.WEAPONS))this.load.image(id,'assets/fx/'+def.asset+'.png');
      for(const [action,spec] of Object.entries(animations.characters.ein.actions))this.load.spritesheet(A.key('ein',action),spec.path,{frameWidth:animations.frameSize[0],frameHeight:animations.frameSize[1],endFrame:spec.count-1});
    }
    create(){
      if(this.assetError){show(`<h2 id="panel-title">动作素材未能载入</h2><p class="error">${escape(this.assetError)}</p><button class="primary" onclick="location.reload()">重新载入</button>`);return;}
      A.register(this,animations,'ein');
      scene=this;this.fieldW=1100;this.fieldH=780;
      this.backdrop=this.add.image(550,390,'arena').setScrollFactor(0).setDepth(-5);
      this.add.rectangle(550,390,960,620,0x374b48,.23).setStrokeStyle(2,0xe7f2cf,.5);
      const marks=this.add.graphics().lineStyle(1,0xdfeadb,.17);
      for(let x=130;x<1000;x+=70)marks.lineBetween(x,95,x,690);
      for(let y=110;y<700;y+=70)marks.lineBetween(80,y,1020,y);
      this.buildTextures();
      this.feedback=new F.Feedback(this,audio,reducedFx);
      this.skills=new SurvivalSkills.Skills(this,()=>run,C,roster);
      this.physics.world.setBounds(75,100,950,600);
      this.enemies=this.physics.add.group({maxSize:150});this.shots=this.physics.add.group({maxSize:160});this.enemyShots=this.physics.add.group({maxSize:120});this.drops=this.physics.add.group({maxSize:500});
      this.player=this.physics.add.sprite(550,390,A.key('ein','idle')).setCollideWorldBounds(true).setDepth(6);
      this.setActor(this.player,'ein',.36);this.player.body.setEnable(false);
      this.shadow=this.add.ellipse(550,418,42,14,0x1a2629,.35).setDepth(4);
      this.weaponSprites=[];this.partnerSprites=[];this.telegraphs=[];
      this.keys=this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
      this.input.keyboard.addCapture(['W','A','S','D','UP','DOWN','LEFT','RIGHT','SPACE']);
      this.physics.add.overlap(this.player,this.enemies,()=>this.hurt(4+Math.floor(run.wave/3)));
      this.physics.add.overlap(this.player,this.enemyShots,(_,p)=>{if(!run||run.phase!=='battle'||!p.active)return;p.disableBody(true,true);this.hurt(p.damage);});
      this.physics.add.overlap(this.shots,this.enemies,(p,e)=>{if(!p.active||!e.active||p.hitIds.has(e.serial))return;p.hitIds.add(e.serial);this.damageEnemy(e,p.damage,{angle:p.rotation,weapon:p.weaponId||p.style,color:p.color,proc:p.style!=='partner'});p.pierce--;if(p.pierce<=0)p.disableBody(true,true);});
      this.physics.add.overlap(this.player,this.drops,(_,d)=>this.collectDrop(d));
      this.scale.on('resize',()=>this.frameCamera());this.frameCamera();
      if(location.hostname==='127.0.0.1'||location.hostname==='localhost')window.StarSurvivor={get state(){return run?JSON.parse(JSON.stringify(run)):null;},get scene(){return scene;},core:C};
      selection();
    }
    setActor(sprite,id,scale){
      sprite.pose?.destroy();sprite.anims.stop();sprite.setTexture(A.key(id,'idle'),0).setOrigin(.5,.625).setScale(scale).setAlpha(1).setFlipX(false);
      sprite.pose=new A.Pose(sprite,id);
      // The fixed lower-body circle stays independent of weapons and pose alpha bounds.
      if(sprite.body)sprite.body.setCircle(36,92,150);
    }
    pauseActors(paused){[this.player,...this.partnerSprites].forEach(p=>p.pose.pause(paused));}
    frameCamera(){const {width,height}=this.scale;const zoom=Math.max(.55,width<600?.83:Math.min(1.2,(height-90)/680,width/1050));
      const camera=this.cameras.main,padX=Math.max(0,(width/zoom-this.fieldW)/2),padY=Math.max(0,(height/zoom-this.fieldH)/2);
      // A viewport larger than the map needs symmetric bounds to avoid top-left clamping.
      camera.setZoom(zoom).setBounds(-padX,-padY,this.fieldW+padX*2,this.fieldH+padY*2);
      if(run)camera.startFollow(this.player,true,.12,.12);else camera.centerOn(this.fieldW/2,this.fieldH/2);
      const frame=this.backdrop.frame,scale=Math.max(width/frame.realWidth,height/frame.realHeight)/zoom;this.backdrop.setPosition(width/2,height/2).setDisplaySize(frame.realWidth*scale,frame.realHeight*scale);}
    buildTextures(){
      const g=this.make.graphics({x:0,y:0,add:false});
      for(const [id,w] of Object.entries(C.WEAPONS)){if(this.textures.exists(id))continue;g.clear();g.lineStyle(4,0x263b37,1);g.fillStyle(w.color,1);
        if(id==='blade'){g.fillTriangle(31,3,37,9,10,36);g.strokeTriangle(31,3,37,9,10,36);g.lineStyle(5,0xe3ad70);g.lineBetween(7,24,20,37);}
        else if(id==='bow'){g.lineStyle(4,w.color);g.beginPath();g.arc(15,20,15,-Math.PI/2,Math.PI/2);g.strokePath();g.lineStyle(1,0xffffff);g.lineBetween(15,5,15,35);g.lineStyle(3,w.color);g.lineBetween(5,20,35,20);}
        else if(id==='mic'){g.fillRoundedRect(14,4,13,19,5);g.fillRect(19,20,4,15);g.lineStyle(2,0x253b37);g.lineBetween(16,10,25,10);g.lineBetween(16,15,25,15);}
        else if(id==='satellite'){g.lineStyle(4,w.color);g.strokeCircle(20,20,13);g.fillCircle(31,10,6);g.fillCircle(20,20,4);}
        else if(id==='fan'){g.fillTriangle(20,34,2,6,38,6);g.lineStyle(2,0x39463c);g.lineBetween(20,34,13,6);g.lineBetween(20,34,27,6);}
        else{g.fillTriangle(20,2,8,16,32,16);g.fillTriangle(20,27,8,16,32,16);g.fillStyle(0xd8efc7);g.fillRect(18,25,4,13);}
        g.generateTexture(id,40,40);
      }
      for(const [key,color] of [['walker',0xce7682],['runner',0xffb071],['ranged',0x839ece],['boss',0x7d677f]]){
        g.clear();g.lineStyle(3,0x354038);g.fillStyle(color);
        g.fillEllipse(32,37,48,38);g.strokeEllipse(32,37,48,38);
        g.fillTriangle(8,31,12,10,25,26);g.fillTriangle(38,26,52,10,56,33);
        g.fillStyle(0xfff6d4);g.fillCircle(22,32,8);g.fillCircle(43,32,8);g.fillStyle(0x293b34);g.fillCircle(24,33,3);g.fillCircle(41,33,3);
        g.lineStyle(3,0x293b34);g.lineBetween(25,47,38,47);g.generateTexture(key,64,64);
      }
      g.clear().fillStyle(0xaef18c).fillTriangle(8,0,0,8,8,16).fillTriangle(8,0,16,8,8,16).generateTexture('gem',16,16);
      g.clear().fillStyle(0x9ce7ef).fillCircle(6,6,5).generateTexture('shot',12,12);
      for(const [key,color] of [['shot-bow',0xf8d8a4],['shot-wand',0xb4f5ea],['shot-fan',0xffc29a],['shot-partner',0xd5f3b5]]){
        g.clear().lineStyle(3,0x294339,1).fillStyle(color,1);
        if(key==='shot-bow'){g.fillTriangle(29,8,17,2,17,14);g.strokeTriangle(29,8,17,2,17,14);g.lineStyle(3,0x294339).lineBetween(2,8,22,8);g.lineStyle(1,0xfffbe8).lineBetween(2,8,22,8);}
        else{g.fillTriangle(30,8,10,1,2,8).fillTriangle(30,8,2,8,10,15);g.lineStyle(2,0x294339).strokeTriangle(30,8,10,1,2,8).strokeTriangle(30,8,2,8,10,15);g.lineStyle(2,0xfffbec).lineBetween(8,8,24,8);}
        g.generateTexture(key,32,16);
      }
      g.clear().fillStyle(0xff9887).fillCircle(8,8,7).generateTexture('bad-shot',16,16);g.destroy();
    }
    resetInput(){this.input.keyboard.resetKeys();this.pad={x:0,y:0};resetPad();this.player.setVelocity(0);}
    clearField(){this.feedback.clear();this.skills.reset();$('hurt-screen').style.opacity=0;for(const group of [this.enemies,this.shots,this.enemyShots,this.drops])group.clear(true,true);this.telegraphs.forEach(t=>t.destroy());this.telegraphs=[];this.weaponSprites.forEach(w=>w.destroy());this.partnerSprites.forEach(p=>p.destroy());this.weaponSprites=[];this.partnerSprites=[];}
    idle(){this.paused=false;this.physics.resume();this.resetInput();this.clearField();this.player.pose.rest();this.player.setAlpha(1);this.player.body.setEnable(false);this.player.setPosition(550,390);this.cameras.main.stopFollow();this.cameras.main.centerOn(550,390);}
    prepare(s){this.idle();this.setActor(this.player,s.hero,.36);A.retain(this,animations,[s.hero,...s.companions]);this.frameCamera();updateHud();}
    begin(){if(!run||!C.beginWave(run))return;hide();this.prepare(run);this.player.body.setEnable(true);this.player.setAlpha(1);
      this.remaining=C.duration(run.wave);this.elapsed=0;this.spawnAt=.5;this.regenAt=5;this.invulnerableUntil=0;this.bossSpawned=false;this.paused=false;this.sim=0;this.resetInput();
      this.weaponSprites=run.weapons.map((w,i)=>{const sprite=this.add.image(550,390,w.id).setDisplaySize(w.id==='blade'?42:36,w.id==='blade'?42:36).setDepth(7);if(D.WEAPONS[w.id])sprite.setTint(C.WEAPONS[w.id].color);sprite.weapon=w;sprite.next=i*.13;sprite.aim=-Math.PI/2;sprite.strike=null;sprite.firedAt=-10;return sprite;});
      this.partnerSprites=run.companions.map((id,i)=>{const p=this.add.sprite(550,390,A.key(id,'idle')).setDepth(5);this.setActor(p,id,.29);p.next=.5+i*.3;p.hero=hero(id);return p;});
      this.skills.begin();
      audio.sfx('battleStart');toast(`第 ${run.wave} 波`);updateHud();
    }
    hurt(raw){if(!run||run.phase!=='battle'||this.paused||this.sim<this.invulnerableUntil)return;const incoming=this.skills.incoming(raw*(1+run.difficulty*.2));this.invulnerableUntil=this.sim+.75;if(incoming<=0){updateHud();return;}const old=run.hp;C.hit(run,incoming,this.skills.stats.armor);this.hurtAt=this.sim;if(run.phase==='defeat')this.feedback.releaseHolds();this.player.pose.act(run.phase==='defeat'?'death':'hit');this.feedback.hurt(this.player.x,this.player.y,old-run.hp);$('hurt-screen').style.opacity=reducedFx?.25:.65;pulseHud('hp');audio.sfx('impactBlade');updateHud();if(run.phase==='defeat'){this.physics.pause();this.resetInput();this.player.setAlpha(1);this.partnerSprites.forEach(p=>p.pose.rest());result();}}
    collectDrop(d){if(!run||run.phase!=='battle'||!d.active)return;d.disableBody(true,true);const old=run.level,coins=run.coins;C.collect(run,d.value||1);this.feedback.pickup(this.player.x,this.player.y,run.coins-coins);pulseHud('coins');if(run.level>old){this.feedback.level(this.player.x,this.player.y,run.level);pulseHud('xp');audio.sfx('pop');toast(`等级 ${run.level}`);}updateHud();}
    damageEnemy(e,damage,source={}){if(!e.active||!run||run.phase!=='battle')return 0;
      const angle=source.angle??Phaser.Math.Angle.Between(this.player.x,this.player.y,e.x,e.y),weapon=source.weapon||'blade',color=source.color||C.WEAPONS[weapon]?.color||0xc5efaa,force=F.impact(weapon,e.boss);
      const proc=source.proc!==false&&Boolean(C.WEAPONS[weapon]),crit=proc&&this.skills.stats.crit>0&&C.random(run)<Math.min(.75,this.skills.stats.crit/100);if(crit)damage*=1.75;
      if(this.sim<(e.vulnerableUntil||0))damage*=1+(e.vulnerable||0);const actual=Math.min(e.hp,damage);
      e.hp-=damage;e.knockUntil=this.sim+force.duration;e.knockX=Math.cos(angle)*force.speed;e.knockY=Math.sin(angle)*force.speed;
      this.feedback.hit(e,damage,angle,color,weapon,this.player);
      if(crit)this.feedback.number(e.x,e.y-55,0,0xffd580,14,'暴击');
      if(proc)this.skills.weaponHit(e,weapon,actual);
      if(e.hp<=0){const x=e.x,y=e.y,value=e.boss?12:1;this.feedback.kill(e,angle,color);e.disableBody(true,true);run.kills++;const drop=this.drops.get(x,y,'gem');if(drop){drop.enableBody(true,x,y,true,true).setDepth(3).setAlpha(1);drop.value=value;drop.born=this.sim;drop.setVelocity(0);drop.body.setCircle(8);}}
      return actual;
    }
    spawnEnemy(type='walker',boss=false){
      const side=Math.floor(C.random(run)*4),x=side===0?90:side===1?1010:120+C.random(run)*860,y=side===2?110:side===3?690:130+C.random(run)*540;
      const wave=run.wave;
      const marker=this.add.circle(x,y,boss?46:20,0xc7746f,.18).setStrokeStyle(2,0xf18173,.8).setDepth(2);this.telegraphs.push(marker);
      this.time.delayedCall(600,()=>{marker.destroy();this.telegraphs=this.telegraphs.filter(t=>t!==marker);if(!run||run.wave!==wave||run.phase!=='battle'||this.paused)return;
        const e=this.enemies.get(x,y,type);if(!e)return;e.setTexture(type).enableBody(true,x,y,true,true).clearTint().setDepth(5).setDisplaySize(boss?110:type==='runner'?38:48,boss?110:type==='runner'?38:48);e.body.setCircle(23,9,13);
        e.serial=++this.serial;e.boss=boss;e.hp=(boss?210+run.wave*27:9+run.wave*3)*(1+run.difficulty*.28);e.maxHp=e.hp;e.hitUntil=0;e.barUntil=0;e.knockUntil=0;e.freezeUntil=0;e.slowUntil=0;e.slowFactor=1;e.silenceUntil=0;e.vulnerable=0;e.vulnerableUntil=0;e.dot=0;e.dotUntil=0;e.dotNext=0;e.setRotation(0).setAlpha(1);e.speed=(type==='runner'?104:type==='ranged'?42:53)+run.wave*1.8;e.nextShot=this.sim+1.8;});
    }
    nearest(x,y,range){let found=null,dist=range;this.enemies.getChildren().forEach(e=>{if(!e.active)return;const d=Phaser.Math.Distance.Between(x,y,e.x,e.y);if(d<dist){dist=d;found=e;}});return found;}
    fire(x,y,target,damage,color,pierce=1,angleOffset=0,weaponId='wand'){const style=C.WEAPONS[weaponId]?.projectile||weaponId,texture=`shot-${style}`,p=this.shots.get(x,y,this.textures.exists(texture)?texture:'shot');if(!p)return;
      p.setTexture(this.textures.exists(texture)?texture:'shot').enableBody(true,x,y,true,true).setDepth(8).clearTint().setAlpha(1).setDisplaySize(style==='bow'?30:23,style==='bow'?15:11.5);p.body.setCircle(5,11,3);
      p.damage=damage;p.pierce=pierce;p.hitIds=new Set();p.expires=this.sim+1.3;p.style=style;p.weaponId=weaponId;p.color=color;p.nextTrail=0;const angle=Phaser.Math.Angle.Between(x,y,target.x,target.y)+angleOffset;p.setRotation(angle);this.physics.velocityFromRotation(angle,440,p.body.velocity);}
    attack(sprite,index,dt){const w=sprite.weapon,def=C.WEAPONS[w.id],base=(index/run.weapons.length)*Math.PI*2-Math.PI/2;
      const aimTarget=this.nearest(this.player.x,this.player.y,def.range),desired=aimTarget?Phaser.Math.Angle.Between(this.player.x,this.player.y,aimTarget.x,aimTarget.y):base;
      if(!sprite.strike)sprite.aim=Phaser.Math.Angle.RotateTo(sprite.aim,desired,dt*14);
      const motion=F.weaponMotion(def.kind,this.sim-sprite.firedAt),size=(w.id==='blade'?42:36)*(1+(w.tier-1)*.06),offset=w.id==='blade'?Math.PI/4:['wand','mic','fan'].includes(w.id)?Math.PI/2:0;
      sprite.setPosition(this.player.x+Math.cos(base)*39+Math.cos(sprite.aim)*motion.reach,this.player.y+8+Math.sin(base)*30+Math.sin(sprite.aim)*motion.reach).setRotation(sprite.aim+offset+motion.turn).setDisplaySize(size*motion.scale,size*motion.scale);
      if(def.kind==='orbit')sprite.setPosition(this.player.x+Math.cos(this.sim*2.7+index)*90,this.player.y+Math.sin(this.sim*2.7+index)*90).setRotation(this.sim*2);
      if(sprite.strike){if(this.sim>=sprite.strike.at)this.release(sprite);return;}
      if(this.sim<sprite.next)return;
      const target=this.nearest(def.kind==='orbit'?sprite.x:this.player.x,def.kind==='orbit'?sprite.y:this.player.y,def.kind==='orbit'?34:def.range);
      if(!target)return;sprite.cooldown=def.rate/1000/Math.max(.2,1+this.skills.haste()/100);sprite.next=this.sim+sprite.cooldown;sprite.firedAt=this.sim;
      sprite.aim=Phaser.Math.Angle.Between(this.player.x,this.player.y,target.x,target.y);
      if(def.kind!=='orbit')this.player.pose.act(def.kind==='pulse'||w.id==='wand'?'cast':'attack');
      if(def.kind==='orbit'){this.damageEnemy(target,def.damage*(1+this.skills.stats.damage/100)*(1+(w.tier-1)*.7),{angle:Phaser.Math.Angle.Between(this.player.x,this.player.y,target.x,target.y),weapon:w.id,color:def.color});return;}
      sprite.strike={at:this.sim+(def.kind==='melee'?.09:.12),target,x:target.x,y:target.y,serial:target.serial};
    }
    release(sprite){
      const strike=sprite.strike,w=sprite.weapon,def=C.WEAPONS[w.id],damage=def.damage*(1+this.skills.stats.damage/100)*(1+(w.tier-1)*.7);
      const target=strike.target.active&&strike.target.serial===strike.serial?strike.target:{x:strike.x,y:strike.y};sprite.strike=null;
      const direction=Phaser.Math.Angle.Between(this.player.x,this.player.y,target.x,target.y);sprite.aim=direction;
      this.skills.weaponRelease(w.id,w.tier);
      if(def.kind==='melee'||def.kind==='pulse'){
        const centerX=this.player.x,centerY=this.player.y;
        if(def.kind==='pulse')this.feedback.pulse(centerX,centerY,def.range,def.color);else this.feedback.slash(centerX,centerY,direction,def.range,def.color);
        this.enemies.getChildren().forEach(e=>{if(!e.active||Phaser.Math.Distance.Between(centerX,centerY,e.x,e.y)>def.range)return;const a=Phaser.Math.Angle.Between(centerX,centerY,e.x,e.y);if(def.kind==='pulse'||Math.abs(Phaser.Math.Angle.Wrap(a-direction))<1.25)this.damageEnemy(e,damage,{angle:a,weapon:w.id,color:def.color});});
        audio.sfx(def.kind==='pulse'?'impactArc':'slash');
      }else{const count=def.kind==='fan'?3:1,x=sprite.x+Math.cos(direction)*14,y=sprite.y+Math.sin(direction)*14;this.feedback.muzzle(x,y,direction,def.color,w.id);
        for(let n=0;n<count;n++)this.fire(x,y,target,damage,def.color,w.id==='wand'?2:1,(n-(count-1)/2)*.19,w.id);audio.sfx(w.id==='bow'?'bounce':w.id==='fan'?'slash':'spellZap');}
    }
    finishWave(){if(!run||run.phase!=='battle')return;this.physics.pause();this.resetInput();this.feedback.clear();this.skills.reset();[this.player,...this.partnerSprites].forEach(p=>p.pose.rest());this.player.setAlpha(1);this.enemies.getChildren().forEach(e=>e.clearTint().setRotation(0));$('hurt-screen').style.opacity=0;run.reserve=(run.reserve||0)+this.drops.getChildren().filter(d=>d.active).reduce((sum,d)=>sum+(d.value||1),0);C.endWave(run,roster,this.skills.stats);audio.stopBattle();if(run.phase==='victory'){result();return;}save();run.phase==='upgrade'?upgrades():shop();}
    update(_,delta){
      if(!run||run.phase!=='battle'||this.paused)return;
      const dt=Math.min(delta,50)/1000;this.sim+=dt;this.elapsed+=dt;run.elapsed+=dt;this.remaining=Math.max(0,C.duration(run.wave)-this.elapsed);
      this.feedback.update(dt,this.sim,this.enemies.getChildren(),this.player);$('hurt-screen').style.opacity=Math.max(0,1-(this.sim-(this.hurtAt??-10))/.3)*(reducedFx?.25:.65);
      let x=(this.keys.D.isDown||this.keys.RIGHT.isDown?1:0)-(this.keys.A.isDown||this.keys.LEFT.isDown?1:0),y=(this.keys.S.isDown||this.keys.DOWN.isDown?1:0)-(this.keys.W.isDown||this.keys.UP.isDown?1:0);
      if(!x&&!y){x=this.pad.x;y=this.pad.y;}
      const pointer=this.input.activePointer;
      if(!x&&!y&&pointer.isDown&&pointer.downElement?.tagName==='CANVAS'){const p=this.cameras.main.getWorldPoint(pointer.x,pointer.y);if(Phaser.Math.Distance.Between(this.player.x,this.player.y,p.x,p.y)>10){x=p.x-this.player.x;y=p.y-this.player.y;}}
      const length=Math.hypot(x,y),speed=175*(1+run.stats.speed/100);this.player.setVelocity(length?x/Math.max(1,length)*speed:0,length?y/Math.max(1,length)*speed:0);if(x)this.player.setFlipX(x<0);
      this.player.pose.move(length>.05);
      this.player.setAlpha(this.sim<this.invulnerableUntil?(Math.floor(this.sim*16)%2?.45:1):1);this.player.setDepth(6+this.player.y/1000);this.shadow.setPosition(this.player.x,this.player.y+27);
      if(this.sim>=this.spawnAt&&this.remaining>0){this.spawnAt=this.sim+Math.max(.22,1.05-run.wave*.035);if(this.enemies.countActive()<90){const type=run.wave>=4&&C.random(run)<.2?'ranged':run.wave>=2&&C.random(run)<.25?'runner':'walker';this.spawnEnemy(type);}}
      if([10,20].includes(run.wave)&&!this.bossSpawned&&this.elapsed>4){this.bossSpawned=true;this.spawnEnemy('boss',true);toast('首领降临');audio.sfx('horn');}
      this.skills.update(dt);
      this.enemies.getChildren().forEach(e=>{if(!e.active)return;const dist=Phaser.Math.Distance.Between(e.x,e.y,this.player.x,this.player.y);if(this.sim<(e.freezeUntil||0))e.setVelocity(0);else if(this.sim<e.knockUntil)e.setVelocity(e.knockX,e.knockY);else if(e.texture.key==='ranged'&&dist<240)e.setVelocity(0);else this.physics.moveToObject(e,this.player,e.speed*(this.sim<(e.slowUntil||0)?e.slowFactor:1));
        if((e.texture.key==='ranged'||e.boss)&&this.sim>e.nextShot&&this.sim>=(e.silenceUntil||0)&&this.sim>=(e.freezeUntil||0)){e.nextShot=this.sim+(e.boss?1.3:2.4);const count=e.boss?8:1;for(let i=0;i<count;i++){const p=this.enemyShots.get(e.x,e.y,'bad-shot');if(!p)continue;p.enableBody(true,e.x,e.y,true,true).setDepth(8);p.damage=4+Math.floor(run.wave/3);p.expires=this.sim+4;const a=Phaser.Math.Angle.Between(e.x,e.y,this.player.x,this.player.y)+(count>1?i*Math.PI*2/count:0);this.physics.velocityFromRotation(a,130+run.wave*2,p.body.velocity);}}});
      for(const group of [this.shots,this.enemyShots])group.getChildren().forEach(p=>{if(p.active&&p.expires<this.sim)p.disableBody(true,true);else if(p.active&&group===this.shots)this.feedback.trail(p);});
      this.drops.getChildren().forEach(d=>{if(!d.active)return;d.setAlpha(Math.min(1,.65+(this.sim-d.born)*3));const dist=Phaser.Math.Distance.Between(d.x,d.y,this.player.x,this.player.y);if(dist<this.skills.stats.pickup)this.physics.moveToObject(d,this.player,320);else d.setVelocity(0);});
      this.weaponSprites.forEach((sprite,i)=>this.attack(sprite,i,dt));
      this.partnerSprites.forEach((p,i)=>{const a=i*Math.PI*2/Math.max(1,this.partnerSprites.length)+2.4,tx=this.player.x+Math.cos(a)*67,ty=this.player.y+Math.sin(a)*58,dx=tx-p.x,dy=ty-p.y;p.x=Phaser.Math.Linear(p.x,tx,Math.min(1,dt*7));p.y=Phaser.Math.Linear(p.y,ty,Math.min(1,dt*7));if(Math.abs(dx)>1)p.setFlipX(dx<0);p.setDepth(5+p.y/1000);p.pose.move(Math.hypot(dx,dy)>3);
        const enemy=this.nearest(p.x,p.y,420);if(enemy&&this.sim>p.next){p.next=this.sim+1.15;p.pose.act(['医者','法师','咒术','偶像','歌势'].includes(p.hero.job)?'cast':'attack');this.feedback.muzzle(p.x,p.y,Phaser.Math.Angle.Between(p.x,p.y,enemy.x,enemy.y),0xc2ee95,'partner');this.fire(p.x,p.y,enemy,10+run.level*1.4,0xc2ee95,1,0,'partner');if(p.hero.job==='医者'){const healed=Math.min(run.stats.maxHp-run.hp,.5);run.hp+=healed;if(healed>0)this.feedback.number(p.x,p.y-35,healed,0xc7f5ac,14,'+'+healed);}}});
      if(this.sim>=this.regenAt){this.regenAt+=5;this.skills.heal(this.skills.stats.regen);}
      if(Math.floor(this.elapsed*5)!==this.hudTick){this.hudTick=Math.floor(this.elapsed*5);updateHud();}
      if(this.remaining<=0&&(run.wave!==20||!this.enemies.getChildren().some(e=>e.active&&e.boss)))this.finishWave();
    }
  }
  try{
    panel.showModal();const response=await fetch('survival/roster.json?v=2');if(!response.ok)throw new Error('角色资源加载失败');roster=await response.json();if(!roster.length)throw new Error('角色清单为空');
    const poses=await fetch('survival/animations.json?v=1');if(!poses.ok)throw new Error('动作清单加载失败');animations=await poses.json();if(roster.some(h=>!animations.characters[h.id]))throw new Error('动作清单缺少角色');
    new Phaser.Game({type:Phaser.AUTO,parent:'stage',backgroundColor:'#b8cfbb',scale:{mode:Phaser.Scale.RESIZE,width:window.innerWidth,height:window.innerHeight},physics:{default:'arcade',arcade:{debug:false}},render:{antialias:true},scene:[Field]});
  }catch(error){show(`<h2 id="panel-title">战场未能载入</h2><p class="error">${escape(error.message)}</p><div class="actions"><button class="primary" onclick="location.reload()">重新载入</button><a href="index.html">返回星域棋战</a></div>`);}
})();
