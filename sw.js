/* 虚拟棋战 Service Worker：离线可玩；页面与托管策略走网络优先（保证更新），其余同源静态资源缓存优先 */
const CACHE = 'vcache-v59-challenge-curses';
const INDEX_ASSET = './index.html?v=59';
const ASSETS = ['./tools/daily-curses.js?v=3', './', INDEX_ASSET, './manifest.json', './icon-192.png', './icon-512.png', './assets/redraw_manifest.json', './assets/skill_signature_manifest.json', './assets/syn/synergy-atlas.png', './assets/fx/v3-blade.png', './assets/fx/v3-arc.png', './assets/fx/v3-ward.png', './assets/fx/v3-void.png', './assets/ui/star-stage-icon.svg', './tools/bot_strategy.js?v=9', './tools/idol-ui.css?v=2', './tools/idol-ui.js?v=1', './tools/idol-redesign.css?v=11', './tools/idol-ui-redesign.js?v=5', './tools/mobile-stage.css?v=2', './tools/idol-dark.css?v=4', './assets/ui/idol-sky-stage.png', './assets/ui/idol-arena-v2.png', './assets/ui/idol-arena-night.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  /* 跨域请求（排行榜接口）不进 SW 缓存，交给浏览器默认处理：
     ① 榜单数据必须实时，缓存优先会让成绩永远停在第一次打开时的样子；
     ② 缓存查询若忽略 query（ignoreSearch），/api/top?board=daily 与 ?board=normal
        会折叠成同一条缓存 —— 表现为两个榜显示同一份数据（每日榜把普通榜覆盖掉）。 */
  if (new URL(e.request.url).origin !== self.location.origin) return;
  const isNav = e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html');
  // 托管策略文件：网络优先（策略常改，必须刷新即生效；离线才回退缓存）
  const isBot = e.request.url.includes('bot_strategy.js');
  if (isNav || isBot) { // 页面：网络优先，失败回退缓存（离线可玩，更新即时生效）
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(isBot ? e.request : INDEX_ASSET, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(isBot ? e.request : INDEX_ASSET)));
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
