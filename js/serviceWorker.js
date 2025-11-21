/* ===================================================================
   SERVICE WORKER (PWA)
   =================================================================== */
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((reg) => console.log('ServiceWorker registrado:', reg.scope))
    .catch((err) => console.warn('Falha no registro do ServiceWorker:', err));
}
