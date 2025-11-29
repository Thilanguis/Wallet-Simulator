// Sempre que mudar JS/CSS/HTML, sobe o número aqui:
const CACHE_NAME = 'simulador-cache-30';

const urlsToCache = [
  '.',
  'index.html',

  // CSS
  'css/app.css',
  'css/bonusAtivoGPT.css',
  'css/luzLateral.css',

  // Firebase / Firestore
  'dbFirebase/firebaseConfiguration.js',
  'dbFirebase/firestoreAppState.js',
  'dbFirebase/dbWallet.js',

  // JS
  'js/appMain.js',
  'js/utils.js',
  'js/timer.js',
  'js/storage.js',
  'js/bonusEspecial.js',
  'js/ganhoFixo.js',
  'js/tarefasPendentes.js',
  'js/chovendoGrana.js',
  'js/efeitoBonusAtivoCompraServico.js',
  'js/efeitoBonusAtivoGanhoCredito.js',
  'js/luzLateral.js',
  'js/splashAmimacao.js',
  'js/roleta.js',

  // PWA
  'manifest.json',
  'icon-192.png',
  'icon-512.jpg',
];

// INSTALL: pré-cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(urlsToCache);
      await self.skipWaiting();
    })()
  );
});

// ACTIVATE: limpa caches antigos e assume controle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

// FETCH: responde do cache, senão rede
self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
