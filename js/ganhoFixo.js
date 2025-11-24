/* =================================================================== */
/* LÓGICA DE GANHO FIXO                         */
/* =================================================================== */

function calcularValorGanho() {
  const selectGanho = document.getElementById('selectGanho');
  const valorGanhoInput = document.getElementById('valorGanho');
  const pesNaCaraOptions = document.getElementById('pesNaCaraOptions');
  const comCatarro = document.getElementById('comCatarro');
  const suja_Mijada = document.getElementById('suja_Mijada');
  const quantidadeInput = document.getElementById('quantidadeMultiplicador');
  const labelQuantidade = document.getElementById('labelQuantidadeMultiplicador');
  const valorSelecionado = selectGanho.value;

  // esconder opções por padrão
  pesNaCaraOptions.style.display = 'none';
  quantidadeInput.style.display = 'none';
  labelQuantidade.style.display = 'none';
  comCatarro.style.display = 'none';
  suja_Mijada.style.display = 'none';
  valorGanhoInput.readOnly = false;
  // reset do campo valor para evitar confusões
  valorGanhoInput.value = '';

  if (FIXED_VALUES_GANHO[valorSelecionado]) {
    valorGanhoInput.readOnly = true;
    let valorBase = FIXED_VALUES_GANHO[valorSelecionado];

    // Pés na cara tem checkboxes extras
    if (valorSelecionado === 'Pés na cara') {
      pesNaCaraOptions.style.display = 'block';
      if (document.getElementById('chkChule').checked) valorBase += parseInt(document.getElementById('chkChule').dataset.value);
      if (document.getElementById('chkFrancesinha').checked) valorBase += parseInt(document.getElementById('chkFrancesinha').dataset.value);
      if (document.getElementById('_semBanho').checked) valorBase += parseInt(document.getElementById('_semBanho').dataset.value);
      valorGanhoInput.value = valorBase;
      return;
    }

    // Tapa de pé na cara: mostrar multiplicador de quantidade
    if (valorSelecionado === 'Tapa de pé na cara') {
      quantidadeInput.style.display = 'block';
      labelQuantidade.style.display = 'block';
      // garantir pelo menos 1
      let quantidade = parseInt(quantidadeInput.value) || 1;
      if (quantidade < 1) quantidade = 1;
      quantidadeInput.value = quantidade;
      // multiplicar valor base pelo número escolhido
      valorGanhoInput.value = valorBase * quantidade;
      return;
    }

    if (valorSelecionado === 'Cuspir na cara') {
      comCatarro.style.display = 'block';
      if (document.getElementById('chkCatarro').checked) valorBase += parseInt(document.getElementById('chkCatarro').dataset.value);
      valorGanhoInput.value = valorBase;
      return;
    }

    if (valorSelecionado === 'Chupar buceta') {
      suja_Mijada.style.display = 'block';
      if (document.getElementById('sujaMijada').checked) valorBase += parseInt(document.getElementById('sujaMijada').dataset.value);
      valorGanhoInput.value = valorBase;
      return;
    }

    // casos fixos simples
    valorGanhoInput.value = valorBase;
  }
}
