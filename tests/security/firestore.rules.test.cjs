const { test, before, after } = require('node:test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, runTransaction, writeBatch, deleteField } = require('firebase/firestore');
let environment;
const root = 'usuarios/gabriel-local';
before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-findom-rules', firestore: { host: '127.0.0.1', port: 8089, rules: fs.readFileSync('firestore.rules', 'utf8') } });
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

const accountDoc = (db, uid) => doc(db, root + '/wishlistAccounts', uid);
const listDoc = (db, personId) => doc(db, root + '/wishlistLists', personId);
const personalDoc = (db, id) => doc(db, root + '/wishlistPersonal', id);
const giftDoc = (db, id) => doc(db, root + '/wishlistGifts', id);
const pending = (email) => ({ email, status: 'pending', role: 'guest', personId: '', canManagePurchased: false });
const wish = (id, updates = {}) => ({ id, title: 'Produto de exemplo', store: 'Loja de exemplo', originalPrice: 40.25, currency: 'USD', quantity: 1, taxQuebec: false, bought: false, ...updates });
const projectedList = (name, items = { synthetic: wish('synthetic') }) => ({ name, items, walletRevision: 0, editedId: '' });
async function configureAccess(adminEmail) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const ref = doc(context.firestore(), root + '/config/acesso');
    const config = { emails: ['owner@example.invalid', 'partner@example.invalid'], securityVersion: 'google-private-v1' };
    await setDoc(ref, adminEmail === undefined ? config : { ...config, adminEmail });
  });
}

test('legacy access works until a verified allowlisted admin is configured', async () => {
  const owner = signed('owner@example.invalid');
  const partner = signed('partner@example.invalid');
  const outsider = signed('outsider@example.invalid');
  const accounts = collection(owner, root + '/wishlistAccounts');
  for (const adminEmail of [undefined, 'outsider@example.invalid']) {
    await configureAccess(adminEmail);
    await assertSucceeds(getDoc(doc(owner, root)));
    await assertSucceeds(getDoc(doc(partner, root)));
    await assertFails(getDocs(accounts));
    await assertFails(getDoc(accountDoc(outsider, 'outsider@example.invalid')));
    await assertFails(setDoc(accountDoc(outsider, 'outsider@example.invalid'), pending('outsider@example.invalid')));
    await assertFails(setDoc(listDoc(owner, 'unavailable'), projectedList('Indisponível')));
  }
  await environment.withSecurityRulesDisabled(context => deleteDoc(doc(context.firestore(), root + '/config/acesso')));
  await assertFails(getDoc(doc(owner, root)));
  await assertFails(getDocs(accounts));
  await configureAccess('owner@example.invalid');
  await assertSucceeds(getDocs(accounts));
  await assertFails(updateDoc(doc(owner, root + '/config/acesso'), { adminEmail: 'partner@example.invalid' }));
});

