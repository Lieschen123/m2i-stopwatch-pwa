const CACHE_NAME = 'm2i-stopwatch-v1-20260630-botcopy';
const scopePath = new URL(self.registration.scope).pathname;
const scopedPath = (path) => `${scopePath}${path.replace(/^\/+/, '')}`;
const APP_SHELL = [scopePath, scopedPath('index.html'), scopedPath('manifest.webmanifest'), scopedPath('icon.svg')];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(scopedPath('index.html'))))
  );
});
