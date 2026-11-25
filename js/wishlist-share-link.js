import { existingFirestoreDb } from './firebase-connection.js';
import { createWishlistPages } from './firebase-wishlist-pages.js';

const path = ['usuarios', 'gabriel-local'];
const firestore = () => import('https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js');
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function wishlistLinkStore() {
  const [db, sdk] = await Promise.all([existingFirestoreDb(), firestore()]);
  const root = sdk.doc(db, ...path);
  const pages = createWishlistPages(sdk, db, root);
  const source = id => sdk.doc(db, ...path, 'wishlistLists', id);
  const share = token => sdk.doc(db, 'wishlistShares', token);
  return {
    async current(id) {
      const snapshot = await sdk.getDocFromServer(source(id));
      return snapshot.data()?.shareKey || '';
    },
    create(id) {
      return sdk.runTransaction(db, async tx => {
        const ref = source(id);
        const snapshot = await tx.get(ref);
        let list = snapshot.data();
        if (list?.shareKey) return list.shareKey;
        if (!list || list.walletPaged) {
          const saved = (await tx.get(root)).data()?.walletAtualV4;
          const wallet = saved ? await pages.restore(saved) : null;
          list = WishlistAccessModel.project(wallet?.simulator, id, wallet?.wishlistMirrorVersions?.[id] ?? 0);
        }
        if (!list || !Object.keys(list.items).length) throw new Error('Adicione um desejo antes de compartilhar esta lista.');
        const token = crypto.randomUUID();
        tx.set(ref, { ...list, shareKey: token });
        tx.set(share(token), { personId: id, name: list.name, items: list.items });
        return token;
      });
    },
    revoke(id, token) {
      return sdk.runTransaction(db, async tx => {
        const ref = source(id);
        const snapshot = await tx.get(ref);
        if (snapshot.data()?.shareKey !== token) throw new Error('O link já mudou. Abra o compartilhamento novamente.');
        tx.update(ref, { shareKey: '' });
        tx.delete(share(token));
      });
    },
    watch(token, receive, fail) {
      if (!tokenPattern.test(token)) {
        receive(null);
        return () => {};
      }
      return sdk.onSnapshot(share(token), { includeMetadataChanges: true }, snapshot => {
        if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) receive(snapshot.data() || null);
      }, fail);
    },
    markBought(token, personId, id) {
      if (!tokenPattern.test(token)) throw new Error('Link inválido.');
      const batch = sdk.writeBatch(db);
      const bought = new sdk.FieldPath('items', id, 'bought');
      batch.update(source(personId), bought, true, 'editedId', id);
      batch.update(share(token), bought, true);
      return batch.commit();
    },
  };
}

export async function manageWishlistLink(id) {
  const dialog = document.createElement('dialog');
  dialog.className = 'wishlist-link-dialog';
  dialog.innerHTML = '<h2>Link da lista</h2><p>Quem tiver o link pode ver os desejos e marcar um item como comprado.</p>' +
    '<label hidden>Link para compartilhar<input type="url" readonly></label>' +
    '<p role="status"></p><div class="wishlist-link-actions">' +
    '<button type="button" data-primary disabled>Gerar link</button>' +
    '<button type="button" data-revoke hidden>Revogar link</button>' +
    '<button type="button" data-close>Fechar</button></div>';
  const input = dialog.querySelector('input');
  const primary = dialog.querySelector('[data-primary]');
  const revoke = dialog.querySelector('[data-revoke]');
  const status = dialog.querySelector('[role=status]');
  let token = '', ready = false, confirming = false;
  function show() {
    input.parentElement.hidden = !token;
    const url = new URL('./wishlist-shared.html', location.href);
    url.hash = token;
    input.value = token ? url.href : '';
    primary.textContent = token ? 'Copiar link' : 'Gerar link';
    revoke.hidden = !token;
    revoke.textContent = confirming ? 'Confirmar revogação' : 'Revogar link';
  }
  function busy(active) {
    primary.disabled = active || !ready;
    revoke.disabled = active || !ready;
  }
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  try {
    const store = await wishlistLinkStore();
    token = await store.current(id);
    ready = true;
    show();
    busy(false);
    primary.onclick = async () => {
      busy(true);
      confirming = false;
      try {
        if (!token) token = await store.create(id);
        show();
        try {
          await navigator.clipboard.writeText(input.value);
          status.textContent = 'Link copiado.';
        } catch {
          input.select();
          status.textContent = 'Link pronto para copiar.';
        }
      } catch (error) {
        status.textContent = error.message || 'Não foi possível gerar o link.';
      } finally { busy(false); }
    };
    revoke.onclick = async () => {
      if (!confirming) {
        confirming = true;
        show();
        status.textContent = 'O link atual deixará de abrir a lista.';
        return;
      }
      busy(true);
      try {
        await store.revoke(id, token);
        token = '';
        confirming = false;
        show();
        status.textContent = 'Link revogado.';
      } catch (error) {
        status.textContent = error.message || 'Não foi possível revogar o link.';
      } finally { busy(false); }
    };
  } catch (error) {
    status.textContent = error.message || 'Não foi possível carregar o link.';
  }
}