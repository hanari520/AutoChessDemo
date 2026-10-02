import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudArenaServer} from './cloud-service.mjs';
import {createRun,RULESET} from './core.mjs';
import {createHash} from 'node:crypto';
async function withServer(store,fn){const server=createCloudArenaServer(store,{rateLimit:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(r=>server.close(r));}}
test('cloud HTTP rejects invalid bodies, large payloads, wrong origins and absent bearer credentials',async()=>{
 await withServer({create:async()=>{throw new Error('Must never create invalid run');}},async base=>{
  for(const body of ['null','[]','42','{invalid']){const r=await fetch(base+'/api/arena/runs',{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(r.status,400);}
  assert.equal((await fetch(base+'/api/arena/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teamName:'x'.repeat(20000)})})).status,413);
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
