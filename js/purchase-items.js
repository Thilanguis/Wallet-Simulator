(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.PurchaseItems = api;
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';
  function cad(wish) {
    if (wish.currency !== 'CAD' || !Number.isFinite(wish.originalPrice)) return null;
    const base = Math.round(wish.originalPrice * 100) * (wish.quantity || 1);
    return base + (wish.taxQuebec ? Math.round(base * 0.14975) : 0);
  }
  function snapshot(groups) {
    return groups.flatMap((g) => g.wishes.map((w, i) => ({ id: crypto.randomUUID(), wishId: w.id, title: w.title, store: w.store || '', person: g.person, quantity: w.quantity || 1, amount: g.amounts[i], cadAmount: g.amounts[i] === 0 ? 0 : cad(w), cadEstimated: false })));
  }
  function byStore(items) {
    const stores = new Map();
    for (const item of items) {
      const name = (item.store || '').trim().replace(/\s+/g, ' ').normalize('NFC');
      const key = name.toLocaleLowerCase('pt-BR');
      if (!stores.has(key)) stores.set(key, { name, items: [] });
      stores.get(key).items.push(item);
    }
    return [...stores.values()];
  }
  function read(entry, wishes, F) {
    if (entry.purchaseItems) return structuredClone(entry.purchaseItems);
    if (entry.source !== 'wishlist')
      return [{ id: crypto.randomUUID(), title: entry.description, store: entry.store || '', person: 'Luana', quantity: 1, amount: entry.amount, cadAmount: entry.cadReference?.amount ?? null, cadEstimated: entry.cadReference?.kind !== 'original' }];
    const result = [];
    let person = 'Luana';
    const used = new Set();
    for (const line of (entry.note || '').split(/\r?\n/)) {
      const p = /^([^•]+?) · R\$\s*[\d.]+,\d{2}/.exec(line);
      if (p) {
        person = p[1];
        continue;
      }
      const m = /^\s*• (.+?)(?: · Loja: (.+?))? · (R\$\s*[\d.]+,\d{2})$/.exec(line);
      if (!m) continue;
      const title = m[1],
        store = m[2] || entry.store || '';
      const matches = wishes.filter(
        (w) =>
          w.purchaseNoteId === entry.id &&
          !used.has(w.id) &&
          F.norm(w.title + (w.quantity > 1 ? ' ×' + w.quantity : '')) === F.norm(title) &&
          (!store || F.norm(w.store || '') === F.norm(store)) &&
          F.norm(['Luana', 'Dominadora'].includes(w.person || 'Dominadora') ? 'Luana' : w.person) === F.norm(['Luana', 'Dominadora'].includes(person) ? 'Luana' : person),
      );
      const w = matches.length === 1 ? matches[0] : null;
      if (w) used.add(w.id);
      const amount = F.cents(m[3]),
        original = w ? cad(w) : null;
      result.push({
        id: entry.id + ':item:' + result.length,
        ...(w ? { wishId: w.id } : {}),
        title: w ? w.title : title,
        store: store || w?.store || '',
        person,
        quantity: w?.quantity || 1,
        amount,
        cadAmount: original ?? (entry.cadReference?.rate ? Math.round(amount / entry.cadReference.rate) : null),
        cadEstimated: original == null,
      });
    }
    if (!result.length || result.reduce((n, p) => n + p.amount, 0) !== entry.amount) throw Error('Os detalhes antigos não fecham com o total. Corrija os detalhes antes de editar os produtos.');
    return result;
  }
  function note(items, F, oldNote = '') {
    const groups = new Map();
    for (const p of items) {
      if (!groups.has(p.person)) groups.set(p.person, []);
      groups.get(p.person).push(p);
    }
    const lines = [...groups].map(
      ([person, parts]) =>
        person + ' · ' + F.format(parts.reduce((n, p) => n + p.amount, 0)) + '\n' + parts.map((p) => '• ' + p.title + (p.quantity > 1 ? ' ×' + p.quantity : '') + (p.store ? ' · Loja: ' + p.store : '') + ' · ' + F.format(p.amount)).join('\n'),
    );
    const footer = /Contribuições: R\$\s*[\d.]+,\d{2}\nPago pela Dominadora: R\$\s*[\d.]+,\d{2}$/.exec(oldNote);
    if (footer) {
      const contribution = F.cents(footer[0].split('\n')[0].replace('Contribuições: ', '')),
        total = items.reduce((n, p) => n + p.amount, 0);
      if (contribution > total) throw Error('As contribuições excedem o novo total.');
      lines.push('Contribuições: ' + F.format(contribution) + '\nPago pela Dominadora: ' + F.format(total - contribution));
    }
    return lines.join('\n');
  }
  return { cad, snapshot, byStore, read, note };
});
