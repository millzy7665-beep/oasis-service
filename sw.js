// Oasis Service App — Cache-First SW v195
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAo3vP7Myf08Q8KqoFlcgGNOZp2mX2R-38',
  authDomain: 'oasis-service-app-69def.firebaseapp.com',
  projectId: 'oasis-service-app-69def',
  storageBucket: 'oasis-service-app-69def.firebasestorage.app',
  messagingSenderId: '156557428291',
  appId: '1:156557428291:web:243524f03403d05c65f6f6',
  measurementId: 'G-THQ9YGZ0B5'
});

const messaging = firebase.messaging();
const CACHE = 'oasis-v195';
const PRECACHE = [
  '/index.html',
  '/app.js?v=194',
  '/styles.css?v=194',
  '/manifest.json',
  '/oasis-logo.png',
];

messaging.onBackgroundMessage(payload => {
  const data = payload?.data || {};
  const title = payload?.notification?.title || data.title || 'New OASIS update';
  const body = payload?.notification?.body || data.body || data.message || 'You have a new update.';

  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data
  });
});

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
