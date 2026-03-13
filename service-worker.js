
const CACHE_NAME = 'reselogger-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for map tiles
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith((async () => {
      try {
        const net = await fetch(event.request);
        const cache = await caches.open('tiles');
        cache.put(event.request, net.clone());
        return net;
      } catch (e) {
        const match = await caches.match(event.request);
        return match || Response.error();
      }
    })());
    return;
  }

  // Cache-first for app shell
  event.respondWith(caches.match(event.request).then((resp) => resp || fetch(event.request)));
});
