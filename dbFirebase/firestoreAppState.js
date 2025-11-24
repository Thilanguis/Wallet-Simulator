// dbFirebase/firestoreAppState.js
import { db } from './firebaseConfiguration.js';
import { doc, collection, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

const USER_ID = 'gabriel-local';

const userRef = doc(db, 'usuarios', USER_ID);
const tarefasCol = collection(userRef, 'tarefas');
const historicoCol = collection(userRef, 'historico');
const accelBoostsCol = collection(userRef, 'accelBoosts');
const debugRoletaCol = collection(userRef, 'debugRoleta');

const appState = {
  usuario: null,
  tarefasPendentes: [],
  tarefasBloqueadas: [],
  historico: [],
  accelBoosts: [],
  // debugRoleta: [],
};

// ---------- LISTENERS (onSnapshot) ----------

function initFirestoreAppState() {
  // Doc do usuário (saldo, bônus, info da roleta, etc.)
  onSnapshot(userRef, (snap) => {
    const dados = snap.exists() ? snap.data() : {};
    appState.usuario = dados;

    console.log('[Firestore usuario]', dados);

    if (window.onUserStateChange) {
      window.onUserStateChange(dados);
    }
  });

  // Tarefas (subcoleção)
  onSnapshot(tarefasCol, (snapshot) => {
    const pendentes = [];
    const bloqueadas = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};

      const tarefaStr = data.tarefa || data.titulo || '';
      const timestamp = data.timestamp || data.criadoEm || null;

      const t = {
        id: docSnap.id,
        ...data,
        tarefa: tarefaStr,
        timestamp,
      };

      const status = t.status || 'pendente'; // default pros antigos

      if (status === 'bloqueada') {
        bloqueadas.push(t);
      } else if (status === 'pendente') {
        // só essas vão pra lista de "TAREFAS PENDENTES"
        pendentes.push(t);
      }
      // status "concluida" (e outros) ficam fora de pendentes
    });

    appState.tarefasPendentes = pendentes;
    appState.tarefasBloqueadas = bloqueadas;

    console.log('[Firestore tarefas] pendentes =', pendentes.length, 'bloqueadas =', bloqueadas.length);

    if (window.onTarefasChange) {
      window.onTarefasChange(pendentes, bloqueadas);
    }
  });

  // Histórico (subcoleção)
  onSnapshot(historicoCol, (snapshot) => {
    const lista = [];

    snapshot.forEach((docSnap) => {
      lista.push({ id: docSnap.id, ...docSnap.data() });
    });

    // se quiser garantir ordem cronológica:
    lista.sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      return ta - tb;
    });

    appState.historico = lista;

    console.log('[Firestore historico] itens =', lista.length);

    if (window.onHistoricoChange) {
      window.onHistoricoChange(lista);
    }
  });

  // Histórico de giros da roleta (usuarios/gabriel-local/debugRoleta)
  onSnapshot(debugRoletaCol, (snapshot) => {
    const lista = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};

      // criadoEm é um Timestamp do Firestore
      let criadoEmMs = 0;
      if (data.criadoEm && typeof data.criadoEm.toMillis === 'function') {
        criadoEmMs = data.criadoEm.toMillis();
      } else if (data.criadoEm) {
        criadoEmMs = new Date(data.criadoEm).getTime() || 0;
      }

      lista.push({
        id: docSnap.id,
        ...data,
        criadoEmMs,
      });
    });

    // Mais recente primeiro
    lista.sort((a, b) => (b.criadoEmMs || 0) - (a.criadoEmMs || 0));

    appState.debugRoleta = lista;

    console.log('[Firestore debugRoleta] giros =', lista.length);

    // callback opcional para a UI (roleta.js vai usar isso)
    if (window.onDebugRoletaChange) {
      window.onDebugRoletaChange(lista);
    }
  });

  // Se quiser accelBoosts em tempo real, depois é só adicionar outro onSnapshot aqui
}

// ---------- FUNÇÕES DE ESCRITA ----------

async function fsAtualizarUsuario(patch) {
  await setDoc(
    userRef,
    {
      ...patch,
      atualizadoEm: serverTimestamp(),
    },
    { merge: true }
  );
}

async function fsAdicionarMovimentoHistorico(mov) {
  const data = {
    descricao: mov.descricao ?? '',
    valor: mov.valor ?? 0,
    tipo: mov.tipo ?? 'ganho', // "ganho" | "gasto"
    saldoAtual: mov.saldoAtual ?? null,
    timestamp: mov.timestamp ?? new Date().toISOString(),
    valorOriginal: mov.valorOriginal ?? mov.valor ?? 0,
    valorFinal: mov.valorFinal ?? mov.valor ?? 0,
    diferenca: mov.diferenca ?? 0,
    percentual: mov.percentual ?? 0,
  };

  await addDoc(historicoCol, data);
}

