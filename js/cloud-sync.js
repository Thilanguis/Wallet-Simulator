/* One shared wallet, one active controller. Transactions guard against stale writes.
   Transport is injected so tests never contact a real Firebase project. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.WalletCloud = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const LEASE_MS = 45000;
  function pack(wallet) {
    return { simulator: structuredClone(wallet.simulator), financeJson: JSON.stringify(wallet.finance) };
  }
  function unpack(doc) {
    if (doc.schema !== 3 || !Number.isSafeInteger(doc.revision) || doc.revision < 1 || !doc.simulator || typeof doc.financeJson !== 'string') throw new Error('Estado compartilhado incompatível.');
    return { version: 2, revision: 0, simulator: structuredClone(doc.simulator), finance: JSON.parse(doc.financeJson) };
  }
  function signature(doc) {
    return JSON.stringify([doc?.simulator, doc?.financeJson]);
  }
  function create({ store, transport, id, validate, backup, onFreeze = () => {}, onRemote = () => {}, onState = () => {}, now = Date.now, later = setTimeout, cancel = clearTimeout }) {
    const idleWaiters = [];
    let base = null,
      mode = 'local',
      pending = false,
      busy = false,
      timer = null,
      timerDue = 0,
      expiryTimer = null,
      unwatch = null,
      latest = null,
      stopped = false,
      suspended = false,
      connectionTimer = null;
    function status(next, error) {
      if ((mode === 'local' || mode === 'controlling') && next !== mode) {
        onFreeze();
        store.flush();
      }
      mode = next;
      store.setWritable(next === 'local' || next === 'controlling');
      onState({ mode, pending, error });
    }
    function schedule(delay = 1000) {
      if (mode !== 'controlling' || stopped) return;
      if (timer !== null && timerDue <= now() + delay) return;
      if (timer !== null) cancel(timer);
      timerDue = now() + delay;
      timer = later(() => {
        timer = null;
        flush();
      }, delay);
    }
    function guardLease() {
      if (expiryTimer !== null) cancel(expiryTimer);
      expiryTimer = later(
        () => {
          if (mode === 'controlling') {
            status('watching');
            if (pending) backup(store.snapshot());
          }
        },
        Math.max(0, base.leaseUntil - now()),
      );
    }
    function adopt(doc) {
      const wallet = unpack(doc);
      validate(wallet);
      const before = store.snapshot();
      const initial = !base;
      const changedKeys = [...new Set([...Object.keys(before.simulator), ...Object.keys(wallet.simulator)])].filter((key) => before.simulator[key] !== wallet.simulator[key]);
      store.acceptRemote(wallet);
      base = structuredClone(doc);
      onRemote({ initial, changedKeys, financeChanged: JSON.stringify(before.finance) !== JSON.stringify(wallet.finance) });
    }
    function receive(doc) {
      if (stopped || suspended) return;
      if (connectionTimer !== null) {
        cancel(connectionTimer);
        connectionTimer = null;
      }
      if (busy) {
        latest = { doc };
        return;
      }
      try {
        if (!doc) {
          base = null;
          status('ready');
          return;
        }
        // Validate before using even a controller/lease field from a snapshot.
        validate(unpack(doc));
        if (base && doc.revision < base.revision) return;
        const changed = !base || signature(doc) !== signature(base);
        const ours = doc.controller === id && doc.leaseUntil > now();
        if (changed || (!ours && mode === 'controlling')) {
          status('receiving');
          if (pending || !base) backup(store.snapshot());
          adopt(doc);
          pending = false;
        } else base = structuredClone(doc);
        status(ours ? 'controlling' : 'watching');
        if (ours) {
          guardLease();
          schedule(15000);
        }
      } catch (error) {
        fail(error);
      }
    }
    function fail(error) {
      if (stopped) return;
      suspended = true;
      if (connectionTimer !== null) {
        cancel(connectionTimer);
        connectionTimer = null;
      }
      status('error', error);
      if (pending) backup(store.snapshot());
    }
    const unsubscribe = store.subscribe(() => {
      if (mode !== 'controlling') return;
      pending = signature(pack(store.snapshot())) !== signature(base);
      onState({ mode, pending });
      // New actions should not wait for a heartbeat scheduled further away.
      const snapshot = pack(store.snapshot());
      const bookkeeping = new Set(['timerSession', 'tarefasBloqueadas', 'accelBoosts']);
      const action = snapshot.financeJson !== base?.financeJson || Object.keys(snapshot.simulator).some((key) => !bookkeeping.has(key) && snapshot.simulator[key] !== base?.simulator[key]);
      schedule(action ? 0 : 1000);
    });
    async function takeControl() {
      if (busy || stopped) return false;
      suspended = false;
      busy = true;
      status('connecting');
      try {
        const seed = pack(store.snapshot());
        validate({ version: 2, revision: 0, simulator: seed.simulator, finance: JSON.parse(seed.financeJson) });
        if (new TextEncoder().encode(JSON.stringify(seed)).length > 650000) throw new Error('A carteira excedeu o tamanho da sincronização. Exporte um backup; nenhum registro foi removido.');
        const doc = await transport.transact((current) => {
          if (current) validate(unpack(current));
          if (current && current.controller !== id && current.leaseUntil > now()) throw Object.assign(new Error('A carteira está em uso no outro aparelho. Libere o controle lá ou aguarde 45 segundos após fechá-lo.'), { code: 'wallet/in-use' });
          return { ...(current || seed), schema: 3, revision: (current?.revision || 0) + 1, controller: id, leaseUntil: now() + LEASE_MS };
        });
        backup(store.snapshot());
        adopt(doc);
        pending = false;
        status('controlling');
        guardLease();
        schedule(15000);
        return true;
      } catch (error) {
        if (error.code === 'wallet/in-use') status('watching', error);
        else fail(error);
        return false;
      } finally {
        busy = false;
        drain();
        idleWaiters.splice(0).forEach((resolve) => resolve());
      }
    }
    function drain() {
      if (latest) {
        const next = latest;
        latest = null;
        receive(next.doc);
      }
    }
    async function flush() {
      if (stopped || mode !== 'controlling') return;
      if (busy) {
        await new Promise((resolve) => idleWaiters.push(resolve));
        return flush();
      }
      if (!base || base.leaseUntil <= now()) {
        status('watching');
        return;
      }
      store.flush();
      busy = true;
      const sent = pack(store.snapshot()),
        expected = structuredClone(base);
      try {
        validate({ version: 2, revision: 0, simulator: sent.simulator, finance: JSON.parse(sent.financeJson) });
        // Firestore has a 1 MiB document limit; fail visibly instead of truncating a ledger.
        if (new TextEncoder().encode(JSON.stringify(sent)).length > 650000) throw new Error('A carteira excedeu o tamanho da sincronização. Exporte um backup; nenhum registro foi removido.');
        const doc = await transport.transact((current) => {
          if (!current || current.controller !== id || current.leaseUntil <= now() || current.revision !== expected.revision || signature(current) !== signature(expected))
            throw new Error('A carteira mudou em outro aparelho. Sua cópia foi preservada para conferência.');
          return { ...current, ...sent, revision: current.revision + 1, leaseUntil: now() + LEASE_MS };
        });
        base = structuredClone(doc);
        guardLease();
        pending = signature(pack(store.snapshot())) !== signature(sent);
        onState({ mode, pending });
        schedule(pending ? 1000 : 15000);
      } catch (error) {
        fail(error);
      } finally {
        busy = false;
        drain();
        idleWaiters.splice(0).forEach((resolve) => resolve());
      }
    }
    function connect() {
      stopped = false;
      suspended = false;
      status('connecting');
      connectionTimer = later(() => fail(new Error('O Firebase não respondeu. Confira a conexão e tente Reconectar.')), 12000);
      unwatch = transport.watch(receive, fail);
    }
    async function release() {
      if (mode !== 'controlling' || busy) return false;
      onFreeze();
      store.flush();
      await flush();
      if (mode !== 'controlling' || busy) return false;
      busy = true;
      status('connecting');
      try {
        const expected = structuredClone(base);
        const doc = await transport.transact((current) => {
          if (!current || current.controller !== id || current.revision !== expected.revision || signature(current) !== signature(expected)) throw new Error('O controle mudou. Reabra a conexão antes de continuar.');
          return { ...current, revision: current.revision + 1, controller: '', leaseUntil: 0 };
        });
        receiveLater(doc);
        return true;
      } catch (error) {
        fail(error);
        return false;
      } finally {
        busy = false;
        drain();
        idleWaiters.splice(0).forEach((resolve) => resolve());
      }
    }
    function receiveLater(doc) {
      latest = { doc };
    }
    function stop() {
      stopped = true;
      unwatch?.();
      unsubscribe();
      if (timer !== null) cancel(timer);
      if (expiryTimer !== null) cancel(expiryTimer);
      if (connectionTimer !== null) cancel(connectionTimer);
      if (pending) backup(store.snapshot());
      status('local');
    }
    return { connect, takeControl, release, flush, stop, receive, suspend: fail, state: () => ({ mode, pending, base: structuredClone(base) }) };
  }
  return { create, pack, unpack, signature, LEASE_MS };
});
