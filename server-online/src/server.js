/* Node entry point for the eight-player room service: plain node:http plus
 * the 'ws' library. Designed for a single always-on CloudBase Run container
 * (MinNum=1/MaxNum=1) with all room state in process memory. HTTP/WS
 * contracts, CORS handling and error bodies mirror the former Cloudflare
 * Worker version so existing browser clients work unchanged. */
import http from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';
import { RoomError, assertName, normalizeCode, randomCode } from './protocol.js';

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

async function handleRequest(manager, request, response) {
  let origin = null;
  try {
    origin = allowedOrigin(request);
    const headers = corsHeaders(origin);
    const url = new URL(request.url || '/', 'http://localhost');
    if (request.method === 'OPTIONS') { response.writeHead(204, headers); response.end(); return; }
    if (url.pathname === '/api/health' && request.method === 'GET') {
      respondJson(response, { ok: true }, 200, headers);
      return;
    }
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const { name } = await readJson(request);
      const validName = assertName(name);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const result = manager.create(code, validName);
        if (result) { respondJson(response, result, 201, headers); return; }
      }
      throw new RoomError('room_code_collision', '暂时无法生成房间码，请重试', 503);
    }
    const join = /^\/api\/rooms\/([A-Za-z0-9]+)\/join$/.exec(url.pathname);
    if (join && request.method === 'POST') {
      const code = normalizeCode(join[1]);
      const body = await readJson(request);
      respondJson(response, requireRoom(manager, code).join(body), 200, headers);
      return;
    }
    const botAdd = /^\/api\/rooms\/([A-Za-z0-9]+)\/bots$/.exec(url.pathname);
    if (botAdd && request.method === 'POST') {
      const code = normalizeCode(botAdd[1]);
      const body = await readJson(request);
      respondJson(response, requireRoom(manager, code).addBot(body.token, body.name), 201, headers);
      return;
    }
    const botRemove = /^\/api\/rooms\/([A-Za-z0-9]+)\/bots\/remove$/.exec(url.pathname);
    if (botRemove && request.method === 'POST') {
      const code = normalizeCode(botRemove[1]);
      const body = await readJson(request);
      respondJson(response, requireRoom(manager, code).removeBot(body.token, body.seat), 200, headers);
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
    allowedOrigin(request);
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

export async function startServer({ port = Number(process.env.PORT) || 3000, host = '0.0.0.0' } = {}) {
  const manager = new RoomManager();
  const server = http.createServer((request, response) => {
    handleRequest(manager, request, response).catch(error => {
      console.error('unhandled request error:', error);
      if (!response.headersSent) errorRespond(response, error);
      else response.destroy();
    });
  });
  const wss = new WebSocketServer({ noServer: true });
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

  server.listen(port, host);
  await once(server, 'listening');

  return {
    manager,
    server,
    wss,
    port: server.address().port,
    close() {
      clearInterval(heartbeat);
      for (const entry of manager.rooms.values()) entry.destroy();
      manager.rooms.clear();
      wss.clients.forEach(client => client.terminate());
      return new Promise((resolve, reject) => {
        wss.close(() => { /* clients were terminated above */ });
        server.close(error => (error ? reject(error) : resolve()));
        server.closeAllConnections?.();
      });
    },
  };
}

const invokedAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsMain) {
  startServer()
    .then(({ port }) => console.log(`autochess-online listening on port ${port}`))
    .catch(error => { console.error(error); process.exit(1); });
}
