const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('./core.js');
const roster=require('./roster.json');
const hero=roster.find(h=>h.id==='ein');
function shopRun(){const s=C.newRun(hero,0,42);s.phase='shop';s.coins=200;return s;}
test('All existing characters have valid perks and starting weapons',()=>{
  assert.equal(roster.length,50);assert.equal(new Set(roster.map(h=>h.id)).size,50);
  for(const h of roster){const s=C.newRun(h);assert.ok(C.WEAPONS[s.weapons[0].id]);assert.ok(s.hp>0);assert.ok(C.restore(C.snapshot(s),roster));}
});
test('Only combat drops award materials and experience',()=>{
  const s=C.newRun(hero);C.collect(s,20);assert.equal(s.coins,0);
  C.beginWave(s);C.collect(s,20);assert.equal(s.coins,20);assert.equal(s.level,2);assert.equal(s.pendingLevels,1);assert.equal(s.xp,9);
});
test('Uncollected material reserves double future drops until exhausted',()=>{
  const s=C.newRun(hero);s.reserve=3;C.beginWave(s);C.collect(s,2);assert.equal(s.coins,4);assert.equal(s.reserve,1);C.collect(s,2);assert.equal(s.coins,7);assert.equal(s.reserve,0);
});
test('Wave settlement cannot be applied twice',()=>{
  const s=C.newRun(hero);s.stats.harvest=4;C.beginWave(s);C.collect(s,20);
  assert.ok(C.endWave(s,roster));assert.equal(s.wave,2);assert.equal(s.phase,'upgrade');assert.equal(s.coins,24);
  assert.equal(C.endWave(s,roster),false);assert.equal(s.coins,24);assert.equal(s.wave,2);
  assert.ok(C.pickUpgrade(s,0));assert.equal(s.phase,'shop');assert.equal(s.pendingLevels,0);assert.equal(C.pickUpgrade(s,0),false);
});
test('Six weapon slots allow valid merges and reject a seventh weapon',()=>{
  const s=shopRun();s.weapons=Object.keys(C.WEAPONS).slice(0,6).map(id=>({id,tier:2}));
  s.offers=[{type:'weapon',id:'blade',price:10}];assert.equal(C.buy(s,0),false);assert.equal(s.coins,200);
  s.weapons[0].tier=1;assert.ok(C.buy(s,0));assert.equal(s.weapons.length,6);assert.equal(s.weapons.find(w=>w.id==='blade').tier,2);
});
test('Merging cascades without losing weapons or charging twice',()=>{
  const s=shopRun();s.weapons=[{id:'blade',tier:1},{id:'blade',tier:2},{id:'bow',tier:1}];s.offers=[{type:'weapon',id:'blade',price:15}];
  assert.ok(C.buy(s,0));assert.equal(s.coins,185);assert.deepEqual(s.weapons,[{id:'bow',tier:1},{id:'blade',tier:3}]);assert.equal(C.buy(s,0),false);
});
test('Locked offers persist through rerolls and wave changes',()=>{
  const s=shopRun();s.offers=[{type:'item',id:'heart',price:12,locked:true},null,null,null];const locked=JSON.stringify(s.offers[0]);
  assert.ok(C.refresh(s,roster));assert.equal(JSON.stringify(s.offers[0]),locked);
  C.beginWave(s);C.endWave(s,roster);assert.equal(JSON.stringify(s.offers[0]),locked);
});
test('Purchases require sufficient materials and are restricted to the shop',()=>{
  const s=shopRun();s.coins=10;s.offers=[{type:'item',id:'heart',price:11}];assert.equal(C.buy(s,0),false);
  s.coins=11;s.phase='battle';assert.equal(C.buy(s,0),false);s.phase='shop';const hp=s.hp;assert.ok(C.buy(s,0));assert.equal(s.coins,0);assert.equal(s.hp,hp+6);
});
test('Companions are unique, have a three-person limit, and cannot include the leader',()=>{
  const s=shopRun();s.companions=roster.filter(h=>h.id!==hero.id).slice(0,3).map(h=>h.id);s.offers=[{type:'companion',id:roster[10].id,price:1}];assert.equal(C.buy(s,0),false);
  s.companions=[];s.offers[0]={type:'companion',id:hero.id,price:1};assert.equal(C.buy(s,0),false);
  const partner=roster.find(h=>h.id!==hero.id);
  s.offers[0]={type:'companion',id:partner.id,price:1};assert.ok(C.buy(s,0));s.offers[0]={type:'companion',id:partner.id,price:1};assert.equal(C.buy(s,0),false);
});
test('Save restoration rejects corrupt snapshots and does not save live combat',()=>{
  const s=C.newRun(hero);assert.ok(C.restore(C.snapshot(s),roster));s.wave=21;assert.equal(C.restore(s,roster),null);
  s.wave=1;s.weapons[0].id='invalid';assert.equal(C.restore(s,roster),null);
  const battle=C.newRun(hero);C.beginWave(battle);assert.equal(C.snapshot(battle),null);
});
test('Twenty successful settlements finish the run without a twenty-first wave',()=>{
  const s=C.newRun(hero);for(let wave=1;wave<=20;wave++){assert.equal(s.wave,wave);assert.ok(C.beginWave(s));assert.ok(C.endWave(s,roster));}
  assert.equal(s.phase,'victory');assert.equal(s.wave,20);assert.equal(C.beginWave(s),false);assert.equal(C.endWave(s,roster),false);
});
test('Armor reduces damage and defeat is terminal for combat',()=>{
  const s=C.newRun(hero);C.beginWave(s);const first=C.hit(s,10);s.stats.armor=12;const armored=C.hit(s,10);assert.ok(armored<first);C.hit(s,1000);assert.equal(s.hp,0);assert.equal(s.phase,'defeat');assert.equal(C.hit(s,5),0);
});