async function fsDeletarMovimentoHistorico(id) {
  // "historicoCol" já existe no arquivo (coleção historico do usuário)
  await deleteDoc(doc(historicoCol, String(id)));
}

async function fsCriarTarefa(tarefa) {
  // tarefa no formato atual da app:
  // { id, tarefa, descricao, valor, timestamp }
  const docId = String(tarefa.id ?? Date.now());
  const titulo = tarefa.tarefa ?? '';
  const criadoEm = tarefa.timestamp ?? new Date().toISOString();

  await setDoc(
    doc(tarefasCol, docId),
    {
      // Mantém compatível com o código antigo:
      titulo,
      tarefa: titulo, // campo que o front antigo espera
      descricao: tarefa.descricao ?? '',
      valor: tarefa.valor ?? 0,
      status: 'pendente',
      criadoEm,
      timestamp: criadoEm, // já grava também como timestamp "padrão"
      localId: tarefa.id ?? null,
    },
    { merge: true }
  );
}

async function fsAtualizarTarefa(id, patch) {
  await updateDoc(doc(tarefasCol, String(id)), patch);
}

// roleta: registra giro só no debugRoleta + horário no usuário (pra cooldown)
async function fsRegistrarGiroRoleta(premio, resultadoTexto) {
  const agoraIso = new Date().toISOString();

  await Promise.all([
    // mantém só a info de "último uso" no doc do usuário (se você usa pra bloquear roleta)
    setDoc(
      userRef,
      {
        roletaUltimoUso: agoraIso,
      },
      { merge: true }
    ),

    // log completo do giro na subcoleção debugRoleta
    addDoc(debugRoletaCol, {
      premio: premio ?? null,
      resultadoTexto: resultadoTexto ?? null,
      criadoEm: serverTimestamp(),
    }),
  ]);
}

// Apagar um giro da roleta (debugRoleta)
async function fsDeletarGiroRoleta(id) {
  await deleteDoc(doc(debugRoletaCol, String(id)));
}

async function fsMarcarGiroRoletaConsumido(id) {
  if (!id) return;
  try {
    await updateDoc(doc(debugRoletaCol, String(id)), {
      consumidoEm: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[Firestore] Falha ao marcar giro da roleta como consumido:', e);
  }
}

// Apaga todos os giros da roleta que já foram consumidos
async function fsLimparGirosConsumidos() {
  const q = query(debugRoletaCol, where('consumidoEm', '!=', null));
  const snap = await getDocs(q);

  const promises = [];
  snap.forEach((docSnap) => {
    promises.push(deleteDoc(docSnap.ref));
  });

  await Promise.all(promises);
  console.log('[debugRoleta] Giros consumidos apagados:', promises.length);
}

// Atualiza OU remove uma tarefaBloqueada pelo nome
async function fsAtualizarTarefasBloqueadas({ nome, novoExpiraEmMs = null, remover = false }) {
  const usuario = window.firestoreAppState?.usuario || {};
  const listaAtual = Array.isArray(usuario.tarefasBloqueadas) ? [...usuario.tarefasBloqueadas] : [];

  const idx = listaAtual.findIndex((t) => t && t.nome === nome);
  if (idx === -1) {
    console.warn('[fsAtualizarTarefasBloqueadas] tarefa não encontrada:', nome);
    return;
  }

  if (remover) {
    // remove do array
    listaAtual.splice(idx, 1);
  } else if (novoExpiraEmMs != null) {
    // atualiza o expiraEm
    listaAtual[idx] = {
      ...listaAtual[idx],
      expiraEm: Number(novoExpiraEmMs),
    };
  }

  // grava array inteiro de volta no usuário
  await setDoc(userRef, { tarefasBloqueadas: listaAtual }, { merge: true });
}

// deixa disponível pro resto da app
window.fsAtualizarTarefasBloqueadas = fsAtualizarTarefasBloqueadas;

// ---------- EXPOE NO WINDOW PARA OS SCRIPTS ANTIGOS ----------

window.firestoreAppState = appState;
window.initFirestoreAppState = initFirestoreAppState;

window.fsAtualizarUsuario = fsAtualizarUsuario;
window.fsAdicionarMovimentoHistorico = fsAdicionarMovimentoHistorico;
window.fsCriarTarefa = fsCriarTarefa;
window.fsAtualizarTarefa = fsAtualizarTarefa;
window.fsRegistrarGiroRoleta = fsRegistrarGiroRoleta;
window.fsDeletarMovimentoHistorico = fsDeletarMovimentoHistorico;
window.fsMarcarGiroRoletaConsumido = fsMarcarGiroRoletaConsumido;
window.fsLimparGirosConsumidos = fsLimparGirosConsumidos;
window.fsDeletarGiroRoleta = fsDeletarGiroRoleta;
