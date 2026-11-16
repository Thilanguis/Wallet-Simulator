const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  F = require('../js/finance.js'),
  T = require('../js/finance-tools.js');
const entry = (id, extra = {}) => ({ id, category: F.categories[7], description: 'Compra', store: 'Shein', date: '2025-10-10', currency: 'BRL', amount: 10000, status: 'paid', ...extra });
const ledger = () => F.update(F.empty(), { type: 'add', entry: entry('a') });
test('undo edits and deletes preserves totals, audit and other ledger fields', () => {
  const before = ledger(),
    after = F.update(before, { type: 'edit', id: 'a', patch: { amount: 15000 } }),
    change = T.capture(before, after);
  const restored = T.undo(after, change).finance;
  assert.equal(restored.entries[0].amount, 10000);
  assert.equal(restored.audit.at(-1).type, 'undo');
  assert.equal(restored.revision, after.revision + 1);
  assert.equal(restored.audit.length, after.audit.length + 1);
  const deleted = F.update(before, { type: 'delete', id: 'a' });
  assert.equal(T.undo(deleted, T.capture(before, deleted)).finance.entries[0].id, 'a');
});
test('undo moves restores original order and logs it', () => {
  let before = ledger();
  before = F.update(before, { type: 'add', entry: entry('b') });
  const after = F.update(before, { type: 'move', ids: ['b'], category: F.categories[7], beforeId: 'a' });
  assert.deepEqual(
    T.undo(after, T.capture(before, after)).finance.entries.map((e) => e.id),
    ['a', 'b'],
  );
});
test('undo rejects newer financial changes and changed wishlist, restores linked wishes together', () => {
  const before = ledger(),
    after = F.update(before, { type: 'edit', id: 'a', patch: { amount: 20000 } }),
    change = T.capture(before, after, 'old wishes', 'new wishes');
  assert.throws(() => T.undo(after, change, 'different'), /desejos/);
  assert.equal(T.undo(after, change, 'new wishes').wishlist, 'old wishes');
  const remote = F.update(after, { type: 'add', entry: entry('remote') });
  assert.throws(() => T.undo(remote, change, 'new wishes'), /lista mudou/);
  assert.equal(remote.entries.length, 2);
});
test('cached CAD enrichment does not prevent undo and has no undo entry of its own', () => {
  const before = ledger(),
    after = F.update(before, { type: 'edit', id: 'a', patch: { description: 'Corrigido' } }),
    change = T.capture(before, after);
  const enriched = structuredClone(after);
  enriched.entries[0].cadReference = { amount: 2500, kind: 'original', source: 'manual', basisAmount: 10000, methodVersion: 2 };
  assert.equal(T.undo(enriched, change).finance.entries[0].description, 'Compra');
  assert.equal(T.capture(after, enriched), null);
});
test('duplicate warnings normalize stores, respect currency and exclude cancelled or undated', () => {
  const rows = [entry('a'), entry('b', { store: 'Lista Shein' }), entry('c', { date: '' }), entry('d', { status: 'refunded' }), entry('e', { currency: 'CAD' }), entry('f', { amount: 9000 })];
  assert.deepEqual(
    T.duplicateGroups(rows).map((g) => g.map((e) => e.id)),
    [['a', 'b']],
  );
  assert.equal(T.duplicateGroups([entry('a', { store: '', description: 'Comida' }), entry('b', { store: '', description: 'Buraco' })]).length, 0);
});
