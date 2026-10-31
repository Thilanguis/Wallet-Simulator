/* ===================================================================
   APP PRINCIPAL (Main)
   =================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // -----------------------------
  // ELEMENTOS DA UI
  // -----------------------------
  const saldoElement = document.getElementById('saldoDominadora');
  const historicoElement = document.getElementById('historico');

  const adicionarBtn = document.getElementById('adicionar');
  const resetBtn = document.getElementById('resetSaldo');
  const limparBtn = document.getElementById('limparHistorico');
  const enviarHistoricoWhatsAppBtn = document.getElementById('enviarHistoricoWhatsApp');

  const tipoTransacaoSelect = document.getElementById('tipoTransacao');
  const selectTarefaSelect = document.getElementById('selectTarefa');
  const descricaoTransacaoInput = document.getElementById('descricaoTransacao');

  const selectGanhoSelect = document.getElementById('selectGanho');
  const valorGanhoInput = document.getElementById('valorGanho');

  const filterDateInput = document.getElementById('filterDate');
  const aplicarFiltroBtn = document.getElementById('aplicarFiltro');
  const limparFiltroBtn = document.getElementById('limparFiltro');

  // Timer (se estiver usando os botões do timer neste arquivo)
  const tempoDisplay = document.getElementById('tempoDisplay');
  const valorAcumuladoDisplay = document.getElementById('valorAcumuladoDisplay');
  const btnPlayPause = document.getElementById('btnPlayPauseTempo');
  const btnTerminar = document.getElementById('btnTerminarTempo');
  const valorPorMinutoInput = document.getElementById('valorPorMinuto');

  // Bônus
  const bonusCheckbox = document.getElementById('bonusEspecialCheckbox');

  // -----------------------------
  // ESTADO / STORAGE
  // -----------------------------
  if (!Array.isArray(typeof historico !== 'undefined' ? historico : undefined)) {
    historico = JSON.parse(AppStorage.getItem('historico') || '[]');
  }
  if (!Array.isArray(typeof tarefasPendentes !== 'undefined' ? tarefasPendentes : undefined)) {
    tarefasPendentes = JSON.parse(AppStorage.getItem('tarefasPendentes') || '[]');
  }

  // Sistema de bloqueios
  let tarefasBloqueadas = JSON.parse(AppStorage.getItem('tarefasBloqueadas') || '[]');

  // Aceleração global — boosters ativos
  let accelBoosts = JSON.parse(AppStorage.getItem('accelBoosts') || '[]');
  let _tickHandle = null,
    lastCheckpointAt = 0;
  let lastCheckpointBlocks = AppStorage.getItem('tarefasBloqueadas') || '[]';
  let lastCheckpointBoosts = AppStorage.getItem('accelBoosts') || '[]';
  let clockRows = [],
    renderedBlockKey = '',
    countdownVisible = true;
  window._tickHandle = null;
  // -----------------------------
  // HELPERS / TABELAS
  // -----------------------------

  const REDUTOR_IDS_BY_HOURS = {
    6: 'REDUZIR_BLOQUEIO_6H',
    12: 'REDUZIR_BLOQUEIO_12H',
    24: 'REDUZIR_BLOQUEIO_1D',
    72: 'REDUZIR_BLOQUEIO_3D',
    96: 'ACELERAR_GLOBAL_4D_1H',
  };

  const LIMITES_TAREFA_HORAS = Economy.config.cooldowns;

  // >>> DURAÇÃO dos redutores como efeito cronometrado
  const REDUTOR_DURACAO_MS = Object.fromEntries(Economy.config.services.filter((s) => s.reduceHours).map((s) => [s.id, Economy.config.reducerDurationMs]));

  function getBloqueioMsPorTarefa(nome) {
    const horas = LIMITES_TAREFA_HORAS[nome] || 0;
    return horas * 60 * 60 * 1000;
  }

  function getRedutorIdFromOption(opt) {
    const h = parseInt(opt?.dataset?.reduzHoras || '0', 10);
    return REDUTOR_IDS_BY_HOURS[h] || null;
  }

  const REDUTOR_LABELS = {
    REDUZIR_BLOQUEIO_6H: 'Reduzir 6h',
    REDUZIR_BLOQUEIO_12H: 'Reduzir 12h',
    REDUZIR_BLOQUEIO_1D: 'Reduzir 1 dia',
    REDUZIR_BLOQUEIO_3D: 'Reduzir 3 dias',
    ACELERAR_GLOBAL_4D_1H: 'Reduzir 4 dias',
  };

  function getBlockedDisplayName(nome) {
    if (REDUTOR_LABELS[nome]) return ` ${REDUTOR_LABELS[nome]} ⌛`;
    return nome;
  }

  function fmtTempoRestante(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${d}d ${h}h ${m}m`;
  }

  function parseTarefa(val) {
    const [valorStr, tarefa, descricao] = (val || '').split('|');
    return {
      valor: getEconomy().prices[tarefa] || 0,
      tarefa: tarefa || '',
      descricao: descricao || '',
    };
  }

  // -----------------------------
  // ATUALIZAÇÕES DE UI
  // -----------------------------

  function atualizarSaldo() {
    saldoDominadora = Economy.round(saldoDominadora);
    if (!saldoElement) return;
    saldoElement.textContent =
      typeof formatBR === 'function'
        ? formatBR(saldoDominadora)
        : (saldoDominadora || 0).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
    AppStorage.setItem('saldoDominadora', saldoDominadora);
  }

  function getFilteredHistorico() {
    const selected = filterDateInput && filterDateInput.value ? new Date(filterDateInput.value + 'T00:00:00') : null;
    const dayStart = selected ? new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), 0, 0, 0, 0) : null;
    const dayEnd = selected ? new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), 23, 59, 59, 999) : null;

    return historico
      .filter((h) => {
        if (!h.timestamp) return false;
        if (!selected) return true;
        const t = new Date(h.timestamp);
        return t >= dayStart && t <= dayEnd;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  function renderHistorico() {
    if (!historicoElement) return;
    const filtered = getFilteredHistorico();
    if (enviarHistoricoWhatsAppBtn) enviarHistoricoWhatsAppBtn.hidden = !filtered.length;
    WalletHistoryView.render(historicoElement, filtered, (timestamp) => window.deletarItemHistorico(timestamp));
  }

  function adicionarHistorico(descricao, valor, tipo, detalhesBonus = null) {
    saldoDominadora = Economy.round(saldoDominadora);
    const timestamp = new Date().toISOString();

    const entry = {
      descricao,
      valor,
      tipo,
      saldoAtual: saldoDominadora,
      timestamp,
    };

    if (detalhesBonus) {
      entry.valorOriginal = detalhesBonus.valorOriginal;
      entry.valorFinal = detalhesBonus.valorFinal;
      entry.diferenca = detalhesBonus.diferenca;
      entry.percentual = detalhesBonus.percentual;
    }

    historico.unshift(entry);
    AppStorage.setItem('historico', JSON.stringify(historico));
    renderHistorico();
  }

  window.deletarItemHistorico = async function (timestamp) {
    const idx = historico.findIndex((h) => h.timestamp === timestamp);
    if (idx === -1) return;

    const item = historico[idx];

    if (!(await AppDialog.confirm('Arquivar este registro? O saldo, tarefas e benefícios já adquiridos serão mantidos.'))) return;
    const archived = JSON.parse(AppStorage.getItem('archivedHistory') || '[]');
    archived.push(item);
    AppStorage.setItem('archivedHistory', JSON.stringify(archived));

    // Remove do array
    historico.splice(idx, 1);

    // Persiste tudo
    AppStorage.setItem('historico', JSON.stringify(historico));
    AppStorage.setItem('saldoDominadora', saldoDominadora);

    atualizarSaldo();
    renderHistorico();
  };

  // -----------------------------
  // TAREFAS LIMITADAS (bloqueios)
  // -----------------------------

  window.removerTarefaLimitada = function (nome) {
    tarefasBloqueadas = tarefasBloqueadas.filter((t) => t.nome !== nome);
    AppStorage.setItem('tarefasBloqueadas', JSON.stringify(tarefasBloqueadas));
    atualizarTarefasLimitadasUI();
    atualizarBloqueiosNoSelectTarefa();
  };

  function atualizarTarefasLimitadasUI() {
    const lista = document.getElementById('tarefasLimitadasLista');
    if (!lista) return;

    settleAcceleration();
    const agora = Date.now();
    lista.innerHTML = '';
    clockRows = [];
    renderedBlockKey = tarefasBloqueadas.map((t) => t.nome).join('|');

    // Remove expiradas e persiste
    tarefasBloqueadas = (tarefasBloqueadas || []).filter((t) => t.expiraEm > agora);

    if (tarefasBloqueadas.length === 0) {
      lista.innerHTML = '<p style="color:#aaa;">Nenhuma tarefa limitada ativa.</p>';
      return;
    }

    tarefasBloqueadas.forEach((tarefa) => {
      const div = document.createElement('div');
      const nomeBonito = getBlockedDisplayName(tarefa.nome);

      const now0 = Date.now();
      const diffMs0 = Math.max(tarefa.expiraEm - now0, 0);
      const d0 = Math.floor(diffMs0 / 86400000);
      const h0 = Math.floor((diffMs0 % 86400000) / 3600000);
      const m0 = Math.floor((diffMs0 % 3600000) / 60000);
      const s0 = Math.floor((diffMs0 % 60000) / 1000);
      const pad2local = (n) => String(n).padStart(2, '0');
      const inicioCD = `${d0}d ${pad2local(h0)}h ${pad2local(m0)}m ${pad2local(s0)}s`;

      div.innerHTML = `
  <span class="tempo-restante" data-expira="${tarefa.expiraEm}" data-nome="${tarefa.nome}">
    🔒 <b>${nomeBonito}</b> <span class="acceleration-source-note" hidden></span> —
    <span class="relogio">${inicioCD}</span><span class="acceleration-row-tag" hidden>Acelerado</span>
  </span>
  <hr>
`;
      const duration = getBloqueioMsPorTarefa(tarefa.nome);
      if (duration > 0) {
        const progress = document.createElement('progress');
        progress.className = 'limit-progress';
        progress.max = duration;
        progress.value = Math.min(duration, diffMs0);
        progress.dataset.duration = duration;
        progress.setAttribute('aria-label', 'Tempo restante: ' + nomeBonito);
        div.append(progress);
      }
      lista.appendChild(div);
      clockRows.push({
        name: tarefa.nome,
        row: div,
        wrap: div.querySelector('.tempo-restante'),
        time: div.querySelector('.relogio'),
        progress: div.querySelector('.limit-progress'),
        tag: div.querySelector('.acceleration-row-tag'),
        sourceNote: div.querySelector('.acceleration-source-note'),
      });
    });
  }

  function formatDiff(ms) {
    let seconds = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    const pad = (n) => String(n).padStart(2, '0');
    return days + 'd ' + pad(hours) + 'h ' + pad(minutes) + 'm ' + pad(seconds) + 's';
  }
  function formatEffectTime(ms) {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);
    return (seconds >= 3600 ? String(Math.floor(seconds / 3600)).padStart(2, '0') + ':' : '') + String(Math.floor(seconds / 60) % 60).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }
  function updateClocksOnce() {
    settleAcceleration();
    const key = tarefasBloqueadas.map((t) => t.nome).join('|');
    if (key !== renderedBlockKey) {
      atualizarTarefasLimitadasUI();
      atualizarBloqueiosNoSelectTarefa();
    }
    const now = Date.now(),
      rate = WalletAcceleration.rate(accelBoosts, now);
    const byName = new Map(tarefasBloqueadas.map((t) => [t.nome, t]));
    for (const row of clockRows) {
      const block = byName.get(row.name);
      if (!block) continue;
      const remaining = Math.max(0, block.expiraEm - now);
      if (row.wrap.dataset.expira !== String(block.expiraEm)) row.wrap.dataset.expira = String(block.expiraEm);
      const caption = formatDiff(remaining);
      if (row.time.textContent !== caption) row.time.textContent = caption;
      const accelerated = rate > 0 && WalletAcceleration.eligible(row.name);
      if (row.row.classList.contains('is-accelerated') !== accelerated) row.row.classList.toggle('is-accelerated', accelerated);
      row.tag.hidden = !accelerated;
      const sources = accelBoosts.filter((boost) => boost.source === row.name);
      row.sourceNote.hidden = WalletAcceleration.eligible(row.name) && !sources.length;
      let sourceText = 'Bloqueio do redutor';
      if (sources.length) {
        const end = Math.max(...sources.map((boost) => boost.endsAt));
        const budgets = sources.map((boost) => (Number.isFinite(boost.startedAt) ? (boost.perSecondMs * (boost.endsAt - boost.startedAt)) / 1000 : null));
        const totalHours = budgets.every(Number.isFinite) ? budgets.reduce((sum, n) => sum + n, 0) / 3600000 : null;
        const reduction = totalHours !== null ? '−' + Number(totalHours.toFixed(2)).toLocaleString('pt-BR') + 'h · ' : '';
        sourceText = 'Efeito ativo: ' + reduction + 'termina em ' + formatEffectTime(end - now);
      }
      if (row.sourceNote.textContent !== sourceText) row.sourceNote.textContent = sourceText;
      if (row.progress) row.progress.value = Math.min(row.progress.max, remaining);
    }
    const status = document.getElementById('accelerationStatus');
    if (status) {
      status.hidden = !accelBoosts.length;
      const affected = tarefasBloqueadas.filter((block) => WalletAcceleration.eligible(block.nome)).length;
      const text = accelBoosts.length + (accelBoosts.length === 1 ? ' efeito ativo' : ' efeitos ativos') + ' · ' + affected + (affected === 1 ? ' prazo acelerado' : ' prazos acelerados');
      status.title = 'Os serviços marcados como Acelerado recebem a redução. O bloqueio dos próprios redutores continua no ritmo normal.';
      if (status.textContent !== text) status.textContent = text;
    }
  }
  function scheduleNextTick() {
    if (_tickHandle !== null) clearTimeout(_tickHandle);
    _tickHandle = null;
    window._tickHandle = null;
    if (document.hidden) return;
    const fast = accelBoosts.length && clockRows.some((row) => WalletAcceleration.eligible(row.name)) && countdownVisible && !document.getElementById('simulator').hidden;
    _tickHandle = setTimeout(
      () => {
        _tickHandle = null;
        updateClocksOnce();
        scheduleNextTick();
      },
      fast ? 50 : 1000,
    );
    window._tickHandle = _tickHandle;
  }
  document.addEventListener('visibilitychange', () => {
    settleAcceleration(true);
    if (!document.hidden) updateClocksOnce();
    scheduleNextTick();
  });
  window.addEventListener('pageshow', () => {
    updateClocksOnce();
    scheduleNextTick();
  });

  function atualizarBloqueiosNoSelectTarefa() {
    const agora = Date.now();

    const bloqueadas = tarefasBloqueadas.filter((t) => t.expiraEm > agora);
    const map = new Map(bloqueadas.map((t) => [t.nome, t.expiraEm]));

    Array.from(selectTarefaSelect.options).forEach((opt) => {
      if (!opt || !opt.value || opt.value === '0' || opt.dataset.placeholder === '1') return;

      const redId = getRedutorIdFromOption(opt);
      const { tarefa: nomeTarefa } = parseTarefa(opt.value);
      const keyName = redId || nomeTarefa;

      if (!opt.dataset.labelOriginal) opt.dataset.labelOriginal = opt.textContent;

      const expira = map.get(keyName);
      const isLocked = typeof expira === 'number';

      opt.disabled = !!isLocked;
      opt.classList.toggle('locked', !!isLocked);

      if (isLocked) {
        const restante = fmtTempoRestante(expira - agora);
        const base = opt.dataset.labelOriginal;
        opt.textContent = base.startsWith('🔒') ? base : `🔒 ${base}`;
        opt.title = `Bloqueada — libera em ${restante}`;
      } else {
        opt.textContent = opt.dataset.labelOriginal;
        opt.title = '';
      }
    });
  }

  function settleAcceleration(force = false) {
    const now = Date.now();
    const state = WalletAcceleration.advance(tarefasBloqueadas, accelBoosts, now);
    tarefasBloqueadas = state.blocks;
    accelBoosts = state.boosts;
    if (force || now - lastCheckpointAt >= 1000) {
      const blocks = JSON.stringify(tarefasBloqueadas),
        boosts = JSON.stringify(accelBoosts);
      if (blocks !== lastCheckpointBlocks || boosts !== lastCheckpointBoosts) {
        AppStorage.setItem('tarefasBloqueadas', blocks);
        AppStorage.setItem('accelBoosts', boosts);
        AppStorage.flush();
        lastCheckpointBlocks = blocks;
        lastCheckpointBoosts = boosts;
      }
      lastCheckpointAt = now;
    }
  }
  function replaceBlocks(incoming) {
    const previous = new Map(JSON.parse(lastCheckpointBlocks).map((t) => [t.nome, t.expiraEm]));
    settleAcceleration();
    const live = new Map(tarefasBloqueadas.map((t) => [t.nome, t]));
    tarefasBloqueadas = (Array.isArray(incoming) ? incoming : []).flatMap((t) => (previous.get(t.nome) === t.expiraEm ? (live.has(t.nome) ? [live.get(t.nome)] : []) : [t]));
    settleAcceleration(true);
  }
  function startGlobalAcceleration(perSecondMs, durationMs, totalToReduceMs, sourceTag = 'GLOBAL') {
    if (![perSecondMs, durationMs, totalToReduceMs].every((n) => Number.isFinite(n) && n > 0)) throw new Error('Redutor inválido.');
    settleAcceleration(true);
    const now = Date.now();
    accelBoosts.push({ id: crypto.randomUUID(), perSecondMs, startedAt: now, endsAt: now + durationMs, lastAppliedAt: now, budgetLeftMs: totalToReduceMs, source: String(sourceTag) });
    settleAcceleration(true);
    updateClocksOnce();
    scheduleNextTick();
  }
  function startTimedReducer(id, hours, duration) {
    const total = hours * 3600000;
    startGlobalAcceleration(total / (duration / 1000), duration, total, id);
  }
  function resumeAccelerationIfNeeded() {
    settleAcceleration(true);
    updateClocksOnce();
    scheduleNextTick();
  }

  // -----------------------------
  // BRIDGE para Dev Tools + listener
  // -----------------------------
  window.__AppCtl = {
    stopAccel() {
      try {
        settleAcceleration(true);
        accelBoosts = [];
        settleAcceleration(true);
        scheduleNextTick();
        try {
          atualizarTarefasLimitadasUI();
          atualizarBloqueiosNoSelectTarefa();
          updateClocksOnce();
        } catch {}
        return true;
      } catch {
        return false;
      }
    },
    setBlocks(arr) {
      try {
        replaceBlocks(arr);
        try {
          atualizarTarefasLimitadasUI();
          atualizarBloqueiosNoSelectTarefa();
        } catch {}
        return true;
      } catch {
        return false;
      }
    },
    nukeAll() {
      const a = this.stopAccel();
      const b = this.setBlocks([]);
      return a && b;
    },
  };

  window.addEventListener('accel:stop-all', () => {
    try {
      window.__AppCtl.stopAccel();
    } catch {}
  });

  // -----------------------------
  // EVENTOS
  // -----------------------------

  if (bonusCheckbox) {
    try {
      bonusCheckbox.checked = !!bonusEspecialAtivo;
    } catch {}
    bonusCheckbox.addEventListener('change', () => {
      window.bonusEspecialAtivo = bonusCheckbox.checked;
      AppStorage.setItem('bonusEspecialAtivo', JSON.stringify(bonusEspecialAtivo));
      if (typeof updateBonusEspecialUI === 'function') updateBonusEspecialUI();
    });
  }

  if (tipoTransacaoSelect) {
    tipoTransacaoSelect.addEventListener('change', function () {
      const compraFields = document.getElementById('compraFields');
      const ganhoFields = document.getElementById('ganhoFields');
      if (compraFields) compraFields.style.display = this.value === 'gasto' ? 'block' : 'none';
      if (ganhoFields) ganhoFields.style.display = this.value === 'ganho' ? 'block' : 'none';
    });
  }

  if (selectTarefaSelect) {
    selectTarefaSelect.addEventListener('change', () => {
      const { descricao } = parseTarefa(selectTarefaSelect.value);
      if (descricaoTransacaoInput) descricaoTransacaoInput.value = descricao || '';
    });
  }

  if (aplicarFiltroBtn) aplicarFiltroBtn.addEventListener('click', () => renderHistorico());
  if (limparFiltroBtn) {
    limparFiltroBtn.addEventListener('click', () => {
      if (filterDateInput) filterDateInput.value = '';
      renderHistorico();
    });
  }

  if (enviarHistoricoWhatsAppBtn) {
    enviarHistoricoWhatsAppBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      try {
        const numeroWhatsApp = ''; // recipient is chosen in WhatsApp
        const filtered = getFilteredHistorico();
        if (!filtered.length) return AppDialog.alert('Não há itens no histórico para enviar.');
        const dataSelec = filterDateInput && filterDateInput.value ? new Date(filterDateInput.value) : null;
        const titulo = dataSelec ? `📅 Histórico do dia ${dataSelec.toLocaleDateString('pt-BR')}` : '📜 Histórico completo (mais recentes primeiro)';
        const linhas = filtered.map((h, idx) => {
          const d = new Date(h.timestamp);
          const quando = d.toLocaleString('pt-BR');
          const tipo = h.tipo === 'gasto' ? 'Gasto' : 'Ganho';
          const val = (h.valor || 0).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          return `${idx + 1}. [${quando}] ${tipo}: ${h.descricao} — ${val}`;
        });
        const total = filtered.reduce((acc, h) => acc + (h.tipo === 'gasto' ? -h.valor : h.valor), 0);
        const totalFmt = total.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });
        const saldoFmt = (typeof saldoDominadora !== 'undefined' ? saldoDominadora : 0).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });
        const mensagem = `${titulo}\n\n${linhas.join('\n')}\n\n— Total líquido no período: *${totalFmt}*\n— Saldo atual: *${saldoFmt}*`;
        const urlWhatsApp = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
        window.open(urlWhatsApp, '_blank');
      } catch (e) {
        console.error('Falha ao abrir WhatsApp:', e);
        AppDialog.alert('Não foi possível abrir o WhatsApp. Tente novamente.');
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      if (!(await AppDialog.confirm('Tem certeza que deseja zerar o saldo?'))) return;
      const oldBalance = saldoDominadora;
      saldoDominadora = 0;
      adicionarHistorico('Ajuste manual de saldo: ' + oldBalance + ' → 0', 0, 'ajuste');
      try {
        AppStorage.setItem('saldoDominadora', '0');
      } catch {}
      atualizarSaldo();
      renderHistorico();
    });
  }

  if (limparBtn) {
    limparBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      if (!historico || historico.length === 0) return AppDialog.alert('O histórico já está vazio.');
      if (!(await AppDialog.confirm('Arquivar todo o histórico? O saldo será mantido e o arquivo continuará no backup.'))) return;
      const archive = JSON.parse(AppStorage.getItem('archivedHistory') || '[]');
      AppStorage.setItem('archivedHistory', JSON.stringify([...archive, ...historico]));

      historico.length = 0;
      try {
        AppStorage.setItem('historico', JSON.stringify([]));
      } catch {}
      if (filterDateInput) filterDateInput.value = '';
      renderHistorico();
    });
  }

  if (adicionarBtn) {
    adicionarBtn.addEventListener('click', async () => {
      const tipo = (tipoTransacaoSelect && tipoTransacaoSelect.value) || 'gasto';
      let valor, tarefa, descricao;

      if (tipo === 'gasto') {
        settleAcceleration(true);
        const tarefaSelecionada = (selectTarefaSelect && selectTarefaSelect.value) || '';
        if (!tarefaSelecionada || tarefaSelecionada === '0') return AppDialog.alert('Por favor, selecione uma tarefa.');
        ({ valor, tarefa, descricao } = parseTarefa(tarefaSelecionada));

        const optSel = selectTarefaSelect?.selectedOptions?.[0] || null;
        const catalogItem = Economy.config.services.find((s) => s.id === tarefa);
        if (!catalogItem || !(valor > 0)) return AppDialog.alert('Selecione um serviço válido.');
        if (tarefasBloqueadas.some((b) => b.nome === tarefa && b.expiraEm > Date.now())) return AppDialog.alert('Este item ainda está em cooldown.');
        let quote;
        try {
          quote = Economy.serviceCost(getEconomy(), catalogItem, Number(document.getElementById('dinnerGuestCount').value), window.bonusEspecialAtivo);
        } catch (error) {
          return AppDialog.alert(error.message);
        }
        const originalCost = quote.original;
        const receivesDiscount = quote.discounted;
        valor = quote.final;
        if (!(await AppDialog.confirm('Confirmar compra de ' + catalogItem.label + ' por ' + formatBR(valor) + ' do Saldo Dominadora?'))) return;

        settleAcceleration(true);
        // ⚡ Aceleração Global
        if (/ACELERAR_GLOBAL_4D_1H/.test((selectTarefaSelect && selectTarefaSelect.value) || '')) {
          const custo = valor;
          if (saldoDominadora < custo) return AppDialog.alert('Saldo insuficiente!');

          const REDUZ_TOTAL_MS = 4 * 24 * 60 * 60 * 1000; // 4 dias
          const DURACAO_MS = Economy.config.reducerDurationMs; // 5 minutos
          const perSecondMs = REDUZ_TOTAL_MS / (DURACAO_MS / 1000);

          saldoDominadora -= custo;
          atualizarSaldo();
          adicionarHistorico('Aceleração global (− tempo cronometrado)', custo, 'gasto');

          startGlobalAcceleration(perSecondMs, DURACAO_MS, REDUZ_TOTAL_MS, 'ACELERAR_GLOBAL_4D_1H');

          try {
            const agora2 = Date.now();
            const cdMs = getBloqueioMsPorTarefa('ACELERAR_GLOBAL_4D_1H');
            if (cdMs > 0) {
              tarefasBloqueadas.push({
                nome: 'ACELERAR_GLOBAL_4D_1H',
                expiraEm: agora2 + cdMs,
              });
              AppStorage.setItem('tarefasBloqueadas', JSON.stringify(tarefasBloqueadas));
              atualizarTarefasLimitadasUI();
              atualizarBloqueiosNoSelectTarefa();
            }
          } catch {}

          if (selectTarefaSelect) selectTarefaSelect.value = '';
          return;
        }

        const horasReducao = optSel?.dataset?.reduzHoras ? parseInt(optSel.dataset.reduzHoras, 10) : 0;

        // ===== REDUTORES: agora cronometrados =====
        if (horasReducao > 0) {
          const agora = Date.now();
          const redutorId = getRedutorIdFromOption(optSel) || 'REDUTOR';
          const cooldownMs = getBloqueioMsPorTarefa(redutorId);

          if (cooldownMs > 0) {
            const jaBloqueado = tarefasBloqueadas.find((t) => t.nome === redutorId && t.expiraEm > agora);
            if (jaBloqueado) {
              AppDialog.alert(`⏳ "${descricao || tarefa}" ainda está em cooldown.\nLibera em ${fmtTempoRestante(jaBloqueado.expiraEm - agora)}.`);
              return;
            }
          }

          if (saldoDominadora < valor) return AppDialog.alert('Saldo insuficiente!');
          saldoDominadora -= valor;
          atualizarSaldo();

          const duracaoMs = (optSel?.dataset?.reduzDuracaoMs && parseInt(optSel.dataset.reduzDuracaoMs, 10)) || REDUTOR_DURACAO_MS[redutorId] || 60 * 1000;

          startTimedReducer(redutorId, horasReducao, duracaoMs);

          if (cooldownMs > 0) {
            tarefasBloqueadas.push({
              nome: redutorId,
              expiraEm: agora + cooldownMs,
            });
            AppStorage.setItem('tarefasBloqueadas', JSON.stringify(tarefasBloqueadas));
          }

          adicionarHistorico(`Redução cronometrada (−${horasReducao}h em ${Math.round(duracaoMs / 1000)}s)`, valor, 'gasto');
          atualizarTarefasLimitadasUI();
          atualizarBloqueiosNoSelectTarefa();
          return;
        }

        // ===== COMPRA NORMAL =====
        if (saldoDominadora < valor) return AppDialog.alert('Saldo insuficiente!');

        const agora = Date.now();
        const msBloqueio = getBloqueioMsPorTarefa(tarefa);
        if (msBloqueio > 0) {
          const bloqueada = tarefasBloqueadas.find((t) => t.nome === tarefa && t.expiraEm > agora);
          if (bloqueada) {
            AppDialog.alert(`❌ "${tarefa}" ainda está bloqueada por tempo.\nLibera em ${fmtTempoRestante(bloqueada.expiraEm - agora)}.`);
            return;
          }
          const expiraEm = agora + msBloqueio;
          tarefasBloqueadas.push({ nome: tarefa, expiraEm });
          AppStorage.setItem('tarefasBloqueadas', JSON.stringify(tarefasBloqueadas));
          atualizarTarefasLimitadasUI();
          atualizarBloqueiosNoSelectTarefa();
        }

        const valorOriginal = originalCost;
        const valorFinal = valor;
        const diferenca = Economy.round(valorFinal - valorOriginal);
        const percentual = receivesDiscount ? -getEconomy().discountPercent : 0;

        saldoDominadora -= valorFinal;

        adicionarHistorico(tarefa === 'Cozinhar jantar' ? tarefa + ' · ' + document.getElementById('dinnerGuestCount').value + ' amiga(s)' : tarefa, valorFinal, 'gasto', {
          valorOriginal,
          valorFinal,
          diferenca,
          percentual,
        });

        const novaTarefa = {
          id: Date.now(),
          tarefa: tarefa,
          taskCount: catalogItem.taskCount || 1,
          ...(tarefa === 'Cozinhar jantar' ? { guestCount: Number(document.getElementById('dinnerGuestCount').value) } : {}),
          descricao: descricao,
          valor: valorFinal,
          timestamp: new Date().toISOString(),
        };
        tarefasPendentes.unshift(novaTarefa);
        AppStorage.setItem('tarefasPendentes', JSON.stringify(tarefasPendentes));
        if (typeof renderTarefasPendentes === 'function') renderTarefasPendentes();

        atualizarSaldo();
        if (typeof aplicarBonusDeTarefaDuranteTimer === 'function') {
          try {
            aplicarBonusDeTarefaDuranteTimer(valor, tarefa);
          } catch {}
        }
      } else {
        // ===== GANHO =====
        const ganhoSelecionado = (selectGanhoSelect && selectGanhoSelect.value) || '';
        const valorInput = valorGanhoInput && valorGanhoInput.value;
        if (!ganhoSelecionado || !valorInput || !Number.isFinite(Number(valorInput)) || Number(valorInput) <= 0) return AppDialog.alert('Por favor, selecione uma forma de ganho e insira um valor válido.');

        valor = Economy.round(Number(valorInput));
        if (getEconomy().gains[ganhoSelecionado] !== undefined) {
          calcularValorGanho();
          valor = Number(valorGanhoInput.value);
        }
        if (!(valor > 0) || (!getEconomy().gains[ganhoSelecionado] && valor > getEconomy().manualGainMax)) return AppDialog.alert('Ganho manual acima do limite configurado.');
        tarefa = ganhoSelecionado;

        const extraLabels = Array.from(document.querySelectorAll('#gainExtras input:checked'), (box) => Economy.config.extras[box.dataset.extraId]?.label || box.dataset.extraId);
        if (extraLabels.length) tarefa += ' (' + extraLabels.join(' + ') + ')';
        const multBonus = typeof getBonusEspecialMultiplier === 'function' ? getBonusEspecialMultiplier() : 1;

        const valorOriginal = valor;
        const valorFinal = Math.round(valorOriginal * multBonus * 100) / 100;
        const diferenca = valorFinal - valorOriginal;

        const percentualRaw = (multBonus - 1) * 100;
        const percentual = Math.round(percentualRaw);

        saldoDominadora += valorFinal;

        adicionarHistorico(tarefa, valorFinal, 'ganho', {
          valorOriginal,
          valorFinal,
          diferenca,
          percentual,
        });

        if (selectGanhoSelect) selectGanhoSelect.value = '';
        renderGainExtras('', getEconomy());
        if (valorGanhoInput) valorGanhoInput.value = '0';
        atualizarSaldo();

        if (typeof aplicarBonusDeTarefaDuranteTimer === 'function') {
          try {
            aplicarBonusDeTarefaDuranteTimer(valor, ganhoSelecionado);
          } catch {}
        }

        if (typeof RainMoney !== 'undefined') {
          try {
            const rainBurst = new RainMoney('💵', 'low');
            rainBurst.startBurningEffect(3000, '🔥', 2000);
          } catch {}
        }
      }
    });
  }

  // ===========================
  // TIMER (usa timer.js)
  // ===========================
  if (btnPlayPause && btnTerminar && tempoDisplay && valorAcumuladoDisplay && valorPorMinutoInput) {
    if (typeof atualizarDisplay === 'function') atualizarDisplay();

    selectGanhoSelect.addEventListener('change', () => {
      if (tipoTransacaoSelect.value !== 'ganho' || timerEmSessao) return;
      const id = selectGanhoSelect.value;
      if (id && (id === 'Outro' || Object.hasOwn(getEconomy().gains, id) || Object.hasOwn(getEconomy().games, id))) btnPlayPause.click();
    });
    btnPlayPause.addEventListener('click', () => {
      try {
        if (!timerEmSessao) {
          baseMultiplicadorSessao = getEconomy().timer.base;
          somaIncrementosValorSessao = 0;
          contadorTarefasTimer = 0;
          valorPorMinutoInput.value = baseMultiplicadorSessao;
          timerEmSessao = true;
          sessionHasEligibleTask = false;
          sessionDynamicActivities.clear();
          legacyDynamicActivity = false;
          renderDynamicCombo();
          if (typeof atualizarValorAcumulado === 'function') atualizarValorAcumulado();
        }

        if (timerInterval) {
          syncTimer();
          atualizarDisplay();
          clearInterval(timerInterval);
          timerInterval = null;
          btnPlayPause.textContent = '▶️ Continuar';
          persistTimer();
          if (typeof releaseWakeLock === 'function') releaseWakeLock();
          return;
        }

        if (typeof requestWakeLock === 'function') requestWakeLock();

        timerLastTick = Date.now();
        timerInterval = setInterval(() => {
          syncTimer();
          atualizarDisplay();
        }, 1000);
        persistTimer();

        btnPlayPause.textContent = '⏸️ Pausar';
      } catch (e) {
        console.error('Erro no timer:', e);
      }
    });

    btnTerminar.addEventListener('click', () => {
      try {
        if (!timerEmSessao) return;

        if (timerInterval) {
          syncTimer();
          atualizarDisplay();
          clearInterval(timerInterval);
          timerInterval = null;
        }
        if (typeof releaseWakeLock === 'function') releaseWakeLock();

        const vpm = parseFloat(valorPorMinutoInput.value) || 0;
        if (vpm <= 0) return AppDialog.alert('Insira um valor válido por minuto antes de terminar.');

        let valorTotal = Economy.round(timerEarnedUnits / 6000);

        const multBonus = typeof getBonusEspecialMultiplier === 'function' ? getBonusEspecialMultiplier() : 1;

        const valorCredito = Math.round(valorTotal * multBonus * 100) / 100;

        if (valorCredito > 0) {
          saldoDominadora += valorCredito;
          adicionarHistorico(`Ganho por tempo (${tempoDisplay.textContent})`, valorCredito, 'ganho', {
            valorOriginal: valorTotal,
            valorFinal: valorCredito,
            diferenca: valorCredito - valorTotal,
            percentual: Math.round((multBonus - 1) * 100),
          });
          atualizarSaldo();
        }

        valorPorMinutoInput.value = getEconomy().timer.base;
        contadorTarefasTimer = 0;
        somaIncrementosValorSessao = 0;
        baseMultiplicadorSessao = 1;
        timerEmSessao = false;
        sessionHasEligibleTask = false;
        sessionDynamicActivities.clear();
        legacyDynamicActivity = false;
        renderDynamicCombo();
        tempoSegundos = 0;
        timerEarnedUnits = 0;
        persistTimer();

        if (typeof atualizarDisplay === 'function') atualizarDisplay();
        btnPlayPause.textContent = '▶️ Começar';
        window.dispatchEvent(new CustomEvent('timer:settled', { detail: { amount: valorCredito } }));
      } catch (e) {
        console.error('Erro ao finalizar timer:', e);
      }
    });
  }

  // -----------------------------
  // Cross-ledger transactions update the legacy in-memory state before the next action.
  window.addEventListener('wallet:credits', () => {
    saldoDominadora = Number(AppStorage.getItem('saldoDominadora') || 0);
    historico = JSON.parse(AppStorage.getItem('historico') || '[]');
    replaceBlocks(JSON.parse(AppStorage.getItem('tarefasBloqueadas') || '[]'));
    atualizarSaldo();
    renderHistorico();
    atualizarTarefasLimitadasUI();
    atualizarBloqueiosNoSelectTarefa();
  });
  window.addEventListener('wallet:remote', (event) => {
    const changed = (key) => !event.detail || event.detail.initial || event.detail.changedKeys.includes(key);
    if (changed('saldoDominadora')) {
      saldoDominadora = Number(AppStorage.getItem('saldoDominadora') || 0);
      atualizarSaldo();
    }
    if (changed('historico')) {
      historico = JSON.parse(AppStorage.getItem('historico') || '[]');
      renderHistorico();
    }
    if (changed('tarefasPendentes')) {
      tarefasPendentes = JSON.parse(AppStorage.getItem('tarefasPendentes') || '[]');
      renderTarefasPendentes();
    }
    if (changed('bonusEspecialAtivo')) {
      window.bonusEspecialAtivo = JSON.parse(AppStorage.getItem('bonusEspecialAtivo') || 'false');
      bonusCheckbox.checked = window.bonusEspecialAtivo;
      bonusCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (changed('tarefasBloqueadas') || changed('accelBoosts')) {
      tarefasBloqueadas = JSON.parse(AppStorage.getItem('tarefasBloqueadas') || '[]');
      accelBoosts = JSON.parse(AppStorage.getItem('accelBoosts') || '[]');
      lastCheckpointBlocks = AppStorage.getItem('tarefasBloqueadas') || '[]';
      lastCheckpointBoosts = AppStorage.getItem('accelBoosts') || '[]';
      lastCheckpointAt = Date.now();
      updateClocksOnce();
      atualizarBloqueiosNoSelectTarefa();
      scheduleNextTick();
    }
  });
  window.addEventListener('pagehide', () => {
    if (_tickHandle !== null) clearTimeout(_tickHandle);
    _tickHandle = null;
    window._tickHandle = null;
    settleAcceleration(true);
    AppStorage.setItem('tarefasBloqueadas', JSON.stringify(tarefasBloqueadas));
    AppStorage.setItem('accelBoosts', JSON.stringify(accelBoosts));
    AppStorage.flush();
  });
  // INICIALIZAÇÃO
  // -----------------------------
  atualizarSaldo();
  renderHistorico();
  if (typeof renderTarefasPendentes === 'function') renderTarefasPendentes();
  if (typeof updateBonusEspecialUI === 'function') updateBonusEspecialUI();
  atualizarTarefasLimitadasUI();
  if (typeof renderBoostsUI === 'function') renderBoostsUI();
  resumeAccelerationIfNeeded();
  atualizarBloqueiosNoSelectTarefa();

  Object.assign(window, {
    atualizarTarefasLimitadasUI,
    atualizarBloqueiosNoSelectTarefa,
    updateClocksOnce,
    startGlobalAcceleration,
    resumeAccelerationIfNeeded,
  });

  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver((entries) => {
      countdownVisible = entries[0].isIntersecting;
      updateClocksOnce();
      scheduleNextTick();
    }).observe(document.getElementById('tarefasLimitadasSection'));
  }
});
