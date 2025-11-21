// dbWallet.js
// Camada de acesso ao Firestore para o seu app de dominação/wallet

import { db } from './firebaseConfiguration.js';
import { doc, setDoc, updateDoc, collection, addDoc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore';

// Por enquanto, um único usuário fixo.
// Depois dá pra trocar isso por auth.
const DEFAULT_USER_ID = 'gabriel-local';

function userRef(userId = DEFAULT_USER_ID) {
  return doc(db, 'usuarios', userId);
}

function historicoCol(userId = DEFAULT_USER_ID) {
  return collection(db, 'usuarios', userId, 'historico');
}

function tarefasCol(userId = DEFAULT_USER_ID) {
  return collection(db, 'usuarios', userId, 'tarefas');
}

function accelBoostsCol(userId = DEFAULT_USER_ID) {
  return collection(db, 'usuarios', userId, 'accelBoosts');
}

/**
 * Atualiza campos do documento do usuário.
 * Você passa só o que quiser atualizar (merge: true).
 *
 * Exemplo de uso:
 *   await atualizarUsuario({ saldoDominadora: novoSaldo });
 */
export async function atualizarUsuario(fields, userId = DEFAULT_USER_ID) {
  const ref = userRef(userId);
  const data = {
    ...fields,
    atualizadoEm: serverTimestamp(),
  };

  await setDoc(ref, data, { merge: true });
}

/**
 * Carrega os dados básicos do usuário:
 * saldo, bonusEspecialAtivo, roletaUltimoUso, roletaUltimoResultadoTexto...
 */
export async function carregarUsuario(userId = DEFAULT_USER_ID) {
  const snapshot = await getDoc(userRef(userId));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data();
}

/**
 * Adiciona um item ao histórico.
 * Use no lugar de: historico.push(item) + localStorage.setItem("historico", ...)
 *
 * Exemplo de uso:
 *   await adicionarHistorico({
 *     descricao: "Vale sair sozinha com amiga",
 *     valor: 5525,
 *     tipo: "gasto",
 *     saldoAtual: saldoDepois,
 *     valorOriginal: 6500,
 *     valorFinal: 5525,
 *     diferenca: -975,
 *     percentual: -15,
 *   });
 */
export async function adicionarHistorico(item, userId = DEFAULT_USER_ID) {
  const colRef = historicoCol(userId);

  const data = {
    descricao: item.descricao ?? null,
    valor: item.valor ?? null,
    tipo: item.tipo ?? null, // "ganho" | "gasto"
    saldoAtual: item.saldoAtual ?? null,
    timestamp: item.timestamp ?? new Date().toISOString(),
    valorOriginal: item.valorOriginal ?? null,
    valorFinal: item.valorFinal ?? null,
    diferenca: item.diferenca ?? null,
    percentual: item.percentual ?? null,
  };

  await addDoc(colRef, data);
}

/**
 * Carrega todos os itens do histórico.
 * Para montar a tela inicial, por exemplo.
 */
export async function carregarHistorico(userId = DEFAULT_USER_ID) {
  const snapshot = await getDocs(historicoCol(userId));
  const resultado = [];
  snapshot.forEach((docSnap) => {
    resultado.push({
      id: docSnap.id,
      ...docSnap.data(),
    });
  });
  return resultado;
}

/**
 * Cria ou atualiza uma tarefa PENDENTE.
 * Use no lugar de mexer em tarefasPendentes no localStorage.
 *
 * task deve ter formato parecido com o que você já usa:
 * {
 *   id: 1763600032314,
 *   tarefa: "Vale sair sozinha com amiga",
 *   descricao: "Liberdade social",
 *   valor: 5525,
 *   timestamp: "2025-11-20T00:53:52.314Z"
 * }
 */
export async function salvarTarefaPendente(task, userId = DEFAULT_USER_ID) {
  const id = String(task.id);
  const ref = doc(tarefasCol(userId), id);

  const data = {
    titulo: task.tarefa ?? null,
    descricao: task.descricao ?? null,
    valor: task.valor ?? null,
    status: 'pendente',
    criadoEm: task.timestamp ?? new Date().toISOString(),
    localId: task.id ?? null,
  };

  await setDoc(ref, data, { merge: true });
}

/**
 * Atualiza status de uma tarefa (pendente, bloqueada, concluida).
 *
 * Exemplo:
 *   await atualizarStatusTarefa(1763600032314, "bloqueada", {
 *     expiraEm: 1764204832311
 *   });
 */
export async function atualizarStatusTarefa(tarefaId, novoStatus, extraFields = {}, userId = DEFAULT_USER_ID) {
  const ref = doc(tarefasCol(userId), String(tarefaId));
  const data = {
    status: novoStatus,
    ...extraFields,
  };

  await updateDoc(ref, data);
}

/**
 * Carrega todas as tarefas.
 * Você pode filtrar pelo status no código (pendente/bloqueada/etc.).
 */
export async function carregarTarefas(userId = DEFAULT_USER_ID) {
  const snapshot = await getDocs(tarefasCol(userId));
  const resultado = [];
  snapshot.forEach((docSnap) => {
    resultado.push({
      id: docSnap.id,
      ...docSnap.data(),
    });
  });
  return resultado;
}

/**
 * Adiciona um accelBoost.
 * Estrutura genérica – você passa o objeto do boost.
 */
export async function adicionarAccelBoost(boost, userId = DEFAULT_USER_ID) {
  const colRef = accelBoostsCol(userId);
  const data = {
    ...boost,
    criadoEm: serverTimestamp(),
  };
  await addDoc(colRef, data);
}

/**
 * Carrega todos os accelBoosts.
 */
export async function carregarAccelBoosts(userId = DEFAULT_USER_ID) {
  const snapshot = await getDocs(accelBoostsCol(userId));
  const resultado = [];
  snapshot.forEach((docSnap) => {
    resultado.push({
      id: docSnap.id,
      ...docSnap.data(),
    });
  });
  return resultado;
}
