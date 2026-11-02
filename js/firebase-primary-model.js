/* Firebase is authoritative. Local data is recovery/import input, never the balance source. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.FirebasePrimary = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const field = 'walletAtualV4';
  const collections = ['tarefas', 'historico', 'debugRoleta', 'accelBoosts'];
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
  function plain(value) {
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    if (value instanceof Date) return value.getTime();
    if (Array.isArray(value)) return value.map(plain);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
    return value;
  }
  function millis(value) {
    value = plain(value);
    if (value === null || value === undefined || value === '') return 0;
    const time = typeof value === 'number' ? value : /^\d+$/.test(value) ? Number(value) : Date.parse(value);
    if (!Number.isFinite(time) || time < 0) throw new Error('Data inválida no Firebase.');
    return time;
  }
  function date(value) {
    const time = millis(value);
    return time ? new Date(time).toISOString() : '';
  }
  function numeric(value, name, fallback = 0) {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Campo inválido no Firebase: ' + name);
    return value;
  }
  function clean(record) {
    const result = plain(record);
    delete result._walletRevision;
    return result;
  }
  function fingerprint(record) {
    return JSON.stringify(stable(clean(record)));
  }
  function history(record) {
    const item = clean(record);
    return { ...item, id: record.id, timestamp: date(item.timestamp || item.criadoEm), descricao: item.descricao || '', valor: numeric(item.valor, 'valor'), saldoAtual: numeric(item.saldoAtual, 'saldoAtual') };
  }
  function task(record) {
    const item = clean(record);
    return { ...item, id: record.id, tarefa: item.tarefa || item.titulo || '', descricao: item.descricao || '', valor: numeric(item.valor, 'valor'), timestamp: date(item.timestamp || item.criadoEm) };
  }
  function block(record) {
    const item = clean(record);
    return { ...item, nome: item.nome || item.tarefa || item.titulo || '', expiraEm: millis(item.expiraEm) };
  }
  function bootstrap(raw, lists, template) {
    if (!raw || !Object.keys(raw).length) throw new Error('O documento usuarios/gabriel-local não foi encontrado. Nenhuma carteira vazia foi criada.');
    const sim = {};
    // Only the approved modern configuration may be inherited during the one-time upgrade.
    for (const key of ['economy', 'economyCatalog', 'economyCatalogBaseline', 'catalogExternalGamesSeparated']) if (template.simulator[key] !== undefined) sim[key] = template.simulator[key];
    sim.saldoDominadora = String(numeric(raw.saldoDominadora, 'saldoDominadora'));
    if (raw.bonusEspecialAtivo !== undefined && typeof raw.bonusEspecialAtivo !== 'boolean') throw new Error('Bônus inválido no Firebase.');
    sim.bonusEspecialAtivo = JSON.stringify(!!raw.bonusEspecialAtivo);
    sim.roletaUltimoUso = String(millis(raw.roletaUltimoUso));
    sim.roletaUltimoResultadoTexto = raw.roletaUltimoResultadoTexto || '';
    const tasks = lists.tarefas || [],
      logs = lists.historico || [];
    sim.tarefasPendentes = JSON.stringify(tasks.filter((item) => !item.status || item.status === 'pendente').map(task));
    const blocks = (raw.tarefasBloqueadas || []).map(block);
    for (const item of tasks.filter((item) => item.status === 'bloqueada')) {
      const next = block(item);
      if (!blocks.some((old) => old.nome === next.nome && old.expiraEm === next.expiraEm)) blocks.push(next);
    }
    sim.tarefasBloqueadas = JSON.stringify(blocks);
    const sort = (a, b) => millis(b.timestamp) - millis(a.timestamp);
    sim.historico = JSON.stringify(
      logs
        .filter((item) => !item.arquivado)
        .map(history)
        .sort(sort),
    );
    sim.archivedHistory = JSON.stringify(
      logs
        .filter((item) => item.arquivado)
        .map(history)
        .sort(sort),
    );
    // Legacy multiplier-only collection records had no reader in the old app;
    // retain them in the database instead of inventing a time budget for them.
    sim.accelBoosts = JSON.stringify((raw.accelBoosts || []).map(plain));
    sim.rouletteAwards = '[]';
    const seconds = numeric(raw.timerTempoSegundos, 'timerTempoSegundos');
    const earned = numeric(raw.timerValorAtual, 'timerValorAtual');
    const rate = numeric(raw.timerValorPorMinuto, 'timerValorPorMinuto');
    if (![seconds, earned, rate].every((n) => n >= 0) || !Number.isInteger(seconds)) throw new Error('Cronômetro inválido no Firebase.');
    sim.timerSession = JSON.stringify({ seconds, earnedUnits: Math.round(earned * 6000), rate, tasks: 0, active: !!raw.timerAtivo, running: false, dynamicActivities: [] });
    const mirrors = Object.fromEntries(collections.map((name) => [name, Object.fromEntries((lists[name] || []).map((item) => [item.id, { revision: item._walletRevision || 0, hash: fingerprint(item) }]))]));
    return { schema: 3, revision: 1, controller: '', leaseUntil: 0, simulator: sim, financeJson: JSON.stringify(template.emptyFinance), financeImportOpen: true, mirrors, legacyRoulette: (lists.debugRoleta || []).map(plain) };
  }
  function idFor(item, index, kind) {
    if (item.id !== undefined && String(item.id)) return String(item.id);
    const text = JSON.stringify([kind, item.timestamp || '', item.descricao || '', item.source || '']);
    let hash = 2166136261;
    for (const ch of text) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
    return kind + '-' + hash.toString(16);
  }
  function records(doc) {
    const sim = doc.simulator,
      result = Object.fromEntries(collections.map((name) => [name, new Map()]));
    const add = (name, items, transform) =>
      items.forEach((item, index) => {
        const base = idFor(item, index, name);
        let id = base,
          duplicate = 0;
        while (result[name].has(id)) id = base + '-' + ++duplicate;
        result[name].set(id, { ...transform(plain(item)), id });
      });
    add('tarefas', JSON.parse(sim.tarefasPendentes || '[]'), (item) => ({ ...item, titulo: item.tarefa, status: 'pendente' }));
    add('historico', JSON.parse(sim.historico || '[]'), (item) => ({ ...item, arquivado: false }));
    add('historico', JSON.parse(sim.archivedHistory || '[]'), (item) => ({ ...item, arquivado: true }));
    add('accelBoosts', JSON.parse(sim.accelBoosts || '[]'), (item) => ({ ...item, ativo: true }));
    add('debugRoleta', JSON.parse(sim.rouletteAwards || '[]'), (item) => ({ ...item, premio: item.serviceId || item.kind, resultadoTexto: item.label, consumido: !!item.claimed }));
    return result;
  }
  function mirrorChanges(current, next) {
    const before = records(current),
      after = records(next),
      changes = [];
    for (const name of collections) {
      for (const [id, item] of after[name]) if (!before[name].has(id) || fingerprint(before[name].get(id)) !== fingerprint(item)) changes.push({ name, id, data: item });
      for (const [id, item] of before[name]) if (!after[name].has(id)) changes.push({ name, id, data: { ...item, ...(name === 'tarefas' ? { status: 'concluida' } : name === 'accelBoosts' ? { ativo: false } : { arquivado: true }) } });
    }
    return changes;
  }
  function overlay(doc, lists) {
    const result = structuredClone(doc),
      sim = result.simulator;
    for (const name of collections)
      for (const raw of lists[name] || []) {
        const baseline = doc.mirrors?.[name]?.[raw.id];
        const revision = raw._walletRevision || 0;
        if (baseline && (revision < baseline.revision || (revision === baseline.revision && fingerprint(raw) === baseline.hash))) continue;
        if (name === 'tarefas') {
          const items = JSON.parse(sim.tarefasPendentes || '[]').filter((item) => String(item.id) !== String(raw.id));
          if (!raw.status || raw.status === 'pendente') items.push(task(raw));
          sim.tarefasPendentes = JSON.stringify(items);
          const blocks = JSON.parse(sim.tarefasBloqueadas || '[]').filter((item) => String(item.id) !== String(raw.id));
          if (raw.status === 'bloqueada') blocks.push(block(raw));
          sim.tarefasBloqueadas = JSON.stringify(blocks);
        } else if (name === 'historico') {
          const items = JSON.parse(sim.historico || '[]').filter((item) => String(item.id) !== String(raw.id));
          const archived = JSON.parse(sim.archivedHistory || '[]').filter((item) => String(item.id) !== String(raw.id));
          (raw.arquivado ? archived : items).push(history(raw));
          sim.historico = JSON.stringify(items.sort((a, b) => millis(b.timestamp) - millis(a.timestamp)));
          sim.archivedHistory = JSON.stringify(archived);
        } else if (name === 'accelBoosts') {
          // Only the current budget-based shape has a defined interpretation.
          // Unknown old multiplier records remain preserved in their collection.
          if (!['endsAt', 'perSecondMs', 'budgetLeftMs'].every((key) => Number.isFinite(raw[key]) && raw[key] >= 0)) continue;
          const boosts = JSON.parse(sim.accelBoosts || '[]').filter((item) => String(item.id) !== String(raw.id));
          if (raw.ativo !== false) boosts.push(clean(raw));
          sim.accelBoosts = JSON.stringify(boosts);
        } else if (name === 'debugRoleta') {
          // Legacy debug text is not proof of an unclaimed prize. Only actual
          // current award records may be synchronized as redeemable rewards.
          if (!raw.kind || typeof raw.claimed !== 'boolean' || !raw.createdAt) continue;
          const awards = JSON.parse(sim.rouletteAwards || '[]');
          const index = awards.findIndex((item) => String(item.id) === String(raw.id));
          if (index < 0) awards.push(clean(raw));
          else awards[index] = clean(raw);
          sim.rouletteAwards = JSON.stringify(awards);
        }
      }
    return result;
  }
  return { field, collections, plain, millis, fingerprint, bootstrap, records, mirrorChanges, overlay };
});
