const test = require('node:test');
const assert = require('node:assert/strict');
const { people, project, changes, active, ready, overlay, field, version } = require('../js/wishlist-access-model.js');

function simulator(roster, wishlist, extra = {}) {
  return { wishlistPeople: JSON.stringify(roster), wishlist: JSON.stringify(wishlist), ...extra };
}

test('guest lists use registered IDs and share only wishlist display fields', () => {
  const roster = [{ id: 'ana-01', name: 'Ána' }, { id: 'bia-02', name: 'Bia' }, { id: 'owner', name: 'Luana' }];
  const wishes = [
    { id: 'a', personId: 'ana-01', person: 'Outra pessoa', title: ' Sabonete ', store: 'Loja', originalPrice: 21.4, currency: 'CAD', quantity: 2, taxQuebec: true, bought: true, imageUrl: 'data:image/jpeg;base64,PII', purchaseNoteId: 'private', url: 'https://example.invalid/account/orders?key=secret', privateNotes: 'confidential' },
    { id: 'b', person: '  ÁNA ', title: 'Creme', price: 10 },
    { id: 'c', personId: 'outdated-id', person: 'Ána', title: 'Desconhecido' },
    { id: 'd', personId: 'bia-02', title: 'Vela' },
    { id: 'e', personId: 'owner', title: 'Item de Luana' },
    { id: 'f', person: 'Dominadora', title: 'Item sem destinatário' },
  ];
  const source = simulator(roster, wishes, { saldoDominadora: '980' });
  assert.deepEqual(people(source), [{ id: 'ana-01', name: 'Ána' }, { id: 'bia-02', name: 'Bia' }]);
  assert.deepEqual(project(source, 'ana-01', 42), { name: 'Ána', walletRevision: 42, editedId: '', items: {
    a: { id: 'a', title: 'Sabonete', store: 'Loja', originalPrice: 21.4, currency: 'CAD', quantity: 2, taxQuebec: true, bought: true },
    b: { id: 'b', title: 'Creme', store: '', originalPrice: 10, currency: 'BRL', quantity: 1, taxQuebec: false, bought: false },
  } });
  assert.equal(project(source, 'owner'), null);
  assert.equal(project(source, 'outdated-id'), null);
  assert.equal(project(source, '../../config/acesso'), null);
  assert.equal(project(null, 'ana-01'), null);
});

test('ambiguous old names and duplicate IDs grant no fallback access', () => {
  const source = simulator([
    { id: 'ana-one', name: 'Ana Rosa' }, { id: 'ana-two', name: 'ANA  ROSA' },
    { id: 'dup', name: 'Bia' }, { id: 'dup', name: 'Clara' },
  ], [
    { id: 'p1', person: 'Ana Rosa', title: 'Possibly the wrong person' },
    { id: 'p2', personId: 'ana-two', title: 'Explicitly linked' },
  ]);
  assert.deepEqual(project(source, 'ana-one'), { name: 'Ana Rosa', walletRevision: 0, editedId: '', items: {} });
  assert.deepEqual(Object.keys(project(source, 'ana-two').items), ['p2']);
  assert.equal(project(source, 'dup'), null);
});

test('reassignment clears the old list, creates the new one and ignores private or unrelated changes', () => {
  const a = { id: 'a', name: 'Amanda' }, b = { id: 'b', name: 'Beatriz' };
  const wish = { id: 'w1', title: 'Chaveiro', personId: 'a' };
  const before = simulator([a, b], [wish]);
  assert.deepEqual(changes(before, { ...before, timerSession: 'changed' }), []);
  assert.deepEqual(changes(before, simulator([a, b], [{ ...wish, purchaseNoteId: 'private' }])), []);
  const after = simulator([a, b], [{ ...wish, personId: 'b' }]);
  const updated = changes(before, after);
  assert.deepEqual(updated.map(entry => entry.id), ['a', 'b']);
  assert.deepEqual(updated[0].data.items, {});
  assert.deepEqual(Object.keys(updated[1].data.items), ['w1']);
  assert.deepEqual(changes(after, simulator([a], [])), [{ id: 'b', data: null }]);
  assert.equal(changes(before, simulator([{ ...a, name: 'Amanda Rosa' }, b], [wish]))[0].data.name, 'Amanda Rosa');
  assert.equal(active({ adminEmail: 'owner@example.invalid', emails: ['owner@example.invalid'] }), true);
  assert.equal(active({ adminEmail: 'outsider@example.invalid', emails: ['owner@example.invalid'] }), false);
});

