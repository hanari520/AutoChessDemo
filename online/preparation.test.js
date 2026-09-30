import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,applyAction,advancePhase,viewFor} from './core.js';
import {EQUIPMENT,recipe} from './equipment.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const game=()=>createGame({seed:'prep-controls',players:Array.from({length:8},(_,i)=>({id:`p${i}`,name:`P${i}`}))});
test('all equipment descriptions and 21 recipes match the classic catalog',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const literal=html.match(/const ITEMS = (\{[\s\S]*?\n\});/)[1];
  assert.equal(JSON.stringify(EQUIPMENT),JSON.stringify(vm.runInNewContext(`(${literal})`)));
  const crafted=Object.entries(EQUIPMENT).filter(([,item])=>item.from);
  assert.equal(crafted.length,21);
  for(const [id,item] of crafted){
    assert.equal(recipe(...item.from),id);assert.equal(recipe(...[...item.from].reverse()),id);
    const state=game(),seat=state.seats[0];seat.items=[...item.from,'bow'];
    applyAction(state,0,{type:'combine',a:0,b:1});assert.deepEqual(seat.items,[id,'bow']);
  }
});
test('invalid crafting is atomic and full equipment slots retain excess items',()=>{
  const state=game(),seat=populate(state);applyAction(state,0,{type:'autoDeploy'});
  seat.items=['flamejudge','sword'];let before=JSON.stringify(state);
  assert.throws(()=>applyAction(state,0,{type:'combine',a:0,b:1}),/recipe/);
  assert.equal(JSON.stringify(state),before);
  for(const unit of seat.board.filter(Boolean))unit.items=['flamejudge','aegis','tidejewel'];
  applyAction(state,0,{type:'autoEquip'});assert.deepEqual(seat.items,['flamejudge','sword']);
});
function populate(state){
  const seat=state.seats[0];seat.gold=100;
  for(let i=0;i<4;i++)applyAction(state,0,{type:'buy',slot:i});
  return seat;
}
test('automatic deployment and tidying conserve ownership, equipment, pool and currency',()=>{
  const state=game(),seat=populate(state);
  const owned=seat.bench.filter(Boolean);owned[0].items.push('sword');
  const before=JSON.stringify({pool:state.pool,gold:seat.gold,items:seat.items});
  const ids=owned.map(u=>u.uid).sort((a,b)=>a-b);
  applyAction(state,0,{type:'autoDeploy'});
  assert.equal(seat.board.filter(Boolean).length,seat.level);
  assert.ok(seat.board.slice(0,32).every(u=>!u));
  assert.deepEqual([...seat.board,...seat.bench].filter(Boolean).map(u=>u.uid).sort((a,b)=>a-b),ids);
  const board=JSON.stringify(seat.board);
  applyAction(state,0,{type:'autoDeploy'});
  assert.equal(JSON.stringify(seat.board),board,'repeat preserves formation');
  applyAction(state,0,{type:'tidy'});
  assert.ok(seat.bench.slice(seat.bench.filter(Boolean).length).every(u=>!u));
  assert.equal(JSON.stringify({pool:state.pool,gold:seat.gold,items:seat.items}),before);
  assert.equal([...seat.board,...seat.bench].filter(Boolean).flatMap(u=>u.items).length,1);
});
test('one click equipment prioritizes carry/frontline, retains overflow and unequips',()=>{
  const state=game(),seat=populate(state);applyAction(state,0,{type:'autoDeploy'});
  const team=seat.board.filter(Boolean);team[0].job='守护';team[1].job='法师';
  seat.items=['sword','staff','mana','armor','armor','armor','bow'];
  applyAction(state,0,{type:'autoEquip'});
  assert.deepEqual(team[1].items,['spellblade','bow']);
  assert.deepEqual(team[0].items,['bastioncoil','aegis']);
  assert.deepEqual(seat.items,[]);
  applyAction(state,0,{type:'unequip',uid:team[0].uid});
  assert.deepEqual(seat.items,['bastioncoil','aegis']);
  assert.deepEqual(team[0].items,[]);
  assert.throws(()=>applyAction(state,1,{type:'unequip',uid:team[1].uid}),/not owned/);
});
test('shop lock persists through income and never leaks opponents private lock state',()=>{
  const state=game(),seat=state.seats[0];
  applyAction(state,0,{type:'lockShop'});const shop=JSON.stringify(seat.shop);
  assert.equal(viewFor(state,0).me.shopLocked,true);
  assert.equal(viewFor(state,1).players[0].shopLocked,undefined);
  advancePhase(state);advancePhase(state);advancePhase(state);
  assert.equal(JSON.stringify(seat.shop),shop);
  assert.equal(viewFor(state,0).me.shopLocked,false,'classic lock expires after preserving one round');
  applyAction(state,0,{type:'lockShop'});
  applyAction(state,0,{type:'lockShop'});
  assert.equal(viewFor(state,0).me.shopLocked,false);
});
test('all preparation helpers reject ready, combat and eliminated seats without mutations',()=>{
  for(const type of ['autoEquip','autoDeploy','tidy','unequip','lockShop','combine','combineWorn']){
    for(const mode of ['ready','combat','eliminated']){
      const state=game();if(mode==='ready')state.seats[0].ready=true;
      if(mode==='combat')state.phase='combat';if(mode==='eliminated')state.seats[0].alive=false;
      const before=JSON.stringify(state);
      assert.throws(()=>applyAction(state,0,{type,uid:1}));
      assert.equal(JSON.stringify(state),before);
    }
  }
});
