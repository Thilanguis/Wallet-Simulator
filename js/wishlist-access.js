import { openWishlistSharing } from './wishlist-sharing.js';

const walletPath = ['usuarios', 'gabriel-local'];
const directoryPath = [...walletPath, 'wishlistAccounts'];
const listPath = [...walletPath, 'wishlistLists'];
const personalPath = [...walletPath, 'wishlistPersonal'];
const giftsPath = [...walletPath, 'wishlistGifts'];
const directoryNamesPath = [...walletPath, 'wishlistDirectory'];
const itemFields = ['id', 'title', 'store', 'originalPrice', 'currency', 'quantity', 'taxQuebec', 'bought', 'url'];
const firestore = () => import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js');

function accountView(data) {
  if (!data) return { role: 'request' };
  return { ...data, role: data.status === 'approved' ? data.role : data.status };
}

function serverWatch(sdk, ref, receive, fail) {
  return sdk.onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) receive(snapshot);
  }, fail);
}

export async function openWishlistAccess({ db, user }) {
  if (!user?.uid || !user.email || !user.emailVerified) throw new Error('Entre com uma conta Google verificada.');
  const sdk = await firestore();
  const account = sdk.doc(db, ...directoryPath, user.uid);
  const legacy = sdk.doc(db, ...directoryPath, 'email:' + user.email);
  const access = sdk.doc(db, ...walletPath, 'config', 'acesso');
  let enabled = false;
  async function readProfile(ref) {
    try {
      const snapshot = await sdk.getDocFromServer(ref);
      enabled = true;
      return snapshot.data();
    } catch (error) {
      if (error.code !== 'permission-denied') throw error;
    }
  }
  const existingProfile = await readProfile(legacy);
  const profile = existingProfile || await readProfile(account);
  let current = accountView(profile);
  // Existing full-wallet users are configured privately and need no request.
  let defaultRole = '', walletProfile = '';
  {
    try {
      const config = (await sdk.getDocFromServer(access)).data();
      const email = user.email.toLowerCase();
      if (config?.emails?.includes(email)) {
        const role = config.adminEmail === email ? 'admin' : 'coadmin';
        walletProfile = role === 'admin' ? 'wallet-admin' : config.emails.length === 2 ? 'primary-luana' : '';
        if (!existingProfile) {
          defaultRole = role;
          current = { role: defaultRole };
        }
      }
    } catch (error) {
      if (error.code !== 'permission-denied') throw error;
    }
  }

  function personalProfile(personId) {
    if (walletProfile) return walletProfile;
    if (personId === 'primary-luana' && current.personId === 'primary-luana') return personId;
    return 'account-' + user.uid;
  }
  async function changeItem(personId, item, baseline, remove = false) {
    const ref = sdk.doc(db, ...personalPath, personalProfile(personId));
    return sdk.runTransaction(db, async tx => {
      const snapshot = await tx.get(ref);
      const { items = {} } = snapshot.data() || {};
      const previous = Object.hasOwn(items, item.id) ? items[item.id] : undefined;
      if (baseline ? !previous || itemFields.some(key => previous[key] !== baseline[key]) : Boolean(previous)) {
        throw new Error('Este desejo mudou em outro aparelho. Confira a lista e tente de novo.');
      }
      if (remove) {
        const { [item.id]: deleted, ...remaining } = items;
        tx.set(ref, { items: remaining, editedId: item.id });
        return null;
      }
      const changed = {
        id: item.id,
        title: item.title.trim(),
        store: item.store.trim(),
        originalPrice: item.originalPrice,
        currency: item.currency,
        quantity: item.quantity,
        taxQuebec: !!item.taxQuebec,
        bought: previous?.bought === true,
        ...(item.url !== undefined ? { url: item.url } : {}),
      };
      if (previous && itemFields.every(key => previous[key] === changed[key])) return previous;
      tx.set(ref, { items: { ...items, [item.id]: changed }, editedId: item.id });
      return changed;
    });
  }

  async function setBought(personId, item, bought) {
    const ref = sdk.doc(db, ...personalPath, personalProfile(personId));
    return sdk.runTransaction(db, async tx => {
      const snapshot = await tx.get(ref);
      const list = snapshot.data();
      const current = list?.items?.[item.id];
      if (!current || itemFields.some(key => current[key] !== item[key])) throw Error('O desejo mudou. Confira a lista e tente novamente.');
      if (current.bought === bought) return;
      tx.set(ref, { items: { ...list.items, [item.id]: { ...current, bought } }, editedId: item.id });
    });
  }

  return {
    enabled,
    ...current,
    submitRequest: () => sdk.runTransaction(db, async tx => {
      const snapshot = await tx.get(account);
      if (!snapshot.exists()) tx.set(account, {
        email: user.email, role: 'guest', status: 'pending', personId: '', canManagePurchased: false,
      });
    }),
    watchAccount: (receive, fail) => {
      const profiles = new Map();
      const refs = [legacy, account];
      function update(ref, value) {
        profiles.set(ref, value);
        if (profiles.size !== refs.length) return;
        const existing = profiles.get(legacy);
        receive(existing ? accountView(existing) : defaultRole ? { role: defaultRole } : accountView(profiles.get(account)));
      }
      const stops = refs.map(ref => serverWatch(sdk, ref, snapshot => update(ref, snapshot.data()), error => {
        if (ref === legacy && !existingProfile && error.code === 'permission-denied') update(ref);
        else fail(error);
      }));
      return () => stops.forEach(stop => stop());
    },
    profile: personalProfile(current.personId),
    async sharing(personId) {
      const profile = personalProfile(personId);
      return { profile, api: await openWishlistSharing(db, profile) };
    },
    watchList: (personId, receive, fail, giftsProfile = personId) => {
      const profile = personalProfile(personId);
      let items, gifts, name;
      const update = () => {
        if (items && gifts && name !== undefined) receive({ name, items, gifts });
      };
      const refs = [
        [sdk.doc(db, ...personalPath, profile), data => { items = Object.values(data?.items || {}); }],
        [sdk.doc(db, ...directoryNamesPath, profile), data => { name = data?.name || ''; }],
      ];
      if (giftsProfile) refs.push([sdk.doc(db, ...giftsPath, giftsProfile), data => { gifts = Object.values(data?.items || {}); }]);
      else gifts = [];
      const stops = refs.map(([ref, apply]) => serverWatch(sdk, ref, snapshot => { apply(snapshot.data()); update(); }, fail));
      return () => stops.forEach(stop => stop());
    },
    setBought,
    saveItem: (personId, item, baseline) => changeItem(personId, item, baseline),
    removeItem: (personId, item) => changeItem(personId, item, item, true),
  };
}

