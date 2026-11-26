(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./finance.js') : root.Finance);
  if (typeof module === 'object') module.exports = api;
  else root.FinancePeople = api;
})(typeof window === 'object' ? window : globalThis, function (F) {
  'use strict';
  const base = ['Luana', 'Tiane', 'Thayanne', 'Tati', 'Natália', 'Bruna', 'Adriana', 'Mel'];
  function identity(name) {
    const value = F.norm(name || '');
    if (value === 'dominadora') return 'luana';
    return value === 'nathalia' ? 'natalia' : value;
  }
  function canonical(name, roster = []) {
    const clean = String(name || '')
      .trim()
      .replace(/\s+/g, ' ');
    const key = F.norm(clean);
    if (['dominadora', 'luana'].includes(key)) return 'Luana';
    const registered = roster.filter(person => person && typeof person.name === 'string');
    const preferred = registered.find(person => F.norm(person.name) === key) ||
      registered.find(person => identity(person.name) === identity(clean));
    if (preferred) return preferred.name;
    if (['natalia', 'nathalia'].includes(key)) return 'Natália';
    return base.find((n) => F.norm(n) === key) || clean;
  }
  function names(roster = []) {
    return [...new Set([...base, ...roster.map((p) => typeof p === 'string' ? p : p.name)].map(name => canonical(name, roster)).filter(Boolean))];
  }
  function allocation(entry, roster = []) {
    if (Array.isArray(entry.personAllocations)) {
      const result = entry.personAllocations.map((p) => ({ person: canonical(p.person, roster), amount: p.amount }));
      const rest = entry.amount - result.reduce((n, p) => n + p.amount, 0);
      if (rest > 0) result.push({ person: 'Luana', amount: rest });
      return result;
    }
    // Purchase notes already carry exact subtotals; product names are not people.
    if (entry.source === 'wishlist') {
      const result = [];
      for (const line of (entry.note || '').split(/\r?\n/)) {
        const match = /^([^•\r\n]+?) · (R\$\s*[\d.]+,\d{2})(?: · contribuição R\$\s*[\d.]+,\d{2})?$/.exec(line);
        if (match) result.push({ person: canonical(match[1], roster), amount: F.cents(match[2]) });
      }
      if (result.length && result.reduce((n, p) => n + p.amount, 0) === entry.amount) return result;
    }
    if (entry.category === F.categories[1]) return [{ person: 'Luana', amount: entry.amount }];
    const text = ' ' + F.norm([entry.category, entry.description, entry.store, entry.note].join(' ')).replace(/[^\p{L}]+/gu, ' ') + ' ';
    const found = names(roster).filter((name) => {
      const variants = identity(name) === 'natalia' ? ['natalia', 'nathalia'] : [F.norm(name)];
      return variants.some((v) => text.includes(' ' + v + ' '));
    });
    const unique = [...new Set(found.map(name => canonical(name, roster)))];
    if (!unique.length) unique.push('Luana');
    const each = Math.floor(entry.amount / unique.length),
      remainder = entry.amount % unique.length;
    return unique.map((person, i) => ({ person, amount: each + (i < remainder ? 1 : 0) }));
  }
  function totals(entries, roster = []) {
    const people = new Map([['Luana', 0]]);
    for (const e of entries) {
      if (e.currency !== 'BRL' || ['cancelled', 'refunded'].includes(e.status)) continue;
      for (const p of allocation(e, roster)) people.set(p.person, (people.get(p.person) || 0) + p.amount);
    }
    return [...people].map(([person, amount]) => ({ person, amount })).sort((a, b) => (a.person === 'Luana' ? -1 : b.person === 'Luana' ? 1 : b.amount - a.amount || a.person.localeCompare(b.person)));
  }
  return { canonical, identity, names, allocation, totals };
});
