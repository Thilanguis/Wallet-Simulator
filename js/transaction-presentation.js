'use strict';
// Presentation only: observes existing controls without starting or changing the timer.
document.addEventListener('DOMContentLoaded', () => {
  const card = document.getElementById('contadorBloco');
  const button = document.getElementById('btnPlayPauseTempo');
  const select = document.getElementById('selectGanho');
  const status = document.getElementById('timerVisualStatus');
  const reminder = document.getElementById('timerStartReminder');
  let finished = false;
  function update() {
    const mirrored = (window.SharedWallet?.shared ? !SharedWallet.isTimerOwner() : !WalletStore.isWritable()) && JSON.parse(AppStorage.getItem('timerSession') || 'null')?.running;
    const state = timerInterval || mirrored ? 'running' : timerEmSessao ? 'paused' : finished ? 'finished' : 'idle';
    const label = { running: '● Em andamento', paused: 'Ⅱ Pausado', idle: '○ Parado', finished: '✓ Finalizado' }[state];
    card.dataset.sessionState = state;
    if (status.textContent !== label) status.textContent = label;
    const dynamic = ELIGIBLE_TASKS.has(select.value);
    reminder.hidden = state === 'running' || (state === 'idle' && !dynamic);
    const message = state === 'paused' ? 'Ⅱ Pausado · ▶ Continuar' : '▶ Escolha uma atividade para começar';
    if (reminder.textContent !== message) reminder.textContent = message;
    const settings = getEconomy();
    const rate = Number(document.getElementById('valorPorMinuto').value) || settings.timer.base;
    const delta = (reference) => Economy.round(Economy.round(rate + Economy.taskIncrement(reference, settings) + settings.timer.repeatIncrement * (contadorTarefasTimer + 1)) - rate);
    let summary = 'Conforme atividade · veja ao selecionar';
    const kind = document.getElementById('tipoTransacao').value;
    const chosen = kind === 'ganho' ? select.value : document.getElementById('selectTarefa').value.split('|')[1];
    const item = [...Economy.config.services, ...Economy.config.gains].find((item) => item.id === chosen);
    const chosenValue = kind === 'ganho' ? Number(document.getElementById('valorGanho').value) : settings.prices[chosen];
    if (chosen && chosenValue > 0 && !item?.reduceHours && !chosen.startsWith('ACELERAR_')) summary = '+' + formatBR(delta(item?.classic || chosenValue)) + '/min · ao registrar';
    document.querySelectorAll('[data-registration-rate]').forEach((el) => {
      el.textContent = summary;
    });
    const hint = document.getElementById('activityRateHint');
    const amount = Number(document.getElementById('valorGanho').value);
    document.getElementById('gainDynamicLegend').hidden = !!select.value;
    hint.hidden = !timerEmSessao || !select.value || !(amount > 0);
    if (!hint.hidden) {
      const reference = Economy.config.services.find((item) => item.id === select.value)?.classic || Economy.config.gains.find((item) => item.id === select.value)?.classic || amount;
      const activityPart = Economy.taskIncrement(reference, settings);
      const nextRegistration = contadorTarefasTimer + 1;
      const increment = activityPart + settings.timer.repeatIncrement * nextRegistration;
      const rate = Number(document.getElementById('valorPorMinuto').value);
      const added = Economy.round(Economy.round(rate + increment) - rate);
      document.getElementById('activityImmediateRate').textContent = '+' + formatBR(added) + '/min';
      const inCombo = sessionDynamicActivities.has(select.value);
      document.getElementById('activityDynamicRate').textContent = dynamic
        ? '💲 +' + formatBR(settings.timer.autoIncrement) + '/min · ' + settings.timer.autoEvery + 's · ' + (inCombo ? '✓ No combo' : '+ Combo')
        : 'Sem aumento automático (mesmo sem 💲)';
      const number = (n) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(n);
      document.getElementById('activityRateFormula').textContent =
        'Registro nº ' +
        nextRegistration +
        ': faixa ' +
        number(activityPart / settings.timer.taskScale) +
        ' × ' +
        number(settings.timer.taskScale) +
        ' + ' +
        nextRegistration +
        ' × ' +
        number(settings.timer.repeatIncrement) +
        ' = R$ ' +
        number(increment) +
        '/min antes do arredondamento. A taxa passa de ' +
        formatBR(rate) +
        '/min para ' +
        formatBR(Economy.round(rate + increment)) +
        '/min.';
    }
  }
  window.addEventListener('timer:settled', () => {
    finished = true;
    update();
  });
  button.addEventListener('click', () => {
    if (timerEmSessao) finished = false;
    queueMicrotask(update);
  });
  new MutationObserver(update).observe(button, { childList: true, characterData: true, subtree: true });
  select.addEventListener('change', update);
  document.getElementById('tipoTransacao').addEventListener('change', update);
  document.getElementById('selectTarefa').addEventListener('change', update);
  document.getElementById('ganhoFields').addEventListener('input', update);
  document.getElementById('ganhoFields').addEventListener('change', update);
  document.getElementById('adicionar').addEventListener('click', () => queueMicrotask(update));
  window.addEventListener('economy:changed', update);
  window.addEventListener('wallet:remote', () => queueMicrotask(update));
  update();
});
