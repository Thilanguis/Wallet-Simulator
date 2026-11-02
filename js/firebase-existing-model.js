/* Compatibility with the existing Wallet-Simulator user document.
 * The current wallet is authoritative; legacy collections remain preserved.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.FirebaseExisting = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const field = 'walletAtualV3';
  function number(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Campo Firebase inválido: ' + label);
    return value;
  }
  function millis(value) {
    if (value === null || value === undefined || value === '') return 0;
    const time = typeof value?.toMillis === 'function' ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'number' ? value : /^\d+$/.test(value) ? Number(value) : Date.parse(value);
    if (!Number.isFinite(time) || time < 0) throw new Error('Data inválida no Firebase.');
    return time;
  }
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, stable(value[key])]),
      );
    return value;
  }
  const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  function list(value, name) {
    if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('Lista inválida no Firebase: ' + name);
    return value.map((item) => {
      const next = { ...item };
      for (const key of name === 'tarefasBloqueadas' ? ['expiraEm'] : ['startedAt', 'endsAt', 'lastAppliedAt']) if (next[key] !== undefined) next[key] = millis(next[key]);
      return next;
    });
  }
  function project(doc) {
    const sim = doc.simulator;
    const timer = JSON.parse(sim.timerSession || 'null');
    const last = millis(sim.roletaUltimoUso);
    return {
      saldoDominadora: Number(sim.saldoDominadora || 0),
      bonusEspecialAtivo: JSON.parse(sim.bonusEspecialAtivo || 'false'),
      roletaUltimoUso: last ? new Date(last).toISOString() : null,
      roletaUltimoResultadoTexto: sim.roletaUltimoResultadoTexto || '',
      tarefasBloqueadas: JSON.parse(sim.tarefasBloqueadas || '[]'),
      accelBoosts: JSON.parse(sim.accelBoosts || '[]'),
      timerTempoSegundos: timer?.seconds || 0,
      timerValorAtual: Math.round((timer?.earnedUnits || 0) / 60) / 100,
      timerValorPorMinuto: timer?.rate || 0,
      timerAtivo: !!timer?.active,
      timerRodando: !!timer?.running,
    };
  }
  function read(raw) {
    if (raw[field] === undefined) return null;
    const saved = raw[field];
    if (!saved || saved.schema !== 3 || !Number.isSafeInteger(saved.revision) || saved.revision < 1 || !saved.simulator || typeof saved.financeJson !== 'string')
      throw new Error('A carteira atual no Firebase tem formato incompatível. Os dados locais foram preservados.');
    const doc = structuredClone(saved),
      sim = doc.simulator,
      before = project(doc);
    // Scalar edits in the existing console remain visible. They never replace the
    // finance ledger, catalog, history, task IDs or earned units unless explicitly edited.
    if (Object.hasOwn(raw, 'saldoDominadora')) {
      const value = number(raw.saldoDominadora, 'saldoDominadora');
      if (value !== before.saldoDominadora) sim.saldoDominadora = String(value);
    }
    if (Object.hasOwn(raw, 'bonusEspecialAtivo')) {
      if (typeof raw.bonusEspecialAtivo !== 'boolean') throw new Error('Bônus inválido no Firebase.');
      if (raw.bonusEspecialAtivo !== before.bonusEspecialAtivo) sim.bonusEspecialAtivo = JSON.stringify(raw.bonusEspecialAtivo);
    }
    if (Object.hasOwn(raw, 'roletaUltimoUso') && millis(raw.roletaUltimoUso) !== millis(before.roletaUltimoUso)) sim.roletaUltimoUso = String(millis(raw.roletaUltimoUso));
    if (Object.hasOwn(raw, 'roletaUltimoResultadoTexto')) {
      if (raw.roletaUltimoResultadoTexto !== null && typeof raw.roletaUltimoResultadoTexto !== 'string') throw new Error('Resultado da roleta inválido.');
      if ((raw.roletaUltimoResultadoTexto || '') !== before.roletaUltimoResultadoTexto) sim.roletaUltimoResultadoTexto = raw.roletaUltimoResultadoTexto || '';
    }
    for (const name of ['tarefasBloqueadas', 'accelBoosts']) {
      if (!Object.hasOwn(raw, name)) continue;
      const value = list(raw[name], name);
      if (!equal(value, before[name])) sim[name] = JSON.stringify(value);
    }
    const timerFields = ['timerTempoSegundos', 'timerValorAtual', 'timerValorPorMinuto', 'timerAtivo', 'timerRodando'];
    if (timerFields.some((key) => Object.hasOwn(raw, key) && raw[key] !== before[key])) {
      const timer = JSON.parse(sim.timerSession || 'null') || { seconds: 0, earnedUnits: 0, rate: 0, tasks: 0, active: false, running: false, dynamicActivities: [] };
      for (const [legacy, key] of [
        ['timerTempoSegundos', 'seconds'],
        ['timerValorPorMinuto', 'rate'],
      ]) {
        if (Object.hasOwn(raw, legacy)) timer[key] = number(raw[legacy], legacy);
      }
      if (Object.hasOwn(raw, 'timerValorAtual') && raw.timerValorAtual !== before.timerValorAtual) timer.earnedUnits = Math.round(number(raw.timerValorAtual, 'timerValorAtual') * 6000);
      for (const [legacy, key] of [
        ['timerAtivo', 'active'],
        ['timerRodando', 'running'],
      ])
        if (Object.hasOwn(raw, legacy)) {
          if (typeof raw[legacy] !== 'boolean') throw new Error('Estado do cronômetro inválido: ' + legacy);
          timer[key] = raw[legacy];
        }
      if (!timer.active) timer.running = false;
      if ([timer.seconds, timer.earnedUnits, timer.rate].some((n) => n < 0) || !Number.isInteger(timer.seconds)) throw new Error('Valor do cronômetro inválido.');
      sim.timerSession = JSON.stringify(timer);
    }
    return doc;
  }
  return { field, project, read, millis };
});
