/* Portrait presentation only: move existing controls, preserving their handlers. */
(() => {
  const query = matchMedia('(max-width: 600px) and (orientation: portrait)');
  const $ = id => document.getElementById(id);
  if (!$('shopbar') || !document.body.classList.contains('touch')) return;
  const controls = document.createElement('div');
  controls.id = 'portraitActions';
  controls.setAttribute('aria-label', '备战操作');
  const nodes = ['shop', 'refreshBtn', 'lvlBtn', 'fightBox'].map($);
  const homes = nodes.map(node => ({node, parent: node.parentNode, next: node.nextSibling}));
  const resources = document.createElement('p');
  resources.className = 'portrait-menu-resources';
  $('mMenuSec').prepend(resources);
  const summary = () => { resources.textContent = `连胜 / 连败：${$('streak').textContent} · 升星${$('ticketTag').textContent}`; };
  new MutationObserver(summary).observe($('topbar'), {subtree:true, childList:true, characterData:true});
  summary();
  function layout() {
    if (query.matches) {
      $('shopbar').append(controls);
      $('shopbar').append($('shop'));
      controls.append($('refreshBtn'), $('lvlBtn'), $('fightBox'));
      $('mShopBtn').textContent = '调整';
      document.body.classList.add('portrait-play');
    } else {
      homes.forEach(({node, parent, next}) => parent.insertBefore(node, next?.parentNode === parent ? next : null));
      controls.remove();
      $('mShopBtn').textContent = '商店';
      document.body.classList.remove('portrait-play');
    }
    requestAnimationFrame(() => { if (typeof fitBoard === 'function') fitBoard(); });
  }
  query.addEventListener('change', layout);
  $('mDrawer').addEventListener('click', event => {
    if (query.matches && event.target === $('mDrawer')) closeDrawer();
  });
  addEventListener('keydown', event => {
    if (query.matches && event.key === 'Escape') closeDrawer();
  });
  layout();
})();
