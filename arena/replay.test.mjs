import test from 'node:test';
import assert from 'node:assert/strict';
import { battle } from './core.mjs';
import { eventChanges,eventActors } from './replay.mjs';
import { createRun,act,prepareTeam,finishRound,addPreparationEvents,unitInfo } from './core.mjs';
import { actionFeedback } from './replay.mjs';
const u=(uid,id,hp=7,shield=0)=>({uid,id,hp,shield,atk:3,level:1,xp:0,perk:null});
test('end-turn growth records each source once and starts replay before combat',()=>{
 const s=createRun('phase');s.team=[u('target','goutan'),u('grow','likou'),u('all','huali'),u('self','sishi'),null];
 const team=prepareTeam(s),once=structuredClone(s);prepareTeam(s);assert.deepEqual(s,once);
 assert.equal(s.preparationEvents.filter(e=>e.type==='roundEnd').length,3);
 const replay=addPreparationEvents(battle(team,[u('enemy','agari',20)],'phase'),s);
 assert.equal(replay.events[0].type,'roundEndStart');assert.deepEqual(replay.events.filter(e=>e.type==='roundEnd').map(e=>e.actors[0].uid),['grow','all','self']);
 s.team[0]=u('income','yuji');finishRound(s,{winner:'draw'});assert.equal(s.gold,11);assert.ok(s.roundStartEvents.some(e=>e.gold===1&&e.uids.includes('income')));
});
test('buy, food, sell, upgrade and once-per-round refresh gains have visible feedback',()=>{
 const s=createRun('shop-feedback');s.team[0]=u('friend','goutan');s.shop[0]={id:'hoshimi',frozen:false};let before=structuredClone(s);act(s,{type:'buy',slot:0,to:1});assert.ok(actionFeedback(before,s,{type:'buy',to:1},unitInfo).some(n=>n.atk===1));
 s.team[1]=u('food','suiji');s.foods[0]={id:'milk',frozen:false};before=structuredClone(s);act(s,{type:'food',slot:0,to:1});assert.ok(actionFeedback(before,s,{type:'food',to:1},unitInfo).some(n=>n.hp===4));
 s.gold=10;s.team[1]=u('sell','chiharu');before=structuredClone(s);act(s,{type:'sell',slot:1});assert.ok(actionFeedback(before,s,{type:'sell',slot:1},unitInfo).some(n=>n.atk===1&&n.hp===1));
 s.team[1]=u('roll','zhouyi');before=structuredClone(s);act(s,{type:'roll'});assert.ok(actionFeedback(before,s,{type:'roll'},unitInfo).some(n=>n.gold===1));before=structuredClone(s);act(s,{type:'roll'});assert.ok(!actionFeedback(before,s,{type:'roll'},unitInfo).some(n=>n.gold));
 s.team[0].xp=1;s.team[2]=u('merge','goutan');before=structuredClone(s);act(s,{type:'merge',from:2,to:0});assert.ok(actionFeedback(before,s,{type:'merge',from:2,to:0},unitInfo).some(n=>n.level===2));
});
test('moving a token inserts it and preserves the other tokens order',()=>{const s=createRun();s.team=[u('a','goutan'),u('b','agari'),u('c','ein'),null,null];act(s,{type:'move',from:0,to:2});assert.deepEqual(s.team.slice(0,3).map(x=>x.uid),['b','c','a']);});
test('damage, shield absorption, healing and growth stay attributed to the correct side and unit',()=>{
 const before={a:[u('same','goutan')],b:[u('same','goutan',7,4)]},after=structuredClone(before);
 after.b[0].shield=1;after.a[0].hp=4;after.a[0].atk=5;
 const changes=eventChanges(after,before);assert.deepEqual(changes.map(({side,hp,atk,shield})=>({side,hp,atk,shield})),[{side:'a',hp:-3,atk:2,shield:0},{side:'b',hp:0,atk:0,shield:-3}]);
 after.a[0].hp=6;assert.equal(eventChanges(after,before)[0].hp,-1);
 assert.equal(eventChanges(before,after)[0].hp,1);
});
test('summons and exits use identities rather than shifted lineup slots',()=>{
 const before={a:[u('front','songlv'),u('back','yujiu')],b:[]},after={a:[u('summon','dancer'),u('back','yujiu')],b:[]};
 assert.deepEqual(eventChanges(after,before).map(({uid,type})=>({uid,type})),[{uid:'summon',type:'enter'},{uid:'front',type:'exit'}]);
});
test('combat skill events include the actor, while old replays still infer front attackers',()=>{
 const result=battle([u('sniper','yua')],[u('target','agari',12)],'fx');
 assert.deepEqual(result.events.find(e=>e.type==='snipe').actors,[{side:'a',uid:'sniper'}]);
 const old={type:'attack',text:'互攻',a:[u('a','agari')],b:[u('b','agari')]};
 assert.deepEqual(eventActors(old,null,x=>x.id),[{side:'a',uid:'a'},{side:'b',uid:'b'}]);
 const previous={a:[u('support','kouichi')],b:[]};
 assert.deepEqual(eventActors({type:'support',text:'kouichi 发动支援',a:[],b:[]},previous,x=>x.id),[{side:'a',uid:'support'}]);
});
