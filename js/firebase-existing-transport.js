/* Adapted from Thilanguis/Wallet-Simulator (278fa677): same Firebase project
   and usuarios/gabriel-local document, current wallet and atomic transactions. */
export async function createExistingFirebaseTransport(code) {
  const { existingFirestoreDb } = await import('./firebase-connection.js');
  const db = await existingFirestoreDb();
  if (!db) throw new Error('Configuração Firebase indisponível.');
  if (!globalThis.crypto?.subtle) throw new Error('Abra o Wallet por HTTPS ou localhost para proteger a carteira compartilhada.');
  const cipher = await WalletCipher.forCode(code);
  const { doc, onSnapshot, runTransaction, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js');
  const ref = doc(db, 'usuarios', 'gabriel-local');
  const backupRef = doc(db, 'usuarios', 'gabriel-local', 'config', 'antesWalletAtualV3');
  async function decode(raw) {
    const stored = raw[FirebaseExisting.field];
    if (stored?.format === 'encrypted-wallet-v3') {
      try {
        return { ...raw, [FirebaseExisting.field]: await cipher.open(stored) };
      } catch {
        throw new Error('Esta carteira já está protegida. Cole o código privado do primeiro aparelho para conectar, sem substituir os dados.');
      }
    }
    return raw;
  }
  return {
    uid: 'carteira-existente',
    path: ref.path,
    watch(receive, fail) {
      let sequence = Promise.resolve(),
        stopped = false;
      const unsubscribe = onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
          sequence = sequence
            .then(async () => {
              const current = snapshot.exists() ? FirebaseExisting.read(await decode(snapshot.data())) : null;
              if (!stopped) receive(current);
            })
            .catch((error) => {
              if (!stopped) fail(error);
            });
        },
        fail,
      );
      return () => {
        stopped = true;
        unsubscribe();
      };
    },
    async transact(change) {
      return runTransaction(db, async (tx) => {
        const snapshot = await tx.get(ref);
        const raw = snapshot.exists() ? snapshot.data() : {};
        const current = FirebaseExisting.read(await decode(raw));
        const backup = current === null ? await tx.get(backupRef) : null;
        const next = change(current);
        if (backup && !backup.exists()) tx.set(backupRef, { usuarioAnterior: raw, criadoEm: serverTimestamp(), origem: 'Wallet-Simulator', destino: 'Simulator-wallet-v3' });
        const patch = { [FirebaseExisting.field]: { ...(await cipher.seal(next)), format: 'encrypted-wallet-v3' }, ...FirebaseExisting.project(next), atualizadoEm: serverTimestamp() };
        // Replace the canonical envelope completely, preserve unrelated user fields.
        tx.set(ref, patch, { mergeFields: Object.keys(patch) });
        return next;
      });
    },
  };
}
