process.env.ONLINE_INVITE_CODE = 'test-invitation';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
process.env.ONLINE_FAST='2500';
const {startServer}=await import('../src/server.js');

test('eight independent humans receive four matching public battles with private inventories and resume the same fight',async()=>{
  const server=await startServer({port:0,host:'127.0.0.1'}),base=`http://127.0.0.1:${server.port}`,clients=[];
  async function post(path,body){const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',Origin:'http://localhost:8081'},body:JSON.stringify({inviteCode:'test-invitation',...body})});assert.ok(response.ok);return response.json();}
  function wait(client,predicate) {
    if(client.latest&&predicate(client.latest))return Promise.resolve(client.latest);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{client.waiters.delete(listener);reject(Error('state timeout'));},10000);
      const listener=msg=>{if(predicate(msg)){clearTimeout(timer);client.waiters.delete(listener);resolve(msg);}};client.waiters.add(listener);
    });
  }
  async function connect(code,token){
    const ws=new WebSocket(`${base.replace('http:','ws:')}/api/rooms/${code}/ws`,{headers:{Origin:'http://localhost:8081'}}),client={ws,latest:null,waiters:new Set(),token};clients.push(client);
    ws.addEventListener('open',()=>ws.send(JSON.stringify({type:'auth',token})));
    ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.type==='state')client.latest=msg;for(const waiter of [...client.waiters])waiter(msg);});
    await wait(client,msg=>msg.type==='state');return client;
  }
  async function act(client,action){
    const message={type:'action',id:`client-${client.latest.seat}-${client.latest.nextSeq}`,seq:client.latest.nextSeq,action};
    const ack=wait(client,msg=>msg.type==='ack'&&msg.id===message.id);client.ws.send(JSON.stringify(message));await ack;
    return wait(client,msg=>msg.type==='state'&&msg.nextSeq===message.seq+1);
  }
  try {
    const first=await post('/api/rooms',{name:'真人 0'}),seats=[first];
    for(let n=1;n<8;n++)seats.push(await post(`/api/rooms/${first.code}/join`,{name:`真人 ${n}`}));
    for(const seat of seats)await connect(first.code,seat.token);
    const prep=clients.map(client=>wait(client,msg=>msg.view?.phase==='prep'));
    for(const client of clients)client.ws.send(JSON.stringify({type:'ready',ready:true}));
    await Promise.all(prep);
    await Promise.all(clients.map(async client=>{
      const slot=client.latest.view.me.shop.findIndex(unit=>unit&&unit.cost<=client.latest.view.me.gold);
      const bought=await act(client,{type:'buy',slot});
      const unit=bought.view.me.bench.find(Boolean);assert.ok(unit);
      await act(client,{type:'move',uid:unit.uid,to:{zone:'board',slot:32}});
      await act(client,{type:'ready'});
    }));
    const combat=await Promise.all(clients.map(client=>wait(client,msg=>msg.view?.phase==='combat')));
    const pairs=new Map();
    for(const msg of combat){
      assert.equal(msg.view.battles.length,4);
      for(const battle of msg.view.battles){const key=`${battle.a}:${battle.b}`;
      assert.ok(battle.events.some(e=>e.type==='attack'));
      assert.equal(msg.phaseDurationMs,2500);
      if(pairs.has(key))assert.deepEqual(battle,pairs.get(key));else pairs.set(key,battle);
      }
      assert.ok(msg.view.players.every(player=>player.shop===undefined&&player.bench===undefined));
    }
    assert.equal(pairs.size,4);
    clients[0].ws.close();
    const resumed=await connect(first.code,seats[0].token);
    assert.equal(resumed.latest.seat,0);
    assert.equal(resumed.latest.deadline,combat[0].deadline);
    assert.deepEqual(resumed.latest.view.battles,combat[0].view.battles);
  } finally {for(const client of clients)client.ws.close();await server.close();}
});
