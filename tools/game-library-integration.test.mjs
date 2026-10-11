import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const workerSource=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

function worker({offline=false}={}) {
  const listeners=new Map(),writes=[],fallbacks=[];
  const context={
    URL,
    self:{location:{origin:'https://demo.test'},addEventListener:(name,handler)=>listeners.set(name,handler)},
    fetch:async()=>{if(offline)throw Error('offline');return {clone:()=>({}),ok:true};},
    caches:{open:async()=>({put:(key)=>writes.push(key)}),match:async key=>{fallbacks.push(key);return {cached:key};}},
  };
  vm.runInNewContext(workerSource,context);
  async function request(path,{method='GET',navigation=true}={}) {
    let response;
    listeners.get('fetch')({request:{method,url:`https://demo.test${path}`,mode:navigation?'navigate':'cors',headers:{get:()=>navigation?'text/html':''}},respondWith:promise=>response=promise});
    return response===undefined?null:await response;
  }
  return {request,writes,fallbacks};
}

test('game library routes never overwrite or fall back to classic cached HTML',async()=>{
  for(const offline of [false,true]){
    const sw=worker({offline});
    for(const path of ['/library','/library/','/library/index.html','/games/studio-manager/','/games/studio-manager/core.mjs','/assets/game-library/studio-manager/studio-v1.webp','/nested/library/']){
      assert.equal(await sw.request(path),null,path);
    }
    assert.deepEqual(sw.writes,[]);
    assert.deepEqual(sw.fallbacks,[]);
  }
});

test('classic navigation keeps its own offline fallback keys',async()=>{
  const sw=worker({offline:true});
  for(const [path,key] of [['/','./index.html?v=hall-2'],['/index.html','./index.html?v=hall-2'],['/classic.html','./classic.html?v=106'],['/online.html','./online.html?v=25'],['/survival.html','./survival.html']]){
    assert.equal((await sw.request(path)).cached,key);
  }
  assert.deepEqual(sw.fallbacks,['./index.html?v=hall-2','./index.html?v=hall-2','./classic.html?v=106','./online.html?v=25','./survival.html']);
});

test('arena and write requests keep bypassing classic cache',async()=>{
  const sw=worker();
  assert.equal(await sw.request('/arena.html'),null);
  assert.equal(await sw.request('/arena/core.mjs'),null);
  assert.equal(await sw.request('/api/arena/test',{method:'POST'}),null);
  assert.deepEqual(sw.writes,[]);
});
