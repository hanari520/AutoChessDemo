'use strict';
module.exports.run = function(A) {
  const assert=require('node:assert/strict');
  const game=globalThis;
  const reset=()=>{A.newGame();A.S.phase='prep';A.S.board=Array(64).fill(null);A.S.bench=Array(8).fill(null);A.S.items=[];A.S.shop=[];};
  const make=(id,star=1,items=[])=>{
    const d=A.byId(id),mul=A.STAR_M[d.cost]**(star-1);
    return {uid:A.S.uid++,id,star,sks:A.SKILL_STAR_M[d.cost]**(star-1),atk:Math.round(d.atk*mul),
      hp:Math.round(d.hp*A.HP_SCALE*mul),maxhp:Math.round(d.hp*A.HP_SCALE*mul),items:items.slice()};
  };
  const components=items=>items.flatMap(k=>A.ITEMS[k].from?components(A.ITEMS[k].from):[k]).sort();
  const inventory=()=>[...A.S.items,...game.botMembers().flatMap(u=>u.items||[])];
  const check=(name,fn)=>{fn();console.log('PASS '+name);};
  check('a full bench buys an immediate merge without selling another piece',()=>{
    reset();A.S.lvl=3;A.S.gold=1;A.S.board[35]=make('ein');A.S.board[36]=make('ein');
    A.S.bench=['yua','sanli','yujiu','suiji','kanban','zhouyi','pako','aza'].map(id=>make(id,2));A.S.shop=[A.byId('ein')];
    const before=A.S.bench.map(u=>u.uid);
    assert.equal(game.botBuyAvailable(game.botPlan(),1),1);
    assert.equal(A.S.bench.length,8);assert.deepEqual(A.S.bench.map(u=>u.uid),before);
    assert.equal(game.botMembers().filter(u=>u.id==='ein').length,1);
    assert.equal(game.botMembers().find(u=>u.id==='ein').star,2);
  });
  check('gear follows deployed holders and preserves every component',()=>{
    reset();A.S.board[35]=make('ein',2);A.S.board[43]=make('yujiu',3);A.S.board[44]=make('sanli',2);
    A.S.bench[0]=make('yua',1,['armor','staff']);A.S.items=['sword','bow','mana','mana','armor','vamp'];
    const before=components(inventory());game.botEquipGear();
    assert.deepEqual(components(inventory()),before);
    assert.deepEqual(A.S.bench[0].items,[]);
    assert.ok(game.botBoard().every(u=>u.items.length<=game.maxEquip()));
    assert.ok(game.botBoard().some(u=>u.items.length>0));
    game.botEquipGear();assert.deepEqual(components(inventory()),before);
  });
  check('physical, defensive and mana items favor suitable roles',()=>{
    reset();const tank=make('ein',2),ranger=make('yujiu',2),caster=make('sanli',2),passive=make('youyi',2);
    assert.ok(game.botGearValue(tank,'aegis')>game.botGearValue(ranger,'aegis'));
    assert.ok(game.botGearValue(ranger,'twinbows')>game.botGearValue(tank,'twinbows'));
    assert.ok(game.botGearValue(caster,'twinshell')>game.botGearValue(passive,'twinshell'));
  });
  check('empty/full boards never lose items or exceed slots',()=>{
    reset();A.S.items=['sword','armor'];game.botEquipGear();assert.deepEqual(components(inventory()),['armor','sword']);
    A.S.board[35]=make('ein',2);A.S.items=Array(20).fill('flamejudge');
    const before=components(inventory());game.botEquipGear();
    assert.equal(A.S.board[35].items.length,game.maxEquip());assert.deepEqual(components(inventory()),before);
  });
  check('a large team equips more than twelve items when slots are free',()=>{
    reset();A.S.lvl=5;['ein','sanli','yujiu','yua','aza'].forEach((id,i)=>A.S.board[35+i]=make(id,2));
    A.S.items=Array(15).fill('flamejudge');game.botEquipGear();
    assert.equal(A.S.items.length,0);assert.equal(game.botBoard().reduce((n,u)=>n+u.items.length,0),15);
    assert.ok(game.botBoard().every(u=>u.items.length<=game.maxEquip()));
  });
  check('equipment and formation leave all combat rules and existing unit stats intact',()=>{
    reset();A.S.lvl=3;A.S.board[35]=make('ein',2);A.S.board[43]=make('sanli',2);A.S.items=['armor','bow'];
    const units=JSON.stringify(A.UNITS),stats=game.botMembers().map(u=>[u.uid,u.atk,u.maxhp,u.star,u.sks]);
    game.botEquipGear();game.botFormation();
    assert.equal(JSON.stringify(A.UNITS),units);
    assert.deepEqual(game.botMembers().map(u=>[u.uid,u.atk,u.maxhp,u.star,u.sks]).sort(),stats.sort());
  });
  check('fog suppresses opponent inspection',()=>{
    reset();A.S.dailyCurse={id:'dc_fog'};
    // Use the real daily modifier resolver rather than replacing policy code.
    A.S.enemyBoard[3]=make('ein',3);assert.equal(game.botFogged(),true);assert.equal(game.botOpponentPower(),0);
    A.S.dailyCurse=null;
  });
  check('planning is inert outside preparation',()=>{
    reset();A.S.phase='battle';const before=JSON.stringify(A.S);game.botPrep();assert.equal(JSON.stringify(A.S),before);
  });
  check('cancelled async search calls completion once without spending',()=>{
    reset();A.S.auto=false;A.S.gold=100;const before=A.S.gold;let done=0;
    game.botSearch(()=>done++);assert.equal(done,1);assert.equal(A.S.gold,before);
  });
  check('checkpoint spending is restricted to the classic campaign',()=>{
    reset();A.S.round=25;assert.equal(game.botCheckpoint(),true);assert.equal(game.botEconFloor('economy'),5);
    A.S.arena=true;assert.equal(game.botCheckpoint(),false);assert.ok(game.botEconFloor('economy')>5);
    A.S.arena=false;A.S.daily=true;assert.equal(game.botCheckpoint(),false);
    A.S.daily=false;A.S.curses=['dreamless'];assert.equal(game.botCheckpoint(),false);
    A.S.curses=[];A.S.round=24;assert.equal(game.botCheckpoint(),false);
  });
  check('checkpoint search pays the real refresh cost and stops at its reserve',()=>{
    reset();A.S.round=25;A.S.lvl=1;A.S.gold=7;A.S.board[35]=make('ein');
    const spent=A.S.stats.goldSpent,refresh=game.refreshCost();
    game.botSearch();assert.equal(A.S.gold,7-refresh);assert.equal(A.S.stats.goldSpent-spent,refresh);
    const after=A.S.gold;game.botSearch();assert.equal(A.S.gold,after);
  });
  check('checkpoint XP either unlocks a usable population slot or saves gold',()=>{
    reset();A.S.round=25;A.S.lvl=7;A.S.xp=0;A.S.gold=30;
    ['ein','sanli','yujiu','yua','aza','pako','suiji','kanban'].forEach((id,i)=>A.S.bench[i]=make(id,2));
    game.botLevel();assert.equal(A.S.xp,0);assert.equal(A.S.gold,30);
    A.S.xp=game.xpNeed(7)-4;game.botLevel();assert.equal(A.S.lvl,8);assert.equal(A.S.gold,25);
    const before=A.S.gold;game.botLevel();assert.equal(A.S.gold,before);
  });
  check('economic augment value decreases as the remaining campaign shortens',()=>{
    reset();A.S.board[43]=make('sanli',2);A.S.round=25;const early=game.botAugScore({id:'dropplus'});
    A.S.round=75;assert.ok(early>game.botAugScore({id:'dropplus'}));
    A.S.round=25;assert.equal(game.botAugPick([{id:'dropplus'},{id:'atk'}]),0);
    A.S.round=75;assert.equal(game.botAugPick([{id:'dropplus'},{id:'atk'}]),1);
  });
  check('presentation delays do not change search decisions',()=>{
    assert.ok(game.resetSimSeed,'Run with SEED=1');
    const snapshot=()=>JSON.stringify({gold:A.S.gold,shop:A.S.shop,board:A.S.board,bench:A.S.bench,pool:A.S.pool});
    const setup=()=>{game.resetSimSeed(81);reset();A.S.round=16;A.S.lvl=7;A.S.hp=12;A.S.gold=90;A.S.auto=true;A.S.board[35]=make('ein',2);A.S.shop=[];};
    setup();game.botSearch();const sync=snapshot();
    setup();let done=0;const queue=[],old=global.setTimeout;
    global.setTimeout=fn=>{queue.push(fn);return queue.length;};
    try{game.botSearch(()=>done++);while(queue.length)queue.shift()();}finally{global.setTimeout=old;}
    assert.equal(done,1);assert.equal(snapshot(),sync);
  });
  check('pending search from a previous game cannot spend in the new game',()=>{
    reset();A.S.round=16;A.S.hp=12;A.S.gold=90;A.S.auto=true;
    const queue=[],old=global.setTimeout;let done=0;
    global.setTimeout=fn=>{queue.push(fn);return queue.length;};
    try{
      game.botSearch(()=>done++);assert.ok(queue.length);
      reset();A.S.auto=true;const before=JSON.stringify(A.S);
      while(queue.length)queue.shift()();
      assert.equal(done,1);assert.equal(JSON.stringify(A.S),before);
    }finally{global.setTimeout=old;}
  });
  check('preparation steps preserve the async callback contract used by autoPilot',()=>{
    reset();A.S.round=16;A.S.hp=12;A.S.gold=90;A.S.auto=true;
    const step=game.botPrepSteps().find(s=>s.n==='搜牌与追星');
    assert.equal(step.fn.length,1);
    const queue=[],old=global.setTimeout;let done=0;
    global.setTimeout=fn=>{queue.push(fn);return queue.length;};
    try{step.fn(()=>done++);assert.equal(done,0);while(queue.length)queue.shift()();assert.equal(done,1);}
    finally{global.setTimeout=old;}
  });
  console.log('Bot policy contracts passed');
};
