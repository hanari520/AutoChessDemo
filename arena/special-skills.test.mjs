import test from 'node:test';
import assert from 'node:assert/strict';
import {battle,ROSTER,SPECIAL_SKILLS} from './core.mjs';
import {EVENT_LABELS,eventChanges} from './replay.mjs';
const u=(id,atk=2,hp=20,extra={})=>({uid:id,id,atk,hp,level:1,xp:0,perk:null,...extra});
const events=(a,b)=>battle(a,b,'skill-test').events;
test('27 special mechanics cover 27 original pieces with explanations and replay labels',()=>{
 assert.equal(Object.keys(SPECIAL_SKILLS).length,27);
 assert.equal(ROSTER.filter(d=>SPECIAL_SKILLS[d.kind]).length,27);
 for(const d of ROSTER.filter(d=>SPECIAL_SKILLS[d.kind]))assert.ok(d.title&&d.hint&&d.ability);
});
test('front attacks grow only the nearest rear friend, with a five-trigger limit',()=>{
 const es=events([u('agari',1,50),u('tiandou'),u('tiandou',2,20,{uid:'far'})],[u('agari',1,50)]);
 const buffs=es.filter(e=>e.type==='rearGrow'&&e.actors[0].uid==='tiandou');
 assert.equal(buffs.length,5);assert.equal(buffs[0].a[1].atk,4);assert.equal(buffs[0].a[2].atk,2);
});
test('friendly hit activates hurt gifts and visible retaliation, never revives a slain friend',()=>{
 const es=events([u('shadow',1,30),u('xuezhu'),u('tiandou')],[u('agari',1,30)]);
 assert.ok(es.some(e=>e.type==='friendlyHit'));
 const gift=es.find(e=>e.type==='hurtGift');assert.equal(gift.a[2].atk,3);assert.equal(gift.a[2].hp,22);
 assert.deepEqual(gift.targets,[{side:'a',uid:'tiandou'}]);
 assert.equal(es.filter(e=>e.type==='hurtGift'&&e.actors[0].uid==='xuezhu').length,4);
 const dead=events([u('shadow',1,10),u('tiandou',1,1)],[u('agari',1,20)]);
 assert.ok(!dead.some(e=>e.type==='rearGrow'));assert.ok(dead.some(e=>e.type==='faint'&&e.text.includes('恬豆')));
 const retaliation=events([u('shadow',1,20),u('diansu')],[u('agari',1,20)]);
 assert.ok(retaliation.find(e=>e.type==='retaliate').text.includes('受伤反击'));
});
test('hurt growth is a separate attributed event and shield absorption does not trigger it',()=>{
 const es=events([u('ein',1,20,{perk:'melon'})],[u('agari',1,20)]);
 const index=es.findIndex(e=>e.type==='hurtGrow');assert.ok(index>0);
 assert.equal(es[index].actors[0].uid,'ein');
 assert.equal(eventChanges(es[index],es[index-1]).find(c=>c.uid==='ein').atk,2);
 assert.ok(es.slice(0,index).filter(e=>e.type==='attack').length>=9);
});
test('knockout credit supports chained kills and does not trigger for an attacker dying simultaneously',()=>{
 const es=events([u('quanrong',5,30)],[u('agari',1,1),u('agari',1,3,{uid:'b2'}),u('agari',1,3,{uid:'b3'}),u('agari',1,10,{uid:'b4'})]);
 assert.equal(es.filter(e=>e.type==='knockout').length,3);
 assert.deepEqual(es.find(e=>e.type==='knockout').targets,[{side:'b',uid:'b2'}]);
 assert.ok(!events([u('quanrong',5,1)],[u('agari',5,1),u('agari')]).some(e=>e.type==='knockout'));
});
test('faint observers remain alive and front-faint shield observes only the adjacent predecessor',()=>{
 const es=events([u('songlv',1,1),u('kanban'),u('miyue')],[u('agari',1,30)]);
 assert.ok(es.some(e=>e.type==='shield'&&e.text.includes('守护誓约')));
 assert.ok(es.some(e=>e.type==='faintGrow'));
 const simultaneous=events([u('miyue',5,1)],[u('agari',5,1)]);
 assert.ok(!simultaneous.some(e=>e.type==='faintGrow'));
 const adjacent=events([u('agari',1,1),u('agari',1,1,{uid:'middle'}),u('kanban')],[u('aza',3,50)]);
 const firstShield=adjacent.find(e=>e.type==='shield');assert.equal(firstShield.a[0].triggers,1);assert.equal(firstShield.a[0].atk,4);
});
test('attack relay feeds inherited summons, summon training boosts health and respects five slots',()=>{
 const es=events([u('mahiru',5,1,{level:3}),u('youyi',10,20),u('zeyin')],[u('agari',2,30)]);
 const relay=es.find(e=>e.type==='relayAttack');assert.equal(relay.a[0].atk,10);
 const inherited=es.filter(e=>e.type==='summon'&&e.targets[0].uid.startsWith('summon'));
 assert.equal(inherited.filter(e=>e.a.some(v=>v?.id==='spark')).length,3);
 const trained=es.find(e=>e.type==='summonTrain'),spark=trained.a.find(v=>v?.id==='spark');
 assert.equal(spark.atk,7);assert.equal(spark.hp,3);
 assert.ok(es.every(e=>e.a.length===5&&e.b.length===5));
});
test('percentage weakening bypasses shields without hurt triggers, respects levels and leaves one HP',()=>{
 for(const level of [1,2,3]){
  const es=events([u('youyu',50,20,{level})],[u('ein',1,20,{perk:'melon'})]);
  const i=es.findIndex(e=>e.type==='weakening');assert.equal(es[i].b[0].hp,20-5*level);assert.equal(es[i].b[0].shield,8);
  assert.ok(es[i+1].type!=='hurtGrow');
 }
 assert.equal(events([u('youyu',50,20,{level:3})],[u('agari',1,1)]).find(e=>e.type==='weakening').b[0].hp,1);
});
test('mirror uses its own level, leaves permanent state intact and refuses mirror/economy skills',()=>{
 const a=[u('youyu',10,20),u('rinco',9,20,{level:3})],before=structuredClone(a);
 const es=events(a,[u('agari',1,40)]);
 assert.equal(es.filter(e=>e.type==='copy').length,1);
 const debuffs=es.filter(e=>e.type==='weakening');assert.equal(debuffs.length,2);assert.equal(debuffs[1].b[0].hp,7);
 assert.deepEqual(a,before);
 for(const id of ['rinco','suiji','likou'])assert.ok(!events([u(id),u('rinco',2,20,{uid:'copy'})],[u('agari')]).some(e=>e.type==='copy'));
});
test('all new event types are labeled and opposing max-level chains stay bounded and deterministic',()=>{
 const ids=['shadow','xuezhu','tiandou','quanrong','miyue','kanban','mahiru','zeyin','youyu','youyi','rinco'];
 const seen=new Set();
 for(let i=0;i<70;i++){
  const team=offset=>Array.from({length:5},(_,j)=>u(ids[(i+j+offset)%ids.length],5+j,15+j,{uid:`${offset}-${j}`,level:3,perk:j%2?'honey':'garlic'}));
  const a=team(0),b=team(5),result=battle(a,b,i);assert.ok(result.events.length<500);assert.deepEqual(result,battle(a,b,i));
  for(const e of result.events){assert.ok(EVENT_LABELS[e.type],e.type);seen.add(e.type);}
 }
 for(const type of ['copy','rearGrow','hurtGift','friendlyHit','knockout','faintGrow','summonTrain','weakening','relayAttack'])assert.ok(seen.has(type),type);
});
