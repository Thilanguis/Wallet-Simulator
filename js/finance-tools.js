(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./finance.js') : root.Finance);
  if (typeof module === 'object') module.exports = api;
  else root.FinanceTools = api;
})(typeof window === 'object' ? window : globalThis, function (F) {
  const business = (entries) => JSON.stringify(entries.map(({ cadReference, ...entry }) => entry));
  function capture(before, after, wishesBefore, wishesAfter) {
    if (business(before.entries) === business(after.entries)) return null;
    return { before: structuredClone(before.entries), after: structuredClone(after.entries), wishesBefore, wishesAfter };
  }
  function undo(current, change, wishes) {
    if (!change || business(current.entries) !== business(change.after)) throw Error('A lista mudou depois desta alteração. Confira os lançamentos antes de continuar.');
    if (change.wishesAfter !== undefined && wishes !== change.wishesAfter) throw Error('Os desejos desta compra mudaram. Confira a compra antes de continuar.');
    const next = structuredClone(current),
      after = new Map(change.after.map((e) => [e.id, e])),
      before = new Map(change.before.map((e) => [e.id, e]));
    const at = new Date().toISOString();
    for (const id of new Set([...before.keys(), ...after.keys()]))
      if (JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))) {
        next.audit.push({ id: crypto.randomUUID(), entryId: id, at, type: 'undo', ...(after.has(id) ? { before: after.get(id) } : {}), ...(before.has(id) ? { after: before.get(id) } : {}) });
      }
    if (!next.audit.some((a) => a.at === at && a.type === 'undo')) next.audit.push({ id: crypto.randomUUID(), at, type: 'undo-move' });
    next.entries = structuredClone(change.before);
    next.revision++;
    return { finance: F.validateState(next), wishlist: change.wishesBefore };
  }
  function duplicateGroups(entries) {
    const groups = new Map();
    for (const e of entries) {
      if (!e.date || ['cancelled', 'refunded'].includes(e.status)) continue;
      const name = F.norm(e.store || ''),
        store = /\bshein\b/.test(name) ? 'shein' : name.replace(/^lista\s+(?:de\s+)?/, ''),
        identity = store || F.norm(e.description || '');
      if (!identity) continue;
      const key = JSON.stringify([e.date, e.currency, e.amount, identity]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    return [...groups.values()].filter((group) => group.length > 1);
  }
  return { capture, undo, duplicateGroups };
});
