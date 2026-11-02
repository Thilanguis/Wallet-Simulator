const { test } = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../js/firebase-existing-model.js');
function wallet() {
  return {
    schema: 3,
    revision: 4,
    controller: 'device',
    leaseUntil: 50000,
    financeJson: '{"entries":[{"id":"note-preserved","amount":1234}]}',
    simulator: {
      saldoDominadora: '100.25',
      bonusEspecialAtivo: 'false',
      historico: '[{"id":"history-preserved","valor":30}]',
      roletaUltimoUso: '1793448000000',
      tarefasBloqueadas: '[{"nome":"Exemplo","expiraEm":1793449000000}]',
      accelBoosts: '[]',
      timerSession: JSON.stringify({ seconds: 17, earnedUnits: 8101, rate: 1.5, active: true, running: true, tasks: 2, dynamicActivities: ['Atividade sintética'] }),
      economyCatalog: '{"custom":"preserved"}',
    },
  };
}
test('unchanged root projection round-trips without a write loop or rounding earned units', () => {
  const current = wallet();
  const raw = { walletAtualV3: current, ...M.project(current), unrelated: 'kept elsewhere' };
  assert.equal(raw.timerValorAtual, 1.35);
  assert.equal(raw.roletaUltimoUso, new Date(1793448000000).toISOString());
  assert.deepEqual(M.read(raw), current);
  const minimal = { schema: 3, revision: 1, simulator: {}, financeJson: '{}' };
  assert.deepEqual(M.read({ walletAtualV3: minimal, ...M.project(minimal) }), minimal);
});
test('legacy-only user data is not silently imported into the current wallet', () => {
  assert.equal(M.read({ saldoDominadora: 999, tarefasBloqueadas: [{ nome: 'Old', expiraEm: 1 }] }), null);
});
test('console edits propagate only the edited state, preserving note, catalog and history payloads', () => {
  const current = wallet(),
    raw = { walletAtualV3: current, ...M.project(current) };
  raw.saldoDominadora = 321.5;
  raw.bonusEspecialAtivo = true;
  const actual = M.read(raw);
  assert.equal(actual.simulator.saldoDominadora, '321.5');
  assert.equal(actual.simulator.bonusEspecialAtivo, 'true');
  for (const key of ['historico', 'economyCatalog', 'timerSession']) assert.equal(actual.simulator[key], current.simulator[key]);
  assert.equal(actual.financeJson, current.financeJson);
  assert.equal(current.simulator.saldoDominadora, '100.25');
});
test('timestamp compatibility and legacy timer mirror preserve current combo and task count', () => {
  const current = wallet(),
    raw = { walletAtualV3: current, ...M.project(current) };
  raw.roletaUltimoUso = { toMillis: () => 1793448000000 };
  raw.tarefasBloqueadas = [{ nome: 'Exemplo', expiraEm: { toMillis: () => 1793449000000 } }];
  assert.deepEqual(M.read(raw), current);
  raw.timerTempoSegundos = 25;
  raw.timerValorAtual = 2.5;
  raw.timerRodando = false;
  const timer = JSON.parse(M.read(raw).simulator.timerSession);
  assert.equal(timer.seconds, 25);
  assert.equal(timer.earnedUnits, 15000);
  assert.equal(timer.running, false);
  assert.equal(timer.tasks, 2);
  assert.deepEqual(timer.dynamicActivities, ['Atividade sintética']);
});
test('invalid console data or canonical schema never falls back to an empty wallet', () => {
  for (const patch of [{ saldoDominadora: 'wrong' }, { bonusEspecialAtivo: 'true' }, { roletaUltimoUso: 'invalid' }, { tarefasBloqueadas: null }, { timerTempoSegundos: -1 }, { timerRodando: 'yes' }]) {
    const current = wallet();
    assert.throws(() => M.read({ walletAtualV3: current, ...M.project(current), ...patch }));
  }
  assert.throws(() => M.read({ walletAtualV3: { schema: 99 } }));
});
