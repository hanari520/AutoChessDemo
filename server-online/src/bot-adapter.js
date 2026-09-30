/* Translate public online preparation data and legal actions for BotPlanner. */
import { applyAction, viewFor } from './core.js';
import { previewUnit, ROSTER_LIST, BOND_TIERS } from './combat.js';
import { EQUIPMENT, recipe } from './equipment.js';
import { MAX_LEVEL, xpNeeded } from './economy.js';
import './bot-equipment-policy.js';
import './bot-planner.js';

const definitions=Object.fromEntries(ROSTER_LIST.map(d=>{
  const p=previewUnit({id:d.id,star:1,items:[]});
  return [d.id,{...d,hp:p.hp,atk:p.atk,spd:p.speed,dtype:p.damageType}];
}));
const bands={'守护':0,'刀客':1,'狂战':1,'歌势':2,'医者':2,'偶像':2,'法师':3,'咒术':3,'游侠':3,'刺客':4};
const band=u=>bands[definitions[u.id].job]??2;
const tags=(d,kind)=>[d[kind],d[kind+'2']].filter(Boolean);
const profiles=['balanced','economy','tempo','reroll','synergy','aggressive','flexible','balanced'];

function synergy(team){
  const counts={},seen=new Set();
  for(const u of team){
    if(seen.has(u.id))continue;seen.add(u.id);
    for(const k of [...tags(definitions[u.id],'fac'),...tags(definitions[u.id],'job')])counts[k]=(counts[k]||0)+1;
  }
  let score=0;
  for(const [key,n] of Object.entries(counts)){
    let previous=0,progressed=false;
    (BOND_TIERS[key]||[]).forEach((need,i)=>{
      if(n>=need){score+=5+3*i;previous=need;}
      else if(n>previous&&!progressed){score+=(n-previous)*.35;progressed=true;}
    });
  }
  return score;
}

