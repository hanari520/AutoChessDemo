import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudArenaServer} from './cloud-service.mjs';
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
test('cloud HTTP never returns SDK credentials or internal error details',async()=>{
 await withServer({health:async()=>{throw new Error('private SDK credential');}},async base=>{
  const r=await fetch(base+'/api/arena/health',{headers:{Origin:'https://autochess.hanari520.cn','x-cloudbase-context':'private context'}});assert.equal(r.status,503);assert.equal(r.headers.get('access-control-allow-origin'),'https://autochess.hanari520.cn');const text=await r.text();assert(!text.includes('private'));assert(!text.includes('context'));
 });
});
