const { test } = require('node:test'),
  assert = require('node:assert/strict');
const E = require('../js/economy.js'),
  C = require('../js/economy-catalog.js');
test('catalog exposes existing links and accepts new gain extras with additive prices', () => {
  const settings = E.defaults('custom'),
    doc = C.document(settings);
  assert.equal(doc.gains.find((g) => g.id === 'Pés na cara').extras.length, 2);
  assert.equal(doc.gains.find((g) => g.id === 'Cuspir na cara').extras.length, 1);
  doc.gains.push({
    id: 'Atividade de exemplo',
    amount: 10,
    extras: [
      { id: 'extraA', label: 'Adicional A', amount: 2 },
      { id: 'extraB', label: 'Adicional B', amount: 3 },
    ],
  });
  const before = JSON.stringify(E.config),
    next = C.prepare(doc, settings);
  assert.equal(JSON.stringify(E.config), before);
  assert.equal(E.gain(next.settings, 'Atividade de exemplo', 1, ['extraA', 'extraB']), 15);
  assert.deepEqual(next.catalog.gains.at(-1).extras, ['extraA', 'extraB']);
});
test('older catalogs keep links and customized extra prices; explicit empty array removes links', () => {
  const settings = E.defaults('custom'),
    doc = C.document(settings);
  doc.gains.forEach((g) => delete g.extras);
  doc.extras = { ...settings.extras, chkChule: 17 };
  const next = C.prepare(doc, settings);
  assert.equal(next.settings.extras.chkChule, 17);
  assert.deepEqual(next.catalog.gains.find((g) => g.id === 'Pés na cara').extras, ['chkChule', 'chkFrancesinha']);
  doc.gains.find((g) => g.id === 'Pés na cara').extras = [];
  assert.deepEqual(C.prepare(doc, settings).catalog.gains.find((g) => g.id === 'Pés na cara').extras, []);
});
test('invalid additions are rejected without changing active catalog', () => {
  const s = E.defaults('custom'),
    d = C.document(s),
    before = JSON.stringify(E.config);
  d.gains[0].extras = [{ id: 'other', label: 'Additional', amount: -1 }];
  assert.throws(() => C.prepare(d, s), /adicional/);
  assert.equal(JSON.stringify(E.config), before);
});
