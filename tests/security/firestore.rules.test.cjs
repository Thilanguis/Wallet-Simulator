const { test, before, after } = require('node:test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, runTransaction } = require('firebase/firestore');
let environment;
const root = 'usuarios/gabriel-local';
before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-findom-rules', firestore: { host: '127.0.0.1', port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':').at(-1) || 8089), rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, root), { saldoDominadora: 1000, bonusEspecialAtivo: false, notificationToken: 'synthetic-protected' });
    await setDoc(doc(db, root + '/config/acesso'), { emails: ['owner@example.invalid', 'partner@example.invalid'], securityVersion: 'google-private-v1' });
    await setDoc(doc(db, root + '/tarefas/existing'), { titulo: 'Tarefa sintética', status: 'pendente' });
  });
});
after(async () => environment?.cleanup());
const signed = (email, verified = true, provider = 'google.com', uid = email) => environment.authenticatedContext(uid, { email, email_verified: verified, firebase: { sign_in_provider: provider } }).firestore();
test('anonymous clients cannot read or change the existing wallet, notes, access list or collections', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, root)));
  await assertFails(updateDoc(doc(db, root), { saldoDominadora: 0 }));
  await assertFails(getDocs(collection(db, root + '/tarefas')));
  await assertFails(getDoc(doc(db, root + '/config/acesso')));
});
test('both authorized verified Google accounts can read the same existing wallet and update money atomically', async () => {
  for (const email of ['owner@example.invalid', 'partner@example.invalid']) {
    const db = signed(email);
    await assertSucceeds(getDoc(doc(db, root)));
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const current = await tx.get(doc(db, root));
        tx.update(doc(db, root), { saldoDominadora: current.data().saldoDominadora + 1 });
      }),
    );
    await assertSucceeds(getDocs(collection(db, root + '/tarefas')));
  }
});
test('a third Google account, an unverified email or another provider cannot access the wallet', async () => {
  for (const db of [signed('outsider@example.invalid'), signed('owner@example.invalid', false), signed('owner@example.invalid', true, 'password')]) {
    await assertFails(getDoc(doc(db, root)));
    await assertFails(updateDoc(doc(db, root), { saldoDominadora: 0 }));
  }
});
test('members cannot change the allowlist, delete the wallet or overwrite unrelated legacy fields', async () => {
  const db = signed('owner@example.invalid');
  await assertFails(updateDoc(doc(db, root + '/config/acesso'), { emails: ['outsider@example.invalid'] }));
  await assertFails(deleteDoc(doc(db, root)));
  await assertFails(updateDoc(doc(db, root), { notificationToken: 'replaced' }));
  await assertFails(updateDoc(doc(db, root), { saldoDominadora: '1000' }));
});
test('members can create the immutable pre-upgrade backup once but cannot change it later', async () => {
  const db = signed('owner@example.invalid'),
    ref = doc(db, root + '/config/antesFirebasePrincipalV4');
  await assertSucceeds(setDoc(ref, { usuarioAnterior: { saldoDominadora: 1000 } }));
  await assertFails(setDoc(ref, { usuarioAnterior: { saldoDominadora: 0 } }));
  await assertFails(deleteDoc(ref));
});
test('task completion and history archival can be saved without allowing destructive deletion', async () => {
  const db = signed('partner@example.invalid');
  await assertSucceeds(updateDoc(doc(db, root + '/tarefas/existing'), { status: 'concluida' }));
  await assertSucceeds(setDoc(doc(db, root + '/historico/example'), { valor: 30, tipo: 'gasto', arquivado: true }));
  await assertFails(deleteDoc(doc(db, root + '/tarefas/existing')));
  await assertFails(deleteDoc(doc(db, root + '/historico/example')));
});

test('editing the private allowlist in Firebase revokes access without changing the wallet', async () => {
  const partner = signed('partner@example.invalid');
  await assertSucceeds(getDoc(doc(partner, root)));
  try {
    await environment.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), root + '/config/acesso'), { emails: ['owner@example.invalid'] }));
    await assertFails(getDoc(doc(partner, root)));
    await assertFails(getDocs(collection(partner, root + '/historico')));
    await assertFails(updateDoc(doc(partner, root), { saldoDominadora: 0 }));
    await assertSucceeds(getDoc(doc(signed('owner@example.invalid'), root)));
  } finally {
    await environment.withSecurityRulesDisabled(async (context) => updateDoc(doc(context.firestore(), root + '/config/acesso'), { emails: ['owner@example.invalid', 'partner@example.invalid'] }));
  }
});

