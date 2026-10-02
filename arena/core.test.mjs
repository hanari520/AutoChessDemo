import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun,act,prepareTeam,battle,finishRound,trainingTeam,tierFor,ROSTER,BASE_ROSTER,migrateRun,RULESET } from './core.mjs';
import { PRESET_TEAMS } from './presets.mjs';
import { OUTFITS } from './outfits.mjs';
import { existsSync } from 'node:fs';
function unit(id,atk=2,hp=2,extra={}){return {uid:id,id,atk,hp,level:1,xp:0,perk:null,...extra};}
test('exactly 50 original portraits and 50 distinct working mechanics',()=>{
 assert.equal(ROSTER.length,50);assert.equal(BASE_ROSTER.length,50);assert.equal(new Set(ROSTER.map(d=>d.kind)).size,50);
 for(const d of ROSTER){assert.equal(d.id,d.baseId);assert.ok(!d.art);assert.ok(d.title&&d.ability);assert.ok(existsSync(new URL('../'+d.portrait,import.meta.url)));}
});
test('archived outfits never enter shops, bonuses, training or playable roster',()=>{
 assert.equal(OUTFITS.length,50);assert.ok(OUTFITS.every(d=>!ROSTER.some(u=>u.id===d.id)));
 const s=createRun('original-only');for(let round=1;round<=30;round++){s.round=round;s.gold=50;act(s,{type:'roll'});assert.ok(s.shop.every(o=>!o.id.includes('__costume')));assert.ok(trainingTeam(round).filter(Boolean).every(u=>!u.id.includes('__costume')));}
});
test('all 50 original mechanics produce bounded deterministic combat without changing permanent units',()=>{
 for(const d of ROSTER){const team=[unit(d.id,d.atk,d.hp),unit('goutan',2,3,{uid:'gift'}),unit('yujiu',2,3,{uid:'helper'})];const original=structuredClone(team);const result=battle(team,trainingTeam(11,d.id),d.id);assert.ok(result.events.length<500);assert.deepEqual(result,battle(team,trainingTeam(11,d.id),d.id));assert.deepEqual(team,original);}
});
test('legacy costume run migrates to original identity while preserving progress, training and frozen offers',()=>{
 const s=createRun('legacy');s.ruleset='idol-queue-v1';s.round=8;s.wins=4;s.gold=7;s.revision=19;s.team[0]=unit('rei__costume49',17,22,{xp:2,level:2,perk:'melon'});s.shop[0]={id:'yukie__costume25',frozen:true};s.bonusOffer=[{id:'sumi__costume17'},{id:'aza__costume1'}];
 const original=structuredClone(s),next=migrateRun(s);assert.equal(next.ruleset,RULESET);assert.deepEqual(s,original);assert.deepEqual(next.team[0],{...s.team[0],id:'rei'});assert.deepEqual(next.shop[0],{id:'yukie',frozen:true});assert.deepEqual(next.bonusOffer,[{id:'sumi'},{id:'aza'}]);assert.equal(next.revision,19);assert.equal(next.wins,4);assert.equal(next.gold,7);
});
test('deterministic shops, exactly 50 streamer identities and round unlocks',()=>{assert.deepEqual(createRun('x'),createRun('x'));assert.equal(BASE_ROSTER.length,50);assert.equal(new Set(ROSTER.map(x=>x.baseId)).size,50);assert.equal(tierFor(11),6);assert.ok(PRESET_TEAMS.every(x=>x.team.filter(Boolean).every(u=>ROSTER.find(d=>d.id===u.id).tier<=tierFor(x.round))));});
test('freeze persists across rolls and rounds, coins reset',()=>{const s=createRun('freeze');act(s,{type:'freeze',zone:'shop',slot:4});const frozen=structuredClone(s.shop[4]);act(s,{type:'buy',slot:0,to:0});act(s,{type:'roll'});assert.deepEqual(s.shop[4],frozen);prepareTeam(s);finishRound(s,{winner:'draw'});assert.deepEqual(s.shop[4],frozen);assert.equal(s.gold,10);assert.equal(s.round,2);});
test('merge preserves stronger stats and reaches levels at xp 2 and 5',()=>{const s=createRun('merge');s.team[0]=unit('goutan',8,9);for(let i=0;i<5;i++){s.team[1]=unit('goutan');act(s,{type:'merge',from:1,to:0});if(i===1)assert.equal(s.team[0].level,2);}assert.equal(s.team[0].level,3);assert.equal(s.team[0].atk,13);s.team[1]=unit('goutan');assert.throws(()=>act(s,{type:'merge',from:1,to:0}),/三级/);});
test('invalid purchase does not spend coins or remove shop offer',()=>{const s=createRun('invalid');s.team[0]=unit('invalid');const before=structuredClone(s);assert.throws(()=>act(s,{type:'buy',slot:0,to:0}));assert.deepEqual(s,before);});
test('grow triggers once per turn and combat never mutates permanent state',()=>{const s=createRun('grow');s.team[0]=unit('goutan');s.team[1]=unit('likou');const a=prepareTeam(s),b=prepareTeam(s);assert.deepEqual(a,b);assert.equal(s.team[0].atk,3);const copy=structuredClone(s.team);battle(s.team,trainingTeam(2),'fixed');assert.deepEqual(s.team,copy);assert.throws(()=>act(s,{type:'roll'}),/提交/);});
test('simultaneous lethal ordinary attacks yield draw',()=>{const a=[unit('agari',5,2)],b=[unit('agari',5,2)];assert.equal(battle(a,b,'simultaneous').winner,'draw');});
test('summon inherits summon buffs, event replay is deterministic',()=>{const a=[unit('songlv',1,1),unit('yujiu',1,7)],b=[unit('agari',1,9)];const x=battle(a,b,'summons');assert.ok(x.events.some(e=>e.type==='summon'&&e.a.some(u=>u?.id==='dancer'&&u.atk===3)));assert.deepEqual(x,battle(a,b,'summons'));});
test('five lives, early recovery, ten wins and elimination',()=>{const s=createRun('score');s.team[0]=unit('agari');prepareTeam(s);finishRound(s,{winner:'b'});assert.equal(s.lives,4);prepareTeam(s);finishRound(s,{winner:'b'});assert.equal(s.lives,4);assert.equal(s.round,3);s.wins=9;prepareTeam(s);finishRound(s,{winner:'a'});assert.equal(s.status,'won');const t=createRun();t.team[0]=unit('agari');t.lives=1;prepareTeam(t);finishRound(t,{winner:'b'});assert.equal(t.status,'lost');});
test('preset battles stay bounded over 30 rounds and multiple seeds',()=>{for(const seed of PRESET_TEAMS){const result=battle(seed.team,trainingTeam(seed.round,seed.id),seed.id);assert.ok(result.events.length<500);assert.ok(['a','b','draw'].includes(result.winner));}});
