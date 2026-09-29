/* In-memory room manager. This is the Node port of the former Cloudflare
 * Durable Object: one RoomEntry per invite code keeps the authoritative room
 * state, the live WebSocket connections and a setTimeout phase clock that
 * mirrors the DO alarm semantics. The JS event loop serializes every message
 * handler and timer callback, so each room keeps single-writer semantics
 * without needing an alarm API. Room state is intentionally volatile: a
 * restart drops all rooms, which is acceptable for the demo deployment. */
import { createHash, randomBytes } from 'node:crypto';
import { createGame, applyAction, advancePhase, viewFor } from './core.js';
import {
  AUTHENTICATION_TIMEOUT_MS, CAPACITY, MAX_UNAUTHENTICATED_CONNECTIONS, PHASE_MS, RoomError,
  assertName, authenticationDeadlinePassed, cleanupAt, lobbyFor, parseClientMessage, randomToken,
  roomAlarmAction, validateActionEnvelope,
} from './protocol.js';
import { botPolicy, pickBotName } from './bots.js';

const SUPPORTED_RULESET = 'deterministic-battle-v3';
const MAX_ROOM_CONNECTIONS = 16;

/** Phase length in milliseconds. ONLINE_FAST (a positive number of millis)
 * accelerates all three phases equally for tests and local joint debugging. */
export function phaseMs(phase) {
  const fast = Number(process.env.ONLINE_FAST);
  return Number.isFinite(fast) && fast > 0 ? fast : PHASE_MS[phase];
}

/** Synchronous SHA-256 token digest. Message handlers must never await a
 * digest: yielding the event loop mid-validation would open state races. */
export function tokenHashSync(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
    throw new RoomError('bad_token', '重连凭证无效', 401);
  }
  return createHash('sha256').update(token).digest('hex');
}

function randomSeed() {
  return randomBytes(4).readUInt32BE(0);
}

class Connection {
  constructor(ws) {
    this.ws = ws;
    this.seat = null;
    this.authExpiresAt = 0;
    this.alive = true;
  }
}

class RoomEntry {
  constructor(manager, room) {
    this.manager = manager;
    this.room = room;
    this.connections = new Set();
    this.timer = null;
    this.closed = false;
  }

  ensureCompatible() {
    const { game } = this.room;
    if (game && (game.version !== 1 || game.ruleset !== SUPPORTED_RULESET)) {
      throw new RoomError('ruleset_mismatch', '此房间使用旧版规则，服务端无法继续结算', 409);
    }
  }

  connectedSeats() {
    // Bot seats always count as connected: they have no socket of their own.
    const seats = new Set();
    for (const conn of this.connections) {
      if (Number.isInteger(conn.seat)) seats.add(conn.seat);
    }
    for (const player of this.room.players) {
      if (player.bot) seats.add(player.seat);
    }
    return seats;
  }

  send(conn, value) {
    try { conn.ws.send(JSON.stringify(value)); } catch { /* peer disconnected */ }
  }

  snapshot(seat) {
    const room = this.room;
    const player = room.players[seat];
    return {
      type: 'state', code: room.code, seat, serverTime: Date.now(), deadline: room.deadline,
      nextSeq: player.lastSeq + 1,
      lobby: lobbyFor(room, this.connectedSeats()),
      view: room.game ? viewFor(room.game, seat) : null,
    };
  }

  broadcast() {
    for (const conn of this.connections) {
      if (Number.isInteger(conn.seat) && this.room.players[conn.seat]) {
        this.send(conn, this.snapshot(conn.seat));
      }
    }
  }

  join(body) {
    const room = this.room;
    this.ensureCompatible();
    const withToken = body.token !== undefined && body.token !== null;
    if (withToken) {
      const hash = tokenHashSync(body.token);
      const player = room.players.find(entry => entry.tokenHash === hash);
      if (!player) throw new RoomError('bad_token', '重连凭证无效', 401);
      return { code: room.code, seat: player.seat, token: body.token, lobby: lobbyFor(room, this.connectedSeats()) };
    }
    const validName = assertName(body.name);
    if (room.status !== 'waiting') throw new RoomError('game_started', '对局已开始', 409);
    if (room.players.length >= CAPACITY) throw new RoomError('room_full', '房间已满', 409);
    const token = randomToken();
    const seat = room.players.length;
    room.players.push({
      seat, id: `p${seat}`, name: validName, tokenHash: tokenHashSync(token),
      ready: false, lastSeq: 0, lastActionId: null,
    });
    this.broadcast();
    return { code: room.code, seat, token, lobby: lobbyFor(room, this.connectedSeats()) };
  }

  requireHost(token) {
    const hash = tokenHashSync(token);
    const player = this.room.players.find(entry => entry.tokenHash === hash);
    if (!player) throw new RoomError('bad_token', '重连凭证无效', 401);
    if (player.seat !== 0) throw new RoomError('not_host', '只有房主可以管理机器人', 403);
    return player;
  }

