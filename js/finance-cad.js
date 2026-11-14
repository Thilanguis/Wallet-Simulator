'use strict';
window.FinanceCad = (() => {
  const F = Finance;
  let enabled = false;
  const cache = new Map(),
    previews = new Map();
  let loading = false;
  const usable = (e) => e.currency === 'BRL' && !['cancelled', 'refunded'].includes(e.status);
  function fromWishes(wishes, basisAmount) {
    if (!wishes.length || wishes.some((w) => w.currency !== 'CAD' || !Number.isFinite(w.originalPrice))) return null;
    const amount = wishes.reduce((sum, w) => {
      const before = Math.round(w.originalPrice * 100) * (w.quantity || 1);
      return sum + before + (w.taxQuebec ? Math.round(before * 0.14975) : 0);
    }, 0);
    return { amount, kind: 'original', source: 'wishlist', basisAmount, methodVersion: 2 };
  }
  function original(entry) {
    if (entry.source !== 'wishlist') return null;
    const wishes = JSON.parse(AppStorage.getItem('wishlist') || '[]').filter((w) => w.purchaseNoteId === entry.id);
    const expected = (entry.note || '').split(/\r?\n/).filter((line) => /^\s*• /.test(line)).length;
    return wishes.length === expected ? fromWishes(wishes, entry.amount) : null;
  }
  function record(entry) {
    const draft = previews.get(entry.id);
    if (draft && draft.baseline === JSON.stringify(entry)) return draft.reference;
    const saved = entry.cadReference;
    if (saved && saved.basisAmount === entry.amount && (saved.kind === 'original' || (saved.methodVersion === 2 && saved.entryDate === entry.date))) return saved;
    return original(entry);
  }
  function label(entry) {
    if (!enabled || !usable(entry)) return '';
    const reference = record(entry);
    if (!reference) return '<small class="note-cad">' + (loading ? 'CAD …' : 'CAD indisponível') + '</small> ';
    const detail =
      reference.kind === 'original'
        ? 'Valor original em CAD'
        : 'Estimativa · 1 CAD = R$ ' +
          reference.rate +
          ' · cotação ' +
          reference.rateDate +
          (reference.method === 'interpolated' ? ' · data interpolada ' + reference.referenceDate : reference.inferredFrom ? ' · data aproximada ' + reference.referenceDate : '') +
          (reference.annualYear ? ' · média anual ' + reference.annualYear : '');
    return '<small class="note-cad" title="' + escapeHTML(detail) + '">' + (reference.kind === 'original' ? '' : '≈ ') + F.format(reference.amount, 'CAD').replace('CA$', 'CAD') + '</small> ';
  }
  function totalLabel(entries) {
    if (!enabled) return '';
    const refs = entries.filter(usable).map(record);
    if (refs.some((r) => !r)) return '<small class="note-cad">' + (loading ? 'Consultando CAD…' : 'CAD total indisponível') + '</small> ';
    return '<small class="note-cad">≈ CAD ' + (refs.reduce((n, r) => n + r.amount, 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</small> ';
  }
  function dateFor(entry, entries) {
    if (F.validDate(entry.date)) return { date: entry.date, method: 'date' };
    const group = entries.filter((e) => e.category === entry.category),
      index = group.findIndex((e) => e.id === entry.id);
    let left = index - 1,
      right = index + 1;
    while (left >= 0 && !F.validDate(group[left].date)) left--;
    while (right < group.length && !F.validDate(group[right].date)) right++;
    if (left >= 0 && right < group.length) {
      const start = Date.parse(group[left].date + 'T12:00:00Z'),
        end = Date.parse(group[right].date + 'T12:00:00Z');
      const date = new Date(start + Math.round((((end - start) / 86400000) * (index - left)) / (right - left)) * 86400000).toISOString().slice(0, 10);
      return { date, method: 'interpolated', inferredFrom: group[left].id + '|' + group[right].id };
    }
    const other = left >= 0 ? group[left] : right < group.length ? group[right] : null;
    if (other) return { date: other.date, method: 'neighbor', inferredFrom: other.id };
    const at = entries.findIndex((e) => e.id === entry.id);
    for (let offset = 1; offset < entries.length; offset++) for (const pos of [at - offset, at + offset]) if (entries[pos] && F.validDate(entries[pos].date)) return { date: entries[pos].date, method: 'annual', inferredFrom: entries[pos].id };
    return null;
  }
  async function annual(date) {
    const year = date.slice(0, 4),
      today = new Date().toISOString().slice(0, 10),
      to = year + '-12-31' < today ? year + '-12-31' : today,
      key = 'annual:' + year;
    if (!cache.has(key))
      cache.set(
        key,
        (async () => {
          const response = await fetch('https://api.frankfurter.dev/v2/rates?base=CAD&quotes=BRL&from=' + year + '-01-01&to=' + to, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw Error('Sem média anual');
          const rows = (await response.json()).filter((r) => r.base === 'CAD' && r.quote === 'BRL' && F.validDate(r.date) && r.date.startsWith(year) && r.date <= to && Number.isFinite(r.rate) && r.rate > 0);
          if (!rows.length) throw Error('Sem média anual');
          return {
            rate: rows.reduce((n, r) => n + r.rate, 0) / rows.length,
            date: rows
              .map((r) => r.date)
              .sort()
              .at(-1),
            annualYear: year,
          };
        })().catch((e) => {
          cache.delete(key);
          throw e;
        }),
      );
    return cache.get(key);
  }
  async function rate(date) {
    if (!cache.has(date))
      cache.set(
        date,
        (async () => {
          const response = await fetch('https://api.frankfurter.dev/v2/rates?base=CAD&quotes=BRL&date=' + date, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) });
          if (!response.ok) throw new Error('Cotação indisponível.');
          const rows = await response.json(),
            row = rows.find((r) => r.base === 'CAD' && r.quote === 'BRL');
          if (!row || !Number.isFinite(row.rate) || row.rate <= 0 || !F.validDate(row.date) || row.date > date) throw new Error('Cotação histórica inválida.');
          return row;
        })().catch((error) => {
          cache.delete(date);
          throw error;
        }),
      );
    return cache.get(date);
  }
  async function referenceFor(entry, entries) {
    const saved = entry.cadReference;
    if (saved?.kind === 'original' && saved.basisAmount === entry.amount) return saved;
    const native = original(entry);
    if (native) return native;
    const basis = dateFor(entry, entries);
    if (!basis) return null;
    let r;
    if (basis.method === 'annual') r = await annual(basis.date);
    else
      try {
        r = await rate(basis.date);
      } catch {
        r = await annual(basis.date);
      }
    return {
      amount: Math.round(entry.amount / r.rate),
      kind: 'estimated',
      methodVersion: 2,
      method: r.annualYear ? 'annual' : basis.method,
      source: 'Frankfurter',
      rate: r.rate,
      rateDate: r.date,
      referenceDate: basis.date,
      entryDate: entry.date,
      basisAmount: entry.amount,
      ...(basis.inferredFrom ? { inferredFrom: basis.inferredFrom } : {}),
      ...(r.annualYear ? { annualYear: r.annualYear } : {}),
    };
  }
  async function prepare(entries, progress) {
    const proposals = [];
    for (const entry of entries.filter(usable)) {
      let reference = null,
        reason = '';
      try {
        reference = await referenceFor(entry, entries);
        if (!reference) reason = 'Sem data ou ano de referência';
      } catch {
        reason = 'Cotação indisponível';
      }
      const p = { id: entry.id, baseline: JSON.stringify(entry), description: entry.description, reference, reason };
      proposals.push(p);
      previews.set(entry.id, p);
      progress?.(proposals.length);
    }
    return proposals;
  }
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('financeShowCad'),
      button = document.getElementById('financePrepareCad');
    toggle.onchange = async () => {
      enabled = toggle.checked;
      button.hidden = !enabled;
      FinanceUI.render();
      if (!enabled || loading) return;
      loading = true;
      toggle.setAttribute('aria-busy', 'true');
      button.disabled = true;
      try {
        await prepare(FinanceUI.getState().entries, () => {
          if (enabled) FinanceUI.render();
        });
      } finally {
        loading = false;
        toggle.removeAttribute('aria-busy');
        button.disabled = false;
        FinanceUI.render();
      }
    };
    button.onclick = async () => {
      button.disabled = true;
      button.textContent = 'Consultando…';
      try {
        const proposals = await prepare(FinanceUI.getState().entries, (n) => (button.textContent = 'Consultando · ' + n));
        const ready = proposals.filter((p) => p.reference),
          dialog = document.createElement('dialog');
        dialog.className = 'note-edit-dialog cad-review';
        dialog.innerHTML =
          '<h2>Referências em CAD</h2><p class="hint">Valores estimados não alteram os gastos em reais nem as datas originais.</p><div class="cad-review-list">' +
          proposals
            .map(
              (p) =>
                '<p><span>' +
                escapeHTML(p.description) +
                '</span><strong>' +
                (p.reference ? F.format(p.reference.amount, 'CAD') : '—') +
                '</strong><small>' +
                escapeHTML(
                  p.reason ||
                    (p.reference.kind === 'original'
                      ? 'Original da Lista de Desejos'
                      : p.reference.referenceDate +
                        ' · ' +
                        (p.reference.annualYear ? 'média anual ' + p.reference.annualYear : 'cotação ' + p.reference.rateDate) +
                        (p.reference.method === 'interpolated' ? ' · data interpolada' : p.reference.inferredFrom ? ' · data aproximada' : '')),
                ) +
                '</small></p>',
            )
            .join('') +
          '</div><button type="button" data-apply>Gravar ' +
          ready.length +
          ' referências</button><button type="button" data-close>Cancelar</button><p role="status"></p>';
        document.body.append(dialog);
        dialog.querySelector('[data-close]').onclick = () => dialog.close();
        dialog.onclose = () => dialog.remove();
        dialog.showModal();
        dialog.querySelector('[data-apply]').disabled = !ready.length;
        dialog.querySelector('[data-apply]').onclick = () => {
          try {
            let next = Finance.validateState(WalletStore.finance());
            for (const p of ready) {
              const entry = next.entries.find((e) => e.id === p.id);
              if (!entry || JSON.stringify(entry) !== p.baseline) throw new Error('Um lançamento mudou. Cancele e confira a prévia novamente.');
              next = F.update(next, { type: 'edit', id: p.id, patch: { cadReference: { ...p.reference, recordedAt: new Date().toISOString() } } });
            }
            FinanceUI.save(next);
            dialog.close();
          } catch (error) {
            dialog.querySelector('[role=status]').textContent = error.message;
          }
        };
      } catch (error) {
        AppDialog.alert(error.message);
      } finally {
        button.disabled = false;
        button.textContent = 'Conferir câmbio';
      }
    };
  });
  return { label, totalLabel, prepare, dateFor, original, fromWishes, referenceFor };
})();
