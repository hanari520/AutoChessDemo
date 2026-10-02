import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,act,prepareTeam,battle,RULESET,ROSTER,migrateResult} from './core.mjs';
import {EVENT_LABELS} from './replay.mjs';
const u=(id,atk=2,hp=10,extra={})=>({uid:id,id,atk,hp,xp:0,level:1,perk:null,...extra});
const fight=(a,b)=>battle(a,b,'original50');
test('food shared growth, tier-one recruitment and teammate level-up trigger permanent skills',()=>{
 const s=createRun('food');s.team=[u('lianshiye'),u('yuji'),u('shengge'),u('mumu'),null];
 s.foods[0]={id:'milk'};act(s,{type:'food',slot:0,to:1});assert.equal(s.team[0].atk,3);assert.equal(s.team[0].hp,11);assert.equal(s.team[1].hp,14);
 s.shop[0]={id:'hoshimi'};act(s,{type:'buy',slot:0,to:4});assert.equal(s.team[4].hp,3);assert.equal(s.team[3].hp,10);
 s.gold=20;s.team[1].xp=1;s.shop[0]={id:'yuji'};act(s,{type:'buy',slot:0,to:1});assert.equal(s.team[2].atk,4);assert.equal(s.team[2].hp,13);
 const hp=s.team[4].hp;s.shop[0]={id:'hoshimi'};act(s,{type:'buy',slot:0,to:4});assert.equal(s.team[4].hp,hp+1,'buying to merge does not trigger the recruitment observer');
});
test('training depends on position, ally levels and the presence of a different level-three ally',()=>{
 const s=createRun('training');s.team=[u('goutan',2,10,{level:3}),u('yukie'),u('miki'),u('haruka'),u('agari')];prepareTeam(s);
 assert.equal(s.team[0].atk,4);assert.equal(s.team[0].hp,13);assert.equal(s.team[3].atk,4);assert.equal(s.team[3].hp,12);assert.equal(s.team[4].hp,10);
 const solo=createRun('solo');solo.team[0]=u('haruka',2,10,{level:3});prepareTeam(solo);assert.equal(solo.team[0].hp,10);
});
test('opening volleys choose distinct victims and attack scaling uses the caster level',()=>{
 const enemies=[u('agari',1,50,{uid:'b0'}),u('agari',1,50,{uid:'b1'}),u('agari',1,50,{uid:'b2'}),u('agari',1,50,{uid:'b3'})];
 for(const [id,type,count,amount] of [['zhijin','volley',2,6],['azi','tripleZap',3,6]]){
  const es=fight([u(id,10,50,{level:3})],enemies).events.filter(e=>e.type===type);assert.equal(es.length,count);assert.equal(new Set(es.map(e=>e.targets[0].uid)).size,count);assert.ok(es.every(e=>e.text.includes(`${amount} 点伤害`)));
 }
});
test('rear attack sniping and rear support have different targets and three-trigger budgets',()=>{
 const b=[u('agari',1,50,{uid:'front'}),u('agari',4,50,{uid:'strong'}),u('agari',1,50,{uid:'rear'})];
 const snipes=fight([u('nana7mi',1,50)],b).events.filter(e=>e.type==='attackSnipe');assert.equal(snipes.length,3);assert.ok(snipes.every(e=>e.targets[0].uid==='rear'));
 const supports=fight([u('agari',1,50),u('ruiya',8,20)],b).events.filter(e=>e.type==='sniperSupport');assert.equal(supports.length,3);assert.equal(supports[0].targets[0].uid,'strong');assert.ok(supports[0].text.includes('2 点伤害'));
});
test('shield regeneration needs actual HP loss, and broken shields produce an independent visible event',()=>{
 const regen=fight([u('shiliu',1,30)],[u('agari',1,30)]).events.filter(e=>e.type==='shield');assert.equal(regen.length,3);assert.equal(regen[0].a[0].shield,3);
 const es=fight([u('seki',1,30)],[u('agari',1,30)]).events;
 assert.equal(es.find(e=>e.type==='shield').a[0].shield,6);const broken=es.find(e=>e.type==='shieldBreak');assert.equal(broken.a[0].atk,4);assert.equal(broken.a[0].shield,0);
});
test('faint attack inheritance clears the enemy rear after mutual lethal damage',()=>{
 const result=fight([u('sumi',8,1)],[u('agari',1,1),u('agari',1,3,{uid:'rear'})]);
 assert.ok(result.events.some(e=>e.type==='lastWord'&&e.text.includes('4 点伤害')));assert.equal(result.winner,'draw');
});
test('revival keeps attack, clears perks, receives summon buffs and cannot repeat',()=>{
 const team=[u('rei',8,1,{level:2,perk:'honey'}),u('zeyin',1,30)];const original=structuredClone(team);
 const es=fight(team,[u('agari',10,50)]).events;
 const revivals=es.filter(e=>e.type==='revive');assert.equal(revivals.length,1);
 const revived=revivals[0].a.find(v=>v?.id==='rei');assert.equal(revived.atk,8);assert.equal(revived.hp,4);assert.equal(revived.level,2);assert.equal(revived.perk,null);
 const trained=es.find(e=>e.type==='summonTrain');assert.equal(trained.a.find(v=>v?.id==='rei').hp,6);assert.deepEqual(team,original);
});
test('friend-faint summon and retaliation use limited observers and never exceed five slots',()=>{
 const es=fight([u('songlv',1,1),u('liAn',1,30),u('taodai',1,30)],[u('agari',2,50)]).events;
 assert.equal(es.filter(e=>e.type==='summon'&&e.actors[0]?.uid==='liAn').length,2);
 const revenge=es.filter(e=>e.type==='revengeSnipe');assert.equal(revenge.length,3);assert.ok(es.every(e=>e.a.length===5&&e.b.length===5));
});
test('old idempotency receipts migrate identities while stale replay events are suppressed',()=>{
 const s=createRun();s.ruleset='idol-queue-v1';s.team[0]=u('rei__costume49');const value={run:s,battle:{ruleset:'idol-queue-v1',events:[]},opponent:{name:'old'}};
 const next=migrateResult(value);assert.equal(next.run.ruleset,RULESET);assert.equal(next.run.team[0].id,'rei');assert.equal(next.battle,null);assert.ok(!next.opponent);assert.equal(value.run.team[0].id,'rei__costume49');
});
test('all 50 abilities remain deterministic, labeled and bounded in opposing max-level teams',()=>{
 for(let i=0;i<200;i++){
  const team=offset=>Array.from({length:5},(_,j)=>u(ROSTER[(i+j*7+offset)%50].id,5+j,15+j,{uid:`${offset}-${j}`,level:3,perk:j%2?'honey':'melon'}));
  const a=team(0),b=team(13),result=battle(a,b,i);assert.deepEqual(result,battle(a,b,i));assert.ok(result.events.length<500);for(const e of result.events)assert.ok(EVENT_LABELS[e.type],e.type);
 }
});
