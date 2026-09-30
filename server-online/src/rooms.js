/* Room manager. This is the Node port of the former Cloudflare
 * Durable Object: one RoomEntry per invite code keeps the authoritative room
 * state, the live WebSocket connections and a setTimeout phase clock that
 * mirrors the DO alarm semantics. Mutations are serialized per room and the
 * complete room is persisted before any acknowledgement or state broadcast. */
import { createHash, randomBytes } from 'node:crypto';
import { createGame, applyAction, advancePhase, viewFor } from './core.js';
import {
  AUTHENTICATION_TIMEOUT_MS, CAPACITY, LOBBY_RECONNECT_MS, MAX_UNAUTHENTICATED_CONNECTIONS, PHASE_MS, RoomError,
  assertName, authenticationDeadlinePassed, cleanupAt, lobbyFor, parseClientMessage, randomToken,
  roomAlarmAction, validateActionEnvelope,
} from './protocol.js';
import { botPolicy, pickBotName } from './bots.js';
import { MemoryRoomStore } from './room-store.js';

export const SUPPORTED_RULESET = 'deterministic-battle-v6';
const MAX_ROOM_CONNECTIONS = 16;
const MAX_BUFFERED_BYTES = 256 * 1024;

/** Phase length in milliseconds. ONLINE_FAST (a positive number of millis)
 * accelerates all three phases equally for tests and local joint debugging. */
