process.env.ONLINE_INVITE_CODE = 'test-invitation';
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/server.js';

test('invitation protects verification, creation, joining and token recovery', async () => {
  const server = await startServer({port:0, host:'127.0.0.1'});
  async function post(path, body) {
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      method:'POST', headers:{'Content-Type':'application/json', Origin:'http://localhost:8081'}, body:JSON.stringify(body),
    });
    return {status:response.status, body:await response.json()};
  }
  try {
    for (const inviteCode of [undefined, '', 'wrong', 'TEST-INVITATION', ['test-invitation']]) {
      for (const path of ['/api/invitation', '/api/rooms', '/api/rooms/ABCDEFGH/join']) {
        const result = await post(path, {name:'uninvited', inviteCode});
        assert.equal(result.status,403);
        assert.equal(result.body.error.code,'invite_required');
      }
    }
    assert.equal(server.manager.rooms.size,0);
    assert.equal((await post('/api/invitation',{inviteCode:' test-invitation '})).status,200);
    const created = await post('/api/rooms',{name:'invited host',inviteCode:'test-invitation'});
    assert.equal(created.status,201);
    const path = `/api/rooms/${created.body.code}/join`;
    assert.equal((await post(path,{token:created.body.token})).status,403);
    assert.equal((await post(path,{token:created.body.token,inviteCode:'wrong'})).status,403);
    const restored = await post(path,{token:created.body.token,inviteCode:'test-invitation'});
    assert.equal(restored.status,200);
    assert.equal(restored.body.seat,created.body.seat);
    assert.equal((await post(path,{name:'invited guest',inviteCode:'test-invitation'})).status,200);
    assert.equal(server.manager.rooms.size,1);
  } finally { await server.close(); }
});
