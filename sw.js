/* 虚拟棋战 Service Worker：离线可玩；页面与托管策略走网络优先（保证更新），其余同源静态资源缓存优先 */
const CACHE = 'vcache-v137-zone-cleanup';
const INDEX_ASSET = './index.html?v=106';
const ONLINE_ASSET = './online.html?v=25';
const ASSETS = ['./tools/preparation-presentation.js?v=1','./tools/preparation-presentation.css?v=1','./online/economy.js', './online/skill-catalog.js', './tools/battle-audio.js?v=1', './tools/battle-audio.js', './tools/bond-runtime.js', ONLINE_ASSET, './online/client.css?v=18', './online/classic-ui.css?v=2', './online/classic-online.css?v=3', './online/client.js?v=29', './online/codex.js?v=2', './online/connection.js', './online/skill-names.js', './online/equipment.js', './online/theme.js?v=1', './online/theme.css?v=3', './tools/battle-hud.css?v=1', './online/battle-effects.js?v=1', './tools/battle-presentation.js?v=1', './tools/battle-presentation.css?v=4', './tools/daily-curses.js?v=4', './tools/bond-runtime.js?v=1', './tools/narrative-tour.js?v=1', './tools/narrative-bar.js?v=1', './tools/narrative-bar.css?v=2', './tools/solo-ui.css?v=3', './tools/solo-modes.js?v=4', './tools/campaign-map.js?v=2', './tools/solo-ui.js?v=4', './tools/solo-host.js?v=6', './', INDEX_ASSET, './manifest.json', './icon-192.png', './icon-512.png', './assets/redraw_manifest.json', './assets/skill_signature_manifest.json', './assets/syn/synergy-atlas.png', './assets/fx/v3-blade.png', './assets/fx/v3-arc.png', './assets/fx/v3-ward.png', './assets/fx/v3-void.png', './assets/fx/skill-skate-trail.png', './assets/ui/star-stage-icon.svg', './tools/bot-equipment-policy.js?v=1', './tools/bot-planner.js?v=1', './tools/bot_strategy.js?v=11', './tools/idol-ui.css?v=2', './tools/idol-ui.js?v=1', './tools/idol-redesign.css?v=12', './tools/idol-ui-redesign.js?v=5', './tools/mobile-stage.css?v=2', './tools/idol-dark.css?v=5', './tools/stage-themes.css?v=2', './assets/ui/idol-sky-stage.png', './assets/ui/idol-arena-v2.png', './assets/ui/idol-arena-night.png'];
ASSETS.push('./tools/portrait-ui.css?v=5', './tools/portrait-ui.js?v=3');
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(ASSETS);
    /* 2026-09-29：wav 音频库已停用（SFX_WAV_BANK=false，合成音效已统一为纯 sine 普通提示音），
       不再预缓存对应 wav 目录；素材保留在仓库，改回开关后按需懒加载即可。 */
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // The arena preview manages its own recovery. Do not cache it under the classic entry.
  const arenaPath = new URL(e.request.url).pathname;
  if (arenaPath.endsWith('/arena.html') || arenaPath.startsWith('/arena/') || arenaPath.startsWith('/api/arena/')) return;
  /* 跨域请求（排行榜接口）不进 SW 缓存，交给浏览器默认处理：
     ① 榜单数据必须实时，缓存优先会让成绩永远停在第一次打开时的样子；
     ② 缓存查询若忽略 query（ignoreSearch），/api/top?board=daily 与 ?board=normal
        会折叠成同一条缓存 —— 表现为两个榜显示同一份数据（每日榜把普通榜覆盖掉）。 */
  if (new URL(e.request.url).origin !== self.location.origin) return;
  const isNav = e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html');
  // 托管策略文件：网络优先（策略常改，必须刷新即生效；离线才回退缓存）
  const isBot = e.request.url.includes('bot-planner.js') || e.request.url.includes('bot_strategy.js') || e.request.url.includes('bot-equipment-policy.js');
  if (isNav || isBot) { // 页面：网络优先，失败回退缓存（离线可玩，更新即时生效）
    const fallback = new URL(e.request.url).pathname.endsWith('/online.html') ? ONLINE_ASSET : INDEX_ASSET;
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(isBot ? e.request : fallback, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(isBot ? e.request : fallback)));
    return;
  }
  // 同源静态资源：缓存优先，按完整 URL 匹配（含 query）——不再用 ignoreSearch，避免不同参数互相覆盖
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }))
  );
});
