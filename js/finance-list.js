(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./finance.js') : root.Finance);
  if (typeof module === 'object') module.exports = api;
  else root.FinanceList = api;
})(typeof window === 'object' ? window : globalThis, function (F) {
  const titles = [
    'Jogo de Buraco 🃏',
    'Jogo de Buscar na Casa da Nathalia 🏃‍♂',
    'Pagando Comida para Luana e Mel 🍔',
    'Pagando Comida para Luana e Adriana 🍲',
    'Perfil - Jogando com a grana 💳',
    'Match Masters - O Jogo das Finanças 🎮💵',
    'Salário Mensal - Drenagem da BITIX 💸',
    'Lista de Compras - O Jogo das Decisões 🛍',
  ];
  const money = (amount, currency) => F.format(amount, currency).replace('US$', '$');
  function value(entry) {
    const original = entry.originalMoney || [],
      brl = original.find((m) => m.currency === 'BRL'),
      usd = original.find((m) => m.currency === 'USD');
    if (entry.currency === 'BRL' && brl?.amount === entry.amount && usd) return money(usd.amount, 'USD') + ' = ' + money(entry.amount, 'BRL');
    if (entry.quantity > 1 && entry.unitAmount * entry.quantity === entry.amount) return money(entry.unitAmount, entry.currency) + ' ×' + entry.quantity;
    return money(entry.amount, entry.currency);
  }
  function sections(entries) {
    return F.categories.map((category, index) => {
      const items = entries.filter((e) => e.category === category),
        rows = [];
      for (const entry of items) {
        const split = / · jogo \d+$/.test(entry.description),
          label = entry.description.replace(/ · jogo \d+$/, '');
        const key = split && entry.sourceText ? entry.sourceText + '|' + entry.status + '|' + entry.currency : null;
        const previous = rows.at(-1);
        if (key && previous?.key === key) {
          previous.entries.push(entry);
          continue;
        }
        rows.push({ key, label: label === category ? '' : label, entries: [entry], note: entry.note || '', noteOnly: entry.description === category && !!entry.note });
      }
      const totals = F.totals(items);
      return { category, title: titles[index], number: index + 1, rows, total: totals.total, foreign: totals.foreign.USD };
    });
  }
  function parts(row, shopping) {
    const status = row.entries[0].status;
    const mark = ['paid', 'pending'].includes(status) ? ' ✅' : status === 'cancelled' ? ' (cancelado)' : ' (reembolsado)';
    return { description: row.noteOnly ? row.note : row.label ? row.label + (shopping ? mark : '') + ':' : '', amount: row.noteOnly ? '' : row.entries.map(value).join(' + '), note: row.noteOnly ? '' : row.note };
  }
  function rowText(row, shopping) {
    const status = row.entries[0].status;
    const mark = ['paid', 'pending'].includes(status) ? ' ✅' : status === 'cancelled' ? ' (cancelado)' : ' (reembolsado)';
    if (row.noteOnly) return row.note;
    return (row.label ? row.label + (shopping ? mark : '') + ': ' : '') + row.entries.map(value).join(' + ') + (row.note ? '\n' + row.note : '');
  }
  function calculate(entries) {
    const groups = sections(entries);
    // Every summary uses the same subtotals, recalculated from current items.
    return { groups, total: groups.reduce((sum, group) => sum + group.total, 0) };
  }
  function text(entries) {
    const { groups, total } = calculate(entries);
    const lines = ['🎮 Resumo de Jogos e Finanças 💰', ''];
    for (const group of groups) {
      lines.push('---', '', group.number + '. ' + group.title + ':');
      for (const row of group.rows) lines.push('• ' + rowText(row, group.category === F.categories[7]));
      if (!group.rows.length) lines.push('• Sem registros neste grupo.');
      lines.push('', 'Total: ' + money(group.total, 'BRL'), '');
    }
    lines.push('---', '', '9. Resumo Final dos Itens 📊', '', ...groups.map((group) => group.number + '. ' + group.category + ' ... ' + money(group.total, 'BRL')), '', 'Total Geral Atualizado 🔥 = ' + money(total, 'BRL'));
    return lines.join('\n');
  }
  return { calculate, sections, rowText, parts, money, text };
});
