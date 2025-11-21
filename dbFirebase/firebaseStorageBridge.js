// firebaseStorageBridge.js
// Ponte entre localStorage e Firestore, sem mudar o resto da app.

import { db } from './firebaseConfiguration.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

const USER_ID = 'gabriel-local';
const userDocRef = doc(db, 'usuarios', USER_ID);

// Lê com segurança um JSON do localStorage
function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// Monta o "estado completo" atual a partir do localStorage
function montarSnapshotDoLocalStorage() {
  const saldo = parseFloat(localStorage.getItem('saldoDominadora') || '0');

  const bonus = safeParseJSON(localStorage.getItem('bonusEspecialAtivo') || 'false', false);

  const roletaUltimoUso = parseInt(localStorage.getItem('roletaUltimoUso') || '0', 10);

  const roletaUltimoResultadoTexto = localStorage.getItem('roletaUltimoResultadoTexto') || '';

  const historico = safeParseJSON(localStorage.getItem('historico') || '[]', []);

  const tarefasPendentes = safeParseJSON(localStorage.getItem('tarefasPendentes') || '[]', []);

  const tarefasBloqueadas = safeParseJSON(localStorage.getItem('tarefasBloqueadas') || '[]', []);

  const accelBoosts = safeParseJSON(localStorage.getItem('accelBoosts') || '[]', []);

  return {
    saldoDominadora: saldo,
    bonusEspecialAtivo: !!bonus,
    roletaUltimoUso,
    roletaUltimoResultadoTexto,
    historico,
    tarefasPendentes,
    tarefasBloqueadas,
    accelBoosts,
  };
}

// Carrega do Firestore → localStorage (quando abre a app)
async function carregarFirestoreParaLocalStorage(originalSetItem) {
  try {
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      // Primeiro acesso: não tem nada salvo ainda
      return;
    }

    const data = snap.data() || {};

    if (typeof data.saldoDominadora !== 'undefined') {
      originalSetItem('saldoDominadora', String(data.saldoDominadora));
    }

    if (typeof data.bonusEspecialAtivo !== 'undefined') {
      originalSetItem('bonusEspecialAtivo', JSON.stringify(!!data.bonusEspecialAtivo));
    }

    if (typeof data.roletaUltimoUso !== 'undefined') {
      originalSetItem('roletaUltimoUso', String(data.roletaUltimoUso));
    }

    if (typeof data.roletaUltimoResultadoTexto !== 'undefined') {
      originalSetItem('roletaUltimoResultadoTexto', data.roletaUltimoResultadoTexto || '');
    }

    if (Array.isArray(data.historico)) {
      originalSetItem('historico', JSON.stringify(data.historico));
    }

    if (Array.isArray(data.tarefasPendentes)) {
      originalSetItem('tarefasPendentes', JSON.stringify(data.tarefasPendentes));
    }

    if (Array.isArray(data.tarefasBloqueadas)) {
      originalSetItem('tarefasBloqueadas', JSON.stringify(data.tarefasBloqueadas));
    }

    if (Array.isArray(data.accelBoosts)) {
      originalSetItem('accelBoosts', JSON.stringify(data.accelBoosts));
    }
  } catch (e) {
    console.error('Erro ao carregar dados do Firestore para localStorage:', e);
  }
}

// Faz um "debounce" pra não ficar dando setDoc a cada linha
let syncTimer = null;
function agendarSyncCompleto() {
  if (syncTimer) return;

  syncTimer = setTimeout(async () => {
    syncTimer = null;

    try {
      const snapshot = montarSnapshotDoLocalStorage();
      await setDoc(userDocRef, snapshot, { merge: true });
      // console.log('Estado sincronizado com Firestore:', snapshot);
    } catch (e) {
      console.error('Erro ao salvar estado no Firestore:', e);
    }
  }, 400); // 0,4s depois da última mudança relevante
}

// Inicializa a ponte
(async function initFirebaseStorageBridge() {
  // Guarda a implementação original
  const originalSetItem = localStorage.setItem.bind(localStorage);

  // 1) Primeiro, carrega do Firestore → localStorage
  await carregarFirestoreParaLocalStorage(originalSetItem);

  // 2) Depois, sobrescreve localStorage.setItem
  localStorage.setItem = function (key, value) {
    // Salva normalmente no navegador
    originalSetItem(key, value);

    // Se for uma chave que queremos espelhar no Firestore, agenda sync
    switch (key) {
      case 'saldoDominadora':
      case 'bonusEspecialAtivo':
      case 'roletaUltimoUso':
      case 'roletaUltimoResultadoTexto':
      case 'historico':
      case 'tarefasPendentes':
      case 'tarefasBloqueadas':
      case 'accelBoosts':
        agendarSyncCompleto();
        break;
      default:
      // chaves que não interessam pro Firebase: ignora
    }
  };
})();