export function phaseMs(phase, game = null) {
  const fast = Number(process.env.ONLINE_FAST);
  if (Number.isFinite(fast) && fast > 0) return fast;
  if (phase === 'combat' && game) return Math.max(PHASE_MS.combat,...(game.battles || []).map(battle=>(battle.durationMs || 0)+1000));
  return PHASE_MS[phase];
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
    this.queue = Promise.resolve();
    this.effects = null;
    this.pendingOperations = 0;
    this.suspended = false;
  }

  enqueue(operation, { persist = true } = {}) {
    if (this.pendingOperations >= 32) return Promise.reject(new RoomError('rate_limited', '房间操作队列已满，请稍后重试', 429));
    // In-memory tests and development preserve the existing synchronous room
    // semantics; durable stores always pass through the serialized commit queue.
    if (this.manager.store instanceof MemoryRoomStore) {
      try {
        const result = operation();
        if (persist) {
          if (this.closed) this.manager.store.rooms.delete(this.room.code);
          else this.manager.store.rooms.set(this.room.code, structuredClone(this.room));
        }
        return Promise.resolve(result);
      } catch (error) { return Promise.reject(error); }
    }
    this.pendingOperations++;
    const work = this.queue.then(async () => {
      if (this.closed) throw new RoomError('room_not_found', '房间不存在', 404);
      if (this.suspended || this.manager.store.health?.().healthy === false) throw new RoomError('storage_unavailable', '房间存储暂时不可用，请重连', 503);
      if (!persist) return operation();
      const previous = structuredClone(this.room);
      const oldClosed = this.closed;
      const seats = new Map([...this.connections].map(conn => [conn, conn.seat]));
      this.effects = [];
      try {
        const started = performance.now();
        const result = operation();
        if (this.manager.rooms.get(this.room.code) === this && !this.closed) await this.manager.store.save(this.room);
        else await this.manager.store.remove(this.room.code);
        const effects = this.effects;
        this.effects = null;
        this.manager.metrics.lastCommitMs = Math.round(performance.now() - started);
        this.manager.metrics.maxCommitMs = Math.max(this.manager.metrics.maxCommitMs || 0, this.manager.metrics.lastCommitMs);
        for (const effect of effects) effect();
        return result;
      } catch (error) {
        this.room = previous;
        this.closed = oldClosed;
        for (const [conn, seat] of seats) conn.seat = seat;
        this.effects = null;
        this.suspended = true;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        for (const conn of this.connections) conn.ws.close(1012, 'storage unavailable');
        throw error;
      }
    }).finally(() => { this.pendingOperations--; });
    this.queue = work.catch(() => {});
    return work;
  }

  effect(callback) { if (this.effects) this.effects.push(callback); else callback(); }
  closeConnection(conn, code, reason) { this.effect(() => conn.ws.close(code, reason)); }

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
    this.effect(() => {
      if (conn.ws.readyState !== undefined && conn.ws.readyState !== 1) return;
      if ((conn.ws.bufferedAmount || 0) > MAX_BUFFERED_BYTES) {
        conn.ws.terminate();
        this.manager.metrics.slowClients++;
        return;
      }
      try { conn.ws.send(JSON.stringify(value)); } catch { /* peer disconnected */ }
    });
  }

  snapshot(seat) {
    const room = this.room;
    const player = room.players[seat];
    return {
      type: 'state', code: room.code, seat, serverTime: Date.now(), deadline: room.deadline, phaseDurationMs: room.game ? phaseMs(room.game.phase,room.game) : null,
      nextSeq: player.lastSeq + 1, lastActionId: player.lastActionId,
      maintenance: this.manager.draining,
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
      ready: false, lastSeq: 0, lastActionId: null, disconnectedAt: Date.now(),
    });
    this.broadcast();
    this.schedule();
    return { code: room.code, seat, token, lobby: lobbyFor(room, this.connectedSeats()) };
  }

  requireHost(token) {
    const hash = tokenHashSync(token);
    const player = this.room.players.find(entry => entry.tokenHash === hash);
    if (!player) throw new RoomError('bad_token', '重连凭证无效', 401);
    if (player.seat !== this.room.hostSeat) throw new RoomError('not_host', '只有房主可以管理机器人', 403);
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
    this.removeWaitingSeat(seat);
    this.broadcast();
    this.schedule();
    return { lobby: lobbyFor(room, this.connectedSeats()) };
  }

  electHost() {
    const connected = this.connectedSeats();
    const current = this.room.players[this.room.hostSeat];
    if (current && !current.bot && connected.has(current.seat)) return;
    this.room.hostSeat = this.room.players.find(p => !p.bot && connected.has(p.seat))?.seat ?? null;
  }

  removeWaitingSeat(seat) {
    const room = this.room;
    for (const conn of this.connections) {
      if (conn.seat === seat) { conn.seat = null; this.closeConnection(conn, 4005, 'seat released'); }
      else if (Number.isInteger(conn.seat) && conn.seat > seat) conn.seat--;
    }
    room.players.splice(seat, 1);
    if (room.hostSeat === seat) room.hostSeat = null;
    else if (Number.isInteger(room.hostSeat) && room.hostSeat > seat) room.hostSeat--;
    room.players.forEach((entry, index) => {
      entry.seat = index;
      entry.id = entry.bot ? `b${index}` : `p${index}`;
    });
    this.electHost();
  }

  closeIfAbandoned() {
    const humans = this.room.players.filter(p => !p.bot);
    const botsOnly = this.room.game && !this.room.game.seats.some(p=>!p.bot && p.alive && !this.room.players[p.seat]?.leftGame);
    if (!humans.length || botsOnly || (this.room.status !== 'waiting' && humans.every(p => p.leftGame))) {
      this.destroy({type:'error',code:botsOnly?'room_bots_only':'room_empty',message:botsOnly?'剩余玩家全部为机器人，房间已关闭':'所有玩家已退出，房间已关闭'},4000,'room empty');
      this.manager.remove(this.room.code,this);
      return true;
    }
    return false;
  }

  leave(token) {
    const hash = tokenHashSync(token);
    const player = this.room.players.find(p => p.tokenHash === hash);
    if (!player) throw new RoomError('bad_token','重连凭证无效',401);
    if (this.room.status === 'waiting') this.removeWaitingSeat(player.seat);
    else {
      player.leftGame = true;
      for (const conn of this.connections) if (conn.seat === player.seat) {
        conn.seat = null; this.closeConnection(conn, 4005,'player left');
      }
    }
    if (!this.closeIfAbandoned()) { this.broadcast(); this.schedule(); }
    return {ok:true};
  }

  releaseDisconnectedSeats(now) {
    if (this.room.status !== 'waiting') return;
    const connected = this.connectedSeats();
    for (let i=this.room.players.length-1;i>=0;i--) {
      const p=this.room.players[i];
      if (!p.bot && !connected.has(i) && Number.isFinite(p.disconnectedAt) && p.disconnectedAt+LOBBY_RECONNECT_MS<=now) this.removeWaitingSeat(i);
    }
    this.closeIfAbandoned();
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
    ws.on('message', data => {
      if (this.manager.stopping) { ws.close(1012, 'service restart'); return; }
      if (data.length > 4096) { ws.close(1009, 'message too large'); return; }
      if (!this.manager.allowMessage(conn)) { this.send(conn, {type:'error',code:'rate_limited',message:'操作过于频繁'}); return; }
      let readOnly = false;
      try { const message = parseClientMessage(data.toString()); readOnly = Number.isInteger(conn.seat) && ['ping','sync'].includes(message.type); }
      catch { /* parser returns the protocol error in handleMessage */ }
      this.enqueue(() => this.handleMessage(conn, data.toString()), {persist: !readOnly}).catch(error => {
        this.manager.metrics.persistenceFailures++;
        this.send(conn, { type:'error', code:'storage_unavailable', message:'房间暂时无法保存，请稍后重试' });
        console.error('room mutation failed:', error.message);
      });
    });
    ws.on('pong', () => { conn.alive = true; });
    ws.on('close', code => {
      const category = [1000,1001,1006,1009,1012,4000,4001,4002,4003,4004,4005].includes(code) ? String(code) : 'other';
      this.manager.metrics.disconnects[category] = (this.manager.metrics.disconnects[category] || 0) + 1;
      this.connections.delete(conn);
      if (this.closed) return;
      this.enqueue(() => {
      if (this.room.status === 'waiting' && Number.isInteger(conn.seat) && !this.connectedSeats().has(conn.seat)) {
        const player=this.room.players[conn.seat];
        if (player) { player.ready=false; player.disconnectedAt=Date.now(); }
        this.electHost();
      }
      this.broadcast();
      this.schedule();
      }).catch(error => console.error('disconnect save failed:', error.message));
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
          if (other !== conn && other.seat === player.seat) { other.seat=null; this.closeConnection(other, 4001, '另一连接已接管此座位'); }
        }
        conn.seat = player.seat;
        player.disconnectedAt = null;
        player.leftGame = false;
        this.effect(() => { this.manager.metrics.reconnects++; });
        this.electHost();
        this.broadcast();
        this.schedule();
        return;
      }
      if (message.type === 'ping') { this.send(conn, { type: 'pong', serverTime: Date.now() }); return; }
      if (message.type === 'sync') { this.send(conn, this.snapshot(conn.seat)); return; }
      if (message.type === 'auth') throw new RoomError('already_authenticated', '连接已经认证');
      const room = this.room;
      if (!room.players[conn.seat]) throw new RoomError('room_not_found', '房间不存在', 404);
      this.ensureCompatible();
      if (message.type === 'ready') {
        if (this.manager.draining && message.ready !== false) throw new RoomError('maintenance', '服务维护中，暂时无法开始新对局', 503);
        if (room.status !== 'waiting') throw new RoomError('game_started', '对局已开始', 409);
        room.players[conn.seat].ready = message.ready !== false;
        const connected=this.connectedSeats();
        if (room.players.length === CAPACITY && room.players.every(player => player.ready && connected.has(player.seat))) {
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
        if (message.round !== undefined && message.round !== room.game.round) throw new RoomError('stale_action', '操作所属回合已结束', 409);
        const candidate = structuredClone(room.game);
        try { applyAction(candidate, conn.seat, message.action); }
        catch (error) { throw new RoomError('invalid_action', error.message || '操作不符合当前规则'); }
        room.game = candidate;
        player.lastSeq = message.seq;
        player.lastActionId = message.id;
        this.effect(() => { this.manager.metrics.actions++; });
        this.send(conn, { type: 'ack', id: message.id, seq: message.seq });
        this.broadcast();
      }
    } catch (error) {
      this.send(conn, {
        type: 'error', id: message?.id,
        code: error instanceof RoomError ? error.code : 'internal_error',
        message: error instanceof RoomError ? error.message : '服务器处理失败',
      });
      if (!Number.isInteger(conn.seat)) this.closeConnection(conn, 4003, 'authentication failed');
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
    if (this.effects) { this.effects.push(() => this.schedule()); return; }
    if (this.closed || this.suspended || this.manager.stopping) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const deadlines = [];
    const expiry = cleanupAt(this.room);
    if (expiry !== null) deadlines.push(expiry);
    if (this.room.status === 'playing' && this.room.deadline) deadlines.push(this.room.deadline);
    if (this.room.status === 'waiting') for (const player of this.room.players) {
      if (!player.bot && Number.isFinite(player.disconnectedAt)) deadlines.push(player.disconnectedAt+LOBBY_RECONNECT_MS);
    }
    const now = Date.now();
    for (const conn of this.connections) {
      if (!Number.isInteger(conn.seat) && Number.isFinite(conn.authExpiresAt) && conn.authExpiresAt > now) {
        deadlines.push(conn.authExpiresAt);
      }
    }
    const next = deadlines.filter(Number.isFinite).sort((a, b) => a - b)[0];
    if (next !== undefined) {
      this.timer = setTimeout(() => this.enqueue(() => this.tick()).catch(error => {
        this.manager.metrics.persistenceFailures++;
        console.error('room timer save failed:', error.message);
        if (!this.suspended) { this.timer = setTimeout(() => this.schedule(), 1000); this.timer.unref?.(); }
      }), Math.max(0, next - Date.now()));
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
        this.closeConnection(conn, 4002, 'ruleset mismatch');
      }
      this.schedule();
      return;
    }
    this.expireUnauthenticatedConnections(now);
    this.releaseDisconnectedSeats(now);
    if (this.closed) return;
    if (room.status === 'waiting') this.broadcast();
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
          // Computation and event-loop delays must not consume the replay window.
          room.deadline = Date.now() + phaseMs(next.phase,next);
          if (next.phase === 'prep') this.runBots();
        }
      }
    } catch (error) {
      this.manager.metrics.phaseFailures++;
      throw new Error('Room phase calculation failed');
    }
    this.schedule();
    this.broadcast();
    this.closeIfAbandoned();
  }

  destroy(errorMessage, closeCode = 1000, reason = 'closed') {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    for (const conn of [...this.connections]) {
      if (errorMessage) this.send(conn, errorMessage);
      this.closeConnection(conn, closeCode, reason);
    }
  }
}

