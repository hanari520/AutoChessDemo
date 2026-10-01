process.env.ONLINE_INVITE_CODE = 'test-invitation';
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

// Fast phases so a full eight-player game finishes within seconds.
process.env.ONLINE_FAST = '80';
const { startServer } = await import('../src/server.js');

const handle = await startServer({ port: 0, host: '127.0.0.1' });
const base = `http://127.0.0.1:${handle.port}`;
const origin = 'http://localhost:8081';

test.after(() => handle.close());

async function post(path, body, overrideOrigin = origin) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', Origin: overrideOrigin },
    body: JSON.stringify({inviteCode:'test-invitation', ...body}),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

function connect(code, token, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/rooms/${code}/ws`, { headers: { Origin: origin } });
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
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/rooms/${code}/ws`, { headers: { Origin: origin } });
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

function waitClosed(ws, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket did not close')), timeoutMs);
    ws.addEventListener('close', event => { clearTimeout(timeout); resolve(event); }, { once: true });
  });
}

/** Keeps the latest state message and resolves when a matching one arrives. */
function trackStates(ws) {
  const tracker = {
    latest: null,
    next(predicate, timeoutMs = 60_000) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.removeEventListener('message', onMessage);
          reject(new Error('state timeout'));
        }, timeoutMs);
        const onMessage = event => {
          const message = JSON.parse(event.data);
          if (message.type !== 'state' || !predicate(message)) return;
          clearTimeout(timeout); ws.removeEventListener('message', onMessage); resolve(message);
        };
        ws.addEventListener('message', onMessage);
      });
    },
  };
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.type === 'state') tracker.latest = message;
  });
  return tracker;
}

/** Sends a buy action inside a prep window; retries when the 80ms phase
 * deadline slips past the message round-trip. */
async function buyInPrep(ws, tracker, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    const prep = await tracker.next(m => m.view?.phase === 'prep' && !m.view.complete, 60_000);
    const slot = prep.view.me.shop.findIndex((unit, index) => unit && unit.cost <= prep.view.me.gold && index >= 0);
    if (slot < 0) throw new Error('no affordable shop slot in prep view');
    const message = { type: 'action', id: `buy-${prep.view.round}-${i}`, seq: prep.nextSeq, action: { type: 'buy', slot } };
    ws.send(JSON.stringify(message));
    const outcome = await nextMessage(ws, m => (m.type === 'ack' || m.type === 'error') && m.id === message.id, 10_000);
    if (outcome.type === 'ack') return message;
    if (outcome.code !== 'invalid_action') throw new Error(`unexpected action error: ${outcome.code} ${outcome.message}`);
  }
  throw new Error('action never landed inside a prep window');
}

