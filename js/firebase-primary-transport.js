/* One authenticated wallet in the existing Firebase project; no local bootstrap of money. */
export async function createPrimaryFirebaseTransport({ db, user, template }) {
  if (!user?.uid || !user.emailVerified) throw new Error('Entre com uma conta Google verificada.');
  const sdk = await import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js');
  const { doc, collection, getDocFromServer, onSnapshot, runTransaction, serverTimestamp } = sdk;
  const root = doc(db, 'usuarios', 'gabriel-local');
  const access = await getDocFromServer(doc(db, 'usuarios', 'gabriel-local', 'config', 'acesso'));
  if (!access.exists() || access.data().securityVersion !== 'google-private-v1' || !access.data().emails?.includes(user.email.toLowerCase())) throw new Error('Esta conta Google não tem acesso a esta carteira.');
  const backup = doc(db, 'usuarios', 'gabriel-local', 'config', 'antesFirebasePrincipalV4');
  let raw = null,
    lists = Object.fromEntries(FirebasePrimary.collections.map((name) => [name, []]));
  function read(value) {
    let current = FirebaseExisting.read(value, FirebasePrimary.field);
    if (!current) {
      if (value.walletAtualV3) throw new Error('Existe uma carteira anterior protegida. Importe seu backup conferido antes de converter; os dados não foram substituídos.');
      current = FirebasePrimary.bootstrap(value, lists, template);
    }
    return FirebasePrimary.overlay(current, lists);
  }
  return {
    uid: user.uid,
    path: root.path,
    watch(receive, fail) {
      let stopped = false,
        rootReady = false;
      const ready = new Set(),
        stops = [];
      const emit = () => {
        if (stopped || !rootReady || ready.size !== FirebasePrimary.collections.length) return;
        try {
          receive(read(raw));
        } catch (error) {
          fail(error);
        }
      };
      stops.push(
        onSnapshot(
          root,
          { includeMetadataChanges: true },
          (snapshot) => {
            if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
            if (!snapshot.exists()) {
              fail(new Error('O documento da carteira existente não foi encontrado. Nenhum saldo local foi enviado.'));
              return;
            }
            raw = snapshot.data();
            rootReady = true;
            emit();
          },
          fail,
        ),
      );
      for (const name of FirebasePrimary.collections)
        stops.push(
          onSnapshot(
            collection(db, 'usuarios', 'gabriel-local', name),
            { includeMetadataChanges: true },
            (snapshot) => {
              if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
              lists[name] = snapshot.docs.map((item) => FirebasePrimary.plain({ ...item.data(), id: item.data().id ?? item.id }));
              ready.add(name);
              emit();
            },
            fail,
          ),
        );
      return () => {
        stopped = true;
        for (const stop of stops) stop();
      };
    },
    async transact(change) {
      return runTransaction(db, async (tx) => {
        const snapshot = await tx.get(root);
        if (!snapshot.exists()) throw new Error('O documento existente foi removido. A carteira não foi recriada com dados locais.');
        const original = snapshot.data();
        const current = read(original);
        const prior = !original[FirebasePrimary.field] ? await tx.get(backup) : null;
        const next = change(current);
        if (JSON.parse(next.financeJson).entries.length) next.financeImportOpen = false;
        const changes = FirebasePrimary.mirrorChanges(current, next);
        if (changes.length > 450) throw new Error('Muitas alterações simultâneas. A cópia de recuperação foi preservada; divida a operação.');
        next.mirrors = structuredClone(current.mirrors || {});
        for (const item of changes) {
          next.mirrors[item.name] ||= {};
          next.mirrors[item.name][item.id] = { revision: next.revision, hash: FirebasePrimary.fingerprint(item.data) };
        }
        if (prior && !prior.exists()) tx.set(backup, { usuarioAnterior: FirebasePrimary.plain(original), colecoesAnteriores: lists, criadoEm: serverTimestamp() });
        const patch = { [FirebasePrimary.field]: next, ...FirebaseExisting.project(next), atualizadoEm: serverTimestamp() };
        tx.set(root, patch, { mergeFields: Object.keys(patch) });
        for (const item of changes) tx.set(doc(db, 'usuarios', 'gabriel-local', item.name, encodeURIComponent(item.id)), { ...item.data, _walletRevision: next.revision }, { merge: true });
        return next;
      });
    },
  };
}
