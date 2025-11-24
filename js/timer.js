/* =================================================================== */
/* CONTADOR DE TEMPO                           */
/* =================================================================== */

// CONTADOR DE TEMPO
let tempoSegundos = 0;
let timerInterval = null;
let wakeLock = null;

let timerEmSessao = false;
let contadorTarefasTimer = 0;
let somaIncrementosValorSessao = 0;
let baseMultiplicadorSessao = 1;

let sessionHasEligibleTask = false;

// Evita flood: no máximo 3 escrita a cada 5s
// --- SYNC DO TIMER COM FIRESTORE ---
let lastTimerSync = 0;

function syncTimerToFirestore() {
  if (typeof window.fsAtualizarUsuario !== 'function') return;

  const agora = Date.now();
  // agora só escreve a cada 5 segundos
  if (agora - lastTimerSync < 5000) return;
  lastTimerSync = agora;

  const valorPorMinutoInput = document.getElementById('valorPorMinuto');
  const valorPorMinuto = valorPorMinutoInput ? parseFloat(valorPorMinutoInput.value.replace(',', '.')) || 0 : 0;

  const valorTotal = calcularValorTotal(tempoSegundos, valorPorMinuto);

  window.fsAtualizarUsuario({
    timerTempoSegundos: tempoSegundos,
    timerValorAtual: valorTotal,
    timerValorPorMinuto: valorPorMinuto,
    timerAtivo: timerEmSessao,
  });
}

function ensureToastContainer() {
  let c = document.getElementById('toastContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastContainer';
    document.body.appendChild(c);
  }
  return c;
}

function showMultiplicadorToast({ atual, novo, incrementoValor, incrementoTarefas, repeticaoTotal, valorTarefa, tarefaIndex, totalValorSessao }) {
  try {
    const c = ensureToastContainer();
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.position = 'relative';

    const format2 = (n) => (Number(n) || 0).toFixed(2);
    const valorStr = (valorTarefa ?? 0).toLocaleString ? valorTarefa.toLocaleString('pt-BR') : String(valorTarefa);

    t.innerHTML = `
      <button class="close" aria-label="Fechar">×</button>
      <div class="title"><span class="dot"></span>⏱️ Multiplicador atualizado</div>
      <div class="line"><span class="strong">${format2(atual)}</span> → <span class="strong">${format2(novo)}</span></div>
      <div class="line">+ <span class="strong">${format2(incrementoValor)}</span> pelo valor da tarefa (R$ ${valorStr})</div>
      <div class="line">+ <span class="strong">${format2(incrementoTarefas)}</span> pela repetição (tarefa #${tarefaIndex}) <span class="meta">(total: +${format2(repeticaoTotal)})</span></div>
      <div class="line meta">Total da sessão: +<span class="strong">${format2(incrementoTarefas + incrementoValor)}</span></div>
    `;

    c.appendChild(t);

    t.querySelector('.close').addEventListener('click', () => {
      t.remove();
    });

    const ttl = 9000;
    const start = performance.now();
    function step(now) {
      const p = Math.min(1, (now - start) / ttl);
      if (p < 1) requestAnimationFrame(step);
      else t.remove();
    }
    requestAnimationFrame(step);
  } catch (e) {}
}

function incrementoPorValorDaTarefa(v) {
  if (!v || v <= 0) return 0;
  if (v >= 10000) return 6.3;
  if (v >= 9000) return 5.3;
  if (v >= 8000) return 4.8;
  if (v >= 7000) return 4.3;
  if (v >= 6000) return 3.8;
  if (v >= 5000) return 3.1;
  if (v >= 4000) return 2.6;
  if (v >= 3500) return 2.3;
  if (v >= 3000) return 2.1;
  if (v >= 2500) return 1.8;
  if (v >= 2000) return 1.5;
  if (v >= 1500) return 1.3;
  if (v >= 1100) return 1.1;
  if (v >= 800) return 0.8;
  if (v >= 400) return 0.6;
  return 0.4;
}

function aplicarBonusDeTarefaDuranteTimer(valorTarefa, tarefaName) {
  if (!timerEmSessao) return;

  if (typeof tarefaName === 'string' && ELIGIBLE_TASKS.has(tarefaName.trim())) {
    sessionHasEligibleTask = true;
  }

  contadorTarefasTimer += 1;
  const incValorAtual = incrementoPorValorDaTarefa(valorTarefa);
  somaIncrementosValorSessao += incValorAtual;

  const bonusRepeticaoDaVez = 0.13 * contadorTarefasTimer;
  const bonusRepeticaoTotal = ((contadorTarefasTimer * (contadorTarefasTimer + 1)) / 2) * 0.13;

  const valorPorMinutoInput = document.getElementById('valorPorMinuto');
  const atual = parseFloat(valorPorMinutoInput.value) || baseMultiplicadorSessao;
  const novo = atual + incValorAtual + bonusRepeticaoDaVez;

  valorPorMinutoInput.value = novo.toFixed(2);
  atualizarValorAcumulado();

  showMultiplicadorToast({
    atual,
    novo,
    incrementoValor: incValorAtual,
    incrementoTarefas: bonusRepeticaoDaVez,
    repeticaoTotal: bonusRepeticaoTotal,
    valorTarefa,
    tarefaIndex: contadorTarefasTimer,
    totalValorSessao: somaIncrementosValorSessao,
  });
}

function calcularValorTotal(segundos, valorPorMinuto) {
  if (!segundos || !valorPorMinuto) return 0;

  const minutos = segundos / 60;
  const bruto = minutos * valorPorMinuto;

  // arredonda para 2 casas
  return Math.round(bruto * 100) / 100;
}

function atualizarValorAcumulado() {
  const input = document.getElementById('valorPorMinuto');
  if (!input) return;

  const vpm = parseFloat(input.value.replace(',', '.')) || 0;
  const valorTotal = calcularValorTotal(tempoSegundos, vpm);

  const elValor = document.getElementById('valorAcumuladoDisplay');
  if (!elValor) return;

  if (typeof formatBR === 'function') {
    elValor.textContent = formatBR(valorTotal);
  } else {
    elValor.textContent = 'R$ ' + valorTotal.toFixed(2).replace('.', ',');
  }
}

const requestWakeLock = async () => {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch (err) {
      console.error(`Erro ao solicitar Wake Lock: ${err.name}, ${err.message}`);
    }
  }
};

const releaseWakeLock = async () => {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
};

function atualizarDisplay() {
  const min = String(Math.floor(tempoSegundos / 60)).padStart(2, '0');
  const sec = String(tempoSegundos % 60).padStart(2, '0');
  const elTempo = document.getElementById('tempoDisplay');

  if (elTempo) {
    elTempo.textContent = `${min}:${sec}`;
  }

  atualizarValorAcumulado();

  // Só sincroniza se este cliente estiver com o timer em sessão
  if (timerEmSessao) {
    syncTimerToFirestore();
  }
}
