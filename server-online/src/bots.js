/* Eight-player bots share the tested classic planner through legal online actions. */
import { createOnlineBot } from './bot-adapter.js';

export const BOT_NAMES = ['阿铁', '阿芯', '啾啾', '蛋黄', '咕咕', '海胆', '金宝', '噜噜', '麻薯', '年糕', '泡芙', '肉丸'];

export function pickBotName(takenNames = []) {
  const taken = new Set(takenNames);
  for (const name of BOT_NAMES) if (!taken.has(name)) return name;
  for (let suffix = 2; suffix < 100; suffix++) {
    for (const name of BOT_NAMES) {
      const candidate = `${name}${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
  return '机器人';
}


export function botPolicy(game, seatIndex) {
  if(!game||game.version!==1||game.complete||game.phase!=='prep'||game.autoLocked)return;
  const seat=game.seats[seatIndex];
  if(!seat||!seat.alive||seat.ready)return;
  const bot=createOnlineBot(game,seatIndex);
  try{
    bot.pickOpening();
    bot.deploy();
    bot.planner.botPrep();
  }finally{bot.finish();}
}
