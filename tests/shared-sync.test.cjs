const { test } = require('node:test'),
  assert = require('node:assert/strict');
const Merge = require('../js/shared-merge.js'),
  Shared = require('../js/shared-sync.js'),
  Cloud = require('../js/cloud-sync.js'),
  Vault = require('../js/vault.js'),
  Finance = require('../js/finance.js');
const doc = () => ({ schema: 3, revision: 1, controller: '', leaseUntil: 0, simulator: { saldoDominadora: '100', historico: '[]' }, financeJson: JSON.stringify(Finance.empty()) });
function hub(initial = doc()) {
  let state = initial,
    held = null;
  const watchers = new Set();
  const transport = {
    watch(fn) {
      watchers.add(fn);
      queueMicrotask(() => fn(structuredClone(state)));
      return () => watchers.delete(fn);
    },
    async transact(change) {
      if (held) {
        const gate = held;
        held = null;
        await gate;
      }
      state = change(structuredClone(state));
      for (const f of watchers) queueMicrotask(() => f(structuredClone(state)));
      return structuredClone(state);
    },
  };
  function device(id, options = {}) {
    const map = new Map();
    const store = Vault.wallet({ getItem: (k) => map.get(k) || null, setItem: (k, v) => map.set(k, v) }, Finance.empty(), (e) => {
      throw e;
    });
    const backups = [];
    const engine = Shared.create({ id, store, transport, validate: (w) => Finance.validateState(w.finance), backup: (w) => backups.push(w), later: () => 0, cancel: () => {}, ...options });
    engine.connect();
    return { store, engine, backups };
  }
  return {
    device,
    state: () => state,
    hold() {
      let release;
      held = new Promise((resolve) => (release = resolve));
      return release;
    },
  };
}
const turn = () => new Promise((r) => setImmediate(r));

test('concurrent wishlist edits preserve both accounts’ changes and reject competing prices', async () => {
  const initial = doc();
  const wish = { id: 'one', title: 'Teste', originalPrice: 20, price: 20, currency: 'BRL', bought: false };
  initial.simulator.wishlist = JSON.stringify([wish]);
  const h = hub(initial), a = h.device('a'), b = h.device('b');
  await turn();
  const edit = (device, fields, extra) => device.store.sim.setItem('wishlist', JSON.stringify([{ ...wish, ...fields }, { ...wish, id: extra }]));
  edit(a, { person: 'Ana', updatedAt: 1 }, 'new-a');
  edit(b, { bought: true, originalPrice: 30, price: 30, updatedAt: 2 }, 'new-b');
  await turn();
  const release = h.hold();
  const pending = a.engine.flush();
  await b.engine.flush();
  release();
  await pending;
  await turn();
  const items = JSON.parse(h.state().simulator.wishlist);
  assert.deepEqual(new Set(items.map((item) => item.id)), new Set(['one', 'new-a', 'new-b']));
  assert.deepEqual(items.find((item) => item.id === 'one'), { ...wish, person: 'Ana', bought: true, originalPrice: 30, price: 30, updatedAt: 2 });
  assert.equal(a.store.sim.getItem('wishlist'), h.state().simulator.wishlist);
  assert.equal(b.store.sim.getItem('wishlist'), h.state().simulator.wishlist);
  assert.deepEqual(JSON.parse(h.state().financeJson), JSON.parse(initial.financeJson));
  assert.equal(h.state().simulator.saldoDominadora, initial.simulator.saldoDominadora);

  const priceEdit = (price) => ({ ...initial, simulator: { ...initial.simulator, wishlist: JSON.stringify([{ ...wish, originalPrice: price, price }]) } });
  assert.throws(() => Merge.merge(initial, priceEdit(40), priceEdit(50)), /alterado/);
});

