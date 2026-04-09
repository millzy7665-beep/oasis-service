// OASIS Service and Repair — Service Worker for PWA
const CACHE_NAME = 'oasis-service-repair-v14';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.html?source=pwa-service-repair',
  '/?source=pwa-service-repair',
  '/?app=service-repair',
  '/styles.css?v=10',
  '/tech-catalog.js?v=1',
  '/app.js?v=18',
  '/manifest.json',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Jost:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)),
      self.skipWaiting()
    ])
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const requestUrl = new URL(request.url);
  const isLocalAsset = requestUrl.origin === self.location.origin;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        return (
          await caches.match(request, { ignoreSearch: true }) ||
          await caches.match('/index.html') ||
          await caches.match('/')
        );
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: isLocalAsset })
      .then(response => response || fetch(request).then(networkResponse => {
        if (request.method === 'GET' && isLocalAsset) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return networkResponse;
      }))
  );
});
