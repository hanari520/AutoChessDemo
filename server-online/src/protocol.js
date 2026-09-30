export const CAPACITY = 8;
export const MAX_UNAUTHENTICATED_CONNECTIONS = 8;
export const AUTHENTICATION_TIMEOUT_MS = 15_000;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 8;
export const PHASE_MS = Object.freeze({ prep: 45_000, combat: 8_000, result: 7_000 });
export const WAITING_TTL_MS = 24 * 60 * 60 * 1000;
export const FINISHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LOBBY_RECONNECT_MS = 90_000;

export function cleanupAt(room) {
  if (room.status === 'waiting') return room.createdAt + WAITING_TTL_MS;
  if (room.status === 'finished') return room.finishedAt + FINISHED_TTL_MS;
  return null;
}

export function authenticationDeadlinePassed(attachment, now = Date.now()) {
  return !Number.isFinite(attachment?.authExpiresAt) || attachment.authExpiresAt <= now;
}

export function unauthenticatedConnectionCount(attachments, now = Date.now()) {
  return attachments.filter(attachment =>
    !Number.isInteger(attachment?.seat)
    && Number.isFinite(attachment?.authExpiresAt)
    && attachment.authExpiresAt > now,
  ).length;
}

export function roomAlarmAction(room, now, supportedRuleset) {
  const expiry = cleanupAt(room);
  if (expiry !== null && expiry <= now) return 'expire';
  if (room.game && (room.game.version !== 1 || room.game.ruleset !== supportedRuleset)) return 'ruleset_mismatch';
  return 'process';
}

export class RoomError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function assertName(value) {
  if (typeof value !== 'string') throw new RoomError('bad_name', '请输入玩家昵称');
  const name = value.trim();
  if (name.length < 1 || name.length > 24 || /[\x00-\x1f\x7f]/.test(name)) {
    throw new RoomError('bad_name', '昵称需为 1–24 个可见字符');
  }
  return name;
}

export function normalizeCode(value) {
  const code = String(value || '').toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH || [...code].some(char => !ROOM_CODE_ALPHABET.includes(char))) {
    throw new RoomError('bad_room_code', '房间码格式不正确');
  }
  return code;
}

export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return [...bytes].map(byte => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function tokenHash(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
    throw new RoomError('bad_token', '重连凭证无效', 401);
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function lobbyFor(room, connectedSeats = new Set()) {
  return {
    status: room.status,
    hostSeat: room.hostSeat ?? null,
    capacity: CAPACITY,
    players: room.players.map(player => ({
      seat: player.seat,
      name: player.name,
      bot: !!player.bot,
      ready: !!player.ready,
      connected: connectedSeats.has(player.seat),
    })),
  };
}

export function parseClientMessage(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new RoomError('bad_message', '消息过长或格式错误');
  let message;
  try { message = JSON.parse(value); } catch { throw new RoomError('bad_json', '消息不是有效 JSON'); }
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw new RoomError('bad_message', '消息格式错误');
  if (!['auth', 'ready', 'action', 'ping', 'sync'].includes(message.type)) throw new RoomError('bad_type', '不支持的消息类型');
  return message;
}

export function validateActionEnvelope(message, player) {
  if (typeof message.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(message.id)) {
    throw new RoomError('bad_action_id', '操作 ID 格式错误');
  }
  if (!Number.isSafeInteger(message.seq) || message.seq < 1) throw new RoomError('bad_seq', '操作序号格式错误');
  if (message.seq === player.lastSeq && message.id === player.lastActionId) return 'duplicate';
  if (message.seq !== player.lastSeq + 1) throw new RoomError('out_of_order', '操作序号不连续');
  if (!message.action || typeof message.action !== 'object' || Array.isArray(message.action)) {
    throw new RoomError('bad_action', '操作内容格式错误');
  }
  if (!['buy', 'sell', 'move', 'reroll', 'buyXp', 'ready', 'equip', 'unequip', 'autoEquip', 'autoDeploy', 'tidy', 'lockShop', 'combine', 'combineWorn'].includes(message.action.type)) {
    throw new RoomError('bad_action', '不支持的操作');
  }
  return 'new';
}
