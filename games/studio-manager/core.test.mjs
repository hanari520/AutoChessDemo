import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, previewShow, reduceGame, validateState } from './core.mjs';
import { EVENTS, PROGRAMS } from './content.mjs';

const DEFAULT_ROSTER = ['suiji', 'kanban', 'huize'];

function dispatch(state, type, extra = {}) {
  return reduceGame(state, { type, actionId: `${type}-${dispatch.nextId++}`, ...extra });
}
dispatch.nextId = 1;

function chooseFreeEventOption(state) {
  const event = EVENTS.find((candidate) => candidate.id === state.currentShow.eventId);
  return event.options
    .filter((option) => option.cost === 0)
    .sort((left, right) => {
      const score = (option) => option.qualityDelta * 1.5 + option.hypeDelta + option.fundsDelta + option.energyDelta * 0.2;
      return score(right) - score(left);
    })[0];
}

function playSlot(state, { programId, memberIds, rest = false }) {
  if (rest) state = dispatch(state, 'rest');
  else {
    const preview = previewShow(state, programId, memberIds);
    if (!preview.ok || !preview.affordable) state = dispatch(state, 'rest');
    else {
      state = dispatch(state, 'show', { programId, memberIds });
      if (state.phase === 'event') {
        const option = chooseFreeEventOption(state);
        state = dispatch(state, 'event', { optionId: option.id });
      }
    }
  }
  const row = state.lastResult;
  return { state: dispatch(state, 'advance'), row };
}

function runCampaign({ seed, roster = DEFAULT_ROSTER, chooseSlot, upgrades = [], finalize = true }) {
  dispatch.nextId = 1;
  let state = createGame({ seed, memberIds: roster });
  const rows = [];
  for (let slotIndex = 0; slotIndex < 12; slotIndex += 1) {
    const upgradeId = upgrades[slotIndex];
    if (upgradeId && state.phase === 'planning') {
      try {
        state = dispatch(state, 'upgrade', { equipmentId: upgradeId });
      } catch (error) {
        if (!String(error.message).includes('Not enough funds')) throw error;
      }
    }
    const outcome = playSlot(state, chooseSlot(slotIndex, state));
    state = outcome.state;
    rows.push(outcome.row);
  }
  assert.equal(state.phase, 'finale');
  if (!finalize) return { state, rows };
  state = dispatch(state, 'finale', { programIds: ['game', 'talk', 'song'] });
  assert.equal(state.phase, 'complete');
  assert.equal(validateState(state), true);
  return { state, rows };
}

test('same seed and action sequence produce the same event order and results', () => {
  const run = () => runCampaign({
    seed: 'night-one',
    chooseSlot: () => ({ programId: 'talk', memberIds: ['huize'] }),
  });
  const first = run();
  const second = run();
  assert.deepEqual(first.state, second.state);
  assert.deepEqual(first.rows.map(({ quality, income, eventId }) => ({ quality, income, eventId })),
    second.rows.map(({ quality, income, eventId }) => ({ quality, income, eventId })));
  assert.equal(new Set(first.rows.map((row) => row.eventId)).size, 12);
});

test('preview is pure and explains quality, costs, income, and energy', () => {
  const state = createGame({ seed: 7, memberIds: DEFAULT_ROSTER });
  const before = JSON.stringify(state);
  const preview = previewShow(state, 'game', ['suiji']);
  assert.equal(JSON.stringify(state), before);
  assert.equal(preview.ok, true);
  assert.equal(preview.cost, 12);
  assert.equal(preview.affordable, true);
  assert.equal(preview.quality, 60);
  assert.deepEqual(preview.qualityRange, { min: 56, max: 69 });
  assert.deepEqual(preview.incomeRange, { min: 44, max: 52 });
  assert.deepEqual(preview.energyCosts, [{ memberId: 'suiji', amount: 18 }]);
  assert.deepEqual(preview.energyRecovery, [
    { memberId: 'kanban', amount: 15 },
    { memberId: 'huize', amount: 15 },
  ]);
  assert.ok(preview.reasons.some((reason) => reason.code === 'skill' && reason.value === 20));
});

