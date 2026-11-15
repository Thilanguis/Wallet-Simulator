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


test('quantity multiplier survives renamed catalogs and reloads, with explicit opt-out', () => {
  const before = Object.fromEntries(['services', 'gains', 'games', 'gameRewards', 'eligible', 'extras'].map((key) => [key, E.config[key]]));
  try {
    const settings = E.defaults('custom'), doc = C.document(settings);
    const gain = doc.gains.find((g) => g.id === 'Tapa de pé na cara');
    assert.equal(gain.quantityMultiplier, true);
    gain.id = 'Atividade renomeada';
    gain.amount = 1;
    const next = C.prepare(doc, settings);
    C.apply(next.catalog);
    assert.equal(E.gain(next.settings, gain.id, 5), 5);
    assert.equal(E.gain(next.settings, gain.id, 1000), next.settings.quantityMax);
    assert.equal(E.gain(next.settings, 'Chupar peito', 5), next.settings.gains['Chupar peito']);
    const reloaded = C.prepare(JSON.parse(JSON.stringify(C.document(next.settings))), next.settings);
    C.apply(reloaded.catalog);
    assert.equal(E.gain(reloaded.settings, gain.id, 3), 3);
    const disabled = C.document(reloaded.settings);
    disabled.gains.find((g) => g.id === gain.id).quantityMultiplier = false;
    const off = C.prepare(disabled, reloaded.settings);
    C.apply(off.catalog);
    assert.equal(E.gain(off.settings, gain.id, 5), 1);
    assert.equal(C.document(off.settings).gains.find((g) => g.id === gain.id).quantityMultiplier, false);
  } finally { C.apply(before); }
});

test('old catalogs retain the existing multiplier and reject invalid flags', () => {
  const settings = E.defaults('custom'), doc = C.document(settings);
  const gain = doc.gains.find((g) => g.id === 'Tapa de pé na cara');
  delete gain.quantityMultiplier;
  assert.equal(C.prepare(doc, settings).catalog.gains.find((g) => g.id === gain.id).quantityMultiplier, true);
  gain.quantityMultiplier = 'true';
  assert.throws(() => C.prepare(doc, settings), /quantityMultiplier/);
});