test('verified Google accounts can only register their own unlinked pending guest', async () => {
  await configureAccess('owner@example.invalid');
  const email = 'requester@example.invalid';
  const uid = 'requester';
  const guest = signed(email, true, 'google.com', uid);
  const ref = accountDoc(guest, uid);
  await assertSucceeds(getDoc(ref));
  await assertFails(setDoc(accountDoc(guest, 'another-uid'), pending(email)));
  await assertFails(setDoc(ref, pending('another-email@example.invalid')));
  await assertFails(setDoc(ref, { ...pending(email), notes: [] }));
  await assertFails(setDoc(ref, { email, status: 'pending', role: 'guest', personId: '' }));
  await assertFails(setDoc(ref, { ...pending(email), canManagePurchased: true }));
  await assertFails(setDoc(ref, { ...pending(email), canManagePurchased: 'false' }));
  await assertFails(setDoc(ref, { ...pending(email), role: 'coadmin' }));
  await assertFails(setDoc(ref, { ...pending(email), personId: 'other-person' }));
  await assertFails(setDoc(ref, { ...pending(email), status: 'approved', personId: 'other-person' }));
  await assertFails(setDoc(ref, { ...pending(email), status: 'blocked' }));
  await assertFails(setDoc(accountDoc(signed(email, false, 'google.com', uid), uid), pending(email)));
  await assertFails(setDoc(accountDoc(signed(email, true, 'password', uid), uid), pending(email)));
  await assertFails(setDoc(accountDoc(environment.unauthenticatedContext().firestore(), uid), pending(email)));
  await assertSucceeds(setDoc(ref, pending(email)));
  await assertSucceeds(getDoc(ref));
  await assertFails(updateDoc(ref, { status: 'approved', role: 'coadmin' }));
  await assertFails(updateDoc(ref, { status: 'blocked', role: 'coadmin' }));
  await assertFails(deleteDoc(ref));
  await assertFails(getDoc(accountDoc(guest, 'another-uid')));
  await assertFails(getDocs(collection(guest, root + '/wishlistAccounts')));
  await assertFails(getDoc(doc(guest, root)));
  await assertFails(getDoc(listDoc(guest, 'any-person')));
});

test('the co-admin can approve a pending guest against an existing or atomic list and cannot change other access', async () => {
  await configureAccess('owner@example.invalid');
  const owner = signed('owner@example.invalid');
  const partner = signed('partner@example.invalid');
  const email = 'guest@example.invalid';
  const uid = 'guest-user';
  const guest = signed(email, true, 'google.com', uid);
  await assertSucceeds(setDoc(accountDoc(guest, uid), pending(email)));
  const access = accountDoc(partner, uid);
  const assigned = 'guest-person';
  const other = 'different-person';
  await assertSucceeds(setDoc(listDoc(owner, other), projectedList('Outra lista')));
  await assertFails(setDoc(listDoc(owner, 'invalid.person'), projectedList('ID não permitido')));
  await assertFails(setDoc(listDoc(owner, 'invalid-fields'), { ...projectedList('Teste'), balance: 1000 }));
  await assertFails(getDoc(listDoc(guest, assigned)));
  await assertFails(updateDoc(access, { status: 'approved', personId: assigned }));
  await assertFails(updateDoc(access, { status: 'approved', role: 'coadmin' }));
  await assertFails(updateDoc(access, { status: 'approved', personId: other, email: 'wrong-email@example.invalid' }));
  await assertFails(updateDoc(access, { status: 'blocked' }));
  await assertFails(updateDoc(access, { status: 'approved', personId: other, canManagePurchased: true }));
  const approval = writeBatch(partner);
  approval.set(listDoc(partner, assigned), projectedList('Lista atribuída'));
  approval.update(access, { status: 'approved', personId: assigned });
  await assertSucceeds(approval.commit());
  await assertSucceeds(getDocs(collection(partner, root + '/wishlistAccounts')));
  await assertSucceeds(getDoc(accountDoc(guest, uid)));
  await assertFails(getDoc(listDoc(guest, assigned)));
  await assertSucceeds(getDoc(giftDoc(guest, assigned)));
  await assertFails(getDoc(listDoc(guest, other)));
  await assertFails(getDocs(collection(guest, root + '/wishlistLists')));
  await assertFails(getDoc(doc(guest, root)));
  await assertFails(getDoc(doc(guest, root + '/config/acesso')));
  await assertFails(getDoc(doc(guest, root + '/config/antesFirebasePrincipalV4')));
  for (const subcollection of ['tarefas', 'historico', 'debugRoleta', 'accelBoosts']) {
    await assertFails(getDocs(collection(guest, root + '/' + subcollection)));
  }
  await assertFails(updateDoc(listDoc(guest, assigned), { name: 'Alteração sem permissão' }));
  await assertFails(setDoc(listDoc(guest, 'new-person'), projectedList('Criação sem permissão')));
  await assertFails(deleteDoc(listDoc(guest, assigned)));
  await assertFails(updateDoc(access, { personId: other }));
  await assertFails(updateDoc(access, { status: 'blocked' }));
  await assertFails(updateDoc(access, { role: 'coadmin' }));
  await assertFails(deleteDoc(accountDoc(owner, uid)));
  await assertSucceeds(updateDoc(accountDoc(owner, uid), { status: 'blocked' }));
  await assertFails(getDoc(listDoc(guest, assigned)));
});

