let ready;

export async function existingFirestoreDb() {
  if (!ready) ready = (async () => {
    if (location.origin !== 'http://127.0.0.1:5516') throw Error('Ambiente local de testes indisponível.');
    const [{ initializeApp }, { getFirestore, connectFirestoreEmulator }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js'),
    ]);
    const app = initializeApp({ projectId: 'demo-wallet-access', apiKey: 'demo-wallet-access-key' }, 'wallet-access-dev');
    const db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', 8089);
    return db;
  })();
  return ready;
}