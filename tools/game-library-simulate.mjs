import {mkdirSync,writeFileSync} from 'node:fs';
import {createGame,reduceGame,validateState,RULES_VERSION} from '../games/studio-manager/core.mjs';
import {EVENTS} from '../games/studio-manager/content.mjs';

const cycle=['game','talk','song','lesson','duo'];
const cast={game:['suiji'],talk:['huize'],song:['kanban'],lesson:['kanban'],duo:['suiji','huize']};
const plans=[
  {id:'specialist',seed:14,upgrades:['audio'],choose:()=>({programId:'talk',memberIds:['huize']})},
  {id:'balanced',seed:27,upgrades:['audio','set','lighting'],choose:i=>({programId:cycle[i%5],memberIds:cast[cycle[i%5]]})},
  {id:'recovery',seed:88,upgrades:[],choose:i=>i%4===3?{rest:true}:{programId:'game',memberIds:['suiji']}},
];
const simulations=plans.map(plan=>{
  let nextId=0;
  const act=(state,type,data={})=>reduceGame(state,{type,...data,actionId:`simulation-${++nextId}`});
  let state=createGame({seed:plan.seed,memberIds:['suiji','kanban','huize']});
  const rows=[];
  for(let i=0;i<12;i++){
    if(plan.upgrades[i])state=act(state,'upgrade',{equipmentId:plan.upgrades[i]});
    const decision=plan.choose(i);
    state=act(state,decision.rest?'rest':'show',decision);
    if(state.phase==='event'){
      const event=EVENTS.find(e=>e.id===state.currentShow.eventId);
      const score=o=>o.qualityDelta*1.5+o.hypeDelta+o.fundsDelta+o.energyDelta*.2;
      const option=event.options.filter(o=>o.cost===0).sort((a,b)=>score(b)-score(a))[0];
      state=act(state,'event',{optionId:option.id});
    }
    if(!validateState(state))throw Error(`Invalid ${plan.id} slot ${i+1}`);
    rows.push(state.lastResult);
    state=act(state,'advance');
  }
  state=act(state,'finale',{programIds:['game','talk','song']});
  if(!validateState(state))throw Error(`Invalid ${plan.id} finale`);
  return {id:plan.id,seed:plan.seed,rows,finale:state.finale};
});
mkdirSync(new URL('../out/game-library/',import.meta.url),{recursive:true});
writeFileSync(new URL('../out/game-library/simulations.json',import.meta.url),JSON.stringify({rulesVersion:RULES_VERSION,simulations},null,2));
for(const run of simulations)console.log(`${run.id}: ${run.rows.length} slots, score ${run.finale.score}, ending ${run.finale.endingId}`);
