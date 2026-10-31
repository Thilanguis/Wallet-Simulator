/* Preview only; the charge is calculated once in appMain. */
document.addEventListener('DOMContentLoaded', () => {
  const select = document.getElementById('selectTarefa');
  const preview = document.createElement('div');
  preview.id = 'previewDescontoCompra';
  preview.className = 'purchase-bonus-preview';
  preview.setAttribute('aria-live', 'polite');
  select.after(preview);
  function update() {
    const [, id] = select.value.split('|');
    const item = Economy.config.services.find((s) => s.id === id);
    document.getElementById('dinnerGuestField').hidden = id !== 'Cozinhar jantar';
    document.getElementById('dinnerGuestHint').textContent = '+' + formatBR(getEconomy().contractRules.dinnerGuestPrice) + ' por amiga, antes do desconto lingerie.';
    if (!item) {
      preview.textContent = '';
      return;
    }
    let quote;
    try {
      quote = Economy.serviceCost(getEconomy(), item, Number(document.getElementById('dinnerGuestCount').value), window.bonusEspecialAtivo);
    } catch (error) {
      preview.textContent = error.message;
      return;
    }
    const discounted = quote.discounted,
      base = quote.original,
      price = quote.final;
    preview.replaceChildren();
    const line = document.createElement('p');
    line.className = 'purchase-bonus-values';
    const caption = document.createElement('span');
    caption.textContent = discounted ? 'Compra com desconto: ' : 'Preço final: ';
    line.append(caption);
    if (discounted) {
      const previous = document.createElement('s');
      previous.textContent = formatBR(base);
      line.append(previous);
    }
    const final = document.createElement('strong');
    final.textContent = formatBR(price);
    line.append(final);
    preview.append(line);
    const hours = item.reduceHours || (item.id === 'ACELERAR_GLOBAL_4D_1H' ? 96 : 0);
    if (hours) {
      const explanation = document.createElement('p');
      explanation.className = 'hint reducer-effect-preview';
      explanation.textContent = 'Reduz até ' + hours + 'h de cada prazo elegível ao longo de ' + Economy.config.reducerDurationMs / 1000 + 's.';
      preview.append(explanation);
    }
    if (discounted) {
      const chip = document.createElement('span');
      chip.className = 'purchase-bonus-chip';
      const percent = document.createElement('b');
      percent.textContent = '−' + getEconomy().discountPercent + '%';
      chip.append(percent, document.createTextNode(' Bônus lingerie'));
      const saved = document.createElement('span');
      saved.className = 'purchase-bonus-saved';
      saved.textContent = 'Você economiza ' + formatBR(Economy.round(base - price));
      preview.append(chip, saved);
    }
  }
  select.addEventListener('change', () => {
    document.getElementById('dinnerGuestCount').value = '0';
    update();
  });
  document.getElementById('dinnerGuestCount').addEventListener('input', update);
  document.getElementById('bonusEspecialCheckbox').addEventListener('change', () => queueMicrotask(update));
  window.addEventListener('economy:changed', update);
  update();
});