test('shared transport can finalize between checkpoints while projecting the server clock', async () => {
  const initial = doc();
  const timer = { active: true, running: true, seconds: 0, earnedUnits: 0, rate: 0.5, autoRateTotal: 0, tasks: 0, dynamicActivities: [] };
  Object.assign(initial, { controller: 'a', leaseUntil: 50000, timerCheckpointAt: 1000 });
  initial.simulator.timerSession = JSON.stringify(timer);
  let now = 1000;
  const h = hub(initial), a = h.device('a', {
    now: () => now,
    advanceTimer: (state, seconds) => ({ ...state, seconds: state.seconds + seconds, earnedUnits: state.earnedUnits + 50 * seconds }),
  });
  await turn();
  const initialBackups = a.backups.length;
  now = 6000;
  const snapshot = a.store.snapshot();
  a.store.commitBoth(snapshot.finance, { ...snapshot.simulator, saldoDominadora: '100.04', historico: JSON.stringify([{ id: 'clock-credit', tipo: 'ganho', valor: 0.04, saldoAtual: 100.04 }]), timerSession: JSON.stringify({ ...timer, active: false, running: false }) });
  await turn();
  await a.engine.flush();
  await turn();
  assert.equal(h.state().simulator.saldoDominadora, '100.04');
  assert.equal(JSON.parse(h.state().simulator.timerSession).active, false);
  assert.equal(a.backups.length, initialBackups);
  await a.engine.flush();
  assert.equal(JSON.parse(h.state().simulator.historico).length, 1);
  assert.equal(a.engine.state().pending, false);
});

test('finishing a running timer accepts elapsed checkpoints without losing or repeating its credit', () => {
  const base = doc(), local = structuredClone(base), remote = structuredClone(base);
  const timer = { active: true, running: true, seconds: 59, earnedUnits: 2950, rate: 0.5, autoRateTotal: 0, tasks: 1, eligible: true, dynamicActivities: ['example'] };
  base.simulator.timerSession = JSON.stringify(timer);
  local.simulator.timerSession = JSON.stringify({ ...timer, active: false, running: false, seconds: 0, earnedUnits: 0, tasks: 0, dynamicActivities: [], eligible: false });
  local.simulator.saldoDominadora = '100.5';
  local.simulator.historico = JSON.stringify([{ id: 'finished-clock', tipo: 'ganho', valor: 0.5, saldoAtual: 100.5 }]);
  remote.simulator.timerSession = JSON.stringify({ ...timer, seconds: 61, earnedUnits: 3055, rate: 0.55, autoRateTotal: 0.05 });
  const result = Merge.merge(base, local, remote);
  assert.equal(result.simulator.timerSession, local.simulator.timerSession);
  assert.equal(result.simulator.saldoDominadora, '100.5');
  assert.equal(JSON.parse(result.simulator.historico).length, 1);
  assert.deepEqual(Merge.merge(result, result, result), result);
  for (const edit of [{ tasks: 2 }, { running: false }, { rate: 0.75 }, { dynamicActivities: ['another'] }]) {
    remote.simulator.timerSession = JSON.stringify({ ...timer, ...edit });
    assert.throws(() => Merge.merge(base, local, remote), /alterado/);
  }
});

test('an incoming snapshot retains a local action still waiting to be sent', async () => {
  const h = hub(),
    a = h.device('a'),
    b = h.device('b');
  await turn();
  a.store.sim.setItem('saldoDominadora', '110');
  await turn();
  b.store.sim.setItem('saldoDominadora', '120');
  await turn();
  await b.engine.flush();
  await turn();
  assert.equal(a.store.sim.getItem('saldoDominadora'), '130');
  await a.engine.flush();
  await turn();
  assert.equal(h.state().simulator.saldoDominadora, '130');
});

test('actions entered while a transaction is pending are not erased by its acknowledgement', async () => {
  const h = hub(),
    a = h.device('a');
  await turn();
  a.store.sim.setItem('saldoDominadora', '110');
  await turn();
  const release = h.hold(),
    first = a.engine.flush();
  a.store.sim.setItem('saldoDominadora', '120');
  await turn();
  release();
  await first;
  await a.engine.flush();
  await turn();
  assert.equal(h.state().simulator.saldoDominadora, '120');
});