const personalDoc = (db, id) => doc(db, root + '/wishlistPersonal', id);
const wish = (id, updates = {}) => ({ id, title: 'Produto de exemplo', store: 'Loja de exemplo', originalPrice: 40.25, currency: 'CAD', quantity: 1, taxQuebec: false, bought: false, ...updates });
async function configureAccess(adminEmail) {
  await environment.withSecurityRulesDisabled(async context => {
    const config = { emails: ['owner@example.invalid', 'partner@example.invalid'], securityVersion: 'google-private-v1' };
    await setDoc(doc(context.firestore(), root + '/config/acesso'), adminEmail ? { ...config, adminEmail } : config);
  });
}

test('old clients keep ordinary wallet writes but need the new revision marker to modify wishes when enabled', async () => {
  const admin = signed('owner@example.invalid');
  const wallet = doc(admin, root);
  const existing = JSON.stringify([wish('pinned')]);
  const people = JSON.stringify([{ id: 'person', name: 'Pessoa' }]);
  const initial = { revision: 1, simulator: { wishlist: existing, wishlistPeople: people } };
  await configureAccess();
  await assertSucceeds(updateDoc(wallet, { walletAtualV4: initial }));
  await configureAccess('owner@example.invalid');
  await assertSucceeds(updateDoc(wallet, { saldoDominadora: 4000 }));
  await assertSucceeds(updateDoc(wallet, { walletAtualV4: { ...initial, revision: 2, simulator: { ...initial.simulator, unrelated: 'x' } } }));
  const editedWishes = { ...initial.simulator, wishlist: '[]' };
  const editedPeople = { ...initial.simulator, wishlistPeople: '[]' };
  await assertFails(updateDoc(wallet, { walletAtualV4: { revision: 3, simulator: editedWishes } }));
  await assertFails(updateDoc(wallet, { walletAtualV4: { revision: 3, simulator: editedPeople } }));
  await assertFails(updateDoc(wallet, { walletAtualV4: { revision: 3, wishlistWriteRevision: 2, simulator: editedWishes } }));
  await assertFails(updateDoc(wallet, { walletAtualV4: { revision: 0, wishlistWriteRevision: 0, simulator: editedWishes } }));
  await assertSucceeds(updateDoc(wallet, { walletAtualV4: { revision: 3, wishlistWriteRevision: 3, simulator: editedWishes } }));
});

test('the two authorized accounts can share a personal list with each other and revoke sharing', async () => {
  await configureAccess('owner@example.invalid');
  const owner = signed('owner@example.invalid');
  const partner = signed('partner@example.invalid');
  const third = signed('outsider@example.invalid', true, 'google.com', 'previously-approved');
  const profile = 'wallet-admin';
  const recipient = 'primary-luana';
  const share = db => doc(db, root + '/wishlistGrants/' + profile + '~' + recipient);
  await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), root + '/wishlistAccounts/previously-approved'), { email: 'outsider@example.invalid', status: 'approved', role: 'coadmin' }));
  await assertFails(getDoc(doc(third, root)));
  await assertFails(getDoc(personalDoc(third, profile)));
  await assertFails(setDoc(doc(third, root + '/wishlistAccounts/previously-approved'), { role: 'coadmin' }));
  await assertSucceeds(setDoc(personalDoc(owner, profile), { items: { one: wish('one') }, editedId: 'one' }));
  await assertFails(getDoc(personalDoc(partner, profile)));
  await assertSucceeds(setDoc(share(owner), { owner: profile, recipient }));
  await assertFails(getDoc(personalDoc(third, profile)));
  await assertSucceeds(getDoc(personalDoc(partner, profile)));
  await assertFails(updateDoc(personalDoc(partner, profile), { 'items.one.title': 'Outra pessoa', editedId: 'one' }));
  await assertSucceeds(updateDoc(personalDoc(owner, profile), { 'items.one.bought': true, editedId: 'one' }));
  await assertSucceeds(updateDoc(personalDoc(owner, profile), { 'items.one.title': 'Título atualizado', editedId: 'one' }));
  await assertSucceeds(deleteDoc(share(owner)));
  await assertFails(getDoc(personalDoc(partner, profile)));
});

