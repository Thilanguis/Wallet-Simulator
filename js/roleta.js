// ------------------------------------------------------------
// ROLETA — MODELO B COMPLETO
// Roda visual giratória, ponteiro curto, pregos, tics, chicote,
// desaceleração real, responsivo, cooldown 3 dias.
// ------------------------------------------------------------

(function () {
  // ==========================
  // CONFIGURAÇÕES
  // ==========================
  const STORAGE_KEY_DATA = 'roletaUltimoUso';
  const STORAGE_KEY_RESULT_TEXT = 'roletaUltimoResultadoTexto';
  const COOLDOWN_MS = Economy.config.rouletteCooldownMs; // 3 dias

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
    const v = AppStorage.getItem(STORAGE_KEY_DATA);
    if (!v) return null;
    const n = Number(v);
    return new Date(n);
  }

  function marcarUso() {
    AppStorage.setItem(STORAGE_KEY_DATA, String(Date.now()));
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

  const setores = Economy.config.roulette.map((sector) => ({ ...sector, full: sector.label }));
  function refreshPrizeLabels() {
    for (const s of setores) {
      const service = Economy.config.services.find((item) => item.id === s.serviceId);
      s.full =
        s.kind === 'bonus'
          ? 'Bônus lingerie por ' + Economy.config.bonusDurationHours + 'h'
          : s.kind === 'none'
            ? 'Nada hoje'
            : s.kind === 'offer'
              ? 'Benefício do catálogo: ' + service.label + ' · ' + formatBR(getEconomy().prices[service.id])
              : (s.kind === 'reducer' ? 'Redutor gratuito: ' : 'Serviço gratuito: ') + service.label + ' · valor de catálogo ' + formatBR(getEconomy().prices[service.id]);
    }
  }
  function settleSpin(spin) {
    if (!WalletStore.isWritable()) return;
    const saved = JSON.parse(AppStorage.getItem('rouletteSpin') || 'null');
    if (!saved || saved.id !== spin.id || saved.settled) return;
    refreshPrizeLabels();
    const prize = setores[saved.index];
    const awards = JSON.parse(AppStorage.getItem('rouletteAwards') || '[]');
    if (!awards.some((a) => a.id === saved.id))
      awards.push({ id: saved.id, sector: saved.index, label: prize.full, kind: prize.kind, serviceId: prize.serviceId, claimed: prize.kind === 'none' || prize.kind === 'offer', createdAt: new Date().toISOString() });
    AppStorage.setItem('rouletteAwards', JSON.stringify(awards));
    AppStorage.setItem('rouletteSpin', JSON.stringify({ ...saved, settled: true }));
    salvarResultado(prize.full);
    window.dispatchEvent(new Event('roulette:awards'));
  }

  // Chances relativas de cada prêmio (% da sua tabela)
  // chave = label do setor

  // se algum setor não estiver na tabela, cai aqui (peso = 1)
  function getPesoSetor(setor) {
    return getEconomy().rouletteWeights[setor.label] ?? setor.weight;
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
    if (document.getElementById('roletaBox') || msRestantes() > 0) return;
    refreshPrizeLabels();
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
      if (ev.target === overlay && !overlay.dataset.spinning) {
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
    if (overlay.dataset.spinning || msRestantes() > 0) return;
    overlay.dataset.spinning = '1';
    document.getElementById('btnRoletaGirar').disabled = true;
    const setoresCount = TOTAL_SETORES;
    const angSetor = ANGULO;

    const indiceFinal = sortearIndicePorPeso();
    const spin = { id: crypto.randomUUID(), index: indiceFinal, settled: false };
    marcarUso();
    AppStorage.setItem('rouletteSpin', JSON.stringify(spin));
    AppStorage.flush();

    const anguloDoSetor = OFFSET + indiceFinal * angSetor + angSetor / 2;

    const voltas = 8 * 360;
    const rotFinal = rotacaoAtual + voltas + (OFFSET - anguloDoSetor);
    rotacaoAtual = rotFinal;

    // ponteiro balança forte no começo
    pointer.style.animation = 'ponteiro-wiggle-forte .12s infinite';

    wheel.style.transition = 'transform 5.5s cubic-bezier(.12,1,.22,1)';
    wheel.style.transform = `rotate(${rotFinal}deg)`;

    const pregosInterval = iniciarTicsDuranteGiro(wheel);

    // Sorteia um índice de setor baseado nos pesos (chances)
    function sortearIndicePorPeso() {
      return Economy.drawRoulette(getEconomy());
    }

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
        audioWhip.play().catch(() => {});
      } catch {}

      marcarUso();
      settleSpin(spin);

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
          audioTick.play().catch(() => {});
        } catch {}
      }
    }, 35);

    return interval;
  }

  // ====================================================================
  // RESULTADO SALVO
  // ====================================================================

  function salvarResultado(texto) {
    try {
      AppStorage.setItem(STORAGE_KEY_RESULT_TEXT, texto);
    } catch {}
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
    const spin = JSON.parse(AppStorage.getItem('rouletteSpin') || 'null');
    if (spin && !spin.settled) settleSpin(spin);
  });
  window.addEventListener('wallet:control', () => {
    const spin = JSON.parse(AppStorage.getItem('rouletteSpin') || 'null');
    if (spin && !spin.settled) settleSpin(spin);
  });
})();
