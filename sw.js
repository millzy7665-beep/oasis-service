/* ============================================================
   OASIS Service — Service Worker
   Caches all app assets for full offline support
   ============================================================ */

const CACHE = 'oasis-service-v3';

const ASSETS = [
  '/',
  '/oasis-service/index.html',
  '/oasis-service/styles.css',
  '/oasis-service/app.js',
  '/oasis-service/manifest.json',
  '/oasis-service/oasis-logo.png',
  '/oasis-service/icon-192.png',
  '/oasis-service/icon-512.png',
  '/oasis-service/icon-180.png',
];

/* Install — cache everything */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

/* Activate — clean up old caches */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Fetch — serve from cache, fall back to network */
self.addEventListener('fetch', event => {
  /* Skip non-GET and chrome-extension requests */
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        /* Cache any new successful responses for same origin */
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        /* Offline fallback for navigation */
        if (event.request.mode === 'navigate') {
          return caches.match('/oasis-service/index.html');
        }
      });
    })
  );
});
