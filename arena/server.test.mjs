import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { presetsFor } from './presets.mjs';

test('two players asynchronously match immutable snapshots; retry and restart preserve results',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'idol-arena-'));let service=await startServer({port:0,dataDir:dir});
 const call=async(path,body,token)=>{const res=await fetch(service.url+'/api/arena/'+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};};
 try{
  assert.equal((await call('runs',{teamName:'x'.repeat(31)})).status,400);
  const a=(await call('runs',{teamName:'测试星光队'})).data,b=(await call('runs',{})).data;
  assert.equal((await call('run')).status,401);
  const buyA={requestId:'buy-player-a',revision:0,action:{type:'buy',slot:0,to:0}};
  const first=await call('action',buyA,a.token),duplicate=await call('action',buyA,a.token);assert.deepEqual(first,duplicate);assert.equal(first.data.run.gold,7);
  assert.equal((await call('action',{...buyA,action:{type:'roll'}},a.token)).status,409);
  assert.equal((await call('action',{requestId:'stale-player-a',revision:0,action:{type:'roll'}},a.token)).status,409);
  const submitA={requestId:'battle-player-a',revision:1},fightA=await call('battle',submitA,a.token);assert.equal(fightA.data.opponent.source,'training');assert.deepEqual(fightA,await call('battle',submitA,a.token));
  await call('action',{requestId:'buy-player-b',revision:0,action:{type:'buy',slot:0,to:0}},b.token);
  const fightB=await call('battle',{requestId:'battle-player-b',revision:1},b.token);assert.equal(fightB.data.opponent.source,'player');assert.equal(fightB.data.opponent.round,1);assert.equal(fightB.data.opponent.name,'测试星光队');
  assert.deepEqual((await call('run',undefined,a.token)).data.run,fightA.data.run);
  const rejected=await fetch(service.url+'/api/arena/runs',{method:'POST',headers:{origin:'https://evil.invalid','content-type':'application/json'},body:'{}'});assert.equal(rejected.status,403);
  const privateFile=await fetch(service.url+'/arena/server.mjs');assert.equal(privateFile.status,403);
  const ui=await fetch(service.url+'/arena.html');assert.equal(ui.status,200);assert.ok((await ui.text()).includes('星域小队'));
  await service.close();service=await startServer({port:0,dataDir:dir});assert.deepEqual((await call('last-battle',undefined,a.token)).data,fightA.data);assert.deepEqual(await call('battle',submitA,a.token),fightA);
 }finally{await service.close();await rm(dir,{recursive:true,force:true});}
});

test('cloud publication failure leaves an outbox; retry settles exactly once and uploads once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'idol-arena-cloud-'));let failUpload=true;const uploaded=new Map();
 const store={healthy:true,async seed(){},async list(){return[];},async training(round){return presetsFor(round);},async publish(s){if(failUpload){const e=new Error('temporary cloud error');e.status=503;throw e;}uploaded.set(s.id,structuredClone(s));}};
 const service=await startServer({port:0,dataDir:dir,snapshotStore:store});
 async function call(path,input,token){const res=await fetch(service.url+'/api/arena/'+path,{method:input?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:input?JSON.stringify(input):undefined});return {status:res.status,data:await res.json()};}
 try{
  const {token}= (await call('runs',{})).data;
  await call('action',{requestId:'cloud-buy-one',revision:0,action:{type:'buy',slot:0,to:0}},token);
  const input={requestId:'cloud-battle-one',revision:1};assert.equal((await call('battle',input,token)).status,503);
  const committed=(await call('last-battle',null,token)).data;assert.equal(committed.run.revision,2);assert.equal(uploaded.size,0);
  failUpload=false;const retry=await call('battle',input,token);assert.equal(retry.status,200);assert.deepEqual(retry.data,committed);assert.equal(uploaded.size,1);
  const repeat=await call('battle',input,token);assert.deepEqual(repeat.data,committed);assert.equal(uploaded.size,1);
 }finally{await service.close();await rm(dir,{recursive:true,force:true});}
});
