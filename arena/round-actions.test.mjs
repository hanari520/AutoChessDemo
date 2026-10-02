import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,act} from './core.mjs';
import {replayActions,restoreDraft,MAX_ROUND_ACTIONS} from './round-actions.mjs';

test('local intents replay exactly, including seeded refreshes, food, freezing and reordering',()=>{
 const base=createRun('round-log'),expected=structuredClone(base);
 const actions=[{type:'buy',slot:0,to:0},{type:'food',slot:0,to:0},{type:'freeze',zone:'shop',slot:1},{type:'roll'},{type:'move',from:0,to:4}];
 for(const a of actions)act(expected,a);
 assert.deepEqual(replayActions(base,actions),expected);assert.equal(base.gold,10);assert.equal(base.team[0],null);
 const draft={token:'player-a',ruleset:base.ruleset,revision:base.revision,actions};
 assert.deepEqual(restoreDraft(base,draft,'player-a'),expected);
 assert.equal(restoreDraft({...base,revision:1},draft,'player-a'),null);
 assert.equal(restoreDraft(base,draft,'player-b'),null);
 assert.equal(restoreDraft(base,{...draft,ruleset:'retired'},'player-a'),null);
});
test('invalid or oversized batches are atomic and client-supplied stats cannot create currency',()=>{
 const base=createRun('invalid-batch'),original=structuredClone(base);
 assert.throws(()=>replayActions(base,[{type:'buy',slot:0,to:0},...Array(20).fill({type:'roll'})]),/金币/);
 assert.deepEqual(base,original);
 const result=replayActions(base,[{type:'buy',slot:0,to:0,gold:999,atk:50,hp:50}]);assert.equal(result.gold,7);assert.notEqual(result.team[0].atk,50);
 for(const actions of [null,{},Array(MAX_ROUND_ACTIONS+1).fill({type:'roll'}),[null],[{type:'roll',extra:'x'.repeat(200)}]])assert.throws(()=>replayActions(base,actions));
});
