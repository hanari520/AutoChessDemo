import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CLASSIC_SKILLS,CLASSIC_MARKS,classicAttackProfile} from './skill-catalog.js';
import {MAX_LEVEL,XP_NEED,SHOP_ODDS,sellRefund,interestGain,streakGain} from './economy.js';
import {createGame,applyAction,advancePhase,viewFor} from './core.js';
import {resolveBattle,bondSummary} from './combat.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('./combat.js',import.meta.url),'utf8');
const board=(ids,side='A')=>ids.map((id,i)=>({slot:side==='A'?32+i:i,unit:{uid:`${side}-${id}-${i}`,id,star:3,items:['armor','armor']}}));
test('all 50 skill definitions and basic attack profiles match the actual classic source',()=>{
  const context=vm.createContext({});
  vm.runInContext(html.slice(html.indexOf('const V3_ASSET='),html.indexOf('function v3AttackText')),context);
  for(const id of Object.keys(CLASSIC_SKILLS)){
    const kit=vm.runInContext(`COMBAT_KITS[${JSON.stringify(id)}]`,context);
    assert.equal(JSON.stringify(CLASSIC_SKILLS[id]),JSON.stringify(kit),id);
    vm.runInContext(`function uhash(id,seed){let h=seed;for(const ch of id)h=(h*31+ch.charCodeAt(0))>>>0;return h;} function byId(){return {form:'ra',dtype:'magic'};}`,context);
    const expected=vm.runInContext(`v3AttackOf({id:${JSON.stringify(id)}})`,context),actual=classicAttackProfile(id);
    for(const key of Object.keys(actual))assert.equal(actual[key],expected[key],`${id}.${key}`);
  }
});
test('classic XP, shop odds, upgraded refunds and 11 population work through authoritative actions',()=>{
  const xp=vm.runInNewContext(`(${html.match(/const XP_NEED = (.*?);/)[1]})`);
  const odds=vm.runInNewContext(`(${html.match(/const SHOP_ODDS = (\{[\s\S]*?\});/)[1]})`);
  assert.equal(JSON.stringify(XP_NEED),JSON.stringify(xp));assert.equal(JSON.stringify(SHOP_ODDS),JSON.stringify(odds));
  assert.equal(MAX_LEVEL,11);assert.equal(interestGain(100),3);assert.equal(streakGain(-7),4);
  const state=createGame({seed:'population-parity',players:Array.from({length:8},(_,i)=>({id:`p${i}`,name:`P${i}`}))}),seat=state.seats[0];
  seat.level=10;seat.xp=71;seat.gold=100;applyAction(state,0,{type:'buyXp'});assert.equal(seat.level,11);assert.equal(seat.gold,95);
  const snapshot=JSON.stringify(state);assert.throws(()=>applyAction(state,0,{type:'buyXp'}),/Maximum level/);assert.equal(JSON.stringify(state),snapshot);
  for(const star of [1,2,3])assert.equal(sellRefund({cost:4,star}),4*3**(star-1)-(star-1));
  for(let i=0;i<11;i++)seat.board[32+i]={uid:100+i,id:'ein',star:1,cost:1,items:[]};
  assert.equal(viewFor(state,0).me.board.filter(Boolean).length,11);
});
test('all 22 bonds initialize the shared runtime on either side and instances never share battle state',()=>{
  const rows=source.match(/const RAW = `([\s\S]*?)`;/)[1].trim().split('\n').map(row=>row.split('|'));
  const original=globalThis.ClassicBondRules.create,instances=[];
  globalThis.ClassicBondRules.create=adapter=>{const runtime=original(adapter);instances.push(runtime);return runtime;};
  try{
    for(const name of Object.keys(globalThis.ClassicBondRules.descriptions)){
      const ids=rows.filter(row=>[row[2],row[3],row[8],row[9]].includes(name)).map(row=>row[0]);
      const left=board(ids),right=board(ids,'B'),tier=bondSummary(left.map(e=>e.unit)).find(b=>b.name===name);
      assert.ok(tier?.active,name);
      const result=resolveBattle(left,right,19,{initialMana:50,maxTicks:30});
      assert.equal(result.bonds.A[name],result.bonds.B[name],name);
      for(const side of [0,1])assert.ok(instances.at(-1).state.units.some(u=>u.side===side&&u.bond[name]),`${name} side ${side}`);
      for(const event of result.events){assert.ok(Number.isFinite(event.at));if(event.hp!=null)assert.ok(Number.isFinite(event.hp)&&event.hp>=0);}
    }
    assert.equal(new Set(instances.map(i=>i.state)).size,22);
  }finally{globalThis.ClassicBondRules.create=original;}
});
test('skill projectiles and split hits use ordered server times and the classic casting gate',()=>{
  const result=resolveBattle(board(['yua','chiharu','sishi']),board(['ein','kanban','quanrong'],'B'),20260930,{initialMana:50,maxTicks:200});
  assert.ok(result.events.some(e=>e.type==='skillLaunch'));
  const launch=result.events.find(e=>e.type==='skillLaunch'),impact=result.events.find(e=>e.type==='skill'&&e.from===launch.from&&e.target===launch.target&&e.at>=launch.at);
  assert.ok(impact&&impact.at>=launch.at+launch.duration);
  const casts=result.events.filter(e=>e.type==='cast');for(let i=1;i<casts.length;i++)assert.ok(casts[i].at-casts[i-1].at>=800);
  for(const side of ['A','B']){const mine=casts.filter(e=>e.from.startsWith(side));for(let i=1;i<mine.length;i++)assert.ok(mine[i].at-mine[i-1].at>=1200);}
  assert.deepEqual(resolveBattle(board(['yua','chiharu','sishi']),board(['ein','kanban','quanrong'],'B'),20260930,{initialMana:50,maxTicks:200}),result);
});
test('living spectators get all four battles while shops, bench, gold and items stay private',()=>{
  const state=createGame({seed:'public-combat',players:Array.from({length:8},(_,i)=>({id:`p${i}`,name:`P${i}`}))});advancePhase(state);
  for(let seat=0;seat<8;seat++){const view=viewFor(state,seat);assert.equal(view.battles.length,4);for(const other of view.players){for(const key of ['shop','bench','gold','items'])assert.equal(other[key],undefined);}}
});