export async function wishlistAccessAdmin(db) {
  const sdk = await firestore();
  return {
    watchAccounts: (receive, fail) => serverWatch(sdk, sdk.collection(db, ...directoryPath), snapshot => {
      receive(snapshot.docs.map(item => ({ ...item.data(), uid: item.id })));
    }, fail),
    saveAccount: (before, updates) => sdk.runTransaction(db, async tx => {
      const account = sdk.doc(db, ...directoryPath, before.uid);
      const snapshot = await tx.get(account);
      let current = snapshot.data();
      if (!current && before.uid === 'email:' + before.email) {
        const config = (await tx.get(sdk.doc(db, ...walletPath, 'config', 'acesso'))).data();
        if (config?.adminEmail !== before.email && config?.emails?.includes(before.email)) {
          current = { email: before.email, role: 'coadmin', status: 'approved', personId: '', canManagePurchased: false };
        }
      }
      const accountFields = ['email', 'role', 'status', 'personId', 'canManagePurchased'];
      if (!current || accountFields.some(key => current[key] !== before[key])) {
        throw new Error('A solicitação já mudou. Confira o acesso atual.');
      }
      const next = { ...current, ...updates };
      if (next.status === 'approved' && next.role === 'guest') {
        const root = await tx.get(sdk.doc(db, ...walletPath));
        const wallet = root.data()?.walletAtualV4;
        const projected = WishlistAccessModel.project(wallet?.simulator, next.personId, wallet?.wishlistMirrorVersions?.[next.personId] ?? 0);
        if (!projected) throw new Error('Escolha uma pessoa cadastrada na Lista de Desejos.');
        const list = sdk.doc(db, ...listPath, next.personId);
        const existing = await tx.get(list);
        if (!existing.exists()) tx.set(list, projected);
      }
      tx.set(account, next);
    }),
  };
}
export async function openWishlistDirectoryEditor(db) {
  const sdk = await firestore();
  const collection = sdk.collection(db, ...directoryNamesPath);
  return async entries => {
    const snapshot = await sdk.getDocsFromServer(collection);
    const next = new Map(entries);
    const saved = new Map(snapshot.docs.map(row => [row.id, row.data()]));
    for (const [id, value] of saved) {
      if (!next.has(id) && value.active) next.set(id, { name: value.name, accountId: value.accountId, active: false });
    }
    await Promise.all([...next].map(([id, value]) => {
      const entry = { active: true, ...value };
      const before = saved.get(id);
      if (before?.name === entry.name && before?.accountId === entry.accountId && before?.active === entry.active) return;
      return sdk.setDoc(sdk.doc(collection, id), entry);
    }));
  };
}
