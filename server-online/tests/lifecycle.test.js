import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {RoomManager} from '../src/rooms.js';
import {LOBBY_RECONNECT_MS} from '../src/protocol.js';

class Socket extends EventEmitter {
  messages=[];
  send(value){this.messages.push(JSON.parse(value));}
  close(code){this.code=code;this.emit('close');}
  receive(value){this.emit('message',JSON.stringify(value));}
}
function setup(t){
  const manager=new RoomManager();
  t.after(()=>{for(const entry of manager.rooms.values())entry.destroy();});
  const owner=manager.create('ABCDEFGH','房主'),entry=manager.get(owner.code);
  const attach=token=>{const ws=new Socket();entry.attach(ws);ws.receive({type:'auth',token});return ws;};
  return {manager,owner,entry,attach};
}
const latest=ws=>ws.messages.findLast(m=>m.type==='state');

test('explicit lobby leave transfers ownership, frees seats and invalidates only the departed token',t=>{
  const {entry,owner,attach}=setup(t),a=attach(owner.token);
  const guest=entry.join({name:'客人'}),b=attach(guest.token);
  entry.addBot(owner.token);
  assert.throws(()=>entry.leave('f'.repeat(64)),/重连凭证/);
  entry.leave(owner.token);
  assert.equal(a.code,4005);
  assert.equal(latest(b).seat,0);
  assert.equal(latest(b).lobby.hostSeat,0);
  assert.equal(entry.join({token:guest.token}).seat,0);
  assert.throws(()=>entry.join({token:owner.token}),/重连凭证/);
  assert.equal(entry.addBot(guest.token).seat,2);
});

test('disconnect cancels readiness, transfers host, permits grace reconnect and frees expired seats',t=>{
  const {entry,owner,attach}=setup(t),a=attach(owner.token);
  const guest=entry.join({name:'客人'}),b=attach(guest.token);
  a.receive({type:'ready',ready:true});a.close(1006);
  assert.equal(entry.room.players[0].ready,false);
  assert.equal(latest(b).lobby.hostSeat,1);
  assert.equal(entry.join({token:owner.token}).seat,0);
  const resumed=attach(owner.token);
  assert.equal(latest(resumed).lobby.hostSeat,1,'returning host does not steal ownership');
  assert.throws(()=>entry.addBot(owner.token),/只有房主/);
  resumed.close(1006);
  entry.room.players[0].disconnectedAt=Date.now()-LOBBY_RECONNECT_MS-1;
  entry.tick();
  assert.equal(latest(b).seat,0);
  assert.equal(latest(b).lobby.hostSeat,0);
  assert.throws(()=>entry.join({token:owner.token}),/重连凭证/);
});

test('socket replacement preserves readiness and does not mark the replacement offline',t=>{
  const {entry,owner,attach}=setup(t),a=attach(owner.token);
  a.receive({type:'ready',ready:true});
  const b=attach(owner.token);
  assert.equal(a.code,4001);
  assert.equal(latest(b).lobby.players[0].ready,true);
  assert.equal(entry.room.players[0].disconnectedAt,null);
});

test('disconnected ready humans cannot launch a lobby and bot-only lobbies expire after grace',t=>{
  const {manager,entry,owner,attach}=setup(t),a=attach(owner.token);
  const guest=entry.join({name:'客人'}),b=attach(guest.token);
  for(let i=0;i<6;i++)entry.addBot(owner.token);
  a.receive({type:'ready',ready:true});a.close(1006);
  b.receive({type:'ready',ready:true});
  assert.equal(entry.room.status,'waiting');
  b.close(1006);
  for(const p of entry.room.players)if(!p.bot)p.disconnectedAt=Date.now()-LOBBY_RECONNECT_MS-1;
  entry.tick();
  assert.equal(manager.get(owner.code),null);
});

test('in-game host departure preserves other humans and all departures remove only their room',t=>{
  const {manager,entry,owner,attach}=setup(t),a=attach(owner.token);
  const guest=entry.join({name:'客人'}),b=attach(guest.token);
  for(let i=0;i<6;i++)entry.addBot(owner.token);
  a.receive({type:'ready',ready:true});b.receive({type:'ready',ready:true});
  const other=manager.create('BCDEFGHJ','其他房主');
  entry.leave(owner.token);
  assert.equal(entry.room.status,'playing');
  assert.equal(latest(b).seat,1,'in-game seats never compact');
  assert.equal(manager.get(owner.code),entry);
  entry.leave(guest.token);
  assert.equal(manager.get(owner.code),null);
  assert.ok(manager.get(other.code));
});

test('human elimination keeps another human playing but bot-only survivors delete the room',t=>{
  const {manager,entry,owner,attach}=setup(t),a=attach(owner.token);
  const guest=entry.join({name:'客人'}),b=attach(guest.token);
  for(let i=0;i<6;i++)entry.addBot(owner.token);
  a.receive({type:'ready',ready:true});b.receive({type:'ready',ready:true});
  entry.room.game.seats[0].alive=false;
  entry.tick();
  assert.equal(manager.get(owner.code),entry);
  entry.room.game.seats[1].alive=false;
  entry.tick();
  assert.equal(manager.get(owner.code),null);
  assert.ok(a.messages.some(m=>m.code==='room_bots_only'));
});
