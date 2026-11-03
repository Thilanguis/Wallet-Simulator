const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  E = require('../js/economy.js');
test('classic prices/gains preserved, balanced nonuniform and catalog complete', () => {
  const a = E.defaults('classic'),
    b = E.defaults('balanced');
  assert.equal(Object.keys(a.prices).length, 17);
  assert.equal(Object.keys(a.gains).length, 13);
  E.config.services.forEach((s) => assert.equal(a.prices[s.id], s.classic));
  assert.ok(new Set(E.config.services.map((s) => s.balanced / s.classic)).size > 5);
  assert.deepEqual(
    E.config.services.slice(0, 12).map((s) => s.balanced),
    [30, 50, 60, 70, 80, 90, 110, 130, 130, 220, 280, 450],
  );
  assert.ok(b.prices[E.config.services[0].id] < a.prices[E.config.services[0].id]);
});
test('quantity bounded, additive extras, configurable bonus and discount precise', () => {
  const s = E.defaults('balanced');
  assert.equal(E.gain(s, E.config.gains[1].id, 999), 60);
  assert.equal(E.gain(s, E.config.gains[3].id, 1, ['chkCatarro']), 35);
  assert.equal(E.adjusted(30, 'cost', true, s), 25.5);
  assert.equal(E.adjusted(12, 'gain', true, s), 13.8);
  s.bonusPercent = 25;
  assert.equal(E.adjusted(12, 'gain', true, s), 15);
});
test('custom catalog validates limits and stores no past operations', () => {
  const s = E.defaults('custom');
  s.prices[E.config.services[0].id] = 22.5;
  s.discountPercent = 10;
  assert.equal(E.validate(s).prices[E.config.services[0].id], 22.5);
  s.timer.autoEvery = 0.01;
  assert.throws(() => E.validate(s));
  assert.throws(() => E.defaults('bad'));
});
test('timer integrates rate changes without retroactive gains, no rate or time caps', () => {
  const s = E.defaults('balanced');
  let t = E.step({ seconds: 0, earnedUnits: 0, rate: 0.5 }, 60, s, true);
  assert.equal(t.earnedUnits / 6000, 0.5);
  assert.equal(t.rate, 0.55);
  t = E.step(t, 60, s, true);
  assert.equal(t.earnedUnits / 6000, 1.05);
  t = E.step(t, 100000, s, true);
  assert.equal(t.seconds, 100120);
  assert.ok(t.rate > 3);
  assert.ok(E.step(t, 60, s, true).seconds > t.seconds);
});
test('roulette catalog 19 sectors, all rewards reference canonical services', () => {
  assert.equal(E.config.roulette.length, 19);
  for (const s of E.config.roulette) if (s.serviceId) assert.ok(E.config.services.some((i) => i.id === s.serviceId));
  assert.equal(E.config.rouletteCooldownMs, 3 * 24 * 3600000);
  assert.equal(E.config.cooldowns[E.config.services[10].id], 336);
});

test('catalog reconciliation accepts new array entries and preserves existing custom prices', () => {
  const previous = E.defaults('custom'),
    baseline = E.defaults('custom');
  previous.prices[E.config.services[0].id] = 31.25;
  E.config.gains.push({ id: 'Atividade teste', classic: 50, balanced: 7 });
  try {
    const result = E.syncCatalog(previous, baseline);
    assert.equal(result.gains['Atividade teste'], 7);
    assert.equal(result.prices[E.config.services[0].id], 31.25);
  } finally {
    E.config.gains.pop();
  }
});

test('dinner quote applies guest supplement before one discount and validates quantities', () => {
  const settings = E.defaults();
  const item = E.config.services.find((item) => item.id === 'Cozinhar jantar');
  assert.deepEqual(E.serviceCost(settings, item, 2, true), { original: 130, extra: 20, discounted: true, final: 110.5 });
  assert.equal(E.serviceCost(settings, item, 0, false).final, 110);
  assert.throws(() => E.serviceCost(settings, item, -1));
  assert.throws(() => E.serviceCost(settings, item, 1.5));
  assert.throws(() => E.validate({ ...E.defaults('custom'), contractRules: { failurePenalty: -1, creamPenalty: 40, dinnerGuestPrice: 10 } }));
});

test('distinct dynamic activity count adds automatic increments without repricing past seconds', () => {
  const s = E.defaults();
  const one = E.step({ seconds: 0, earnedUnits: 0, rate: 0.5 }, 60, s, 1);
  const two = E.step({ seconds: 0, earnedUnits: 0, rate: 0.5 }, 60, s, 2);
  assert.equal(one.earnedUnits, two.earnedUnits);
  assert.equal(one.rate, 0.55);
  assert.equal(two.rate, 0.6);
  assert.throws(() => E.step({ seconds: 0, earnedUnits: 0, rate: 0.5 }, 60, s, -1));
});