test('the same show action ID cannot charge twice and event choice is idempotent', () => {
  let state = createGame({ seed: 91, memberIds: DEFAULT_ROSTER });
  const action = { type: 'show', actionId: 'show-once', programId: 'talk', memberIds: ['huize'] };
  state = reduceGame(state, action);
  const afterShowFunds = state.funds;
  const afterShowCursor = state.eventCursor;
  const repeatedShow = reduceGame(state, action);
  assert.strictEqual(repeatedShow, state);
  assert.equal(repeatedShow.funds, afterShowFunds);
  assert.equal(repeatedShow.eventCursor, afterShowCursor);

  const event = EVENTS.find((candidate) => candidate.id === state.currentShow.eventId);
  const option = event.options.find((candidate) => candidate.cost === 0);
  const eventAction = { type: 'event', actionId: 'event-once', optionId: option.id };
  state = reduceGame(state, eventAction);
  const settledFunds = state.funds;
  const repeatedEvent = reduceGame(state, eventAction);
  assert.strictEqual(repeatedEvent, state);
  assert.equal(repeatedEvent.funds, settledFunds);
  assert.equal(repeatedEvent.history.length, 1);
});

test('event deck is drawn without replacement and inconsistent exhausted cursors are rejected', () => {
  let state = createGame({ seed: 2026, memberIds: DEFAULT_ROSTER });
  const seen = [];
  for (let index = 0; index < 12; index += 1) {
    state = dispatch(state, 'show', { programId: 'talk', memberIds: ['huize'] });
    const eventId = state.currentShow.eventId;
    assert.ok(eventId);
    seen.push(eventId);
    const event = EVENTS.find((candidate) => candidate.id === eventId);
    const option = event.options.find((candidate) => candidate.cost === 0);
    state = dispatch(state, 'event', { optionId: option.id });
    state = dispatch(state, 'advance');
  }
  assert.equal(new Set(seen).size, 12);
  assert.equal(state.eventCursor, 12);

  const exhausted = JSON.parse(JSON.stringify(createGame({ seed: 2, memberIds: DEFAULT_ROSTER })));
  exhausted.eventCursor = exhausted.eventDeck.length;
  assert.equal(validateState(exhausted), false);
  assert.throws(() => dispatch(exhausted, 'show', { programId: 'talk', memberIds: ['huize'] }), /invalid game state/);
});

test('valid planning, event, result, finale, and complete saves pass structural validation', () => {
  let state = createGame({ seed: 'phase-contract', memberIds: DEFAULT_ROSTER });
  assert.equal(validateState(state), true);
  state = dispatch(state, 'show', { programId: 'talk', memberIds: ['huize'] });
  assert.equal(state.phase, 'event');
  assert.equal(validateState(JSON.parse(JSON.stringify(state))), true);
  const option = chooseFreeEventOption(state);
  state = dispatch(state, 'event', { optionId: option.id });
  assert.equal(state.phase, 'result');
  assert.equal(validateState(JSON.parse(JSON.stringify(state))), true);
  state = dispatch(state, 'advance');
  assert.equal(validateState(state), true);
  for (let index = 1; index < 12; index += 1) {
    const outcome = playSlot(state, { rest: true });
    state = outcome.state;
    assert.equal(validateState(JSON.parse(JSON.stringify(state))), true);
  }
  assert.equal(state.phase, 'finale');
  state = dispatch(state, 'finale', { programIds: ['game', 'talk', 'song'] });
  assert.equal(state.phase, 'complete');
  assert.equal(validateState(JSON.parse(JSON.stringify(state))), true);
});

test('malformed event selections and unknown event references are rejected before reducing', () => {
  let state = createGame({ seed: 'bad-event-save', memberIds: DEFAULT_ROSTER });
  state = dispatch(state, 'show', { programId: 'talk', memberIds: ['huize'] });
  assert.equal(state.phase, 'event');

  const missingMembers = JSON.parse(JSON.stringify(state));
  delete missingMembers.currentShow.memberIds;
  assert.equal(validateState(missingMembers), false);
  assert.throws(() => reduceGame(missingMembers, {
    type: 'event', actionId: 'malformed-event', optionId: 'soft-filter',
  }), /invalid game state/);

  const unknownEvent = JSON.parse(JSON.stringify(state));
  unknownEvent.currentShow.eventId = 'unlisted-event';
  assert.equal(validateState(unknownEvent), false);
  assert.throws(() => reduceGame(unknownEvent, {
    type: 'event', actionId: 'unknown-event', optionId: 'soft-filter',
  }), /invalid game state/);

  const badPreview = JSON.parse(JSON.stringify(state));
  badPreview.currentShow.preview.qualityRange = null;
  assert.equal(validateState(badPreview), false);
});