export class RoomManager {
  constructor(store = new MemoryRoomStore()) {
    this.rooms = new Map();
    this.store = store;
    this.draining = false;
    this.metrics = { persistenceFailures:0, phaseFailures:0, slowClients:0, rateLimited:0, actions:0, reconnects:0, disconnects:{} };
    this.creationQueue = Promise.resolve();
    this.httpRates = new Map();
  }

  async restore() {
    const rooms = await this.store.open();
    for (const room of rooms) {
      if (!room || !room.code || !Array.isArray(room.players)) throw new Error('invalid persisted room');
      const expiry = cleanupAt(room);
      if (expiry !== null && expiry <= Date.now()) { await this.store.remove(room.code); continue; }
      if (room.status === 'playing') {
        if (!room.game || room.game.ruleset !== SUPPORTED_RULESET || room.game.version !== 1) throw new Error('Unsupported persisted game rules');
        room.deadline = Date.now() + Math.max(15_000, phaseMs(room.game.phase, room.game));
      }
      if (room.status === 'waiting') for (const player of room.players) if (!player.bot) {
        player.ready = false; player.disconnectedAt = Date.now();
      }
      room.hostSeat = room.players.find(player => !player.bot)?.seat ?? null;
      const entry = new RoomEntry(this, room);
      this.rooms.set(room.code, entry);
      await this.store.save(room);
      entry.schedule();
    }
  }

