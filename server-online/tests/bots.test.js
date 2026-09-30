import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, advancePhase, viewFor } from '../src/core.js';
import { BOT_NAMES, botPolicy, pickBotName } from '../src/bots.js';
import { EQUIPMENT } from '../src/equipment.js';
import { createOnlineBot } from '../src/bot-adapter.js';

test('bot name pool serves unused names first and numbers repeats', () => {
  assert.equal(pickBotName([]), '阿铁');
  assert.equal(pickBotName(['阿铁']), '阿芯');
  assert.equal(pickBotName([...BOT_NAMES.slice(0, 3)]), BOT_NAMES[3]);
  assert.equal(pickBotName([...BOT_NAMES]), '阿铁2');
  assert.equal(pickBotName([...BOT_NAMES, '阿铁2']), '阿芯2');
});

test('bot decisions are deterministic for a given game seed', () => {
  const players = Array.from({ length: 8 }, (_, i) =>
    (i === 0 ? { id: 'p0', name: '人类' } : { id: `b${i}`, name: `机器人${i}`, bot: true }));
  const run = () => {
    const game = createGame({ seed: 'determinism', players });
    for (let seat = 1; seat < 8; seat++) botPolicy(game, seat);
    return JSON.stringify(game);
  };
  assert.equal(run(), run());
});

test('bots deploy the population unlocked by XP in the same prep and support eleven slots',()=>{
  const players=Array.from({length:8},(_,i)=>({id:`b${i}`,name:`B${i}`,bot:true}));
  const game=createGame({seed:'bot-population',players}),seat=game.seats[0];
  game.round=2;seat.level=7;seat.xp=47;seat.gold=12;
  for(let i=0;i<8;i++)seat.bench[i]={uid:100+i,id:'ein',star:1,cost:1,items:[]};
  botPolicy(game,0);assert.equal(seat.level,8);assert.equal(seat.board.filter(Boolean).length,8);
  seat.ready=false;seat.level=11;seat.gold=0;
  for(let i=0;i<3;i++)seat.bench[i]={uid:200+i,id:'yujiu',star:1,cost:1,items:[]};
  botPolicy(game,0);assert.equal(seat.board.filter(Boolean).length,11);
});

test('online bots reclaim, combine and assign items through legal preparation actions',()=>{
  const players=Array.from({length:8},(_,i)=>({id:`b${i}`,name:`B${i}`,bot:true}));
  const game=createGame({seed:'bot-equipment',players}),seat=game.seats[0];
  game.round=2;seat.openingGranted=true;seat.level=3;seat.gold=0;seat.shop.fill(null);
  const make=(id,uid,items=[])=>({id,uid,star:3,cost:1,items:items.slice()});
  seat.board.fill(null);seat.bench.fill(null);
  seat.board[35]=make('ein',100);seat.board[43]=make('yujiu',101);seat.board[44]=make('sanli',102);
  seat.bench[0]={...make('yua',103,['armor','armor']),star:1};seat.items=['bow','bow','mana','mana'];
  const components=keys=>keys.flatMap(k=>EQUIPMENT[k].from?components(EQUIPMENT[k].from):[k]).sort();
  const inventory=()=>[...seat.items,...[...seat.board,...seat.bench].filter(Boolean).flatMap(u=>u.items)];
  const before=components(inventory()),pool=JSON.stringify(game.pool);
  botPolicy(game,0);
  assert.equal(seat.ready,true);assert.equal(JSON.stringify(game.pool),pool);
  assert.deepEqual(components(inventory()),before);assert.deepEqual(seat.bench.find(u=>u?.id==='yua').items,[]);
  const holders=Object.fromEntries(seat.board.filter(Boolean).map(u=>[u.id,u.items]));
  assert.deepEqual(holders.ein,['aegis']);assert.deepEqual(holders.yujiu,['twinbows']);
  assert.deepEqual(holders.sanli,['twinshell']);
  assert.ok(seat.board.filter(Boolean).every(u=>u.items.length<=3));
  const locked=JSON.stringify(game);botPolicy(game,0);assert.equal(JSON.stringify(game),locked);
});