test('malformed result, nested UI fields, and unknown history programs are rejected', () => {
  let state = createGame({ seed: 'bad-result-save', memberIds: DEFAULT_ROSTER });
  state = dispatch(state, 'show', { programId: 'talk', memberIds: ['huize'] });
  const event = EVENTS.find((candidate) => candidate.id === state.currentShow.eventId);
  const option = event.options.find((candidate) => candidate.cost === 0);
  state = dispatch(state, 'event', { optionId: option.id });

  const badQuality = JSON.parse(JSON.stringify(state));
  badQuality.lastResult.quality = 'great';
  assert.equal(validateState(badQuality), false);

  const badReason = JSON.parse(JSON.stringify(state));
  badReason.history.at(-1).reasons[0].label = { text: 'unsafe shape' };
  badReason.lastResult = badReason.history.at(-1);
  assert.equal(validateState(badReason), false);

  const badReasonArray = JSON.parse(JSON.stringify(state));
  const energyReason = badReasonArray.history.at(-1).reasons.find((reason) => reason.code === 'energy');
  energyReason.value[0].memberId = 'unlisted-member';
  badReasonArray.lastResult = badReasonArray.history.at(-1);
  assert.equal(validateState(badReasonArray), false);

  const badEventReference = JSON.parse(JSON.stringify(state));
  badEventReference.history.at(-1).eventId = 'unlisted-event';
  badEventReference.lastResult = badEventReference.history.at(-1);
  assert.equal(validateState(badEventReference), false);

  state = dispatch(state, 'advance');
  for (let index = 1; index < 12; index += 1) {
    state = playSlot(state, { rest: true }).state;
  }
  assert.equal(state.phase, 'finale');
  const unknownProgram = JSON.parse(JSON.stringify(state));
  unknownProgram.history[0].programId = 'unlisted-program';
  assert.equal(validateState(unknownProgram), false);
  assert.throws(() => reduceGame(unknownProgram, {
    type: 'finale', actionId: 'unsafe-finale', programIds: ['game', 'talk', 'song'],
  }), /invalid game state/);

  const completed = dispatch(state, 'finale', { programIds: ['game', 'talk', 'song'] });
  const badFinale = JSON.parse(JSON.stringify(completed));
  badFinale.finale.result.components = null;
  assert.equal(validateState(badFinale), false);
  const badFinaleReferences = JSON.parse(JSON.stringify(completed));
  badFinaleReferences.finale.programIds[0] = 'unlisted-program';
  badFinaleReferences.finale.result.programIds[0] = 'unlisted-program';
  assert.equal(validateState(badFinaleReferences), false);
});

test('zero funds and zero energy still have a free path through every slot and the finale', () => {
  let state = createGame({ seed: 'zero-state', memberIds: DEFAULT_ROSTER });
  state.funds = 0;
  for (const memberId of state.memberIds) state.members[memberId].energy = 0;
  assert.equal(validateState(state), true);
  assert.equal(previewShow(state, 'talk', ['huize']).affordable, false);
  assert.throws(() => dispatch(state, 'show', { programId: 'talk', memberIds: ['huize'] }), /Not enough funds/);

  for (let index = 0; index < 12; index += 1) {
    const outcome = playSlot(state, { rest: true });
    state = outcome.state;
    assert.equal(outcome.row.kind, 'rest');
    assert.ok(state.funds >= 0);
    assert.ok(state.memberIds.every((id) => state.members[id].energy >= 0));
  }
  state = dispatch(state, 'finale', { programIds: ['game', 'talk', 'song'] });
  assert.equal(state.phase, 'complete');
  assert.equal(state.finale.endingId, 'first-steps');
});

test('a zero-energy member may still perform a show when its configured cost is affordable', () => {
  let state = createGame({ seed: 'zero-energy-show', memberIds: DEFAULT_ROSTER });
  state.members.huize.energy = 0;
  const preview = previewShow(state, 'talk', ['huize']);
  assert.equal(preview.quality, 45);
  assert.equal(preview.affordable, true);
  state = dispatch(state, 'show', { programId: 'talk', memberIds: ['huize'] });
  assert.ok(['event', 'result'].includes(state.phase));
  if (state.phase === 'event') {
    const option = chooseFreeEventOption(state);
    state = dispatch(state, 'event', { optionId: option.id });
  }
  assert.equal(state.phase, 'result');
  assert.equal(state.members.huize.energy, 0);
  assert.ok(state.funds >= 0);
  assert.equal(state.lastResult.kind, 'show');
});