  addBot(token, name) {
    this.requireHost(token);
    const room = this.room;
    if (room.status !== 'waiting') throw new RoomError('game_started', '对局已开始', 409);
    if (room.players.length >= CAPACITY) throw new RoomError('room_full', '房间已满', 409);
    const botName = name === undefined || name === null
      ? pickBotName(room.players.map(player => player.name))
      : assertName(name);
    const seat = room.players.length;
    room.players.push({
      seat, id: `b${seat}`, name: botName, tokenHash: null,
      ready: true, lastSeq: 0, lastActionId: null, bot: true,
    });
    this.broadcast();
    return { code: room.code, seat, lobby: lobbyFor(room, this.connectedSeats()) };
  }

  removeBot(token, seat) {
    this.requireHost(token);
    const room = this.room;
    if (room.status !== 'waiting') throw new RoomError('game_started', '对局已开始', 409);
    if (!Number.isInteger(seat) || seat < 0 || seat >= room.players.length) {
      throw new RoomError('bad_seat', '座位不存在', 404);
    }
    const player = room.players[seat];
    if (!player || !player.bot) throw new RoomError('not_a_bot', '目标座位不是机器人', 400);
    room.players.splice(seat, 1);
    room.players.forEach((entry, index) => {
      entry.seat = index;
      entry.id = entry.bot ? `b${index}` : `p${index}`;
    });
    for (const conn of this.connections) {
      if (Number.isInteger(conn.seat) && conn.seat > seat) conn.seat -= 1;
    }
    this.broadcast();
    return { lobby: lobbyFor(room, this.connectedSeats()) };
  }

  /** Applies the DO admission rules: expire overdue anonymous sockets, evict
   * the oldest pending authentication beyond the budget, cap active sockets. */
  admitConnection() {
    const now = Date.now();
    let active = 0;
    const pending = [];
    for (const conn of this.connections) {
      if (Number.isInteger(conn.seat)) { active++; continue; }
      if (conn.authExpiresAt <= now) { conn.ws.close(4003, 'authentication timeout'); continue; }
      active++;
      pending.push(conn);
    }
    pending.sort((a, b) => a.authExpiresAt - b.authExpiresAt);
    if (pending.length >= MAX_UNAUTHENTICATED_CONNECTIONS) {
      pending[0].ws.close(4004, 'too many pending authentications');
      active--;
    }
    if (active >= MAX_ROOM_CONNECTIONS) {
      throw new RoomError('too_many_connections', '房间连接数过多', 429);
    }
  }

  attach(ws) {
    const conn = new Connection(ws);
    conn.authExpiresAt = Date.now() + AUTHENTICATION_TIMEOUT_MS;
    this.connections.add(conn);
    ws.on('message', data => this.handleMessage(conn, data.toString()));
    ws.on('pong', () => { conn.alive = true; });
    ws.on('close', () => {
      this.connections.delete(conn);
      if (this.closed) return;
      this.broadcast();
      this.schedule();
    });
    ws.on('error', () => { /* the close event follows and cleans up */ });
    this.schedule();
  }

  handleMessage(conn, raw) {
    let message;
    try {
      message = parseClientMessage(raw);
      if (!Number.isInteger(conn.seat)) {
        if (message.type !== 'auth') throw new RoomError('auth_required', '请先认证 WebSocket', 401);
        if (authenticationDeadlinePassed(conn)) {
          throw new RoomError('auth_timeout', 'WebSocket 认证超时', 401);
        }
        const hash = tokenHashSync(message.token);
        const player = this.room.players.find(entry => entry.tokenHash === hash);
        if (!player) throw new RoomError('bad_token', '重连凭证无效', 401);
        for (const other of this.connections) {
          if (other !== conn && other.seat === player.seat) other.ws.close(4001, '另一连接已接管此座位');
        }
        conn.seat = player.seat;
        this.broadcast();
        this.schedule();
        return;
      }
      if (message.type === 'ping') { this.send(conn, { type: 'pong', serverTime: Date.now() }); return; }
      if (message.type === 'auth') throw new RoomError('already_authenticated', '连接已经认证');
      const room = this.room;
      if (!room.players[conn.seat]) throw new RoomError('room_not_found', '房间不存在', 404);
      this.ensureCompatible();
      if (message.type === 'ready') {
        if (room.status !== 'waiting') throw new RoomError('game_started', '对局已开始', 409);
        room.players[conn.seat].ready = message.ready !== false;
        if (room.players.length === CAPACITY && room.players.every(player => player.ready)) {
          room.game = createGame({
            seed: randomSeed(),
            players: room.players.map(({ id, name, bot }) => ({ id, name, bot })),
          });
          room.status = 'playing';
          room.deadline = Date.now() + phaseMs('prep');
          this.runBots();
        }
        this.schedule();
        this.send(conn, { type: 'ack', id: message.id ?? null });
        this.broadcast();
        return;
      }
      if (message.type === 'action') {
        if (room.status !== 'playing') throw new RoomError('not_playing', '对局尚未开始或已经结束', 409);
        const player = room.players[conn.seat];
        const disposition = validateActionEnvelope(message, player);
        if (disposition === 'duplicate') {
          this.send(conn, { type: 'ack', id: message.id, seq: message.seq, duplicate: true });
          return;
        }
        const candidate = structuredClone(room.game);
        try { applyAction(candidate, conn.seat, message.action); }
        catch (error) { throw new RoomError('invalid_action', error.message || '操作不符合当前规则'); }
        room.game = candidate;
        player.lastSeq = message.seq;
        player.lastActionId = message.id;
        this.send(conn, { type: 'ack', id: message.id, seq: message.seq });
        this.broadcast();
      }
    } catch (error) {
      this.send(conn, {
        type: 'error', id: message?.id,
        code: error instanceof RoomError ? error.code : 'internal_error',
        message: error instanceof RoomError ? error.message : '服务器处理失败',
      });
      if (!Number.isInteger(conn.seat)) conn.ws.close(4003, 'authentication failed');
    }
  }