const duel=(id,enemy='quanrong',slot=35)=>resolveBattle([{slot:27,unit:{uid:id,id,star:3,items:[]}}],[{slot,unit:{uid:enemy,id:enemy,star:3,items:[]}}],11,{initialMana:50,maxTicks:100});
test('all 50 signature marks match classic definitions and both offensive/guard marks change damage once',()=>{
  const marks=vm.runInNewContext(`(${html.match(/const SIG_MARKS=(\{[\s\S]*?\n\});/)[1]})`);
  assert.equal(JSON.stringify(CLASSIC_MARKS),JSON.stringify(marks));assert.equal(Object.keys(CLASSIC_MARKS).length,50);
  const result=duel('yukie');
  const bursts=result.events.filter(e=>e.type==='markBurst');assert.ok(bursts.some(e=>e.guard));assert.ok(bursts.some(e=>!e.guard));
  for(const e of bursts)assert.equal(e.rawAfter,Math.round(e.rawBefore*(1+(e.guard?-e.amp:e.amp))));
  const firstMark=result.events.find(e=>e.type==='mark'&&e.from==='yukie');assert.ok(firstMark.at>=400,'mark applied after final split hit');
});
test('Yukie uses all three distinct 100/110/160 percent coefficients',()=>{
  const hits=duel('yukie').events.filter(e=>e.type==='skill'&&e.from==='yukie').slice(0,3);
  assert.equal(hits.length,3);assert.ok(hits[0].at<hits[1].at&&hits[1].at<hits[2].at);
  assert.ok(Math.abs(hits[1].amount/hits[0].amount-1.1)<.05);assert.ok(Math.abs(hits[2].amount/hits[0].amount-1.6)<.05);
});
test('Nana7mi pulls the struck enemy without overlap or leaving the board',()=>{
  const result=duel('nana7mi','yujiu',45),pull=result.events.find(e=>e.type==='move'&&e.kind==='pull');
  assert.ok(pull,'a distant ranged enemy should be pulled');assert.equal(pull.unit,'yujiu');assert.ok(pull.x>=0&&pull.x<8&&pull.y>=0&&pull.y<8);
  const caster=result.events.filter(e=>e.type==='move'&&e.unit==='nana7mi'&&e.at<=pull.at).at(-1)||{x:3,y:3};assert.notEqual(`${caster.x},${caster.y}`,`${pull.x},${pull.y}`);
});
test('Youyu enters temporary phase and Diansu exposes physical vulnerability during petrification',()=>{
  const phase=duel('youyu').events.filter(e=>e.type==='status'&&e.target==='youyu');assert.ok(phase.some(e=>e.statuses.includes('phaseT')));assert.ok(phase.some(e=>e.at>=1500&&!e.statuses.includes('phaseT')));
  const stone=duel('diansu').events.filter(e=>e.type==='status'&&e.target==='quanrong');assert.ok(stone.some(e=>e.statuses.includes('freeze')&&e.statuses.includes('petrifyT')));assert.ok(stone.some(e=>e.at>=2500&&!e.statuses.includes('petrifyT')));
});
test('Goutan shield and interception link only arrive after their projectile',()=>{
  const left=[{slot:27,unit:{uid:'guard',id:'goutan',star:3,items:[]}},{slot:28,unit:{uid:'ally',id:'yujiu',star:3,items:[]}}];
  const result=resolveBattle(left,[{slot:35,unit:{uid:'enemy',id:'quanrong',star:3,items:[]}}],31,{initialMana:50,maxTicks:20});
  const launch=result.events.find(e=>e.type==='shieldLaunch'&&e.from==='guard'),shield=result.events.find(e=>e.type==='shield'&&e.from==='guard'&&e.target==='ally');
  assert.ok(launch&&shield);assert.ok(shield.at>=launch.at+launch.duration);
});

