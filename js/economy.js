(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./economy-config.js') : root.EconomyConfig);
  if (typeof module === 'object') module.exports = api;
  else root.Economy = api;
})(typeof window === 'object' ? window : globalThis, function (config) {
  const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const tiers = config.timerTaskTiers;
  function defaults(mode = 'balanced') {
    if (!['classic', 'balanced', 'custom'].includes(mode)) throw new Error('Modo inválido.');
    const base = mode === 'classic' ? 'classic' : 'balanced';
    return {
      mode,
      contractRules: { ...config.contractRules },
      bonusPercent: config.bonusPercent,
      discountPercent: config.discountPercent,
      rouletteWeights: Object.fromEntries(config.roulette.map((s) => [s.label, s.weight])),
      benefits: Object.fromEntries(config.services.filter((s) => s.realBenefit).map((s) => [s.id, { ...s.realBenefit }])),
      prices: Object.fromEntries(config.services.map((s) => [s.id, s[base]])),
      gains: Object.fromEntries(config.gains.map((s) => [s.id, s[base]])),
      extras: Object.fromEntries(Object.entries(config.extras).map(([id, v]) => [id, v[base]])),
      games: { ...config.gameRewards },
      timer: { ...config.timer[base] },
      quantityMax: mode === 'classic' ? config.classicQuantityMax : config.quantityMax,
      manualGainMax: mode === 'classic' ? config.classicManualGainMax : config.manualGainMax,
    };
  }
  function validate(input) {
    if (!input || !['classic', 'balanced', 'custom'].includes(input.mode)) throw new Error('Configuração econômica inválida.');
    if (input.mode !== 'custom') return defaults(input.mode);
    const result = defaults('custom');
    for (const group of ['prices', 'gains', 'extras', 'games', 'timer', 'rouletteWeights']) {
      for (const key of Object.keys(result[group])) {
        const n = input[group]?.[key];
        const validPrecision = group === 'timer' ? Math.abs(Math.round(n * 10000) / 10000 - n) < 1e-9 : round(n) === n;
        if (!Number.isFinite(n) || n <= 0 || n > 1000000 || !validPrecision) throw new Error('Valor inválido em ' + group + ': ' + key);
        result[group][key] = n;
      }
    }
    const rules = input.contractRules || config.contractRules;
    for (const key of Object.keys(config.contractRules)) {
      const value = rules[key];
      if (!Number.isFinite(value) || value < 0 || value > 1000000 || round(value) !== value) throw new Error('Valor inválido em contractRules: ' + key);
      result.contractRules[key] = value;
    }
    for (const key of ['quantityMax', 'manualGainMax']) {
      const n = input[key];
      if (!Number.isFinite(n) || n <= 0 || n > 1000000) throw new Error('Limite inválido: ' + key);
      result[key] = n;
    }
    for (const key of ['bonusPercent', 'discountPercent']) {
      if (!Number.isFinite(input[key]) || input[key] < 0 || input[key] > (key === 'discountPercent' ? 99 : 1000)) throw new Error('Percentual inválido: ' + key);
      result[key] = input[key];
    }
    for (const id of Object.keys(result.benefits)) {
      const b = input.benefits?.[id];
      if (!b || !['BRL', 'USD'].includes(b.currency) || !Number.isSafeInteger(b.amount) || b.amount <= 0) throw new Error('Benefício real inválido.');
      result.benefits[id] = { currency: b.currency, amount: b.amount };
    }
    if (!Number.isInteger(result.timer.autoEvery) || !Number.isInteger(result.quantityMax)) throw new Error('Limites do cronômetro/quantidade inválidos.');
    return result;
  }
  function syncCatalog(saved, baseline) {
    const source = defaults('custom');
    if (!saved || saved.mode !== 'custom') return defaults('balanced');
    const next = { ...saved };
    for (const group of ['prices', 'gains', 'extras', 'games', 'timer', 'rouletteWeights', 'benefits', 'contractRules']) {
      next[group] = { ...source[group], ...saved[group] };
      for (const key of Object.keys(source[group])) {
        if (baseline?.[group] && JSON.stringify(baseline[group][key]) !== JSON.stringify(source[group][key])) next[group][key] = source[group][key];
      }
    }
    for (const key of ['quantityMax', 'manualGainMax', 'bonusPercent', 'discountPercent']) {
      if (baseline && baseline[key] !== source[key]) next[key] = source[key];
    }
    if (!baseline && saved.timer?.autoEvery === 60) {
      if (saved.timer.autoIncrement === 0.05) next.timer.autoIncrement = source.timer.autoIncrement;
      if (saved.timer.taskScale === 0.025) next.timer.taskScale = source.timer.taskScale;
      if (saved.timer.repeatIncrement === 0.01) next.timer.repeatIncrement = source.timer.repeatIncrement;
    }
    return validate(next);
  }
  function gain(settings, id, quantity = 1, extras = []) {
    let amount = settings.gains[id] ?? settings.games[id] ?? 0;
    for (const extra of extras) amount += settings.extras[extra] || 0;
    if (id === 'Tapa de pé na cara') amount *= Math.min(settings.quantityMax, Math.max(1, Math.floor(Number(quantity) || 1)));
    return round(amount);
  }
  function adjusted(value, kind, active, settings = config) {
    return round(value * (active ? (kind === 'gain' ? 1 + settings.bonusPercent / 100 : 1 - settings.discountPercent / 100) : 1));
  }
  function serviceCost(settings, item, guests = 0, bonus = false) {
    if (!Number.isSafeInteger(guests) || guests < 0 || guests > 100) throw new Error('Informe de 0 a 100 amigas.');
    const extra = item.id === 'Cozinhar jantar' ? guests * settings.contractRules.dinnerGuestPrice : 0;
    const original = round(settings.prices[item.id] + extra);
    if (!Number.isFinite(original) || original <= 0) throw new Error('Preço inválido.');
    const discounted = !!bonus && !item.reduceHours && !item.id.startsWith('ACELERAR_');
    return { original, extra: round(extra), discounted, final: adjusted(original, 'cost', discounted, settings) };
  }
  function taskIncrement(value, settings) {
    if (!(value > 0)) return 0;
    // Balanced thresholds use the corresponding classic activity/service value.
    return (tiers.find(([min]) => value >= min)?.[1] || 0.4) * settings.timer.taskScale;
  }
  function step(state, seconds, settings, eligible = false) {
    const count = typeof eligible === 'boolean' ? Number(eligible) : eligible;
    if (!Number.isSafeInteger(count) || count < 0 || count > 1000) throw new Error('Combo dinâmico inválido.');
    const result = { ...state };
    const end = result.seconds + Math.max(0, Math.floor(seconds));
    // Integrate each earned interval at its actual rate; increases never reprice past time.
    while (result.seconds < end) {
      result.earnedUnits = (result.earnedUnits || 0) + Math.round(result.rate * 100);
      result.seconds++;
      if (count && result.seconds % settings.timer.autoEvery === 0) result.rate = round(result.rate + settings.timer.autoIncrement * count);
    }
    return result;
  }
  function drawRoulette(settings, random = Math.random) {
    const weights = config.roulette.map((s) => settings.rouletteWeights[s.label]);
    let sample = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) {
      sample -= weights[i];
      if (sample < 0) return i;
    }
    return weights.length - 1;
  }
  return { config, round, defaults, validate, syncCatalog, gain, adjusted, serviceCost, taskIncrement, step, drawRoulette };
});
