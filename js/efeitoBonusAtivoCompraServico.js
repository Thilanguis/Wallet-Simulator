// efeitoBonusAtivoCompraServico.js
// Aplica -15% SOMENTE a compras de serviço/tarefa comuns
// quando o bônus-lingerie estiver ativo. Ignora redutores,
// aceleração global e qualquer item de “reduzir/accelerar”.
// Não precisa alterar appMain.js: usa listener em CAPTURA
// no botão Registrar.

(function () {
  const DISCOUNT_RATE = 0.15; // 15%
  const MULT = 1 - DISCOUNT_RATE; // 0.85
  const CHIP_TEXT = `-${Math.round(DISCOUNT_RATE * 100)}%`;

  // -------- Helpers do app --------
  function bonusOn() {
    try {
      return !!window.bonusEspecialAtivo;
    } catch {
      return false;
    }
  }
  function parseVal(v) {
    const [valorStr, tarefa, descricao] = String(v || '').split('|');
    return {
      valor: parseInt(valorStr, 10) || 0,
      tarefa: tarefa || '',
      descricao: descricao || '',
    };
  }
  function fmtBR(n) {
    return (n || 0).toLocaleString('pt-BR');
  }

  // Heurísticas para saber se a opção é “redutor/acceleração”
  function isReducerOption(opt) {
    return !!(opt && opt.dataset && opt.dataset.reduzHoras);
  }
  function isAccelerationOrReduceName(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    // cobre nomes “Reduzir Xh”, “Aceleração ...”, e ID canônico
    return n.includes('reduzir') || n.includes('acelera') || n === 'acelerar_global_4d_1h';
  }

  // Elementos
  const tipoTransacao = document.getElementById('tipoTransacao'); // 'gasto' / 'ganho'
  const selectTarefa = document.getElementById('selectTarefa'); // opções "valor|nome|desc"
  const adicionarBtn = document.getElementById('adicionar');
  const chkBonus = document.getElementById('bonusEspecialCheckbox');

  if (!selectTarefa || !adicionarBtn) return;

  // --------- Regra de elegibilidade ---------
  function isEligibleForDiscount() {
    const isGasto = !tipoTransacao || tipoTransacao.value === 'gasto';
    if (!isGasto) return false;
    if (!bonusOn()) return false;

    const opt = selectTarefa.selectedOptions && selectTarefa.selectedOptions[0];
    if (!opt || !opt.value || opt.value === '0') return false;

    if (isReducerOption(opt)) return false; // opções com data-reduz-horas

    const parsed = parseVal(opt.value);
    if (!parsed.valor || parsed.valor <= 0) return false;
    if (isAccelerationOrReduceName(parsed.tarefa)) return false; // nomes que não recebem desconto

    return true;
  }

  // --------- UI (chip + preview) ---------
  let chip, preview;

  function ensureChip() {
    if (chip) return chip;
    chip = document.createElement('div');
    chip.className = 'chip-desconto-lingerie';
    chip.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:6px',
      'margin-top:6px',
      'padding:4px 8px',
      'border-radius:999px',
      'border:1px solid rgba(248,113,113,.75)', // borda vermelho suave
      'background:rgba(127,29,29,.55)', // fundo vinho escuro
      'color:#fecaca', // texto rosado claro
      'font-weight:800',
      'font-size:12px',
      'letter-spacing:.3px',
      'box-shadow:inset 0 0 12px rgba(127,29,29,.45)',
    ].join(';');

    const pct = document.createElement('span');
    pct.textContent = CHIP_TEXT; // "-15%"
    pct.style.cssText = 'border:1px solid rgba(248,113,113,.9);' + 'padding:2px 6px;' + 'border-radius:999px;' + 'background:rgba(239,68,68,.25)';

    const txt = document.createElement('span');
    txt.textContent = 'Bônus lingerie';

    chip.append(pct, txt);
    selectTarefa.parentElement.appendChild(chip);
    return chip;
  }

  function ensurePreview() {
    if (preview) return preview;
    preview = document.createElement('div');
    preview.id = 'previewDescontoCompra';
    preview.style.cssText = 'margin-top:6px;color:#d1c089;font-size:12px';
    selectTarefa.parentElement.appendChild(preview);
    return preview;
  }

  function updateUI() {
    const show = isEligibleForDiscount();

    // chip
    if (show) ensureChip().style.display = 'inline-flex';
    else if (chip) chip.style.display = 'none';

    // preview
    const block = ensurePreview();
    if (show) {
      const { valor } = parseVal(selectTarefa.value);
      const desc = Math.round(valor * MULT);
      block.innerHTML = ['<span style="opacity:.8">Preço com bônus: </span>', `<span style="text-decoration:line-through;opacity:.6;margin-right:6px">R$ ${fmtBR(valor)}</span>`, `<strong style="color:#ffda55">R$ ${fmtBR(desc)}</strong>`].join('');
      block.style.display = 'block';
    } else {
      block.style.display = 'none';
      block.textContent = '';
    }
  }

  // Eventos que mudam a UI
  selectTarefa.addEventListener('change', updateUI);
  if (tipoTransacao) tipoTransacao.addEventListener('change', updateUI);
  if (chkBonus) chkBonus.addEventListener('change', updateUI);
  document.addEventListener('DOMContentLoaded', updateUI);
  updateUI();

  // --------- Aplicação do desconto ao Registrar ---------
  // Listener em CAPTURA para ajustar temporariamente o value da <option>.
  adicionarBtn.addEventListener(
    'click',
    function onCapture() {
      if (!isEligibleForDiscount()) return;
      const opt = selectTarefa.selectedOptions && selectTarefa.selectedOptions[0];
      if (!opt) return;

      const parsed = parseVal(opt.value);
      const descontado = Math.round(parsed.valor * MULT);
      const original = opt.value;

      // set temporário
      opt.dataset.originalValueTmp = original;
      opt.value = `${descontado}|${parsed.tarefa}|${parsed.descricao}`;

      // restaura após os outros listeners do botão rodarem
      setTimeout(() => {
        if (opt.dataset.originalValueTmp) {
          opt.value = opt.dataset.originalValueTmp;
          delete opt.dataset.originalValueTmp;
        }
        updateUI();
      }, 0);
    },
    { capture: true }
  );
})();
