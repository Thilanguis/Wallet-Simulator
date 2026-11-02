/* Detect updates automatically; activation always preserves data and waits for consent. */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' });
      const local = ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port === '5501';
      if (local) {
        const accept = () => registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        accept();
        registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', accept));
        await registration.update();
        return;
      }
      const banner = document.getElementById('updateBanner');
      const label = document.getElementById('updateVersion');
      const progress = document.getElementById('updateProgress');
      const now = document.getElementById('updateNow');
      const later = document.getElementById('updateLater');
      let applying = false,
        offeredWorker = null,
        ready = false;
      const hadController = !!navigator.serviceWorker.controller;
      async function activate() {
        if (applying || !ready) return;
        try {
          applying = true;
          banner.hidden = false;
          now.disabled = true;
          later.disabled = true;
          progress.hidden = false;
          progress.value = 10;
          label.textContent = 'Salvando seus dados…';
          if (typeof syncTimer === 'function') syncTimer();
          if (typeof persistTimer === 'function') persistTimer();
          AppStorage.flush();
          progress.value = 50;
          label.textContent = 'Ativando a versão já baixada…';
          // Activation must not depend on animation frames: background tabs and
          // suspended mobile rendering can stop them indefinitely.
          if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          else {
            progress.value = 100;
            location.reload();
          }
        } catch (error) {
          applying = false;
          now.disabled = false;
          later.disabled = false;
          label.textContent = 'Não foi possível atualizar. Seus dados foram mantidos.';
          storageFailure(error);
        }
      }
      async function offer() {
        if (!registration.waiting || applying) return;
        ready = true;
        banner.hidden = false;
        progress.hidden = true;
        label.textContent = 'Nova versão pronta para instalar.';
        if (offeredWorker === registration.waiting) return;
        offeredWorker = registration.waiting;
        if (await AppDialog.confirm('Uma nova versão está pronta. Atualizar agora? Seus dados serão preservados.')) await activate();
      }
      later.onclick = () => {
        banner.hidden = true;
      };
      now.onclick = activate;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (applying) {
          progress.value = 100;
          label.textContent = 'Atualização concluída. Reabrindo…';
          location.reload();
        } else if (hadController) {
          ready = true;
          banner.hidden = false;
          label.textContent = 'Nova versão ativa. Atualize esta página para usar.';
        }
      });
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) void offer();
        });
      });
      await offer();
      let lastCheck = 0;
      async function check() {
        if (Date.now() - lastCheck < 60000) return;
        lastCheck = Date.now();
        try {
          await registration.update();
          await offer();
        } catch {
          /* Retry automatically when online again. */
        }
      }
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void check();
      });
      window.addEventListener('online', () => {
        lastCheck = 0;
        void check();
      });
      setInterval(check, 5 * 60 * 1000);
      void check();
    } catch (error) {
      console.warn('PWA indisponível:', error);
    }
  });
}
