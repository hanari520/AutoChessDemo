import test from 'node:test';
import assert from 'node:assert/strict';
import {postJson, reconnectDelay, reconcileAction} from '../online/connection.js';

const pending = {envelope: {type:'action', id:'buy-1', seq:4, action:{type:'buy', slot:0}}, round:2};
const snapshot = (nextSeq, lastActionId, round=2, phase='prep') => ({
  nextSeq, lastActionId, lobby:{status:'playing'}, view:{round, phase},
});

test('lost ack resolves from authoritative action ID and sequence', () => {
  assert.equal(reconcileAction(pending, snapshot(5, 'buy-1')), 'confirmed');
  assert.equal(reconcileAction(pending, snapshot(5, 'other')), 'conflict');
});

test('only an unexecuted action in the original preparation round can be resent', () => {
  assert.equal(reconcileAction(pending, snapshot(4, 'earlier')), 'retry');
  assert.equal(reconcileAction(pending, snapshot(4, 'earlier', 3)), 'stale');
  assert.equal(reconcileAction(pending, snapshot(4, 'earlier', 2, 'combat')), 'stale');
  assert.equal(reconcileAction(pending, snapshot(6, 'later')), 'conflict');
  assert.equal(reconcileAction(pending, {nextSeq:4, view:{round:2,phase:'prep'}}), 'unknown');
});

test('retry delay adds bounded jitter', () => {
  assert.equal(reconnectDelay(0, () => 0), 560);
  assert.equal(reconnectDelay(0, () => 1), 1040);
  assert.equal(reconnectDelay(20, () => 1), 19500);
});

test('HTTP blackhole aborts and exposes a retryable timeout', async () => {
  let aborted = false;
  await assert.rejects(
    postJson('https://example.invalid', {}, {timeoutMs:10, fetchImpl:(_url,{signal}) => new Promise((_resolve,reject) => {
      signal.addEventListener('abort', () => {aborted=true; reject(new DOMException('aborted','AbortError'));});
    })}),
    /请求超时/,
  );
  assert.equal(aborted, true);
});

test('HTTP status remains available for leave recovery', async () => {
  const fetchImpl = async () => ({ok:false, status:404, json:async()=>({message:'房间不存在'})});
  await assert.rejects(postJson('https://example.invalid', {}, {fetchImpl}), error => error.status === 404);
});
