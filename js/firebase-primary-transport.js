import { createWishlistPages } from './firebase-wishlist-pages.js';

// Leave room for Firestore fields and metadata when using an older ruleset.
const legacyDocumentBudget = 900 * 1024;
const encoder = new TextEncoder();

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
  if (!Array.isArray(policy.emails) || policy.emails.length > 2 || !policy.emails.includes(email)) {
    throw new Error('Esta conta Google não tem acesso a esta carteira.');
  }
  const personalProfile = WishlistAccessModel.active(policy)
    ? (policy.adminEmail === email ? 'wallet-admin' : 'primary-luana') : '';
  const backup = doc(db, 'usuarios', 'gabriel-local', 'config', 'antesFirebasePrincipalV4');
  const projectionCollection = collection(db, 'usuarios', 'gabriel-local', 'wishlistLists');
  const pages = createWishlistPages(sdk, db, root);
  let raw = null,
    projections = new Map(),
    lists = Object.fromEntries(FirebasePrimary.collections.map((name) => [name, []]));
  async function read(value) {
    let current = FirebaseExisting.read(value, FirebasePrimary.field);
    if (!current) {
      if (value.walletAtualV3) throw new Error('Existe uma carteira anterior protegida. Importe seu backup conferido antes de converter; os dados não foram substituídos.');
      current = FirebasePrimary.bootstrap(value, lists, template);
    }
    return FirebasePrimary.overlay(FirebasePrimary.expandWishlist(await pages.restore(current)), lists);
  }
  return {
    preparePayload({ simulator: { wishlist, ...simulator }, financeJson }) {
      return { simulator, financeJson };
    },
    uid: user.uid,
    path: root.path,
    personalProfile,
    watch(receive, fail) {
      let stopped = false,
        rootReady = false,
        wishlistReady = !personalProfile,
        emission = 0;
      const ready = new Set(),
        stops = [];
      const emit = async () => {
        if (stopped || !rootReady || !wishlistReady || ready.size !== FirebasePrimary.collections.length) return;
        const ticket = ++emission;
        const value = raw;
        try {
          const current = await read(value);
          if (stopped || ticket !== emission) return;
          if (personalProfile) {
            const versions = current[WishlistAccessModel.field];
            if (!WishlistAccessModel.ready(current.simulator, projections, versions)) return;
            current.simulator = WishlistAccessModel.overlay(current.simulator, projections, versions);
          }
          pages.retain(value[FirebasePrimary.field]?.wishlistPages);
          receive(current);
        } catch (error) {
          if (!stopped && ticket === emission) fail(error);
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
      if (personalProfile) stops.push(
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
      let pagingDenied = false;
      return runTransaction(db, async (tx) => {
        pagingDenied = false;
        const snapshot = await tx.get(root);
        if (!snapshot.exists()) throw new Error('O documento existente foi removido. A carteira não foi recriada com dados locais.');
        const original = snapshot.data();
        const current = await read(original);
        const previousWishlist = current.simulator.wishlist;
        const prior = !original[FirebasePrimary.field] ? await tx.get(backup) : null;
        const config = personalProfile ? await tx.get(accessRef) : null;
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
        const wishlistChanges = accessEnabled ? WishlistAccessModel.changes(current.simulator, next.simulator).map(change => {
          const { data } = change;
          // The legacy mirror contains no data that isn't in the private wallet.
          return data && !WalletCloud.fits(data) ? { ...change, data: { ...data, items: {}, walletPaged: true } } : change;
        }) : [];
        const previousStorage = original[FirebasePrimary.field];
        const previousPages = previousStorage?.wishlistPages;
        const wishlistChanged = previousWishlist !== next.simulator.wishlist;
        let packed = next;
        if (wishlistChanged) packed = FirebasePrimary.compactWishlist(next);
        else if (previousStorage && !previousPages) {
          // A timer checkpoint or a note edit should not migrate an untouched wishlist.
          const simulator = { ...next.simulator };
          if (Object.hasOwn(previousStorage.simulator, 'wishlist')) simulator.wishlist = previousStorage.simulator.wishlist;
          packed = { ...next, simulator, wishlistImages: previousStorage.wishlistImages };
        }
        const payload = { simulator: packed.simulator, financeJson: packed.financeJson, wishlistImages: packed.wishlistImages };
        const paged = Boolean(previousPages) || (wishlistChanged && !WalletCloud.fits(payload));
        if (paged) {
          const { wishlist, ...simulator } = next.simulator;
          WalletCloud.assertFits({ simulator, financeJson: next.financeJson });
        }
        if (accessEnabled) {
          const rawSimulator = original[FirebasePrimary.field]?.simulator;
          if (wishlistChanged || Boolean(previousPages) !== paged || rawSimulator?.wishlistPeople !== next.simulator.wishlistPeople || (!paged && rawSimulator?.wishlist !== packed.simulator.wishlist))
            next.wishlistWriteRevision = next.revision;
          next[WishlistAccessModel.field] = { ...versions };
          // Stamp both copies atomically so a root snapshot cannot restore
          // someone else's old list while the mirror snapshot is in flight.
          for (const { id, data } of wishlistChanges) {
            if (data) next[WishlistAccessModel.field][id] = next.revision;
            else delete next[WishlistAccessModel.field][id];
          }
        }
        if (changes.length + wishlistChanges.length > 450) throw new Error('Muitas alterações simultâneas. A cópia de recuperação foi preservada; divida a operação.');
        next.mirrors = structuredClone(current.mirrors || {});
        for (const item of changes) {
          next.mirrors[item.name] ||= {};
          next.mirrors[item.name][item.id] = { revision: next.revision, hash: FirebasePrimary.fingerprint(item.data) };
        }
        const legacyFields = FirebaseExisting.project(next);
        let saved = { ...next, simulator: packed.simulator, ...(packed.wishlistImages ? { wishlistImages: packed.wishlistImages } : {}) };
        if (paged) {
          if (previousPages && !wishlistChanged) {
            const { wishlist, ...simulator } = next.simulator;
            saved = { ...next, simulator, wishlistPages: previousPages };
          } else {
            try {
              saved = await pages.write(saved, previousPages);
            } catch (error) {
              if (error.code !== 'permission-denied') throw error;
              const inline = { ...original, ...legacyFields, [FirebasePrimary.field]: saved };
              if (previousPages || encoder.encode(JSON.stringify(inline)).length > legacyDocumentBudget) {
                pagingDenied = true;
                throw error;
              }
              // The previous format is still writable on servers without the page rules.
            }
          }
        }
        if (prior && !prior.exists()) tx.set(backup, { usuarioAnterior: FirebasePrimary.plain(original), colecoesAnteriores: lists, criadoEm: serverTimestamp() });
        const patch = { [FirebasePrimary.field]: saved, ...legacyFields, atualizadoEm: serverTimestamp() };
        tx.set(root, patch, { mergeFields: Object.keys(patch) });
        for (const item of changes) tx.set(doc(db, 'usuarios', 'gabriel-local', item.name, encodeURIComponent(item.id)), { ...item.data, _walletRevision: next.revision }, { merge: true });
        for (const { id, data } of wishlistChanges) {
          const list = doc(projectionCollection, id);
          if (data) tx.set(list, { ...data, walletRevision: next.revision });
          else tx.delete(list);
        }
        return next;
      }).catch(async (error) => {
        if (error.code !== 'permission-denied') throw error;
        const wallet = await getDocFromServer(root).catch(() => null);
        if (!wallet?.exists()) throw error;
        const message = pagingDenied
          ? 'As regras do Firebase precisam autorizar o armazenamento em partes da Lista de Desejos. O acesso à carteira está ativo.'
          : 'O Firebase recusou a gravação. O acesso à carteira está ativo. Reconecte e tente salvar novamente.';
        throw Object.assign(new Error(message, { cause: error }), { code: 'wallet/write-denied' });
      });
    },
  };
}
