/* ============================================================
   OASIS Service — Service Worker  (network-first, always fresh)
   ============================================================ */

const CACHE = 'oasis-service-v6';

/* Install — skip waiting immediately so new SW takes over at once */
self.addEventListener('install', event => {
  self.skipWaiting();
});

/* Activate — delete ALL old caches, claim all clients immediately */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        /* Tell every open tab to reload so they get the fresh version */
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.navigate(client.url));
        });
      })
  );
});

/* Fetch — NETWORK FIRST, cache only as fallback for offline */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        /* Store a fresh copy in cache for offline use */
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
