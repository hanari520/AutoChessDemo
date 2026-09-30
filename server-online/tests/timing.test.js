import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseMs } from '../src/rooms.js';

test('early preparation speeds up with consistent round boundaries and test override', () => {
  const old = process.env.ONLINE_FAST;
  try {
    delete process.env.ONLINE_FAST;
    for (const [round, duration] of [[1,25000],[3,25000],[4,30000],[6,30000],[7,35000],[10,35000],[11,45000],[40,45000]]) {
      assert.equal(phaseMs('prep', { round }), duration);
    }
    assert.equal(phaseMs('prep'), 45000);
    process.env.ONLINE_FAST = '80';
    assert.equal(phaseMs('prep', { round: 1 }), 80);
  } finally { if (old === undefined) delete process.env.ONLINE_FAST; else process.env.ONLINE_FAST = old; }
});

test('four simultaneous fights reserve enough time for the longest replay',()=>{
  const old=process.env.ONLINE_FAST;
  try {
    delete process.env.ONLINE_FAST;
    const game={battles:[{durationMs:1500},{durationMs:12500},{durationMs:35900},{durationMs:8700}]};
    assert.equal(phaseMs('combat',game),36900);
    assert.equal(phaseMs('prep',game),45000);
    assert.equal(phaseMs('result',game),7000);
    process.env.ONLINE_FAST='80';assert.equal(phaseMs('combat',game),80);
  } finally { if(old===undefined)delete process.env.ONLINE_FAST;else process.env.ONLINE_FAST=old; }
});
