let gainExtrasSignature = '';
const gainExtrasSelections = new Map();
function renderGainExtras(selected, settings) {
  const area = document.getElementById('gainExtras');
  const ids = Economy.config.gains.find((item) => item.id === selected)?.extras || [];
  const signature = JSON.stringify([selected, ids.map((id) => [id, Economy.config.extras[id]?.label, settings.extras[id]])]);
  if (gainExtrasSignature === signature) return;
  gainExtrasSignature = signature;
  area.replaceChildren();
  area.hidden = !ids.length;
  for (const id of ids) {
    const label = document.createElement('label'),
      box = document.createElement('input');
    box.type = 'checkbox';
    box.id = ['chkChule', 'chkFrancesinha', 'chkCatarro'].includes(id) ? id : 'gainExtra-' + id;
    box.dataset.extraId = id;
    box.checked = gainExtrasSelections.get(selected)?.has(id) || false;
    box.addEventListener('change', () => {
      const chosen = gainExtrasSelections.get(selected) || new Set();
      if (box.checked) chosen.add(id);
      else chosen.delete(id);
      gainExtrasSelections.set(selected, chosen);
      calcularValorGanho();
    });
    label.append(box, document.createTextNode(' ' + (Economy.config.extras[id]?.label || id) + ' (+' + formatBR(settings.extras[id]) + ')'));
    area.append(label);
  }
}
function calcularValorGanho() {
  const selected = document.getElementById('selectGanho').value;
  const input = document.getElementById('valorGanho');
  const settings = getEconomy();
  const fixed = settings.gains[selected] !== undefined;
  const quantity = document.getElementById('quantidadeMultiplicador');
  const multiplicative = selected === 'Tapa de pé na cara';
  renderGainExtras(selected, settings);
  quantity.style.display = multiplicative ? 'block' : 'none';
  document.getElementById('labelQuantidadeMultiplicador').style.display = multiplicative ? 'block' : 'none';
  quantity.value = Math.min(settings.quantityMax, Math.max(1, parseInt(quantity.value) || 1));
  const extras = Array.from(document.querySelectorAll('#gainExtras input:checked'), (box) => box.dataset.extraId);
  input.readOnly = fixed;
  input.max = settings.manualGainMax;
  input.value = selected === 'Outro' ? '' : Economy.gain(settings, selected, quantity.value, extras) || '';
}
