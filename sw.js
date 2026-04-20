const CACHE_NAME = 'farmbot-pwa-v1';
const ASSETS = [
  "./OPEN_HTML.bat",
  "./README.txt",
  "./README_REBUILD.txt",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/leaf_sprite_1.png",
  "./assets/leaf_sprite_2.png",
  "./assets/leaf_sprite_3.png",
  "./assets/leaf_sprite_4.png",
  "./assets/leaf_texture.png",
  "./index.html",
  "./manifest.webmanifest",
  "./scripts/app.js",
  "./scripts/app.js.bak",
  "./scripts/core/canvas-utils.js",
  "./scripts/core/config.js",
  "./scripts/core/tutorial-data.js",
  "./scripts/views/farm-map.js",
  "./scripts/views/left-pane.js",
  "./scripts/views/right-pane.js",
  "./server.ps1",
  "./start.bat",
  "./stop.bat",
  "./styles/app.css",
  "./styles/app.css.bak",
  "./styles/mobile-foundation.css"
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
