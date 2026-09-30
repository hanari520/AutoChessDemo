/* Reproducible eight-bot integration checks, using the actual room rules. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createGame, advancePhase } from '../src/core.js';
import { botPolicy } from '../src/bots.js';

const samples=Number(process.argv[2]||20);
if(!Number.isInteger(samples)||samples<1)throw new Error('Provide a positive game count');
const players=Array.from({length:8},(_,i)=>({id:`b${i}`,name:`B${i}`,bot:true}));
const totalCards=game=>{
  const total={...game.pool};
  for(const seat of game.seats)for(const u of [...seat.board,...seat.bench,...seat.shop,...(seat.openingOffer||[])]){
    if(u)total[u.id]=(total[u.id]||0)+3**(u.star-1);
  }
  return total;
};
const results=[];let prepWindows=0,maxPrepMs=0,totalPrepMs=0;
for(let i=0;i<samples;i++){
  const seed=`online-shared-v43-${i+1}`,game=createGame({seed,players}),cards=totalCards(game);
  let rounds=0;
  try{
    while(!game.complete&&rounds++<40){
      const start=performance.now();
      for(let seat=0;seat<8;seat++)botPolicy(game,seat);
      const ms=performance.now()-start;prepWindows++;totalPrepMs+=ms;maxPrepMs=Math.max(maxPrepMs,ms);
      for(const seat of game.seats.filter(s=>s.alive)){
        assert.equal(seat.ready,true);assert.ok(seat.gold>=0);
        assert.ok(seat.board.filter(Boolean).length<=seat.level);
        assert.equal(seat.bench.length,8);assert.ok(seat.board.filter(Boolean).every(u=>u.items.length<=3));
      }
      assert.deepEqual(totalCards(game),cards);
      assert.equal(advancePhase(game),'combat');assert.equal(advancePhase(game),'result');advancePhase(game);
    }
    assert.equal(game.complete,true);assert.equal(game.seats.filter(s=>s.place===1).length,1);
    results.push({seed,rounds,winner:game.seats.find(s=>s.place===1).seat,complete:true});
  }catch(error){results.push({seed,rounds,complete:false,error:error.message});}
}
const completed=results.filter(r=>r.complete).length;
console.log(JSON.stringify({policy:'Adaptive v4.3',samples,completed,prepWindows,
  averagePrepMs:totalPrepMs/Math.max(1,prepWindows),maxPrepMs,results},null,2));
if(completed!==samples)process.exitCode=1;
