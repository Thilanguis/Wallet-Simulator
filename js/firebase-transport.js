// Loaded only when the user connects a device. No test writes or legacy migration guesses.
export async function createFirebaseTransport(code) {
  await import('../firebaseConfiguration.js');
  const db = window._firestoreDb;
  if (!db) throw new Error('Configuração Firebase indisponível.');
  const [{ getAuth, signInAnonymously }, { doc, onSnapshot, runTransaction, serverTimestamp }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js'),
  ]);
  const auth = getAuth(db.app);
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  const cipher = await WalletCipher.forCode(code);
  const ref = doc(db, 'walletsCompartilhadas', cipher.room);
  return {
    uid: auth.currentUser.uid,
    path: ref.path,
    watch(receive, fail) {
      let sequence = Promise.resolve(),
        stopped = false;
      const unsubscribe = onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snapshot) => {
          // Never bootstrap from an unconfirmed cache miss or an optimistic pending write.
          if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
          sequence = sequence
            .then(async () => {
              const clear = snapshot.exists() ? await cipher.open(snapshot.data()) : null;
              if (!stopped) receive(clear);
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
        const next = change(snapshot.exists() ? await cipher.open(snapshot.data()) : null);
        tx.set(ref, { ...(await cipher.seal(next)), updatedAt: serverTimestamp() });
        return next;
      });
    },
  };
}
