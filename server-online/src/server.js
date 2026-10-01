/* Node entry point for the eight-player room service: plain node:http plus
 * the 'ws' library. Designed for a single always-on CloudBase Run container
 * (MinNum=1/MaxNum=1) with an explicitly configured durable room store. HTTP/WS
 * contracts, CORS handling and error bodies mirror the former Cloudflare
 * Worker version so existing browser clients work unchanged. */
import http from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager, SUPPORTED_RULESET } from './rooms.js';
import { RoomError, assertName, normalizeCode, randomCode } from './protocol.js';
import { MemoryRoomStore, FileRoomStore } from './room-store.js';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8787', 'http://127.0.0.1:8787',
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:8000', 'http://127.0.0.1:8000',
  'http://localhost:8081', 'http://127.0.0.1:8081',
  'http://localhost:5500', 'http://127.0.0.1:5500',
  'https://autochess.hanari520.cn',
].join(',');
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_BODY_BYTES = 2048;
const MAX_WS_PAYLOAD_BYTES = 4096;

function serviceStats(manager) {
  const activeGames = [...manager.rooms.values()].filter(entry => entry.room.status === 'playing').length;
  return { rooms: manager.rooms.size, activeGames, drainComplete: manager.draining && activeGames === 0, draining: manager.draining, storage: manager.store.health?.() ?? {kind:'memory', durable:false, healthy:true}, ...manager.metrics };
}

async function configuredStore() {
  if (process.env.ROOM_STORE === 'cloudbase-pg') {
    const { createPgRoomStore } = await import('./pg-room-store.js');
    return createPgRoomStore();
  }
  if (process.env.ROOM_STORE === 'file') return new FileRoomStore(process.env.ROOM_STORE_DIR);
  if (process.env.ROOM_STORE === 'cloudbase') {
    const { createCloudBaseRoomStore } = await import('./cloudbase-store.js');
    return createCloudBaseRoomStore();
  }
  if (process.env.ROOM_STORE && process.env.ROOM_STORE !== 'memory') throw new Error('Unknown ROOM_STORE');
  if (process.env.NODE_ENV === 'production') throw new Error('ROOM_STORE must be explicitly configured in production');
  return new MemoryRoomStore();
}

function allowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return null;
  const allowed = String(process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
    .split(',').map(item => item.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw new RoomError('origin_forbidden', '此页面来源未获准访问联机服务', 403);
  return origin;
}

function corsHeaders(origin) {
  return origin ? {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  } : {};
}

function respondJson(response, body, status = 200, headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { ...JSON_HEADERS, ...headers, 'content-length': Buffer.byteLength(payload) });
  response.end(payload);
}

function errorRespond(response, error, headers = {}) {
  const status = error instanceof RoomError ? error.status : 500;
  const code = error instanceof RoomError ? error.code : 'internal_error';
  respondJson(response, { error: { code, message: status === 500 ? '服务器处理失败' : error.message } }, status, headers);
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    throw new RoomError('content_type', '请求需使用 application/json', 415);
  }
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) {
    throw new RoomError('body_too_large', '请求内容过长', 413);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RoomError('body_too_large', '请求内容过长', 413);
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new RoomError('bad_json', '请求内容不是有效 JSON');
  }
}

function requireRoom(manager, code) {
  const entry = manager.get(code);
  if (!entry) throw new RoomError('room_not_found', '房间不存在', 404);
  return entry;
}

function requireInvitation(body) {
  const expected = process.env.ONLINE_INVITE_CODE;
  if (!expected) throw new RoomError('invitation_unavailable', '邀请码验证暂不可用，请稍后重试。', 503);
  if (typeof body.inviteCode !== 'string' || body.inviteCode.trim() !== expected) {
    throw new RoomError('invite_required', '邀请码不正确，请向邀请人确认后重新输入。', 403);
  }
}

