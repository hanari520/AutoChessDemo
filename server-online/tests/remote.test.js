import test from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.ONLINE_TEST_URL;
const origin = 'http://localhost:8081';

async function post(path, body, overrideOrigin = origin) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', Origin: overrideOrigin },
    body: JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

function connect(code, token, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/rooms/${code}/ws`);
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('error', onError);
      ws.removeEventListener('close', onClose);
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      cleanup();
      try { ws.close(); } catch { /* already closed */ }
      reject(error);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ws);
    };
    const onOpen = () => ws.send(JSON.stringify({ type: 'auth', token }));
    const onMessage = event => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'state') succeed();
        else if (msg.type === 'error') fail(new Error(msg.message));
      } catch (error) { fail(error); }
    };
    const onError = () => fail(new Error('WebSocket connection error'));
    const onClose = event => fail(new Error(`WebSocket closed before state (${event.code})`));
    const timeout = setTimeout(() => fail(new Error('WebSocket state timeout')), timeoutMs);
    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', onClose);
  });
}

function openAnonymous(code, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/rooms/${code}/ws`);
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onError);
      ws.removeEventListener('close', onClose);
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      cleanup();
      try { ws.close(); } catch { /* already closed */ }
      reject(error);
    };
    const onOpen = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ws);
    };
    const onError = () => fail(new Error('anonymous WebSocket was rejected'));
    const onClose = event => fail(new Error(`anonymous WebSocket closed before open (${event.code})`));
    const timeout = setTimeout(() => fail(new Error('anonymous WebSocket state timeout')), timeoutMs);
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', onClose);
  });
}

function nextMessage(ws, predicate, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.removeEventListener('message', onMessage); reject(new Error('message timeout')); }, timeoutMs);
    const onMessage = event => {
      const message = JSON.parse(event.data);
      if (!predicate(message)) return;
      clearTimeout(timeout); ws.removeEventListener('message', onMessage); resolve(message);
    };
    ws.addEventListener('message', onMessage);
  });
}

function waitForClosing(ws, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.CLOSING) {
        clearInterval(interval);
        clearTimeout(timeout);
        resolve();
      }
    }, 10);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('WebSocket did not enter CLOSING state'));
    }, timeoutMs);
  });
}

test('eight seats, private views, replay and reconnect', { skip: !base }, async () => {
  const created = await post('/api/rooms', { name: '房主' });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('access-control-allow-origin'), origin);
  const { code } = created.body;
  const seats = [created.body];
  for (let seat = 1; seat < 8; seat++) {
    const joined = await post(`/api/rooms/${code}/join`, { name: `玩家${seat}` });
    assert.equal(joined.status, 200);
    assert.equal(joined.body.seat, seat);
    seats.push(joined.body);
  }
  const full = await post(`/api/rooms/${code}/join`, { name: '第九人' });
  assert.equal(full.status, 409);
  assert.equal(full.body.error.code, 'room_full');
  const badOrigin = await post('/api/rooms', { name: 'bad' }, 'https://evil.example');
  assert.equal(badOrigin.status, 403);

  const sockets = await Promise.all(seats.map(seat => connect(code, seat.token)));
  let reconnected;
  try {
    const prepStatesPromise = Promise.all(sockets.map(socket => nextMessage(socket, message => message.type === 'state' && message.view?.phase === 'prep')));
    for (const socket of sockets) socket.send(JSON.stringify({ type: 'ready', ready: true }));
    const states = await prepStatesPromise;
    assert.equal(states[0].lobby.status, 'playing');
    assert.equal(states[0].view.me.shop.length, 5);
    assert.equal(states[1].view.seat, 1);
    assert.equal(states[0].view.players[1].shop, undefined);
    const first = states[0];
    const action = { type: 'action', id: 'buy-one', seq: first.nextSeq, action: { type: 'buy', slot: 0 } };
    const ack = nextMessage(sockets[0], message => message.type === 'ack' && message.id === action.id);
    sockets[0].send(JSON.stringify(action));
    assert.equal((await ack).seq, action.seq);
    const duplicate = nextMessage(sockets[0], message => message.type === 'ack' && message.duplicate === true);
    sockets[0].send(JSON.stringify(action));
    await duplicate;
    const stale = nextMessage(sockets[0], message => message.type === 'error' && message.code === 'out_of_order');
    sockets[0].send(JSON.stringify({ ...action, id: 'different' }));
    await stale;
    sockets[0].close();
    const rejoined = await post(`/api/rooms/${code}/join`, { token: seats[0].token });
    assert.equal(rejoined.body.seat, 0);
    reconnected = await connect(code, seats[0].token);
    if (process.env.ONLINE_TEST_PHASES === '1') {
      const combat = await nextMessage(reconnected, message => message.type === 'state' && message.view?.phase === 'combat', 50_000);
      assert.equal(combat.view.round, 1);
      assert.equal(combat.view.battles.length, 1);
      assert.ok(Array.isArray(combat.view.battles[0].formationA));
      assert.ok(Array.isArray(combat.view.battles[0].events));
      const result = await nextMessage(reconnected, message => message.type === 'state' && message.view?.phase === 'result', 12_000);
      assert.equal(result.view.results.length, 4);
      assert.ok(result.view.results.every(item => item.battle && Number.isInteger(item.battle.durationMs)));
      const nextPrep = await nextMessage(reconnected, message => message.type === 'state' && message.view?.phase === 'prep' && message.view.round === 2, 12_000);
      assert.equal(nextPrep.view.me.shop.length, 5);
    }
  } finally {
    reconnected?.close();
    sockets.forEach(socket => socket.close());
  }
});

test('anonymous sockets cannot exhaust room admission and expire after the auth deadline', { skip: !base }, async () => {
  const created = await post('/api/rooms', { name: '认证测试房主' });
  assert.equal(created.status, 201);
  const { code, token } = created.body;
  const anonymous = [];
  let authenticated;
  try {
    for (let i = 0; i < 8; i++) anonymous.push(await openAnonymous(code));
    const evictedPending = waitForClosing(anonymous[0]);

    // Admission replaces the oldest unauthenticated connection, so a real player can still authenticate.
    authenticated = await connect(code, token);
    await evictedPending;

    const anonymousPingError = nextMessage(anonymous[1], message => message.type === 'error');
    anonymous[1].send(JSON.stringify({ type: 'ping' }));
    assert.equal((await anonymousPingError).code, 'auth_required');
    assert.ok(authenticated);

    const expirationError = nextMessage(anonymous[2], message => message.type === 'error' && message.code === 'auth_timeout', 20_000);
    assert.equal((await expirationError).code, 'auth_timeout');
    await waitForClosing(anonymous[2]);
  } finally {
    authenticated?.close();
    anonymous.forEach(socket => socket.close());
  }
});
