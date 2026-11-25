const { test } = require('node:test'),
  assert = require('node:assert/strict');
const F = require('../js/finance.js'),
  R = require('../js/receipt.js');
const entry = (patch = {}) => ({ id: crypto.randomUUID(), category: F.categories[7], description: 'Loja Aurora (1)', store: 'Loja Aurora', date: '2026-01-15', amount: 1234, currency: 'BRL', status: 'paid', ...patch });
test('integer Brazilian amounts, USD, invalid and overflow', () => {
  assert.equal(F.cents('R$ 1.198,52'), 119852);
  assert.equal(F.cents('$50.25', 'USD'), 5025);
  assert.equal(F.cents('20,5'), 2050);
  assert.equal(F.cents('511.22'), 51122);
  assert.equal(F.cents('0.99'), 99);
  assert.equal(F.cents('1.234'), 123400);
  assert.equal(F.cents('511,22'), 51122);
  for (const n of ['1,234', 'NaN', '-', '1.2.00']) assert.throws(() => F.cents(n));
  assert.throws(() => F.cents('99999999999999999999999'));
});
test('all category subtotals sum exactly, foreign/voided excluded, negative budget', () => {
  const entries = F.categories.flatMap((category, i) => [entry({ category, amount: 1001 + i }), entry({ category, amount: 2002 + i, status: 'pending' })]);
  entries.push(entry({ currency: 'USD', amount: 5000 }), entry({ status: 'cancelled', amount: 9000 }), entry({ status: 'refunded', amount: 9000 }));
  const t = F.totals(entries, 100);
  F.categories.forEach((category, i) => assert.equal(t.byCategory[category], 3003 + 2 * i));
  assert.equal(
    t.total,
    Object.values(t.byCategory).reduce((a, b) => a + b),
  );
  assert.equal(t.foreign.USD, 5000);
  assert.equal(t.remaining, 100 - t.total);
  assert.equal(t.pendingCount, 0);
  assert.equal(t.paid, t.total);
});
test('CRUD, paid/pending/refund transitions, corrections and filters', () => {
  let s = F.empty(),
    e = entry();
  s = F.update(s, { type: 'add', entry: e });
  assert.equal(F.totals(s.entries).paid, 1234);
  s = F.update(s, { type: 'edit', id: e.id, patch: { status: 'pending', amount: 1400 } });
  assert.equal(F.totals(s.entries).paid, 1400);
  assert.equal(s.entries[0].status, 'paid');
  assert.equal(F.filtered(s.entries, { store: 'aurora', from: '2026-01-01', to: '2026-01-31' }).length, 1);
  assert.equal(F.filtered(s.entries, { status: 'paid' }).length, 1);
  s = F.update(s, { type: 'edit', id: e.id, patch: { status: 'refunded' } });
  assert.equal(F.totals(s.entries).total, 0);
  s = F.update(s, { type: 'delete', id: e.id });
  assert.equal(s.entries.length, 0);
  assert.equal(s.audit.length, 3);
  assert.throws(() => F.update(s, { type: 'add', entry: entry({ amount: 1.5 }) }));
  assert.throws(() => F.validate(entry({ date: '2026-02-30' })));
  assert.doesNotThrow(() => F.validate(entry({ date: '' })));
});
const list = `1. Jogo de Buraco\n✅ Jogos R$ 10,25 + R$ 15,50 + 2,25\nSubtotal R$ 99,00\n2. Lista de Compras\n✅ Shein (1): R$ 45,10\n❌ Shein (2): R$ 67,20\n✅ Loja Aurora: $50 dólares = R$ 210,00\n❌ Loja Lunar: US$ 10.00\nTotal geral: R$ 999,00`;
test('WhatsApp sections, games on one line, numbered stores, equivalence, wrong subtotals', () => {
  const p = F.preview(list, [], '2026-01-15');
  assert.equal(p.rows.length, 7);
  assert.equal(p.totals.byCategory[F.categories[0]], 2800);
  assert.equal(p.totals.total, 35030);
  assert.equal(p.totals.foreign.USD, 1000);
  assert.equal(p.rows.find((r) => r.entry.store === 'Loja Aurora').entry.originalMoney.length, 2);
  assert.ok(p.warnings.some((w) => w.includes('subtotal informado')));
  const s = F.commitPreview(F.empty(), p);
  assert.equal(s.entries.length, 7);
  const repeated = F.preview(list, s.entries, '2026-01-15');
  assert.ok(repeated.rows.every((r) => r.disposition === 'duplicate'));
  assert.equal(F.commitPreview(s, repeated).entries.length, 7);
});
test('import status/amount changes become conflicts and never silently overwrite', () => {
  const s = F.commitPreview(F.empty(), F.preview(list, [], '2026-01-15'));
  const changed = F.preview(list.replace('✅ Shein (1): R$ 45,10', '❌ Shein (1): R$ 99,20'), s.entries, '2026-01-15');
  assert.equal(changed.rows.find((r) => r.entry.description === 'Shein (1)').disposition, 'conflict');
  assert.equal(F.commitPreview(s, changed).entries.length, s.entries.length);
  assert.equal(s.entries.find((e) => e.description === 'Shein (1)').amount, 4510);
});
test('unprefixed amounts separated by spaces are all recognized', () => {
  const p = F.preview('1. Perfil\n✅ Jogos 10,00 20,00 30,00', [], '2026-01-15');
  assert.equal(p.rows.length, 3);
  assert.equal(p.totals.total, 6000);
});
test('import keeps explicit dates, supports unknown dates and voided states', () => {
  const p = F.preview('1. Lista de Compras\n✅ Loja Aurora 15/01/2026 R$ 12,34\n❌ Loja Lunar cancelado R$ 90,00', [], '');
  assert.equal(p.rows[0].entry.date, '2026-01-15');
  assert.equal(p.rows[1].entry.date, '');
  assert.equal(p.rows[1].entry.status, 'cancelled');
  assert.equal(p.totals.total, 1234);
});
test('same store different amounts and numbering; duplicates need more than store/value', () => {
  const entries = [entry({ description: 'Loja Aurora (12)' }), entry({ description: 'Loja Aurora (13)', amount: 999 }), entry({ date: '2026-01-16' })];
  assert.equal(F.nextStoreLabel(entries, 'Loja Aurora'), 'Loja Aurora (14)');
  assert.equal(F.duplicates(entries, entry()).length, 1);
  assert.equal(F.duplicates(entries, entry({ date: '2026-01-17' })).length, 0);
});
test('receipt chooses final paid amount, not subtotal, freight or installment', () => {
  const result = R.suggest('SHEIN\nData: 15/01/2026\nSubtotal R$ 100,00\nFrete R$ 10,00\nDesconto R$ 20,00\nTotal pago R$ 90,00\n3 parcelas de R$ 30,00', [], 95);
  assert.equal(result.entry.amount, 9000);
  assert.equal(result.entry.store, 'Shein');
  assert.equal(result.entry.date, '2026-01-15');
  assert.equal(result.entry.description, 'Shein (1)');
  assert.equal(result.ambiguous, false);
  const usd = R.suggest('Loja Lunar\nTotal pago US$ 35.50');
  assert.equal(usd.entry.currency, 'USD');
  assert.equal(usd.entry.amount, 3550);
});
test('receipt missing/ambiguous fields remain uncertain and duplicate is only suggestion', () => {
  const result = R.suggest('Total R$ 20,00\nTotal R$ 25,00', [], 40);
  assert.ok(result.ambiguous);
  assert.equal(result.entry.date, '');
  assert.ok(result.warnings.some((w) => w.includes('baixa confiança')));
  assert.equal(R.suggest('texto sem valores').entry.amount, 0);
  const recognized = R.suggest('Loja Aurora\n15/01/2026\nTotal pago R$ 12,34', [entry()]);
  assert.equal(recognized.possibleDuplicates.length, 1);
});
test('backup finance validation rejects malformed state', () => {
  assert.doesNotThrow(() => F.validateState(F.empty()));
  assert.throws(() => F.validateState({ ...F.empty(), entries: [entry({ amount: Infinity })] }));
});
test('legacy pending notes and imported crosses count as spent without deleting anything', () => {
  const legacy = entry({ status: 'pending', amount: 1234 });
  assert.equal(F.totals([legacy]).paid, 1234);
  assert.equal(legacy.status, 'pending');
  const p = F.preview('1. Lista de Compras\n• Produto fictício ❌: R$ 25,00\n• Outro produto: R$ 15,00', [], '');
  assert.equal(p.rows.length, 2);
  assert.ok(p.rows.every((row) => row.entry.status === 'paid'));
  assert.equal(p.totals.paid, 4000);
  assert.ok(!p.warnings.some((w) => w.includes('pendente')));
});
test('bulk deletion is atomic, audits each item once and protects linked records', () => {
  let state = F.empty();
  const a = entry(),
    b = entry({ amount: 2000 }),
    linked = entry({ redemptionId: 'legacy' });
  for (const e of [a, b, linked]) state = F.update(state, { type: 'add', entry: e });
  assert.throws(() => F.update(state, { type: 'deleteMany', ids: [a.id, 'missing'] }));
  assert.throws(() => F.update(state, { type: 'deleteMany', ids: [a.id, linked.id] }));
  assert.equal(state.entries.length, 3);
  const next = F.update(state, { type: 'deleteMany', ids: [a.id, a.id, b.id] });
  assert.equal(next.entries.length, 1);
  assert.equal(next.entries[0].id, linked.id);
  assert.equal(next.audit.length, 2);
  assert.equal(next.audit[0].batchId, next.audit[1].batchId);
  assert.equal(next.revision, state.revision + 1);
});
test('list summaries never duplicate details; a subtotal-only category becomes a reviewable note', () => {
  const text = `1. Jogo de Buraco\n• Pago R$ 21,50\nTotal: R$ 21,50\n2. Buscar na Casa da Nathalia\n• Espera combinada por minuto, sem valor individual.\nTotal: R$ 30,00\n3. Match Masters\n• R$ 40,00 + 2,50\n• 3,25 = R$ 45,75\n9. Resumo Final dos Itens\n1. Buraco R$ 21,50\n2. Casa Nathalia R$ 30,00\n3. Match Masters R$ 45,75\nTotal geral R$ 97,25`;
  const p = F.preview(text, [], '');
  assert.equal(p.rows.length, 5);
  assert.equal(p.totals.total, 9725);
  assert.equal(p.totals.byCategory[F.categories[5]], 4575);
  const note = p.rows.find((r) => r.entry.category === F.categories[1]);
  assert.equal(note.entry.amount, 3000);
  assert.match(note.entry.note, /Espera combinada/);
  assert.ok(p.warnings.some((w) => w.includes('sem valores detalhados')));
  assert.ok(!p.warnings.some((w) => w.includes('subtotal informado')));
  const saved = F.commitPreview(F.empty(), p);
  assert.equal(F.commitPreview(saved, F.preview(text, saved.entries, '')).entries.length, 5);
});
test('USD quantities remain foreign and original unit values are retained', () => {
  const p = F.preview('1. Lista de Compras\n• Item fictício ❌: $12,50 x3\n• Loja Aurora ✅: R$ 14,90', [], '');
  assert.equal(p.totals.total, 1490);
  assert.equal(p.totals.foreign.USD, 3750);
  assert.equal(p.rows[0].entry.originalMoney[0].amount, 1250);
  assert.equal(p.rows[0].entry.quantity, 3);
});
test('store numbering continues from imported list labels for a receipt', () => {
  const p = F.preview('1. Lista de Compras\n• Lista Shein (7) ✅: R$ 18,00\n• Lista Shein (9) ✅: R$ 22,00', [], '');
  const entries = F.commitPreview(F.empty(), p).entries;
  assert.equal(F.nextStoreLabel(entries, 'Shein'), 'Shein (10)');
});

