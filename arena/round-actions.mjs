import {act} from './core.mjs';

export const MAX_ROUND_ACTIONS=128;
// Replay intents against the server's state, never accept client stats or gold.
export function replayActions(base,actions=[]){
 if(!Array.isArray(actions)||actions.length>MAX_ROUND_ACTIONS)throw new Error('回合操作记录过多或格式无效');
 const next=structuredClone(base);
 for(const action of actions){
  if(!action||typeof action!=='object'||Array.isArray(action)||JSON.stringify(action).length>128)throw new Error('操作记录格式无效');
  act(next,action);
 }
 return next;
}
export function restoreDraft(base,draft,token){
 if(!draft||draft.token!==token||draft.ruleset!==base.ruleset||draft.revision!==base.revision)return null;
 return replayActions(base,draft.actions);
}
