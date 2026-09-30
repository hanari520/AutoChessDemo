// Common classic preparation rules. Challenge modifiers stay in the solo mode.
export const MAX_LEVEL = 11;
export const XP_NEED = {1:1,2:1,3:3,4:4,5:8,6:32,7:48,8:56,9:64,10:72};
export const SHOP_ODDS = {1:[100,0,0,0,0],2:[70,30,0,0,0],3:[60,35,5,0,0],4:[50,35,15,0,0],5:[40,35,23,2,0],6:[33,30,30,7,0],7:[30,30,28,10,2],8:[23,29,28,16,4],9:[18,26,27,22,7],10:[15,22,25,27,11],11:[10,18,24,32,16]};
export const xpNeeded = level => XP_NEED[level] || Infinity;
export const interestGain = gold => Math.min(3,Math.floor(gold/10));
export const streakGain = streak => Math.abs(streak)>=7?4:Math.abs(streak)>=5?3:Math.abs(streak)>=3?2:0;
export const sellRefund = unit => unit.cost*3**(unit.star-1)-(unit.star-1);