test('bots play a full game to completion without escaping errors', () => {
  const players = Array.from({ length: 8 }, (_, i) =>
    (i === 0 ? { id: 'p0', name: '人类' } : { id: `b${i}`, name: `机器人${i}`, bot: true }));
  const game = createGame({ seed: 'bots-full-game', players });

  // The bot flag is passed through the rules core for presentation.
  assert.ok(game.seats.slice(1).every(seat => seat.bot === true));
  assert.equal(game.seats[0].bot, false);
  assert.equal(viewFor(game, 0).players[5].bot, true);
  assert.equal(viewFor(game, 0).players[0].bot, false);

  let castEvents = 0;
  let rounds = 0;

  const humanPlays = () => {
    const seat = game.seats[0];
    if (!seat.alive || seat.ready) return;
    const slot = seat.shop.findIndex(unit => unit && unit.cost <= seat.gold && seat.bench.includes(null));
    if (slot >= 0) applyAction(game, 0, { type: 'buy', slot });
    const benchUnit = seat.bench.find(Boolean);
    if (benchUnit && seat.board.filter(Boolean).length < Math.min(8, seat.level)) {
      applyAction(game, 0, { type: 'move', uid: benchUnit.uid, to: { zone: 'board', slot: 51 } });
    }
    applyAction(game, 0, { type: 'ready' });
  };

  while (!game.complete && rounds < 60) {
    rounds++;
    for (let seat = 1; seat < 8; seat++) botPolicy(game, seat);

    if (rounds === 1) {
      // Every bot bought and deployed during the opening prep window.
      for (let seat = 1; seat < 8; seat++) {
        assert.ok(game.seats[seat].board.filter(Boolean).length >= 1, `bot ${seat} deployed a unit`);
        assert.ok(game.seats[seat].gold < 5, `bot ${seat} spent opening gold`);
        assert.equal(game.seats[seat].ready, true, `bot ${seat} locked in`);
      }
    }

    humanPlays();
    assert.equal(advancePhase(game), 'combat');
    castEvents += game.battles.reduce((count, battle) =>
      count + battle.events.filter(event => event.type === 'cast').length, 0);
    assert.equal(advancePhase(game), 'result');
    advancePhase(game);
  }

  assert.equal(game.complete, true);
  assert.equal(game.phase, 'over');
  assert.ok(rounds <= 40, `game ended within the 40-round cap (took ${rounds})`);
  assert.ok(game.seats.every(seat => Number.isInteger(seat.place) && seat.place >= 1 && seat.place <= 8),
    'all eight seats are ranked');
  // Simultaneous eliminations share a place (see settleCombat), so the places
  // are a non-strict ranking rather than a permutation of 1..8.
  assert.equal(game.seats.filter(seat => seat.place === 1).length, 1, 'exactly one winner');
  assert.ok(castEvents > 0, 'skills were cast across the game');
  assert.ok(game.seats.slice(1).some(seat => seat.wins > 0), 'bots won battles');
});

const botPlayers=()=>Array.from({length:8},(_,i)=>({id:`b${i}`,name:`B${i}`,bot:true}));
const poolTotal=game=>{
  const total={...game.pool};
  for(const seat of game.seats)for(const u of [...seat.board,...seat.bench,...seat.shop,...(seat.openingOffer||[])]){
    if(u)total[u.id]=(total[u.id]||0)+3**(u.star-1);
  }
  return total;
};

test('online planning sees the public locked lineup and ignores private opponent preparation',()=>{
  const a=createGame({seed:'public-intel',players:botPlayers()}),b=structuredClone(a);
  const opponent=a.pairings.find(p=>p.a===0||p.b===0);
  const enemy=opponent.a===0?opponent.b:opponent.a;
  const publicUnit={uid:999,id:'ein',star:2,cost:1,items:[]};
  a.seats[enemy].lastLineup=Array(64).fill(null);a.seats[enemy].lastLineup[38]=publicUnit;
  b.seats[enemy].lastLineup=structuredClone(a.seats[enemy].lastLineup);
  for(let i=1;i<8;i++){
    b.seats[i].board=Array(64).fill(null);b.seats[i].board[32]={...publicUnit,uid:1000+i,star:3};
    b.seats[i].bench.fill(null);b.seats[i].shop.fill(null);b.seats[i].gold=999;
  }
  const visible=createOnlineBot(a,0).state.enemyBoard.find(Boolean);
  assert.equal(visible.uid,999);assert.equal(visible.x,6);
  botPolicy(a,0);botPolicy(b,0);
  assert.deepEqual(a.seats[0],b.seats[0]);assert.equal(a.rng,b.rng);assert.deepEqual(a.pool,b.pool);
});

