/* Shared ledger operations for both accounts. Clock ownership stays internal. */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./cloud-sync.js') : root.WalletCloud, typeof module === 'object' ? require('./shared-merge.js') : root.SharedMerge);
  if (typeof module === 'object') module.exports = api;
  else root.WalletShared = api;
})(typeof window === 'object' ? window : globalThis, function (Cloud, Merge) {
  function create(options) {
    const { transport, id, store } = options;
    let engine,
      actual = null,
      writing = false;
    const now = options.now || Date.now;
    const merge = (base, local, current, settings) => Merge.merge(base, local, current, { ...settings, accelerationNow: now() });
    const counters = new Set(['timerSession', 'tarefasBloqueadas', 'accelBoosts']);
    function maintenance(base, sent) {
      if (base.financeJson !== sent.financeJson || Object.keys(sent.simulator).some((key) => !counters.has(key) && sent.simulator[key] !== base.simulator[key])) return false;
      const a = JSON.parse(base.simulator.timerSession || 'null'),
        b = JSON.parse(sent.simulator.timerSession || 'null');
      if (!a || !b) return Merge.equal(a, b);
      return a.active === b.active && a.running === b.running && a.tasks === b.tasks && Merge.equal(a.dynamicActivities, b.dynamicActivities) && Math.abs(a.rate - (a.autoRateTotal || 0) - (b.rate - (b.autoRateTotal || 0))) < 0.000001;
    }
    function advance(doc) {
      const next = structuredClone(doc),
        timer = JSON.parse(next.simulator.timerSession || 'null');
      if (timer?.running && next.leaseUntil <= now()) {
        next.simulator.timerSession = JSON.stringify({ ...timer, running: false });
        return next;
      }
      if (timer?.running && next.timerCheckpointAt && options.advanceTimer) {
        const seconds = Math.max(0, Math.floor((now() - next.timerCheckpointAt) / 1000));
        if (seconds) {
          next.simulator.timerSession = JSON.stringify({ ...options.advanceTimer(timer, seconds), running: true });
          next.timerCheckpointAt += seconds * 1000;
        }
      }
      return next;
    }
    const owns = () => !actual?.controller || actual.controller === id || actual.leaseUntil <= now();
    const virtual = (doc) => doc && { ...structuredClone(doc), controller: id, leaseUntil: now() + 1000000000 };
    function track(doc) {
      actual = structuredClone(doc);
      return virtual(doc);
    }
    const sharedTransport = {
      watch(receive, fail) {
        return transport.watch((doc) => {
          const base = engine.state().base,
            before = store.snapshot();
          let rebased;
          if (doc && base && !writing && engine.state().pending && doc.revision >= base.revision && Cloud.signature(doc) !== Cloud.signature(base)) {
            try {
              rebased = merge(base, Cloud.pack(before), doc, { timerOwner: !doc.controller || doc.controller === id || doc.leaseUntil <= now() });
            } catch (error) {
              options.backup(before);
              options.onConflict?.(error);
            }
          }
          receive(track(doc));
          if (rebased && store.isWritable()) {
            options.validate(Cloud.unpack(rebased));
            store.commitBoth(JSON.parse(rebased.financeJson), rebased.simulator);
            options.onRemote?.({ initial: false, changedKeys: Object.keys(rebased.simulator).filter((key) => before.simulator[key] !== rebased.simulator[key]), financeChanged: JSON.stringify(before.finance) !== rebased.financeJson });
          }
        }, fail);
      },
      async transact(change) {
        const expected = engine.state().base;
        const sent = Cloud.pack(store.snapshot());
        if (actual && expected && (!engine.state().pending || (!owns() && maintenance(expected, sent)))) {
          const before = store.snapshot();
          if (!owns() && engine.state().pending) {
            store.acceptRemote(Cloud.unpack(actual));
            options.onRemote?.({ initial: false, changedKeys: [...counters].filter((key) => before.simulator[key] !== actual.simulator[key]), financeChanged: false });
          }
          return virtual(actual);
        }
        writing = true;
        let doc;
        try {
          doc = await transport.transact((stored) => {
            const current = stored && advance(stored);
            const baseline = expected || virtual(current);
            const requested = change(structuredClone(baseline));
            if (!current) return requested;
            const owner = !current.controller || current.controller === id || current.leaseUntil <= now();
            let next;
            try {
              next = merge(baseline, requested, current, { timerOwner: owner });
            } catch (error) {
              throw Object.assign(error, { code: 'wallet/stale', current: virtual(current) });
            }
            next.revision = current.revision + 1;
            next.controller = owner ? id : current.controller;
            next.leaseUntil = owner ? now() + Cloud.LEASE_MS : current.leaseUntil;
            if (owner && requested.simulator.timerSession !== baseline.simulator.timerSession) next.timerCheckpointAt = now();
            options.validate(Cloud.unpack(next));
            return next;
          });
        } finally {
          writing = false;
        }
        const before = store.snapshot();
        const rebased = merge({ ...doc, ...sent }, Cloud.pack(before), doc, { timerOwner: owns() });
        store.acceptRemote(Cloud.unpack(rebased));
        const changedKeys = [...new Set([...Object.keys(before.simulator), ...Object.keys(rebased.simulator)])].filter((key) => before.simulator[key] !== rebased.simulator[key]);
        if (changedKeys.length || JSON.stringify(before.finance) !== rebased.financeJson) options.onRemote?.({ initial: false, changedKeys, financeChanged: JSON.stringify(before.finance) !== rebased.financeJson });
        return track(doc);
      },
    };
    engine = Cloud.create({ ...options, transport: sharedTransport, freezeOnReceive: false, checkpointMs: 15000 });
    return {
      ...engine,
      shared: true,
      isTimerOwner: owns,
      timerView: () => (actual ? JSON.parse(advance(actual).simulator.timerSession || 'null') : null),
      async claimTimer() {
        await engine.flush();
        const doc = await transport.transact((current) => {
          if (!current) throw new Error('A carteira não foi encontrada.');
          const next = advance(current),
            timer = JSON.parse(next.simulator.timerSession || 'null');
          if (timer) {
            next.simulator.timerSession = JSON.stringify({ ...timer, running: false });
            next.timerCheckpointAt = now();
          }
          next.controller = id;
          next.leaseUntil = now() + Cloud.LEASE_MS;
          next.revision++;
          return next;
        });
        engine.receive(track(doc));
        return true;
      },
    };
  }
  return { create };
});
