const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  A = require('../js/acceleration.js');
const start = 100000,
  hour = 3600000;
const effect = (amount = 6 * hour, duration = 60000) => ({ id: 'boost', perSecondMs: amount / (duration / 1000), budgetLeftMs: amount, startedAt: start, endsAt: start + duration, lastAppliedAt: start, source: 'REDUZIR_BLOQUEIO_6H' });
test('20 Hz sampling matches one catch-up exactly and spends the complete budget including final slice', () => {
  const blocks = [{ nome: 'serviço', expiraEm: start + 10 * hour }],
    boosts = [effect()];
  let live = { blocks, boosts };
  for (let t = start + 50; t <= start + 60000; t += 50) live = A.advance(live.blocks, live.boosts, t);
  const once = A.advance(blocks, boosts, start + 60000);
  assert.equal(live.blocks[0].expiraEm, start + 4 * hour);
  assert.deepEqual(live, { ...once, reduction: live.reduction });
  assert.equal(once.reduction, 6 * hour);
  assert.equal(live.boosts.length, 0);
  assert.equal(boosts[0].budgetLeftMs, 6 * hour);
});
test('overlapping reducers add their budgets, respect exemptions and never apply again after completion', () => {
  const blocks = [
    { nome: 'serviço', expiraEm: start + 20 * hour },
    { nome: 'REDUZIR_BLOQUEIO_6H', expiraEm: start + hour },
    { nome: 'ACELERAR_GLOBAL_4D_1H', expiraEm: start + hour },
  ];
  const result = A.advance(blocks, [effect(), { ...effect(12 * hour), id: 'second' }], start + 120000);
  assert.equal(result.blocks[0].expiraEm, start + 2 * hour);
  assert.deepEqual(result.blocks.slice(1), blocks.slice(1));
  assert.equal(result.boosts.length, 0);
  assert.deepEqual(A.advance(result.blocks, result.boosts, start + 120000).blocks, result.blocks);
});
test('persisted checkpoints resume proportionally and catch up after tab suspension or closed browser', () => {
  const first = A.advance([{ nome: 'serviço', expiraEm: start + 10 * hour }], [effect()], start + 15000);
  assert.equal(first.reduction, 1.5 * hour);
  const restored = JSON.parse(JSON.stringify(first));
  const final = A.advance(restored.blocks, restored.boosts, start + 120000);
  assert.equal(final.blocks[0].expiraEm, start + 4 * hour);
  assert.equal(final.boosts.length, 0);
});
test('legacy budgets migrate without replaying already applied time, including effects that ended offline', () => {
  const old = { ...effect(), budgetLeftMs: 3 * hour };
  delete old.lastAppliedAt;
  const result = A.advance([{ nome: 'serviço', expiraEm: start + 7 * hour }], [old], start + 90000);
  assert.equal(result.reduction, 3 * hour);
  assert.equal(result.blocks[0].expiraEm, start + 4 * hour);
});
test('earliest records without budget preserve the remaining duration without retroactive guesses', () => {
  const old = { ...effect() };
  delete old.budgetLeftMs;
  delete old.lastAppliedAt;
  const first = A.advance([{ nome: 'serviço', expiraEm: start + 10 * hour }], [old], start + 30000);
  assert.equal(first.reduction, 0);
  assert.equal(first.boosts[0].budgetLeftMs, 3 * hour);
  const end = A.advance(first.blocks, first.boosts, start + 60000);
  assert.equal(end.reduction, 3 * hour);
});
test('expired and fully accelerated tasks disappear without negative times; moving clock backward gives no extra budget', () => {
  const blocks = [
    { nome: 'serviço', expiraEm: start + hour },
    { nome: 'antigo', expiraEm: start - 1 },
  ];
  assert.equal(A.advance(blocks, [effect()], start + 60000).blocks.length, 0);
  const before = A.advance(blocks, [effect()], start - 5000);
  assert.equal(before.reduction, 0);
  assert.equal(before.boosts[0].budgetLeftMs, 6 * hour);
  assert.throws(() => A.advance(blocks, [{ ...effect(), lastAppliedAt: NaN }], start), /Checkpoint/);
});
