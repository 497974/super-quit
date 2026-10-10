// 离线缓存：先用缓存秒开，同时后台拉新版本，下次打开生效
const CACHE = 'superquit-v1';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
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
  const update = caches.open(CACHE).then(c =>
    fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }));
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || update));
  e.waitUntil(update.catch(() => {}));
});
