document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('roulettePrizeList');
  function registerFreeServices() {
    if (!WalletStore.isWritable()) return;
    const awards = JSON.parse(AppStorage.getItem('rouletteAwards') || '[]');
    const tasks = JSON.parse(AppStorage.getItem('tarefasPendentes') || '[]');
    const history = JSON.parse(AppStorage.getItem('historico') || '[]');
    const archived = JSON.parse(AppStorage.getItem('archivedHistory') || '[]');
    const blocks = JSON.parse(AppStorage.getItem('tarefasBloqueadas') || '[]');
    let changed = false;
    for (const award of awards) {
      if (award.claimed || award.kind !== 'freeService') continue;
      const item = Economy.config.services.find((service) => service.id === award.serviceId);
      if (!item) continue;
      const recorded = tasks.some((task) => String(task.id) === String(award.id) || task.rouletteAwardId === award.id) || [...history, ...archived].some((entry) => entry.id === 'prize:' + award.id);
      if (!recorded) {
        tasks.unshift({ id: award.id, rouletteAwardId: award.id, tarefa: item.id, descricao: item.description + ' · prêmio gratuito da roleta', valor: 0, timestamp: award.createdAt || new Date().toISOString() });
        history.unshift({ id: 'prize:' + award.id, tipo: 'premio', descricao: 'Prêmio gratuito da roleta: ' + award.label, valor: 0, saldoAtual: saldoDominadora, timestamp: new Date().toISOString() });
        const cooldown = Economy.config.cooldowns[item.id];
        if (cooldown && !blocks.some((block) => block.nome === item.id && block.expiraEm > Date.now())) blocks.push({ nome: item.id, expiraEm: Date.now() + cooldown * 3600000 });
      }
      award.claimed = true;
      changed = true;
    }
    if (!changed) return;
    // Persist task, receipt marker and prize history together, so reload cannot duplicate a reward.
    const snapshot = WalletStore.snapshot();
    WalletStore.commitBoth(snapshot.finance, { ...snapshot.simulator, rouletteAwards: JSON.stringify(awards), tarefasPendentes: JSON.stringify(tasks), historico: JSON.stringify(history), tarefasBloqueadas: JSON.stringify(blocks) });
    tarefasPendentes = tasks;
    historico = history;
    window.__AppCtl.setBlocks(blocks);
    renderTarefasPendentes();
    window.dispatchEvent(new Event('wallet:credits'));
  }
  function render() {
    try {
      registerFreeServices();
    } catch (error) {
      storageFailure(error);
    }
    const awards = JSON.parse(AppStorage.getItem('rouletteAwards') || '[]');
    const available = awards.filter((award) => !award.claimed && ['bonus', 'reducer'].includes(award.kind));
    container.hidden = !available.length;
    container.innerHTML = available
      .map((award) => {
        const item = Economy.config.services.find((service) => service.id === award.serviceId);
        const label = award.kind === 'bonus' ? 'Ativar bônus lingerie' : 'Ativar redutor: ' + (item?.label || 'redução de prazo');
        return '<button type="button" data-claim="' + escapeHTML(award.id) + '">' + escapeHTML(label) + '</button>';
      })
      .join('');
  }
  container.onclick = async (event) => {
    const button = event.target.closest('[data-claim]');
    if (!button) return;
    let awards = JSON.parse(AppStorage.getItem('rouletteAwards') || '[]'),
      award = awards.find((a) => a.id === button.dataset.claim);
    if (!award || award.claimed || !['bonus', 'reducer'].includes(award.kind)) return;
    let blocks = JSON.parse(AppStorage.getItem('tarefasBloqueadas') || '[]');
    if (award.serviceId && blocks.some((b) => b.nome === award.serviceId && b.expiraEm > Date.now())) return AppDialog.alert('O serviço ainda está bloqueado. O prêmio ficará disponível para resgatar após o cooldown.');
    if (!(await AppDialog.confirm('Resgatar este prêmio gratuito? Nenhum valor será descontado do Saldo Dominadora.'))) return;
    awards = JSON.parse(AppStorage.getItem('rouletteAwards') || '[]');
    award = awards.find((a) => a.id === button.dataset.claim);
    if (!award || award.claimed) return;
    blocks = JSON.parse(AppStorage.getItem('tarefasBloqueadas') || '[]');
    if (award.kind === 'bonus') {
      AppStorage.setItem('rouletteBonusUntil', Date.now() + Economy.config.bonusDurationHours * 3600000);
      const checkbox = document.getElementById('bonusEspecialCheckbox');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
    } else if (award.kind === 'reducer') {
      const item = Economy.config.services.find((s) => s.id === award.serviceId),
        hours = item.reduceHours || 96;
      const total = hours * 3600000,
        duration = Economy.config.reducerDurationMs;
      window.startGlobalAcceleration(total / (duration / 1000), duration, total, item.id);
      blocks.push({ nome: item.id, expiraEm: Date.now() + Economy.config.cooldowns[item.id] * 3600000 });
      window.__AppCtl.setBlocks(blocks);
    }
    award.claimed = true;
    AppStorage.setItem('rouletteAwards', JSON.stringify(awards));
    historico.unshift({ id: 'prize:' + award.id, tipo: 'premio', descricao: 'Prêmio gratuito da roleta: ' + award.label, valor: 0, saldoAtual: saldoDominadora, timestamp: new Date().toISOString() });
    AppStorage.setItem('historico', JSON.stringify(historico));
    window.dispatchEvent(new Event('wallet:credits'));
    render();
  };
  function expireBonus() {
    if (!WalletStore.isWritable()) return;
    const until = Number(AppStorage.getItem('rouletteBonusUntil') || 0);
    if (until && until <= Date.now()) {
      AppStorage.setItem('rouletteBonusUntil', '0');
      const checkbox = document.getElementById('bonusEspecialCheckbox');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
    }
  }
  window.addEventListener('roulette:awards', render);
  window.addEventListener('wallet:remote', (event) => {
    if (!event.detail || event.detail.initial || event.detail.changedKeys.includes('rouletteAwards')) render();
  });
  window.addEventListener('wallet:control', render);
  setInterval(expireBonus, 1000);
  expireBonus();
  render();
});