test('only the admin can grant and revoke wallet rights for a new co-admin', async () => {
  await configureAccess('owner@example.invalid');
  const owner = signed('owner@example.invalid');
  const email = 'future-coadmin@example.invalid';
  const uid = 'future-coadmin';
  const applicant = signed(email, true, 'google.com', uid);
  const ref = accountDoc(owner, uid);
  await assertSucceeds(setDoc(accountDoc(applicant, uid), pending(email)));
  await assertFails(updateDoc(ref, { status: 'approved', role: 'coadmin' }));
  await assertSucceeds(setDoc(listDoc(owner, 'promotion-profile'), projectedList('Perfil antes da promoção')));
  await assertSucceeds(updateDoc(ref, { status: 'approved', personId: 'promotion-profile' }));
  await assertSucceeds(updateDoc(ref, { role: 'coadmin', personId: '' }));
  await assertSucceeds(getDoc(doc(applicant, root)));
  await assertSucceeds(updateDoc(doc(applicant, root), { saldoDominadora: 2000 }));
  await assertSucceeds(getDocs(collection(applicant, root + '/wishlistAccounts')));
  const guestEmail = 'approved-by-new-coadmin@example.invalid';
  const guestUid = 'approved-by-new-coadmin';
  const guest = signed(guestEmail, true, 'google.com', guestUid);
  const personId = 'another-shared-list';
  await assertSucceeds(setDoc(accountDoc(guest, guestUid), pending(guestEmail)));
  await assertSucceeds(setDoc(listDoc(applicant, personId), projectedList('Lista de convidada')));
  await assertSucceeds(updateDoc(accountDoc(applicant, guestUid), { status: 'approved', personId }));
  await assertFails(updateDoc(accountDoc(applicant, guestUid), { role: 'coadmin' }));
  await assertFails(getDoc(doc(signed('mismatched-email@example.invalid', true, 'google.com', uid), root)));
  await assertSucceeds(updateDoc(ref, { role: 'guest', personId }));
  await assertFails(getDoc(doc(applicant, root)));
  await assertFails(getDocs(collection(applicant, root + '/wishlistAccounts')));
  await assertSucceeds(getDoc(giftDoc(applicant, personId)));
  await configureAccess();
  await assertFails(getDoc(giftDoc(applicant, personId)));
  await configureAccess('owner@example.invalid');
  await assertSucceeds(getDoc(giftDoc(applicant, personId)));
});

