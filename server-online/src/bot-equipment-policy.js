/* Shared preparation policy. Adapters provide star-scaled combat stats and
 * execute legal actions; this module has no RNG, DOM or game-state writes. */
(function(root){
  'use strict';
  function score(unit,role){
    const front=['守护','刀客','狂战'].includes(unit.job);
    if(role==='guard')return unit.hp*(front?1.6:.5)+unit.atk*.2;
    if(role==='magic')return unit.atk*(unit.passive ? .25 : 2)*(unit.job==='守护'?.5:1)+unit.skillScale*8;
    return unit.atk*unit.speed*(unit.damageType==='phys'?1.4:.8)*(unit.job==='守护'?.6:1);
  }
  const policy=Object.freeze({score});
  root.BotEquipmentPolicy=policy;
  if(typeof module==='object'&&module.exports)module.exports=policy;
})(typeof globalThis!=='undefined'?globalThis:this);
