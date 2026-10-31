(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.WalletAcceleration = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const eligible = (name) => name !== 'ACELERAR_GLOBAL_4D_1H' && !/^REDUZIR_BLOQUEIO_/.test(name);
  // Advance from a persisted wall-clock checkpoint, including the last slice at expiry.
  // Legacy budgets imply the last processed instant without replaying the original award.
  function advance(blocks, boosts, now) {
    let reduction = 0;
    const nextBoosts = [];
    for (const original of boosts) {
      const boost = { ...original };
      // Earliest records had no budget/checkpoint: retain their remaining effect,
      // without inventing a deduction for a period that cannot be reconstructed.
      if (boost.budgetLeftMs === undefined && Number.isFinite(boost.perSecondMs) && Number.isFinite(boost.endsAt)) {
        boost.budgetLeftMs = (boost.perSecondMs * Math.max(0, boost.endsAt - now)) / 1000;
        boost.lastAppliedAt = now;
      }
      if (![boost.endsAt, boost.perSecondMs, boost.budgetLeftMs].every(Number.isFinite) || boost.perSecondMs <= 0 || boost.budgetLeftMs < 0) throw new Error('Aceleração salva inválida.');
      if (boost.lastAppliedAt !== undefined && (!Number.isFinite(boost.lastAppliedAt) || boost.lastAppliedAt < 0)) throw new Error('Checkpoint de aceleração inválido.');
      const inferred = boost.endsAt - (boost.budgetLeftMs / boost.perSecondMs) * 1000;
      const from = Number.isFinite(boost.lastAppliedAt) ? boost.lastAppliedAt : Math.max(Number.isFinite(boost.startedAt) ? boost.startedAt : inferred, inferred);
      const until = Math.min(now, boost.endsAt);
      const amount = Math.min(boost.budgetLeftMs, (Math.max(0, until - from) * boost.perSecondMs) / 1000);
      reduction += amount;
      boost.budgetLeftMs = Math.max(0, boost.budgetLeftMs - amount);
      boost.lastAppliedAt = Math.max(from, until);
      if (boost.endsAt > now && boost.budgetLeftMs > 0) nextBoosts.push(boost);
    }
    const nextBlocks = blocks.map((block) => (eligible(block.nome) && block.expiraEm > now && reduction > 0 ? { ...block, expiraEm: Math.max(now, block.expiraEm - reduction) } : { ...block })).filter((block) => block.expiraEm > now);
    return { blocks: nextBlocks, boosts: nextBoosts, reduction };
  }
  function rate(boosts, now) {
    return boosts.filter((b) => b.endsAt > now && b.budgetLeftMs > 0).reduce((sum, b) => sum + b.perSecondMs, 0);
  }
  return { advance, eligible, rate };
});
