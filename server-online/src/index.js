import { DurableObject } from 'cloudflare:workers';
import { createGame, applyAction, advancePhase, viewFor } from '../../online/core.js';
import {
  AUTHENTICATION_TIMEOUT_MS, CAPACITY, MAX_UNAUTHENTICATED_CONNECTIONS, PHASE_MS, RoomError, assertName,
  authenticationDeadlinePassed, cleanupAt, lobbyFor, normalizeCode, parseClientMessage, randomCode, randomToken, roomAlarmAction,
  tokenHash, unauthenticatedConnectionCount, validateActionEnvelope,
} from './protocol.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const SUPPORTED_RULESET = 'deterministic-battle-v2';

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function errorResponse(error, headers = {}) {
  const status = error instanceof RoomError ? error.status : 500;
  const code = error instanceof RoomError ? error.code : 'internal_error';
  return json({ error: { code, message: status === 500 ? '服务器处理失败' : error.message } }, status, headers);
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
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

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    throw new RoomError('content_type', '请求需使用 application/json', 415);
  }
  if (Number(request.headers.get('Content-Length')) > 2048) throw new RoomError('body_too_large', '请求内容过长', 413);
  const raw = await request.text();
  if (raw.length > 2048) throw new RoomError('body_too_large', '请求内容过长', 413);
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new RoomError('bad_json', '请求内容不是有效 JSON');
  }
}

