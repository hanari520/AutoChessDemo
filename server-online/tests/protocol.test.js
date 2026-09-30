import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTHENTICATION_TIMEOUT_MS, FINISHED_TTL_MS, MAX_UNAUTHENTICATED_CONNECTIONS, WAITING_TTL_MS,
  assertName, authenticationDeadlinePassed, cleanupAt, normalizeCode, parseClientMessage, randomCode, randomToken,
  roomAlarmAction, tokenHash, unauthenticatedConnectionCount, validateActionEnvelope,
} from '../src/protocol.js';

test('room code and reconnect token have valid shapes', async () => {
  const code = randomCode();
  assert.equal(normalizeCode(code.toLowerCase()), code);
  assert.equal(randomToken().length, 64);
  assert.equal((await tokenHash(randomToken())).length, 64);
  assert.throws(() => normalizeCode('O0O0O0O0'), /房间码/);
  assert.throws(() => assertName(' '.repeat(5)), /昵称/);
});

test('action sequence accepts a replay only when both id and seq match', () => {
  const player = { lastSeq: 2, lastActionId: 'purchase-2' };
  const message = { type: 'action', id: 'purchase-2', seq: 2, action: { type: 'buy', slot: 0 } };
  assert.equal(validateActionEnvelope(message, player), 'duplicate');
  assert.throws(() => validateActionEnvelope({ ...message, id: 'different' }, player), /不连续/);
  assert.equal(validateActionEnvelope({ ...message, id: 'purchase-3', seq: 3 }, player), 'new');
  assert.throws(() => validateActionEnvelope({ ...message, id: 'purchase-4', seq: 4 }, player), /不连续/);
});

test('client parser rejects oversized or unsupported messages', () => {
  assert.equal(parseClientMessage('{"type":"ready"}').type, 'ready');
  assert.throws(() => parseClientMessage('{"type":"cheat"}'), /消息类型/);
  assert.throws(() => parseClientMessage('a'.repeat(4097)), /消息过长/);
});

test('classic preparation commands pass the action envelope and unknown commands fail',()=>{
  for(const type of ['autoEquip','unequip','autoDeploy','tidy','lockShop','combine','combineWorn']){
    assert.equal(validateActionEnvelope({type:'action',id:'prep-1',seq:1,action:{type}},{lastSeq:0}), 'new');
  }
  assert.throws(()=>validateActionEnvelope({type:'action',id:'cheat-1',seq:1,action:{type:'grantGold'}},{lastSeq:0}),/不支持/);
});

test('room retention deadlines depend on lifecycle state', () => {
  assert.equal(cleanupAt({ status: 'waiting', createdAt: 100 }), 100 + WAITING_TTL_MS);
  assert.equal(cleanupAt({ status: 'playing' }), null);
  assert.equal(cleanupAt({ status: 'finished', finishedAt: 200 }), 200 + FINISHED_TTL_MS);
});

test('anonymous sockets have a small bounded admission budget', () => {
  const now = 10_000;
  const attachments = [
    { seat: null, authExpiresAt: now + AUTHENTICATION_TIMEOUT_MS },
    { seat: null, authExpiresAt: now + AUTHENTICATION_TIMEOUT_MS },
    { seat: 0 },
    { seat: null, authExpiresAt: now - 1 },
  ];
  assert.equal(MAX_UNAUTHENTICATED_CONNECTIONS, 8);
  assert.equal(unauthenticatedConnectionCount(attachments, now), 2);
  assert.equal(unauthenticatedConnectionCount([
    ...attachments,
    { seat: null, authExpiresAt: now + 1 },
    { seat: null, authExpiresAt: now + 2 },
    { seat: null, authExpiresAt: now + 3 },
    { seat: null, authExpiresAt: now + 4 },
    { seat: null, authExpiresAt: now + 5 },
    { seat: null, authExpiresAt: now + 6 },
  ], now), 8);
});

test('missing authentication deadlines are expired for legacy sockets', () => {
  const now = 20_000;
  assert.equal(authenticationDeadlinePassed({ seat: null }, now), true);
  assert.equal(authenticationDeadlinePassed({ seat: null, authExpiresAt: now }, now), true);
  assert.equal(authenticationDeadlinePassed({ seat: null, authExpiresAt: now + 1 }, now), false);
});

test('room expiry takes priority over ruleset mismatch in the alarm', () => {
  const expiredLegacyRoom = {
    status: 'waiting', createdAt: 100,
    game: { version: 0, ruleset: 'legacy' },
  };
  assert.equal(roomAlarmAction(expiredLegacyRoom, 100 + WAITING_TTL_MS, 'current'), 'expire');
  assert.equal(roomAlarmAction(expiredLegacyRoom, 100 + WAITING_TTL_MS - 1, 'current'), 'ruleset_mismatch');
});