async function handleRequest(manager, request, response) {
  let origin = null;
  try {
    origin = allowedOrigin(request);
    const headers = corsHeaders(origin);
    const url = new URL(request.url || '/', 'http://localhost');
    if (manager.stopping && !['/api/health','/api/ready','/api/admin/metrics','/api/admin/handoff'].includes(url.pathname)) throw new RoomError('maintenance', '服务正在重启，请稍后重连', 503);
    if (request.method === 'OPTIONS') { response.writeHead(204, headers); response.end(); return; }
    if (request.method !== 'GET' && !origin && !url.pathname.startsWith('/api/admin/')) {
      // Room-mutating requests must carry an allowlisted Origin (browsers
      // always send one). Admin endpoints rely on the bearer token instead,
      // so maintenance scripts can call them without a browser Origin.
      throw new RoomError('origin_forbidden', '此页面来源未获准访问联机服务', 403);
    }
    if (url.pathname === '/api/health' && request.method === 'GET') {
      respondJson(response, { ok: true, ruleset: SUPPORTED_RULESET, boardCells:64, deployStart:32 }, 200, headers);
      return;
    }
    if (url.pathname === '/api/ready' && request.method === 'GET') {
      const ready = !manager.stopping && manager.store.health?.().healthy !== false && ![...manager.rooms.values()].some(entry => entry.suspended);
      respondJson(response, {ok:ready}, ready ? 200 : 503, headers);
      return;
    }
    if (url.pathname === '/api/admin/metrics' && request.method === 'GET') {
      requireAdmin(request);
      respondJson(response, serviceStats(manager), 200, headers);
      return;
    }
    if (url.pathname === '/api/admin/drain' && request.method === 'POST') {
      requireAdmin(request);
      const body = await readJson(request);
      manager.draining = body.draining !== false;
      await Promise.all([...manager.rooms.values()].map(entry => entry.enqueue(() => entry.broadcast(), {persist:false})));
      respondJson(response, {ok:true, ...serviceStats(manager)}, 200, headers);
      return;
    }
    if (url.pathname === '/api/admin/handoff' && request.method === 'POST') {
      requireAdmin(request);
      const stats = serviceStats(manager);
      if (!stats.drainComplete) throw new RoomError('games_active', '请先开启维护并等待当前对局结束', 409);
      await manager.handoff();
      respondJson(response, {ok:true, standby:true}, 200, headers);
      return;
    }
    if (url.pathname === '/api/invitation' && request.method === 'POST') {
      if (!manager.allowHttp(request.socket.remoteAddress || 'unknown')) throw new RoomError('rate_limited', '验证过于频繁，请稍后重试', 429);
      requireInvitation(await readJson(request));
      respondJson(response, {ok:true}, 200, headers);
      return;
    }
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      if (!manager.allowHttp(request.socket.remoteAddress || 'unknown')) throw new RoomError('rate_limited', '建房过于频繁，请稍后重试', 429);
      if (manager.draining) throw new RoomError('maintenance', '服务正在维护，请稍后建房', 503);
      const body = await readJson(request);
      requireInvitation(body);
      const { name } = body;
      const validName = assertName(name);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const job = manager.creationQueue.then(() => {
          if (manager.draining) throw new RoomError('maintenance', '服务正在维护，请稍后建房', 503);
          if (manager.rooms.size >= manager.maxRooms) throw new RoomError('capacity', '当前房间已满，请稍后再试', 503);
          return manager.create(code, validName);
        });
        manager.creationQueue = job.catch(() => {});
        const result = await job;
        if (result) { respondJson(response, result, 201, headers); return; }
      }
      throw new RoomError('room_code_collision', '暂时无法生成房间码，请重试', 503);
    }
    const join = /^\/api\/rooms\/([A-Za-z0-9]+)\/join$/.exec(url.pathname);
    if (join && request.method === 'POST') {
      const code = normalizeCode(join[1]);
      const body = await readJson(request);
      if (!manager.allowHttp(request.socket.remoteAddress || 'unknown')) throw new RoomError('rate_limited', '请求过于频繁，请稍后重试', 429);
      requireInvitation(body);
      const entry = requireRoom(manager, code);
      respondJson(response, await entry.enqueue(() => entry.join(body)), 200, headers);
      return;
    }
    const leave = /^\/api\/rooms\/([A-Za-z0-9]+)\/leave$/.exec(url.pathname);
    if (leave && request.method === 'POST') {
      const body=await readJson(request);
      const entry = requireRoom(manager,normalizeCode(leave[1]));
      respondJson(response,await entry.enqueue(() => entry.leave(body.token)),200,headers);
      return;
    }
    const botAdd = /^\/api\/rooms\/([A-Za-z0-9]+)\/bots$/.exec(url.pathname);
    if (botAdd && request.method === 'POST') {
      const code = normalizeCode(botAdd[1]);
      const body = await readJson(request);
      const entry = requireRoom(manager, code);
      respondJson(response, await entry.enqueue(() => entry.addBot(body.token, body.name)), 201, headers);
      return;
    }
    const botRemove = /^\/api\/rooms\/([A-Za-z0-9]+)\/bots\/remove$/.exec(url.pathname);
    if (botRemove && request.method === 'POST') {
      const code = normalizeCode(botRemove[1]);
      const body = await readJson(request);
      const entry = requireRoom(manager, code);
      respondJson(response, await entry.enqueue(() => entry.removeBot(body.token, body.seat)), 200, headers);
      return;
    }
    const socket = /^\/api\/rooms\/([A-Za-z0-9]+)\/ws$/.exec(url.pathname);
    if (socket && request.method === 'GET') {
      // Valid handshakes are routed to the server 'upgrade' handler instead.
      throw new RoomError('upgrade_required', '需要 WebSocket 升级', 426);
    }
    throw new RoomError('not_found', '接口不存在', 404);
  } catch (error) {
    errorRespond(response, error, corsHeaders(origin));
  }
}

