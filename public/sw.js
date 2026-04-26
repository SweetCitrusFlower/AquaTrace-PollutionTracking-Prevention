// public/sw.js
// Minimal service worker for AquaTrace OS PWA.
// Strategy: network-first with cache fallback for offline shell.

const CACHE_NAME = 'aquatrace-v1';
const SHELL_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests; let POST/etc go straight to network.
  if (event.request.method !== 'GET') return;

  // Skip API routes — these should always be fresh.
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Clone response and put in cache
        const copy = res.clone();
        if (res.status === 200 && url.origin === self.location.origin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((c) => c || caches.match('/')))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || '/alerts';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) return client.navigate(target);
          return Promise.resolve();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
      return Promise.resolve();
    })
  );
});
