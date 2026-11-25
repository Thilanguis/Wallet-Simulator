'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const recoveryKey = 'findom.firebase.before-primary.v4';
  const localBeforeLoad = WalletStore.snapshot();
  const tabKey = 'findom.firebase.tab.v4';
  const tabId = (performance.getEntriesByType('navigation')[0]?.type === 'reload' && sessionStorage.getItem(tabKey)) || crypto.randomUUID();
  sessionStorage.setItem(tabKey, tabId);
  let session = null,
    engine = null,
    currentUser = null,
    connectionError = null,
    generation = 0,
    received = false,
    importAttempted = false,
    activated = false,
    accessSession = null;
  const unsentKey = 'findom.firebase.unsent.v4';
  let recoveryDatabase;
  function largeRecovery(key, value) {
    recoveryDatabase ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('findom-wallet-recovery', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('copies');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return recoveryDatabase.then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction('copies', value === undefined ? 'readonly' : 'readwrite');
      const copies = transaction.objectStore('copies');
      const request = value === undefined ? copies.get(key) : copies.put(value, key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    }));
  }
  function preserve(wallet) {
    const pending = engine?.state().pending;
    const key = pending ? unsentKey : recoveryKey;
    if (!pending && localStorage.getItem(recoveryKey)) return;
    const serialized = JSON.stringify(wallet);
    try {
      localStorage.setItem(key, serialized);
      $('exportCloudRecovery').hidden = false;
      if (pending) void largeRecovery(key, serialized).catch(() => {});
    } catch (error) {
      if (error.name !== 'QuotaExceededError') return storageFailure(error);
      void largeRecovery(key, serialized).then(() => { $('exportCloudRecovery').hidden = false; }, storageFailure);
    }
  }
  function validate(wallet) {
    Finance.validateState(wallet.finance);
    const sim = wallet.simulator;
    if (sim?.wishlist && !Array.isArray(JSON.parse(sim.wishlist))) throw new Error('Lista de desejos inválida.');
    if (sim?.wishlistPeople && !Array.isArray(JSON.parse(sim.wishlistPeople))) throw new Error('Lista de amigas inválida.');
    if (!sim || Array.isArray(sim) || Object.entries(sim).some(([key, value]) => !Vault.keys.includes(key) || typeof value !== 'string')) throw new Error('Dados do Firebase incompatíveis. A cópia anterior foi preservada.');
    if (!Number.isFinite(Number(sim.saldoDominadora || 0))) throw new Error('Saldo inválido no Firebase.');
    for (const key of ['historico', 'archivedHistory', 'tarefasPendentes', 'tarefasBloqueadas', 'accelBoosts', 'rouletteAwards']) if (!Array.isArray(JSON.parse(sim[key] || '[]'))) throw new Error('Lista inválida no Firebase: ' + key);
    const settings = sim.economy ? JSON.parse(sim.economy) : Economy.defaults();
    if (sim.economyCatalog) EconomyCatalog.prepare(JSON.parse(sim.economyCatalog), settings);
    else Economy.syncCatalog(settings, JSON.parse(sim.economyCatalogBaseline || 'null'));
    if (sim.bonusEspecialAtivo && typeof JSON.parse(sim.bonusEspecialAtivo) !== 'boolean') throw new Error('Bônus inválido no Firebase.');
    if (sim.timerSession) {
      const timer = JSON.parse(sim.timerSession);
      if (![timer.seconds, timer.earnedUnits, timer.rate, timer.tasks].every((n) => Number.isFinite(n) && n >= 0)) throw new Error('Sessão inválida no Firebase.');
    }
  }
  function message(error) {
    if (error?.code === 'permission-denied') return 'O Firebase recusou o acesso à carteira. Confira a conta Google ou tente novamente.';
    if (error?.code === 'auth/popup-blocked') return 'O navegador bloqueou a janela do Google. Permita a abertura e tente novamente.';
    if (error?.code === 'auth/unauthorized-domain') return 'Este endereço ainda não está autorizado no login Google do Firebase.';
    if (error?.code === 'auth/operation-not-allowed') return 'O login Google precisa ser habilitado neste projeto Firebase.';
    return error?.message || 'Não foi possível carregar o Firebase. Seus dados anteriores foram preservados.';
  }
  function state(next) {
    const mode = next.mode;
    connectionError = mode === 'error' ? next.error : null;
    if (mode === 'error' || (received && ['watching', 'controlling'].includes(mode))) document.body.classList.remove('firebase-checking');
    const descriptions = {
      connecting: 'Conectando ao Firebase…',
      receiving: 'Recebendo a carteira do Firebase…',
      watching: 'Atualizado',
      controlling: next.pending ? 'Salvando…' : 'Salvo no Firebase',
      error: message(next.error),
      local: 'Entre com Google para abrir sua carteira.',
      ready: 'Carregando a carteira existente…',
    };
    const text = descriptions[mode] || descriptions.connecting;
    const loadingStages = {
      connecting: 'Conferindo acesso à carteira…',
      receiving: 'Recebendo seus dados…',
      ready: 'Abrindo sua carteira…',
    };
    if (loadingStages[mode]) $('walletConnectionStage').textContent = loadingStages[mode];
    $('cloudStatusText').textContent = text;
    $('cloudSettingsStatus').textContent = text;
    $('cloudStatusBar').hidden = !currentUser;
    $('cloudStatusBar').classList.toggle('is-error', mode === 'error');
    $('reconnectCloud').hidden = mode !== 'error';
    $('retryFirebaseConnection').hidden = !currentUser || mode !== 'error';
    $('wishRetrySync').hidden = mode !== 'error' || next.error?.code !== 'wallet/write-denied';
    document.body.classList.toggle('cloud-readonly', !WalletStore.isWritable());
    if (mode === 'error' && next.error?.code === 'permission-denied') {
      document.body.classList.add('firebase-required');
      $('firebaseAuthMessage').textContent = text;
    }
    $('firebaseAuthTitle').textContent = currentUser ? 'Conexão com a carteira' : 'Entrar na carteira';
    if (received && ['watching', 'controlling'].includes(mode)) document.body.classList.remove('firebase-required');
    if (!received && mode === 'error') $('firebaseAuthMessage').textContent = text;
    window.dispatchEvent(new Event('cloud:state'));
    if (mode === 'controlling') {
      if (!activated) {
        activated = true;
        window.dispatchEvent(new Event('wallet:control'));
      }
      queueMicrotask(importPreviousNotes);
    }
  }
  function importPreviousNotes() {
    if (importAttempted || engine?.state().mode !== 'controlling') return;
    importAttempted = true;
    const current = WalletStore.finance(),
      base = engine.state().base;
    const previous = localBeforeLoad.finance;
    // One-time import only into the newly upgraded empty ledger. Never restore
    // a stale browser over an existing or deliberately cleared Firebase ledger.
    if (!base?.financeImportOpen || current.entries.length || !previous.entries.length) return;
    try {
      Finance.validateState(previous);
      WalletStore.commitFinance(previous);
      window.dispatchEvent(new CustomEvent('wallet:remote', { detail: { initial: false, changedKeys: [], financeChanged: true } }));
      $('firebaseMigrationMessage').textContent = 'Notas anteriores recuperadas. Aguardando confirmação de envio ao Firebase…';
      engine.flush().then(() => {
        $('firebaseMigrationMessage').textContent =
          engine.state().pending || engine.state().mode !== 'controlling' ? 'As notas estão preservadas na cópia de recuperação; o envio ao Firebase ainda não foi confirmado.' : 'Suas notas anteriores foram preservadas e salvas no Firebase.';
      });
    } catch (error) {
      $('firebaseMigrationMessage').textContent = message(error);
      preserve(localBeforeLoad);
    }
  }
  async function setupPersonalSharing(transport, signal) {
    if (!transport.personalProfile) return;
    const circle = $('wishCircleOpen');
    try {
      const { openWishlistSharing } = await import('./wishlist-sharing.js');
      const { showWishlistPeople } = await import('./wishlist-people.js');
      if (signal.aborted) return;
      circle.hidden = false;
      circle.addEventListener('click', () => void showWishlistPeople(async () => ({
        profile: transport.personalProfile,
        api: await openWishlistSharing(session.db, transport.personalProfile),
      }), { signal, personalLink: './wishlist-personal.html' }), { signal });
      signal.addEventListener('abort', () => { circle.hidden = true; }, { once: true });
    } catch (error) {
      if (!signal.aborted) console.error(error);
    }
  }

  async function connect(user) {
    const attempt = ++generation;
    accessSession?.abort();
    accessSession = new AbortController();
    engine?.stop();
    engine = null;
    window.SharedWallet = null;
    WalletStore.setWritable(false);
    received = false;
    activated = false;
    importAttempted = false;
    connectionError = null;
    document.body.classList.toggle('firebase-authenticated', Boolean(user));
    document.body.classList.add('firebase-required');
    $('googleSignIn').hidden = Boolean(user);
    $('retryFirebaseConnection').hidden = true;
    if (!user) {
      document.body.classList.remove('firebase-checking');
      currentUser = null;
      $('firebaseAccount').textContent = '';
      $('firebaseSignOut').hidden = true;
      $('cloudStatusBar').hidden = true;
      $('firebaseAuthTitle').textContent = 'Entrar na carteira';
      $('firebaseAuthMessage').textContent = 'Entre com sua conta Google para carregar a carteira do Firebase.';
      return;
    }
    currentUser = user;
    document.body.classList.add('firebase-checking');
    $('firebaseAccount').textContent = user.email || '';
    $('firebaseSignOut').hidden = false;
    $('firebaseAuthMessage').textContent = 'Conferindo acesso à carteira…';
    state({ mode: 'connecting' });
    try {
      const { createPrimaryFirebaseTransport } = await import('./firebase-primary-transport.js');
      const transport = await createPrimaryFirebaseTransport({ db: session.db, user, template: { simulator: localBeforeLoad.simulator, emptyFinance: Finance.empty() } });
      if (attempt !== generation) return;
      preserve(localBeforeLoad);
      engine = WalletShared.create({
        store: WalletStore,
        transport,
        id: user.uid + '.' + tabId,
        validate,
        advanceTimer: (timer, seconds) => {
          const next = Economy.step(timer, seconds, getEconomy(), timer.dynamicActivities?.length || Number(!!timer.legacyDynamicActivity));
          return { ...next, autoRateTotal: Economy.round((timer.autoRateTotal || 0) + next.rate - timer.rate) };
        },
        backup: preserve,
        onFreeze: () => freezeWalletTimer(),
        onRemote: (detail) => {
          received = true;
          window.dispatchEvent(new CustomEvent('wallet:remote', { detail }));
        },
        onState: state,
        onConflict: () => {
          $('storageWarning').hidden = false;
          $('storageWarning').textContent = 'Uma alteração simultânea foi recebida do Firebase. Sua alteração não enviada foi preservada na cópia de recuperação em Configurações.';
        },
      });
      window.SharedWallet = engine;
      engine.connect();
      void setupPersonalSharing(transport, accessSession.signal);
    } catch (error) {
      if (attempt === generation) {
        WalletStore.setWritable(false);
        state({ mode: 'error', error });
      }
    }
  }
  $('googleSignIn').onclick = async () => {
    try {
      if (!session) throw new Error('A conexão com o Google ainda não está pronta. Tente novamente.');
      await session.signIn();
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') $('firebaseAuthMessage').textContent = message(error);
    }
  };
  // Either account may operate the common clock. Transfer its internal writer
  // automatically only when a clock action requires it, without a session UI.
  let replayingTimer = false;
  document.addEventListener(
    'click',
    async (event) => {
      const button = event.target.closest('#btnPlayPauseTempo,#btnTerminarTempo');
      if (!button || replayingTimer || !engine?.shared || engine.isTimerOwner() || !WalletStore.isWritable()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const running = JSON.parse(AppStorage.getItem('timerSession') || 'null')?.running;
      try {
        await engine.claimTimer();
        if (button.id === 'btnPlayPauseTempo' && running) return;
        replayingTimer = true;
        button.click();
      } catch (error) {
        AppDialog.alert(message(error));
      } finally {
        replayingTimer = false;
      }
    },
    true,
  );
  $('firebaseSignOut').onclick = async () => {
    if (!(await AppDialog.confirm('Sair da sua conta Google neste aparelho? Os dados no Firebase serão preservados.'))) return;
    if (engine?.isTimerOwner()) freezeWalletTimer();
    await engine?.flush();
    await session.signOut();
  };
  $('reconnectCloud').onclick = $('retryFirebaseConnection').onclick = $('wishRetrySync').onclick = () => {
    if (currentUser) void connect(currentUser);
    else if (!session) location.reload();
  };
  $('exportCloudRecovery').hidden = !localStorage.getItem(recoveryKey);
  if ($('exportCloudRecovery').hidden && window.indexedDB) {
    void Promise.all([largeRecovery(unsentKey), largeRecovery(recoveryKey)]).then(copies => {
      if (copies.some(Boolean)) $('exportCloudRecovery').hidden = false;
    }).catch(() => {});
  }
  $('exportCloudRecovery').onclick = async () => {
    const [unsent, initial] = await Promise.all([largeRecovery(unsentKey), largeRecovery(recoveryKey)]).catch(() => []);
    const saved = unsent || localStorage.getItem(unsentKey) || localStorage.getItem(recoveryKey) || initial;
    if (!saved) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'findom-wallet-backup', version: 2, wallet: JSON.parse(saved) })], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'findom-copia-anterior-firebase.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const safe =
    '#firebaseAuthPanel, #cloudSettings, #firebaseAccountActions, #cloudStatusBar, #wishRetrySync, [data-panel], [data-jump], #exportBackup, #enviarHistoricoWhatsApp, #copySummary, #shareText, #printContract, #filterDate, #aplicarFiltro, #limparFiltro, #financeFrom, #financeTo, #financeCategory, #financeStore, #financeStatus, #clearFinanceFilters';
  for (const name of ['click', 'change', 'input', 'submit', 'drop', 'dragstart', 'keydown'])
    document.addEventListener(
      name,
      (event) => {
        if (!event.isTrusted && ['change', 'input'].includes(name)) return;
        if (WalletStore.isWritable() || event.target.closest(safe)) return;
        if (event.target.closest('.app-panel, #btnRoletaFlutuante') && event.target.closest('button,input,select,textarea,[draggable],form')) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  window.addEventListener('offline', () => {
    engine?.suspend(new Error('Sem conexão com o Firebase. A sessão foi pausada; novas operações aguardam a reconexão.'));
  });
  function resumeConnection() {
    if (currentUser && navigator.onLine && connectionError && !['permission-denied', 'wallet/write-denied'].includes(connectionError.code)) void connect(currentUser);
  }
  window.addEventListener('online', resumeConnection);
  window.addEventListener('pageshow', resumeConnection);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resumeConnection();
  });
  window.addEventListener('pagehide', () => {
    void engine?.flush();
    if (engine?.state().pending) preserve(WalletStore.snapshot());
  });
  import('./firebase-google-auth.js')
    .then(async ({ googleAuth }) => {
      session = await googleAuth();
      session.watch((user) => void connect(user));
    })
    .catch((error) => {
      document.body.classList.remove('firebase-checking');
      $('firebaseAuthTitle').textContent = 'Conexão com a carteira';
      $('firebaseAuthMessage').textContent = message(error);
      $('googleSignIn').hidden = true;
      $('retryFirebaseConnection').hidden = false;
      WalletStore.setWritable(false);
    });
});
