// 离线缓存：有网时先拿最新版（最多等 3 秒），网慢或没网就用缓存，保证随时能打开
const CACHE = 'superquit-v2';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const fromNet = fetch(req, { cache: 'no-cache' }).then(async res => {
    if (res.ok) await (await caches.open(CACHE)).put(req, res.clone());
    return res;
  });
  const fromCache = () => caches.match(req, { ignoreSearch: true });
  const slow = new Promise(resolve => setTimeout(resolve, 3000));
  e.respondWith(
    Promise.race([fromNet, slow])
      .then(res => res || fromCache().then(hit => hit || fromNet))
      .catch(() => fromCache().then(hit => hit || Response.error()))
  );
  e.waitUntil(fromNet.catch(() => {}));
});
