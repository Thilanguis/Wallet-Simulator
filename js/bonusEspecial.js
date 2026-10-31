/* =================================================================== */
/* BÔNUS ESPECIAL (Langerie) – GANHO DE CRÉDITO                        */
/* =================================================================== */

(function () {
  // ------------------------------------------------------------
  // Multiplicador global (vem de efeitoBonusAtivoGanhoCredito)
  // ------------------------------------------------------------
  function getBonusEspecialMultiplier() {
    var mult = 1 + getEconomy().bonusPercent / 100;
    return window.bonusEspecialAtivo ? mult : 1;
  }
  window.getBonusEspecialMultiplier = getBonusEspecialMultiplier;

  // ----------------- Helpers numéricos -----------------
  function bonusFmtBR(n) {
    return formatBR(Number(n) || 0);
  }

  function bonusParseBR(text) {
    if (!text) return 0;
    var cleaned = String(text)
      .replace(/[^0-9,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    var num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  // ----------------- Badge ao lado do "Como ganhou" -----------------
  function renderBonusEspecialInlineBadge() {
    const select = document.getElementById('selectGanho');
    if (!select) return;
    let badge = document.getElementById('bonusEspecialInline');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'bonusEspecialInline';
      badge.className = 'gain-bonus-note';
      badge.setAttribute('role', 'status');
      const text = document.createElement('span');
      text.id = 'bonusEspecialInlineText';
      badge.append(text);
      select.after(badge);
    }
    const active = !!window.bonusEspecialAtivo;
    badge.classList.toggle('is-active', active);
    const caption = active ? 'Bônus lingerie ativo · +' + getEconomy().bonusPercent + '% nos ganhos elegíveis' : 'Bônus lingerie desligado';
    const text = document.getElementById('bonusEspecialInlineText');
    if (text.textContent !== caption) text.textContent = caption;
  }

  let bonusSelectDecoratedState = null;

  // ----------------- Decorar opções do select "Como ganhou" -----------------
  function decorateSelectGanhoForBonus() {
    try {
      const sel = document.getElementById('selectGanho');
      if (!sel) return;

      const active = !!window.bonusEspecialAtivo;

      // se o estado (ligado/desligado) não mudou, não faz nada
      if (bonusSelectDecoratedState === active) {
        return;
      }
      bonusSelectDecoratedState = active;

      Array.prototype.forEach.call(sel.options, (opt) => {
        if (!opt.dataset.originalText) {
          opt.dataset.originalText = opt.textContent || '';
        }

        if (active) {
          // adiciona o (⚡) uma vez
          if (!opt.textContent.includes('⚡')) {
            opt.textContent = opt.dataset.originalText + ' (⚡)';
          }
        } else {
          // volta pro texto original
          opt.textContent = opt.dataset.originalText;
        }
      });
    } catch (e) {
      console.error('decorateSelectGanhoForBonus error:', e);
    }
  }

  // ----------------- Faixa embaixo explicando o bônus -----------------
  function renderBonusEspecialBanner() {
    try {
      var banner = document.getElementById('bonusEspecialBanner');
      var active = !!window.bonusEspecialAtivo;
      var mult = 1 + getEconomy().bonusPercent / 100;

      if (!active) {
        if (banner) banner.remove();
        return;
      }

      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'bonusEspecialBanner';
        banner.style.cssText = ['margin-top:6px', 'font-size:11px', 'color:#bbf7d0', 'background:#052e16', 'border-radius:999px', 'padding:4px 10px', 'display:inline-flex', 'align-items:center', 'gap:6px'].join(';');

        var icon = document.createElement('span');
        icon.textContent = '👙';

        var text = document.createElement('span');
        text.id = 'bonusEspecialBannerText';

        banner.appendChild(icon);
        banner.appendChild(text);

        var ganhoFields = document.getElementById('ganhoFields');
        if (ganhoFields) {
          ganhoFields.appendChild(banner);
        } else {
          var select = document.getElementById('selectGanho');
          if (select && select.parentElement) {
            select.parentElement.appendChild(banner);
          } else {
            document.body.appendChild(banner);
          }
        }
      }

      var textNode = document.getElementById('bonusEspecialBannerText');
      if (textNode) {
        textNode.textContent = 'Bônus x' + mult.toLocaleString('pt-BR') + ' aplicado em todos os ganhos enquanto a langerie especial estiver ativa.';
      }
    } catch (e) {}
  }

  // ----------------- Preview + CHIP: Valor fixo (campo "Valor (R$)") -----------------
  var bonusPreviewValorEl = null;
  var bonusChipGanhoEl = null;

  function ensureBonusChip() {
    if (bonusChipGanhoEl) return bonusChipGanhoEl;

    var mult = 1 + getEconomy().bonusPercent / 100;
    var pctNumber = Math.round((mult - 1) * 100);

    var chipText = '+' + pctNumber + '%';

    var chip = document.createElement('div');
    chip.className = 'chip-desconto-lingerie';
    chip.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:6px',
      'margin-top:6px',
      'padding:4px 8px',
      'border-radius:999px',
      'border:1px solid rgba(52,211,153,.85)',
      'background:rgba(6,78,59,.85)',
      'color:#bbf7d0',
      'font-weight:800',
      'font-size:12px',
      'letter-spacing:.3px',
      'box-shadow:inset 0 0 12px rgba(16,185,129,.25)',
    ].join(';');

    var pctSpan = document.createElement('span');
    pctSpan.textContent = chipText;
    pctSpan.style.cssText = 'border:1px solid rgba(16,185,129,.9);padding:2px 6px;border-radius:999px;background:rgba(22,163,74,.35)';

    var txt = document.createElement('span');
    txt.textContent = 'Bônus lingerie';

    chip.appendChild(pctSpan);
    chip.appendChild(txt);

    bonusChipGanhoEl = chip;
    return chip;
  }

  function renderBonusEspecialPreviewValorGanho() {
    try {
      var ganhoFields = document.getElementById('ganhoFields');
      var valorInput = document.getElementById('valorGanho');
      if (!ganhoFields || !valorInput) return;

      if (!bonusPreviewValorEl) {
        bonusPreviewValorEl = document.createElement('div');
        bonusPreviewValorEl.id = 'previewBonusGanhoCredito';
        bonusPreviewValorEl.style.cssText = 'margin-top:6px;color:#d1c089;font-size:12px';

        var contadorBloco = document.getElementById('contadorBloco');
        if (contadorBloco && contadorBloco.parentElement === ganhoFields) {
          valorInput.closest('label').insertAdjacentElement('afterend', bonusPreviewValorEl);
        } else {
          ganhoFields.appendChild(bonusPreviewValorEl);
        }
      }

      var active = !!window.bonusEspecialAtivo;
      var base = parseFloat(valorInput.value || '0');
      if (!active || !base) {
        bonusPreviewValorEl.style.display = 'none';
        if (bonusChipGanhoEl) bonusChipGanhoEl.style.display = 'none';
        return;
      }

      var mult = getBonusEspecialMultiplier();
      var comBonus = Math.round(base * mult * 100) / 100;

      bonusPreviewValorEl.innerHTML = [
        '<span style="opacity:.8">Ganho com bônus: </span>',
        '<span style="text-decoration:line-through;opacity:.6;margin-right:6px">' + bonusFmtBR(base) + '</span>',
        '<strong style="color:#a7f3d0">' + bonusFmtBR(comBonus) + '</strong>',
      ].join('');
      bonusPreviewValorEl.style.display = 'block';

      var chip = ensureBonusChip();
      if (bonusPreviewValorEl.nextSibling !== chip) {
        bonusPreviewValorEl.insertAdjacentElement('afterend', chip);
      }
      chip.style.display = 'inline-flex';
    } catch (e) {}
  }

  // ----------------- Preview: Valor POR MINUTO com bônus -----------------
  var bonusPreviewMinutoEl = null;

  function renderBonusEspecialPreviewPorMinuto() {
    try {
      var input = document.getElementById('valorPorMinuto');
      if (!input) return;

      // preview deve ficar LOGO ABAIXO do input
      if (!bonusPreviewMinutoEl) {
        bonusPreviewMinutoEl = document.createElement('div');
        bonusPreviewMinutoEl.id = 'previewBonusPorMinuto';
        bonusPreviewMinutoEl.style.cssText = 'margin-top:4px;color:#d1c089;font-size:12px';
        input.insertAdjacentElement('afterend', bonusPreviewMinutoEl);
      } else {
        // garante que continua logo depois do input
        if (bonusPreviewMinutoEl.previousElementSibling !== input) {
          bonusPreviewMinutoEl.remove();
          input.insertAdjacentElement('afterend', bonusPreviewMinutoEl);
        }
      }

      var active = !!window.bonusEspecialAtivo;
      if (!active) {
        bonusPreviewMinutoEl.style.display = 'none';
        bonusPreviewMinutoEl.textContent = '';
        input.style.textDecoration = 'none';
        return;
      }

      // pega o valor digitado (ex.: "3,99" ou "3.99")
      var raw = (input.value || '').toString().trim();
      if (!raw) {
        bonusPreviewMinutoEl.style.display = 'none';
        bonusPreviewMinutoEl.textContent = '';
        input.style.textDecoration = 'none';
        return;
      }

      raw = raw.replace(/\s/g, '').replace(',', '.');
      var base = parseFloat(raw);
      if (isNaN(base) || base <= 0) {
        bonusPreviewMinutoEl.style.display = 'none';
        bonusPreviewMinutoEl.textContent = '';
        input.style.textDecoration = 'none';
        return;
      }

      var mult = getBonusEspecialMultiplier(); // ex.: 1.15
      var comBonus = Math.round(base * mult * 100) / 100;

      // deixa o INPUT riscado com o valor base
      // input.style.textDecoration = 'line-through';

      // texto: Valor por minuto com bônus: ~3,99~ 4,59
      bonusPreviewMinutoEl.innerHTML = [
        '<span style="opacity:.8">Valor por minuto com bônus: </span>',
        '<span style="text-decoration:line-through;opacity:.6;margin-right:6px">',
        bonusFmtBR(base),
        '</span>',
        '<strong style="color:#a7f3d0">',
        bonusFmtBR(comBonus),
        '</strong>',
      ].join('');

      bonusPreviewMinutoEl.style.display = 'block';
    } catch (e) {
      console.error('Erro no preview de valor por minuto com bônus:', e);
    }
  }

  // ----------------- Preview: Valor do TIMER (acumulado) -----------------
  var bonusPreviewTimerEl = null;

  function renderBonusEspecialPreviewTimer() {
    try {
      var display = document.getElementById('valorAcumuladoDisplay');
      var bloco = document.getElementById('contadorBloco');
      if (!display || !bloco) return;

      // preview deve ficar dentro do bloco do contador,
      // DEPOIS da linha Tempo / Valor
      if (!bonusPreviewTimerEl) {
        bonusPreviewTimerEl = document.createElement('div');
        bonusPreviewTimerEl.id = 'previewBonusGanhoTimer';
        bonusPreviewTimerEl.style.cssText = 'margin-top:4px;color:#d1c089;font-size:12px';
        bloco.appendChild(bonusPreviewTimerEl);
      }

      var active = !!window.bonusEspecialAtivo;
      var base = Number(display.textContent.replace(/\./g, '').replace(',', '.')) || 0;
      if (!active || base <= 0) {
        bonusPreviewTimerEl.style.display = 'none';
        display.style.textDecoration = 'none';
        return;
      }

      var mult = getBonusEspecialMultiplier();
      var comBonus = Math.round(base * mult * 100) / 100;

      // risca o valor de cima (Valor: X,XX)
      display.style.textDecoration = 'line-through';

      // texto: Créditos com bônus (tempo): 3,45
      bonusPreviewTimerEl.innerHTML = ['<span style="opacity:.8">Valor real com bônus (tempo): </span>', '<strong style="color:#a7f3d0">', bonusFmtBR(comBonus), '</strong>'].join('');

      bonusPreviewTimerEl.style.display = 'block';
    } catch (e) {}
  }

  // ----------------- Função principal chamada de fora -----------------
  function updateBonusEspecialUI() {
    renderBonusEspecialInlineBadge();
    decorateSelectGanhoForBonus();
    renderBonusEspecialBanner();
    renderBonusEspecialPreviewValorGanho();
    renderBonusEspecialPreviewPorMinuto(); // linha embaixo do input
    renderBonusEspecialPreviewTimer(); // linha embaixo do timer
  }
  window.updateBonusEspecialUI = updateBonusEspecialUI;

  // ----------------- Hooks de atualização automática -----------------
  function safeUpdate() {
    try {
      updateBonusEspecialUI();
    } catch (e) {}
  }

  function init() {
    var ganhoFields = document.getElementById('ganhoFields');
    if (ganhoFields) {
      ganhoFields.addEventListener('input', safeUpdate);
      ganhoFields.addEventListener('change', safeUpdate);
    }

    // Hooka calcularValorGanho se existir
    if (typeof window.calcularValorGanho === 'function') {
      var originalCalc = window.calcularValorGanho;
      window.calcularValorGanho = function () {
        var result = originalCalc.apply(this, arguments);
        safeUpdate();
        return result;
      };
    }

    // Observa mudanças no display do timer
    var display = document.getElementById('valorAcumuladoDisplay');
    if (display && window.MutationObserver) {
      var observer = new MutationObserver(function () {
        safeUpdate();
      });
      observer.observe(display, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    safeUpdate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
