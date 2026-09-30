import { performance } from 'node:perf_hooks';
import { resolveBattle, SKILLS } from '../online/combat.js';
const ids=Object.keys(SKILLS);
function formation(side,count,offset,star) {
  const result=Array(64).fill(null);
  for(let n=0;n<count;n++) {
    const slot=side==='A'?32+n:31-n;
    result[slot]={uid:`${side}-${n}`,id:ids[(offset+n)%ids.length],star,items:star>1?['sword','mana','armor']:[]};
  }
  return result;
}
function run(count,star) {
  const samples=[];let events=0,simulated=0;
  for(let iteration=0;iteration<110;iteration++) {
    const pairs=Array.from({length:4},(_,pair)=>[formation('A',count,(pair*11+iteration)%50,star),formation('B',count,(pair*7+iteration+13)%50,star)]);
    const started=performance.now();
    const battles=pairs.map(([a,b],pair)=>resolveBattle(a,b,iteration*4+pair,{maxTicks:360}));
    // All living players can spectate all four battles. Include eight complete encodings.
    for(let seat=0;seat<8;seat++)JSON.stringify(battles);
    if(iteration>=10){samples.push(performance.now()-started);events+=battles.reduce((sum,b)=>sum+b.events.length,0);simulated+=battles.reduce((sum,b)=>sum+b.durationMs,0);}
  }
  samples.sort((a,b)=>a-b);
  return {piecesPerSide:count,star,rooms:100,meanMs:+(samples.reduce((a,b)=>a+b,0)/samples.length).toFixed(2),p50Ms:+samples[50].toFixed(2),p95Ms:+samples[95].toFixed(2),maxMs:+samples.at(-1).toFixed(2),meanEventsPerFight:Math.round(events/400),meanBattleSeconds:+(simulated/400000).toFixed(1)};
}
console.log(JSON.stringify({node:process.version,platform:process.platform,results:[run(3,1),run(11,1),run(11,3)]},null,2));