export default {
  async fetch(request, env) {
    let origin;
    try {
      origin = allowedOrigin(request, env);
      const headers = corsHeaders(origin);
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true }, 200, headers);
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const { name } = await readJson(request);
        const validName = assertName(name);
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = randomCode();
          const stub = env.ROOMS.getByName(code);
          const result = await stub.create(code, validName);
          if (result) return json(result, 201, headers);
        }
        throw new RoomError('room_code_collision', '暂时无法生成房间码，请重试', 503);
      }
      const join = /^\/api\/rooms\/([A-Za-z0-9]+)\/join$/.exec(url.pathname);
      if (join && request.method === 'POST') {
        const code = normalizeCode(join[1]);
        const body = await readJson(request);
        const stub = env.ROOMS.getByName(code);
        const result = await stub.join(body.name, body.token);
        if (result.error) return json({ error: result.error }, result.error.status, headers);
        return json(result, 200, headers);
      }
      const socket = /^\/api\/rooms\/([A-Za-z0-9]+)\/ws$/.exec(url.pathname);
      if (socket && request.method === 'GET') {
        const code = normalizeCode(socket[1]);
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
          throw new RoomError('upgrade_required', '需要 WebSocket 升级', 426);
        }
        return env.ROOMS.getByName(code).fetch(request);
      }
      throw new RoomError('not_found', '接口不存在', 404);
    } catch (error) {
      return errorResponse(error, corsHeaders(origin));
    }
  },
};

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');
    });
  }

  load() {
    const row = this.ctx.storage.sql.exec('SELECT data FROM room_state WHERE id = 1').toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }

  save(room) {
    this.ctx.storage.sql.exec(
      'INSERT INTO room_state (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      JSON.stringify(room),
    );
  }

  ensureCompatible(room) {
    if (room.game && (room.game.version !== 1 || room.game.ruleset !== SUPPORTED_RULESET)) {
      throw new RoomError('ruleset_mismatch', '此房间使用旧版规则，服务端无法继续结算', 409);
    }
  }

  connectedSeats() {
    return new Set(this.ctx.getWebSockets().map(ws => ws.deserializeAttachment()?.seat).filter(Number.isInteger));
  }

  async create(code, name) {
    if (this.load()) return null;
    const token = randomToken();
    const hash = await tokenHash(token);
    if (this.load()) return null;
    const room = {
      code, status: 'waiting', createdAt: Date.now(), deadline: null, game: null,
      players: [{ seat: 0, id: 'p0', name, tokenHash: hash, ready: false, lastSeq: 0, lastActionId: null }],
    };
    this.save(room);
    await this.ctx.storage.setAlarm(cleanupAt(room));
    return { code, seat: 0, token, lobby: lobbyFor(room) };
  }

  async join(name, token) {
    try { return await this.joinChecked(name, token); }
    catch (error) {
      if (error instanceof RoomError) return { error: { code: error.code, message: error.message, status: error.status } };
      throw error;
    }
  }

  async joinChecked(name, token) {
    const hash = token === undefined || token === null ? null : await tokenHash(token);
    const validName = hash ? null : assertName(name);
    const room = this.load();
    if (!room) throw new RoomError('room_not_found', '房间不存在', 404);
    this.ensureCompatible(room);
    if (hash) {
      const player = room.players.find(entry => entry.tokenHash === hash);
      if (!player) throw new RoomError('bad_token', '重连凭证无效', 401);
      return { code: room.code, seat: player.seat, token, lobby: lobbyFor(room, this.connectedSeats()) };
    }
    if (room.status !== 'waiting') throw new RoomError('game_started', '对局已开始', 409);
    if (room.players.length >= CAPACITY) throw new RoomError('room_full', '房间已满', 409);
    const newToken = randomToken();
    const newHash = await tokenHash(newToken);
    // Re-read after crypto.subtle's await so two concurrent joins cannot claim one seat.
    const latest = this.load();
    if (!latest || latest.status !== 'waiting') throw new RoomError('game_started', '对局已开始', 409);
    if (latest.players.length >= CAPACITY) throw new RoomError('room_full', '房间已满', 409);
    const seat = latest.players.length;
    latest.players.push({ seat, id: `p${seat}`, name: validName, tokenHash: newHash, ready: false, lastSeq: 0, lastActionId: null });
    this.save(latest);
    this.broadcast(latest);
    return { code: latest.code, seat, token: newToken, lobby: lobbyFor(latest, this.connectedSeats()) };
  }

  async fetch(request) {
    const room = this.load();
    if (!room) return errorResponse(new RoomError('room_not_found', '房间不存在', 404));
    try { this.ensureCompatible(room); } catch (error) { return errorResponse(error); }
    const now = Date.now();
    const sockets = this.ctx.getWebSockets();
    let activeSocketCount = 0;
    const attachments = sockets.map(ws => {
      const attachment = ws.deserializeAttachment() || {};
      if (Number.isInteger(attachment.seat)) { activeSocketCount++; return attachment; }
      // Sockets accepted before authentication deadlines were introduced cannot be trusted to have a timer.
      const authExpiresAt = Number.isFinite(attachment.authExpiresAt) ? attachment.authExpiresAt : now;
      if (authExpiresAt !== attachment.authExpiresAt) ws.serializeAttachment({ ...attachment, authExpiresAt });
      if (authExpiresAt <= now) ws.close(4003, 'authentication timeout');
      else activeSocketCount++;
      return { ...attachment, authExpiresAt };
    });
    const pending = sockets
      .map((ws, index) => ({ ws, attachment: attachments[index] }))
      .filter(({ attachment }) => !Number.isInteger(attachment.seat) && attachment.authExpiresAt > now)
      .sort((a, b) => a.attachment.authExpiresAt - b.attachment.authExpiresAt);
    if (unauthenticatedConnectionCount(attachments, now) >= MAX_UNAUTHENTICATED_CONNECTIONS) {
      pending[0].ws.close(4004, 'too many pending authentications');
      activeSocketCount--;
    }
    if (activeSocketCount >= 16) {
      return errorResponse(new RoomError('too_many_connections', '房间连接数过多', 429));
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: null, authExpiresAt: now + AUTHENTICATION_TIMEOUT_MS });
    await this.scheduleNextAlarm(room);
    return new Response(null, { status: 101, webSocket: client });
  }

  async scheduleNextAlarm(room) {
    const deadlines = [cleanupAt(room)];
    if (room.status === 'playing' && room.deadline) deadlines.push(room.deadline);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (!Number.isInteger(attachment?.seat) && Number.isFinite(attachment?.authExpiresAt)
        && attachment.authExpiresAt > Date.now()) {
        deadlines.push(attachment.authExpiresAt);
      }
    }
    const next = deadlines.filter(Number.isFinite).sort((a, b) => a - b)[0];
    if (next !== undefined) await this.ctx.storage.setAlarm(next);
  }

  expireUnauthenticatedConnections(now) {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (!Number.isInteger(attachment?.seat)
        && authenticationDeadlinePassed(attachment, now)) {
        this.send(ws, { type: 'error', code: 'auth_timeout', message: 'WebSocket 认证超时' });
        ws.close(4003, 'authentication timeout');
      }
    }
  }

  send(ws, value) {
    try { ws.send(JSON.stringify(value)); } catch { /* peer disconnected */ }
  }

  snapshot(room, seat) {
    const player = room.players[seat];
    return {
      type: 'state', code: room.code, seat, serverTime: Date.now(), deadline: room.deadline,
      nextSeq: player.lastSeq + 1,
      lobby: lobbyFor(room, this.connectedSeats()),
      view: room.game ? viewFor(room.game, seat) : null,
    };
  }

  broadcast(room) {
    for (const ws of this.ctx.getWebSockets()) {
      const seat = ws.deserializeAttachment()?.seat;
      if (Number.isInteger(seat) && room.players[seat]) this.send(ws, this.snapshot(room, seat));
    }
  }

  async webSocketMessage(ws, raw) {
    let message;
    try {
      message = parseClientMessage(raw);
      const attachedSeat = ws.deserializeAttachment()?.seat;
      if (!Number.isInteger(attachedSeat)) {
        if (message.type !== 'auth') throw new RoomError('auth_required', '请先认证 WebSocket', 401);
        if (authenticationDeadlinePassed(ws.deserializeAttachment())) {
          throw new RoomError('auth_timeout', 'WebSocket 认证超时', 401);
        }
        const hash = await tokenHash(message.token);
        const room = this.load();
        if (room) this.ensureCompatible(room);
        const player = room?.players.find(entry => entry.tokenHash === hash);
        if (!player) throw new RoomError('bad_token', '重连凭证无效', 401);
        for (const other of this.ctx.getWebSockets()) {
          if (other !== ws && other.deserializeAttachment()?.seat === player.seat) other.close(4001, '另一连接已接管此座位');
        }
        ws.serializeAttachment({ seat: player.seat });
        this.broadcast(room);
        await this.scheduleNextAlarm(room);
        return;
      }
      if (message.type === 'ping') { this.send(ws, { type: 'pong', serverTime: Date.now() }); return; }
      if (message.type === 'auth') throw new RoomError('already_authenticated', '连接已经认证');
      const room = this.load();
      if (!room || !room.players[attachedSeat]) throw new RoomError('room_not_found', '房间不存在', 404);
      this.ensureCompatible(room);
      if (message.type === 'ready') {
        if (room.status !== 'waiting') throw new RoomError('game_started', '对局已开始', 409);
        room.players[attachedSeat].ready = message.ready !== false;
        if (room.players.length === CAPACITY && room.players.every(player => player.ready)) {
          const seed = crypto.getRandomValues(new Uint32Array(1))[0];
          room.game = createGame({ seed, players: room.players.map(({ id, name }) => ({ id, name })) });
          room.status = 'playing';
          room.deadline = Date.now() + PHASE_MS.prep;
        }
        this.save(room);
        if (room.deadline) await this.ctx.storage.setAlarm(room.deadline);
        this.send(ws, { type: 'ack', id: message.id ?? null });
        this.broadcast(room);
        return;
      }
      if (message.type === 'action') {
        if (room.status !== 'playing') throw new RoomError('not_playing', '对局尚未开始或已经结束', 409);
        const player = room.players[attachedSeat];
        const disposition = validateActionEnvelope(message, player);
        if (disposition === 'duplicate') {
          this.send(ws, { type: 'ack', id: message.id, seq: message.seq, duplicate: true });
          return;
        }
        const candidate = structuredClone(room.game);
        try { applyAction(candidate, attachedSeat, message.action); }
        catch (error) { throw new RoomError('invalid_action', error.message || '操作不符合当前规则'); }
        room.game = candidate;
        player.lastSeq = message.seq;
        player.lastActionId = message.id;
        this.save(room);
        this.send(ws, { type: 'ack', id: message.id, seq: message.seq });
        this.broadcast(room);
      }
    } catch (error) {
      this.send(ws, { type: 'error', id: message?.id, code: error instanceof RoomError ? error.code : 'internal_error', message: error instanceof RoomError ? error.message : '服务器处理失败' });
      if (!Number.isInteger(ws.deserializeAttachment()?.seat)) ws.close(4003, 'authentication failed');
    }
  }

  async alarm() {
    const room = this.load();
    if (!room) return;
    const now = Date.now();
    if (roomAlarmAction(room, now, SUPPORTED_RULESET) === 'expire') {
      this.ctx.storage.sql.exec('DELETE FROM room_state WHERE id = 1');
      for (const ws of this.ctx.getWebSockets()) {
        this.send(ws, { type: 'error', code: 'room_expired', message: '房间已过期' });
        ws.close(4000, 'room expired');
      }
      return;
    }
    try { this.ensureCompatible(room); }
    catch (error) {
      for (const ws of this.ctx.getWebSockets()) {
        this.send(ws, { type: 'error', code: error.code, message: error.message });
        ws.close(4002, 'ruleset mismatch');
      }
      await this.scheduleNextAlarm(room);
      return;
    }
    this.expireUnauthenticatedConnections(now);
    const expiry = cleanupAt(room);
    if (expiry !== null) {
      if (expiry > now) { await this.scheduleNextAlarm(room); return; }
      return;
    }
    if (room.status !== 'playing' || !room.deadline) { await this.scheduleNextAlarm(room); return; }
    let steps = 0;
    while (room.status === 'playing' && room.deadline <= Date.now() && steps++ < 100) {
      const next = structuredClone(room.game);
      advancePhase(next);
      room.game = next;
      if (next.complete || next.phase === 'over') {
        room.status = 'finished';
        room.finishedAt = Date.now();
        room.deadline = null;
      } else {
        room.deadline += PHASE_MS[next.phase];
      }
    }
    this.save(room);
    await this.scheduleNextAlarm(room);
    this.broadcast(room);
  }

  webSocketClose(ws) {
    const room = this.load();
    if (room) this.broadcast(room);
  }

  webSocketError(ws) {
    const room = this.load();
    if (room) this.broadcast(room);
  }
}
