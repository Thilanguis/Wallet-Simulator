'use strict';
window.storageFailure = function (error) {
  console.error(error);
  const banner = document.getElementById('storageWarning');
  if (banner) {
    banner.hidden = false;
    banner.textContent = 'Falha ao salvar neste navegador. Exporte um backup agora e mantenha esta página aberta. ' + error.message;
  }
};
try {
  window.WalletStore = Vault.wallet(localStorage, Finance.empty(), storageFailure);
  window.AppStorage = WalletStore.sim;
  if (/^[a-f0-9]{128}$/.test(localStorage.getItem('findom.cloud.pair.v3') || '')) WalletStore.setWritable(false);
} catch (error) {
  storageFailure(error);
  // Do not overwrite a corrupt primary copy with an empty state.
  throw error;
}
window.addEventListener('pagehide', () => AppStorage.flush());
window.addEventListener('storage', (event) => {
  if (event.key === 'findom.wallet.v2') {
    document.getElementById('storageWarning').hidden = false;
    document.getElementById('storageWarning').textContent = 'O simulador mudou em outra aba. Recarregue antes de continuar.';
    document.querySelectorAll('#simulator button, #simulator input, #simulator select').forEach((el) => (el.disabled = true));
  }
});
