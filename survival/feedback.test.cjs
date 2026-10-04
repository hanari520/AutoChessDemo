const test=require('node:test');
const assert=require('node:assert/strict');
const {Feedback,weaponMotion,impact,LIMITS}=require('./feedback.js');

function graphic(){const g={};for(const name of ['clear','setDepth','lineStyle','lineBetween','strokeCircle','fillStyle','fillRoundedRect','fillRect'])g[name]=()=>g;return g;}
function sprite(key){
  const s={visible:true,active:true,frame:{realWidth:64,realHeight:64},x:0,y:0,anims:{timeScale:1},texture:{key}};
  s.setVisible=n=>(s.visible=n,s);s.setPosition=(x,y)=>(s.x=x,s.y=y,s);s.setDisplaySize=(w,h)=>(s.displayWidth=w,s.displayHeight=h,s);
  s.setText=text=>(s.text=String(text),s);s.setTexture=k=>(s.texture.key=k,s);s.setTintFill=c=>(s.tint=c,s);
  for(const name of ['setDepth','setRotation','clearTint','setAlpha','setTint','setFontSize','setColor','setScale','setOrigin'])s[name]=()=>s;
  return s;
}
function setup(reduced=false){
  let shakes=0;const sounds=[];
  const scene={add:{graphics:graphic,image:(_,__,key)=>sprite(key),text:()=>sprite('text')},cameras:{main:{shake(){shakes++;}}}};
  const fx=new Feedback(scene,{sfx:key=>sounds.push(key)},reduced);
  return {fx,sounds,get shakes(){return shakes;}};
}
test('weapon windup, strike and recovery return to a stable resting pose',()=>{
  for(const kind of ['melee','shot','fan','pulse','orbit']){
    assert.deepEqual(weaponMotion(kind,-1),{reach:0,turn:0,scale:1});
    assert.deepEqual(weaponMotion(kind,1),{reach:0,turn:0,scale:1});
    for(let t=0;t<=.34;t+=.01){const p=weaponMotion(kind,t);assert.ok(Number.isFinite(p.reach)&&Math.abs(p.reach)<50);assert.ok(p.scale>.8&&p.scale<1.3);}
  }
  assert.ok(weaponMotion('melee',.05).reach<0);assert.ok(weaponMotion('melee',.2).reach>30);
  assert.ok(weaponMotion('shot',.13).reach<-5);
  assert.ok(Math.abs(weaponMotion('melee',.34).turn)<.001);
});
test('bosses resist the same weapon knockback without changing damage',()=>{
  for(const weapon of ['blade','wand','bow','mic','fan','satellite','partner']){
    const normal=impact(weapon),boss=impact(weapon,true);assert.ok(normal.speed>boss.speed&&normal.duration>boss.duration);
    assert.ok(normal.hold<=.04);
  }
});
test('FX and text pools are capped, expire and reuse their objects',()=>{
  const {fx}=setup();
  for(let i=0;i<200;i++){fx.burst(i,0,0xffffff,10);fx.ring(i,0,0xffffff,30);fx.image('fx-impact',i,0,30);fx.number(i*50,0,i);}
  for(const [key,limit] of Object.entries(LIMITS))assert.ok(fx.active[key]<=limit);
  const images=fx.imagePool.length,texts=fx.textPool.length;
  fx.update(1,1,[],null);assert.deepEqual(fx.active,{particles:0,images:0,texts:0,rings:0});
  fx.image('fx-impact',0,0,30);fx.number(0,0,5);assert.equal(fx.imagePool.length,images);assert.equal(fx.textPool.length,texts);
});
test('rapid hits aggregate the same enemy, not another nearby enemy',()=>{
  const {fx}=setup(),player=sprite('hero'),enemy=sprite('walker');enemy.serial=1;enemy.displayHeight=48;
  fx.hit(enemy,5,0,0xffffff,'blade',player);fx.hit(enemy,6,0,0xffffff,'blade',player);
  assert.equal(fx.texts.length,1);assert.equal(fx.texts[0].sprite.text,'11');assert.equal(player.anims.timeScale,0);
  enemy.serial=2;fx.hit(enemy,4,0,0xffffff,'wand',player);assert.equal(fx.texts.length,2);
  fx.update(.1,.1,[],player);assert.equal(player.anims.timeScale,1);
});
test('light feedback suppresses shake and hit-stop; clearing restores all holds',()=>{
  const normal=setup(),light=setup(true),player=sprite('hero');
  normal.fx.burst(0,0,0xffffff,10);light.fx.burst(0,0,0xffffff,10);assert.ok(light.fx.particles.length<normal.fx.particles.length);
  light.fx.shake();light.fx.hold(player,.03);assert.equal(light.shakes,0);assert.equal(player.anims.timeScale,1);
  normal.fx.hold(player,.03);assert.equal(player.anims.timeScale,0);normal.fx.clear();assert.equal(player.anims.timeScale,1);
  assert.deepEqual(normal.fx.active,{particles:0,images:0,texts:0,rings:0});
});
