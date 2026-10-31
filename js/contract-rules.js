'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  function isGame() {
    return Economy.config.games.some((item) => item.id === $('selectGanho').value && item.scoreBased !== false);
  }
  function calculate() {
    const winner = Number($('scoreWinner').value),
      other = Number($('scoreOther').value);
    if (!$('scoreWinner').value || !$('scoreOther').value || !Number.isSafeInteger(winner) || !Number.isSafeInteger(other) || winner < 0 || other < 0) throw new Error('Informe pontuações inteiras e positivas ou zero.');
    const coefficient = Finance.cents($('scoreCoefficient').value);
    if (coefficient <= 0) throw new Error('Informe um valor por ponto maior que zero.');
    const difference = Math.max(0, winner - other);
    const cents = difference * coefficient;
    if (!Number.isSafeInteger(cents)) throw new Error('Resultado fora do limite numérico.');
    return { difference, amount: cents / 100 };
  }
  function preview() {
    if (!document.getElementById('scoreCoefficient').value.trim()) {
      $('scorePreview').textContent = 'Informe o valor por ponto para calcular.';
      $('useScoreGain').disabled = true;
      return;
    }
    try {
      const result = calculate();
      $('scorePreview').textContent = result.difference + ' pontos × valor por ponto = ' + formatBR(result.amount) + '. O registro continua dependendo de Registrar.';
      $('useScoreGain').disabled = result.amount <= 0 || result.amount > getEconomy().manualGainMax;
      if (result.amount > getEconomy().manualGainMax) $('scorePreview').textContent += ' Acima do limite de ganho manual configurado.';
    } catch (error) {
      $('scorePreview').textContent = error.message;
      $('useScoreGain').disabled = true;
    }
  }
  function update() {
    $('gameScoreCalculator').hidden = !isGame();
    if (!isGame()) $('gameScoreCalculator').open = false;
    preview();
  }
  for (const id of ['scoreWinner', 'scoreOther', 'scoreCoefficient']) $(id).addEventListener('input', preview);
  $('selectGanho').addEventListener('change', update);
  window.addEventListener('economy:changed', update);
  $('useScoreGain').onclick = () => {
    try {
      if (!isGame()) return;
      const result = calculate();
      if (!(result.amount > 0) || result.amount > getEconomy().manualGainMax) throw new Error('Confira o valor calculado e o limite de ganho manual.');
      $('valorGanho').value = result.amount;
      $('valorGanho').dispatchEvent(new Event('input', { bubbles: true }));
      if (window.updateBonusEspecialUI) window.updateBonusEspecialUI();
    } catch (error) {
      $('scorePreview').textContent = error.message;
    }
  };
  function penaltyPreview() {
    const kind = $('contractOccurrenceType').value;
    const amount = getEconomy().contractRules[kind];
    $('contractPenaltyPreview').textContent = (kind === 'failurePenalty' ? 'Acrescenta ' : 'Desconta ') + formatBR(amount) + ' do Saldo Dominadora. Sem bônus lingerie.';
    $('registerContractOccurrence').disabled = !(amount > 0);
  }
  $('contractOccurrenceType').addEventListener('change', penaltyPreview);
  window.addEventListener('economy:changed', penaltyPreview);
  $('registerContractOccurrence').onclick = async () => {
    const button = $('registerContractOccurrence');
    button.disabled = true;
    try {
      const kind = $('contractOccurrenceType').value;
      const amount = getEconomy().contractRules[kind];
      if (!(amount > 0)) throw new Error('Defina um valor positivo no catálogo.');
      const credit = kind === 'failurePenalty';
      const label = credit ? 'Descumprimento de tarefa' : 'Regra do creme';
      const note = $('contractOccurrenceNote').value.trim();
      if (!(await AppDialog.confirm('Registrar ' + label + ' e ' + (credit ? 'acrescentar ' : 'descontar ') + formatBR(amount) + ' do saldo interno?'))) return;
      AppStorage.flush();
      const snapshot = WalletStore.snapshot();
      const before = Number(snapshot.simulator.saldoDominadora || 0);
      const after = Economy.round(before + (credit ? amount : -amount));
      if (!Number.isFinite(after) || !Number.isSafeInteger(Math.round(after * 100))) throw new Error('Saldo fora do limite numérico.');
      const history = JSON.parse(snapshot.simulator.historico || '[]');
      history.unshift({
        id: crypto.randomUUID(),
        tipo: credit ? 'ganho' : 'gasto',
        descricao: 'Ocorrência do contrato: ' + label + (note ? ' · ' + note : ''),
        valor: amount,
        saldoAtual: after,
        timestamp: new Date().toISOString(),
        contractRule: kind,
      });
      WalletStore.commitBoth(snapshot.finance, { ...snapshot.simulator, saldoDominadora: String(after), historico: JSON.stringify(history) });
      window.dispatchEvent(new Event('wallet:credits'));
      $('contractOccurrenceNote').value = '';
      $('contractOccurrenceMessage').textContent = 'Ocorrência registrada no histórico. Saldo atualizado.';
    } catch (error) {
      $('contractOccurrenceMessage').textContent = error.message;
    } finally {
      penaltyPreview();
    }
  };
  penaltyPreview();
  update();
});
