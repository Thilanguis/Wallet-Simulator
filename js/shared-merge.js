/* Three-way transaction merge for one wallet shared by the two authorized users. */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./acceleration.js') : root.WalletAcceleration);
  if (typeof module === 'object') module.exports = api;
  else root.SharedMerge = api;
})(typeof window === 'object' ? window : globalThis, function (Acceleration) {
  const stable = (value) =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, stable(value[key])]),
          )
        : value;
  const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  function sameTimerActions(before, after) {
    // A checkpoint advances these counters without changing the user's session.
    const actions = ({ seconds, earnedUnits, autoRateTotal = 0, rate, ...rest }) => ({ ...rest, manualRate: Math.round((rate - autoRateTotal) * 100) });
    return after.seconds >= before.seconds && after.earnedUnits >= before.earnedUnits && equal(actions(before), actions(after));
  }
  function conflict() {
    throw new Error('Este item foi alterado ao mesmo tempo. A cópia anterior foi preservada para conferência.');
  }
  function list(base, local, remote, key = 'id') {
    if (equal(base, local)) return structuredClone(remote);
    const index = (items) => {
      const occurrences = new Map();
      return new Map(
        items.map((item) => {
          const identity = String(item[key] ?? JSON.stringify(stable(item)));
          const count = occurrences.get(identity) || 0;
          occurrences.set(identity, count + 1);
          return [identity + '#' + count, item];
        }),
      );
    };
    const b = index(base),
      l = index(local),
      r = index(remote);
    for (const [id, old] of b)
      if (!l.has(id)) {
        if (r.has(id) && !equal(r.get(id), old)) conflict();
        r.delete(id);
      }
    for (const [id, item] of l) {
      const old = b.get(id);
      if (equal(item, old)) continue;
      if (r.has(id) && !equal(r.get(id), old) && !equal(r.get(id), item)) conflict();
      if (old && !r.has(id)) conflict();
      r.set(id, item);
    }
    // Follow the local order for its existing rows; retain remote additions.
    return [...l.keys()]
      .filter((id) => r.has(id))
      .map((id) => {
        const item = r.get(id);
        r.delete(id);
        return item;
      })
      .concat([...r.values()]);
  }
  function object(base, local, remote) {
    const out = structuredClone(remote);
    for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
      if (equal(base[key], local[key])) continue;
      if (!equal(remote[key], base[key]) && !equal(remote[key], local[key])) conflict();
      if (local[key] === undefined) delete out[key];
      else out[key] = structuredClone(local[key]);
    }
    return out;
  }
  function merge(base, local, current, { timerOwner = true, accelerationNow } = {}) {
    const originalBoostIds = (doc) => new Set(JSON.parse(doc.simulator.accelBoosts || '[]').map((boost) => boost.id));
    const previousBoosts = originalBoostIds(base),
      remoteBoosts = originalBoostIds(current);
    const independentReducer = [...originalBoostIds(local)].some((id) => !previousBoosts.has(id) && !remoteBoosts.has(id));
    // Reducer checkpoints describe elapsed wall time, not three independent
    // edits. Compare all copies at the same instant before merging user actions.
    if (Number.isFinite(accelerationNow) && [base, local, current].some((doc) => doc.simulator.accelBoosts)) {
      // An already received checkpoint can be slightly ahead of this device's
      // wall clock. Never compare a future slice with an earlier one.
      accelerationNow = Math.max(accelerationNow, ...[base, local, current].flatMap((doc) => JSON.parse(doc.simulator.accelBoosts || '[]').map((boost) => boost.lastAppliedAt || 0)));
      [base, local, current] = [base, local, current].map((doc) => {
        const next = structuredClone(doc);
        const state = Acceleration.advance(JSON.parse(next.simulator.tarefasBloqueadas || '[]'), JSON.parse(next.simulator.accelBoosts || '[]'), accelerationNow);
        next.simulator.tarefasBloqueadas = JSON.stringify(state.blocks);
        next.simulator.accelBoosts = JSON.stringify(state.boosts);
        return next;
      });
    }
    const out = structuredClone(current),
      b = base.simulator,
      l = local.simulator,
      r = current.simulator;
    const arrays = { wishlist: 'id', historico: 'id', archivedHistory: 'id', tarefasPendentes: 'id', tarefasBloqueadas: 'nome', accelBoosts: 'id', rouletteAwards: 'id' };
    for (const key of new Set([...Object.keys(b), ...Object.keys(l)])) {
      if (equal(b[key], l[key])) continue;
      if (key === 'saldoDominadora') {
        const delta = Math.round((Number(l[key] || 0) - Number(b[key] || 0)) * 100);
        const result = Math.round(Number(r[key] || 0) * 100) + delta;
        const previousIds = new Set(JSON.parse(b.historico || '[]').map((item) => item.id));
        const additions = JSON.parse(l.historico || '[]').filter((item) => item.id && !previousIds.has(item.id));
        const concurrent = Number(r[key] || 0) !== Number(b[key] || 0);
        if (concurrent && additions.some((item) => item.tipo === 'ajuste')) conflict();
        if (!Number.isSafeInteger(result) || (concurrent && delta < 0 && result < 0 && !additions.some((item) => item.contractRule))) throw new Error('Saldo insuficiente após uma operação recebida do outro aparelho.');
        out.simulator[key] = String(result / 100);
      } else if (key === 'wishlistFx') {
        const localFx = JSON.parse(l[key] || 'null'), remoteFx = JSON.parse(r[key] || 'null');
        out.simulator[key] = !remoteFx || localFx?.checkedAt > remoteFx.checkedAt ? l[key] : r[key];
      } else if (arrays[key]) {
        const previous = JSON.parse(b[key] || '[]'),
          localRows = JSON.parse(l[key] || '[]'),
          remoteRows = JSON.parse(r[key] || '[]');
        if (key === 'tarefasBloqueadas' && localRows.some((item) => !previous.some((old) => old.nome === item.nome) && remoteRows.some((other) => other.nome === item.nome))) conflict();
        if (key === 'tarefasBloqueadas' && Number.isFinite(accelerationNow)) {
          // Distinct newly purchased reducers can shorten the same existing
          // deadline concurrently. Add their reductions, never their elapsed ticks.
          for (const row of localRows) {
            const old = previous.find((item) => item.nome === row.nome),
              other = remoteRows.find((item) => item.nome === row.nome);
            if (independentReducer && old && other && row.expiraEm < old.expiraEm && other.expiraEm < old.expiraEm) {
              other.expiraEm = Math.max(accelerationNow, other.expiraEm + row.expiraEm - old.expiraEm);
              row.expiraEm = old.expiraEm;
            }
          }
        }
        out.simulator[key] = JSON.stringify(list(previous, localRows, remoteRows, arrays[key]));
      } else if (key === 'timerSession') {
        const bt = JSON.parse(b[key] || 'null'),
          lt = JSON.parse(l[key] || 'null'),
          rt = JSON.parse(r[key] || 'null');
        // A companion can register activities into the running shared timer,
        // but does not integrate elapsed seconds independently.
        if (rt?.active && lt?.active && bt?.active) {
          const advanced = timerOwner && lt.seconds >= rt.seconds ? lt : rt;
          const overlap = Math.min(Math.max(0, (lt.autoRateTotal || 0) - (bt.autoRateTotal || 0)), Math.max(0, (rt.autoRateTotal || 0) - (bt.autoRateTotal || 0)));
          const next = {
            ...rt,
            seconds: advanced.seconds,
            earnedUnits: advanced.earnedUnits,
            autoRateTotal: Math.max(lt.autoRateTotal || 0, rt.autoRateTotal || 0),
            running: lt.running !== bt.running ? lt.running : rt.running,
            rate: Math.round((rt.rate + lt.rate - bt.rate - overlap) * 100) / 100,
            tasks: rt.tasks + lt.tasks - bt.tasks,
          };
          next.dynamicActivities = list(
            (bt.dynamicActivities || []).map((id) => ({ id })),
            (lt.dynamicActivities || []).map((id) => ({ id })),
            (rt.dynamicActivities || []).map((id) => ({ id })),
          ).map((item) => item.id);
          out.simulator[key] = JSON.stringify(next);
        } else if (timerOwner && bt?.active && lt?.active === false && rt?.active && sameTimerActions(bt, rt)) {
          // Finishing intentionally resets the counters. Elapsed time projected
          // by shared-sync.advance() is not a concurrent edit; credit the exact
          // amount already recorded by the finishing device, without another tick.
          out.simulator[key] = l[key];
        } else if (!equal(b[key], r[key])) conflict();
        else out.simulator[key] = l[key];
      } else {
        if (!equal(b[key], r[key]) && !equal(l[key], r[key])) conflict();
        if (l[key] === undefined) delete out.simulator[key];
        else out.simulator[key] = l[key];
      }
    }
    const bf = JSON.parse(base.financeJson),
      lf = JSON.parse(local.financeJson),
      rf = JSON.parse(current.financeJson);
    const bfRest = { ...bf },
      lfRest = { ...lf },
      rfRest = { ...rf };
    for (const key of ['entries', 'audit', 'redemptions']) {
      delete bfRest[key];
      delete lfRest[key];
      delete rfRest[key];
    }
    delete bfRest.revision;
    delete lfRest.revision;
    delete rfRest.revision;
    const finance = object(bfRest, lfRest, rfRest);
    for (const key of ['entries', 'audit', 'redemptions']) finance[key] = list(bf[key] || [], lf[key] || [], rf[key] || []);
    finance.revision = Math.max(rf.revision || 0, lf.revision || 0) + (!equal(bf, lf) && !equal(bf, rf) ? 1 : 0);
    out.financeJson = JSON.stringify(finance);
    // Only newly added history rows receive their actual post-transaction balance.
    const existing = new Set(JSON.parse(b.historico || '[]').map((item) => item.id));
    const added = JSON.parse(l.historico || '[]').filter((item) => item.id && !existing.has(item.id));
    const rows = JSON.parse(out.simulator.historico || '[]');
    const offset = Number(r.saldoDominadora || 0) - Number(b.saldoDominadora || 0);
    for (const row of rows) if (added.some((item) => item.id === row.id) && Number.isFinite(row.saldoAtual)) row.saldoAtual = Math.round((row.saldoAtual + offset) * 100) / 100;
    out.simulator.historico = JSON.stringify(rows);
    return out;
  }
  return { equal, list, merge };
});
