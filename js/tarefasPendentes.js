/* =================================================================== */
/* TAREFAS PENDENTES (versão Firestore)                                */
/* =================================================================== */

// Esse array continua existindo, mas agora é só um espelho do Firestore.
// Quem manda de verdade é o onSnapshot lá no firestoreAppState.js.
if (typeof tarefasPendentes === 'undefined') {
  // caso não exista ainda (só por segurança)
  tarefasPendentes = [];
}

// Função para renderizar as tarefas pendentes
function renderTarefasPendentes() {
  const tarefasContainer = document.getElementById('tarefasPendentes');
  if (!tarefasContainer) {
    console.warn('Elemento #tarefasPendentes não encontrado.');
    return;
  }

  tarefasContainer.innerHTML = '';

  // Fonte de verdade: Firestore → appState → onTarefasChange → tarefasPendentes
  const lista = Array.isArray(tarefasPendentes) ? tarefasPendentes : [];

  // Aqui você pode filtrar se quiser.
  // Exemplo: mostrar só status "pendente" (e esconder "concluida", etc)
  const visiveis = lista.filter((t) => t.status !== 'concluida');

  if (visiveis.length === 0) {
    tarefasContainer.innerHTML = '<p style="color:#999; text-align:center;">Nenhuma tarefa pendente. 👑</p>';
    return;
  }

  visiveis.forEach((tarefa) => {
    const div = document.createElement('div');
    div.className = 'tarefa-item';
    div.setAttribute('data-id', tarefa.id);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';

    checkbox.addEventListener('change', function () {
      if (this.checked) {
        // 1) animação de sumir
        div.classList.add('tarefa-concluida');

        // 2) depois da animação, apaga do Firestore
        setTimeout(async () => {
          try {
            if (typeof fsDeletarTarefa === 'function') {
              // deleta definitivamente do banco
              await fsDeletarTarefa(tarefa.id);
            } else if (typeof fsAtualizarTarefa === 'function') {
              // fallback: se não tiver delete, pelo menos marca como concluída
              await fsAtualizarTarefa(tarefa.id, {
                status: 'concluida',
                concluidaEm: new Date().toISOString(),
              });
            } else {
              console.warn('Nenhuma função de remoção de tarefa disponível.');
            }

            // remove da UI (snapshot vai redesenhar de qualquer jeito)
            div.remove();
          } catch (erro) {
            console.error('Erro ao apagar tarefa no Firestore:', erro);
            // volta visualmente
            this.checked = false;
            div.classList.remove('tarefa-concluida');
          }
        }, 2800);
      }
    });

    const spanDescricao = document.createElement('span');
    spanDescricao.className = 'tarefa-descricao';

    // título pode vir como "tarefa" (versão antiga) ou "titulo" (versão nova)
    const titulo = tarefa.tarefa ?? tarefa.titulo ?? 'Tarefa sem título';

    // descrição, se existir
    const desc = tarefa.descricao ?? '';

    // data pode vir como "timestamp" ou "criadoEm"
    const dataIso = tarefa.timestamp ?? tarefa.criadoEm ?? null;
    const dataFormatada = dataIso ? formatDate(dataIso) : '';

    spanDescricao.textContent = `${titulo} (${desc})${dataFormatada ? ' - Comprada em ' + dataFormatada : ''}`;

    const spanValor = document.createElement('span');
    spanValor.className = 'tarefa-valor';

    // garante um número, mesmo se vier meio torto
    const valorNum = typeof tarefa.valor === 'number' ? tarefa.valor : Number(tarefa.valor) || 0;
    spanValor.textContent = formatBR(valorNum);

    div.appendChild(checkbox);
    div.appendChild(spanDescricao);
    div.appendChild(spanValor);
    tarefasContainer.appendChild(div);
  });
}
