/* ===================================================================
   REGISTRO DO SERVICE WORKER PWA PRINCIPAL
   =================================================================== */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      // Arquivo REAL do service worker, na raiz
      .register('service-worker.js')
      .then((reg) => {
        console.log('ServiceWorker PWA registrado com sucesso:', reg.scope);
      })
      .catch((err) => {
        console.warn('Falha no registro do ServiceWorker PWA:', err);
      });
  });
}