test('moving rows preserves values and IDs, recalculates categories and audits safely', () => {
  let s = F.empty();
  for (const [id, category, amount] of [
    ['a', F.categories[0], 1000],
    ['b', F.categories[0], 2000],
    ['c', F.categories[7], 500],
  ])
    s = F.update(s, { type: 'add', entry: { id, category, amount, currency: 'BRL', status: 'paid', date: '', description: id } });
  s = F.update(s, { type: 'move', ids: ['a'], category: F.categories[7], beforeId: 'c' });
  assert.deepEqual(
    s.entries.map((e) => e.id),
    ['b', 'a', 'c'],
  );
  assert.equal(F.totals(s.entries).byCategory[F.categories[0]], 2000);
  assert.equal(F.totals(s.entries).byCategory[F.categories[7]], 1500);
  assert.equal(F.totals(s.entries).total, 3500);
  assert.equal(s.audit.at(-1).type, 'move');
  assert.throws(() => F.update(s, { type: 'move', ids: ['missing'], category: F.categories[7] }));
  const protectedState = structuredClone(s);
  protectedState.entries[0].redemptionId = 'legacy';
  assert.throws(() => F.update(protectedState, { type: 'move', ids: ['b'], category: F.categories[7] }));
});

test('receipts retain explicit USD and interpret the Canadian price and unqualified dollar symbol as CAD', () => {
  const Receipt = require('../js/receipt.js');
  for (const total of ['CA$ 12,34', 'CAD 12.34', '$12.34']) {
    const { entry } = Receipt.suggest('Loja Boreal\nTotal pago ' + total);
    assert.equal(entry.currency, 'CAD');
    assert.equal(entry.amount, 1234);
  }
  assert.equal(Receipt.suggest('Loja Boreal\nTotal pago US$12.34').entry.currency, 'USD');
});