test('bots fill a room, replay is idempotent after reconnect, and bot-only survivors close the room', async () => {
  const health = await fetch(`${base}/api/health`, { headers: { Origin: origin } });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, ruleset:'deterministic-battle-v6', boardCells:64, deployStart:32 });

  const created = await post('/api/rooms', { name: '房主' });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('access-control-allow-origin'), origin);
  const { code, token } = created.body;
  assert.equal(created.body.seat, 0);
  assert.equal(created.body.lobby.players.length, 1);

  const second = await post(`/api/rooms/${code}/join`, { name: '二号玩家' });
  assert.equal(second.status, 200);
  assert.equal(second.body.seat, 1);

  const badOrigin = await post('/api/rooms', { name: 'bad' }, 'https://evil.example');
  assert.equal(badOrigin.status, 403);
  assert.equal(badOrigin.body.error.code, 'origin_forbidden');

  // Only the host (seat 0) may manage bots.
  const forged = await post(`/api/rooms/${code}/bots`, { token: 'f'.repeat(64) });
  assert.equal(forged.status, 401);
  const notHost = await post(`/api/rooms/${code}/bots`, { token: second.body.token });
  assert.equal(notHost.status, 403);
  assert.equal(notHost.body.error.code, 'not_host');

  // Host fills the remaining six seats with auto-ready bots.
  for (let i = 0; i < 6; i++) {
    const added = await post(`/api/rooms/${code}/bots`, { token });
    assert.equal(added.status, 201);
    assert.equal(added.body.seat, 2 + i);
    const players = added.body.lobby.players;
    assert.equal(players.length, 3 + i);
    assert.equal(players.filter(player => player.bot).length, i + 1);
  }
  const lobby = (await post(`/api/rooms/${code}/join`, { token })).body.lobby;
  assert.equal(lobby.players.length, 8);
  assert.deepEqual(lobby.players.map(player => player.bot),
    [false, false, true, true, true, true, true, true]);
  assert.deepEqual(lobby.players.slice(2).map(player => player.ready),
    [true, true, true, true, true, true], 'bots are auto-ready');
  assert.deepEqual(lobby.players.slice(2).map(player => player.connected),
    [true, true, true, true, true, true], 'bot seats count as connected');
  assert.deepEqual(lobby.players.slice(0, 2).map(player => player.ready), [false, false]);

  const full = await post(`/api/rooms/${code}/join`, { name: '第九人' });
  assert.equal(full.status, 409);
  assert.equal(full.body.error.code, 'room_full');

  const sockets = [];
  let reconnected;
  try {
    sockets.push(await connect(code, token));
    sockets.push(await connect(code, second.body.token));
    const tracker = trackStates(sockets[0]);
    const prepPromise = tracker.next(m => m.view?.phase === 'prep');
    sockets[0].send(JSON.stringify({ type: 'ready', ready: true }));
    sockets[1].send(JSON.stringify({ type: 'ready', ready: true }));
    const prep = await prepPromise;

    assert.equal(prep.lobby.status, 'playing');
    assert.equal(prep.code, code);
    assert.equal(prep.view.round, 1);
    assert.equal(prep.view.me.shop.length, 5);
    assert.equal(prep.view.players[1].shop, undefined, 'other shops stay private');
    assert.equal(prep.view.seat, 0);
    assert.deepEqual(prep.view.players.slice(2).map(player => player.bot), [true, true, true, true, true, true]);

    // Opponent boards are last-round snapshots: nothing to show before the first battle.
    assert.ok(prep.view.players.slice(2).every(player => player.board.filter(Boolean).length === 0),
      'lineups stay private before the first battle');
    assert.ok(prep.view.players.slice(2).every(player => player.ready), 'bots locked in for round 1');

    // Human action, replay-confirmed duplicate ack.
    const message = await buyInPrep(sockets[0], tracker);
    sockets[0].send(JSON.stringify(message));
    const duplicate = await nextMessage(sockets[0], m => m.type === 'ack' && m.id === message.id && m.duplicate === true);
    assert.equal(duplicate.seq, message.seq);

    // Reconnect with the original token, then replay the same action id+seq.
    sockets[0].close();
    const rejoined = await post(`/api/rooms/${code}/join`, { token });
    assert.equal(rejoined.status, 200);
    assert.equal(rejoined.body.seat, 0);
    reconnected = await connect(code, token);
    const reconnectedTracker = trackStates(reconnected);
    reconnected.send(JSON.stringify(message));
    const replayed = await nextMessage(reconnected, m => m.type === 'ack' && m.id === message.id && m.duplicate === true);
    assert.equal(replayed.seq, message.seq);

    // Neither human deploys: stop consuming resources once only bots survive.
    await nextMessage(reconnected,m=>m.type==='error' && m.code==='room_bots_only',30_000);
    const final=reconnectedTracker.latest.view;
    assert.ok(final.players.filter(p=>!p.bot).every(p=>!p.alive && Number.isInteger(p.place)));
    assert.ok(final.players.some(p=>p.bot && p.alive));
    assert.ok(final.players.filter(p=>p.bot && p.alive).every(p=>p.board.filter(Boolean).length>=1),
      'surviving bots show their last-round lineups');
    assert.equal((await post(`/api/rooms/${code}/join`,{token})).status,404);
  } finally {
    reconnected?.close();
    sockets.forEach(socket => socket.close());
  }
});