test('guests can add, edit and remove exactly one unbought wish on their own list', async () => {
  await configureAccess('owner@example.invalid');
  const admin = signed('owner@example.invalid');
  const email = 'editor@example.invalid';
  const uid = 'guest-editor';
  const guest = signed(email, true, 'google.com', uid);
  const personId = 'guest-edits';
  const own = personalDoc(guest, 'account-' + uid);
  const edited = (id, item) => ({ ['items.' + id]: item, editedId: id });
  await assertSucceeds(setDoc(accountDoc(guest, uid), pending(email)));
  await assertSucceeds(setDoc(listDoc(admin, personId), projectedList('Lista pessoal', { old: wish('old'), other: wish('other') })));
  await assertSucceeds(setDoc(listDoc(admin, 'separate-list'), projectedList('Lista separada', { old: wish('old') })));
  await assertSucceeds(updateDoc(accountDoc(admin, uid), { status: 'approved', personId }));
  await assertSucceeds(setDoc(own, { items: { old: wish('old') }, editedId: 'old' }));
  await assertSucceeds(updateDoc(own, edited('other', wish('other'))));
  await assertFails(updateDoc(listDoc(guest, 'separate-list'), edited('old', wish('old', { title: 'Fora da lista' }))));
  await assertFails(updateDoc(own, edited('new', wish('new', { bought: true }))));
  await assertFails(updateDoc(own, { ...edited('new', wish('new')), editedId: '__reserved__' }));
  await assertFails(updateDoc(own, edited('new', wish('new', { personId: 'separate-list' }))));
  await assertFails(updateDoc(own, edited('new', wish('somebody-else'))));
  await assertFails(updateDoc(own, edited('new', wish('new', { quantity: -1 }))));
  await assertFails(updateDoc(own, edited('new', wish('new', { currency: 'wrong' }))));
  await assertFails(updateDoc(own, edited('new', wish('new', { originalPrice: Infinity }))));
  await assertFails(updateDoc(own, edited('new', wish('new', { originalPrice: -1 }))));
  await assertFails(updateDoc(own, edited('new', 'texto sem campos')));
  await assertFails(updateDoc(own, { items: [], editedId: 'old' }));
  await assertFails(updateDoc(own, { items: {}, editedId: '' }));
  await assertFails(updateDoc(own, { items: {}, editedId: 'old' }));
  await assertFails(updateDoc(own, { ...edited('old', wish('old', { title: 'Novo título' })), walletRevision: 5 }));
  await assertFails(updateDoc(own, { ...edited('old', wish('old', { title: 'Novo título' })), name: 'Nome alterado' }));
  await assertFails(updateDoc(own, { ...edited('old', wish('old', { title: 'Novo título' })), 'items.other': deleteField() }));
  await assertFails(updateDoc(own, { ...edited('old', wish('old', { title: 'Novo título' })), editedId: 'other' }));
  await assertSucceeds(updateDoc(own, edited('new', wish('new', { originalPrice: null, store: '' }))));
  await assertSucceeds(updateDoc(own, edited('old', wish('old', { title: 'Título atualizado', quantity: 2 }))));
  await assertFails(updateDoc(own, edited('old', wish('old', { bought: true }))));
  await assertSucceeds(updateDoc(own, edited('new', deleteField())));
  const updated = await assertSucceeds(getDoc(own));
  const { items } = updated.data();
  assert.equal(items.old.title, 'Título atualizado');
  assert.equal(items.old.quantity, 2);
  assert.equal(items.other.title, 'Produto de exemplo');
  assert.equal(Object.hasOwn(items, 'new'), false);
});

