// Oasis Service App — Cache-First SW v186
const CACHE = 'oasis-v186';
const PRECACHE = [
  '/index.html',
  '/app.js?v=185',
  '/styles.css?v=185',
  '/manifest.json',
  '/oasis-logo.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Don't intercept CDN or external requests
  if (url.origin !== self.location.origin) return;

  // Versioned assets (app.js?v=, styles.css?v=) — pure cache-first
  if (url.search.startsWith('?v=')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }

  // index.html & other unversioned files — stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(resp => {
          if (resp.ok) cache.put(e.request, resp.clone());
          return resp;
        });
        return cached || networkFetch;
      })
    )
  );
});