test('upgrade levels are bounded, with configured costs and no negative balance', () => {
  let state = createGame({ seed: 3, memberIds: DEFAULT_ROSTER });
  state = dispatch(state, 'upgrade', { equipmentId: 'audio' });
  assert.equal(state.equipment.audio, 1);
  assert.equal(state.funds, 65);
  state = dispatch(state, 'upgrade', { equipmentId: 'audio' });
  assert.equal(state.equipment.audio, 2);
  assert.equal(state.funds, 10);
  assert.throws(() => dispatch(state, 'upgrade', { equipmentId: 'audio' }), /maximum level/);
  assert.equal(state.funds, 10);
});

test('specialist, balanced, and recovery plans complete all twelve slots; two reach a mid-tier ending', () => {
  const specialist = runCampaign({
    seed: 14,
    chooseSlot: () => ({ programId: 'talk', memberIds: ['huize'] }),
    upgrades: ['audio'],
  });
  const balancedCycle = ['game', 'talk', 'song', 'lesson', 'duo'];
  const balancedMembers = {
    game: ['suiji'],
    talk: ['huize'],
    song: ['kanban'],
    lesson: ['kanban'],
    duo: ['suiji', 'huize'],
  };
  const balanced = runCampaign({
    seed: 27,
    chooseSlot: (slotIndex) => {
      const programId = balancedCycle[slotIndex % balancedCycle.length];
      return { programId, memberIds: balancedMembers[programId] };
    },
    upgrades: ['audio', 'set', 'lighting'],
  });
  const recovery = runCampaign({
    seed: 88,
    chooseSlot: (slotIndex) => (slotIndex % 4 === 3
      ? { rest: true }
      : { programId: 'game', memberIds: ['suiji'] }),
  });

  for (const run of [specialist, balanced, recovery]) {
    assert.equal(run.rows.length, 12);
    assert.ok(run.rows.every((row) => Number.isInteger(row.fundsAfter) && row.fundsAfter >= 0));
    assert.ok(run.rows.every((row) => row.kind === 'rest' || Number.isInteger(row.quality)));
    assert.ok(run.state.history.every((row, index) => row.week === Math.floor(index / 3) + 1 && row.slot === (index % 3) + 1));
  }
  assert.ok(specialist.state.finale.score >= 45, `specialist score was ${specialist.state.finale.score}`);
  assert.ok(balanced.state.finale.score >= 45, `balanced score was ${balanced.state.finale.score}`);
  assert.ok(['spotlight', 'steady-debut', 'first-steps'].includes(recovery.state.finale.endingId));
});

test('all three finale endings are reachable and each accepts three unique listed programs', () => {
  const specialist = runCampaign({
    seed: 14,
    chooseSlot: () => ({ programId: 'talk', memberIds: ['huize'] }),
    upgrades: ['audio'],
  });
  const balancedCycle = ['game', 'talk', 'song', 'lesson', 'duo'];
  const balancedMembers = {
    game: ['suiji'], talk: ['huize'], song: ['kanban'], lesson: ['kanban'], duo: ['suiji', 'huize'],
  };
  const balanced = runCampaign({
    seed: 27,
    chooseSlot: (slotIndex) => {
      const programId = balancedCycle[slotIndex % balancedCycle.length];
      return { programId, memberIds: balancedMembers[programId] };
    },
    upgrades: ['audio', 'set', 'lighting'],
  });
  const resting = runCampaign({
    seed: 30,
    chooseSlot: () => ({ rest: true }),
    finalize: false,
  });
  assert.equal(specialist.state.finale.endingId, 'steady-debut');
  assert.equal(balanced.state.finale.endingId, 'spotlight');
  assert.equal(resting.state.phase, 'finale');
  assert.equal(PROGRAMS.length, 5);
  assert.throws(() => reduceGame(resting.state, {
    type: 'finale', actionId: 'duplicate-finale', programIds: ['game', 'game', 'song'],
  }), /three different programs/);
  assert.throws(() => reduceGame(resting.state, {
    type: 'finale', actionId: 'prototype-reference', programIds: ['constructor', 'game', 'song'],
  }), /three different programs/);
  assert.throws(() => createGame({ seed: 1, memberIds: ['toString', 'kanban', 'huize'] }), /unknown member/);
});