test('large wishlist pages are immutable and available only to wallet members', async () => {
  const owner = signed('owner@example.invalid');
  const hash = 'a'.repeat(64);
  const page = db => doc(db, root + '/wishlistPages', hash);
  await assertSucceeds(setDoc(page(owner), { payload: 'página privada' }));
  await assertSucceeds(setDoc(page(owner), { payload: 'página privada' }));
  const partner = signed('partner@example.invalid');
  assert.equal((await assertSucceeds(getDoc(page(partner)))).data().payload, 'página privada');
  await assertFails(setDoc(page(partner), { payload: 'outra página' }));
  await assertFails(deleteDoc(page(owner)));
  for (const db of [environment.unauthenticatedContext().firestore(), signed('outsider@example.invalid')]) {
    await assertFails(getDoc(page(db)));
    await assertFails(setDoc(page(db), { payload: 'outra página' }));
  }
  await assertFails(setDoc(doc(owner, root + '/wishlistPages', 'invalid'), { payload: 'página privada' }));

  const walletRef = doc(owner, root);
  const before = (await getDoc(walletRef)).data().walletAtualV4;
  try {
    const saved = { revision: 200, wishlistWriteRevision: 200, simulator: {}, wishlistPages: [hash] };
    await assertSucceeds(updateDoc(walletRef, { walletAtualV4: saved }));
    await assertFails(updateDoc(walletRef, { walletAtualV4: { revision: 201, simulator: { wishlist: '[]' } } }));
    await assertFails(updateDoc(walletRef, { walletAtualV4: { ...saved, simulator: { wishlist: '[]' } } }));
    await assertSucceeds(updateDoc(walletRef, { walletAtualV4: { ...saved, revision: 201 } }));
  } finally {
    await environment.withSecurityRulesDisabled(async (context) => {
      const ref = doc(context.firestore(), root);
      await updateDoc(ref, { walletAtualV4: before ?? {} });
      await deleteDoc(doc(context.firestore(), root + '/wishlistPages', hash));
    });
  }
});

test('stages a wishlist larger than one document across several Firestore writes', async () => {
  const sdk = require('firebase/firestore');
  const { createWishlistPages } = await import('../../js/firebase-wishlist-pages.js');
  const owner = signed('owner@example.invalid');
  const partner = signed('partner@example.invalid');
  const reference = doc(owner, root);
  const before = (await getDoc(reference)).data().walletAtualV4;
  const wishlist = JSON.stringify(Array.from({ length: 75 }, (_, id) => ({
    id: 'desejo-' + id, title: 'Produto 🛍️ ' + id, imageUrl: 'data:image/jpeg;base64,' + ('a'.repeat(24000)) + id,
  })));
  assert.ok(Buffer.byteLength(wishlist) > 1048576);
  const pages = createWishlistPages(sdk, owner, reference);
  const packed = await pages.write({ revision: 250, wishlistWriteRevision: 250, simulator: { wishlist } });
  assert.ok(packed.wishlistPages.length > 16);
  assert.equal(packed.simulator.wishlist, undefined);
  assert.deepEqual((await getDoc(reference)).data().walletAtualV4, before);
  try {
    await assertSucceeds(updateDoc(reference, { walletAtualV4: packed }));
    const partnerRef = doc(partner, root);
    const opened = await createWishlistPages(sdk, partner, partnerRef).restore((await getDoc(partnerRef)).data().walletAtualV4);
    assert.equal(opened.simulator.wishlist, wishlist);
  } finally {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await updateDoc(doc(db, root), { walletAtualV4: before ?? {} });
      await Promise.all(packed.wishlistPages.map(id => deleteDoc(doc(db, root + '/wishlistPages', id))));
    });
  }
});
