/* One authenticated wallet in the existing Firebase project; no local bootstrap of money. */
export async function createPrimaryFirebaseTransport({ db, user, template }) {
  if (!user?.uid || !user.emailVerified) throw new Error('Entre com uma conta Google verificada.');
  const sdk = await import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js');
  const { doc, collection, getDocFromServer, onSnapshot, runTransaction, serverTimestamp } = sdk;
  const root = doc(db, 'usuarios', 'gabriel-local');
  const accessRef = doc(db, 'usuarios', 'gabriel-local', 'config', 'acesso');
  const access = await getDocFromServer(accessRef);
  if (!access.exists() || access.data().securityVersion !== 'google-private-v1') throw new Error('Esta conta Google não tem acesso a esta carteira.');
  const policy = access.data();
  const email = user.email?.toLowerCase();
  const legacyMember = policy.emails?.includes(email);
  const enabled = WishlistAccessModel.active(policy);
  if (!legacyMember) {
    const account = enabled ? (await getDocFromServer(doc(db, 'usuarios', 'gabriel-local', 'wishlistAccounts', user.uid))).data() : null;
    if (account?.status !== 'approved' || account.role !== 'coadmin' || account.email !== user.email) {
      throw new Error('Esta conta Google não tem acesso a esta carteira.');
    }
  }
  const accessRole = enabled ? (policy.adminEmail === email ? 'admin' : 'coadmin') : '';
  const backup = doc(db, 'usuarios', 'gabriel-local', 'config', 'antesFirebasePrincipalV4');
  const giftCollection = collection(db, 'usuarios', 'gabriel-local', 'wishlistGifts');
  const projectionCollection = collection(db, 'usuarios', 'gabriel-local', 'wishlistLists');
  let raw = null,
    projections = new Map(),
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
    accessRole,
    personalProfile: accessRole === 'admin' ? 'wallet-admin' : legacyMember && policy.emails?.length === 2 ? 'primary-luana' : 'account-' + user.uid,
    existingAccounts: enabled ? [...new Set(policy.emails)].map(email => ({
      email, role: email === policy.adminEmail ? 'admin' : 'coadmin',
      ownsPrimaryList: policy.emails.length === 2 && email !== policy.adminEmail,
    })) : [],
    trackAccess: accessRole === 'coadmin',
    watch(receive, fail) {
      let stopped = false,
        rootReady = false,
        wishlistReady = !accessRole;
      const ready = new Set(),
        stops = [];
      const emit = () => {
        if (stopped || !rootReady || !wishlistReady || ready.size !== FirebasePrimary.collections.length) return;
        try {
          const current = read(raw);
          if (accessRole) {
            const versions = current[WishlistAccessModel.field];
            if (!WishlistAccessModel.ready(current.simulator, projections, versions)) return;
            current.simulator = WishlistAccessModel.overlay(current.simulator, projections, versions);
          }
          receive(current);
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
      if (accessRole) stops.push(
        onSnapshot(projectionCollection, { includeMetadataChanges: true }, (snapshot) => {
          if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
          projections = new Map(snapshot.docs.map(item => [item.id, item.data()]));
          wishlistReady = true;
          emit();
        }, fail),
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
        const config = accessRole ? await tx.get(accessRef) : null;
        const accessEnabled = config?.exists() && WishlistAccessModel.active(config.data());
        const versions = current[WishlistAccessModel.field];
        let recent = new Map();
        if (accessEnabled) {
          const people = WishlistAccessModel.projectionPeople(current.simulator);
          const snapshots = await Promise.all(people.map(({ id }) => tx.get(doc(projectionCollection, id))));
          recent = new Map(snapshots.filter(item => item.exists()).map(item => [item.id, item.data()]));
          if (!WishlistAccessModel.ready(current.simulator, recent, versions)) throw new Error('Aguarde a atualização das listas de desejos e tente novamente.');
          current.simulator = WishlistAccessModel.overlay(current.simulator, recent, versions);
        }
        const next = change(current);
        if (JSON.parse(next.financeJson).entries.length) next.financeImportOpen = false;
        const changes = FirebasePrimary.mirrorChanges(current, next);
        const giftChanges = accessEnabled ? WishlistAccessModel.changes(current.simulator, next.simulator, true) : [];
        const wishlistChanges = accessEnabled ? WishlistAccessModel.changes(current.simulator, next.simulator) : [];
        if (accessEnabled) {
          const rawSimulator = original[FirebasePrimary.field]?.simulator;
          if (rawSimulator?.wishlist !== next.simulator.wishlist || rawSimulator?.wishlistPeople !== next.simulator.wishlistPeople)
            next.wishlistWriteRevision = next.revision;
          next[WishlistAccessModel.field] = { ...versions };
          // Stamp both copies atomically so a root snapshot cannot restore
          // someone else's old list while the mirror snapshot is in flight.
          for (const { id, data } of wishlistChanges) {
            if (data) next[WishlistAccessModel.field][id] = next.revision;
            else delete next[WishlistAccessModel.field][id];
          }
        }
        if (changes.length + wishlistChanges.length + giftChanges.length > 450) throw new Error('Muitas alterações simultâneas. A cópia de recuperação foi preservada; divida a operação.');
        next.mirrors = structuredClone(current.mirrors || {});
        for (const item of changes) {
          next.mirrors[item.name] ||= {};
          next.mirrors[item.name][item.id] = { revision: next.revision, hash: FirebasePrimary.fingerprint(item.data) };
        }
        if (prior && !prior.exists()) tx.set(backup, { usuarioAnterior: FirebasePrimary.plain(original), colecoesAnteriores: lists, criadoEm: serverTimestamp() });
        const patch = { [FirebasePrimary.field]: next, ...FirebaseExisting.project(next), atualizadoEm: serverTimestamp() };
        tx.set(root, patch, { mergeFields: Object.keys(patch) });
        for (const item of changes) tx.set(doc(db, 'usuarios', 'gabriel-local', item.name, encodeURIComponent(item.id)), { ...item.data, _walletRevision: next.revision }, { merge: true });
        for (const { id, data } of wishlistChanges) {
          const list = doc(projectionCollection, id);
          if (data) tx.set(list, { ...data, walletRevision: next.revision });
          else tx.delete(list);
        }
        for (const { id, data } of giftChanges) {
          const list = doc(giftCollection, id);
          if (data && Object.keys(data.items).length) tx.set(list, { ...data, walletRevision: next.revision });
          else tx.delete(list);
        }
        return next;
      });
    },
  };
}
