const VERSION = '__BUILD_VERSION__';
const PREFIX = 'findom-wallet-' + new URL(self.registration.scope).pathname + '-';
const CACHE = PREFIX + VERSION;
const ASSETS = /*__PRECACHE__*/ [];
const VENDOR = new URL('vendor/', self.registration.scope).href;
// Live Server serves editable source files. Avoid stale caches during local review.
const LIVE_SERVER = ['127.0.0.1', 'localhost'].includes(self.location.hostname) && self.location.port === '5501';
self.addEventListener('install', (event) => {
  if (LIVE_SERVER) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS.map((path) => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
    })(),
  );
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'VERSION') event.ports[0]?.postMessage(VERSION);
});
self.addEventListener('activate', (event) => {
  if (LIVE_SERVER) {
    event.waitUntil(self.clients.claim());
    return;
  }
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      for (const name of names) {
        if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
        else if (name.startsWith('simulador-cache-')) {
          const old = await caches.open(name);
          if (await old.match(new URL('index.html', self.registration.scope))) await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  if (LIVE_SERVER) return;
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (!event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const shell = await cache.match(new URL('index.html', self.registration.scope));
        if (shell) return shell;
      }
      const response = await fetch(event.request);
      // OCR libraries and language models are large. Cache them when used,
      // without holding an app update open for their download.
      if (event.request.url.startsWith(VENDOR) && response.status === 200 && !event.request.headers.has('Range')) {
        event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
      }
      return response;
    })(),
  );
});
