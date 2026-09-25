'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), Rules=require('./daily-curses');
const IDS=['dc_rift','dc_cluster','dc_flank','dc_rear','dc_bias','dc_economy','dc_growth','dc_debt','dc_fog','dc_glass','dc_drought','dc_armor'];
const seed=20260925, state=id=>Rules.create(seed,id), event=(s,type,round,extra={})=>Rules.transition(s,type,{round,...extra});

test('shared catalogue contains exactly twelve complete single-curse rules',()=>{
  assert.equal(Rules.VERSION,3);assert.deepEqual(Rules.CATALOG.map(x=>x.id),IDS);
  for(const c of Rules.CATALOG)for(const k of ['name','limit','compensation','timing'])assert.ok(c[k],c.id+' missing '+k);
  for(const id of IDS){const s=state(id);assert.equal(s.id,id);assert.equal(s.custom,true);assert.deepEqual(Rules.restore(JSON.parse(JSON.stringify(s)),seed,id),s);}
  assert.equal(Rules.restore(state('dc_rift'),seed,'dc_flank'),null);
});

test('daily selection is deterministic and never repeats within the previous ten days',()=>{
  const recent=[];
  for(let t=Date.UTC(2026,8,1);t<Date.UTC(2026,10,1);t+=86400000){
    const d=new Date(t),key=d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate(),id=Rules.pick(key).id;
    assert(!recent.includes(id),key+' repeated '+id);recent.push(id);if(recent.length>10)recent.shift();
    assert.equal(Rules.create(key).id,id);
  }
});

test('board curse fields and chapter rifts stay fixed for 25 rounds',()=>{
  assert.deepEqual(Rules.modifiers(state('dc_rift'),{round:1}).rifts,Rules.modifiers(state('dc_rift'),{round:25}).rifts);
  assert.notDeepEqual(Rules.modifiers(state('dc_rift'),{round:25}).rifts,Rules.modifiers(state('dc_rift'),{round:26}).rifts);
  for(const i of Rules.rifts(state('dc_rift'),1))assert(i>=32&&i<64);
  for(const [id,kind] of [['dc_rift','rift'],['dc_cluster','cluster'],['dc_flank','flank'],['dc_rear','rear']])
    assert.equal(Rules.modifiers(state(id),{round:1}).boardCurse,kind);
});

test('economic and growth rules apply their limits and automatic rewards',()=>{
  let s=state('dc_economy'),m=Rules.modifiers(s,{round:1});
  assert.equal(m.shopSize,4);assert.equal(m.interestCap,2);assert.equal(m.refreshCost,0);
  s=event(s,'refresh',1).state;assert.equal(Rules.modifiers(s,{round:1}).refreshCost,2);
  assert.equal(event(s,'result',1,{won:true,ordinary:true}).effects[0].amount,1);
  assert.equal(event(s,'result',5,{won:true,ordinary:false,creep:true}).effects.length,0);
  s=state('dc_growth');m=Rules.modifiers(s,{round:21});assert.equal(m.buyXp,false);assert.equal(m.naturalXp,3);assert.equal(m.enemyHpMultiplier,1.1);
  assert.equal(Rules.modifiers(s,{round:20}).enemyHpMultiplier,1);
  assert.equal(event(s,'start',1).effects[0].type,'ticket');
  s=state('dc_debt');assert.equal(Rules.modifiers(s,{round:1}).maxHp,32);
  assert.deepEqual(event(s,'roundStart',5,{gold:3}).effects.map(x=>[x.type,x.amount]),[['gold',-3]]);
  assert.deepEqual(event(s,'roundStart',5,{gold:2}).effects.map(x=>[x.type,x.amount]),[['hp',-2]]);
});

test('chapter benefits and bond focus are once-only and survive restore',()=>{
  let s=state('dc_bias'),tr=event(s,'roundStart',1,{synergies:['学园','游侠'],units:[{id:'a',cost:2,fac:'学园'},{id:'b',cost:2,job:'游侠'}]});
  assert(['学园','游侠'].includes(tr.state.focus));assert.equal(tr.effects.filter(x=>x.type==='unit').length,1);
  assert.equal(Rules.modifiers(tr.state,{round:1}).synergyPenalty,tr.state.focus);
  assert.deepEqual(event(tr.state,'roundStart',1).effects,[]);
  assert.equal(Rules.restore(tr.state,seed,'dc_bias').focus,tr.state.focus);
  for(const [id,type] of [['dc_fog','item'],['dc_glass','item'],['dc_drought','gold']]){
    s=state(id);assert.equal(event(s,'roundStart',1).effects[0].type,type);
    assert.equal(event(s,'roundStart',26).effects[0].type,type);
  }
});

test('combat modifiers and block bounty match the approved numbers',()=>{
  assert.equal(Rules.modifiers(state('dc_glass'),{round:1}).allyHpMultiplier,.8);
  assert.equal(Rules.modifiers(state('dc_glass'),{round:1}).allyAtkMultiplier,1.2);
  assert.equal(Rules.modifiers(state('dc_drought'),{round:1}).manaCost,70);
  assert.equal(Rules.modifiers(state('dc_drought'),{round:1}).skillMultiplier,1.2);
  assert.equal(Rules.modifiers(state('dc_fog'),{round:1}).fog,true);
  let s=state('dc_armor'),tr=event(s,'result',1,{won:true,ordinary:true});
  assert.equal(tr.effects[0].amount,4);
  assert.deepEqual(event(tr.state,'result',2,{won:true,ordinary:true}).effects,[]);
  assert.equal(event(tr.state,'result',6,{won:true,ordinary:true}).effects[0].amount,4);
});