function requireAdmin(request) {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured || request.headers.authorization !== `Bearer ${configured}`) {
    throw new RoomError('forbidden', '无权访问维护接口', 403);
  }
}

function handleUpgrade(manager, wss, request, socket, head) {
  const fail = error => {
    const status = error instanceof RoomError ? error.status : 500;
    const code = error instanceof RoomError ? error.code : 'internal_error';
    const body = JSON.stringify({ error: { code, message: status === 500 ? '服务器处理失败' : error.message } });
    socket.write(
      `HTTP/1.1 ${status} ${http.STATUS_CODES[status] || 'Error'}\r\n` +
      'Content-Type: application/json; charset=utf-8\r\n' +
      'Cache-Control: no-store\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n\r\n' + body,
    );
    socket.destroy();
  };
  try {
    if (manager.stopping) throw new RoomError('maintenance', '服务正在重启', 503);
    // Browser WebSocket clients always send Origin; a socket without one is a
    // non-browser client and gets the same origin gate as mutating HTTP.
    const origin = allowedOrigin(request);
    if (!origin) throw new RoomError('origin_forbidden', '此页面来源未获准访问联机服务', 403);
    const url = new URL(request.url || '/', 'http://localhost');
    const match = /^\/api\/rooms\/([A-Za-z0-9]+)\/ws$/.exec(url.pathname);
    if (!match || request.method !== 'GET') throw new RoomError('not_found', '接口不存在', 404);
    const code = normalizeCode(match[1]);
    const entry = requireRoom(manager, code);
    entry.ensureCompatible();
    entry.admitConnection();
    wss.handleUpgrade(request, socket, head, ws => entry.attach(ws));
  } catch (error) {
    fail(error);
  }
}

