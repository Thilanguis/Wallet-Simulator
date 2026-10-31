(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./economy.js') : root.Economy);
  if (typeof module === 'object') module.exports = api;
  else root.EconomyCatalog = api;
})(typeof window === 'object' ? window : globalThis, function (E) {
  const keys = ['services', 'gains', 'games', 'gameRewards', 'eligible', 'extras'];
  function apply(catalog) {
    for (const key of keys) E.config[key] = catalog[key];
  }
  function document(settings) {
    return {
      services: E.config.services.map((item) => ({
        id: item.id,
        ...(item.label !== item.id ? { label: item.label } : {}),
        description: item.description,
        price: settings.prices[item.id],
        ...(item.reduceHours ? { reduceHours: item.reduceHours } : {}),
        ...(item.taskCount > 1 ? { taskCount: item.taskCount } : {}),
        ...(item.timerEligible ? { timerEligible: true } : {}),
      })),
      gains: E.config.gains.map((item) => ({
        id: item.id,
        amount: settings.gains[item.id],
        ...(item.timerEligible ? { timerEligible: true } : {}),
        extras: (item.extras || []).map((id) => ({ id, label: E.config.extras[id]?.label || id, amount: settings.extras[id] })),
      })),
      games: E.config.games.map((item) => ({ ...item, amount: settings.games[item.id] })),
      contractRules: settings.contractRules,
      timer: settings.timer,
      quantityMax: settings.quantityMax,
      manualGainMax: settings.manualGainMax,
      bonusPercent: settings.bonusPercent,
      discountPercent: settings.discountPercent,
    };
  }
  function prepare(input, current) {
    const catalog = {},
      allIds = new Set();
    catalog.extras = structuredClone(E.config.extras);
    const extraValues = { ...current.extras, ...input?.extras };
    const definitions = new Map();
    for (const group of ['services', 'gains', 'games']) {
      if (!Array.isArray(input?.[group]) || !input[group].length || input[group].length > 300) throw new Error(group + ': informe um array com 1 a 300 itens.');
      catalog[group] = input[group].map((item, index) => {
        if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 200 || /[|\n\r]/.test(item.id) || allIds.has(item.id)) throw new Error(group + ', item ' + (index + 1) + ': id inválido ou repetido.');
        if (item.id === 'Outro') throw new Error('O id Outro é reservado.');
        allIds.add(item.id);
        const amount = group === 'services' ? (item.price ?? item.balanced) : (item.amount ?? item.balanced);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000 || E.round(amount) !== amount) throw new Error(item.id + ': valor deve ser positivo, com até duas casas decimais.');
        const old = E.config[group].find((previous) => previous.id === item.id);
        const result = { ...old, id: item.id, timerEligible: item.timerEligible === true };
        if (group === 'gains') {
          const extras = item.extras ?? (old?.extras || []).map((id) => ({ id, label: E.config.extras[id]?.label || id, amount: extraValues[id] }));
          if (!Array.isArray(extras) || extras.length > 30) throw new Error(item.id + ': extras deve ser um array com até 30 adicionais.');
          const seen = new Set();
          result.extras = extras.map((extra) => {
            if (!extra || typeof extra.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(extra.id) || seen.has(extra.id)) throw new Error(item.id + ': id de adicional inválido ou repetido.');
            if (typeof extra.label !== 'string' || !extra.label.trim() || extra.label.length > 200 || /[\n\r|]/.test(extra.label)) throw new Error(item.id + ': rótulo de adicional inválido.');
            if (!Number.isFinite(extra.amount) || extra.amount <= 0 || extra.amount > 1000000 || E.round(extra.amount) !== extra.amount) throw new Error(item.id + ': valor de adicional inválido.');
            const definition = JSON.stringify([extra.label, extra.amount]);
            if (definitions.has(extra.id) && definitions.get(extra.id) !== definition) throw new Error('Adicional compartilhado com definições diferentes: ' + extra.id);
            definitions.set(extra.id, definition);
            seen.add(extra.id);
            catalog.extras[extra.id] = { ...catalog.extras[extra.id], label: extra.label, balanced: extra.amount, classic: catalog.extras[extra.id]?.classic ?? extra.amount };
            extraValues[extra.id] = extra.amount;
            return extra.id;
          });
        }
        if (group === 'games') {
          result.amount = amount;
          result.scoreBased = item.scoreBased !== false;
        } else {
          result.balanced = amount;
          result.classic = old?.classic ?? item.classic ?? amount;
          if (!Number.isFinite(result.classic) || result.classic <= 0) throw new Error(item.id + ': referência classic inválida.');
        }
        if (group === 'services') {
          result.label = item.label || item.id;
          result.description = item.description || '';
          result.reduceHours = item.reduceHours || 0;
          result.taskCount = item.taskCount ?? old?.taskCount ?? 1;
          if (!Number.isInteger(result.taskCount) || result.taskCount < 1 || result.taskCount > 20) throw new Error(item.id + ': taskCount deve estar entre 1 e 20.');
          if (typeof result.label !== 'string' || typeof result.description !== 'string' || result.description.includes('|') || !Number.isFinite(result.reduceHours) || result.reduceHours < 0)
            throw new Error(item.id + ': campos do serviço inválidos.');
        }
        return result;
      });
    }
    catalog.gameRewards = Object.fromEntries(catalog.games.map((item) => [item.id, item.amount]));
    catalog.eligible = [...catalog.services, ...catalog.gains, ...catalog.games].filter((item) => item.timerEligible).map((item) => item.id);
    const before = Object.fromEntries(keys.map((key) => [key, E.config[key]]));
    try {
      apply(catalog);
      const defaults = E.defaults('custom');
      const settings = E.validate({
        ...current,
        ...defaults,
        mode: 'custom',
        contractRules: input.contractRules || current.contractRules,
        extras: { ...defaults.extras, ...extraValues },
        timer: input.timer,
        quantityMax: input.quantityMax,
        manualGainMax: input.manualGainMax,
        bonusPercent: input.bonusPercent,
        discountPercent: input.discountPercent,
        rouletteWeights: current.rouletteWeights,
        benefits: defaults.benefits,
      });
      return { catalog, settings, baseline: defaults };
    } finally {
      apply(before);
    }
  }
  function format(input) {
    const lines = Object.entries(input).map(([key, value]) => {
      if (Array.isArray(value))
        return (
          '  ' +
          JSON.stringify(key) +
          ': [\n' +
          value
            .map(
              (item) =>
                '    { ' +
                Object.entries(item)
                  .map(([k, v]) => JSON.stringify(k) + ': ' + JSON.stringify(v))
                  .join(', ') +
                ' }',
            )
            .join(',\n') +
          '\n  ]'
        );
      return '  ' + JSON.stringify(key) + ': ' + JSON.stringify(value);
    });
    return '{\n' + lines.join(',\n') + '\n}';
  }
  return { apply, document, prepare, format };
});
