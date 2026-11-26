(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.Finance = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const categories = ['Jogo de Buraco', 'Buscar na Casa da Nathalia', 'Comida para Luana e Mel', 'Comida para Luana e Adriana', 'Perfil', 'Match Masters', 'Salário', 'Lista de Compras'];
  const norm = (text) =>
    String(text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const hash = (text) => {
    let n = 2166136261;
    for (const ch of text) {
      n ^= ch.charCodeAt(0);
      n = Math.imul(n, 16777619);
    }
    return (n >>> 0).toString(16);
  };
  const id = () => globalThis.crypto.randomUUID();
  function cents(value, currency = 'BRL') {
    let text = (currency === 'CAD' ? String(value).replace(/CA\$|C\$|CAD/gi, '') : String(value))
      .replace(/R\$|US\$|USD|BRL|\$/gi, '')
      .trim();
    if (currency === 'CAD' && /^-?\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(text)) text = text.replace(/,/g, '').replace('.', ',');
    if (currency === 'BRL' || currency === 'CAD') {
      // Accept a decimal point from keyboards/autofill as well as Brazilian commas.
      if (/^-?\d+\.\d{1,2}$/.test(text)) text = text.replace('.', ',');
      if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) throw new Error('Valor em ' + currency + ' inválido: ' + value);
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
      if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Valor em dólar inválido.');
    }
    const sign = text.startsWith('-') ? -1 : 1;
    const [whole, fraction = ''] = text.replace('-', '').split('.');
    const amount = sign * (Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
    if (!Number.isSafeInteger(amount)) throw new Error('Valor fora do limite.');
    return amount;
  }
  function validDate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + 'T12:00:00Z')) && new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) === date;
  }
  function validate(entry) {
    if (!entry || !categories.includes(entry.category) || !['paid', 'pending', 'cancelled', 'refunded'].includes(entry.status)) throw new Error('Categoria ou situação inválida.');
    const freePurchase = entry.source === 'wishlist' && entry.currency === 'BRL' && entry.amount === 0 &&
      Array.isArray(entry.purchaseItems) && entry.purchaseItems.length > 0;
    if (!['BRL', 'USD'].includes(entry.currency) || !Number.isSafeInteger(entry.amount) || (entry.amount <= 0 && !freePurchase)) {
      throw new Error('Valor/moeda inválidos.');
    }
    if (entry.date !== '' && !validDate(entry.date)) throw new Error('Data inválida.');
    if (!String(entry.description || '').trim() || String(entry.description).length > 1000 || String(entry.store || '').length > 200) throw new Error('Descrição/loja inválida.');
    if (entry.note !== undefined && (typeof entry.note !== 'string' || entry.note.length > 4000)) throw new Error('Observações inválidas (máximo de 4 mil caracteres).');
    if (entry.originalMoney && (!Array.isArray(entry.originalMoney) || entry.originalMoney.some((m) => !['BRL', 'USD', 'CAD'].includes(m.currency) || !Number.isSafeInteger(m.amount) || m.amount <= 0))) throw new Error('Valores originais inválidos.');
    if (entry.purchaseItems !== undefined) {
      const parts = entry.purchaseItems;
      if (!Array.isArray(parts) || !parts.length || parts.some(p =>
        !p || typeof p.id !== 'string' || !p.id || typeof p.title !== 'string' ||
        !p.title.trim() || p.title.length > 1000 || typeof p.person !== 'string' || !p.person.trim() ||
        !Number.isSafeInteger(p.quantity) || p.quantity < 1 || !Number.isSafeInteger(p.amount) || p.amount < 0 ||
        (p.cadAmount !== null && (!Number.isSafeInteger(p.cadAmount) || p.cadAmount < 0)))) {
        throw new Error('Confira os dados e os valores dos produtos. Informe R$ 0,00 para brindes.');
      }
      if (new Set(parts.map(p => p.id)).size !== parts.length) throw new Error('Há produtos duplicados no lançamento.');
      if (parts.reduce((sum, p) => sum + p.amount, 0) !== entry.amount) {
        throw new Error('Confira os produtos: a soma deve ser igual ao total da compra.');
      }
    }
    if (entry.cadReference !== undefined) {
      const r = entry.cadReference;
      if (!r || !Number.isSafeInteger(r.amount) || r.amount < 0 || !Number.isSafeInteger(r.basisAmount) || (r.basisAmount <= 0 && !(freePurchase && r.basisAmount === 0 && r.amount === 0)) || !['original','estimated'].includes(r.kind) || (r.kind === 'estimated' && (!Number.isFinite(r.rate) || r.rate <= 0 || !validDate(r.rateDate) || !validDate(r.referenceDate)))) throw new Error('Referência em CAD inválida.');
    }
    if (entry.personAllocations !== undefined) {
      if (!Array.isArray(entry.personAllocations) || entry.personAllocations.some(p => !p || typeof p.person !== 'string' || !p.person.trim() || p.person.length > 80 || !Number.isSafeInteger(p.amount) || p.amount <= 0) || entry.personAllocations.reduce((n,p) => n + p.amount, 0) > entry.amount) throw new Error('A divisão por pessoa deve caber no total do lançamento.');
    }
    return { ...entry, description: String(entry.description).trim(), store: String(entry.store || '').trim() };
  }
  function totals(entries, budget = 0) {
    let total = 0,
      pending = 0,
      paid = 0,
      pendingCount = 0;
    const byCategory = Object.fromEntries(categories.map((c) => [c, 0]));
    const foreign = { USD: 0 };
    for (const e of entries) {
      if (['cancelled', 'refunded'].includes(e.status)) continue;
      if (e.currency !== 'BRL') {
        foreign[e.currency] = (foreign[e.currency] || 0) + e.amount;
        continue;
      }
      total += e.amount;
      byCategory[e.category] += e.amount;
      paid += e.amount;
    }
    if (![total, pending, paid, budget - total, ...Object.values(byCategory), ...Object.values(foreign)].every(Number.isSafeInteger)) throw new Error('Total fora do limite seguro.');
    return { total, pending, paid, pendingCount, byCategory, foreign, remaining: budget - total };
  }
  function filtered(entries, filters = {}) {
    return entries
      .filter(
        (e) =>
          (!filters.from || e.date >= filters.from) &&
          (!filters.to || e.date <= filters.to) &&
          (!filters.category || e.category === filters.category) &&
          (!filters.status || e.status === filters.status || (filters.status === 'paid' && e.status === 'pending')) &&
          (!filters.store || norm(e.store).includes(norm(filters.store))),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  function placeWishlistPurchase(entries, entry) {
    const index = entries.findIndex(other => other.category === entry.category && other.date && other.date > entry.date);
    if (index < 0) entries.push(entry);
    else entries.splice(index, 0, entry);
  }
  function update(state, action) {
    const next = structuredClone(state);
    if (action.type === 'add') {
      const entry = validate({ ...action.entry, status: action.entry.status === 'pending' ? 'paid' : action.entry.status, id: action.entry.id || id(), createdAt: new Date().toISOString() });
      if (next.entries.some((e) => e.id === entry.id)) throw new Error('Identificador repetido.');
      if (entry.source === 'wishlist' && entry.date) placeWishlistPurchase(next.entries, entry);
      else next.entries.push(entry);
    } else if (action.type === 'edit') {
      const i = next.entries.findIndex((e) => e.id === action.id);
      if (i < 0) throw new Error('Lançamento não encontrado.');
      const old = next.entries[i];
      next.entries[i] = validate({ ...old, ...action.patch, status: (action.patch.status || old.status) === 'pending' ? 'paid' : action.patch.status || old.status, id: old.id, updatedAt: new Date().toISOString() });
      const after = next.entries[i];
      if (after.source === 'wishlist' && after.date && after.date !== old.date) {
        next.entries.splice(i, 1);
        placeWishlistPurchase(next.entries, after);
      }
      next.audit.push({ id: id(), entryId: old.id, at: new Date().toISOString(), type: 'edit', before: old, after });
    } else if (action.type === 'move') {
      if (!Array.isArray(action.ids) || !action.ids.length || !categories.includes(action.category)) throw new Error('Destino inválido.');
      const ids = new Set(action.ids),
        moving = next.entries.filter((entry) => ids.has(entry.id));
      if (moving.length !== ids.size || moving.some((entry) => entry.redemptionId)) throw new Error('Registro indisponível para mover.');
      const rest = next.entries.filter((entry) => !ids.has(entry.id));
      const target = action.beforeId ? rest.findIndex((entry) => entry.id === action.beforeId && entry.category === action.category) : -1;
      if (action.beforeId && target < 0) throw new Error('Destino mudou. Tente novamente.');
      const at = new Date().toISOString();
      const updated = moving.map((entry) => {
        const after = validate({ ...entry, category: action.category });
        next.audit.push({ id: id(), entryId: entry.id, at, type: 'move', before: entry, after });
        return after;
      });
      const last = rest.findLastIndex((entry) => entry.category === action.category);
      rest.splice(target >= 0 ? target : last >= 0 ? last + 1 : rest.length, 0, ...updated);
      next.entries = rest;
    } else if (action.type === 'deleteMany') {
      if (!Array.isArray(action.ids) || !action.ids.length) throw new Error('Selecione pelo menos um lançamento.');
      const ids = new Set(action.ids),
        entries = next.entries.filter((entry) => ids.has(entry.id));
      if (entries.length !== ids.size) throw new Error('A seleção mudou. Selecione os lançamentos novamente.');
      if (entries.some((entry) => entry.redemptionId)) throw new Error('Registros da integração anterior não podem ser excluídos em lote.');
      const at = new Date().toISOString(),
        batchId = id();
      for (const entry of entries) next.audit.push({ id: id(), entryId: entry.id, at, type: 'delete', batchId, before: entry });
      next.entries = next.entries.filter((entry) => !ids.has(entry.id));
    } else if (action.type === 'delete') {
      const entry = next.entries.find((e) => e.id === action.id);
      if (!entry) throw new Error('Lançamento não encontrado.');
      next.audit.push({ id: id(), entryId: entry.id, at: new Date().toISOString(), type: 'delete', before: entry });
      next.entries = next.entries.filter((e) => e.id !== action.id);
    } else throw new Error('Operação inválida.');
    totals(next.entries, next.budget);
    next.revision++;
    return next;
  }
  const aliases = [
    ['comida para luana e adriana', 'comida luana e adriana'],
    ['comida para luana e mel', 'comida luana e mel'],
  ];
  function categoryFor(text) {
    const n = norm(text).replace(/[*_]/g, '');
    if (aliases[0].some((v) => n.includes(v))) return categories[3];
    if (aliases[1].some((v) => n.includes(v))) return categories[2];
    if (/buraco/.test(n)) return categories[0];
    if (/nathalia/.test(n)) return categories[1];
    if (/match\s*masters/.test(n)) return categories[5];
    if (/perfil/.test(n)) return categories[4];
    if (/salario/.test(n)) return categories[6];
    if (/lista de compras|^\W*(?:\d+[.)\-:]?\s*)?compras\b/.test(n)) return categories[7];
    return null;
  }
  function moneyTokens(line, { canadian = false } = {}) {
    const regex = canadian
      ? /(R\$|US\$|USD|CA\$|C\$|CAD|\$)?\s*(-?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[,.]\d{2})?)(?:\s*(d[oó]lares?|USD|CAD))?/gi
      : /(R\$|US\$|USD|\$)?\s*(-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{2})?)(?:\s*(d[oó]lares?|USD))?/gi;
    const found = [];
    for (const m of line.matchAll(regex)) {
      if (!m[1] && !m[3] && !/[,.]\d{2}$/.test(m[2])) continue;
      // A bare decimal on a date is not money.
      const numberStart = m.index + m[0].indexOf(m[2]);
      if (/[\d/]$/.test(line.slice(Math.max(0, numberStart - 1), numberStart))) continue;
      const symbol = (m[1] || m[3] || '').toUpperCase();
      const explicitUsd = [m[1], m[3]].some(part => /^(?:US[$D])$/i.test(part || ''));
      const currency = !symbol || symbol === 'R$' ? 'BRL' : explicitUsd || !canadian ? 'USD' : 'CAD';
      try {
        const amount = cents(m[2], currency);
        if (amount > 0) found.push({ currency, amount, raw: m[0].trim(), index: m.index, end: m.index + m[0].length });
      } catch {}
    }
    return found;
  }
  const cleanLabel = (text) =>
    text
      .replace(/[✅❌☑✔✗*_]/g, '')
      .replace(/^\s*[•\-–—]+\s*/, '')
      .replace(/^\s*\d+[.)\-:]\s*/, '')
      .replace(/[\s:;=+–—-]+$/, '')
      .trim();
  const identity = (e) => [norm(e.category), norm(e.description), e.currency, e.amount].join('|');
  function preview(text, existing = [], date) {
    if (date && !validDate(date)) throw new Error('Escolha uma data válida ou deixe em branco quando desconhecida.');
    if (text.length > 200000) throw new Error('Lista muito grande (máximo 200 mil caracteres).');
    const rows = [],
      warnings = [],
      subtotals = [],
      notes = new Map(),
      occurrences = new Map();
    let category = null,
      summaryMode = false;
    function emit(line, number, money, labelOverride = '', note = '') {
      const equivalent = /=/.test(line) && money.some((m) => m.currency === 'BRL') && money.some((m) => m.currency === 'USD');
      const groups = equivalent ? [money] : money.map((m) => [m]);
      const label = labelOverride || cleanLabel(line.slice(0, money[0].index)) || category;
      const status = /reembolsad|estornad/i.test(line) ? 'refunded' : /cancelad/i.test(line) ? 'cancelled' : 'paid';
      for (const [j, group] of groups.entries()) {
        const primary = group.find((m) => m.currency === 'BRL') || group[0];
        const quantityMatch = groups.length === 1 && group.length === 1 ? line.slice(primary.end).match(/^\s*[x×]\s*(\d+)/i) : null;
        const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error('Quantidade inválida na linha ' + number + '.');
        const description = label + (groups.length > 1 ? ' · jogo ' + (j + 1) : '');
        const store = category === categories[7] ? label.replace(/\s*\(\d+\)\s*$/, '').trim() : '';
        const semantic = [category, norm(label), group.map((m) => m.currency + ':' + m.amount).join('='), j, ...(quantity > 1 ? ['qty:' + quantity] : [])].join('|');
        const count = (occurrences.get(semantic) || 0) + 1;
        occurrences.set(semantic, count);
        const importKey = 'wa:' + hash(semantic + '|' + count);
        const slot = /\(\d+\)/.test(label) ? category + '|' + norm(label) : null;
        const dateMatch = line.match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/);
        const parsedDate = dateMatch ? dateMatch[3] + '-' + dateMatch[2] + '-' + dateMatch[1] : line.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
        const entry = {
          id: id(),
          date: parsedDate && validDate(parsedDate) ? parsedDate : date || '',
          category,
          description,
          store,
          currency: primary.currency,
          amount: primary.amount * quantity,
          status,
          originalMoney: group.map(({ currency, amount, raw }) => ({ currency, amount, raw })),
          sourceText: line,
          importKey,
          importSlot: slot,
          createdAt: new Date().toISOString(),
          ...(quantity > 1 ? { quantity, unitAmount: primary.amount, note: 'Quantidade: ' + quantity + ' × ' + format(primary.amount, primary.currency) } : {}),
          ...(note ? { note } : {}),
        };
        validate(entry);
        const previous = existing.find((e) => e.importKey === importKey) || existing.find((e) => !e.importKey && identity(e) === identity(entry) && e.date === entry.date);
        const collision = !previous && slot && existing.find((e) => e.importSlot === slot);
        const disposition = previous ? ((previous.status === 'pending' ? 'paid' : previous.status) !== status || previous.amount !== entry.amount || previous.currency !== entry.currency ? 'conflict' : 'duplicate') : collision ? 'conflict' : 'new';
        rows.push({ entry, line: number, disposition, existingId: previous?.id || collision?.id });
      }
    }
    for (const [i, raw] of text.split(/\r?\n/).entries()) {
      const line = raw.trim().replace(/\\$/, '').trim(),
        simple = norm(line)
          .replace(/[*_]/g, '')
          .replace(/^[•\s]+/, '');
      if (!line || /^[\s\-=_\\]+$/.test(line) || /resumo de jogos e financas|^item\s+total/.test(simple)) continue;
      if (/^(?:\d+[.)\-:]\s*)?resumo (?:final|dos itens)/.test(simple)) {
        summaryMode = true;
        continue;
      }
      let money = moneyTokens(line);
      if (/^(?:(?:sub\s*)?total|soma)\b/.test(simple)) {
        const brl = money.find((m) => m.currency === 'BRL');
        if (brl) subtotals.push({ category: /geral/.test(simple) ? null : category, amount: brl.amount, line: i + 1, raw: line });
        continue;
      }
      if (summaryMode) continue;
      const heading = categoryFor(line);
      if (heading && (!money.length || /^\s*\d+[.)\-:]/.test(line))) category = heading;
      if (!money.length) {
        if (!heading && category) {
          notes.set(category, [...(notes.get(category) || []), cleanLabel(line)]);
        } else if (!heading && !/resumo|financas/.test(simple)) warnings.push('Linha ' + (i + 1) + ': sem valor reconhecido; confira se era um item.');
        continue;
      }
      if (!category) {
        warnings.push('Linha ' + (i + 1) + ': categoria não reconhecida; item não importado.');
        continue;
      }
      // An equality in one currency reports a subtotal; an equality across
      // currencies is an explicit equivalence for one purchase.
      if (line.includes('=') && new Set(money.map((m) => m.currency)).size === 1) {
        const eq = line.indexOf('='),
          right = money.filter((m) => m.index >= eq);
        if (right.length === 1 && right[0].currency === 'BRL') {
          subtotals.push({ category, amount: right[0].amount, line: i + 1, raw: line });
          money = money.filter((m) => m.index < eq);
          if (!money.length) continue;
        }
      }
      emit(line, i + 1, money);
    }
    for (const subtotal of subtotals) {
      if (!subtotal.category || rows.some((r) => r.entry.category === subtotal.category)) continue;
      category = subtotal.category;
      const line = subtotal.category + ' — ' + format(subtotal.amount);
      emit(line, subtotal.line, moneyTokens(line), subtotal.category, (notes.get(category) || []).join('\n'));
      warnings.push('Linha ' + subtotal.line + ': categoria sem valores detalhados. O total informado foi sugerido como uma única nota; confira antes de salvar.');
    }
    const computed = totals(rows.map((r) => r.entry));
    for (const subtotal of subtotals) {
      const actual = subtotal.category ? computed.byCategory[subtotal.category] : computed.total;
      if (subtotal.amount !== actual) warnings.push('Linha ' + subtotal.line + ': subtotal informado ' + format(subtotal.amount) + '; recalculado ' + format(actual) + '.');
    }
    if (computed.foreign.USD) warnings.push('Valores somente em USD ficam fora dos totais em reais.');
    return { rows, warnings, totals: computed };
  }
  function commitPreview(state, proposed) {
    let next = state;
    const seen = new Set(state.entries.map((e) => e.importKey).filter(Boolean));
    for (const row of proposed.rows) {
      if (row.disposition !== 'new' || seen.has(row.entry.importKey)) continue;
      // Recheck against the current state, not just an earlier preview.
      if (row.entry.importSlot && next.entries.some((e) => e.importSlot === row.entry.importSlot)) continue;
      next = update(next, { type: 'add', entry: row.entry });
      seen.add(row.entry.importKey);
    }
    return next;
  }
  function duplicates(entries, candidate) {
    return entries.filter((e) => e.currency === candidate.currency && e.amount === candidate.amount && e.date === candidate.date && storeIdentity(e.store) === storeIdentity(candidate.store));
  }
  function storeIdentity(store) {
    const name = norm(store);
    return /\bshein\b/.test(name) ? 'shein' : name.replace(/^lista\s+(?:de\s+)?/, '');
  }
  function nextStoreLabel(entries, store) {
    const used = entries.filter((e) => storeIdentity(e.store) === storeIdentity(store)).map((e) => Number(e.description.match(/\((\d+)\)/)?.[1] || 0));
    return store + ' (' + (Math.max(0, ...used) + 1) + ')';
  }
  function format(amount, currency = 'BRL') {
    return (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency });
  }
  function summary(entries, budget) {
    const t = totals(entries, budget);
    return [
      'Controle Financeiro (filtro atual)',
      ...categories.map((c) => c + ': ' + format(t.byCategory[c])),
      'Total registrado: ' + format(t.total),
      'Pago: ' + format(t.paid),
      'Orçamento: ' + format(budget),
      'Restante após todos os registros: ' + format(t.remaining),
      'Somente USD (fora do total): ' + format(t.foreign.USD, 'USD'),
      '',
      ...filtered(entries).map(
        (e) => `${e.date || 'Data não informada'} ${{ paid: '✅ Pago', pending: '✅ Gasto registrado', cancelled: 'Cancelado', refunded: 'Reembolsado' }[e.status]} ${e.category} · ${e.description}: ${format(e.amount, e.currency)}`,
      ),
    ].join('\n');
  }
  function validateState(data) {
    if (!data || data.version !== 2 || !Number.isSafeInteger(data.budget) || data.budget < 0 || !Number.isSafeInteger(data.revision) || !Array.isArray(data.entries) || !Array.isArray(data.audit)) throw new Error('Backup financeiro inválido.');
    const entries = data.entries.map(validate);
    if (entries.some((e) => typeof e.id !== 'string' || !e.id) || new Set(entries.map((e) => e.id)).size !== entries.length) throw new Error('IDs inválidos ou repetidos.');
    for (const correction of data.audit) {
      if (!correction || typeof correction.type !== 'string' || !Number.isFinite(Date.parse(correction.at))) throw new Error('Registro de correção inválido.');
      if (correction.before) validate(correction.before);
      if (correction.after) validate(correction.after);
    }
    totals(entries, data.budget);
    if (!Array.isArray(data.redemptions) || !data.redemptionRules) throw new Error('Resgates/configuração ausentes no backup.');
    return { ...data, entries };
  }
  const empty = () => ({ version: 2, revision: 0, budget: 0, entries: [], audit: [], redemptions: [], redemptionRules: structuredClone(typeof module === 'object' ? require('./economy-config.js').redemptionRules : EconomyConfig.redemptionRules) });
  return { categories, norm, cents, validDate, validate, totals, filtered, update, preview, commitPreview, duplicates, nextStoreLabel, format, summary, validateState, empty, moneyTokens, categoryFor };
});