export async function startServer({ port = Number(process.env.PORT) || 3000, host = '0.0.0.0', store, maxRooms = Number(process.env.MAX_ROOMS) || 200 } = {}) {
  if (process.env.NODE_ENV === 'production' && !process.env.ONLINE_INVITE_CODE) throw new Error('ONLINE_INVITE_CODE must be configured in production');
  const manager = new RoomManager(store || await configuredStore());
  manager.maxRooms = maxRooms;
  try { await manager.restore(); } catch (error) { await manager.store.close(); throw error; }
  const server = http.createServer((request, response) => {
    handleRequest(manager, request, response).catch(error => {
      console.error('unhandled request error:', error);
      if (!response.headersSent) errorRespond(response, error);
      else response.destroy();
    });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD_BYTES });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.on('upgrade', (request, socket, head) => handleUpgrade(manager, wss, request, socket, head));

  // 30s ping/pong sweep removes dead peers from connectedSeats().
  const heartbeat = setInterval(() => {
    for (const entry of manager.rooms.values()) {
      for (const conn of [...entry.connections]) {
        if (conn.ws.readyState !== 1) continue;
        if (!conn.alive) { conn.ws.terminate(); continue; }
        conn.alive = false;
        try { conn.ws.ping(); } catch { /* socket is closing */ }
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  const loopDelay = monitorEventLoopDelay({resolution:20});
  loopDelay.enable();
  const monitoring = setInterval(() => {
    manager.metrics.eventLoopDelayP99Ms = Math.round(loopDelay.percentile(99) / 1e6);
    manager.metrics.memoryRssBytes = process.memoryUsage().rss;
    console.log(JSON.stringify({event:'online_service_metrics', ...serviceStats(manager)}));
    loopDelay.reset();
  }, 60_000);
  monitoring.unref?.();

  manager.handoff = async () => {
    if (manager.stopping) return;
    // Stand by without exiting: a rolling deployment needs the old process to
    // release ownership before the new version can pass startup restoration.
    manager.stopping = true;
    for (const entry of manager.rooms.values()) { if (entry.timer) clearTimeout(entry.timer); entry.timer = null; }
    await manager.creationQueue;
    await Promise.all([...manager.rooms.values()].map(entry => entry.queue));
    for (const entry of manager.rooms.values()) entry.destroy(undefined,1012,'deployment handoff');
    await manager.store.close();
  };

  server.listen(port, host);
  try { await once(server, 'listening'); } catch (error) {
    clearInterval(heartbeat); clearInterval(monitoring); loopDelay.disable();
    for (const entry of manager.rooms.values()) entry.destroy();
    await manager.store.close();
    throw error;
  }

  return {
    manager,
    server,
    wss,
    port: server.address().port,
    async close() {
      manager.stopping = true;
      manager.draining = true;
      clearInterval(heartbeat);
      clearInterval(monitoring); loopDelay.disable();
      for (const entry of manager.rooms.values()) { if (entry.timer) clearTimeout(entry.timer); entry.timer = null; }
      await manager.creationQueue;
      await Promise.all([...manager.rooms.values()].map(entry => entry.queue));
      for (const entry of manager.rooms.values()) entry.destroy(undefined, 1012, 'service restart');
      wss.clients.forEach(client => client.terminate());
      await new Promise((resolve, reject) => {
        wss.close(() => { /* clients were terminated above */ });
        server.close(error => (error ? reject(error) : resolve()));
        server.closeAllConnections?.();
      });
      await manager.store.close();
    },
  };
}

const invokedAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsMain) {
  startServer()
    .then(instance => {
      console.log(`autochess-online listening on port ${instance.port}`);
      let shuttingDown = false;
      const shutdown = exitCode => {
        if (shuttingDown) return;
        shuttingDown = true;
        clearInterval(storageWatch);
        // SDK/network failures must not leave a stale authoritative process
        // alive forever. The platform restarts it; the storage lease fences it.
        const deadline = setTimeout(() => process.exit(1), 30_000);
        deadline.unref?.();
        instance.close().then(() => process.exit(exitCode), () => process.exit(1));
      };
      const storageWatch = setInterval(() => {
        if (!instance.manager.stopping && (instance.manager.store.health?.().healthy === false || [...instance.manager.rooms.values()].some(entry => entry.suspended))) {
          console.error(JSON.stringify({event:'room_storage_unavailable', action:'restart'}));
          shutdown(1);
        }
      }, 5000);
      storageWatch.unref?.();
      for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => {
        shutdown(0);
      });
    })
    .catch(error => {
      const name = String(error?.name || 'Error').replace(/[^A-Za-z0-9_.-]/g,'').slice(0,64) || 'Error';
      const code = /^[A-Za-z0-9_.-]{1,64}$/.test(String(error?.code || '')) ? error.code : null;
      console.error(JSON.stringify({event:'online_service_start_failed',errorName:name,errorCode:code}));
      process.exit(1);
    });
}
