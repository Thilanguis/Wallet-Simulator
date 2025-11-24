// service-worker.js
// Sempre que mudar JS/CSS/HTML, sobe o número aqui:
const CACHE_NAME = 'simulador-cache-24';

const urlsToCache = [
  '.',
  'index.html',

  // --- CSS ---
  'css/app.css',
  'css/bonusAtivoGPT.css',
  'css/bonusAtivoGPTold.css',
  'css/luzLateral.css',

  // --- Firebase / Firestore ---
  'dbFirebase/firebaseConfiguration.js',
  'dbFirebase/firestoreAppState.js',
  'dbFirebase/firebaseStorageBridge.js',
  'dbFirebase/dbWallet.js',

  // --- JS principal ---
  'js/appMain.js',
  'js/utils.js',
  'js/timer.js',
  'js/storage.js', // legado (ok manter por enquanto)
  'js/app.js', // se estiver sendo usado no index.html

  // --- Efeitos / bônus / tarefas ---
  'js/bonusEspecial.js',
  'js/ganhoFixo.js',
  'js/tarefasPendentes.js',
  'js/chovendoGrana.js',
  'js/efeitoBonusAtivoCompraServico.js',
  'js/efeitoBonusAtivoGanhoCredito.js',
  'js/luzLateral.js',
  'js/splashAmimacao.js',
  'js/roleta.js',
  'js/serviceWorker.js', // script de registro do SW (se existir)

  // --- PWA / ícones ---
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