test('only the admin can allow guest edits or removal of bought items without changing purchase status', async () => {
  await configureAccess('owner@example.invalid');
  const admin = signed('owner@example.invalid');
  const partner = signed('partner@example.invalid');
  const email = 'purchases@example.invalid';
  const uid = 'guest-purchases';
  const guest = signed(email, true, 'google.com', uid);
  const personId = 'guest-purchased-items';
  const own = personalDoc(guest, 'account-' + uid);
  const account = accountDoc(admin, uid);
  const purchased = (id) => wish(id, { bought: true });
  const edit = (id, value) => ({ ['items.' + id]: value, editedId: id });
  await assertSucceeds(setDoc(accountDoc(guest, uid), pending(email)));
  await assertSucceeds(setDoc(listDoc(admin, personId), projectedList('Itens comprados', { paid: purchased('paid'), other: purchased('other') })));
  await assertSucceeds(updateDoc(account, { status: 'approved', personId }));
  await assertSucceeds(setDoc(own, { items: { paid: wish('paid') }, editedId: 'paid' }));
  await assertSucceeds(updateDoc(own, edit('other', wish('other'))));
  await assertSucceeds(updateDoc(own, { 'items.paid.bought': true, editedId: 'paid' }));
  await assertSucceeds(updateDoc(own, { 'items.other.bought': true, editedId: 'other' }));
  await assertFails(updateDoc(own, edit('paid', { ...purchased('paid'), quantity: 3 })));
  await assertFails(updateDoc(own, edit('paid', deleteField())));
  await assertFails(updateDoc(accountDoc(guest, uid), { canManagePurchased: true }));
  await assertFails(updateDoc(accountDoc(partner, uid), { canManagePurchased: true }));
  await assertSucceeds(updateDoc(account, { canManagePurchased: true }));
  await assertSucceeds(updateDoc(own, edit('paid', { ...purchased('paid'), title: 'Corrigido sem mudar a compra' })));
  await assertFails(updateDoc(own, edit('paid', wish('paid', { quantity: 2 }))));
  await assertFails(updateDoc(own, edit('forged', purchased('forged'))));
  await assertSucceeds(updateDoc(own, edit('other', deleteField())));
  await assertSucceeds(updateDoc(account, { canManagePurchased: false }));
  await assertFails(updateDoc(own, edit('paid', deleteField())));
  await assertFails(updateDoc(own, edit('paid', { ...purchased('paid'), title: 'Mudança após revogação' })));
  const list = await assertSucceeds(getDoc(own));
  assert.equal(list.data().items.paid.bought, true);
  assert.equal(Object.hasOwn(list.data().items, 'other'), false);
  await assertSucceeds(updateDoc(own, { 'items.paid.bought': false, editedId: 'paid' }));
  assert.equal((await getDoc(own)).data().items.paid.bought, false);
});

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
test('administrator manages an existing subadmin without removing their Google account', async () => {
  await configureAccess('owner@example.invalid');
  const admin = signed('owner@example.invalid');
  const partner = signed('partner@example.invalid');
  const email = 'partner@example.invalid';
  const profile = 'primary-luana';
  const ref = accountDoc(admin, 'email:' + email);
  await assertSucceeds(getDoc(doc(partner, root)));
  await assertSucceeds(getDoc(accountDoc(partner, 'email:' + email)));
  await assertSucceeds(setDoc(listDoc(admin, profile), projectedList('Luana')));
  const newcomer = signed('new-visitor@example.invalid', true, 'google.com', 'unrelated-primary');
  await assertSucceeds(setDoc(accountDoc(newcomer, 'unrelated-primary'), pending('new-visitor@example.invalid')));
  await assertFails(updateDoc(accountDoc(admin, 'unrelated-primary'), { status: 'approved', personId: profile }));
  await assertFails(getDoc(listDoc(newcomer, profile)));
  const guest = { ...pending(email), status: 'approved', personId: profile };
  await assertFails(setDoc(accountDoc(partner, 'email:' + email), guest));
  await assertFails(setDoc(accountDoc(admin, 'email:owner@example.invalid'), { ...guest, email: 'owner@example.invalid' }));
  await assertSucceeds(setDoc(ref, guest));
  await assertFails(getDoc(doc(partner, root)));
  await assertFails(getDoc(listDoc(partner, profile)));
  await assertSucceeds(getDoc(giftDoc(partner, profile)));
  await assertSucceeds(setDoc(personalDoc(partner, profile), { items: { synthetic: wish('synthetic') }, editedId: 'synthetic' }));
  await assertSucceeds(updateDoc(personalDoc(partner, profile), { 'items.synthetic.title': 'Atualizado por Luana', editedId: 'synthetic' }));
  await assertFails(updateDoc(accountDoc(partner, 'email:' + email), { role: 'coadmin' }));
  await assertSucceeds(updateDoc(ref, { status: 'blocked' }));
  await assertFails(getDoc(personalDoc(partner, profile)));
  await assertFails(updateDoc(ref, { status: 'approved', role: 'coadmin', personId: '' }));
  await assertSucceeds(updateDoc(ref, { status: 'approved' }));
  await assertSucceeds(updateDoc(ref, { role: 'coadmin', personId: '' }));
  await assertSucceeds(getDoc(doc(partner, root)));
});