test('skill bleed durations and cleanse haste match their descriptions',()=>{
  for(const [id,duration] of [['hoshimi',2],['miyue',2],['yukie',1.5]])assert.equal(CLASSIC_SKILLS[id].bleedDuration,duration);
  assert.equal(CLASSIC_SKILLS.shengge.hasteDuration,3);
  const result=duel('yukie');
  const first=result.events.find(e=>e.type==='status'&&e.target==='quanrong'&&e.statuses.includes('poison'));
  assert.ok(first);
  const expired=result.events.find(e=>e.type==='status'&&e.target==='quanrong'&&e.at>first.at&&!e.statuses.includes('poison'));
  assert.ok(expired&&expired.at-first.at<=1500);
});

test('ground zones begin at projectile arrival, never while the spell is still flying',()=>{
  for(const id of ['xuezhu','ruiya']){
    const result=duel(id,'quanrong',3),launch=result.events.find(e=>e.type==='skillLaunch'&&e.from===id),zone=result.events.find(e=>e.type==='zone'&&e.from===id);
    assert.ok(launch&&zone,id);assert.ok(zone.at>=launch.at+launch.duration,id);
  }
});

test('online bond adapters preserve healing lock and enemy healing conversion on both sides',()=>{
  const original=globalThis.ClassicBondRules.create;let checked=0;
  globalThis.ClassicBondRules.create=adapter=>{const runtime=original(adapter),start=runtime.start;
    runtime.start=function(units){start.call(this,units);
      for(const side of [0,1]){
        const [target,healer]=units.filter(u=>u.side===side),enemy=units.find(u=>u.side!==side);
        target.hp=target.maxhp-100;target.v3HealLockT=3200;const before=target.hp;
        this.heal(healer,target,100);assert.equal(target.hp,before);
        target.v3HealLockT=0;target.mr=0;target.shield=0;target.v3HealBomb={owner:enemy,amp:.4,left:4000};
        this.heal(healer,target,100);assert.equal(target.v3HealBomb,null);assert.equal(target.hp,before+20);checked++;
      }
    };return runtime;
  };
  try{resolveBattle(board(['likou','tiandou']),board(['likou','tiandou'],'B'),1,{maxTicks:1});assert.equal(checked,2);}
  finally{globalThis.ClassicBondRules.create=original;}
});
