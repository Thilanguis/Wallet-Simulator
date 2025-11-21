// ------------------------------------------------------------
// ROLETA — MODELO B COMPLETO
// Roda visual giratória, ponteiro curto, pregos, tics, chicote,
// desaceleração real, responsivo, cooldown 3 dias.
// ------------------------------------------------------------

(function () {
  // ==========================
  // CONFIGURAÇÕES
  // ==========================
  const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias

  // ==========================
  // SONS
  // ==========================
  const audioTick = new Audio('data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAA...');
  audioTick.volume = 0.35;

  const audioWhip = new Audio('data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAA...');
  audioWhip.volume = 0.4;

  // ==========================
  // FUNÇÕES DE TEMPO / COOLDOWN
  // ==========================
  function getLastUso() {
    // Lê apenas do estado sincronizado do Firestore (via firestoreAppState)
    try {
      const appState = window.firestoreAppState;
      const usuario = appState && appState.usuario;
      const valor = usuario && usuario.roletaUltimoUso;

      if (!valor) return null;

      let d = null;

      // Já veio como Date
      if (valor instanceof Date) {
        d = valor;
      }
      // Firestore Timestamp (tem .toDate())
      else if (valor && typeof valor.toDate === 'function') {
        d = valor.toDate();
      }
      // ISO string ou timestamp numérico
      else if (typeof valor === 'string' || typeof valor === 'number') {
        d = new Date(valor);
      }

      if (!d || isNaN(d.getTime())) return null;
      return d;
    } catch (e) {
      console.warn('Erro ao ler roletaUltimoUso do Firestore', e);
      return null;
    }
  }

  function msRestantes() {
    const last = getLastUso();
    if (!last) return 0;
    const alvo = last.getTime() + COOLDOWN_MS;
    const diff = alvo - Date.now();
    return diff > 0 ? diff : 0;
  }

  function format(ms) {
    let t = Math.floor(ms / 1000);
    const d = Math.floor(t / 86400);
    t -= d * 86400;
    const h = Math.floor(t / 3600);
    t -= h * 3600;
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return (d > 0 ? d + 'd ' : '') + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // ==========================
  // LISTA DE PRÊMIOS (19 setores)
  // ==========================

  const setores = [
    // ORGASMOS / MIMO / SERVIÇO
    { icon: '👙', label: 'LING', full: 'Ativar bônus lingerie hoje', cor: '#ffd27f' }, // amarelo
    { icon: '🧼', label: 'CRAV', full: 'Tirar cravos — R$1.500', cor: '#b0ff8a' }, // verde
    { icon: '🎬🚫🇰🇷', label: 'NO-KOR', full: 'Filme proibido 🇰🇷 — R$3.000', cor: '#8de8ff' }, // azul
    { icon: '🦶', label: 'PÉS', full: 'Massagem nos pés — R$3.500', cor: '#ffb3e6' }, // rosa

    { icon: '☕', label: 'CAFÉ', full: 'Café na cama — R$4.000', cor: '#ffd27f' }, // amarelo
    { icon: '🧽', label: 'LAV', full: 'Lavar/esfoliar os pés — R$4.500', cor: '#b0ff8a' }, // verde
    { icon: '💆', label: 'MASS', full: 'Massagem — R$5.000', cor: '#8de8ff' }, // azul
    { icon: '🍳', label: 'JANT', full: 'Cozinhar jantar — R$6.000', cor: '#ffb3e6' }, // rosa

    { icon: '💃', label: 'SAIR', full: 'Sair com amiga — R$6.500', cor: '#ffd27f' }, // amarelo
    { icon: '🛎️', label: 'SERV', full: 'Servir (2 tarefas) — R$6.500', cor: '#b0ff8a' }, // verde
    { icon: '🎬🇰🇷', label: 'K-OK', full: 'Filme 🇰🇷 permitido — R$12.250', cor: '#8de8ff' }, // azul
    { icon: '👑', label: 'DIA', full: 'Decide a agenda do dia — R$15.000', cor: '#ffb3e6' }, // rosa

    { icon: '💵', label: '60', full: 'Ganha US$60 — R$25.000', cor: '#ffd27f' }, // amarelo

    // REDUTORES DE TEMPO
    { icon: '⌛', label: '-6H', full: 'Reduzir 6h — R$2.000', cor: '#b0ff8a' }, // verde
    { icon: '⌛', label: '-12H', full: 'Reduzir 12h — R$3.500', cor: '#8de8ff' }, // azul
    { icon: '📅', label: '-1D', full: 'Reduzir 1 dia — R$6.000', cor: '#ffb3e6' }, // rosa
    { icon: '📅', label: '-3D', full: 'Reduzir 3 dias — R$11.000', cor: '#ffd27f' }, // amarelo
    { icon: '📅', label: '-4D', full: 'Reduzir 4 dias — R$18.000', cor: '#b0ff8a' }, // verde

    // CASTIGO
    { icon: '😈', label: 'NADA', full: 'Nada hoje 😈', cor: '#8de8ff' }, // azul
  ];

  // Chances relativas de cada prêmio (% da sua tabela)
  // chave = label do setor
  const CHANCES_POR_LABEL = {
    CRAV: 16.58, // Tirar cravos
    '-6H': 12.44, // Reduzir 6h
    LING: 8.29, // Ativar bônus lingerie hoje
    'NO-KOR': 8.29, // Vale escolher filme/série 🚫🇰🇷
    PÉS: 7.11, // Massagem nos pés
    '-12H': 7.11, // Reduzir 12h
    CAFÉ: 6.22, // Café da manhã na cama
    LAV: 5.53, // Lavar os pés e esfoliar
    MASS: 4.98, // Massagem
    JANT: 4.15, // Cozinhar jantar
    '-1D': 4.15, // Reduzir 1 dia
    NADA: 4.15, // Nada hoje 😈
    SAIR: 3.83, // Vale sair sozinha com amiga
    SERV: 3.83, // Obrigação de servir (2 tarefas)
    '-3D': 2.26, // Reduzir 3 dias
    'K-OK': 2.03, // Vale escolher FILME ✔️🇰🇷
    DIA: 1.66, // Ela decide toda a agenda do dia
    '-4D': 1.38, // Reduzir 4 dias
    60: 0.99, // Ganha 60 dólares
  };

  // se algum setor não estiver na tabela, cai aqui (peso = 1)
  function getPesoSetor(setor) {
    return CHANCES_POR_LABEL[setor.label] ?? 1;
  }

  const TOTAL_SETORES = setores.length;
  const ANGULO = 360 / TOTAL_SETORES;
  const OFFSET = -90; // roda começa virada "pra cima"

  function getSetorColor(index) {
    return setores[index].cor;
  }

  // ======================================
  // CRIAÇÃO DA ROLETA VISUAL (CORREÇÃO DE ALINHAMENTO)
  // ======================================

  function criarRoletaVisual() {
    const wheel = document.createElement('div');
    wheel.id = 'roletaWheel';
    wheel.style = `
      width: 320px;
      height: 320px;
      border-radius: 50%;
      position: relative;
      overflow: visible;
      margin: 0 auto;
      transform: rotate(0deg);
      transition: transform 4s cubic-bezier(.2,1,.3,1);
      border: 4px solid #ffd700;
      box-shadow: 0 0 20px #000;
    `;

    // ---------- FUNDO EM CONIC-GRADIENT (CORRIGIDO) ----------
    let stops = [];
    for (let i = 0; i < TOTAL_SETORES; i++) {
      // aqui a gente divide certinho de 0° a 360°
      const start = i * ANGULO;
      const end = (i + 1) * ANGULO;
      const cor = getSetorColor(i);
      stops.push(`${cor} ${start}deg ${end}deg`);
    }

    // e usa o OFFSET só para girar o gradiente inteiro
    wheel.style.background = `conic-gradient(from ${OFFSET}deg, ${stops.join(',')})`;

    // ---------- BOLA CENTRAL (HUB) ----------
    const hubSize = 100;
    const hub = document.createElement('div');
    hub.style = `
      position: absolute;
      left: 50%;
      top: 50%;
      width: ${hubSize}px;
      height: ${hubSize}px;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #fffebb, #ffd700, #ffa500);
      box-shadow: 0 0 15px rgba(0,0,0,0.5);
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 42px;
    `;
    hub.innerHTML = '😈';
    wheel.appendChild(hub);

    // ---------- DIVISÓRIAS (LINHAS) ----------
    for (let i = 0; i < TOTAL_SETORES; i++) {
      const ang = OFFSET + i * ANGULO;
      const sep = document.createElement('div');
      sep.style = `
        position: absolute;
        left: 50%;
        top: 50%;
        width: 1px;
        height: 160px;
        background: rgba(0,0,0,0.15);
        transform-origin: top center;
        transform: rotate(${ang + 180}deg);
        z-index: 1;
        pointer-events: none;
      `;
      wheel.appendChild(sep);
    }

    // ---------- ITENS (TEXTO + ÍCONE + PREGOS) ----------
    const raioTotal = 160;
    const espacoHub = 58;

    for (let i = 0; i < TOTAL_SETORES; i++) {
      // 1. Onde fica o TEXTO? (No meio da fatia)
      const anguloTexto = OFFSET + i * ANGULO + ANGULO / 2;

      // 2. Onde fica o PREGO? (Exatamente na linha que começa a fatia)
      //    Aqui entra a correção: somamos 270° para alinhar com a linha visual.
      const anguloPrego = OFFSET + i * ANGULO + 270;

      // ===== LABEL DO SETOR (Texto) =====
      const lbl = document.createElement('div');
      lbl.innerHTML = `
        <span style="font-size: 14px; margin-right: 5px;">${setores[i].icon}</span>
        <span style="
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        ">${setores[i].label}</span>
      `;

      lbl.style = `
        position: absolute;
        left: 50%;
        top: 50%;
        height: 30px;
        width: ${raioTotal}px;
        transform-origin: 0% 50%;
        transform: translate(0, -50%) rotate(${anguloTexto}deg);
        padding-left: ${espacoHub}px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        color: #111;
        text-shadow: 0 1px 0 rgba(255,255,255,0.3);
        white-space: nowrap;
        pointer-events: none;
        z-index: 5;
      `;
      wheel.appendChild(lbl);

      // ===== PREGO (Bolinha) =====
      const peg = document.createElement('div');
      peg.style = `
        position: absolute;
        left: 50%;
        top: 50%;
        width: 10px;
        height: 10px;
        background: #fff;
        border-radius: 50%;
        border: 1px solid #555;
        box-shadow: 1px 1px 2px rgba(0,0,0,0.4);
        transform: translate(-50%, -50%)
                   rotate(${anguloPrego}deg)
             translate(152px, 0);
        z-index: 15;
      `;
      wheel.appendChild(peg);
    }

    return wheel;
  }

  // ======================================
  // PONTEIRO CURTO + ANIMAÇÃO DE BALANÇO
  // ======================================

  function criarPonteiro() {
    const pointer = document.createElement('div');
    pointer.id = 'roletaPointer';

    pointer.style = `
    position: absolute;
    left: 50%;
    top: 75px;
    transform: translateX(-50%) rotate(180deg);
    width: 7px;
    height: 38px;
    background: linear-gradient(#ff8080, #ff2020);
    border-radius: 999px;
    transform-origin: 50% 100%;
    z-index: 50;
    box-shadow: 0 4px 6px rgba(0,0,0,.7);
  `;

    const head = document.createElement('div');
    head.style = `
    position: absolute;
    width: 22px;
    height: 22px;
    background: #111;
    border: 2px solid #ffd700;
    border-radius: 50%;
    left: 50%;
    bottom: -8px;
    transform: translateX(-50%);
    box-shadow: 0 2px 4px rgba(0,0,0,.8);
  `;
    pointer.appendChild(head);

    return pointer;
  }

  // ---------- Animação do wiggle (mexer) ----------
  const styleWiggle = document.createElement('style');
  styleWiggle.textContent = `
  @keyframes ponteiro-wiggle-forte {
    0%   { transform: translateX(-50%) rotate(180deg); }
    25%  { transform: translateX(-50%) rotate(172deg); }
    50%  { transform: translateX(-50%) rotate(188deg); }
    75%  { transform: translateX(-50%) rotate(176deg); }
    100% { transform: translateX(-50%) rotate(180deg); }
  }

  @keyframes ponteiro-wiggle-suave {
    0%   { transform: translateX(-50%) rotate(180deg); }
    25%  { transform: translateX(-50%) rotate(178deg); }
    50%  { transform: translateX(-50%) rotate(182deg); }
    75%  { transform: translateX(-50%) rotate(179deg); }
    100% { transform: translateX(-50%) rotate(180deg); }
  }
`;
  document.head.appendChild(styleWiggle);

  // ====================================================
  // MODAL DA ROLETA
  // ====================================================

  function abrirModalRoleta(onFinish) {
    const overlay = document.createElement('div');
    overlay.style = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
    `;

    const box = document.createElement('div');
    box.id = 'roletaBox';
    box.style = `
      position: relative;
      width: min(460px, 94vw);
      padding: 22px;
      border-radius: 18px;
      background: #111;
      border: 1px solid #ffd700;
      box-shadow: 0 0 22px #000;
      color: #fff;
      text-align: center;
      transform: scale(.85);
      opacity: 0;
      transition: all .25s ease-out;
    `;

    box.innerHTML = `
      <h2 style="margin:0 0 12px;color:#ffd700;font-size:22px;letter-spacing:.05em;">
        ROLETA
      </h2>
      <p style="font-size:13px;margin-top:0;margin-bottom:55px;color:#ccc;">
        Clique para girar e tentar a sorte.
      </p>
    `;

    const wheel = criarRoletaVisual();
    const pointer = criarPonteiro();

    const visor = document.createElement('div');
    visor.id = 'roletaVisor';
    visor.style = `
      margin-top: 18px;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #444;
      background: #222;
      color: #ffd700;
      min-height: 36px;
      font-size: 14px;
      font-weight: 600;
    `;
    visor.textContent = 'Clique em Girar 😈';

    const btnGirar = document.createElement('button');
    btnGirar.id = 'btnRoletaGirar';
    btnGirar.textContent = 'Girar 🎰';
    btnGirar.style = `
      margin-top: 16px;
      padding: 12px 22px;
      border-radius: 999px;
      background: linear-gradient(135deg,#ffd700,#ffb347);
      border: none;
      cursor: pointer;
      color: #000;
      font-weight: 700;
      font-size: 15px;
      box-shadow: 0 4px 10px rgba(0,0,0,.5);
    `;

    box.appendChild(wheel);
    box.appendChild(pointer);
    box.appendChild(visor);
    box.appendChild(btnGirar);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      box.style.transform = 'scale(1)';
      box.style.opacity = '1';
    });

    overlay.onclick = (ev) => {
      if (ev.target === overlay) {
        overlay.remove();
        if (onFinish) onFinish();
      }
    };

    btnGirar.onclick = () => girarRoleta(wheel, pointer, visor, overlay, onFinish);
  }

  // ====================================================================
  // ANIMAÇÃO DO GIRO
  // ====================================================================

  let rotacaoAtual = 0;

  function girarRoleta(wheel, pointer, visor, overlay, onFinish) {
    const setoresCount = TOTAL_SETORES;
    const angSetor = ANGULO;

    // Sorteia um índice de setor baseado nos pesos (chances)
    function sortearIndicePorPeso() {
      // soma total dos pesos
      const somaPesos = setores.reduce((acc, s) => acc + getPesoSetor(s), 0);

      // número aleatório entre 0 e somaPesos
      let r = Math.random() * somaPesos;

      // varre os setores até achar em qual faixa caiu
      for (let i = 0; i < setores.length; i++) {
        r -= getPesoSetor(setores[i]);
        if (r <= 0) {
          return i;
        }
      }

      // fallback defensivo (não deveria chegar aqui)
      return setores.length - 1;
    }

    const indiceFinal = sortearIndicePorPeso();

    const anguloDoSetor = OFFSET + indiceFinal * angSetor + angSetor / 2;

    const voltas = 8 * 360;
    const rotFinal = rotacaoAtual + voltas + (OFFSET - anguloDoSetor);
    rotacaoAtual = rotFinal;

    // ponteiro balança forte no começo
    pointer.style.animation = 'ponteiro-wiggle-forte .12s infinite';

    wheel.style.transition = 'transform 5.5s cubic-bezier(.12,1,.22,1)';
    wheel.style.transform = `rotate(${rotFinal}deg)`;

    const pregosInterval = iniciarTicsDuranteGiro(wheel);

    // perto do fim, troca pra um balanço bem mais suave
    setTimeout(() => {
      pointer.style.animation = 'ponteiro-wiggle-suave .18s infinite';
    }, 3500);

    setTimeout(() => {
      clearInterval(pregosInterval);
      pointer.style.animation = 'none';

      const premio = setores[indiceFinal];
      const corSetor = getSetorColor(indiceFinal);

      visor.style.background = `linear-gradient(135deg, ${corSetor}, #111)`;
      visor.style.color = '#000';
      visor.textContent = premio.full;

      try {
        audioWhip.currentTime = 0;
        audioWhip.play();
      } catch {}

      // Persiste no Firestore (horário + texto + log de giros)
      if (typeof window.fsRegistrarGiroRoleta === 'function') {
        try {
          window.fsRegistrarGiroRoleta(premio.label || null, premio.full || null);
        } catch (e) {
          console.warn('Falha ao registrar giro da roleta no Firestore', e);
        }
      } else if (typeof window.fsAtualizarUsuario === 'function') {
        // Fallback simples caso fsRegistrarGiroRoleta não esteja disponível
        try {
          window.fsAtualizarUsuario({
            roletaUltimoUso: new Date().toISOString(),
            roletaUltimoResultadoTexto: premio.full || null,
          });
        } catch (e) {
          console.warn('Falha no fallback de atualização da roleta no Firestore', e);
        }
      }

      salvarResultado(premio.full);

      setTimeout(() => {
        overlay.remove();
        if (onFinish) onFinish();
      }, 7000);
    }, 5500);
  }

  // ====================================================================
  // TIC-TIC DURANTE O GIRO
  // ====================================================================

  function iniciarTicsDuranteGiro(wheel) {
    let ultimoAngulo = 0;

    const interval = setInterval(() => {
      const transform = wheel.style.transform;
      const match = transform.match(/rotate\(([-0-9.]+)deg\)/);
      if (!match) return;

      const ang = parseFloat(match[1]);
      const delta = Math.abs(ang - ultimoAngulo);
      ultimoAngulo = ang;

      if (delta > 8) {
        try {
          audioTick.currentTime = 0;
          audioTick.play();
        } catch {}
      }
    }, 35);

    return interval;
  }

  // ====================================================================
  // RESULTADO SALVO
  // ====================================================================

  function salvarResultado(texto) {
    // Resultado é persistido no Firestore via fsRegistrarGiroRoleta.
    // Aqui só atualizamos a UI local.

    const span = obterAreaResultadoTexto();
    if (span) {
      span.textContent = 'Resultado da roleta: ' + texto;
      span.parentElement.style.display = 'flex';
    }
  }

  function restaurarResultado() {
    let texto = null;

    // Tenta ler do Firestore (estado sincronizado pelo firestoreAppState)
    try {
      const appState = window.firestoreAppState;
      const usuario = appState && appState.usuario;
      if (usuario && typeof usuario.roletaUltimoResultadoTexto === 'string') {
        texto = usuario.roletaUltimoResultadoTexto;
      }
    } catch (e) {
      console.warn('Erro ao ler roletaUltimoResultadoTexto do Firestore', e);
    }

    if (!texto) return;

    const span = obterAreaResultadoTexto();
    if (span) {
      span.textContent = 'Resultado da roleta: ' + texto;
      span.parentElement.style.display = 'flex';
    }
  }

  function obterAreaResultadoTexto() {
    let area = document.getElementById('resultadoRoletaDia');
    if (area) {
      return document.getElementById('resultadoRoletaDiaTexto');
    }

    const tarefas = document.getElementById('tarefasPendentes');
    if (!tarefas || !tarefas.parentElement) return null;

    const container = tarefas.parentElement;

    area = document.createElement('label');
    area.id = 'resultadoRoletaDia';
    area.style = `
      display: flex;
      gap: 10px;
      margin-top: 10px;
      padding: 12px;
      background: #222;
      border-radius: 10px;
      border: 1px solid #ffd700;
      color: #ffd700;
      font-size: 13px;
      align-items: center;
      box-shadow: 0 0 12px rgba(0,0,0,.6);
    `;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style = 'cursor:pointer; width:16px; height:16px;';
    cb.onchange = () => {
      area.style.display = 'none';
    };

    const span = document.createElement('span');
    span.id = 'resultadoRoletaDiaTexto';
    span.style = 'flex:1;';

    area.appendChild(cb);
    area.appendChild(span);

    if (tarefas.nextSibling) {
      container.insertBefore(area, tarefas.nextSibling);
    } else {
      container.appendChild(area);
    }

    return span;
  }

  // ====================================================================
  // BOTÃO FLUTUANTE + COOLDOWN
  // ====================================================================

  let intervaloCooldown = null;

  function criarBotaoFlutuante() {
    if (document.getElementById('btnRoletaFlutuante')) return;

    const btn = document.createElement('button');
    btn.id = 'btnRoletaFlutuante';

    btn.style = `
    position: fixed;
    right: 32px;
    bottom: 32px;
    width: 60px;
    height: 60px;
    border-radius: 999px;
    border: 1px solid #ffd700;
    color: #ffd700;
    font-size: 26px;
    cursor: pointer;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 18px rgba(0,0,0,.75), 0 0 10px rgba(255,215,0,.35);
    background: radial-gradient(circle at top, rgba(255,215,0,.32), rgba(15,15,15,1));
  `;

    btn.textContent = '🎰';

    btn.onclick = () => {
      if (msRestantes() > 0) return;
      abrirModalRoleta(() => atualizarCooldown(btn));
    };

    document.body.appendChild(btn);
    atualizarCooldown(btn);
  }

  function atualizarCooldown(btn) {
    function tick() {
      const ms = msRestantes();

      // Sem cooldown: botão liberado, volta pro visual normal
      if (ms <= 0) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.background = 'radial-gradient(circle at top, rgba(255,215,0,.32), rgba(15,15,15,1))';
        btn.title = 'Roleta disponível!';
        return;
      }

      btn.disabled = true;
      btn.style.opacity = '.8';

      // fração de tempo RESTANTE (1 no início, 0 no final)
      const fracRestante = ms / COOLDOWN_MS;
      const deg = Math.max(0, Math.min(360, fracRestante * 360));

      // começa 100% amarelo e vai ESCURECENDO com o tempo
      btn.style.background = `
      conic-gradient(
        rgba(138, 29, 38, 1) 0deg ${deg}deg,
        rgba(40,40,40,1) ${deg}deg 360deg
      ),
      radial-gradient(circle at top, rgba(15,15,15,1), rgba(15,15,15,1))
    `;

      btn.title = 'Próxima roleta em ' + format(ms);
    }

    tick();

    if (intervaloCooldown) clearInterval(intervaloCooldown);
    intervaloCooldown = setInterval(tick, 1000);
  }

  // ====================================================================
  // INICIALIZAÇÃO
  // ====================================================================

  document.addEventListener('DOMContentLoaded', () => {
    criarBotaoFlutuante();
    restaurarResultado();
  });
})();
