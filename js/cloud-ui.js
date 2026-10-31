'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const codeKey = 'findom.cloud.pair.v3',
    recoveryKey = 'findom.cloud.before.v3';
  let engine = null,
    code = localStorage.getItem(codeKey),
    mode = 'local',
    connecting = false;
  const tabKey = 'findom.cloud.tab.v3';
  const tabId = (performance.getEntriesByType('navigation')[0]?.type === 'reload' && sessionStorage.getItem(tabKey)) || crypto.randomUUID();
  sessionStorage.setItem(tabKey, tabId);
  function preserve(wallet) {
    // Preserve the first local ledger rather than rotating it on every remote snapshot.
    if (!localStorage.getItem(recoveryKey)) localStorage.setItem(recoveryKey, JSON.stringify(wallet));
    else if (engine?.state().pending) localStorage.setItem('findom.cloud.unsent.v3', JSON.stringify(wallet));
    $('exportCloudRecovery').hidden = false;
  }
  function validate(wallet) {
    Finance.validateState(wallet.finance);
    const sim = wallet.simulator;
    if (!sim || Array.isArray(sim) || Object.entries(sim).some(([key, value]) => !Vault.keys.includes(key) || typeof value !== 'string')) throw new Error('Estado compartilhado inválido.');
    if (!Number.isFinite(Number(sim.saldoDominadora || 0))) throw new Error('Saldo compartilhado inválido.');
    for (const key of ['historico', 'archivedHistory', 'tarefasPendentes', 'tarefasBloqueadas', 'accelBoosts', 'rouletteAwards']) {
      if (!Array.isArray(JSON.parse(sim[key] || '[]'))) throw new Error('Lista compartilhada inválida: ' + key);
    }
    const settings = sim.economy ? JSON.parse(sim.economy) : Economy.defaults();
    if (sim.economyCatalog) EconomyCatalog.prepare(JSON.parse(sim.economyCatalog), settings);
    else Economy.validate(settings);
    if (sim.bonusEspecialAtivo && typeof JSON.parse(sim.bonusEspecialAtivo) !== 'boolean') throw new Error('Bônus compartilhado inválido.');
    if (sim.timerSession) {
      const timer = JSON.parse(sim.timerSession);
      if (![timer.seconds, timer.earnedUnits, timer.rate, timer.tasks].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Sessão compartilhada inválida.');
      if (timer.dynamicActivities && (!Array.isArray(timer.dynamicActivities) || timer.dynamicActivities.some((value) => typeof value !== 'string'))) throw new Error('Combo compartilhado inválido.');
    }
  }
  function errorText(error) {
    if (error?.code === 'auth/operation-not-allowed' || error?.code === 'auth/admin-restricted-operation') return 'Ative o provedor Anônimo em Firebase → Authentication → Método de login. Não haverá tela de login.';
    if (error?.code === 'permission-denied') return 'O Firebase recusou a conexão. Confira as regras em docs/FIREBASE-LOCAL.md; os dados locais foram preservados.';
    return error?.message || 'Não foi possível conectar ao Firebase. Seus dados continuam neste navegador.';
  }
  function state(next) {
    const wasControlling = mode === 'controlling';
    if ((mode === 'local' || wasControlling) && !['local', 'controlling'].includes(next.mode)) {
      document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close('cancel'));
    }
    mode = next.mode;
    const descriptions = {
      local: 'Este navegador ainda usa uma carteira local.',
      connecting: 'Conectando à carteira compartilhada…',
      receiving: 'Recebendo a carteira compartilhada…',
      ready: 'Carteira ainda não criada no Firebase.',
      controlling: next.pending ? 'Salvo neste aparelho · enviando ao Firebase…' : 'Sincronizado · controle neste aparelho',
      watching: next.error ? next.error.message : 'Acompanhando a carteira · controle no outro aparelho',
      error: errorText(next.error),
    };
    const message = descriptions[mode];
    $('cloudStatusText').textContent = message;
    $('cloudSettingsStatus').textContent = message;
    $('cloudStatusBar').hidden = mode === 'local';
    $('cloudStatusBar').classList.toggle('is-error', mode === 'error');
    $('cloudControl').hidden = !['controlling', 'watching'].includes(mode);
    $('cloudControl').textContent = mode === 'controlling' ? 'Liberar controle' : 'Assumir controle';
    $('reconnectCloud').hidden = !code || mode !== 'error';
    $('createSharedWallet').hidden = !!code;
    $('showPairCode').hidden = !code;
    $('disconnectCloud').hidden = !code;
    document.body.classList.toggle('cloud-readonly', !WalletStore.isWritable());
    window.dispatchEvent(new Event('cloud:state'));
    if (mode === 'controlling' && !wasControlling) window.dispatchEvent(new Event('wallet:control'));
  }
  async function connect(nextCode, create = false) {
    if (connecting) return;
    connecting = true;
    try {
      if (!WalletCipher.valid(nextCode)) throw new Error('Cole o código completo de vínculo do outro aparelho.');
      freezeWalletTimer();
      AppStorage.flush();
      preserve(WalletStore.snapshot());
      engine?.stop();
      WalletStore.setWritable(false);
      state({ mode: 'connecting' });
      const { createFirebaseTransport } = await import('./firebase-transport.js');
      let timeout;
      let transport;
      try {
        transport = await Promise.race([
          createFirebaseTransport(nextCode),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('O Firebase não respondeu. Confira a conexão e tente novamente.')), 12000);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
      let initialize = create;
      engine = WalletCloud.create({
        store: WalletStore,
        transport,
        id: transport.uid + '.' + tabId,
        validate,
        backup: preserve,
        onFreeze: () => freezeWalletTimer(),
        onRemote: (detail) => window.dispatchEvent(new CustomEvent('wallet:remote', { detail })),
        onState(next) {
          state(next);
          if (next.mode === 'ready' && initialize) {
            initialize = false;
            queueMicrotask(() => engine.takeControl());
          } else if (next.mode === 'ready') state({ mode: 'error', error: new Error('Não existe carteira para este código. Confira o vínculo no primeiro aparelho.') });
        },
      });
      code = nextCode;
      localStorage.setItem(codeKey, code);
      $('cloudPairCode').value = '';
      window.SharedWallet = engine;
      engine.connect();
    } catch (error) {
      // A failed first connection leaves local use available. Existing paired wallets
      // remain read-only to avoid a divergent offline ledger overwriting the server.
      WalletStore.setWritable(!code);
      state({ mode: 'error', error });
    } finally {
      connecting = false;
    }
  }
  $('createSharedWallet').onclick = async () => {
    if (!(await AppDialog.confirm('Enviar esta carteira ao seu Firebase? Saldo, histórico, tarefas, roleta, configurações e notas reais serão compartilhados. Uma cópia local será preservada.'))) return;
    await connect(WalletCipher.create(), true);
  };
  $('joinSharedWallet').onclick = async () => {
    const next = $('cloudPairCode').value.trim().toLowerCase();
    if (!WalletCipher.valid(next)) return AppDialog.alert('Cole o código completo fornecido pelo primeiro aparelho.');
    if (!(await AppDialog.confirm('Usar a carteira compartilhada neste aparelho? Sua carteira local será guardada em uma cópia de recuperação e não será mesclada automaticamente.'))) return;
    await connect(next);
  };
  $('cloudControl').onclick = async () => {
    if (!engine) return;
    if (mode === 'controlling') await engine.release();
    else await engine.takeControl();
  };
  $('showPairCode').onclick = () => {
    $('cloudPairShare').hidden = !$('cloudPairShare').hidden;
    $('cloudShareCode').value = code || '';
  };
  $('copyPairCode').onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      $('cloudSettingsStatus').textContent = 'Código copiado. Cole somente no aparelho de vocês.';
    } catch {
      $('cloudShareCode').type = 'text';
      $('cloudShareCode').select();
    }
  };
  $('reconnectCloud').onclick = () => connect(code);
  $('disconnectCloud').onclick = async () => {
    if (!(await AppDialog.confirm('Desconectar este aparelho? Os dados desta página continuarão locais. A carteira no Firebase e o vínculo do outro aparelho serão preservados.'))) return;
    if (engine?.state().mode === 'controlling' && !(await engine.release())) return;
    engine?.stop();
    engine = null;
    window.SharedWallet = null;
    code = null;
    localStorage.removeItem(codeKey);
    WalletStore.setWritable(true);
    state({ mode: 'local' });
  };
  $('exportCloudRecovery').hidden = !localStorage.getItem(recoveryKey);
  $('exportCloudRecovery').onclick = () => {
    const saved = localStorage.getItem('findom.cloud.unsent.v3') || localStorage.getItem(recoveryKey);
    if (!saved) return;
    const payload = { format: 'findom-wallet-backup', version: 2, exportedAt: new Date().toISOString(), wallet: JSON.parse(saved) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'findom-copia-antes-sincronizacao.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Keep navigation, reading, export and filters available on the companion device.
  const safe =
    '#cloudSettings, #cloudStatusBar, [data-panel], [data-jump], #exportBackup, #enviarHistoricoWhatsApp, #copySummary, #shareText, #printContract, #filterDate, #aplicarFiltro, #limparFiltro, #financeFrom, #financeTo, #financeCategory, #financeStore, #financeStatus, #clearFinanceFilters';
  for (const name of ['click', 'change', 'input', 'submit', 'drop', 'dragstart', 'keydown'])
    document.addEventListener(
      name,
      (event) => {
        // Remote hydration emits the existing change events for title, bonus and
        // previews. Block user edits, not those internal presentation updates.
        if (!event.isTrusted && (name === 'change' || name === 'input')) return;
        if (WalletStore.isWritable() || event.target.closest(safe)) return;
        if (!event.target.closest('.app-panel, #btnRoletaFlutuante')) return;
        if (!event.target.closest('button, input, select, textarea, [draggable], form')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
  window.addEventListener('offline', () => {
    if (!engine) return;
    engine.suspend(new Error('Sem conexão. Carteira preservada neste aparelho; reconecte antes de continuar.'));
    preserve(WalletStore.snapshot());
  });
  window.addEventListener('pagehide', () => {
    if (engine?.state().pending) preserve(WalletStore.snapshot());
  });
  if (WalletCipher.valid(code)) connect(code);
});
