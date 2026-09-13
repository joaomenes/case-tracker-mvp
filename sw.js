/**
 * Service Worker do Case Tracker.
 *
 * Estratégia: network-first para HTML/CSS/JS e cache-first para assets estáticos.
 * Rotas internas iniciadas por `/__` nunca são interceptadas pelo cache.
 */

const CACHE_NAME = 'acompanhamento-cases-v1-9-0-rc4-8';
const STATIC_ASSETS = [
  './index.html',
  './styles-v1.9.0-RC4.8.css',
  './theme-init.js',
  './manifest.webmanifest',
  './src/app.js',
  './src/attachments.js',
  './src/backup.js',
  './src/constants.js',
  './src/db.js',
  './src/domain.js',
  './src/notifications.js',
  './src/time.js',
  './src/validation.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/__')) return;

  const core = event.request.mode === 'navigate' || /\.(?:js|css|html)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (core) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response?.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response?.ok && response.type === 'basic') caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    })),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? './', self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === new URL(target).origin && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    }),
  );
});
