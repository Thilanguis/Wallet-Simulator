/* =================================================================== */
/* TAREFAS PENDENTES                            */
/* =================================================================== */

// Função para renderizar as tarefas pendentes
function renderTarefasPendentes() {
  const tarefasContainer = document.getElementById('tarefasPendentes');
  tarefasContainer.innerHTML = '';

  if (tarefasPendentes.length === 0) {
    tarefasContainer.innerHTML = '<p style="color:#999; text-align:center;">Nenhuma tarefa pendente. 👑</p>';
    return;
  }

  tarefasPendentes.forEach((tarefa) => {
    const div = document.createElement('div');
    div.className = 'tarefa-item';
    div.setAttribute('data-id', tarefa.id);

    const count = tarefa.taskCount || (tarefa.tarefa === 'Obrigação de servir (2 tarefas)' ? 2 : 1);
    const steps = document.createElement('span');
    steps.className = 'task-steps';
    const completion = document.createElement('span');
    completion.className = 'task-completion';
    const completed = () => (tarefa.completedParts || []).filter(Boolean).length;
    const updateCompletion = () => {
      completion.textContent = completed() + ' de ' + count + ' concluída' + (count > 1 ? 's' : '');
    };
    updateCompletion();
    for (let part = 0; part < count; part++) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!tarefa.completedParts?.[part];
      checkbox.setAttribute('aria-label', count > 1 ? `Concluir tarefa ${part + 1} de ${count}` : 'Concluir ' + tarefa.tarefa);
      label.append(checkbox);
      if (count > 1) label.append(document.createTextNode(` ${part + 1}/${count}`));
      steps.append(label);
      checkbox.addEventListener('change', function () {
        tarefa.completedParts = Array.from({ length: count }, (_, i) => !!tarefa.completedParts?.[i]);
        tarefa.completedParts[part] = this.checked;
        AppStorage.setItem('tarefasPendentes', JSON.stringify(tarefasPendentes));
        updateCompletion();
        div.classList.remove('task-step-feedback');
        void div.offsetWidth;
        div.classList.add('task-step-feedback');
        if (tarefa.completedParts.every(Boolean)) {
          steps.querySelectorAll('input').forEach((input) => {
            input.disabled = true;
          });
          // 1. INICIA A ANIMAÇÃO CSS (A classe 'tarefa-concluida' começa o desaparecimento)
          div.classList.add('tarefa-concluida');

          // 2. CRONÔMETRO: Espera 850ms (tempo da animação) para fazer a remoção de fato
          setTimeout(() => {
            if (!WalletStore.isWritable()) return;
            // --- ESTA PARTE É EXECUTADA SÓ DEPOIS DA ANIMAÇÃO ---

            // Remove a tarefa do array de dados (tarefasPendentes)
            const index = tarefasPendentes.findIndex((t) => t.id === tarefa.id);
            if (index < 0) return;
            tarefasPendentes.splice(index, 1);

            // Salva a lista atualizada no navegador
            AppStorage.setItem('tarefasPendentes', JSON.stringify(tarefasPendentes));

            // Remove o elemento DIV da tela
            div.remove();

            // Atualiza o display (para mostrar 'Nenhuma tarefa' se a lista estiver vazia)
            renderTarefasPendentes();
          }, 850); // O tempo do cronômetro
        }
      });
    }

    const spanDescricao = document.createElement('span');
    spanDescricao.className = 'tarefa-descricao';
    const isPrize = !!tarefa.rouletteAwardId || /prêmio gratuito da roleta/.test(tarefa.descricao || '');
    const title = document.createElement('strong');
    title.textContent = tarefa.tarefa;
    const detail = document.createElement('span');
    detail.className = 'task-description-detail';
    detail.textContent = tarefa.descricao + ' · ' + (isPrize ? 'Recebida em ' : 'Comprada em ') + formatDate(tarefa.timestamp);
    spanDescricao.append(title, detail);

    const spanValor = document.createElement('span');
    spanValor.className = 'tarefa-valor';
    spanValor.textContent = isPrize ? 'Prêmio gratuito' : formatBR(tarefa.valor);

    div.appendChild(steps);
    div.appendChild(spanDescricao);
    div.appendChild(spanValor);
    div.appendChild(completion);
    tarefasContainer.appendChild(div);
    if (WalletStore.isWritable() && completed() === count) {
      // Finish a completion whose animation was interrupted by a controller handoff.
      setTimeout(() => steps.querySelector('input')?.dispatchEvent(new Event('change')), 0);
    }
  });
}
window.addEventListener('wallet:control', renderTarefasPendentes);
