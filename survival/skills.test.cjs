const test=require('node:test'),assert=require('node:assert/strict');
const {Skills}=require('./skills.js'),C=require('./core.js'),D=require('./content.js'),roster=require('./roster.json');
function fixture(id='ein'){
  const run=C.newRun(roster.find(h=>h.id===id),0,42);run.phase='battle';
  const graphic=new Proxy({}, {get:()=>()=>graphic});const sprite={x:0,y:0,pose:{act(){}}};
  const enemies=[0,1,2,3].map(i=>({x:55+i*25,y:0,serial:i+1,hp:1000,maxHp:1000,active:true,displayWidth:40}));
  const scene={sim:3,add:{graphics:()=>graphic},player:sprite,partnerSprites:[],enemies:{getChildren:()=>enemies},feedback:{reduced:false,ring(){},number(){},image(){},slash(){},pulse(){},burst(){}},
    damageEnemy(e,amount){if(!e.active)return 0;const n=Math.min(e.hp,amount);e.hp-=amount;if(e.hp<=0)e.active=false;return n;}};
  const skills=new Skills(scene,()=>run,C,roster);skills.begin();return {run,scene,skills,enemies};
}
test('All 47 active adaptations cast without invalid damage, runaway shields or healing',()=>{
  for(const h of roster){const f=fixture(h.id),c=f.skills.casters[0];if(c.signature.mode==='passive')continue;
    f.run.hp=10;f.skills.cast(c,f.enemies[0]);f.skills.update(.5);assert.ok(f.enemies.every(e=>Number.isFinite(e.hp)&&e.hp<=1000));assert.ok(f.run.hp<=f.run.stats.maxHp);assert.ok(f.skills.shield<=f.run.stats.maxHp*.65);assert.ok(f.skills.casts>0);
  }
});
test('Shields absorb damage, expire on simulation time, and rain charges actually evade hits',()=>{
  const f=fixture();f.skills.grantShield(8);assert.equal(f.skills.incoming(5),0);assert.equal(f.skills.shield,3);assert.equal(f.skills.incoming(7),4);
  f.skills.grantShield(8);f.skills.casters[0].next=999;f.scene.sim+=6;f.skills.update(.1);assert.equal(f.skills.shield,0);
  f.skills.rainCharges=1;assert.equal(f.skills.incoming(100),0);assert.equal(f.skills.rainCharges,0);
});
test('Control duration is resisted by bosses; DOT and zones stay bounded and expire',()=>{
  const f=fixture('xuezhu'),e=f.enemies[0],boss=f.enemies[1];boss.boss=true;
  f.skills.status(e,{freeze:2});f.skills.status(boss,{freeze:2});assert.equal(e.freezeUntil-f.scene.sim,2);assert.equal(boss.freezeUntil-f.scene.sim,.5);
  const c=f.skills.casters[0];for(let i=0;i<30;i++)f.skills.zone(c,e,10);assert.equal(f.skills.zones.length,12);f.scene.sim+=4;c.next=999;f.skills.update(.1);assert.equal(f.skills.zones.length,0);
});
test('Passive heroes trigger on actual weapon hits rather than timed casts',()=>{
  for(const id of ['zhouyi','yuji','youyi']){const f=fixture(id);f.run.hp=10;f.skills.update(.1);assert.equal(f.skills.casts,0);
    for(let i=0;i<8;i++)f.skills.weaponHit(f.enemies[0],'blade',10);
    assert.ok(id==='zhouyi'?f.enemies[0].vulnerable>0:id==='yuji'?f.skills.rainCharges>0:f.run.hp>10);
  }
});
test('Weapon effects chain to distinct enemies and healing uses actual damage',()=>{
  const f=fixture();f.skills.weaponHit(f.enemies[0],'seasonchain',10);assert.equal(f.enemies[0].hp,1000);assert.ok(f.enemies[1].hp<1000);assert.ok(f.enemies[2].hp<1000);assert.equal(f.enemies[3].hp,1000);
  f.run.hp=10;f.skills.weaponHit(f.enemies[0],'crimsonblade',5);assert.equal(f.run.hp,10.2);assert.ok(f.enemies[0].dotUntil>f.scene.sim);
});
test('Passive awakening increases trigger frequency; frost weapon duration matches its description',()=>{
  const f=fixture('yuji'),c=f.skills.casters[0];c.rank=5;
  for(let i=0;i<5;i++)f.skills.weaponHit(f.enemies[0],'blade',10);assert.equal(f.skills.rainCharges,1);
  f.skills.weaponHit(f.enemies[0],'frostseal',10);assert.ok(Math.abs(f.enemies[0].slowUntil-f.scene.sim-1.2)<1e-9);
});
