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
    const mirrored = !WalletStore.isWritable() && JSON.parse(AppStorage.getItem('timerSession') || 'null')?.running;
    const state = timerInterval || mirrored ? 'running' : timerEmSessao ? 'paused' : finished ? 'finished' : 'idle';
    const label = { running: '● Em andamento', paused: 'Ⅱ Pausado', idle: '○ Parado', finished: '✓ Finalizado' }[state];
    card.dataset.sessionState = state;
    if (status.textContent !== label) status.textContent = label;
    const dynamic = ELIGIBLE_TASKS.has(select.value);
    reminder.hidden = state === 'running' || (state === 'idle' && !dynamic);
    const message = state === 'paused' ? 'Sessão pausada. Use Continuar para retomar a contagem.' : 'Escolha uma atividade para começar a contar o tempo automaticamente.';
    if (reminder.textContent !== message) reminder.textContent = message;
    const settings = getEconomy();
    const rate = Number(document.getElementById('valorPorMinuto').value) || settings.timer.base;
    const delta = (reference) => Economy.round(Economy.round(rate + Economy.taskIncrement(reference, settings) + settings.timer.repeatIncrement * (contadorTarefasTimer + 1)) - rate);
    const references = [
      ...Economy.config.services.filter((item) => !item.reduceHours && !item.id.startsWith('ACELERAR_')).map((item) => item.classic || settings.prices[item.id]),
      ...Economy.config.gains.map((item) => item.classic || settings.gains[item.id]),
      0.01,
      settings.manualGainMax,
    ];
    const values = references.map(delta);
    const min = Math.min(...values);
    let summary = '+' + formatBR(min) + '/min · conforme atividade';
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
    hint.hidden = !timerEmSessao || !select.value || !(amount > 0);
    if (!hint.hidden) {
      const settings = getEconomy();
      const reference = Economy.config.services.find((item) => item.id === select.value)?.classic || Economy.config.gains.find((item) => item.id === select.value)?.classic || amount;
      const increment = Economy.taskIncrement(reference, settings) + settings.timer.repeatIncrement * (contadorTarefasTimer + 1);
      const rate = Number(document.getElementById('valorPorMinuto').value);
      const added = Economy.round(Economy.round(rate + increment) - rate);
      hint.textContent = 'Ao registrar agora: +' + formatBR(added) + '/min na taxa da sessão.' + (dynamic ? ' Também ativa os aumentos automáticos do combo.' : ' Este aumento vale mesmo sem 💲.');
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