  /** Bot seats take their preparation moves on the internal path: no token,
   * no seq, no ack. Runs at game start and on every result->prep transition. */
  runBots() {
    const game = this.room.game;
    if (!game || game.complete || game.phase !== 'prep') return;
    this.room.players.forEach((player, seat) => {
      if (!player.bot) return;
      const seatState = game.seats[seat];
      if (!seatState || !seatState.alive) return;
      try { botPolicy(game, seat); } catch { /* a bot must never break the room */ }
    });
  }

  expireUnauthenticatedConnections(now) {
    for (const conn of this.connections) {
      if (!Number.isInteger(conn.seat) && authenticationDeadlinePassed(conn, now)) {
        this.send(conn, { type: 'error', code: 'auth_timeout', message: 'WebSocket 认证超时' });
        conn.ws.close(4003, 'authentication timeout');
      }
    }
  }

  /** Re-arm the phase clock at the earliest interesting deadline: room
   * cleanup, the current phase deadline, or any pending auth timeout. */
  schedule() {
    if (this.closed) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const deadlines = [];
    const expiry = cleanupAt(this.room);
    if (expiry !== null) deadlines.push(expiry);
    if (this.room.status === 'playing' && this.room.deadline) deadlines.push(this.room.deadline);
    const now = Date.now();
    for (const conn of this.connections) {
      if (!Number.isInteger(conn.seat) && Number.isFinite(conn.authExpiresAt) && conn.authExpiresAt > now) {
        deadlines.push(conn.authExpiresAt);
      }
    }
    const next = deadlines.filter(Number.isFinite).sort((a, b) => a - b)[0];
    if (next !== undefined) {
      this.timer = setTimeout(() => this.tick(), Math.max(0, next - Date.now()));
      this.timer.unref?.();
    }
  }

  /** The alarm equivalent: expiry, unauthenticated timeouts, phase advance. */
  tick() {
    this.timer = null;
    if (this.closed) return;
    const room = this.room;
    const now = Date.now();
    const action = roomAlarmAction(room, now, SUPPORTED_RULESET);
    if (action === 'expire') {
      this.destroy({ type: 'error', code: 'room_expired', message: '房间已过期' }, 4000, 'room expired');
      this.manager.remove(room.code, this);
      return;
    }
    if (action === 'ruleset_mismatch') {
      for (const conn of [...this.connections]) {
        this.send(conn, { type: 'error', code: 'ruleset_mismatch', message: '此房间使用旧版规则，服务端无法继续结算' });
        conn.ws.close(4002, 'ruleset mismatch');
      }
      this.schedule();
      return;
    }
    this.expireUnauthenticatedConnections(now);
    const expiry = cleanupAt(room);
    if (expiry !== null) {
      if (expiry > now) this.schedule();
      return;
    }
    if (room.status !== 'playing' || !room.deadline) { this.schedule(); return; }
    try {
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
          room.deadline += phaseMs(next.phase);
          if (next.phase === 'prep') this.runBots();
        }
      }
    } catch (error) {
      console.error(`room ${room.code} phase advance failed:`, error);
    }
    this.schedule();
    this.broadcast();
  }

  destroy(errorMessage, closeCode = 1000, reason = 'closed') {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    for (const conn of [...this.connections]) {
      if (errorMessage) this.send(conn, errorMessage);
      conn.ws.close(closeCode, reason);
    }
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  create(code, name) {
    if (this.rooms.has(code)) return null;
    const token = randomToken();
    const room = {
      code, status: 'waiting', createdAt: Date.now(), deadline: null, finishedAt: null, game: null,
      players: [{
        seat: 0, id: 'p0', name, tokenHash: tokenHashSync(token),
        ready: false, lastSeq: 0, lastActionId: null,
      }],
    };
    const entry = new RoomEntry(this, room);
    this.rooms.set(code, entry);
    entry.schedule();
    return { code, seat: 0, token, lobby: lobbyFor(room) };
  }

  get(code) {
    return this.rooms.get(code) || null;
  }

  remove(code, entry) {
    if (this.rooms.get(code) === entry) this.rooms.delete(code);
  }
}