test('only selected approved accounts can read a personal list and a revoked share closes access', async () => {
  await configureAccess('owner@example.invalid');
  const admin = signed('owner@example.invalid');
  const luana = signed('partner@example.invalid');
  const visitor = environment.unauthenticatedContext().firestore();
  const email = 'wishlist-sharing@example.invalid';
  const uid = 'sharing-guest';
  const guest = signed(email, true, 'google.com', uid);
  const person = 'sharing-person';
  const owner = 'account-' + uid;
  const directory = (db, id) => doc(db, root + '/wishlistDirectory', id);
  const grant = (db, recipient) => doc(db, root + '/wishlistGrants', owner + '~' + recipient);
  const walletGift = projectedList('Lista aprovada', { gift: wish('gift') });
  await assertSucceeds(setDoc(accountDoc(guest, uid), pending(email)));
  await assertFails(getDocs(collection(guest, root + '/wishlistDirectory')));
  await assertSucceeds(setDoc(listDoc(admin, person), projectedList('Wallet', { hidden: wish('hidden') })));
  await assertSucceeds(setDoc(giftDoc(admin, person), walletGift));
  await assertSucceeds(updateDoc(accountDoc(admin, uid), { status: 'approved', personId: person }));
  for (const [id, name, accountId] of [[owner, 'Bruna', uid], ['primary-luana', 'Luana', ''], ['wallet-admin', 'Gabriel', '']]) {
    await assertSucceeds(setDoc(directory(admin, id), { name, accountId, active: true }));
  }
  await assertSucceeds(getDocs(collection(guest, root + '/wishlistDirectory')));
  await assertFails(getDocs(collection(guest, root + '/wishlistAccounts')));
  await assertFails(getDoc(listDoc(guest, person)));
  assert.deepEqual((await assertSucceeds(getDoc(giftDoc(guest, person)))).data().items, walletGift.items);
  await assertFails(updateDoc(giftDoc(guest, person), { 'items.gift.bought': true, editedId: 'gift' }));
  await assertSucceeds(setDoc(personalDoc(guest, owner), { items: { one: wish('one') }, editedId: 'one' }));
  await assertFails(getDoc(personalDoc(luana, owner)));
  await assertFails(getDoc(personalDoc(admin, owner)));
  await assertFails(setDoc(grant(luana, 'primary-luana'), { owner, recipient: 'primary-luana' }));
  await assertSucceeds(setDoc(grant(guest, 'primary-luana'), { owner, recipient: 'primary-luana' }));
  const { query, where } = require('firebase/firestore');
  const received = await assertSucceeds(getDocs(query(collection(luana, root + '/wishlistGrants'), where('recipient', '==', 'primary-luana'))));
  assert.equal(received.size, 1);
  await assertSucceeds(getDoc(personalDoc(luana, owner)));
  await assertFails(getDoc(personalDoc(admin, owner)));
  await assertFails(getDoc(personalDoc(visitor, owner)));
  await assertFails(updateDoc(personalDoc(luana, owner), { 'items.one.bought': true, editedId: 'one' }));
  await assertFails(updateDoc(personalDoc(guest, owner), { 'items.one.bought': true, 'items.one.title': 'Alteração junto', editedId: 'one' }));
  await assertSucceeds(updateDoc(personalDoc(guest, owner), { 'items.one.bought': true, editedId: 'one' }));
  assert.equal((await getDoc(personalDoc(luana, owner))).data().items.one.bought, true);
  await assertFails(updateDoc(personalDoc(luana, owner), { 'items.one.bought': false, editedId: 'one' }));
  await assertFails(deleteDoc(grant(luana, 'primary-luana')));
  await assertSucceeds(deleteDoc(grant(guest, 'primary-luana')));
  await assertFails(getDoc(personalDoc(luana, owner)));
  const link = doc(visitor, 'wishlistShares', '5c82c026-a04d-46dc-a6fc-cc60d3d9a6e9');
  await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), link.path), walletGift));
  await assertFails(getDoc(link));
});
