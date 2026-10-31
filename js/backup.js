document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  let candidate = null;
  $('exportBackup').onclick = () => {
    try {
      try {
        syncTimer();
        persistTimer();
        AppStorage.flush();
      } catch (error) {
        storageFailure(error);
      }
      const data = { format: 'findom-wallet-backup', version: 2, exportedAt: new Date().toISOString(), wallet: WalletStore.snapshot() };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'findom-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('backupMessage').textContent = 'Backup exportado. Guarde o arquivo em local privado.';
    } catch (error) {
      $('backupMessage').textContent = error.message;
    }
  };
  function validate(data) {
    if (data?.format !== 'findom-wallet-backup' || data.version !== 2 || data.wallet?.version !== 2) throw new Error('Formato de backup incompatível.');
    const wallet = data.wallet;
    Finance.validateState(wallet.finance);
    Redemptions.validate(wallet.finance);
    const sim = wallet.simulator;
    if (!sim || typeof sim !== 'object' || Array.isArray(sim) || Object.keys(sim).some((k) => !Vault.keys.includes(k) || typeof sim[k] !== 'string')) throw new Error('Dados do simulador inválidos.');
    if (!Number.isFinite(Number(sim.saldoDominadora || 0)) || Math.abs(Number(sim.saldoDominadora || 0)) > 1e10) throw new Error('Saldo inválido.');
    for (const key of ['historico', 'tarefasPendentes', 'tarefasBloqueadas', 'accelBoosts', 'archivedHistory']) {
      const list = JSON.parse(sim[key] || '[]');
      if (!Array.isArray(list) || list.length > 100000) throw new Error('Lista inválida: ' + key);
      for (const item of list) {
        if (!item || typeof item !== 'object') throw new Error('Registro inválido: ' + key);
        if (['historico', 'archivedHistory', 'tarefasPendentes'].includes(key)) {
          if (!Number.isFinite(item.valor) || !Number.isFinite(Date.parse(item.timestamp)) || !/^[0-9T:.+Z-]+$/.test(item.timestamp)) throw new Error('Transação inválida no backup.');
          if (key !== 'tarefasPendentes' && !Number.isFinite(item.saldoAtual)) throw new Error('Saldo de histórico inválido.');
        }
        if (key === 'tarefasBloqueadas' && (!Object.hasOwn(Economy.config.cooldowns, item.nome) || !Number.isFinite(item.expiraEm))) throw new Error('Bloqueio inválido.');
        if (key === 'accelBoosts' && !['endsAt', 'perSecondMs', 'budgetLeftMs'].every((k) => Number.isFinite(item[k]) && item[k] >= 0)) throw new Error('Aceleração inválida.');
        if (key === 'accelBoosts' && item.lastAppliedAt !== undefined && (!Number.isFinite(item.lastAppliedAt) || item.lastAppliedAt < 0)) throw new Error('Checkpoint de aceleração inválido.');
      }
    }
    if (sim.economyCatalog) EconomyCatalog.prepare(JSON.parse(sim.economyCatalog), JSON.parse(sim.economy));
    else if (sim.economy) Economy.validate(JSON.parse(sim.economy));
    if (sim.bonusEspecialAtivo && typeof JSON.parse(sim.bonusEspecialAtivo) !== 'boolean') throw new Error('Estado do bônus inválido.');
    if (sim.timerSession) {
      const t = JSON.parse(sim.timerSession);
      if (t.dynamicActivities !== undefined && (!Array.isArray(t.dynamicActivities) || t.dynamicActivities.length > 1000 || t.dynamicActivities.some((name) => typeof name !== 'string' || name.length > 200)))
        throw new Error('Combo do cronômetro inválido.');
      if (![t.seconds, t.earnedUnits, t.rate, t.tasks].every((n) => Number.isFinite(n) && n >= 0)) throw new Error('Cronômetro inválido.');
    }
    return wallet;
  }
  $('previewBackup').onclick = async () => {
    candidate = null;
    $('confirmBackup').hidden = true;
    try {
      const file = $('backupFile').files[0];
      if (!file || file.size > 20 * 1024 * 1024) throw new Error('Selecione backup JSON com até 20 MB.');
      candidate = validate(JSON.parse(await file.text()));
      const t = Finance.totals(candidate.finance.entries, candidate.finance.budget);
      $('backupPreview').hidden = false;
      $('backupPreview').textContent =
        `Backup válido: ${candidate.finance.entries.length} lançamentos financeiros, ${candidate.finance.redemptions.length} resgates e ${JSON.parse(candidate.simulator.historico || '[]').length} operações do jogo.\nTotal financeiro ativo: ${Finance.format(t.total)}. Saldo Dominadora: ${formatBR(Number(candidate.simulator.saldoDominadora || 0))}.\nA restauração substituirá TODOS os dados atuais. Exporte um backup antes de continuar.`;
      $('confirmBackup').hidden = false;
    } catch (error) {
      $('backupMessage').textContent = error.message;
    }
  };
  $('confirmBackup').onclick = async () => {
    if (!candidate) return;
    const shared = window.SharedWallet?.state().mode === 'controlling';
    if (!(await AppDialog.confirm(shared ? 'Substituir a carteira compartilhada pelo backup conferido? A alteração chegará ao outro aparelho.' : 'Substituir todos os dados locais pelo backup conferido?'))) return;
    try {
      if (window.SharedWallet?.state().mode === 'controlling') freezeWalletTimer();
      WalletStore.restore(candidate);
      if (window.SharedWallet?.state().mode === 'controlling') {
        // Hold background checkpoints until the restored envelope is acknowledged.
        WalletStore.setWritable(false);
        await window.SharedWallet.flush();
        if (window.SharedWallet.state().pending || window.SharedWallet.state().mode !== 'controlling')
          throw new Error('Backup preservado neste navegador, mas ainda não confirmado no Firebase. Baixe a cópia de recuperação e confira a conexão antes de continuar.');
      }
      location.reload();
    } catch (error) {
      $('backupMessage').textContent = error.message;
    }
  };
});
