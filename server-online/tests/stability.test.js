import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { startServer } from '../src/server.js';

class DurableTestStore {
  rooms = new Map(); fail = false;
  async open() { return structuredClone([...this.rooms.values()]); }
  async save(room) {
    await delay(2);
    if (this.fail) throw new Error('simulated storage outage');
    this.rooms.set(room.code, structuredClone(room));
  }
  async remove(code) { this.rooms.delete(code); }
  async close() {}
  health() { return {kind:'test',durable:true,healthy:true}; }
}

async function post(instance, path, data, token) {
  const response = await fetch(`http://127.0.0.1:${instance.port}${path}`, {
    method:'POST', headers:{'content-type':'application/json', Origin:'http://localhost:8081', ...(token ? {authorization:`Bearer ${token}`} : {})}, body:JSON.stringify(data),
  });
  return {status:response.status, body:await response.json()};
}
async function client(instance, room) {
  const ws = new WebSocket(`ws://127.0.0.1:${instance.port}/api/rooms/${room.code}/ws`, { headers: { Origin: 'http://localhost:8081' } });
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  ws.on('error', () => {});
  await once(ws, 'open'); ws.send(JSON.stringify({type:'auth', token:room.token}));
  const wait = async predicate => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) { const match = messages.find(predicate); if (match) return match; await delay(10); }
    throw new Error('Expected websocket message did not arrive');
  };
  await wait(m => m.type === 'state');
  return {ws, messages, wait};
}

test('durable commit survives restart, resumes credentials and confirms a duplicate without charging twice', async t => {
  const store = new DurableTestStore();
  let instance = await startServer({port:0, store});
  t.after(() => instance.close());
  const {body:room} = await post(instance, '/api/rooms', {name:'恢复玩家'});
  const first = await client(instance, room);
  for (let i=0;i<7;i++) assert.equal((await post(instance, `/api/rooms/${room.code}/bots`, {token:room.token})).status, 201);
  first.ws.send(JSON.stringify({type:'ready'}));
  const playing = await first.wait(m => m.view?.phase === 'prep');
  const action = {type:'action',id:'durable-buy',seq:1,round:playing.view.round,action:{type:'buy',slot:0}};
  first.ws.send(JSON.stringify(action));
  await first.wait(m => m.type === 'ack' && m.id === action.id);
  const saved = structuredClone(store.rooms.get(room.code));
  assert.equal(saved.players[0].lastSeq, 1);
  await instance.close();
  instance = await startServer({port:0, store});
  assert.equal(instance.manager.rooms.size, 1);
  assert.ok(instance.manager.get(room.code).room.deadline - Date.now() >= 14_000);
  const second = await client(instance, room);
  second.ws.send(JSON.stringify(action));
  const ack = await second.wait(m => m.type === 'ack' && m.id === action.id);
  assert.equal(ack.duplicate, true);
  assert.deepEqual(instance.manager.get(room.code).room.game.seats[0], saved.game.seats[0]);
  second.ws.send(JSON.stringify({...action,id:'stale-buy',seq:2,round:playing.view.round-1}));
  assert.equal((await second.wait(m => m.id === 'stale-buy')).code, 'stale_action');
});

test('storage failure emits no success or uncommitted state and preserves the committed game', async t => {
  const store = new DurableTestStore(); const instance = await startServer({port:0,store}); t.after(() => instance.close());
  const {body:room} = await post(instance,'/api/rooms',{name:'存储故障'});
  const peer = await client(instance,room);
  for(let i=0;i<7;i++) await post(instance,`/api/rooms/${room.code}/bots`,{token:room.token});
  peer.ws.send(JSON.stringify({type:'ready'})); await peer.wait(m=>m.view?.phase === 'prep');
  const before = structuredClone(store.rooms.get(room.code));
  peer.messages.length=0; store.fail=true;
  peer.ws.send(JSON.stringify({type:'action',id:'failed-buy',seq:1,action:{type:'buy',slot:0}}));
  const [code] = await once(peer.ws,'close'); assert.equal(code,1012);
  assert.equal(peer.messages.some(m=>m.type==='ack' || m.type==='state'),false);
  assert.deepEqual(store.rooms.get(room.code), before);
  assert.equal(instance.manager.get(room.code).room.players[0].lastSeq,0);
});

