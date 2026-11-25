import { openWishlistSharing } from './wishlist-sharing.js';

const walletPath = ['usuarios', 'gabriel-local'];
const personalPath = [...walletPath, 'wishlistPersonal'];
const itemFields = ['id', 'title', 'store', 'originalPrice', 'currency', 'quantity', 'taxQuebec', 'bought', 'url'];
const firestore = () => import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js');

function serverWatch(sdk, ref, receive, fail) {
  return sdk.onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) receive(snapshot);
  }, fail);
}

export async function openPersonalWishlist({ db, user }) {
  if (!user?.uid || !user.email || !user.emailVerified) throw new Error('Entre com uma conta Google verificada.');
  const sdk = await firestore();
  const config = sdk.doc(db, ...walletPath, 'config', 'acesso');
  const email = user.email.toLowerCase();
  function authorizedProfile(policy) {
    if (policy?.securityVersion !== 'google-private-v1' || !Array.isArray(policy.emails) ||
        policy.emails.length > 2 || !policy.emails.includes(email) || !policy.emails.includes(policy.adminEmail)) return '';
    return policy.adminEmail === email ? 'wallet-admin' : 'primary-luana';
  }
  const profile = authorizedProfile((await sdk.getDocFromServer(config)).data());
  if (!profile) throw new Error('Esta conta Google não tem acesso à carteira.');
  const name = profile === 'wallet-admin' ? 'Gabriel' : 'Luana';
  const ref = sdk.doc(db, ...personalPath, profile);

  async function changeItem(item, baseline, remove = false) {
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

  async function setBought(item, bought) {
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
    profile,
    watchAccess: (receive, fail) => serverWatch(sdk, config, snapshot => receive(authorizedProfile(snapshot.data()) === profile), fail),
    async sharing() { return { profile, api: await openWishlistSharing(db, profile) }; },
    watchList: (receive, fail) => {
      let last;
      return serverWatch(sdk, ref, snapshot => {
        const items = Object.values(snapshot.data()?.items || {});
        const next = JSON.stringify(items);
        if (last === next) return;
        last = next;
        receive({ name, items });
      }, fail);
    },
    setBought,
    saveItem: (item, baseline) => changeItem(item, baseline),
    removeItem: item => changeItem(item, item, true),
  };
}
