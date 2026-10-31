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
  let _accelLoop = null; // requestAnimationFrame id
  let lastAccelSave = 0;
  let lastBlocksFrameSave = 0;
  function saveAccelBoosts() {
    if (accelBoosts.length && Date.now() - lastAccelSave < 1000) return;
    lastAccelSave = Date.now();
    AppStorage.setItem('accelBoosts', JSON.stringify(accelBoosts));
  }

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

    const agora = Date.now();
    lista.innerHTML = '';

    // Remove expiradas e persiste
    tarefasBloqueadas = (tarefasBloqueadas || []).filter((t) => t.expiraEm > agora);
    AppStorage.setItem('tarefasBloqueadas', JSON.stringify(tarefasBloqueadas));

    if (tarefasBloqueadas.length === 0) {
      lista.innerHTML = '<p style="color:#aaa;">Nenhuma tarefa limitada ativa.</p>';
      return;
    }

    function getBoostRestForSource(src) {
      const nowA = Date.now();
      let rem = 0;
      if (Array.isArray(accelBoosts)) {
        for (const b of accelBoosts) {
          if ((b?.source || '') === src) {
            const r = (b.endsAt || 0) - nowA;
            if (r > rem) rem = r;
          }
        }
      }
      return Math.max(0, rem);
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

      const srcName = tarefa.nome;
      let extra = '';
      const restForSrc = getBoostRestForSource(srcName);
      if (restForSrc > 0) {
        const hh = Math.floor(restForSrc / 3600000);
        const mm = Math.floor((restForSrc % 3600000) / 60000);
        const ss = Math.floor((restForSrc % 60000) / 1000);
        const pad2a = (n) => String(n).padStart(2, '0');
        const txt = `${pad2a(hh)}:${pad2a(mm)}:${pad2a(ss)}`;
        extra = ` <span style="color:#aaa">| aceleração ativa: <span class="boost-inline" data-source="${srcName}">${txt}</span></span>`;
      }

      div.innerHTML = `
  <span class="tempo-restante" data-expira="${tarefa.expiraEm}" data-nome="${tarefa.nome}">
    🔒 <b>${nomeBonito}</b> —
    <span class="relogio">${inicioCD}</span>${extra}
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
    });
  }

  // ===== Relógio global =====
  const pad2 = (n) => String(n).padStart(2, '0');
  function formatDiff(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${d}d ${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`;
  }

  /* ===================================================================
   CLOCK SMOOTH ENGINE
   =================================================================== */
  (function () {
    if (window.__clockSmooth) return;

    function pad2(n) {
      return String(n).padStart(2, '0');
    }
    function fmtDHMS(ms) {
      const d = Math.max(0, Math.floor(ms / 86400000));
      const h = Math.max(0, Math.floor((ms % 86400000) / 3600000));
      const m = Math.max(0, Math.floor((ms % 3600000) / 60000));
      const s = Math.max(0, Math.floor((ms % 60000) / 1000));
      return `${d}d ${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`;
    }

    function setInstant(wrap, ms) {
      const el = wrap.querySelector('.relogio');
      if (!el) return;
      const v = Math.max(0, Math.floor(ms));
      el.textContent = fmtDHMS(v);
      wrap.dataset.displayMs = String(v);
    }

    function startFromTo(wrap, fromMs, toMs) {
      const el = wrap.querySelector('.relogio');
      if (!el) return setInstant(wrap, toMs);

      if (wrap.__smoothCancel) {
        try {
          wrap.__smoothCancel();
        } catch {}
        wrap.__smoothCancel = null;
      }

      const fromS = Math.floor(Math.max(0, fromMs) / 1000);
      const toS = Math.floor(Math.max(0, toMs) / 1000);
      const steps = Math.max(0, fromS - toS);
      if (steps <= 1) {
        setInstant(wrap, toMs);
        return;
      }

      const TARGET_MS = 450;
      let stepDelay = Math.floor(TARGET_MS / steps);
      if (stepDelay < 4) stepDelay = 4;
      if (stepDelay > 50) stepDelay = 50;

      let cur = fromS;
      let timerId = 0;

      function tick() {
        cur -= 1;
        const curMs = Math.max(0, cur * 1000);
        el.textContent = fmtDHMS(curMs);
        wrap.dataset.displayMs = String(curMs);
        if (cur <= toS) {
          clearInterval(timerId);
          timerId = 0;
          setInstant(wrap, toMs);
          wrap.__smoothCancel = null;
        }
      }

      timerId = setInterval(tick, stepDelay);
      wrap.__smoothCancel = () => {
        if (timerId) clearInterval(timerId);
      };
    }

    window.__clockSmooth = {
      JUMP_THRESHOLD: 1100,
      setInstant,
      startFromTo,
    };
  })();

  function updateClocksOnce() {
    const agora = Date.now();
    const SNAP_MS = 250;
    const smooth = window.__clockSmooth || null;

    const expirados = [];

    function setInstantFallback(wrap, ms) {
      const el = wrap.querySelector('.relogio');
      if (!el) return;
      const d = Math.max(0, Math.floor(ms / 86400000));
      const h = Math.max(0, Math.floor((ms % 86400000) / 3600000));
      const m = Math.max(0, Math.floor((ms % 3600000) / 60000));
      const s = Math.max(0, Math.floor((ms % 60000) / 1000));
      const p2 = (n) => String(n).padStart(2, '0');
      el.textContent = `${d}d ${p2(h)}h ${p2(m)}m ${p2(s)}s`;
      wrap.dataset.displayMs = String(Math.max(0, Math.floor(ms)));
    }

    document.querySelectorAll('.tempo-restante').forEach((wrap) => {
      const expira = Number(wrap.dataset.expira);
      const el = wrap.querySelector('.relogio');
      if (!el || !Number.isFinite(expira)) return;

      const targetMs = expira - agora;
      const progress = wrap.parentElement.querySelector('.limit-progress');
      if (progress) progress.value = Math.max(0, Math.min(Number(progress.dataset.duration), targetMs));
      if (targetMs <= SNAP_MS) {
        expirados.push(wrap);
        return;
      }

      const shownMs = Number(wrap.dataset.displayMs);
      const haveShown = Number.isFinite(shownMs);
      const fromMs = haveShown ? shownMs : targetMs;

      const canSmooth = !!smooth && typeof smooth.startFromTo === 'function' && typeof smooth.setInstant === 'function' && typeof smooth.JUMP_THRESHOLD === 'number';
      const jump = fromMs - targetMs;

      if (canSmooth && jump > smooth.JUMP_THRESHOLD) {
        smooth.startFromTo(wrap, fromMs, targetMs);
      } else {
        if (canSmooth) smooth.setInstant(wrap, targetMs);
        else setInstantFallback(wrap, targetMs);
      }
    });

    if (expirados.length) {
      try {
        if (Array.isArray(tarefasBloqueadas)) {
          const now = Date.now();
          const nomes = new Set(expirados.map((w) => w.getAttribute('data-nome')).filter(Boolean));
          const before = tarefasBloqueadas.length;
          tarefasBloqueadas = tarefasBloqueadas.filter((t) => !(nomes.has(t.nome) || t.expiraEm <= now));
          if (tarefasBloqueadas.length !== before) {
            AppStorage.setItem('tarefasBloqueadas', JSON.stringify(tarefasBloqueadas));
          }
        }
      } catch {}

      expirados.forEach((wrap) => {
        const b = wrap.querySelector('b')?.outerHTML ?? '';
        wrap.innerHTML = `🔓 ${b} — <strong>liberou!</strong>`;
      });

      try {
        atualizarTarefasLimitadasUI();
        atualizarBloqueiosNoSelectTarefa();
      } catch {}
    }

    // contador de aceleração por fonte
    try {
      const now3 = Date.now();
      document.querySelectorAll('.boost-inline').forEach((el) => {
        const src = el.getAttribute('data-source') || '';
        let rem = 0;
        if (Array.isArray(accelBoosts)) {
          for (const b of accelBoosts) {
            if ((b?.source || '') === src) {
              const r = (b.endsAt || 0) - now3;
              if (r > rem) rem = r;
            }
          }
        }
        if (rem < 0) rem = 0;
        const hh = Math.floor(rem / 3600000);
        const mm = Math.floor((rem % 3600000) / 60000);
        const ss = Math.floor((rem % 60000) / 1000);
        const p2 = (n) => String(n).padStart(2, '0');
        el.textContent = `${p2(hh)}:${p2(mm)}:${p2(ss)}`;
      });
    } catch {}
  }

  let _tickHandle = null;
  window._tickHandle = null;

  function scheduleNextTick() {
    if (window.__ClockTicker) {
      if (window._tickHandle) {
        clearTimeout(window._tickHandle);
        window._tickHandle = null;
      }
      return;
    }
    const now = Date.now();
    const delay = 1000 - (now % 1000) + 5;
    _tickHandle = setTimeout(() => {
      updateClocksOnce();
      scheduleNextTick();
    }, delay);
    window._tickHandle = _tickHandle;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (_tickHandle) {
        clearTimeout(_tickHandle);
        _tickHandle = null;
        window._tickHandle = null;
      }
      updateClocksOnce();
      scheduleNextTick();
    }
  });

  updateClocksOnce();
  scheduleNextTick();

  function atualizarBloqueiosNoSelectTarefa() {
    const agora = Date.now();

    const bloqueadas = JSON.parse(AppStorage.getItem('tarefasBloqueadas') || '[]').filter((t) => t.expiraEm > agora);
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

  // ===== Motor de aceleração com orçamento + "source"
  function startGlobalAcceleration(perSecondMs, durationMs, totalToReduceMs, sourceTag = 'GLOBAL') {
    const nowWall = Date.now();
    const endsAt = nowWall + durationMs;

    const boost = {
      id: String(nowWall) + '-' + Math.floor(Math.random() * 1e6),
      perSecondMs: Number(perSecondMs),
      startedAt: nowWall,
      endsAt: endsAt,
      budgetLeftMs: Math.max(0, Math.round(totalToReduceMs)),
      source: String(sourceTag || 'GLOBAL'),
    };

    accelBoosts.push(boost);
    saveAccelBoosts();

    if (_accelLoop == null) {
      let lastPerf = performance.now();
      let carryFrac = 0;

      const tick = () => {
        _accelLoop = null;
        const nowPerf = performance.now();
        let dtMs = nowPerf - lastPerf;
        lastPerf = nowPerf;

        const wallNow = Date.now();

        accelBoosts = (accelBoosts || []).filter((b) => b.endsAt > wallNow && b.budgetLeftMs > 0);

        if (!accelBoosts.length) {
          saveAccelBoosts();
          try {
            atualizarTarefasLimitadasUI();
            atualizarBloqueiosNoSelectTarefa();
            updateClocksOnce();
          } catch {}
          return;
        }

        let toReduceFloat = carryFrac;
        for (const b of accelBoosts) {
          const remainTime = Math.max(0, b.endsAt - wallNow);
          if (remainTime <= 0 || b.budgetLeftMs <= 0) continue;

          const effectiveDt = Math.min(dtMs, remainTime);
          const contrib = (b.perSecondMs * effectiveDt) / 1000;
          const contribClamped = Math.min(contrib, b.budgetLeftMs);
          toReduceFloat += contribClamped;
          b.budgetLeftMs -= contribClamped;
        }

        const stepInt = Math.floor(toReduceFloat);
        carryFrac = toReduceFloat - stepInt;

        if (stepInt > 0 && Array.isArray(tarefasBloqueadas)) {
          let changed = false;
          const now2 = Date.now();
          tarefasBloqueadas = (tarefasBloqueadas || [])
            .map((t) => {
              if (t.expiraEm > now2) {
                if (t.nome === 'ACELERAR_GLOBAL_4D_1H') return t;
                if (/^REDUZIR_BLOQUEIO_/.test(t.nome)) return t;
                const novo = Math.max(now2, t.expiraEm - stepInt);
                if (novo !== t.expiraEm) changed = true;
                return { ...t, expiraEm: novo };
              }
              return t;
            })
            .filter((t) => t.expiraEm > now2);

          if (changed && Date.now() - lastBlocksFrameSave >= 1000) {
            lastBlocksFrameSave = Date.now();
            AppStorage.setItem('tarefasBloqueadas', JSON.stringify(tarefasBloqueadas));
            try {
              atualizarTarefasLimitadasUI();
              atualizarBloqueiosNoSelectTarefa();
            } catch {}
          }
        }

        saveAccelBoosts();
        _accelLoop = requestAnimationFrame(tick);
      };

      _accelLoop = requestAnimationFrame(tick);
    }
  }

  function startTimedReducer(redutorId, horasReducao, duracaoMs) {
    const totalMs = Math.max(0, (horasReducao || 0) * 60 * 60 * 1000);
    if (!totalMs || !duracaoMs) return;

    const perSecondMs = totalMs / (duracaoMs / 1000);
    startGlobalAcceleration(perSecondMs, duracaoMs, totalMs, redutorId);
  }

  function resumeAccelerationIfNeeded() {
    const agora = Date.now();
    accelBoosts = (accelBoosts || []).filter((b) => b.endsAt > agora);

    for (const b of accelBoosts) {
      if (typeof b.budgetLeftMs !== 'number') {
        const remainTime = Math.max(0, b.endsAt - agora);
        b.budgetLeftMs = Math.max(0, Math.round((b.perSecondMs || 0) * (remainTime / 1000)));
      }
    }
    saveAccelBoosts();

    if (accelBoosts.length && _accelLoop == null) {
      let lastPerf = performance.now();
      let carryFrac = 0;

      const tick = () => {
        _accelLoop = null;

        const nowPerf = performance.now();
        let dtMs = nowPerf - lastPerf;
        lastPerf = nowPerf;

        const wallNow = Date.now();

        accelBoosts = (accelBoosts || []).filter((b) => b.endsAt > wallNow && b.budgetLeftMs > 0);
        if (!accelBoosts.length) {
          saveAccelBoosts();
          try {
            atualizarTarefasLimitadasUI();
            atualizarBloqueiosNoSelectTarefa();
            updateClocksOnce();
          } catch {}
          return;
        }

        let toReduceFloat = carryFrac;
        for (const b of accelBoosts) {
          const remainTime = Math.max(0, b.endsAt - wallNow);
          if (remainTime <= 0 || b.budgetLeftMs <= 0) continue;
          const effectiveDt = Math.min(dtMs, remainTime);
          const contrib = (b.perSecondMs * effectiveDt) / 1000;
          const contribClamped = Math.min(contrib, b.budgetLeftMs);
          toReduceFloat += contribClamped;
          b.budgetLeftMs -= contribClamped;
        }
        const stepInt = Math.floor(toReduceFloat);
        carryFrac = toReduceFloat - stepInt;

        if (stepInt > 0 && Array.isArray(tarefasBloqueadas)) {
          let changed = false;
          const now2 = Date.now();
          tarefasBloqueadas = (tarefasBloqueadas || [])
            .map((t) => {
              if (t.expiraEm > now2) {
                if (t.nome === 'ACELERAR_GLOBAL_4D_1H') return t;
                if (/^REDUZIR_BLOQUEIO_/.test(t.nome)) return t;
                const novo = Math.max(now2, t.expiraEm - stepInt);
                if (novo !== t.expiraEm) changed = true;
                return { ...t, expiraEm: novo };
              }
              return t;
            })
            .filter((t) => t.expiraEm > now2);

          if (changed && Date.now() - lastBlocksFrameSave >= 1000) {
            lastBlocksFrameSave = Date.now();
            AppStorage.setItem('tarefasBloqueadas', JSON.stringify(tarefasBloqueadas));
            try {
              atualizarTarefasLimitadasUI();
              atualizarBloqueiosNoSelectTarefa();
            } catch {}
          }
        }

        saveAccelBoosts();
        _accelLoop = requestAnimationFrame(tick);
      };

      _accelLoop = requestAnimationFrame(tick);
    }
  }

  // -----------------------------
  // BRIDGE para Dev Tools + listener
  // -----------------------------
  window.__AppCtl = {
    stopAccel() {
      try {
        accelBoosts = [];
        saveAccelBoosts();
        if (_accelLoop != null) {
          cancelAnimationFrame(_accelLoop);
          _accelLoop = null;
        }
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
        tarefasBloqueadas = Array.isArray(arr) ? arr : [];
        AppStorage.setItem('tarefasBloqueadas', JSON.stringify(tarefasBloqueadas));
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
    tarefasBloqueadas = JSON.parse(AppStorage.getItem('tarefasBloqueadas') || '[]');
    atualizarSaldo();
    renderHistorico();
    atualizarTarefasLimitadasUI();
    atualizarBloqueiosNoSelectTarefa();
  });
  window.addEventListener('pagehide', () => {
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

  setInterval(() => {
    atualizarTarefasLimitadasUI();
    atualizarBloqueiosNoSelectTarefa();
  }, 60000);
});
