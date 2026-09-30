const $=id=>document.getElementById(id);
let drawerItem=null;

export function closeMatchPanel() { $('matchPanelDialog')?.close(); }
export function openMatchPanel(name) {
  if(innerWidth>880)return;
  const item=document.querySelector({details:'.inspect-panel',bonds:'.bonds-panel',equipment:'.inventory-panel',report:'.war-report-panel'}[name]);
  if(!item)return;
  closeMatchPanel();
  drawerItem={item,parent:item.parentElement,next:item.nextSibling};
  $('matchPanelBody').append(item);
  $('matchPanelTitle').textContent={details:'棋子详情',bonds:'阵容羁绊',equipment:'装备',report:'战报'}[name];
  $('matchPanelDialog').showModal();
}

export function mountClassicMatchLayout() {
  const game=$('gameSection'),center=game.querySelector('.game-center'),side=game.querySelector('.game-side');
  const stage=document.createElement('div');stage.className='match-stage';
  const left=document.createElement('aside');left.className='game-left';
  const bonds=side.querySelector('.bonds-panel'),inspect=side.querySelector('.inspect-panel');
  const opponent=document.createElement('div');opponent.className='opponent-panel';
  opponent.append($('pairingText'));bonds.insertBefore(opponent,$('bondList'));
  left.append(inspect,bonds);
  center.prepend(game.querySelector('.scoreboard-panel'));
  const stats=document.createElement('section');stats.className='panel battle-stats-panel';
  stats.innerHTML='<div class="section-heading"><h2>战斗统计</h2></div>';
  const damage=$('battleDamage'),damageWrapper=damage.parentElement;
  stats.append(damage);damageWrapper.remove();
  const report=document.createElement('section');report.className='panel war-report-panel';
  report.innerHTML='<div class="section-heading"><h2>战报</h2></div><div id="battleLog" class="battle-log"></div>';
  report.insertBefore($('battleFeed'),$('battleLog'));
  const results=side.querySelector('.results-panel');report.querySelector('.section-heading').append($('resultCaption'));report.append($('resultsList'));results.remove();
  side.prepend(stats);side.append(report);
  stage.append(left,center,side);
  game.prepend(stage);
  const shop=game.querySelector('.shop-panel'),player=document.createElement('div');player.className='shop-player-panel';
  player.append(game.querySelector('.level-progress'),$('buyXpBtn'),$('selectionBar'));
  const controls=document.createElement('div');controls.className='classic-controls';
  controls.innerHTML='<button id="autoDeployBtn" class="button" title="择优上阵，保留已上阵棋子的站位（R/A）">一键上阵 (R)</button><button id="tidyBenchBtn" class="button" title="同名聚拢，空位放到最后（T）">整理 (T)</button><button id="lockShopBtn" class="button" title="保留商店到下一回合（L）">锁商店 (L)</button><details class="hotkey-help"><summary class="button">快捷键</summary><p>R/A 上阵 · T 整理 · D 刷新 · F 买经验 · L 锁商店 · E/X/Delete 出售所选棋子 · 空格锁定阵容。右键棋子卸下装备。</p></details>';
  player.insertBefore(controls,$('selectionBar'));
  player.querySelector('.level-progress').insertAdjacentHTML('beforeend','<div id="economyInfo" class="economy-info"></div><div id="shopOdds" class="shop-odds" title="当前等级的商店费用概率"></div>');
  const gear=side.querySelector('.inventory-panel');
  gear.querySelector('.section-heading').insertAdjacentHTML('afterend','<div class="equipment-controls"><button id="autoEquipBtn" class="button" title="先合成，再分配输出与防御装备，每枚最多三件">一键装备</button><button id="unequipBtn" class="button" title="卸下所选棋子的全部装备">卸下装备</button><button id="combineWornBtn" class="button" title="合成所选棋子的前两件基础装备">就地合成</button></div>');
  gear.querySelector('.section-heading>span').textContent='穿戴 · 合成';
  gear.insertAdjacentHTML('beforeend','<details class="equipment-workshop"><summary>装备合成</summary><div id="equipmentRecipes"></div></details>');
  shop.querySelector('.section-heading').remove();shop.prepend(player);
  const round=game.querySelector('.round-panel');
  document.querySelector('.topbar').insertBefore(round,document.querySelector('.topbar-actions'));
  const tabs=document.createElement('nav');tabs.className='mobile-panel-tabs';tabs.setAttribute('aria-label','对局面板');
  tabs.innerHTML='<button class="button" data-panel="bonds">羁绊</button><button class="button" data-panel="equipment">装备</button><button class="button" data-panel="details">详情</button><button class="button" data-panel="report">战报</button>';
  shop.append(tabs);
  const dialog=document.createElement('dialog');dialog.id='matchPanelDialog';dialog.className='match-panel-dialog';
  dialog.innerHTML='<header><strong id="matchPanelTitle"></strong><button id="matchPanelClose" class="button" type="button">✕ 收起</button></header><div id="matchPanelBody"></div>';
  document.body.append(dialog);
  dialog.addEventListener('close',()=>{
    if(!dialog.open&&drawerItem){const {item,parent,next}=drawerItem;parent.insertBefore(item,next?.parentElement===parent?next:null);drawerItem=null;}
  });
  // Native close events are queued. Restore immediately before switching sheets.
  const originalClose=dialog.close.bind(dialog);
  dialog.close=()=>{if(drawerItem){const {item,parent,next}=drawerItem;parent.insertBefore(item,next?.parentElement===parent?next:null);drawerItem=null;}originalClose();};
  $('matchPanelClose').addEventListener('click',closeMatchPanel);
  tabs.addEventListener('click',event=>{const button=event.target.closest('[data-panel]');if(button)openMatchPanel(button.dataset.panel);});
  addEventListener('resize',()=>{if(innerWidth>880)closeMatchPanel();});
  const menu=document.createElement('details');menu.className='game-room-menu';
  menu.innerHTML='<summary class="button">菜单</summary><div><strong></strong><button id="sfxBtn" class="button" type="button">音效</button><button id="matchHelpBtn" class="button" type="button">操作说明</button><button class="button" data-room-copy>复制邀请</button><button class="button" data-room-leave>返回入口</button><details class="mobile-tools"><summary class="button">阵容工具</summary></details></div>';
  document.querySelector('.topbar-actions').prepend(menu);
  const mobileTools=menu.querySelector('.mobile-tools');
  const syncMobileLayout=()=>{
    const portraitPhone=matchMedia('(max-width:600px) and (orientation:portrait)').matches;
    if(portraitPhone){
      if(controls.parentElement!==mobileTools)mobileTools.append(controls);
      if(opponent.parentElement!==center)center.insertBefore(opponent,center.querySelector('.combat-panel')||center.querySelector('.arena-panel'));
    }else{
      if(controls.parentElement!==player)player.insertBefore(controls,$('selectionBar'));
      if(opponent.parentElement!==bonds)bonds.insertBefore(opponent,$('bondList'));
      mobileTools.open=false;
    }
  };
  syncMobileLayout();
  addEventListener('resize',syncMobileLayout);
  const help=document.createElement('dialog');help.id='matchHelpDialog';help.className='match-panel-dialog';
  help.innerHTML='<header><strong>操作说明</strong><button class="button" type="button">✕ 收起</button></header><div class="match-help"><p>购买棋子后可拖动到棋盘下半区；棋子之间可交换位置。点击棋子查看属性、技能、装备与战斗统计。</p><p>R / A 一键上阵 · T 整理备战席 · D 刷新 · F 买经验 · L 锁商店 · E / X / Delete 出售所选棋子 · 空格锁定阵容。</p><p>点击装备后给所选棋子穿戴，也可拖到棋子上；右键棋子卸装。两件基础装备可合成，一键装备会优先合成并分配。</p><p>手机可长按拖拽，通过底部面板查看羁绊、详情、装备和战报。点击八人血条可查看其他玩家，点击自己的血条返回。</p><p>音效和浅深色模式与经典模式共用偏好。锁定阵容后等待所有玩家准备或房间倒计时结束。</p></div>';
  document.body.append(help);help.querySelector('button').onclick=()=>help.close();$('matchHelpBtn').onclick=()=>{menu.open=false;help.showModal();};
  menu.addEventListener('toggle',()=>{menu.querySelector('strong').textContent=`房间 ${$('roomCode').textContent}`;});
  menu.querySelector('[data-room-copy]').onclick=()=>{$('copyInviteBtn').click();menu.open=false;};
  menu.querySelector('[data-room-leave]').onclick=()=>{$('leaveBtn').click();menu.open=false;};
}