  allowMessage(conn) {
    const now = Date.now();
    if (!conn.rate || now - conn.rate.started > 1000) conn.rate = {started:now,count:0};
    if (++conn.rate.count <= 20) return true;
    this.metrics.rateLimited++;
    return false;
  }

  allowHttp(key) {
    const now = Date.now();
    for (const [address, value] of this.httpRates) if (value.expiresAt <= now) this.httpRates.delete(address);
    if (!this.httpRates.has(key) && this.httpRates.size >= 2048) { this.metrics.rateLimited++; return false; }
    const value = this.httpRates.get(key) ?? {expiresAt:now + 60_000, count:0};
    this.httpRates.set(key, value);
    if (++value.count <= 120) return true;
    this.metrics.rateLimited++;
    return false;
  }

  create(code, name) {
    if (this.rooms.has(code)) return null;
    const token = randomToken();
    const room = {
      code, status: 'waiting', hostSeat:0, createdAt: Date.now(), deadline: null, finishedAt: null, game: null,
      players: [{
        seat: 0, id: 'p0', name, tokenHash: tokenHashSync(token),
        ready: false, lastSeq: 0, lastActionId: null, disconnectedAt:Date.now(),
      }],
    };
    const entry = new RoomEntry(this, room);
    const finish = () => {
      this.rooms.set(code, entry);
      entry.schedule();
      return { code, seat: 0, token, lobby: lobbyFor(room) };
    };
    if (this.store instanceof MemoryRoomStore) {
      this.store.rooms.set(code, structuredClone(room));
      return finish();
    }
    return this.store.save(room).then(finish);
  }

  get(code) {
    return this.rooms.get(code) || null;
  }

  remove(code, entry) {
    if (this.rooms.get(code) !== entry) return;
    if (entry.effects) entry.effects.push(() => this.rooms.delete(code));
    else this.rooms.delete(code);
  }
}
