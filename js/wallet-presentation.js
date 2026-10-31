'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const mode = $('tipoTransacao');
  const bonus = $('bonusEspecialCheckbox'),
    seal = $('privilegeSeal');
  function privilege() {
    seal.setAttribute('aria-pressed', String(bonus.checked));
    $('privilegeStatus').textContent = bonus.checked ? 'Privilégio habilitado · desativar' : 'Ativar privilégio';
    $('privilegeBenefits').textContent = '+' + getEconomy().bonusPercent + '% nos ganhos · −' + getEconomy().discountPercent + '% nos serviços elegíveis';
  }
  seal.onclick = () => {
    bonus.checked = !bonus.checked;
    bonus.dispatchEvent(new Event('change', { bubbles: true }));
  };
  bonus.addEventListener('change', () => queueMicrotask(privilege));
  window.addEventListener('economy:changed', privilege);
  bonus.dispatchEvent(new Event('change', { bubbles: true }));
  privilege();
  function operation() {
    const gain = mode.value === 'ganho';
    $('transactionTitle').textContent = gain ? 'Ganhar Créditos' : 'Resgatar Privilégio';
    document.querySelectorAll('[data-jump="ganho"],[data-jump="gasto"]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.jump === mode.value)));
    document.querySelector('.transaction-intro').textContent = gain ? 'Escolha a atividade para iniciar o tempo e registrar o ganho.' : 'Escolha o serviço e confira o preço antes de comprar.';
  }
  mode.addEventListener('change', operation);
  operation();
  for (const [id, populated] of [
    ['tarefasPendentes', '.tarefa-item'],
    ['tarefasLimitadasLista', '[data-expira]'],
  ]) {
    const list = $(id),
      panel = list.closest('.section');
    const refresh = () => panel.classList.toggle('is-empty', !list.querySelector(populated));
    new MutationObserver(refresh).observe(list, { childList: true, subtree: true });
    refresh();
  }
  function ruleChoices() {
    const selected = $('contractOccurrenceType').value;
    document.querySelectorAll('[data-contract-rule]').forEach((button) => {
      const key = button.dataset.contractRule,
        amount = getEconomy().contractRules[key];
      button.setAttribute('aria-pressed', String(key === selected));
      button.querySelector('[data-rule-impact]').textContent = (key === 'failurePenalty' ? '+' : '−') + formatBR(amount) + ' no saldo';
    });
  }
  document.querySelectorAll('[data-contract-rule]').forEach(
    (button) =>
      (button.onclick = () => {
        $('contractOccurrenceType').value = button.dataset.contractRule;
        $('contractOccurrenceType').dispatchEvent(new Event('change', { bubbles: true }));
      }),
  );
  $('contractOccurrenceType').addEventListener('change', ruleChoices);
  window.addEventListener('economy:changed', ruleChoices);
  ruleChoices();
  function roulette() {
    const last = Number(AppStorage.getItem('roletaUltimoUso') || 0);
    const remaining = last ? Math.max(0, last + Economy.config.rouletteCooldownMs - Date.now()) : 0;
    const seconds = Math.ceil(remaining / 1000),
      days = Math.floor(seconds / 86400),
      hours = Math.floor((seconds % 86400) / 3600),
      minutes = Math.floor((seconds % 3600) / 60);
    $('rouletteNextSpin').textContent = remaining ? (days ? days + 'd ' : '') + String(hours).padStart(2, '0') + 'h ' + String(minutes).padStart(2, '0') + 'min' : 'Disponível agora';
    $('openRouletteCard').textContent = remaining ? 'Giro em espera' : 'Abrir roleta';
    $('openRouletteCard').disabled = remaining > 0;
  }
  $('openRouletteCard').onclick = () => document.getElementById('btnRoletaFlutuante')?.click();
  window.addEventListener('roulette:awards', roulette);
  window.addEventListener('wallet:credits', roulette);
  window.addEventListener('wallet:remote', roulette);
  new MutationObserver(roulette).observe($('roulettePrizeList'), { childList: true, subtree: true });
  setInterval(roulette, 1000);
  roulette();
});
