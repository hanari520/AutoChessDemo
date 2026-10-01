/* Portrait presentation only: move existing controls, preserving their handlers. */
(() => {
  const query = matchMedia('(max-width: 600px) and (orientation: portrait)');
  const $ = id => document.getElementById(id);
  if (!$('shopbar') || !document.body.classList.contains('touch')) return;
  const controls = document.createElement('div');
  controls.id = 'portraitActions';
  controls.setAttribute('aria-label', '备战操作');
  const nodes = ['shop', 'refreshBtn', 'lvlBtn', 'fightBox', 'synCol'].map($);
  const homes = nodes.map(node => ({node, parent: node.parentNode, next: node.nextSibling}));
  const resources = document.createElement('p');
  resources.className = 'portrait-menu-resources';
  $('mMenuSec').prepend(resources);
  const summary = () => {
    // 经典有升星券标签，联机没有：缺失时只报连胜
    const tickets = $('ticketTag');
    const streak = $('streak');
    resources.textContent = tickets
      ? `连胜 / 连败：${streak.textContent} · 升星${tickets.textContent}`
      : `连胜 / 连败：${streak ? streak.textContent : 0}`;
  };
  new MutationObserver(summary).observe($('topbar'), {subtree:true, childList:true, characterData:true});
  summary();
  // closeDrawer 在经典是全局函数、在联机是模块作用域（由页面自行挂到 window）：两种都容错
  const closeSheet = () => {
    if (typeof window.closeDrawer === 'function') window.closeDrawer();
    else if (typeof closeDrawer === 'function') closeDrawer();
  };
  function layout() {
    if (query.matches) {
      $('shopbar').append(controls);
      $('shopbar').append($('shop'));
      controls.append($('refreshBtn'), $('lvlBtn'), $('fightBox'));
      // 羁绊常驻棋盘下方（经典 ≤880px 媒体块本就设计为 #synCol order:1 横排，此前被 JS 搬进抽屉而未生效）；
      // DOM 放到 main 末尾，与 order 的视觉顺序一致（tab/无障碍顺序不跳）
      const main = $('main');
      if (main) main.appendChild($('synCol'));
      $('mShopBtn').textContent = '调整';
      document.body.classList.add('portrait-play');
    } else {
      homes.forEach(({node, parent, next}) => parent.insertBefore(node, next?.parentNode === parent ? next : null));
      controls.remove();
      $('mShopBtn').textContent = '商店';
      document.body.classList.remove('portrait-play');
    }
    requestAnimationFrame(() => { if (typeof window.fitBoard === 'function') window.fitBoard(); else if (typeof fitBoard === 'function') fitBoard(); });
  }
  query.addEventListener('change', layout);
  $('mDrawer').addEventListener('click', event => {
    if (query.matches && event.target === $('mDrawer')) closeSheet();
  });
  addEventListener('keydown', event => {
    if (query.matches && event.key === 'Escape') closeSheet();
  });
  layout();
})();