test('maintenance is authenticated, blocks new games and lets existing games continue', async t => {
  const previous = process.env.ADMIN_TOKEN; process.env.ADMIN_TOKEN='local-maintenance-test';
  t.after(()=>{if(previous===undefined)delete process.env.ADMIN_TOKEN;else process.env.ADMIN_TOKEN=previous;});
  const instance = await startServer({port:0}); t.after(()=>instance.close());
  const {body:room}=await post(instance,'/api/rooms',{name:'维护测试'});
  const peer=await client(instance,room);
  assert.equal((await post(instance,'/api/admin/drain',{})).status,403);
  assert.equal((await post(instance,'/api/admin/drain',{},'local-maintenance-test')).body.drainComplete,true);
  assert.equal((await post(instance,'/api/rooms',{name:'新房'})).status,503);
  peer.ws.send(JSON.stringify({type:'ready',id:'maintenance-ready'}));
  assert.equal((await peer.wait(m=>m.id==='maintenance-ready')).code,'maintenance');
  peer.ws.send(JSON.stringify({type:'sync'})); await peer.wait(m=>m.type==='state' && m.maintenance);
  assert.equal((await post(instance,'/api/admin/drain',{draining:false},'local-maintenance-test')).status,200);
  for(let i=0;i<7;i++)await post(instance,`/api/rooms/${room.code}/bots`,{token:room.token});
  peer.ws.send(JSON.stringify({type:'ready'}));await peer.wait(m=>m.view?.phase==='prep');
  const drain=await post(instance,'/api/admin/drain',{},'local-maintenance-test');assert.equal(drain.body.activeGames,1);assert.equal(drain.body.drainComplete,false);
  assert.equal((await post(instance,'/api/admin/handoff',{},'local-maintenance-test')).status,409);
  peer.ws.send(JSON.stringify({type:'action',id:'drain-buy',seq:1,action:{type:'buy',slot:0}}));
  await peer.wait(m=>m.type==='ack'&&m.id==='drain-buy');
});

test('drained deployment handoff releases storage without restarting the standby process', async t => {
  const previous=process.env.ADMIN_TOKEN;process.env.ADMIN_TOKEN='handoff-test';
  t.after(()=>{if(previous===undefined)delete process.env.ADMIN_TOKEN;else process.env.ADMIN_TOKEN=previous;});
  const store=new DurableTestStore();let releases=0;store.close=async()=>{releases++;};
  const instance=await startServer({port:0,store});t.after(()=>instance.close());
  const {body:room}=await post(instance,'/api/rooms',{name:'发布交接'});
  const peer=await client(instance,room);
  await post(instance,'/api/admin/drain',{},'handoff-test');
  const closed=once(peer.ws,'close');
  assert.equal((await post(instance,'/api/admin/handoff',{},'handoff-test')).status,200);
  assert.equal((await closed)[0],1012);assert.equal(releases,1);
  assert.equal((await fetch(`http://127.0.0.1:${instance.port}/api/health`)).status,200);
  assert.equal((await fetch(`http://127.0.0.1:${instance.port}/api/ready`)).status,503);
  assert.equal((await post(instance,'/api/rooms',{name:'待机拒绝'})).status,503);
  const replacement=await startServer({port:0,store});t.after(()=>replacement.close());
  const resumed=await client(replacement,room);
  assert.equal(resumed.messages.find(m=>m.type==='state').seat,0);
});

test('concurrent room creation respects capacity and websocket flooding is rejected', async t => {
  const instance=await startServer({port:0,store:new DurableTestStore(),maxRooms:1});t.after(()=>instance.close());
  const results=await Promise.all([post(instance,'/api/rooms',{name:'甲'}),post(instance,'/api/rooms',{name:'乙'})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,503]);
  const peer=await client(instance,results.find(r=>r.status===201).body);
  for(let i=0;i<30;i++)peer.ws.send(JSON.stringify({type:'ping'}));
  await peer.wait(m=>m.code==='rate_limited');
  assert.ok(instance.manager.metrics.rateLimited>0);
});
