const { test } = require('node:test'),
  assert = require('node:assert/strict');
const F = require('../js/finance.js'),
  P = require('../js/finance-people.js');
const e = (patch) => ({ id: 'test', date: '2026-11-14', category: F.categories[7], description: 'Lista Shein', store: 'Shein', amount: 60000, currency: 'BRL', status: 'paid', ...patch });
test('default Luana and the Nathalia location exception', () => {
  assert.deepEqual(P.allocation(e()), [{ person: 'Luana', amount: 60000 }]);
  assert.deepEqual(P.allocation(e({ category: F.categories[1], description: 'Buscar na casa da Nathalia' })), [{ person: 'Luana', amount: 60000 }]);
});
test('food split equally; rounding conserves every cent', () => {
  assert.deepEqual(P.allocation(e({ category: F.categories[2], amount: 20000 })), [
    { person: 'Luana', amount: 10000 },
    { person: 'Mel', amount: 10000 },
  ]);
  assert.deepEqual(P.allocation(e({ category: F.categories[3], amount: 16495 })), [
    { person: 'Luana', amount: 8248 },
    { person: 'Adriana', amount: 8247 },
  ]);
});
test('whole names and roster names are recognized, not fragments', () => {
  assert.deepEqual(P.allocation(e({ description: 'presente para Roberta' }), [{ name: 'Roberta' }]), [{ person: 'Roberta', amount: 60000 }]);
  assert.deepEqual(P.allocation(e({ description: 'Caramelo' })), [{ person: 'Luana', amount: 60000 }]);
  assert.deepEqual(P.allocation(e({ description: 'Para Nathalia' })), [{ person: 'Natália', amount: 60000 }]);
});
test('wishlist exact person subtotals beat names in product titles', () => {
  const item = e({ source: 'wishlist', note: 'Dominadora · R$ 400,00\n• Produto da Mel · Loja: Pandora · R$ 400,00\nBruna · R$ 200,00\n• Produto · Loja: Shein · R$ 200,00' });
  assert.deepEqual(P.allocation(item), [
    { person: 'Luana', amount: 40000 },
    { person: 'Bruna', amount: 20000 },
  ]);
});
test('manual allocation overrides inference; remainder goes to Luana without mutation', () => {
  const item = e({ description: 'Compra Bruna', personAllocations: [{ person: 'Bruna', amount: 10000 }] });
  const before = structuredClone(item);
  assert.deepEqual(P.allocation(item), [
    { person: 'Bruna', amount: 10000 },
    { person: 'Luana', amount: 50000 },
  ]);
  assert.deepEqual(item, before);
  assert.deepEqual(P.allocation(e({ personAllocations: [] })), [{ person: 'Luana', amount: 60000 }]);
});
test('reject invalid allocations and preserve metadata in edits and backup', () => {
  for (const personAllocations of [[{ person: 'Bruna', amount: 60001 }], [{ person: '', amount: 10 }], [{ person: 'Bruna', amount: -1 }], [{ person: 'Bruna', amount: 1.2 }]]) assert.throws(() => F.validate(e({ personAllocations })));
  let state = F.empty();
  state = F.update(state, { type: 'add', entry: e() });
  state = F.update(state, { type: 'edit', id: 'test', patch: { personAllocations: [{ person: 'Bruna', amount: 10000 }] } });
  assert.equal(F.validateState(JSON.parse(JSON.stringify(state))).entries[0].personAllocations[0].amount, 10000);
  assert.equal(state.audit[0].before.amount, state.audit[0].after.amount);
});
test('sum of people equals existing total; cancelled/refunded and foreign excluded', () => {
  const entries = [e(), e({ amount: 10001, category: F.categories[2] }), e({ amount: 20000, status: 'refunded' }), e({ amount: 20000, status: 'cancelled' }), e({ amount: 10000, currency: 'USD' })];
  assert.equal(
    P.totals(entries).reduce((s, p) => s + p.amount, 0),
    F.totals(entries).total,
  );
});
