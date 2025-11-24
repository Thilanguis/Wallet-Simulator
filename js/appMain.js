/* ===================================================================
   APP PRINCIPAL (Main)
   =================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Inicia o bridge com o Firestore (usuarios, tarefas, historico)
  if (window.initFirestoreAppState) {
    window.initFirestoreAppState();
  }
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
  // Eles vão vir do Firestore (via firestoreAppState) ou começam vazios.
  if (!Array.isArray(typeof historico !== 'undefined' ? historico : undefined)) {
    historico = [];
  }
  if (!Array.isArray(typeof tarefasPendentes !== 'undefined' ? tarefasPendentes : undefined)) {
    tarefasPendentes = [];
  }

  // Sistema de bloqueios — agora só em memória / Firestore
  let tarefasBloqueadas = [];

  // controla de quanto em quanto tempo vamos persistir os bloqueios no Firestore
  let _lastPersistTarefasBloqueadas = 0;

  // Aceleração global — boosters ativos (somente em memória)
  let accelBoosts = [];

  let _accelLoop = null; // requestAnimationFrame id
  function saveAccelBoosts() {
    // por enquanto não persiste em lugar nenhum
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

  const LIMITES_TAREFA_HORAS = {
    'Ela decide toda a agenda do dia': 24 * 14, // 15 dias
    'Vale de escolha de FILME': 24 * 10, // 10 dias
    'Vale sair sozinha com amiga': 24 * 7, // 7 dias
    'Ganha 60 dólares na vida real': 24 * 4, // 4 dias
    // redutores (IDs canônicos)
    REDUZIR_BLOQUEIO_6H: 6,
    REDUZIR_BLOQUEIO_12H: 12,
    REDUZIR_BLOQUEIO_1D: 24,
    REDUZIR_BLOQUEIO_3D: 72,
    ACELERAR_GLOBAL_4D_1H: 96,
  };

  // >>> DURAÇÃO dos redutores como efeito cronometrado
  const REDUTOR_DURACAO_MS = {
    REDUZIR_BLOQUEIO_6H: 60 * 1000, // 6h em 60s (exemplo)
    REDUZIR_BLOQUEIO_12H: 60 * 1000, // 12h em 90s
    REDUZIR_BLOQUEIO_1D: 60 * 1000, // 1d em 120s
    REDUZIR_BLOQUEIO_3D: 60 * 1000, // 3d em 180s
  };

  function getBloqueioMsPorTarefa(nome) {
    const horas = LIMITES_TAREFA_HORAS[nome] || 0;
    return horas * 60 * 60 * 1000;
  }

  // Reduz um certo tempo (msParaReduzir) em TODAS as tarefas bloqueadas
  // exceto:
  //  - nomes explícitos em excluirNomes
  //  - todos os redutores (6h, 12h, 1d, 3d, 4d)
  function aplicarReducaoGlobal(msParaReduzir, { excluirNomes = [], ignorarRedutores = true } = {}) {
    if (!msParaReduzir || !Array.isArray(tarefasBloqueadas) || !tarefasBloqueadas.length) return;

    const agora = Date.now();
    const excluir = new Set(excluirNomes);
    let alterou = false;

    tarefasBloqueadas = (tarefasBloqueadas || [])
      .map((t) => {
        if (!t || typeof t.expiraEm !== 'number') return t;

        // não mexe em quem está explicitamente excluído
        if (excluir.has(t.nome)) return t;

        // não mexe em NENHUM redutor
        if (ignorarRedutores) {
          if (
            /^REDUZIR_BLOQUEIO_/.test(t.nome) || // 6h, 12h, 1d, 3d
            t.nome === 'ACELERAR_GLOBAL_4D_1H' // 4 dias
          ) {
            return t;
          }
        }

        const restanteAntes = t.expiraEm - agora;
        if (restanteAntes <= 0) return t;

        // novo restante depois da redução
        const restanteDepois = Math.max(0, restanteAntes - msParaReduzir);
        const novoExpiraEm = agora + restanteDepois;

        if (novoExpiraEm !== t.expiraEm) {
          alterou = true;
          return { ...t, expiraEm: novoExpiraEm };
        }
        return t;
      })
      // remove itens que já venceram
      .filter((t) => t.expiraEm > agora);

    if (alterou) {
      try {
        if (typeof fsAtualizarUsuario === 'function') {
          fsAtualizarUsuario({ tarefasBloqueadas });
        }
      } catch (e) {
        console.warn('[aplicarReducaoGlobal] falha ao salvar no Firestore:', e);
      }

      try {
        atualizarTarefasLimitadasUI();
        atualizarBloqueiosNoSelectTarefa();
      } catch (e) {
        console.warn('[aplicarReducaoGlobal] falha ao atualizar UI:', e);
      }
    }
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
      valor: parseInt(valorStr, 10) || 0,
      tarefa: tarefa || '',
      descricao: descricao || '',
    };
  }

  // -----------------------------
  // CALLBACKS DO FIRESTORE
  // -----------------------------

  // Chamado pelo firestoreAppState.js quando o doc do usuário muda
  window.onUserStateChange = function (usuario) {
    usuario = usuario || {};

    // ---------- Saldo ----------
    if (typeof usuario.saldoDominadora === 'number') {
      saldoDominadora = usuario.saldoDominadora;
    } else if (typeof saldoDominadora !== 'number') {
      saldoDominadora = 0;
    }

    // ---------- Bônus especial ----------
    if (typeof usuario.bonusEspecialAtivo === 'boolean') {
      bonusEspecialAtivo = usuario.bonusEspecialAtivo;
      if (bonusCheckbox) {
        bonusCheckbox.checked = bonusEspecialAtivo;
        window.bonusEspecialAtivo = bonusCheckbox.checked;
      }
    }

    // ---------- Tarefas com limite ativo ----------
    if (Array.isArray(usuario.tarefasBloqueadas)) {
      tarefasBloqueadas = usuario.tarefasBloqueadas;
      console.log('[onUserStateChange] tarefasBloqueadas =', tarefasBloqueadas);
    } else {
      // se não tiver no Firestore, começa vazio
      tarefasBloqueadas = [];
    }

    // Atualiza a UI das tarefas com limite
    if (typeof atualizarTarefasLimitadasUI === 'function') {
      atualizarTarefasLimitadasUI();
    }
    if (typeof atualizarBloqueiosNoSelectTarefa === 'function') {
      atualizarBloqueiosNoSelectTarefa();
    }

    atualizarSaldo();

    window.onUserStateChange = function (usuario) {
      usuario = usuario || {};

      // ---------- Saldo ----------
      if (typeof usuario.saldoDominadora === 'number') {
        saldoDominadora = usuario.saldoDominadora;
      } else if (typeof saldoDominadora !== 'number') {
        saldoDominadora = 0;
      }

      // ---------- Bônus especial ----------
      if (typeof usuario.bonusEspecialAtivo === 'boolean') {
        bonusEspecialAtivo = usuario.bonusEspecialAtivo;
        if (bonusCheckbox) {
          bonusCheckbox.checked = bonusEspecialAtivo;
          window.bonusEspecialAtivo = bonusCheckbox.checked;
        }
      }

      // ---------- Tarefas com limite ativo ----------
      if (Array.isArray(usuario.tarefasBloqueadas)) {
        tarefasBloqueadas = usuario.tarefasBloqueadas;
        console.log('[onUserStateChange] tarefasBloqueadas =', tarefasBloqueadas);
      } else {
        tarefasBloqueadas = [];
      }

      if (typeof atualizarTarefasLimitadasUI === 'function') {
        atualizarTarefasLimitadasUI();
      }
      if (typeof atualizarBloqueiosNoSelectTarefa === 'function') {
        atualizarBloqueiosNoSelectTarefa();
      }

      atualizarSaldo();

      // 🔥 NÃO LÊ MAIS usuario.tarefasPendentes AQUI
    };
  };

  // Chamado pelo firestoreAppState.js quando a subcoleção `tarefas` muda
  window.onTarefasChange = function (pendentes, bloqueadas) {
    console.log('[onTarefasChange] pendentes:', pendentes.length, 'bloqueadas:', bloqueadas.length);

    // pendentes vem diretamente do Firestore (via onSnapshot)
    tarefasPendentes = Array.isArray(pendentes) ? pendentes : [];

    if (typeof renderTarefasPendentes === 'function') {
      renderTarefasPendentes();
    }
  };

  // Chamado pelo firestoreAppState.js quando a subcoleção `historico` muda
  window.onHistoricoChange = function (lista) {
    historico = Array.isArray(lista) ? lista : [];
    renderHistorico();
  };

  // -----------------------------
  // ATUALIZAÇÕES DE UI
  // -----------------------------

  function atualizarSaldo() {
    if (!saldoElement) return;
    saldoElement.textContent =
      typeof formatBR === 'function'
        ? formatBR(saldoDominadora)
        : (saldoDominadora || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          });
  }

  function getFilteredHistorico() {
    const selected = filterDateInput && filterDateInput.value ? new Date(filterDateInput.value) : null;
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
    historicoElement.innerHTML = '';

    const filtered = getFilteredHistorico();
    if (enviarHistoricoWhatsAppBtn) {
      enviarHistoricoWhatsAppBtn.style.display = filtered.length ? 'block' : 'none';
    }
    if (!filtered.length) {
      historicoElement.innerHTML = '<div style="color:#999;border:1px dashed #444;padding:12px;border-radius:10px;text-align:center">Sem registros para o período.</div>';
      return;
    }

    const byDay = {};
    for (const h of filtered) {
      const key = new Date(h.timestamp).toISOString().slice(0, 10);
      (byDay[key] ||= []).push(h);
    }

    const days = Object.keys(byDay).sort((a, b) => new Date(b) - new Date(a));

    for (const key of days) {
      const d = new Date(key + 'T00:00:00');
      const header = document.createElement('div');
      header.style.cssText = 'margin:14px 0 6px; color:#ffd700; font-weight:900; letter-spacing:.5px; border-left:4px solid #8b0000; padding-left:10px; font-size:14px;';
      header.textContent = d.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      historicoElement.appendChild(header);

      byDay[key].forEach((h) => {
        const card = document.createElement('div');
        card.style.cssText = 'background:#121212;border:1px solid #2e2e2e;border-radius:10px;padding:10px 12px;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,.35), inset 0 0 8px rgba(184,134,11,.06)';

        const isGanho = h.tipo === 'ganho';

        const valorHTML = `<strong style="min-width:120px;display:inline-block;text-align:right;color:${isGanho ? '#0fdc81' : '#ff6a5f'}">${
          typeof formatBR === 'function' ? formatBR(h.valor) : 'R$ ' + (h.valor || 0).toLocaleString('pt-BR')
        }</strong>`;

        const badge = `<span style="font-size:12px;font-weight:800;padding:4px 8px;border-radius:999px;border:1px solid ${isGanho ? 'rgba(15,220,129,.6)' : 'rgba(255,106,95,.6)'};background:${
          isGanho ? 'rgba(15,220,129,.1)' : 'rgba(255,106,95,.08)'
        };color:${isGanho ? '#0fdc81' : '#ff6a5f'};text-transform:uppercase;letter-spacing:.5px;margin-right:10px">
        ${isGanho ? 'Ganho' : 'Gasto'}
      </span>`;

        const hora = new Date(h.timestamp).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        });

        // Cabeçalho do card + botão apagar
        card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
          ${badge}
          <div style="flex:1;color:#ddd">${h.descricao}</div>
          ${valorHTML}
          <button class="btn-del-hist" title="Apagar este registro" onclick="deletarItemHistorico('${h.timestamp}')">🗑</button>
        </div>
        <div style="margin-top:4px;display:flex;justify-content:space-between;color:#8d8d8d;font-size:12px">
          <span>${hora}</span>
          <span>Saldo: ${typeof formatBR === 'function' ? formatBR(h.saldoAtual) : 'R$ ' + (h.saldoAtual || 0).toLocaleString('pt-BR')}</span>
        </div>
      `;

        // Linha bonitinha de bônus / desconto (se tiver dados)
        if (typeof h.valorOriginal === 'number' && typeof h.valorFinal === 'number' && typeof h.diferenca === 'number' && typeof h.percentual === 'number') {
          const perc = Math.round(h.percentual || 0);
          const isBonusGanho = perc > 0;
          const isDesconto = perc < 0;
          const isNeutro = perc === 0;

          const isGanhoLocal = h.tipo === 'ganho';

          const percAbs = Math.abs(perc);
          const difAbs = Math.abs(h.diferenca);

          const chipBg = isBonusGanho ? 'rgba(15,220,129,.12)' : isDesconto ? 'rgba(255,106,95,.12)' : 'rgba(255,215,0,.16)'; // 0% -> amarelinho
          const chipBorder = isBonusGanho ? 'rgba(15,220,129,.6)' : isDesconto ? 'rgba(255,106,95,.6)' : 'rgba(255,215,0,.8)';
          const chipText = isBonusGanho ? '#0fdc81' : isDesconto ? '#ff6a5f' : '#ffd700';

          const valorOriginalFmt = Math.abs(h.valorOriginal).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          });
          const valorFinalFmt = Math.abs(h.valorFinal).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          });
          const difFmt = difAbs.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          });

          // Para o caso 0%, calculamos o "poderia ter sido 15%"
          const potencial = Math.round(Math.abs(h.valorOriginal) * 0.15 * 100) / 100;
          const potencialFmt = potencial.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          });

          let detalhesHtml = '';

          if (isNeutro) {
            const verbo = isGanhoLocal ? 'ganhar' : 'economizar';
            const tipoTexto = isGanhoLocal ? 'em bônus' : 'em desconto';

            detalhesHtml = `
      <span style="flex:1;">
        <span style="opacity:.8;">Sem bônus aplicado:</span>
        <span style="margin-left:4px;font-weight:800;color:#ffde7a;">
          ${valorFinalFmt}
        </span>
        <br>
        <span style="opacity:.75;color:#ffde7a;">
          Você deixou de ${verbo} ${potencialFmt} ${tipoTexto} (15%).
        </span>
      </span>
    `;
          } else {
            const labelPrefix = isBonusGanho ? 'Bônus:' : 'Desconto:';
            const ajusteLabel = isBonusGanho ? 'ajuste de' : 'economia de';

            detalhesHtml = `
      <span style="flex:1;">
        <span style="opacity:.8;">${labelPrefix}</span>
        <span style="margin-left:4px;text-decoration:line-through;opacity:.6;">
          ${valorOriginalFmt}
        </span>
        <span style="margin-left:4px;font-weight:800;color:${isBonusGanho ? '#0fdc81' : '#ff6a5f'};">
          ${valorFinalFmt}
        </span>
        <span style="opacity:.75;margin-left:4px;">
          (${ajusteLabel} ${difFmt})
        </span>
      </span>
    `;
          }

          const bonusDiv = document.createElement('div');
          bonusDiv.style.cssText = 'margin-top:6px;font-size:12px;color:#c9c9c9;padding-left:14px;border-left:2px solid rgba(255,215,0,.4);display:flex;align-items:center;gap:10px;';

          const percLabel = perc > 0 ? `+${percAbs}%` : perc < 0 ? `-${percAbs}%` : '0%';

          bonusDiv.innerHTML = `
    <span style="padding:2px 10px;border-radius:999px;border:1px solid ${chipBorder};background:${chipBg};color:${chipText};font-weight:700;">
      ${percLabel} Bônus lingerie
    </span>
    ${detalhesHtml}
  `;

          card.appendChild(bonusDiv);
        }

        historicoElement.appendChild(card);
      });
    }
  }

  function adicionarHistorico(descricao, valor, tipo, detalhesBonus = null) {
    const timestamp = new Date().toISOString();

    const entry = {
      descricao,
      valor,
      tipo, // "ganho" | "gasto"
      saldoAtual: saldoDominadora,
      timestamp,
    };

    if (detalhesBonus) {
      entry.valorOriginal = detalhesBonus.valorOriginal;
      entry.valorFinal = detalhesBonus.valorFinal;
      entry.diferenca = detalhesBonus.diferenca;
      entry.percentual = detalhesBonus.percentual;
    }

    // Se Firestore estiver disponível, salva lá.
    if (typeof fsAdicionarMovimentoHistorico === 'function') {
      fsAdicionarMovimentoHistorico(entry);
      // Não mexe no array local; o onSnapshot vai chamar onHistoricoChange e redesenhar.
    } else {
      // Fallback local, só pra não quebrar se Firestore não carregar
      historico.unshift(entry);
      renderHistorico();
    }
  }

  window.deletarItemHistorico = function (timestamp) {
    // Procura o item no array "historico" pelo timestamp
    const idx = historico.findIndex((h) => h.timestamp === timestamp);
    if (idx === -1) return;

    const item = historico[idx];

    // Confirmação pro usuário
    if (!confirm('Apagar este registro do histórico e ajustar o saldo?')) return;

    // Reverte o efeito no saldo
    if (item.tipo === 'gasto') {
      // Se era gasto, apagar o registro significa devolver o valor pro saldo
      saldoDominadora += item.valor;
    } else if (item.tipo === 'ganho') {
      // Se era ganho, apagar o registro significa tirar o valor do saldo
      saldoDominadora -= item.valor;
    }

    // Atualiza o saldo na tela
    atualizarSaldo();

    // Atualiza o saldo no Firestore
    if (typeof fsAtualizarUsuario === 'function') {
      fsAtualizarUsuario({ saldoDominadora });
    }

    // Remove localmente para a UI reagir imediatamente
    historico.splice(idx, 1);
    renderHistorico();

    // Remove no Firestore, se tivermos o id
    if (item.id && typeof fsDeletarMovimentoHistorico === 'function') {
      fsDeletarMovimentoHistorico(item.id);
    }
  };

  // -----------------------------
  // TAREFAS LIMITADAS (bloqueios)
  // -----------------------------

  window.removerTarefaLimitada = function (nome) {
    tarefasBloqueadas = tarefasBloqueadas.filter((t) => t.nome !== nome);

    if (typeof fsAtualizarUsuario === 'function') {
      fsAtualizarUsuario({ tarefasBloqueadas });
    }

    atualizarTarefasLimitadasUI();
    atualizarBloqueiosNoSelectTarefa();
  };

  function atualizarTarefasLimitadasUI() {
    const lista = document.getElementById('tarefasLimitadasLista');
    if (!lista) return;

    const agora = Date.now();
    lista.innerHTML = '';

    // Aqui só limpamos para a UI – quem persiste é o clock / compra / criação
    tarefasBloqueadas = (tarefasBloqueadas || []).filter((t) => t.expiraEm > agora);

    if (tarefasBloqueadas.length === 0) {
      lista.innerHTML = '<p style="color:#aaa;">Nenhuma tarefa limitada ativa.</p>';
      return;
    }

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
      const v = Math.max(0, ms | 0);
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
      wrap.dataset.displayMs = String(Math.max(0, ms | 0));
    }

    document.querySelectorAll('.tempo-restante').forEach((wrap) => {
      const expira = Number(wrap.dataset.expira);
      const el = wrap.querySelector('.relogio');
      if (!el || !Number.isFinite(expira)) return;

      const targetMs = expira - agora;
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
      let mudou = false;

      try {
        if (Array.isArray(tarefasBloqueadas)) {
          const now = Date.now();
          const nomes = new Set(expirados.map((w) => w.getAttribute('data-nome')).filter(Boolean));

          const antes = tarefasBloqueadas.length;

          tarefasBloqueadas = tarefasBloqueadas.filter((t) => !(nomes.has(t.nome) || t.expiraEm <= now));

          mudou = tarefasBloqueadas.length !== antes;
        }
      } catch (e) {
        console.warn('[clock] erro ao limpar bloqueios expirados:', e);
      }

      // 🔥 aqui é onde realmente salvamos a remoção no Firestore
      if (mudou && typeof fsAtualizarUsuario === 'function') {
        try {
          fsAtualizarUsuario({ tarefasBloqueadas });
        } catch (e) {
          console.warn('[clock] falha ao persistir tarefasBloqueadas:', e);
        }
      }

      // Atualiza visual
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

    const bloqueadas = (tarefasBloqueadas || []).filter((t) => t.expiraEm > agora);
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

          // --------------------------------------------------
          // CORREÇÃO: Ajuste final do tempo que faltou reduzir
          // --------------------------------------------------
          try {
            const nowFix = Date.now();
            tarefasBloqueadas = (tarefasBloqueadas || []).map((t) => {
              // ignora acelerador e redutores
              if (t.nome === 'ACELERAR_GLOBAL_4D_1H') return t;
              if (/^REDUZIR_BLOQUEIO_/.test(t.nome)) return t;

              // se ainda falta pouco tempo (até 40min)
              const dif = t.expiraEm - nowFix;
              // Se faltar até 3 horas, consideramos “restinho” de arredondamento
              if (dif > 0 && dif <= 3 * 60 * 60 * 1000) {
                return { ...t, expiraEm: nowFix };
              }
              return t;
            });

            salvarTarefasBloqueadasLocal();
          } catch (e) {
            console.warn('[AjusteFinalAceleracao] erro:', e);
          }

          // Agora sim salva no Firestore
          try {
            if (typeof fsAtualizarUsuario === 'function') {
              fsAtualizarUsuario({ tarefasBloqueadas });
            }
          } catch (e) {
            console.warn('[startGlobalAcceleration] falha ao salvar fim da aceleração', e);
          }

          // ✅ AGORA SIM: grava o estado final no Firestore
          try {
            if (typeof fsAtualizarUsuario === 'function') {
              fsAtualizarUsuario({ tarefasBloqueadas });
            }
          } catch (e) {
            console.warn('[startGlobalAcceleration] falha ao salvar fim da aceleração', e);
          }

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
                // NÃO mexe no próprio acelerador global
                if (t.nome === 'ACELERAR_GLOBAL_4D_1H') return t;
                // NÃO mexe nos próprios redutores (6h, 12h, 1d, 3d)
                if (/^REDUZIR_BLOQUEIO_/.test(t.nome)) return t;

                const novo = Math.max(now2, t.expiraEm - stepInt);
                if (novo !== t.expiraEm) changed = true;
                return { ...t, expiraEm: novo };
              }
              return t;
            })
            .filter((t) => t.expiraEm > now2);

          if (changed) {
            try {
              atualizarTarefasLimitadasUI();
              atualizarBloqueiosNoSelectTarefa();
            } catch {}
            // Aqui a gente NÃO salva ainda no Firestore.
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
                // não mexe no próprio item de aceleração
                if (t.nome === 'ACELERAR_GLOBAL_4D_1H') return t;

                // ❌ não acelera nenhum redutor
                if (/^REDUZIR_BLOQUEIO_/.test(t.nome)) return t;

                const novo = Math.max(now2, t.expiraEm - stepInt);
                if (novo !== t.expiraEm) changed = true;
                return { ...t, expiraEm: novo };
              }
              return t;
            })

            .filter((t) => t.expiraEm > now2);

          if (changed) {
            try {
              atualizarTarefasLimitadasUI();
              atualizarBloqueiosNoSelectTarefa();
            } catch {}

            // ✅ grava no Firestore no máx. a cada 2s
            if (typeof fsAtualizarUsuario === 'function') {
              const agoraPersist = Date.now();
              if (agoraPersist - _lastPersistTarefasBloqueadas > 2000) {
                _lastPersistTarefasBloqueadas = agoraPersist;
                fsAtualizarUsuario({ tarefasBloqueadas });
              }
            }
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

        if (typeof fsAtualizarUsuario === 'function') {
          fsAtualizarUsuario({ tarefasBloqueadas });
        }

        try {
          atualizarTarefasLimitadasUI();
          atualizarBloqueiosNoSelectTarefa();
        } catch {}
        return true;
      } catch {
        return false;
      }
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
      window.bonusEspecialAtivo = bonusCheckbox.checked;
    } catch {}

    bonusCheckbox.addEventListener('change', () => {
      // Mantém os dois em sincronia
      bonusEspecialAtivo = bonusCheckbox.checked;
      window.bonusEspecialAtivo = bonusCheckbox.checked;

      // Salva no Firestore
      if (typeof fsAtualizarUsuario === 'function') {
        fsAtualizarUsuario({ bonusEspecialAtivo });
      }

      if (typeof updateBonusEspecialUI === 'function') {
        updateBonusEspecialUI();
      }
    });
  }

  if (tipoTransacaoSelect) {
    tipoTransacaoSelect.addEventListener('change', function () {
      const compraFields = document.getElementById('compraFields');
      const ganhoFields = document.getElementById('ganhoFields');
      if (compraFields) compraFields.style.display = this.value === 'gasto' ? 'block' : 'none';
      if (ganhoFields) ganhoFields.style.display = this.value === 'ganho' ? 'block' : 'none';

      if (this.value !== 'ganho') {
        const quantidadeInput = document.getElementById('quantidadeMultiplicador');
        const labelQuantidadeMultiplicador = document.getElementById('labelQuantidadeMultiplicador');
        if (quantidadeInput) {
          quantidadeInput.style.display = 'none';
          if (labelQuantidadeMultiplicador) labelQuantidadeMultiplicador.style.display = 'none';
          quantidadeInput.value = 1;
        }
      }
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
        const numeroWhatsApp = '+14386305973';
        const filtered = getFilteredHistorico();
        if (!filtered.length) return alert('Não há itens no histórico para enviar.');
        const dataSelec = filterDateInput && filterDateInput.value ? new Date(filterDateInput.value) : null;
        const titulo = dataSelec ? `📅 Histórico do dia ${dataSelec.toLocaleDateString('pt-BR')}` : '📜 Histórico completo (mais recentes primeiro)';
        const linhas = filtered.map((h, idx) => {
          const d = new Date(h.timestamp);
          const quando = d.toLocaleString('pt-BR');
          const tipo = h.tipo === 'gasto' ? 'Gasto' : 'Ganho';
          const val = (h.valor || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
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
        const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensagem)}`;
        window.open(urlWhatsApp, '_blank');
      } catch (e) {
        console.error('Falha ao abrir WhatsApp:', e);
        alert('Não foi possível abrir o WhatsApp. Tente novamente.');
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (!confirm('Tem certeza que deseja zerar o saldo?')) return;

      saldoDominadora = 0;
      atualizarSaldo();

      // Atualiza no Firestore
      if (typeof fsAtualizarUsuario === 'function') {
        fsAtualizarUsuario({ saldoDominadora });
      }

      // O histórico continua o mesmo, só o saldo atual fica 0
      renderHistorico();
    });
  }

  if (limparBtn) {
    limparBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();

      if (!window.historico || window.historico.length === 0) {
        return alert('O histórico já está vazio.');
      }

      if (!confirm('Apagar todo o histórico de transações?')) return;

      // Copia a lista atual para apagar no Firestore depois
      const itensParaApagar = Array.isArray(historico) ? [...historico] : [];

      // Limpa local (UI)
      historico.length = 0;
      if (filterDateInput) filterDateInput.value = '';
      renderHistorico();

      // Apaga no Firestore, se a função existir
      if (typeof fsDeletarMovimentoHistorico === 'function') {
        try {
          await Promise.all(itensParaApagar.filter((item) => item.id).map((item) => fsDeletarMovimentoHistorico(item.id)));
        } catch (e) {
          console.error('Erro ao apagar histórico no Firestore:', e);
        }
      }
    });
  }

  if (adicionarBtn) {
    adicionarBtn.addEventListener('click', () => {
      const tipo = (tipoTransacaoSelect && tipoTransacaoSelect.value) || 'gasto';
      let valor, tarefa, descricao;

      if (tipo === 'gasto') {
        const tarefaSelecionada = (selectTarefaSelect && selectTarefaSelect.value) || '';
        if (!tarefaSelecionada) return alert('Por favor, selecione uma tarefa.');
        ({ valor, tarefa, descricao } = parseTarefa(tarefaSelecionada));

        const optSel = selectTarefaSelect?.selectedOptions?.[0] || null;

        // ⚡ Aceleração Global
        if (/ACELERAR_GLOBAL_4D_1H/.test((selectTarefaSelect && selectTarefaSelect.value) || '')) {
          const custo = 18000;
          if (saldoDominadora < custo) return alert('Saldo insuficiente!');

          const REDUZ_TOTAL_MS = 4 * 24 * 60 * 60 * 1000; // 4 dias
          const DURACAO_MS = 1 * 60 * 1000; // 1 minuto
          const perSecondMs = REDUZ_TOTAL_MS / (DURACAO_MS / 1000);

          saldoDominadora -= custo;
          atualizarSaldo();

          if (typeof fsAtualizarUsuario === 'function') {
            fsAtualizarUsuario({ saldoDominadora });
          }

          adicionarHistorico('Aceleração global (− tempo cronometrado)', custo, 'gasto');

          // ✅ volta a usar o motor cronometrado
          startGlobalAcceleration(perSecondMs, DURACAO_MS, REDUZ_TOTAL_MS, 'ACELERAR_GLOBAL_4D_1H');

          const agora2 = Date.now();
          const cdMs = getBloqueioMsPorTarefa('ACELERAR_GLOBAL_4D_1H');
          if (cdMs > 0) {
            tarefasBloqueadas.push({
              nome: 'ACELERAR_GLOBAL_4D_1H',
              expiraEm: agora2 + cdMs,
            });

            if (typeof fsAtualizarUsuario === 'function') {
              fsAtualizarUsuario({ tarefasBloqueadas });
            }

            atualizarTarefasLimitadasUI();
            atualizarBloqueiosNoSelectTarefa();
          }

          if (selectTarefaSelect) selectTarefaSelect.value = '';
          return;
        }

        const horasReducao = optSel?.dataset?.reduzHoras ? parseInt(optSel.dataset.reduzHoras, 10) : 0;

        // ===== REDUTORES: cronometrados (mostram o tempo e reduzem tudo) =====
        if (horasReducao > 0) {
          const agora = Date.now();
          const redutorId = getRedutorIdFromOption(optSel) || 'REDUTOR';
          const cooldownMs = getBloqueioMsPorTarefa(redutorId);

          // Checa cooldown do próprio redutor
          if (cooldownMs > 0) {
            const jaBloqueado = tarefasBloqueadas.find((t) => t.nome === redutorId && t.expiraEm > agora);
            if (jaBloqueado) {
              alert(`⏳ "${descricao || tarefa}" ainda está em cooldown.\nLibera em ${fmtTempoRestante(jaBloqueado.expiraEm - agora)}.`);
              return;
            }
          }

          if (saldoDominadora < valor) return alert('Saldo insuficiente!');

          // paga pelo redutor
          saldoDominadora -= valor;
          atualizarSaldo();
          if (typeof fsAtualizarUsuario === 'function') {
            fsAtualizarUsuario({ saldoDominadora });
          }

          // duração da animação (quanto tempo fica “comendo” os dias)
          const duracaoMs = (optSel?.dataset?.reduzDuracaoMs && parseInt(optSel.dataset.reduzDuracaoMs, 10)) || REDUTOR_DURACAO_MS[redutorId] || 60 * 1000;

          // ✅ usa o motor de aceleração cronometrado
          startTimedReducer(redutorId, horasReducao, duracaoMs);

          // cooldown do próprio redutor
          if (cooldownMs > 0) {
            tarefasBloqueadas.push({
              nome: redutorId,
              expiraEm: agora + cooldownMs,
            });
            if (typeof fsAtualizarUsuario === 'function') {
              fsAtualizarUsuario({ tarefasBloqueadas });
            }
          }

          adicionarHistorico(`Redução cronometrada (−${horasReducao}h em ${Math.round(duracaoMs / 1000)}s)`, valor, 'gasto');

          atualizarTarefasLimitadasUI();
          atualizarBloqueiosNoSelectTarefa();
          return;
        }

        // ===== COMPRA NORMAL =====
        if (saldoDominadora < valor) return alert('Saldo insuficiente!');

        const agora = Date.now();
        const msBloqueio = getBloqueioMsPorTarefa(tarefa);
        if (msBloqueio > 0) {
          const bloqueada = tarefasBloqueadas.find((t) => t.nome === tarefa && t.expiraEm > agora);
          if (bloqueada) {
            alert(`❌ "${tarefa}" ainda está bloqueada por tempo.\nLibera em ${fmtTempoRestante(bloqueada.expiraEm - agora)}.`);
            return;
          }
          const expiraEm = agora + msBloqueio;
          tarefasBloqueadas.push({ nome: tarefa, expiraEm });

          if (typeof fsAtualizarUsuario === 'function') {
            fsAtualizarUsuario({ tarefasBloqueadas });
          }

          atualizarTarefasLimitadasUI();

          atualizarBloqueiosNoSelectTarefa();
        }

        // 🔥 DESCONTO DE LINGERIE EM COMPRA
        const usaBonus = !!window.bonusEspecialAtivo;

        // Valor que veio do select (pode já estar com o bônus aplicado)
        let valorBruto = valor;

        // Tenta recuperar o valor original (sem desconto) a partir do texto da opção
        let valorOriginal = valorBruto;
        if (usaBonus && optSel && optSel.textContent) {
          const match = optSel.textContent.match(/R\$\s*([\d\.,]+)/);
          if (match) {
            const numerico = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
            if (!Number.isNaN(numerico) && numerico > 0) {
              valorOriginal = numerico;
            }
          }
        }

        let percentual = 0;
        let valorFinal = valorBruto;
        let diferenca = 0;

        if (usaBonus) {
          percentual = -15;
          valorFinal = Math.round(valorOriginal * 0.85 * 100) / 100;
          diferenca = valorFinal - valorOriginal;
        }

        saldoDominadora -= valorFinal;

        // Atualiza saldo na tela e no Firestore
        atualizarSaldo();
        if (typeof fsAtualizarUsuario === 'function') {
          fsAtualizarUsuario({ saldoDominadora });
        }

        adicionarHistorico(tarefa, valorFinal, 'gasto', {
          valorOriginal,
          valorFinal,
          diferenca,
          percentual,
        });

        const novaTarefa = {
          id: Date.now(),
          tarefa: tarefa,
          descricao: descricao,
          valor: valor,
          timestamp: new Date().toISOString(),
        };

        // Salva a tarefa diretamente no Firestore
        if (typeof fsCriarTarefa === 'function') {
          fsCriarTarefa(novaTarefa);
        } else {
          // Fallback em caso de algo dar muito errado (só pra não quebrar a tela)
          tarefasPendentes.unshift(novaTarefa);
          if (typeof renderTarefasPendentes === 'function') renderTarefasPendentes();
        }

        atualizarSaldo();

        if (typeof aplicarBonusDeTarefaDuranteTimer === 'function') {
          try {
            aplicarBonusDeTarefaDuranteTimer(valor, tarefa);
          } catch {}
        }

        try {
          const numeroWhatsApp = '+14386305973';
          const ultimo = historico[0];
          const dataHora = typeof formatDate === 'function' ? formatDate(ultimo.timestamp) : new Date(ultimo.timestamp).toLocaleString('pt-BR');
          const mensagem = `\n🧾 *RECIBO DE COMPRA* 🧾\n----------------------------------------\n🗓 *Data/Hora:* ${dataHora}\n📌 *Tarefa:* ${tarefa}\n📝 *Descrição:* ${descricao}\n----------------------------------------\n💰 *Valor:* R$ ${valor.toLocaleString(
            'pt-BR'
          )}\n👑 *Saldo Atual:* ${saldoDominadora.toLocaleString('pt-BR')}\n----------------------------------------\n✅ Ganhe saldo e compre serviços sem moderação! 🙏\n`;
          const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensagem)}`;
          window.open(urlWhatsApp, '_blank');
        } catch {}
      } else {
        // ===== GANHO =====
        const ganhoSelecionado = (selectGanhoSelect && selectGanhoSelect.value) || '';
        const valorInput = valorGanhoInput && valorGanhoInput.value;
        if (!ganhoSelecionado || !valorInput || parseInt(valorInput) <= 0) return alert('Por favor, selecione uma forma de ganho e insira um valor válido.');

        valor = parseInt(valorInput);
        tarefa = ganhoSelecionado;

        // 🔥 Extra: detalhar "Pés na cara" com os checkboxes marcados
        try {
          if (ganhoSelecionado && ganhoSelecionado.includes('Pés na cara')) {
            const extras = [];

            const chkChule = document.getElementById('chkChule');
            const chkFrancesinha = document.getElementById('chkFrancesinha');

            if (chkChule && chkChule.checked) {
              extras.push('pés com chulé');
            }
            if (chkFrancesinha && chkFrancesinha.checked) {
              extras.push('francesinha');
            }

            if (extras.length) {
              tarefa = `${ganhoSelecionado} — ${extras.join(' + ')}`;
            }
          }
        } catch (e) {
          console.warn('Falha ao montar descrição detalhada de Pés na cara:', e);
        }

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
        if (valorGanhoInput) valorGanhoInput.value = '0';
        atualizarSaldo();

        if (typeof fsAtualizarUsuario === 'function') {
          fsAtualizarUsuario({ saldoDominadora });
        }

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

    btnPlayPause.addEventListener('click', () => {
      try {
        if (!timerEmSessao) {
          baseMultiplicadorSessao = 1;
          somaIncrementosValorSessao = 0;
          contadorTarefasTimer = 0;
          valorPorMinutoInput.value = baseMultiplicadorSessao;
          timerEmSessao = true;
          sessionHasEligibleTask = false;
          if (typeof atualizarValorAcumulado === 'function') atualizarValorAcumulado();
        }

        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
          btnPlayPause.textContent = '▶️ Continuar';
          if (typeof releaseWakeLock === 'function') releaseWakeLock();
          return;
        }

        if (typeof requestWakeLock === 'function') requestWakeLock();

        const INCREMENT_INTERVAL_SECONDS = 3;
        const INCREMENT_VALUE = 0.33;

        timerInterval = setInterval(() => {
          tempoSegundos = (typeof tempoSegundos === 'number' ? tempoSegundos : 0) + 1;

          if (tempoSegundos % INCREMENT_INTERVAL_SECONDS === 0 && sessionHasEligibleTask) {
            let vpm = parseFloat(valorPorMinutoInput.value) || 0;
            vpm += INCREMENT_VALUE;
            valorPorMinutoInput.value = vpm.toFixed(2);
            if (typeof atualizarValorAcumulado === 'function') atualizarValorAcumulado();
          }

          if (typeof atualizarDisplay === 'function') atualizarDisplay();
        }, 1000);

        btnPlayPause.textContent = '⏸️ Pausar';
      } catch (e) {
        console.error('Erro no timer:', e);
      }
    });

    btnTerminar.addEventListener('click', () => {
      try {
        if (!timerEmSessao) return;

        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        if (typeof releaseWakeLock === 'function') releaseWakeLock();

        const vpm = parseFloat(valorPorMinutoInput.value) || 0;
        if (vpm <= 0) return alert('Insira um valor válido por minuto antes de terminar.');

        let valorTotal = typeof calcularValorTotal === 'function' ? calcularValorTotal(tempoSegundos, vpm) : (tempoSegundos / 60) * vpm;

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

          if (typeof fsAtualizarUsuario === 'function') {
            fsAtualizarUsuario({ saldoDominadora });
          }
        }

        valorPorMinutoInput.value = 1;
        contadorTarefasTimer = 0;
        somaIncrementosValorSessao = 0;
        baseMultiplicadorSessao = 1;
        timerEmSessao = false;
        sessionHasEligibleTask = false;
        tempoSegundos = 0;

        if (typeof atualizarDisplay === 'function') atualizarDisplay();
        btnPlayPause.textContent = '▶️ Começar';
      } catch (e) {
        console.error('Erro ao finalizar timer:', e);
      }
    });
  }

  // -----------------------------
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

/* ===================================================================
   DEV TOOLS (atalhos de console) — seguro para colar no final do arquivo
   =================================================================== */
