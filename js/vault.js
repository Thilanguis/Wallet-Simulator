/* Atomic envelopes + last known good copy. No network or personal fixtures. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.Vault = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const keys = [
    'saldoDominadora',
    'historico',
    'tarefasPendentes',
    'bonusEspecialAtivo',
    'tarefasBloqueadas',
    'accelBoosts',
    'roletaUltimoUso',
    'roletaUltimoResultadoTexto',
    'economy',
    'economyBeforeBalanced',
    'economyCatalogBaseline',
    'economyCatalog',
    'catalogExternalGamesSeparated',
    'timerSession',
    'archivedHistory',
    'rouletteSpin',
    'rouletteAwards',
    'rouletteBonusUntil',
  ];
  function read(storage, key, fallback) {
    const raw = storage.getItem(key);
    if (raw === null) return structuredClone(fallback);
    try {
      return JSON.parse(raw);
    } catch {
      const previous = storage.getItem(key + '.previous');
      if (previous !== null) return JSON.parse(previous);
      throw new Error('Dados locais inválidos: ' + key + '. Exporte os dados antes de corrigir o armazenamento.');
    }
  }
  function write(storage, key, value) {
    const serialized = JSON.stringify(value);
    const previous = storage.getItem(key);
    // Validate the previous copy before replacing the recovery slot.
    if (previous !== null) {
      try {
        JSON.parse(previous);
        storage.setItem(key + '.previous', previous);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    storage.setItem(key, serialized); // failure is surfaced; caller retains unsaved edits
  }
  function simulator(storage, onError) {
    let map = read(storage, 'findom.simulator.v2', null);
    if (!map) {
      map = {};
      for (const key of keys) {
        const value = storage.getItem(key);
        if (value !== null) map[key] = value;
      }
      write(storage, 'findom.simulator.v2', map); // legacy keys remain untouched for recovery
    }
    let queued = false;
    const flush = () => {
      queued = false;
      try {
        write(storage, 'findom.simulator.v2', map);
      } catch (error) {
        onError(error);
      }
    };
    return {
      getItem: (key) => map[key] ?? null,
      setItem(key, value) {
        if (!keys.includes(key)) throw new Error('Chave desconhecida: ' + key);
        map[key] = String(value);
        if (!queued) {
          queued = true;
          queueMicrotask(flush);
        }
      },
      flush,
      snapshot: () => structuredClone(map),
      replace(next) {
        map = structuredClone(next);
        flush();
      },
    };
  }
  function wallet(storage, emptyFinance, onError) {
    const key = 'findom.wallet.v2';
    let state = read(storage, key, null);
    if (!state) {
      const map = read(storage, 'findom.simulator.v2', null) || {};
      for (const k of keys) if (map[k] === undefined && storage.getItem(k) !== null) map[k] = storage.getItem(k);
      state = { version: 2, revision: 0, simulator: map, finance: emptyFinance };
      write(storage, key, state);
    }
    if (state.version !== 2 || !state.simulator || !state.finance || !Number.isSafeInteger(state.revision)) throw new Error('Armazenamento estruturado inválido.');
    let writable = true;
    const listeners = new Set();
    let dirty = false,
      queued = false;
    function commit(next) {
      if (!writable) throw new Error('Este aparelho acompanha a carteira. Assuma o controle antes de alterar dados.');
      const disk = read(storage, key, null);
      if (disk && disk.revision !== state.revision) throw new Error('Outra aba alterou os dados. Exporte o backup e recarregue antes de continuar.');
      const candidate = { ...structuredClone(next), revision: state.revision + 1 };
      write(storage, key, candidate);
      state = candidate;
      dirty = false;
      for (const listener of listeners) listener(structuredClone(state));
    }
    function flush() {
      queued = false;
      if (dirty) commit(state);
    }
    const sim = {
      getItem: (k) => state.simulator[k] ?? null,
      setItem(k, value) {
        if (!writable) return;
        if (!keys.includes(k)) throw new Error('Chave desconhecida: ' + k);
        state.simulator[k] = String(value);
        dirty = true;
        if (!queued) {
          queued = true;
          queueMicrotask(() => {
            try {
              flush();
            } catch (e) {
              onError(e);
            }
          });
        }
      },
      flush,
      snapshot: () => structuredClone(state.simulator),
    };
    return {
      sim,
      flush,
      snapshot: () => structuredClone(state),
      isWritable: () => writable,
      setWritable(value) {
        writable = !!value;
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      acceptRemote(next) {
        const candidate = { ...structuredClone(next), revision: state.revision + 1 };
        write(storage, key, candidate);
        state = candidate;
        dirty = false;
      },
      finance: () => structuredClone(state.finance),
      commitFinance(finance) {
        flush();
        commit({ ...state, finance });
      },
      commitBoth(finance, simulator) {
        flush();
        commit({ ...state, finance, simulator });
      },
      restore(next) {
        flush();
        commit(next);
      },
    };
  }
  return { keys, read, write, simulator, wallet };
});