test('HTTP leave transfers host and frees seats; a bot-only lobby is deleted', async () => {
  const {code,token}=(await post('/api/rooms',{name:'退出房主'})).body;
  const guest=(await post(`/api/rooms/${code}/join`,{name:'接任玩家'})).body;
  const a=await connect(code,token),b=await connect(code,guest.token);
  try {
    await post(`/api/rooms/${code}/bots`,{token});
    assert.equal((await post(`/api/rooms/${code}/leave`,{token:'f'.repeat(64)})).status,401);
    const moved=nextMessage(b,m=>m.type==='state'&&m.seat===0&&m.lobby.hostSeat===0);
    assert.equal((await post(`/api/rooms/${code}/leave`,{token})).status,200);
    assert.equal((await moved).lobby.players.length,2);
    assert.equal((await post(`/api/rooms/${code}/bots`,{token:guest.token})).status,201);
    assert.equal((await post(`/api/rooms/${code}/join`,{token})).status,401);
    assert.equal((await post(`/api/rooms/${code}/leave`,{token:guest.token})).status,200);
    assert.equal((await post(`/api/rooms/${code}/join`,{name:'后来玩家'})).status,404);
  } finally {a.close();b.close();}
});

test('host can add and remove bots while the room is waiting', async () => {
  const created = await post('/api/rooms', { name: '管理房主' });
  const { code, token } = created.body;
  const guest = await post(`/api/rooms/${code}/join`, { name: '客人' });

  const custom = await post(`/api/rooms/${code}/bots`, { token, name: '定制机器人' });
  assert.equal(custom.status, 201);
  assert.equal(custom.body.seat, 2);
  assert.equal(custom.body.lobby.players[2].name, '定制机器人');
  assert.equal(custom.body.lobby.players[2].bot, true);

  const autoNamed = await post(`/api/rooms/${code}/bots`, { token });
  assert.equal(autoNamed.status, 201);
  assert.equal(autoNamed.body.lobby.players[3].name, '阿铁');

  const removeHuman = await post(`/api/rooms/${code}/bots/remove`, { token, seat: 1 });
  assert.equal(removeHuman.status, 400);
  assert.equal(removeHuman.body.error.code, 'not_a_bot');

  const removeGuest = await post(`/api/rooms/${code}/bots/remove`, { token: guest.body.token, seat: 2 });
  assert.equal(removeGuest.status, 403);

  const removed = await post(`/api/rooms/${code}/bots/remove`, { token, seat: 2 });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.lobby.players.length, 3);
  assert.deepEqual(removed.body.lobby.players.map(player => player.seat), [0, 1, 2]);
  assert.equal(removed.body.lobby.players[2].name, '阿铁', 'later bots compact onto the freed seat');
});

test('anonymous sockets cannot exhaust room admission', async () => {
  const created = await post('/api/rooms', { name: '认证测试房主' });
  const { code, token } = created.body;
  const anonymous = [];
  let authenticated;
  try {
    for (let i = 0; i < 8; i++) anonymous.push(await openAnonymous(code));
    const evicted = waitClosed(anonymous[0]);

    // Admission replaces the oldest unauthenticated connection, so a real player can still authenticate.
    authenticated = await connect(code, token);
    const closeEvent = await evicted;
    assert.equal(closeEvent.code, 4004);

    const anonymousPingError = nextMessage(anonymous[1], message => message.type === 'error');
    anonymous[1].send(JSON.stringify({ type: 'ping' }));
    assert.equal((await anonymousPingError).code, 'auth_required');
  } finally {
    authenticated?.close();
    anonymous.forEach(socket => socket.close());
  }
});

test('mutations without an allowlisted Origin are rejected, probes stay open', async () => {
  const noOrigin = await fetch(`${base}/api/rooms`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '无源请求' }),
  });
  assert.equal(noOrigin.status, 403);
  assert.equal((await noOrigin.json()).error.code, 'origin_forbidden');

  const spoofed = await post('/api/rooms', { name: '伪造来源' }, 'https://evil.example');
  assert.equal(spoofed.status, 403);

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);

  await new Promise(resolve => {
    const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/rooms/ABCDEFGH/ws`);   // no Origin header
    ws.addEventListener('error', () => resolve());
    ws.addEventListener('close', () => resolve());
    setTimeout(resolve, 3000);
  });
});
