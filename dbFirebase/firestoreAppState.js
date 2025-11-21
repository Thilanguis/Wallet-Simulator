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

      // 🔧 Normaliza para o formato antigo da app
      const tarefaStr = data.tarefa || data.titulo || '';
      const timestamp = data.timestamp || data.criadoEm || null;

      const t = {
        id: docSnap.id,
        ...data,
        tarefa: tarefaStr, // garante que SEMPRE existe .tarefa
        timestamp, // garante que SEMPRE existe .timestamp
      };

      if (t.status === 'bloqueada') {
        bloqueadas.push(t);
      } else {
        pendentes.push(t); // pendente, concluída, etc.
      }
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

// roleta: atualiza campos no doc do usuário + log de giros
async function fsRegistrarGiroRoleta(premio, resultadoTexto) {
  const agoraIso = new Date().toISOString();

  await Promise.all([
    setDoc(
      userRef,
      {
        roletaUltimoUso: agoraIso,
        roletaUltimoResultadoTexto: resultadoTexto ?? null,
      },
      { merge: true }
    ),
    addDoc(debugRoletaCol, {
      premio: premio ?? null,
      resultadoTexto: resultadoTexto ?? null,
      criadoEm: serverTimestamp(),
    }),
  ]);
}

// ---------- EXPOE NO WINDOW PARA OS SCRIPTS ANTIGOS ----------

window.firestoreAppState = appState;
window.initFirestoreAppState = initFirestoreAppState;

window.fsAtualizarUsuario = fsAtualizarUsuario;
window.fsAdicionarMovimentoHistorico = fsAdicionarMovimentoHistorico;
window.fsCriarTarefa = fsCriarTarefa;
window.fsAtualizarTarefa = fsAtualizarTarefa;
window.fsRegistrarGiroRoleta = fsRegistrarGiroRoleta;
window.fsDeletarMovimentoHistorico = fsDeletarMovimentoHistorico;