(function () {
  const DEV_TOOLS_VERSION = 'v2';
  if (window.__DEV_TOOLS_VERSION__ === DEV_TOOLS_VERSION) return;
  window.__DEV_TOOLS_VERSION__ = DEV_TOOLS_VERSION;

  function logOk(msg) {
    try {
      console.log('%c' + msg, 'color:#0fdc81;font-weight:700');
    } catch {}
  }
  function logWarn(msg) {
    try {
      console.warn('%c' + msg, 'color:#ffb347;font-weight:700');
    } catch {}
  }
  function logErr(msg) {
    try {
      console.error('%c' + msg, 'color:#ff6a5f;font-weight:700');
    } catch {}
  }

  function hardRefresh() {
    try {
      location.reload();
    } catch {}
  }

  function stopAcceleration() {
    try {
      if (window.__AppCtl && typeof window.__AppCtl.stopAccel === 'function') {
        window.__AppCtl.stopAccel();
        logOk('⚡ Aceleração cancelada via __AppCtl.stopAccel().');
      } else {
        accelBoosts = [];
        try {
          window.dispatchEvent(new CustomEvent('accel:stop-all'));
        } catch {}
        logOk('⚡ Aceleração cancelada (fallback). Forçando refresh rápido.');
        setTimeout(hardRefresh, 50);
      }
    } catch (e) {
      logErr('Falha ao parar aceleração: ' + (e && e.message));
    }
  }

  function clearBlocks() {
    try {
      if (window.__AppCtl && typeof window.__AppCtl.setBlocks === 'function') {
        window.__AppCtl.setBlocks([]);
        logOk('🔓 Bloqueios removidos via __AppCtl.setBlocks([]).');
      } else {
        tarefasBloqueadas = [];
        if (typeof fsAtualizarUsuario === 'function') {
          fsAtualizarUsuario({ tarefasBloqueadas: [] });
        }
        logOk('🔓 Bloqueios removidos (fallback). Atualizando…');
        setTimeout(hardRefresh, 50);
      }
    } catch (e) {
      logErr('Falha ao limpar bloqueios: ' + (e && e.message));
    }
  }

  function nukeAll() {
    try {
      if (window.__AppCtl && typeof window.__AppCtl.nukeAll === 'function') {
        window.__AppCtl.nukeAll();
        logWarn('🧨 Tudo limpo via __AppCtl.nukeAll().');
      } else {
        accelBoosts = [];
        tarefasBloqueadas = [];
        if (typeof fsAtualizarUsuario === 'function') {
          fsAtualizarUsuario({ tarefasBloqueadas: [] });
        }
        logWarn('🧨 Tudo limpo (fallback). Atualizando…');
        setTimeout(hardRefresh, 50);
      }
    } catch (e) {
      logErr('Falha no nukeAll: ' + (e && e.message));
    }
  }

  window.__devStopAcceleration = stopAcceleration;
  window.__devClearBlocks = clearBlocks;
  window.__devNukeAll = nukeAll;

  logOk('✅ Dev tools prontos: __devStopAcceleration(), __devClearBlocks(), __devNukeAll()');
})();
