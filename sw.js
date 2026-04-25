const CACHE_NAME = 'farmbot-v25-21-growth-home-resume-flow';
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/app.css",
  "./styles/mobile-foundation.css",
  "./styles/mobile-landscape.css",
  "./styles/cassettes.css",
  "./scripts/core/config.js",
  "./scripts/core/tutorial-data.js",
  "./scripts/core/canvas-utils.js",
  "./scripts/views/farm-map.js",
  "./scripts/views/left-pane.js",
  "./scripts/views/right-pane.js",
  "./scripts/views/mobile-shell.js",
  "./scripts/modules/training-basic/lesson-basic.js",
  "./scripts/modules/growth-mode/growth-mode.js",
  "./scripts/modules/mode-cassettes.js",
  "./scripts/app.js",
  "./scripts/pwa-install.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/leaf_texture.png",
  "./assets/leaf_sprite_1.png",
  "./assets/leaf_sprite_2.png",
  "./assets/leaf_sprite_3.png",
  "./assets/leaf_sprite_4.png"
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
    fetch(event.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return resp;
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
