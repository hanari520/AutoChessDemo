/* 虚拟棋战 Service Worker：离线可玩；页面与托管策略走网络优先（保证更新），其余静态资源缓存优先 */
const CACHE = 'vcache-v8';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './tools/bot_strategy.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const isNav = e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html');
  // 托管策略文件：网络优先（策略常改，必须刷新即生效；离线才回退缓存）
  const isBot = e.request.url.includes('bot_strategy.js');
  if (isNav || isBot) { // 页面：网络优先，失败回退缓存（离线可玩，更新即时生效）
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(isBot ? e.request : './index.html', copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(isBot ? e.request : './index.html')));
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }))
  );
});
