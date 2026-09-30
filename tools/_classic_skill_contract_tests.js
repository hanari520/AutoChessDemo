/* Description-level checks against the real classic combat functions.
 * CLASSIC_CONTRACT_TEST=1 node tools/sim.js */
'use strict';
const assert = require('node:assert/strict');
exports.run = function(A) {
  const failures=[];let passed=0;
  function check(name,fn){try{globalThis.newGame();fn();passed++;console.log('✓ '+name);}catch(error){failures.push(name+': '+error.message);console.log('✗ '+name+': '+error.message);}}
  const mk=(id,side=0,x=3,y=4)=>{
    const b=A.makeBattleUnit({uid:A.S.uid++,id,star:1,sks:1,hp:10000,maxhp:10000,atk:100,items:[]},side,x,y);
    Object.assign(b,{hp:5000,maxhp:10000,mana:30,ar:0,mr:0,shield:0});return b;
  };
  for(const id of Object.keys(A.COMBAT_KITS)){
    const kit=A.COMBAT_KITS[id];if(kit.passive)continue;
    check(id+' active skill applies every configured control/debuff',()=>{
      const u=mk(id),mate=mk('ein',0,4,5),foes=[mk('goutan',1,4,4),mk('kanban',1,5,4),mk('ein',1,6,4),mk('yuji',1,7,4)];
      const units=[u,mate,...foes];if(kit.stealShield)foes.forEach(f=>f.shield=500);
      A.castSkill(u,foes[0],units,1);
      assert.equal(u._casting,false);assert.ok(units.every(v=>Number.isFinite(v.hp)&&Number.isFinite(v.shield)));
      const any=(field)=>foes.some(f=>f[field]>0);
      for(const [key,field] of Object.entries({stun:'stun',freeze:'frozen',petrify:'petrifyT',silence:'silenceT',slow:'slowT',bleed:'poisonT',wound:'v3VulnT',weaken:'atkDownT',shred:'arDownT',sunder:'mrDownT',healBlock:'v3HealLockT',reflectSkill:'v3ReflectT',noShield:'noShieldT',enemyHealDown:'healDownT'})){
        // Guard slow only triggers on a successful block, not on cast.
        if(kit[key]&&!(kit.mode==='guard'&&key==='slow'))assert.ok(any(field),key+' never applied');
      }
      if(kit.echo)assert.ok(foes.some(f=>f.v3CastEcho));
      if(kit.heal)assert.ok(units.filter(v=>v.side===0).some(v=>v.hp>5000));
      if(kit.shield&&!kit.heal)assert.ok(u.shield>0);
    });
  }
  for(const [id,ms] of [['hoshimi',2000],['miyue',2000],['yukie',1500]])check(id+' bleed lasts the described duration',()=>{
    const u=mk(id),f=mk('goutan',1,4,4);A.castSkill(u,f,[u,f],1);assert.equal(f.poisonT,ms);
  });
  check('Shengge grants exactly 3 seconds of haste only to cleansed allies',()=>{
    const u=mk('shengge'),a=mk('ein',0,4,5),b=mk('likou',0,2,5),f=mk('goutan',1,4,4);a.stun=1000;
    A.castSkill(u,f,[u,a,b,f],1);assert.equal(a.stun,0);assert.equal(a.v3HasteT,3000);assert.ok(!b.v3HasteT);
  });
  check('Goutan interception shares only the next hit and mutually linked guards cannot recurse',()=>{
    const a=mk('goutan'),b=mk('ein',0,4,5),f=mk('yua',1,4,4);A.castSkill(a,f,[a,b,f],1);
    a.shield=b.shield=0;a.sigMark=b.sigMark=null;
    a.v3LinkTo=b.uid;a.v3LinkT=3500;a.v3LinkShare=.3;
    const before=a.hp;A.dealDamage(f,b,100,[a,b,f],'pure');assert.ok(a.hp<before);assert.equal(b.v3LinkT,0);
    const after=a.hp;A.dealDamage(f,b,100,[a,b,f],'pure');assert.equal(a.hp,after);
  });
  check('Quanrong thorns works while its shield holds and stops after it breaks',()=>{
    const u=mk('quanrong'),f=mk('goutan',1,4,4);A.castSkill(u,f,[u,f],1);u.sigMark=null;
    const before=f.hp;A.dealDamage(f,u,100,[u,f],'pure');assert.ok(f.hp<before);
    u.shield=0;const after=f.hp;A.dealDamage(f,u,100,[u,f],'pure');assert.equal(f.hp,after);
  });
  console.log(`Classic skill contracts: ${passed} passed, ${failures.length} failed`);
  assert.deepEqual(failures,[]);
};