export function createOnlineBot(game,seatIndex){
  const seat=game.seats[seatIndex],cache=new Map();
  const state={arena:true,daily:false,curses:[],stats:{hpLog:[]},botProfile:profiles[seatIndex],botPlan:seat.botPlan};
  const normalize=raw=>{
    if(!raw)return null;
    const p=previewUnit({...raw,items:[]});
    let u=cache.get(raw.uid);if(!u){u={};cache.set(raw.uid,u);}
    Object.assign(u,raw,{items:[...(raw.items||[])],maxhp:p.hp,hp:p.hp,atk:p.atk,ar:p.armor,
      sks:1,passive:!!p.skill?.passive});
    return u;
  };
  // Only this boundary reads the game. Opponent intel comes from viewFor's
  // last locked lineup; their live boards, benches and shops stay private.
  const sync=()=>{
    const view=viewFor(game,seatIndex),me=view.me;
    const pair=view.pairings.find(p=>p.a===seatIndex||p.b===seatIndex);
    const enemy=pair?view.players[pair.a===seatIndex?pair.b:pair.a]:null;
    Object.assign(state,{round:view.round,phase:view.phase,hp:me.hp,lvl:me.level,xp:me.xp,gold:me.gold,
      lossStreak:Math.max(0,-me.streak),winStreak:Math.max(0,me.streak),lock:me.shopLocked,
      board:me.board.map(normalize),bench:me.bench.map(normalize),shop:me.shop.map(normalize),items:me.items,
      enemyBoard:enemy?enemy.board.map((raw,slot)=>{
        const u=normalize(raw);if(u){u.x=slot%8;u.y=7-Math.floor(slot/8);}return u;
      }):[],arenaOpponentLevel:enemy?.level});
    return state;
  };
  const attempt=action=>{
    try{applyAction(game,seatIndex,action);sync();return true;}
    catch{sync();return false;}
  };
  const owned=()=>[...state.board,...state.bench].filter(Boolean);
  const pairs=id=>owned().filter(u=>u.id===id&&u.star===1).length;
  const move=(u,slot)=>attempt({type:'move',uid:u.uid,to:{zone:'board',slot}});
  const deploy=()=>{
    // Same strength, bond and front/back balance objective as classic's
    // selectLineup. Online execution uses swaps, respecting population and
    // the eight-slot bench even while replacements are in progress.
    const score=team=>{
      const fronts=team.filter(u=>band(u)<=1).length,backs=team.filter(u=>band(u)>=2&&band(u)<=3).length;
      const balance=team.length>=3?(fronts?Math.min(fronts,2)*16:-38)+(backs?16:-22):0;
      return team.reduce((n,u)=>n+u.atk*1.7+u.maxhp*.22+definitions[u.id].cost*4+u.sks*5+(u.star-1)*9+
        u.items.reduce((v,k)=>v+(EQUIPMENT[k]?.crafted?32:18),0),0)+synergy(team)*8+balance;
    };
    const pool=owned(),team=[];
    while(team.length<state.lvl&&pool.length){
      let pick=0,best=-Infinity;
      pool.forEach((u,i)=>{const s=score([...team,u]);if(s>best+1e-6){best=s;pick=i;}});
      team.push(pool.splice(pick,1)[0]);
    }
    for(let pass=0;pass<3&&pool.length;pass++){
      const before=score(team);let gain=1,out=-1,incoming=-1;
      team.forEach((u,i)=>pool.forEach((v,j)=>{const trial=team.slice();trial[i]=v;
        const delta=score(trial)-before;if(delta>gain+1e-6){gain=delta;out=i;incoming=j;}}));
      if(out<0)break;[team[out],pool[incoming]]=[pool[incoming],team[out]];
    }
    const chosen=new Set(team.map(u=>u.uid));
    for(const u of team){
      if(state.board.some(v=>v?.uid===u.uid))continue;
      let slot=state.board.findIndex(v=>v&&!chosen.has(v.uid));
      if(slot<0)slot=state.board.findIndex((v,i)=>i>=32&&!v);
      if(slot<0||!move(u,slot))return;
    }
    team.sort((a,b)=>band(a)-band(b)||b.maxhp-a.maxhp);
    const used=new Set(),cols=[3,4,2,5,1,6,0,7],starts=[4,4,5,6,7];
    for(const u of team){
      const start=starts[band(u)],rows=[start,...[4,5,6,7].filter(r=>r!==start)];
      const slot=rows.flatMap(r=>cols.map(c=>r*8+c)).find(i=>!used.has(i));
      used.add(slot);if(state.board[slot]?.uid!==u.uid)move(u,slot);
    }
  };
  sync();
  const planner=globalThis.BotPlanner.create({
    state:()=>state,unitDef:id=>definitions[id],pairs,
    hasTwo:id=>owned().some(u=>u.id===id&&u.star===2),hasThree:id=>owned().some(u=>u.id===id&&u.star>=3),
    factions:d=>tags(d,'fac'),jobs:d=>tags(d,'job'),synScore:synergy,
    buyCard:slot=>attempt({type:'buy',slot}),buyXp:()=>attempt({type:'buyXp'}),
    xpNeeded,levelCap:()=>MAX_LEVEL,curse:()=>false,modifiers:()=>null,
    recipe,combine:(a,b)=>attempt({type:'combine',a,b}),slots:()=>3,passive:u=>u.passive,
    deploy,runLength:()=>40,chapterLength:()=>25,equipment:EQUIPMENT,gearPolicy:globalThis.BotEquipmentPolicy,
    refreshPrice:()=>2,mergeOnFull:false,
    refresh:()=>{
      if(state.lock&&!attempt({type:'lockShop'}))return false;
      const gold=state.gold;return attempt({type:'reroll'})&&state.gold<gold;
    },
    sell:(zone,index)=>{const u=state[zone][index];return !!u&&attempt({type:'sell',uid:u.uid});},
    unequip:u=>!u.items.length||attempt({type:'unequip',uid:u.uid}),
    equip:(u,itemIndex)=>attempt({type:'equip',uid:u.uid,itemIndex}),move,
    lock:()=>state.lock||attempt({type:'lockShop'}),render:()=>{},runId:()=>null
  });
  return {planner,state,deploy,attempt,
    pickOpening(){
      if(seat.openingGranted||!seat.openingOffer?.length)return;
      const plan=planner.botPlan();let best=0,score=-Infinity;
      seat.openingOffer.forEach((u,i)=>{const s=planner.botScoring(u,plan);if(s>score){best=i;score=s;}});
      attempt({type:'pickOpening',slot:best});
    },
    finish(){seat.botPlan=state.botPlan;seat.botPolicyVersion=globalThis.BotPlanner.version;attempt({type:'ready'});}
  };
}
