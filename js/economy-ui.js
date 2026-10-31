'use strict';
let economySettings;
try {
  const stored = AppStorage.getItem('economy');
  const previous = stored ? JSON.parse(stored) : null;
  let catalog = AppStorage.getItem('economyCatalog');
  if (AppStorage.getItem('catalogExternalGamesSeparated') !== '3') {
    const external = new Set(['Buraco', 'Perfil', 'Match Masters']);
    if (previous?.games) for (const id of external) delete previous.games[id];
    if (catalog) {
      const data = JSON.parse(catalog);
      data.games = data.games.filter((item) => !external.has(item.id));
      const conversation = Economy.config.games.find((item) => item.scoreBased === false);
      if (!data.games.some((item) => item.id === conversation.id)) data.games.push({ ...conversation });
      const cup = Economy.config.gains.find((item) => item.id === 'Cuspir no copo');
      if (!data.gains.some((item) => item.id === cup.id)) data.gains.push({ ...cup });
      for (const gain of data.gains) if (['Cuspir no copo', 'Pés na cara'].includes(gain.id)) gain.timerEligible = true;
      catalog = JSON.stringify(data);
    }
  }
  if (catalog) EconomyCatalog.apply(EconomyCatalog.prepare(JSON.parse(catalog), previous || Economy.defaults()).catalog);
  economySettings = Economy.syncCatalog(previous, JSON.parse(AppStorage.getItem('economyCatalogBaseline') || 'null'));
  AppStorage.setItem('economyCatalogBaseline', JSON.stringify(Economy.defaults('custom')));
  if (previous?.mode === 'classic') AppStorage.setItem('economyBeforeBalanced', stored);
  AppStorage.setItem('economy', JSON.stringify(economySettings));
  if (catalog) AppStorage.setItem('economyCatalog', catalog);
  AppStorage.setItem('catalogExternalGamesSeparated', '3');
} catch {
  economySettings = Economy.defaults('balanced');
  storageFailure(new Error('Configuração econômica inválida. Valores equilibrados carregados para conferência.'));
}
window.getEconomy = () => economySettings;
document.addEventListener('DOMContentLoaded', () => {
  const marker = (id) => (Economy.config.eligible.includes(id) ? ' 💲' : '');
  function render() {
    document.querySelectorAll('.bonusActiveBanner .bonus-text')[0].textContent = 'BÔNUS ' + economySettings.bonusPercent + '% CRÉDITO';
    document.querySelectorAll('.bonusActiveBanner .bonus-text')[1].textContent = 'DESCONTO ' + economySettings.discountPercent + '% COMPRAS';
    const selected = document.getElementById('selectTarefa').selectedOptions[0]?.value.split('|')[1];
    const services = document.getElementById('selectTarefa');
    services.replaceChildren(new Option('-- Escolher tarefa --', '0'));
    services.options[0].dataset.placeholder = '1';
    for (const item of Economy.config.services) {
      const value = economySettings.prices[item.id];
      const option = new Option(item.label + marker(item.id) + ' — ' + formatBR(value), value + '|' + item.id + '|' + item.description);
      if (item.reduceHours) option.dataset.reduzHoras = item.reduceHours;
      services.appendChild(option);
      if (item.id === selected) option.selected = true;
    }
    const gains = document.getElementById('selectGanho');
    const gainSelected = gains.value;
    gains.replaceChildren(new Option('-- Escolher forma --', ''));
    for (const item of Economy.config.gains) gains.add(new Option(item.id + marker(item.id) + ' — ' + formatBR(economySettings.gains[item.id]), item.id));
    for (const name of Object.keys(Economy.config.gameRewards)) gains.add(new Option(name + marker(name) + ' — sugestão ' + formatBR(economySettings.games[name]), name));
    gains.add(new Option('Outro (valor editável)', 'Outro'));
    gains.value = gainSelected;
    document.getElementById('quantidadeMultiplicador').max = economySettings.quantityMax;
    const rules = [
      ['Base', formatBR(economySettings.timer.base) + '/min'],
      ['Por registro', 'Calculando faixa…'],
      ['Dinâmico 💲', '+' + formatBR(economySettings.timer.autoIncrement) + '/min a cada ' + economySettings.timer.autoEvery + 's por atividade'],
    ];
    document.querySelectorAll('[data-timer-summary]').forEach((el) => {
      el.replaceChildren();
      for (const [label, value] of rules) {
        const rule = document.createElement('span');
        rule.className = 'timer-rule';
        const name = document.createElement('span');
        name.textContent = label;
        const amount = document.createElement('strong');
        amount.textContent = value;
        if (label === 'Por registro') amount.dataset.registrationRate = '';
        rule.append(name, amount);
        el.append(rule);
      }
    });

    document.getElementById('customEconomyJson').value = EconomyCatalog.format(EconomyCatalog.document(economySettings));
    if (typeof calcularValorGanho === 'function') calcularValorGanho();
    window.dispatchEvent(new Event('economy:changed'));
    if (window.updateBonusEspecialUI) window.updateBonusEspecialUI();
    if (window.atualizarBloqueiosNoSelectTarefa) window.atualizarBloqueiosNoSelectTarefa();
  }
  document.getElementById('saveCustomEconomy').onclick = () => {
    const feedback = document.getElementById('economyCodeMessage');
    try {
      if (timerEmSessao) throw new Error('Conclua a sessão do cronômetro antes de alterar o catálogo.');
      const text = document.getElementById('customEconomyJson').value;
      if (text.length > 300000) throw new Error('Catálogo muito grande.');
      const input = JSON.parse(text);
      const next = EconomyCatalog.prepare(input, economySettings);
      const snapshot = WalletStore.snapshot();
      WalletStore.commitBoth(snapshot.finance, { ...snapshot.simulator, economy: JSON.stringify(next.settings), economyCatalog: JSON.stringify(input), economyCatalogBaseline: JSON.stringify(next.baseline) });
      EconomyCatalog.apply(next.catalog);
      ELIGIBLE_TASKS.clear();
      next.catalog.eligible.forEach((id) => ELIGIBLE_TASKS.add(id));
      economySettings = next.settings;
      render();
      feedback.className = 'notice';
      feedback.textContent = 'Catálogo salvo. Valores e novas opções já estão disponíveis.';
    } catch (error) {
      feedback.className = 'notice error';
      feedback.textContent = error instanceof SyntaxError ? 'JSON inválido: confira vírgulas, aspas e colchetes. ' + error.message : error.message;
    }
  };
  window.addEventListener('wallet:remote', (event) => {
    if (event.detail && !event.detail.initial && !event.detail.changedKeys.some((key) => ['economy', 'economyCatalog', 'economyCatalogBaseline'].includes(key))) return;
    const saved = JSON.parse(AppStorage.getItem('economy') || 'null');
    const catalog = AppStorage.getItem('economyCatalog');
    if (catalog) EconomyCatalog.apply(EconomyCatalog.prepare(JSON.parse(catalog), saved || Economy.defaults()).catalog);
    economySettings = Economy.validate(saved || Economy.defaults());
    ELIGIBLE_TASKS.clear();
    Economy.config.eligible.forEach((id) => ELIGIBLE_TASKS.add(id));
    render();
  });
  document.querySelectorAll('[data-jump]').forEach(
    (button) =>
      (button.onclick = () => {
        if (button.dataset.jump === 'roleta') {
          document.getElementById('rouletteSection').scrollIntoView();
          return;
        }
        const select = document.getElementById('tipoTransacao');
        select.value = button.dataset.jump;
        select.dispatchEvent(new Event('change'));
      }),
  );
  render();
});
