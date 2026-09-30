import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseMs } from '../src/rooms.js';

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
