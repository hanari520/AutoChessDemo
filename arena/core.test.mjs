import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun,act,prepareTeam,battle,finishRound,trainingTeam,tierFor,ROSTER,BASE_ROSTER } from './core.mjs';
import { PRESET_TEAMS } from './presets.mjs';
import { OUTFITS } from './outfits.mjs';
import { existsSync } from 'node:fs';
function unit(id,atk=2,hp=2,extra={}){return {uid:id,id,atk,hp,level:1,xp:0,perk:null,...extra};}
test('100 unique pieces, 50 identities, 50 distinct outfit slots and complete ability metadata',()=>{
 assert.equal(ROSTER.length,100);assert.equal(OUTFITS.length,50);assert.equal(new Set(ROSTER.map(d=>d.id)).size,100);
 for(const d of OUTFITS){assert.ok(BASE_ROSTER.some(b=>b.id===d.baseId));assert.ok(d.description&&d.source&&d.ability);assert.ok(d.art.index>=0&&d.art.index<d.art.columns*d.art.rows);assert.ok(existsSync(new URL('../'+d.art.atlas,import.meta.url)));}
 assert.equal(new Set(OUTFITS.map(d=>`${d.art.atlas}:${d.art.index}`)).size,50);
});
test('different outfits of one streamer cannot merge; identical outfit upgrades preserve identity',()=>{
 const s=createRun('outfit-merge');const first=OUTFITS.find(d=>d.baseId==='lianshiye'),second=OUTFITS.find(d=>d.baseId==='lianshiye'&&d.id!==first.id);
 s.team[0]=unit(first.id);s.team[1]=unit(second.id);const before=structuredClone(s);assert.throws(()=>act(s,{type:'merge',from:1,to:0}));assert.deepEqual(s,before);
 s.team[1]=unit(first.id);act(s,{type:'merge',from:1,to:0});assert.equal(s.team[0].id,first.id);assert.equal(s.team[0].xp,1);
});
test('all outfit abilities produce bounded deterministic combat without changing permanent units',()=>{
 for(const d of OUTFITS){const team=[unit(d.id,d.atk,d.hp),unit('goutan'),unit('yujiu')];const original=structuredClone(team);const result=battle(team,trainingTeam(11,d.id),d.id);assert.ok(result.events.length<500);assert.deepEqual(result,battle(team,trainingTeam(11,d.id),d.id));assert.deepEqual(team,original);}
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
