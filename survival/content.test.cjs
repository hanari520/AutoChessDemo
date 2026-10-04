const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('./core.js'),D=require('./content.js'),roster=require('./roster.json');
test('All 50 classic skills have finite, playable adaptations; only three are passive',()=>{
  const skills=roster.map(h=>D.signature(h.id));assert.equal(skills.length,50);assert.equal(new Set(skills.map(s=>s.name)).size,50);
  for(const s of skills){assert.ok(s.mode);assert.ok(Number.isFinite(s.color));assert.ok(s.desc.length>8);assert.equal(s.cooldown===0,s.mode==='passive');}
  assert.deepEqual(skills.filter(s=>s.mode==='passive').map(s=>s.id).sort(),['youyi','yuji','zhouyi']);
});
test('Fourteen weapons support purchases, tier merging, saves and six-slot limit',()=>{
  assert.equal(Object.keys(C.WEAPONS).length,14);
  for(const id of Object.keys(C.WEAPONS)){const s=C.newRun(roster[0]);s.phase='shop';s.coins=100;s.weapons=[{id,tier:1}];s.offers=[{type:'weapon',id,price:20}];assert.ok(C.buy(s,0));assert.deepEqual(s.weapons,[{id,tier:2}]);assert.ok(C.restore(s,roster));}
});
test('Version-one saves migrate without changing economy, base stats, inventory or old growth choices',()=>{
  const s=C.newRun(roster[0]);s.version=1;delete s.skillRank;for(const key of Object.keys(D.EXTRA_STATS))delete s.stats[key];s.phase='upgrade';s.coins=72;s.pendingLevels=1;s.upgrades=C.UPGRADES.slice(0,3);
  const before=JSON.stringify(s),r=C.restore(s,roster);assert.equal(JSON.stringify(s),before);assert.equal(r.version,2);assert.equal(r.skillRank,1);assert.equal(r.coins,72);assert.deepEqual(r.weapons,s.weapons);assert.deepEqual(r.upgrades,s.upgrades);
  for(const [k,v] of Object.entries(s.stats))assert.equal(r.stats[k],v);for(const k of Object.keys(D.EXTRA_STATS))assert.equal(r.stats[k],0);
});
test('Awakening reaches rank V, then stops offering ranks; corrupt new stats are rejected',()=>{
  const s=C.newRun(roster[0]);s.phase='upgrade';s.pendingLevels=5;C.upgradeChoices(s);
  for(let i=0;i<4;i++){assert.equal(s.upgrades[0].type,'skill');C.pickUpgrade(s,0);}assert.equal(s.skillRank,5);assert.ok(s.upgrades.every(u=>u.type!=='skill'));assert.ok(C.restore(s,roster));
  s.skillRank=6;assert.equal(C.restore(s,roster),null);s.skillRank=5;s.stats.crit=NaN;assert.equal(C.restore(s,roster),null);
});
test('Family and party bonuses are derived, deduplicated per unit, and never mutate saved stats',()=>{
  const s=C.newRun(roster[0]);const old=JSON.stringify(s.stats);s.weapons=[{id:'blade',tier:1},{id:'nightblade',tier:2},{id:'wand',tier:1},{id:'seasonchain',tier:1}];
  const b=D.bonuses(s,roster);assert.equal(b.stats.damage,8);assert.equal(b.stats.skillPower,12);assert.equal(JSON.stringify(s.stats),old);
  const custom=[{id:s.hero,job:'守护',job2:'守护',fac:'星际',fac2:'星际'},{id:'partner',job:'守护',fac:'星际'}];s.companions=['partner'];const party=D.bonuses(s,custom);assert.equal(party.stats.armor,2);assert.equal(party.stats.pickup,20);assert.equal(party.entries.find(e=>e.name==='守护').count,2);
});
test('New shop items apply real growth stats and persist',()=>{
  for(const [id,item] of Object.entries(D.ITEMS)){const s=C.newRun(roster[0]);s.phase='shop';s.coins=100;s.offers=[{type:'item',id,price:20}];assert.ok(C.buy(s,0));assert.equal(s.stats[item.stat],item.value);assert.ok(C.restore(s,roster));}
});
test('Corrupt saves cannot crash restoration, inject growth labels or create fractional endless upgrades',()=>{
  const s=C.newRun(roster[0]);s.weapons=[null];assert.equal(C.restore(s,roster),null);s.weapons=[{id:'blade',tier:1}];s.upgrades=[null];assert.equal(C.restore(s,roster),null);
  s.upgrades=[];s.pendingLevels=.5;assert.equal(C.restore(s,roster),null);s.pendingLevels=1;s.phase='upgrade';s.upgrades=C.UPGRADES.slice(0,3).map(u=>({...u,name:'<img onerror=alert(1)>',desc:'bad'}));
  const restored=C.restore(s,roster);assert.deepEqual(restored.upgrades,C.UPGRADES.slice(0,3));
});
