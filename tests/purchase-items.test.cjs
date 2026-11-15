const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  P = require('../js/purchase-items.js'),
  F = require('../js/finance.js');
test('snapshot preserves IDs quantities prices and original CAD', () => {
  const group = { person: 'Luana', amounts: [45990], wishes: [{ id: 'w', title: 'Product', store: 'Test', currency: 'CAD', originalPrice: 100, quantity: 1, taxQuebec: true }] };
  const items = P.snapshot([group]);
  assert.equal(items[0].wishId, 'w');
  assert.equal(items[0].amount, 45990);
  assert.equal(items[0].cadAmount, 11498);
});
test('legacy totals stay one record until manually detailed', () => {
  const entry = { id: 'old', description: 'Shein', amount: 60000, currency: 'BRL' };
  const copy = JSON.stringify(entry),
    items = P.read(entry, [], F);
  assert.equal(items.length, 1);
  assert.equal(items[0].amount, 60000);
  assert.equal(JSON.stringify(entry), copy);
  assert.equal(items[0].wishId, undefined);
});
test('reject inconsistent product totals and retain originals in audit', () => {
  const state = F.update(F.empty(), { type: 'add', entry: { id: 'p', category: 'Lista de Compras', date: '', amount: 60000, currency: 'BRL', description: 'Shein', status: 'paid' } });
  const parts = P.read(state.entries[0], [], F);
  assert.throws(() => F.update(state, { type: 'edit', id: 'p', patch: { purchaseItems: [{ ...parts[0], amount: 1 }] } }));
});
