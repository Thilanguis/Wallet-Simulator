const { test } = require('node:test'),
  assert = require('node:assert/strict');
const Primary = require('../js/firebase-primary-model.js'),
  Existing = require('../js/firebase-existing-model.js'),
  Finance = require('../js/finance.js');
const template = () => ({ simulator: { saldoDominadora: '0', bonusEspecialAtivo: 'true', economyCatalog: '{"saved":"modern"}', historico: '[{"valor":999}]' }, emptyFinance: Finance.empty() });
const fixture = () => ({ saldoDominadora: 1000, bonusEspecialAtivo: false, timerAtivo: true, timerTempoSegundos: 6, timerValorAtual: 0.19, timerValorPorMinuto: 1.93, tarefasBloqueadas: [], accelBoosts: [] });
test('Firebase bootstrap uses the existing server balance, bonus and timer; local zero is never authoritative', () => {
  const doc = Primary.bootstrap(fixture(), {}, template());
  assert.equal(doc.simulator.saldoDominadora, '1000');
  assert.equal(doc.simulator.bonusEspecialAtivo, 'false');
  assert.equal(doc.simulator.economyCatalog, template().simulator.economyCatalog);
  assert.deepEqual(JSON.parse(doc.simulator.historico), []);
  assert.deepEqual(JSON.parse(doc.financeJson), Finance.empty());
  const timer = JSON.parse(doc.simulator.timerSession);
  assert.equal(timer.earnedUnits, 1140);
  assert.equal(timer.rate, 1.93);
  assert.equal(timer.seconds, 6);
  assert.equal(timer.running, false);
  assert.equal(timer.active, true);
  assert.throws(() => Primary.bootstrap({}, {}, template()), /não foi encontrado/);
});
test('legacy collections retain IDs, statuses, unknown fields and original money without regranting completed tasks', () => {
  const raw = fixture(),
    deadline = 1794000000000;
  const lists = {
    tarefas: [
      { id: 'pending', titulo: 'Exemplo', valor: 65, timestamp: { toMillis: () => deadline } },
      { id: 'locked', titulo: 'Limite', status: 'bloqueada', expiraEm: { toMillis: () => deadline } },
      { id: 'done', titulo: 'Concluída', status: 'concluida' },
    ],
    historico: [{ id: 'old-log', descricao: 'Ganho anterior', valor: 3500, saldoAtual: 4500, timestamp: '2026-10-01T12:00:00Z', tipo: 'ganho', personalized: 123 }],
  };
  const doc = Primary.bootstrap(raw, lists, template());
  const pending = JSON.parse(doc.simulator.tarefasPendentes);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, 'pending');
  assert.equal(pending[0].valor, 65);
  assert.equal(JSON.parse(doc.simulator.tarefasBloqueadas)[0].expiraEm, deadline);
  assert.equal(JSON.parse(doc.simulator.historico)[0].valor, 3500);
  assert.equal(JSON.parse(doc.simulator.historico)[0].personalized, 123);
  assert.equal(raw.saldoDominadora, 1000);
  assert.equal(lists.tarefas[2].status, 'concluida');
});
test('mirror writes only changed records; completion and archival keep records instead of deleting them', () => {
  const doc = Primary.bootstrap(fixture(), { tarefas: [{ id: 'task', tarefa: 'Exemplo', valor: 30 }], historico: [{ id: 'log', valor: 30, saldoAtual: 1000, tipo: 'ganho' }] }, template());
  const next = structuredClone(doc);
  next.simulator.tarefasPendentes = '[]';
  next.simulator.archivedHistory = next.simulator.historico;
  next.simulator.historico = '[]';
  const changes = Primary.mirrorChanges(doc, next);
  assert.equal(changes.find((x) => x.name === 'tarefas').data.status, 'concluida');
  assert.equal(changes.find((x) => x.name === 'historico').data.arquivado, true);
  assert.deepEqual(Primary.mirrorChanges(doc, structuredClone(doc)), []);
});
test('collection snapshots older than the canonical transaction cannot resurrect a completed task', () => {
  const doc = Primary.bootstrap(fixture(), {}, template());
  doc.mirrors.tarefas.task = { revision: 4, hash: 'new' };
  const old = Primary.overlay(doc, { tarefas: [{ id: 'task', titulo: 'Exemplo', status: 'pendente', _walletRevision: 3 }] });
  assert.deepEqual(JSON.parse(old.simulator.tarefasPendentes), []);
  const changed = Primary.overlay(doc, { tarefas: [{ id: 'task', titulo: 'Exemplo', status: 'pendente', _walletRevision: 4 }] });
  assert.equal(JSON.parse(changed.simulator.tarefasPendentes)[0].id, 'task');
});
test('console scalar edits overlay the authenticated canonical wallet without changing finance or catalog', () => {
  const doc = Primary.bootstrap(fixture(), {}, template());
  const next = Existing.read({ [Primary.field]: doc, ...Existing.project(doc), saldoDominadora: 1234.5, bonusEspecialAtivo: true }, Primary.field);
  assert.equal(next.simulator.saldoDominadora, '1234.5');
  assert.equal(next.simulator.bonusEspecialAtivo, 'true');
  assert.equal(next.financeJson, doc.financeJson);
  assert.equal(next.simulator.economyCatalog, doc.simulator.economyCatalog);
});

test('external blocked tasks and supported effects synchronize without converting legacy debug records into prizes', () => {
  const doc = Primary.bootstrap(fixture(), {}, template());
  const lists = {
    tarefas: [{ id: 'locked', titulo: 'Limite', status: 'bloqueada', expiraEm: 1794000000000 }],
    accelBoosts: [
      { id: 'budget', endsAt: 1794000000000, perSecondMs: 1000, budgetLeftMs: 5000, ativo: true },
      { id: 'legacy', multiplicador: 5, ativo: true },
    ],
    debugRoleta: [
      { id: 'debug', resultadoTexto: 'Registro anterior' },
      { id: 'award', kind: 'freeService', serviceId: 'Example', claimed: true, createdAt: '2026-10-01T12:00:00Z' },
    ],
  };
  const next = Primary.overlay(doc, lists);
  assert.equal(JSON.parse(next.simulator.tarefasBloqueadas)[0].id, 'locked');
  assert.deepEqual(
    JSON.parse(next.simulator.accelBoosts).map((item) => item.id),
    ['budget'],
  );
  assert.deepEqual(
    JSON.parse(next.simulator.rouletteAwards).map((item) => [item.id, item.claimed]),
    [['award', true]],
  );
  const done = Primary.overlay(next, { tarefas: [{ ...lists.tarefas[0], status: 'concluida' }] });
  assert.deepEqual(JSON.parse(done.simulator.tarefasBloqueadas), []);
});
test('history mirror identity survives prepending another record; records without IDs are not collapsed', () => {
  const doc = Primary.bootstrap(fixture(), {}, template());
  doc.simulator.historico = JSON.stringify([
    { descricao: 'Sem ID', timestamp: '2026-01-01T00:00:00Z', tipo: 'ganho', valor: 2 },
    { descricao: 'Sem ID', timestamp: '2026-01-01T00:00:00Z', tipo: 'ganho', valor: 2 },
  ]);
  const ids = [...Primary.records(doc).historico.keys()];
  assert.equal(new Set(ids).size, 2);
  const next = structuredClone(doc);
  next.simulator.historico = JSON.stringify([{ id: 'new', descricao: 'Novo', tipo: 'ganho', valor: 4 }, ...JSON.parse(doc.simulator.historico)]);
  assert.deepEqual([...Primary.records(next).historico.keys()].slice(1), ids);
});
