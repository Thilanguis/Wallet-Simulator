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
  // Firebase is the source of truth. Never operate on a cached/zero balance
  // before authentication and the confirmed server snapshot have arrived.
  WalletStore.setWritable(false);
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
