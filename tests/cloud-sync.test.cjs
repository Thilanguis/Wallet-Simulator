const { test } = require('node:test'),
  assert = require('node:assert/strict');
const Cloud = require('../js/cloud-sync.js'),
  Cipher = require('../js/cloud-cipher.js');
const Vault = require('../js/vault.js'),
  Finance = require('../js/finance.js');
function fixture() {
  let cloud = null,
    at = 100000,
    serial = 0,
    offline = false,
    holdNext = null;
  const watchers = new Set(),
    timers = new Map();
  const copy = (v) => structuredClone(v);
  const broadcast = () => {
    for (const listener of watchers) listener(copy(cloud));
  };
  const transport = {
    watch(fn) {
      watchers.add(fn);
      queueMicrotask(() => fn(copy(cloud)));
      return () => watchers.delete(fn);
    },
    async transact(fn) {
      if (holdNext) {
        const pending = holdNext;
        holdNext = null;
        await pending;
      }
      if (offline) throw new Error('offline');
      cloud = copy(fn(copy(cloud)));
      broadcast();
      return copy(cloud);
    },
  };
  function device(id, balance = '100') {
    const map = new Map([['saldoDominadora', balance]]),
      backups = [],
      statuses = [];
    const disk = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
    const store = Vault.wallet(disk, Finance.empty(), (error) => {
      throw error;
    });
    const sync = Cloud.create({
      store,
      transport,
      id,
      now: () => at,
      later(fn, ms) {
        const key = ++serial;
        timers.set(key, { fn, at: at + ms });
        return key;
      },
      cancel(key) {
        timers.delete(key);
      },
      validate(wallet) {
        Finance.validateState(wallet.finance);
        assert.ok(Number.isFinite(Number(wallet.simulator.saldoDominadora)));
      },
      backup(wallet) {
        backups.push(copy(wallet));
      },
      onState(state) {
        statuses.push(state);
      },
    });
    return { store, sync, backups, statuses };
  }
  return {
    device,
    broadcast,
    cloud: () => copy(cloud),
    edit(fn) {
      cloud = fn(copy(cloud));
    },
    offline(value) {
      offline = value;
    },
    hold() {
      let release;
      holdNext = new Promise((resolve) => {
        release = resolve;
      });
      return release;
    },
    async advance(ms) {
      at += ms;
      for (const [key, t] of [...timers])
        if (t.at <= at) {
          timers.delete(key);
          await t.fn();
        }
    },
  };
}
const turn = () => new Promise((resolve) => setImmediate(resolve));
test('migration and snapshots synchronize the complete envelope without erasing the companion ledger', async () => {
  const h = fixture(),
    a = h.device('first'),
    b = h.device('second', '999');
  a.sync.connect();
  await turn();
  assert.equal(a.sync.state().mode, 'ready');
  assert.equal(await a.sync.takeControl(), true);
  b.sync.connect();
  await turn();
  assert.equal(b.store.isWritable(), false);
  assert.equal(b.store.sim.getItem('saldoDominadora'), '100');
  assert.equal(b.backups[0].simulator.saldoDominadora, '999');
  a.store.commitBoth({ ...Finance.empty(), budget: 2000 }, { saldoDominadora: '112', bonusEspecialAtivo: 'true', tarefasPendentes: '[{"id":"example"}]', economyCatalog: '{"example":true}', timerSession: '{"seconds":10}' });
  await a.sync.flush();
  await turn();
  assert.deepEqual(b.store.snapshot().simulator, a.store.snapshot().simulator);
  assert.equal(b.store.finance().budget, 2000);
  const rev = h.cloud().revision;
  b.store.sim.setItem('saldoDominadora', '0');
  await turn();
  assert.equal(b.store.sim.getItem('saldoDominadora'), '112');
  assert.equal(h.cloud().revision, rev);
  assert.throws(() => b.store.commitFinance(Finance.empty()), /acompanha/);
});
test('only one controller can write; release transfers the latest state', async () => {
  const h = fixture(),
    a = h.device('first'),
    b = h.device('second');
  a.sync.connect();
  await turn();
  await a.sync.takeControl();
  b.sync.connect();
  await turn();
  assert.equal(await b.sync.takeControl(), false);
  assert.equal(a.store.isWritable(), true);
  a.store.sim.setItem('saldoDominadora', '125');
  await turn();
  assert.equal(await a.sync.release(), true);
  assert.equal(b.store.sim.getItem('saldoDominadora'), '125');
  assert.equal(await b.sync.takeControl(), true);
  assert.equal(a.store.isWritable(), false);
  b.store.sim.setItem('saldoDominadora', '130');
  await turn();
  await b.sync.flush();
  assert.equal(a.store.sim.getItem('saldoDominadora'), '130');
});
test('a stale transaction preserves unsent data and never overwrites a newer server revision', async () => {
  const h = fixture(),
    a = h.device('first');
  a.sync.connect();
  await turn();
  await a.sync.takeControl();
  a.store.sim.setItem('saldoDominadora', '150');
  await turn();
  h.edit((doc) => ({ ...doc, revision: doc.revision + 1, simulator: { saldoDominadora: '200' } }));
  await a.sync.flush();
  assert.equal(a.sync.state().mode, 'error');
  assert.equal(h.cloud().simulator.saldoDominadora, '200');
  assert.equal(a.backups.at(-1).simulator.saldoDominadora, '150');
});
test('network failure freezes writes and preserves a recoverable unsent snapshot', async () => {
  const h = fixture(),
    a = h.device('first');
  a.sync.connect();
  await turn();
  await a.sync.takeControl();
  a.store.sim.setItem('saldoDominadora', '101');
  await turn();
  h.offline(true);
  await a.sync.flush();
  assert.equal(a.store.isWritable(), false);
  assert.equal(a.backups.at(-1).simulator.saldoDominadora, '101');
  assert.equal(h.cloud().simulator.saldoDominadora, '100');
});
test('lease expiration locks a suspended controller and prevents double counting', async () => {
  const h = fixture(),
    a = h.device('first'),
    b = h.device('second');
  a.sync.connect();
  await turn();
  await a.sync.takeControl();
  h.offline(true);
  await h.advance(46000);
  assert.equal(a.store.isWritable(), false);
  h.offline(false);
  b.sync.connect();
  await turn();
  assert.equal(await b.sync.takeControl(), true);
  assert.equal(a.store.isWritable(), false);
  assert.equal(h.cloud().controller, 'second');
});
test('invalid remote data and oversized ledgers are rejected without replacing local data', async () => {
  const h = fixture(),
    a = h.device('first');
  a.sync.connect();
  await turn();
  await a.sync.takeControl();
  a.sync.receive({ schema: 3, revision: 99, simulator: { saldoDominadora: 'bad' }, financeJson: '{}' });
  assert.equal(a.store.sim.getItem('saldoDominadora'), '100');
  assert.equal(a.store.isWritable(), false);
  const big = h.device('large');
  big.store.sim.setItem('historico', JSON.stringify(['a'.repeat(660000)]));
  await turn();
  big.sync.connect();
  await turn(); // It receives the existing cloud; use another empty fixture to test seeding.
  const empty = fixture(),
    large = empty.device('large');
  large.store.sim.setItem('historico', JSON.stringify(['x'.repeat(660000)]));
  await turn();
  large.sync.connect();
  await turn();
  assert.equal(await large.sync.takeControl(), false);
  assert.equal(empty.cloud(), null);
});
test('AES-GCM pairing hides all data and detects wrong keys and tampered metadata', async () => {
  const code = Cipher.create(),
    cipher = await Cipher.forCode(code);
  assert.equal(code.length, 128);
  assert.ok(Cipher.valid(code));
  const doc = { schema: 3, revision: 1, controller: 'first', leaseUntil: 123456, ...Cloud.pack({ simulator: { saldoDominadora: '123.45' }, finance: Finance.empty() }) };
  const encrypted = await cipher.seal(doc);
  assert.ok(!JSON.stringify(encrypted).includes('saldoDominadora'));
  assert.deepEqual(await cipher.open(encrypted), doc);
  assert.notEqual((await cipher.seal(doc)).iv, encrypted.iv);
  const other = await Cipher.forCode(code.slice(0, 64) + Cipher.create().slice(64));
  await assert.rejects(other.open(encrypted));
  await assert.rejects(cipher.open({ ...encrypted, revision: 2 }));
});
test('a second flush waits for the in-flight transaction and then sends the newer snapshot', async () => {
  const h = fixture(),
    a = h.device('first');
  a.sync.connect();
  await turn();
  await a.sync.takeControl();
  a.store.sim.setItem('saldoDominadora', '120');
  await turn();
  const release = h.hold();
  const first = a.sync.flush();
  a.store.sim.setItem('saldoDominadora', '130');
  await turn();
  const second = a.sync.flush();
  release();
  await Promise.all([first, second]);
  assert.equal(h.cloud().simulator.saldoDominadora, '130');
  assert.equal(a.sync.state().pending, false);
});