test('concurrent purchases cannot reuse the same cooldown even with equal timestamps', () => {
  const base = doc(),
    a = structuredClone(base),
    b = structuredClone(base);
  base.simulator.tarefasBloqueadas = '[]';
  a.simulator.tarefasBloqueadas = b.simulator.tarefasBloqueadas = JSON.stringify([{ nome: 'service', expiraEm: 123 }]);
  assert.throws(() => Merge.merge(base, a, b), /alterado/);
});

test('the existing contract penalty can still make the balance negative', () => {
  const base = doc(),
    local = structuredClone(base);
  local.simulator.saldoDominadora = '-20';
  local.simulator.historico = JSON.stringify([{ id: 'penalty', tipo: 'gasto', contractRule: 'creamPenalty', valor: 120, saldoAtual: -20 }]);
  assert.equal(Merge.merge(base, local, base).simulator.saldoDominadora, '-20');
});
test('both Google identities can use one ledger without acquiring or releasing a session', async () => {
  const h = hub(),
    a = h.device('a'),
    b = h.device('b');
  await turn();
  assert.ok(a.store.isWritable() && b.store.isWritable());
  a.store.sim.setItem('saldoDominadora', '110');
  a.store.sim.setItem('historico', JSON.stringify([{ id: 'a', valor: 10, tipo: 'ganho', saldoAtual: 110 }]));
  b.store.sim.setItem('saldoDominadora', '120');
  b.store.sim.setItem('historico', JSON.stringify([{ id: 'b', valor: 20, tipo: 'ganho', saldoAtual: 120 }]));
  await turn();
  await Promise.all([a.engine.flush(), b.engine.flush()]);
  await turn();
  assert.equal(h.state().simulator.saldoDominadora, '130');
  assert.equal(JSON.parse(h.state().simulator.historico).length, 2);
  assert.equal(a.store.sim.getItem('saldoDominadora'), '130');
  assert.equal(b.store.sim.getItem('saldoDominadora'), '130');
});
test('concurrent note additions retain both IDs and audit entries', () => {
  const base = doc(),
    local = structuredClone(base),
    remote = structuredClone(base);
  for (const [target, id] of [
    [local, 'a'],
    [remote, 'b'],
  ]) {
    const f = JSON.parse(target.financeJson);
    f.entries = [{ id }];
    f.audit = [{ id: 'audit-' + id }];
    target.financeJson = JSON.stringify(f);
  }
  const next = Merge.merge(base, local, remote);
  assert.deepEqual(
    JSON.parse(next.financeJson).entries.map((x) => x.id),
    ['a', 'b'],
  );
  assert.equal(JSON.parse(next.financeJson).audit.length, 2);
});
test('concurrent spending cannot overdraw the current server balance', () => {
  const base = doc(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.simulator.saldoDominadora = '20';
  remote.simulator.saldoDominadora = '50';
  assert.throws(() => Merge.merge(base, local, remote), /Saldo insuficiente/);
  assert.equal(remote.simulator.saldoDominadora, '50');
});
test('same-note conflicting edits are rejected while independent changes merge', () => {
  const base = doc(),
    local = structuredClone(base),
    remote = structuredClone(base);
  for (const [target, description] of [
    [base, 'old'],
    [local, 'mine'],
    [remote, 'theirs'],
  ]) {
    const f = JSON.parse(target.financeJson);
    f.entries = [{ id: 'x', description }];
    target.financeJson = JSON.stringify(f);
  }
  assert.throws(() => Merge.merge(base, local, remote), /alterado/);
});
test('legacy duplicate records without IDs remain present', () => {
  const rows = [
    { timestamp: 'old', descricao: 'same' },
    { timestamp: 'old', descricao: 'same' },
  ];
  assert.equal(Merge.list(rows, rows, rows).length, 2);
});
test('a companion activity changes the common rate without adding elapsed seconds twice', () => {
  const base = doc(),
    local = structuredClone(base),
    remote = structuredClone(base);
  const timer = { active: true, running: true, seconds: 10, earnedUnits: 500, rate: 0.5, tasks: 0, dynamicActivities: [] };
  base.simulator.timerSession = JSON.stringify(timer);
  local.simulator.timerSession = JSON.stringify({ ...timer, seconds: 12, rate: 0.7, tasks: 1, dynamicActivities: ['example'] });
  remote.simulator.timerSession = JSON.stringify({ ...timer, seconds: 13, earnedUnits: 650 });
  const next = JSON.parse(Merge.merge(base, local, remote, { timerOwner: false }).simulator.timerSession);
  assert.equal(next.seconds, 13);
  assert.equal(next.earnedUnits, 650);
  assert.equal(next.rate, 0.7);
  assert.equal(next.tasks, 1);
});

test('overlapping automatic clock increments are counted once while a new activity adds its own rate', () => {
  const base = doc(),
    local = structuredClone(base),
    remote = structuredClone(base);
  const timer = { active: true, running: true, seconds: 59, earnedUnits: 2950, rate: 0.5, autoRateTotal: 0, tasks: 1, dynamicActivities: ['first'] };
  base.simulator.timerSession = JSON.stringify(timer);
  local.simulator.timerSession = JSON.stringify({ ...timer, seconds: 61, rate: 0.71, autoRateTotal: 0.01, tasks: 2 });
  remote.simulator.timerSession = JSON.stringify({ ...timer, seconds: 62, rate: 0.51, autoRateTotal: 0.01, earnedUnits: 3102 });
  const next = JSON.parse(Merge.merge(base, local, remote, { timerOwner: false }).simulator.timerSession);
  assert.equal(next.seconds, 62);
  assert.equal(next.rate, 0.71);
  assert.equal(next.autoRateTotal, 0.01);
  assert.equal(next.earnedUnits, 3102);
  assert.equal(next.tasks, 2);
});

test('two devices settling the same reducer do not duplicate any elapsed reduction, including clock skew', () => {
  const Acceleration = require('../js/acceleration.js');
  const base = doc(),
    local = structuredClone(base),
    remote = structuredClone(base);
  const blocks = [{ nome: 'service', expiraEm: 7 * 86400000 }],
    boosts = [{ id: 'boost', source: 'reducer', startedAt: 0, endsAt: 60000, lastAppliedAt: 0, perSecondMs: 720000, budgetLeftMs: 43200000 }];
  for (const [target, at] of [
    [base, 15000],
    [local, 20000],
    [remote, 20001],
  ]) {
    const state = Acceleration.advance(blocks, boosts, at);
    target.simulator.tarefasBloqueadas = JSON.stringify(state.blocks);
    target.simulator.accelBoosts = JSON.stringify(state.boosts);
  }
  const next = Merge.merge(base, local, remote, { accelerationNow: 20000 });
  const final = Acceleration.advance(JSON.parse(next.simulator.tarefasBloqueadas), JSON.parse(next.simulator.accelBoosts), 61000);
  assert.equal(final.blocks[0].expiraEm, 7 * 86400000 - 43200000);
  assert.deepEqual(final.boosts, []);
});

test('distinct concurrent reducers retain both budgets even when their initial reductions are equal', () => {
  const Acceleration = require('../js/acceleration.js');
  const base = doc(),
    local = structuredClone(base),
    remote = structuredClone(base);
  const blocks = [{ nome: 'service', expiraEm: 7 * 86400000 }];
  base.simulator.tarefasBloqueadas = JSON.stringify(blocks);
  base.simulator.accelBoosts = '[]';
  for (const [target, id, start, budget, rate] of [
    [local, 'six', 0, 21600000, 360000],
    [remote, 'twelve', 1000, 43200000, 720000],
  ]) {
    const state = Acceleration.advance(blocks, [{ id, startedAt: start, lastAppliedAt: start, endsAt: start + 60000, perSecondMs: rate, budgetLeftMs: budget }], 2000);
    target.simulator.tarefasBloqueadas = JSON.stringify(state.blocks);
    target.simulator.accelBoosts = JSON.stringify(state.boosts);
  }
  const next = Merge.merge(base, local, remote, { accelerationNow: 2000 });
  const final = Acceleration.advance(JSON.parse(next.simulator.tarefasBloqueadas), JSON.parse(next.simulator.accelBoosts), 62000);
  assert.equal(final.blocks[0].expiraEm, 7 * 86400000 - 64800000);
  assert.deepEqual(final.boosts, []);
});
