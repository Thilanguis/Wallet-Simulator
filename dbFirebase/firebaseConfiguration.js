// firebaseConfiguration.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

// resto do arquivo pode ficar exatamente como está hoje

// 🔴 config que o Firebase te deu (essa parte já está certa no seu arquivo)
const firebaseConfig = {
  apiKey: '...',
  authDomain: 'walletsumilator.firebaseapp.com',
  projectId: 'walletsumilator',
  storageBucket: 'walletsumilator.firebasestorage.app',
  messagingSenderId: '511873754354',
  appId: '1:511873754354:web:8e689553176703cfa59c6b',
  measurementId: 'G-PCYW69HM02',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };

async function salvarTesteRoleta() {
  try {
    await addDoc(collection(db, 'debugRoleta'), {
      mensagem: 'Giro de teste vindo do front',
      criadoEm: serverTimestamp(),
    });
    console.log('✅ Doc de teste salvo no Firestore!');
  } catch (e) {
    console.error('❌ Erro ao salvar doc:', e);
  }
}

async function registrarGiroFirebase(premio) {
  try {
    await addDoc(collection(db, 'debugRoleta'), {
      label: premio.label ?? null,
      full: premio.full ?? null,
      valorBase: premio.valorBase ?? null,
      tipo: premio.tipo ?? null,
      criadoEm: serverTimestamp(),
    });
    console.log('🎲 Giro da roleta registrado no Firestore.');
  } catch (e) {
    console.error('Erro ao registrar giro no Firestore:', e);
  }
}

window.salvarTesteRoleta = salvarTesteRoleta;
window.registrarGiroFirebase = registrarGiroFirebase;
window._firestoreDb = db;
