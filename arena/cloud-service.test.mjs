import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudArenaServer,PersistentArenaStore} from './cloud-service.mjs';
import {createRun,RULESET} from './core.mjs';
import {createHash} from 'node:crypto';
async function withServer(store,fn){const server=createCloudArenaServer(store,{rateLimit:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(r=>server.close(r));}}
test('cloud HTTP rejects invalid bodies, large payloads, wrong origins and absent bearer credentials',async()=>{
 await withServer({create:async()=>{throw new Error('Must never create invalid run');}},async base=>{
  for(const body of ['null','[]','42','{invalid']){const r=await fetch(base+'/api/arena/runs',{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(r.status,400);}
  assert.equal((await fetch(base+'/api/arena/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teamName:'x'.repeat(40000)})})).status,413);
  assert.equal((await fetch(base+'/api/arena/runs',{method:'POST',body:'{}'})).status,415);
  assert.equal((await fetch(base+'/api/arena/health',{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(base+'/api/arena/run')).status,401);
 });
});

test('legacy cloud run and retry receipt migrate without discarding progress or exposing costume replays',async()=>{
 const run=createRun('legacy-cloud');run.ruleset='idol-queue-v1';run.round=8;run.wins=4;run.gold=7;run.revision=9;
 run.team[0]={uid:'retired',id:'rei__costume49',atk:17,hp:22,level:2,xp:2,perk:'melon'};
 run.shop[0]={id:'yukie__costume25',frozen:false};
 const stored={run,last_battle:{battle:{ruleset:'idol-queue-v1',events:[]},opponent:{name:'retired'}}};
 const input={requestId:'legacy-retry',revision:8,action:{type:'roll'}};
 const fingerprint=createHash('sha256').update(JSON.stringify({path:'/api/arena/action',revision:input.revision,action:input.action})).digest('hex');
 let committed;
 await withServer({get:async()=>structuredClone(stored),prior:async(_owner,id)=>id==='legacy-retry'?{fingerprint,result:{run}}:null,commit:async(_owner,_input,_fingerprint,next,result)=>{committed=next;return result;}},async base=>{
  const headers={Authorization:'Bearer '+'a'.repeat(48),'Content-Type':'application/json'};
  const restored=await (await fetch(base+'/api/arena/last-battle',{headers})).json();
  assert.equal(restored.run.ruleset,RULESET);assert.equal(restored.run.team[0].id,'rei');assert.equal(restored.run.round,8);assert.equal(restored.run.team[0].hp,22);assert.equal(restored.battle,null);
  const retry=await (await fetch(base+'/api/arena/action',{method:'POST',headers,body:JSON.stringify(input)})).json();assert.equal(retry.run.team[0].id,'rei');assert.equal(retry.run.revision,9);
  const changed=await fetch(base+'/api/arena/action',{method:'POST',headers,body:JSON.stringify({requestId:'migrate-freeze',revision:9,action:{type:'freeze',zone:'shop',slot:0}})});assert.equal(changed.status,200);
  assert.equal(committed.ruleset,RULESET);assert.equal(committed.shop[0].id,'yukie');assert.equal(committed.shop[0].frozen,true);assert.equal(committed.gold,7);assert.equal(committed.revision,10);
  assert.equal(stored.run.team[0].id,'rei__costume49');
 });
});
test('cloud HTTP never returns SDK credentials or internal error details',async()=>{
 await withServer({health:async()=>{throw new Error('private SDK credential');}},async base=>{
  const r=await fetch(base+'/api/arena/health',{headers:{Origin:'https://autochess.hanari520.cn','x-cloudbase-context':'private context'}});assert.equal(r.status,503);assert.equal(r.headers.get('access-control-allow-origin'),'https://autochess.hanari520.cn');const text=await r.text();assert(!text.includes('private'));assert(!text.includes('context'));
 });
});

test('cloud round batches reject invalid spending, commit once and never trust client stats',async()=>{
 const initial=createRun('cloud-round-actions');let stored={run:structuredClone(initial)},commits=0;const receipts=new Map();
 const store={get:async()=>structuredClone(stored),prior:async(_owner,id)=>receipts.get(id),opponents:async()=>[],commit:async(_owner,input,fingerprint,run,result)=>{commits++;stored={run};receipts.set(input.requestId,{fingerprint,result});return result;}};
 await withServer(store,async base=>{
  const headers={Authorization:'Bearer '+'b'.repeat(48),'Content-Type':'application/json'};
  const post=async body=>{const r=await fetch(base+'/api/arena/battle',{method:'POST',headers,body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  assert.equal((await post({requestId:'bad-actions-id',revision:0,actions:[{type:'buy',slot:0,to:0},...Array(20).fill({type:'roll'})]})).status,400);assert.equal(commits,0);assert.deepEqual(stored.run,initial);
  const input={requestId:'good-actions-id',revision:0,actions:[{type:'buy',slot:0,to:0},{type:'roll'}],team:[{atk:999,hp:999}],gold:999,wins:10};
  const first=await post(input);assert.equal(first.status,200);assert.equal(first.data.capabilities.roundActions,true);assert.equal(first.data.run.revision,1);assert(first.data.run.wins<=1);assert(first.data.run.team[0].atk<50);assert.equal(first.data.opponent.source,'training');assert.equal(first.data.run.preparationEvents,undefined);
  assert.deepEqual(await post(input),first);assert.equal(commits,1);assert.equal((await post({...input,actions:[{type:'roll'}]})).status,409);assert.equal(commits,1);
 });
});

function fakeDatabase(answer){
 const calls=[];
 return {calls,from(table){const request={table,filters:[]};calls.push(request);const chain={select(fields){request.fields=fields;return chain;},eq(key,value){request.filters.push([key,value]);return chain;},order(){return chain;},limit(value){request.limit=value;return chain;},async abortSignal(){return {data:await answer(request)};}};return chain;},rpc(name,args){const request={rpc:name,args};calls.push(request);return {async abortSignal(){return {data:await answer(request)};}};}};
}
test('bounded pools share concurrent reads, exclude self, expose new players, and reads omit replays',async()=>{
 const db=fakeDatabase(async request=>request.table==='idol_arena_snapshots'?[{id:'a-r1',owner_hash:'a',round:1,name:'A',team:[]}]:request.rpc?request.args.p_result:[{run:createRun('lean-read'),last_opponent:'old-owner'}]);
 const store=new PersistentArenaStore(db);
 await store.health();await store.health();assert.equal(db.calls.length,1);
 const [own,other]=await Promise.all([store.opponents(1,'a'),store.opponents(1,'b')]);assert.deepEqual(own,[]);assert.equal(other[0].id,'a-r1');assert.equal(db.calls.filter(r=>r.table==='idol_arena_snapshots').length,1);assert.equal(db.calls.at(-1).limit,40);
 await store.get('a');assert.equal(db.calls.at(-1).fields,'run,last_opponent');await store.get('a',{replay:true});assert.equal(db.calls.at(-1).fields,'run,last_battle,last_opponent');
 const run=createRun('commit');run.revision=1;await store.commit('b',{revision:0,requestId:'batch-id'},'fingerprint',run,{run},{id:'b-r1',round:1,name:'B',team:[]});
 const updated=await store.opponents(1,'a');assert.equal(updated.length,1);assert.equal(updated[0].id,'b-r1');assert.equal(db.calls.filter(r=>r.table==='idol_arena_snapshots').length,1);
});
test('receipt references hydrate only the current replay and reject an expired replay without settling again',async()=>{
 let revision=1;
 const db=fakeDatabase(request=>request.table==='idol_arena_requests'?[{fingerprint:'same',result:{run:createRun('receipt'),replayRevision:1}}]:[{last_battle:{replayRevision:revision,battle:{winner:'a'},opponent:{name:'A'}}}]);
 const store=new PersistentArenaStore(db);assert.equal((await store.prior('a','receipt-id')).result.battle.winner,'a');revision=2;assert.equal((await store.prior('a','receipt-id')).result.status,409);
});
