const Finance = require('../js/finance.js');
const project = 'demo-wallet-access';
const authOrigin = 'http://127.0.0.1:9099';
const firestoreOrigin = 'http://127.0.0.1:8089';
const admin = { email: 'admin@teste.com.br', sub: 'dev-wallet-admin' };
const guest = { email: 'teste@teste.com.br', sub: 'dev-wallet-guest' };
const luana = { email: 'luana@teste.com.br', sub: 'dev-wallet-luana' };
const recipients = [
  ['bruna', 'Bruna'], ['tati', 'Tati'], ['thayanne', 'Thayanne'],
  ['nathalia', 'Nathália'], ['natalia', 'Natália'],
];
const personId = 'dev-test-person';
const item = { id: 'dev-test-wish', title: 'Presente de teste', store: 'Loja de teste', originalPrice: 25, currency: 'CAD', quantity: 1, taxQuebec: false, bought: false };

function firestoreValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return { mapValue: { fields: firestoreFields(value) } };
}

function firestoreFields(object) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, firestoreValue(value)]));
}

async function mockGoogle({ email, sub }) {
  const postBody = new URLSearchParams({ providerId: 'google.com', id_token: JSON.stringify({ sub, email, email_verified: true }) }).toString();
  const response = await fetch(authOrigin + '/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-wallet-access-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postBody, requestUri: authOrigin, returnSecureToken: true }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok || !data.localId) throw Error('Falha ao criar conta de teste no Auth Emulator: ' + (data.error?.message || response.status));
  return data.localId;
}

async function seedDocument(path, document) {
  const root = firestoreOrigin + '/v1/projects/' + project + '/databases/(default)/documents/';
  const url = new URL(root + path);
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const existing = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (existing.ok) return;
  if (existing.status !== 404) throw Error('Falha ao consultar os dados de teste: ' + existing.status);
  url.searchParams.set('currentDocument.exists', 'false');
  const response = await fetch(url, { method: 'PATCH', headers,
    body: JSON.stringify({ fields: firestoreFields(document) }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('Falha ao salvar os dados de teste: ' + response.status);
}

async function updateFixtureField(path, field, update) {
  const url = new URL(firestoreOrigin + '/v1/projects/' + project + '/databases/(default)/documents/' + path);
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('Falha ao consultar fixture: ' + response.status);
  const document = await response.json();
  const fields = update(document.fields);
  if (!fields) return;
  const commit = firestoreOrigin + '/v1/projects/' + project + '/databases/(default)/documents:commit';
  const write = { update: { name: document.name, fields: firestoreFields(fields) },
    updateMask: { fieldPaths: [field] }, currentDocument: { updateTime: document.updateTime } };
  const patched = await fetch(commit, { method: 'POST', headers,
    body: JSON.stringify({ writes: [write] }), signal: AbortSignal.timeout(10000) });
  if (!patched.ok) throw Error('Falha ao atualizar fixture: ' + patched.status);
}

async function seed() {
  if (process.env.GCLOUD_PROJECT !== project || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089' ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') {
    throw Error('Abra este ambiente com npm run dev:access para usar somente os emuladores de teste.');
  }
  const [, uid] = await Promise.all([mockGoogle(admin), mockGoogle(guest), mockGoogle(luana)]);
  const root = 'usuarios/gabriel-local';
  const simulator = {
    saldoDominadora: '1000', bonusEspecialAtivo: 'false',
    wishlistPeople: JSON.stringify([{ id: personId, name: 'Convidada de teste' }]),
    wishlist: JSON.stringify([{ ...item, personId, person: 'Convidada de teste' }]),
  };
  await seedDocument(root, {
    saldoDominadora: 1000, bonusEspecialAtivo: false,
    walletAtualV4: { schema: 3, revision: 1, controller: '', leaseUntil: 0, simulator, financeJson: JSON.stringify(Finance.empty()), financeImportOpen: false },
  });
  await seedDocument(root + '/config/acesso', { emails: [admin.email], adminEmail: admin.email, securityVersion: 'google-private-v1' });
  await seedDocument(root + '/wishlistLists/' + personId, { name: 'Convidada de teste', items: { [item.id]: item }, walletRevision: 0, editedId: '' });
  await seedDocument(root + '/wishlistAccounts/' + uid, { email: guest.email, personId, status: 'approved', role: 'guest', canManagePurchased: false });
  await seedDocument(root + '/wishlistAccounts/dev-pending', { email: 'pendente@teste.com.br', personId: '', status: 'pending', role: 'guest', canManagePurchased: false });
  await seedDocument(root + '/wishlistDirectory/wallet-admin', { name: 'Gabriel', accountId: '', active: true });
  await seedDocument(root + '/wishlistDirectory/account-' + uid, { name: 'Convidada de teste', accountId: uid, active: true });
  const personal = { ...item, id: 'dev-personal-wish', title: 'Desejo pessoal de teste' };
  await seedDocument(root + '/wishlistPersonal/account-' + uid, { items: { [personal.id]: personal }, editedId: personal.id });
  await seedDocument(root + '/wishlistGifts/' + personId, { name: 'Convidada de teste', items: { [item.id]: item }, walletRevision: 0, editedId: '' });

  await updateFixtureField(root + '/config/acesso', 'emails', fields => {
    if (fields.adminEmail?.stringValue !== admin.email) throw Error('Configuração de teste inesperada.');
    const emails = fields.emails.arrayValue.values.map(value => value.stringValue);
    return emails.includes(luana.email) ? null : { emails: [...emails, luana.email] };
  });
  await seedDocument(root + '/wishlistDirectory/primary-luana', { name: 'Luana', accountId: '', active: true });
  const people = recipients.map(([id, name]) => ({ id: 'dev-person-' + id, name }));
  await updateFixtureField(root, 'walletAtualV4.simulator.wishlistPeople', fields => {
    const data = fields.walletAtualV4.mapValue.fields.simulator.mapValue.fields;
    const current = JSON.parse(data.wishlistPeople?.stringValue || '[]');
    const additions = people.filter(person => !current.some(saved => saved.id === person.id));
    return additions.length ? { walletAtualV4: { simulator: { wishlistPeople: JSON.stringify([...current, ...additions]) } } } : null;
  });
  for (const [id, name] of recipients) {
    const email = id + '@teste.com.br';
    const accountId = await mockGoogle({ email, sub: 'dev-wallet-' + id });
    const linked = 'dev-person-' + id;
    await seedDocument(root + '/wishlistLists/' + linked, { name, items: {}, walletRevision: 0, editedId: '' });
    await seedDocument(root + '/wishlistAccounts/' + accountId, {
      email, personId: linked, status: 'approved', role: 'guest', canManagePurchased: false,
    });
    await seedDocument(root + '/wishlistDirectory/account-' + accountId, { name, accountId, active: true });
  }
}

module.exports = { seed };