test('overlay accepts only revision-matched own-list edits and never rewrites finance or private purchase fields', () => {
  const roster = [{ id: 'bruna', name: 'Bruna' }, { id: 'ana', name: 'Ana' }];
  const original = [
    { id: 'private', title: 'Original', personId: 'bruna', bought: true, originalPrice: 12, url: 'https://example.invalid/private', purchaseNoteId: 'secret', imageUrl: 'private-image' },
    { id: 'removable', title: 'Tirar', personId: 'bruna' },
    { id: 'other', title: 'Outro', personId: 'ana' },
  ];
  const source = simulator(roster, original, { saldoDominadora: '1000', timerSession: '{"seconds":37}' });
  const next = project(source, 'bruna', 14);
  next.editedId = 'private';
  next.items.private = { ...next.items.private, title: 'Nome corrigido', currency: 'CAD', originalPrice: 6, bought: false };
  next.items.add = { id: 'add', title: 'Novo', store: 'Loja', bought: false };
  next.items.other = { id: 'other', title: 'ID de outra pessoa', bought: false };
  next.items.incorrect = { id: 'different-id', title: 'Não utilizar' };
  delete next.items.removable;
  const docs = new Map([['bruna', next]]);
  assert.equal(field, 'wishlistMirrorVersions');
  assert.equal(version({}, 'bruna'), 0);
  assert.equal(ready(source, docs, { bruna: 14 }), true);
  assert.equal(ready(source, docs, { bruna: 15 }), false);
  assert.equal(ready(source, new Map(), { bruna: 14 }), false);
  assert.equal(overlay(source, docs, { bruna: 13 }), source);
  const actual = overlay(source, docs, { bruna: 14 });
  const items = JSON.parse(actual.wishlist);
  assert.equal(actual.saldoDominadora, source.saldoDominadora);
  assert.equal(actual.timerSession, source.timerSession);
  assert.deepEqual(items.map(item => item.id), ['private', 'other', 'add']);
  assert.deepEqual(items[0], { ...original[0], title: 'Nome corrigido', currency: 'CAD', originalPrice: 6, price: null });
  assert.deepEqual(items[1], original[2]);
  assert.equal(items[2].personId, 'bruna');
  assert.equal(items[2].person, 'Bruna');
  assert.equal(overlay(actual, docs, { bruna: 14 }), actual);
});

test('Luana can share her wishlist without becoming a guest, and external marks have no finance link', () => {
  const source = simulator([{ id: 'bruna', name: 'Bruna' }], [
    { id: 'one', title: 'Presente', person: 'Dominadora', imageUrl: 'private-image', bought: false },
    { id: 'two', title: 'Outro perfil', personId: 'bruna', bought: false },
  ]);
  const { sharePerson } = require('../js/wishlist-access-model.js');
  const id = sharePerson(source, 'Luana');
  assert.equal(people(source).some(person => person.name === 'Luana'), false);
  const privateList = project(source, id, 3);
  assert.deepEqual(Object.keys(privateList.items), ['one']);
  assert.equal(privateList.items.one.imageUrl, undefined);
  privateList.items.one.bought = true;
  const result = JSON.parse(overlay(source, new Map([[id, privateList]]), { [id]: 3 }).wishlist);
  assert.equal(result[0].bought, true);
  assert.equal(result[0].purchaseNoteId, undefined);
  assert.equal(result[1].bought, false);
});
