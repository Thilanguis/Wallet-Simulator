'use strict';
window.PurchaseEditor = {
  open(entry) {
    const F = Finance,
      decimal = (n) => (n / 100).toFixed(2).replace('.', ','),
      snap = WalletStore.snapshot(),
      wishes = JSON.parse(snap.simulator.wishlist || '[]'),
      business = (e) => JSON.stringify((({ cadReference, updatedAt, ...rest }) => rest)(e)),
      baseline = business(entry),
      parts = PurchaseItems.read(entry, wishes, F),
      pending = new Set(), invalid = new Set();
    const dialog = document.createElement('dialog');
    dialog.className = 'note-edit-dialog purchase-items-editor';
    dialog.innerHTML =
      '<h2>Itens da compra</h2><label>Descrição<input data-description maxlength="1000"></label><label>Data<input data-date type="date"></label><p class="hint">Valores totais por produto, incluindo as unidades.</p><div data-rows></div><button type="button" data-add>+ Item</button><p data-total></p><button type="button" data-save>Salvar compra</button><button type="button" data-close>Cancelar</button><p role="status"></p>';
    dialog.querySelector('[data-description]').value = entry.description;
    dialog.querySelector('[data-date]').value = entry.date;
    const rows = dialog.querySelector('[data-rows]'),
      message = (t) => (dialog.querySelector('[role=status]').textContent = t),
      total = () => (dialog.querySelector('[data-total]').textContent = 'Total · ' + F.format(parts.reduce((n, p) => n + (p.amount || 0), 0)));
    function add(p) {
      const row = document.createElement('div');
      row.className = 'purchase-edit-item';
      for (const [key, label] of [
        ['title', 'Produto'],
        ['store', 'Loja'],
        ['person', 'Pessoa'],
        ['quantity', 'Quantidade'],
        ['amount', 'Total em reais'],
        ['cadAmount', 'Total em CAD'],
      ]) {
        const wrap = document.createElement('label');
        wrap.textContent = label;
        const input = document.createElement('input');
        input.dataset.key = key;
        if (['amount', 'cadAmount'].includes(key)) input.inputMode = 'decimal';
        input.value = ['amount', 'cadAmount'].includes(key) ? (p[key] == null ? '' : decimal(p[key])) : p[key];
        wrap.append(input);
        row.append(wrap);
        input.onchange = () => {
          try {
            if (['amount', 'cadAmount'].includes(key)) {
              p[key] = input.value.trim() ? F.cents(input.value, key === 'cadAmount' ? 'CAD' : 'BRL') : null;
              const revision = (row.revision || 0) + 1;
              row.revision = revision;
              const job = (async () => {
                try {
                  if (p[key] == null) return;
                  const result = p[key] === 0 ? { amount: 0 } :
                    await FinanceCad.convertPair(p[key], key === 'amount' ? 'BRL' : 'CAD', entry.date || FinanceCad.dateFor(entry, FinanceUI.getState().entries)?.date);
                  if (row.revision !== revision) return;
                  const other = key === 'amount' ? 'cadAmount' : 'amount';
                  p[other] = result.amount;
                  row.querySelector('[data-key="' + other + '"]').value = decimal(result.amount);
                  p.cadEstimated = key === 'amount';
                } catch {
                  if (row.revision !== revision) return;
                  if (key === 'cadAmount') {
                    p.amount = null;
                    row.querySelector('[data-key=amount]').value = '';
                  } else if (p.cadEstimated) {
                    p.cadAmount = null;
                    row.querySelector('[data-key=cadAmount]').value = '';
                  }
                  message('Sem cotação: confira os dois valores manualmente.');
                } finally {
                  total();
                }
              })();
              pending.add(job);
              job.finally(() => pending.delete(job));
            } else if (key === 'quantity') {
              const quantity = Number(input.value);
              if (!Number.isSafeInteger(quantity) || quantity < 1) throw Error('Quantidade inválida.');
              const old = p.quantity;
              p.quantity = quantity;
              for (const field of ['amount', 'cadAmount'])
                if (p[field] != null) {
                  p[field] = Math.round((p[field] * quantity) / old);
                  row.querySelector('[data-key="' + field + '"]').value = decimal(p[field]);
                }
            } else p[key] = input.value.trim();
            invalid.delete(input);
            input.removeAttribute('aria-invalid');
            total();
          } catch (e) {
            invalid.add(input);
            input.setAttribute('aria-invalid', 'true');
            message(e.message);
          }
        };
      }
      rows.append(row);
    }
    parts.forEach(add);
    total();
    dialog.querySelector('[data-add]').onclick = () => {
      const part = { id: crypto.randomUUID(), title: '', store: entry.store || '', person: 'Luana', quantity: 1, amount: null, cadAmount: null, cadEstimated: true };
      parts.push(part);
      add(part);
    };
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.onclose = () => dialog.remove();
    dialog.querySelector('[data-save]').onclick = async () => {
      const button = dialog.querySelector('[data-save]');
      const release = UIFeedback.busy(button, 'Salvando…');
      if (!release) return;
      try {
        await Promise.all([...pending]);
        if (invalid.size) {
          invalid.values().next().value.focus();
          throw Error('Corrija os valores marcados antes de salvar.');
        }
        const now = WalletStore.snapshot(),
          current = now.finance.entries.find((e) => e.id === entry.id),
          updated = JSON.parse(now.simulator.wishlist || '[]');
        if (!current || business(current) !== baseline) throw Error('A compra mudou em outro aparelho. Feche e abra novamente.');
        if (parts.some(part => !Number.isSafeInteger(part.amount) || part.amount < 0)) throw Error('Confira o total em reais de cada produto.');
        const amount = parts.reduce((n, p) => n + p.amount, 0),
          cadAmount = parts.every((p) => p.cadAmount != null) ? parts.reduce((n, p) => n + p.cadAmount, 0) : null,
          people = new Map();
        for (const p of parts) {
          p.person = FinancePeople.canonical(p.person);
          people.set(p.person, (people.get(p.person) || 0) + p.amount);
        }
        const stores = PurchaseItems.byStore(parts);
        const store = stores.length === 1 ? stores[0].name : '';
        const description = dialog.querySelector('[data-description]').value;
        const followsStore = entry.source === 'wishlist' && description === entry.description &&
          (entry.description === entry.store || ['Compra da Dominadora', 'Compra da Luana', 'Loja não informada'].includes(entry.description));
        const patch = {
          description: followsStore ? (store || (stores.length > 1 ? 'Compra em várias lojas' : 'Loja não informada')) : description,
          ...(entry.source === 'wishlist' ? { store } : {}),
          date: dialog.querySelector('[data-date]').value,
          purchaseItems: parts,
          amount,
          note: PurchaseItems.note(parts, F, entry.note),
          personAllocations: [...people].filter(([, value]) => value > 0).map(([person, value]) => ({ person, amount: value })),
          cadReference: cadAmount == null ? undefined : { amount: cadAmount, kind: 'original', source: 'purchase-items', basisAmount: amount, methodVersion: 2, recordedAt: new Date().toISOString() },
          ...(!entry.purchaseItems && entry.source !== 'wishlist' ? { purchaseOriginalNote: entry.note || '' } : {}),
        };
        const next = F.update(now.finance, { type: 'edit', id: entry.id, patch });
        for (const p of parts) {
          if (!p.wishId) continue;
          const old = wishes.find((w) => w.id === p.wishId),
            index = updated.findIndex((w) => w.id === p.wishId);
          if (index < 0 || JSON.stringify(old) !== JSON.stringify(updated[index])) throw Error('Um desejo mudou. Abra a compra novamente.');
          updated[index] = { ...updated[index], title: p.title, store: p.store, person: FinancePeople.canonical(old.person || 'Dominadora') === p.person ? (old.person || 'Dominadora') : p.person === 'Luana' ? 'Dominadora' : p.person, personId: FinancePeople.canonical(old.person || 'Dominadora') === p.person ? old.personId : undefined, quantity: p.quantity, purchasePaidBrl: p.amount, purchasePaidCad: p.cadAmount, updatedAt: Date.now() };
        }
        const wishesBefore = now.simulator.wishlist;
        now.simulator.wishlist = JSON.stringify(updated);
        WalletStore.commitBoth(next, now.simulator);
        FinanceUI.rememberChange(now.finance, next, wishesBefore, now.simulator.wishlist);
        window.dispatchEvent(new Event('wallet:remote'));
        window.dispatchEvent(new Event('finance:changed'));
        dialog.close();
        UIFeedback.success('Compra atualizada', parts.length + ' produto(s) · ' + F.format(amount));
      } catch (e) {
        message(e.message);
      } finally {
        release();
      }
    };
    document.body.append(dialog);
    dialog.showModal();
  },
};