test('strong bench replacements deploy through swaps on a full board and bench',()=>{
  const game=createGame({seed:'replace-roster',players:botPlayers()}),seat=game.seats[0];
  seat.board.fill(null);seat.bench.fill(null);seat.level=2;
  const make=(id,uid,star)=>({id,uid,star,cost:1,items:[]});
  seat.board[35]=make('yua',101,1);seat.board[36]=make('yujiu',102,1);
  seat.bench[0]=make('ein',103,3);seat.bench[1]=make('sanli',104,3);
  for(let i=2;i<8;i++)seat.bench[i]=make('yua',105+i,1);
  const uids=[...seat.board,...seat.bench].filter(Boolean).map(u=>u.uid).sort((a,b)=>a-b);
  createOnlineBot(game,0).deploy();
  assert.deepEqual(seat.board.filter(Boolean).map(u=>u.id).sort(),['ein','sanli']);
  assert.equal(seat.bench.filter(Boolean).length,8);
  assert.deepEqual([...seat.board,...seat.bench].filter(Boolean).map(u=>u.uid).sort((a,b)=>a-b),uids);
});

test('full bench purchases respect the server rule and never bypass card conservation',()=>{
  const game=createGame({seed:'full-bench',players:botPlayers()}),seat=game.seats[0];
  for(let i=0;i<8;i++)seat.bench[i]={id:'sanli',uid:100+i,star:2,cost:1,items:[]};
  const total=poolTotal(game),gold=seat.gold;
  const bot=createOnlineBot(game,0);
  assert.equal(bot.planner.botBuyAvailable(bot.planner.botPlan(),1),0);
  assert.equal(seat.gold,gold);assert.deepEqual(poolTotal(game),total);
});

test('a deliberate search unlocks a stale locked shop and pays the legal refresh cost',()=>{
  const game=createGame({seed:'locked-search',players:botPlayers()}),seat=game.seats[0];
  game.round=4;seat.gold=30;seat.shopLocked=true;
  const total=poolTotal(game),bot=createOnlineBot(game,0),before=seat.shop.map(u=>u?.uid);
  assert.equal(bot.state.lock,true);assert.equal(bot.attempt({type:'buyXp'}),true);
  const gold=seat.gold;
  bot.planner.botSearch();
  assert.equal(seat.shopLocked,false);assert.ok(seat.gold<=gold-2);
  assert.notDeepEqual(seat.shop.map(u=>u?.uid),before);assert.deepEqual(poolTotal(game),total);
});

test('prelocked, ready, eliminated and non-preparation seats remain unchanged',()=>{
  for(const mutate of [g=>{g.autoLocked=true;},g=>{g.seats[0].ready=true;},
    g=>{g.seats[0].alive=false;},g=>{g.phase='combat';},g=>{g.complete=true;}]){
    const game=createGame({seed:'inactive-bot',players:botPlayers()});mutate(game);
    const before=structuredClone(game);botPolicy(game,0);assert.deepEqual(game,before);
  }
});

test('planner state survives JSON persistence and eight bots conserve the shared pool each prep',()=>{
  let game=createGame({seed:'eight-bots-persist',players:botPlayers()});
  const initial=poolTotal(game);let rounds=0;
  while(!game.complete&&rounds++<40){
    for(let i=0;i<8;i++)botPolicy(game,i);
    for(const seat of game.seats.filter(s=>s.alive)){
      assert.equal(seat.ready,true);assert.equal(seat.botPolicyVersion,'Adaptive v4.3');
      assert.ok(seat.board.filter(Boolean).length<=seat.level);
      assert.ok(seat.gold>=0);assert.equal(seat.bench.length,8);
    }
    assert.deepEqual(poolTotal(game),initial);
    const restored=JSON.parse(JSON.stringify(game));
    if(rounds===2){
      advancePhase(game);advancePhase(restored);assert.deepEqual(game,restored);
    }else advancePhase(game);
    advancePhase(game);advancePhase(game);
    game=JSON.parse(JSON.stringify(game));
  }
  assert.equal(game.complete,true);assert.equal(game.seats.filter(s=>s.place===1).length,1);
});
