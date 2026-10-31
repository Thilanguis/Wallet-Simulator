'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id),
    F = Finance,
    esc = escapeHTML;
  const statusLabels = { paid: 'Gasto registrado ✅', cancelled: 'Cancelado', refunded: 'Reembolsado' };
  const statusLabel = (e) => statusLabels[e.status === 'pending' ? 'paid' : e.status];
  let state;
  try {
    state = F.validateState(WalletStore.finance());
  } catch (error) {
    storageFailure(error);
    return;
  }
  let editing = null,
    proposed = null,
    receiptSuggestion = null,
    previewRevision = null;
  const draftKey = 'findom.notes-import-draft';
  const selectedFinance = new Set();
  function selectableEntries() {
    return F.filtered(state.entries, filters()).filter((entry) => !entry.redemptionId);
  }
  function updateSelection() {
    const visible = selectableEntries(),
      valid = new Set(visible.map((entry) => entry.id));
    for (const id of selectedFinance) if (!valid.has(id)) selectedFinance.delete(id);
    $('selectAllFinance').checked = visible.length > 0 && selectedFinance.size === visible.length;
    $('selectAllFinance').indeterminate = selectedFinance.size > 0 && selectedFinance.size < visible.length;
    $('selectAllFinance').disabled = !visible.length;
    $('financeSelectionCount').textContent = selectedFinance.size + ' selecionados';
    $('deleteSelectedFinance').disabled = !selectedFinance.size;
    for (const box of $('financeHistory').querySelectorAll('[data-select-entry]')) box.checked = selectedFinance.has(box.dataset.selectEntry);
  }
  function rememberDraft(ready = false) {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ text: $('whatsappInput').value, date: $('importDate').value, ready }));
    } catch {
      /* Input stays available even if session storage is full. */
    }
  }
  const today = () => new Date().toLocaleDateString('sv-SE');
  const decimal = (amount) => (amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  for (const key of ['entryCategory', 'financeCategory']) {
    if (key === 'financeCategory') $(key).add(new Option('Todas as categorias', ''));
    F.categories.forEach((c) => $(key).add(new Option(c, c)));
  }
  $('entryDate').value = today();
  $('importDate').value = today();
  document.querySelectorAll('[data-panel]').forEach(
    (button) =>
      (button.onclick = () => {
        if (button.dataset.panel === 'financePanel') {
          state = F.validateState(WalletStore.finance());
          render();
        }
        document.querySelectorAll('.app-panel').forEach((panel) => (panel.hidden = panel.id !== button.dataset.panel));
        document.querySelectorAll('[data-panel]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      }),
  );
  function message(text, error = false) {
    $('financeMessage').className = error ? 'notice error' : 'notice';
    $('financeMessage').textContent = text;
  }
  function save(next) {
    F.validateState(next);
    WalletStore.commitFinance(next);
    state = next;
    render();
    window.dispatchEvent(new Event('finance:changed'));
  }
  const filters = () => ({ from: $('financeFrom').value, to: $('financeTo').value, category: $('financeCategory').value, store: $('financeStore').value, status: $('financeStatus').value });
  function entryHTML(e) {
    return `<article class="finance-entry" data-entry="${esc(e.id)}"><header><label class="entry-select"><input type="checkbox" data-select-entry="${esc(e.id)}" aria-label="Selecionar ${esc(e.description)}" ${e.redemptionId ? 'disabled' : ''} /><strong>${esc(e.description)}</strong></label><strong>${F.format(e.amount, e.currency)}</strong></header><p>${esc(e.date || 'Data não informada')} · ${esc(e.category)}${e.store ? ' · ' + esc(e.store) : ''}</p>${e.note ? `<p class="hint finance-note">${esc(e.note)}</p>` : ''}<span class="status ${e.status}">${statusLabel(e)}</span>${e.redemptionId ? '<span class="status">Registro vinculado · protegido</span>' : ''}<div><button data-action="edit">Editar / corrigir</button><button data-action="status">Alterar situação</button><button data-action="refund">Estornar</button><button data-action="delete" class="danger">Excluir</button></div></article>`;
  }
  function notebookHTML(listEntries, editable = false) {
    const { groups, total } = FinanceList.calculate(listEntries);
    return (
      groups
        .map(
          (group) =>
            '<section class="notebook-group" data-note-group="' +
            esc(group.category) +
            '"><h3>' +
            group.number +
            '. ' +
            esc(group.title) +
            '</h3><ul>' +
            group.rows
              .map((row) => {
                const ids = row.entries.map((entry) => entry.id).join(',');
                const controls = editable && row.entries.every((entry) => !entry.redemptionId);
                return (
                  '<li class="notebook-line ' +
                  row.entries[0].status +
                  (editable ? ' notebook-editable' : '') +
                  '" data-note-ids="' +
                  esc(ids) +
                  '">' +
                  (controls ? '<button type="button" class="note-icon note-grip" draggable="true" data-note-drag aria-label="Mover item" title="Arraste para reordenar ou mudar de grupo. Pelo teclado: Alt + setas.">⠿</button>' : '') +
                  '<span class="note-content">' +
                  esc(FinanceList.rowText(row, group.category === F.categories[7])) +
                  '</span>' +
                  (controls
                    ? '<span class="note-tools">' +
                      row.entries.map((entry) => '<button type="button" class="note-icon" data-note-edit="' + esc(entry.id) + '" aria-label="Editar ' + esc(entry.description) + '" title="Editar">✎</button>').join('') +
                      '<button type="button" class="note-icon note-delete" data-note-delete aria-label="Excluir item" title="Excluir"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/></svg></button></span>'
                    : '') +
                  '</li>'
                );
              })
              .join('') +
            (group.rows.length ? '' : '<li class="hint">Sem registros neste grupo.</li>') +
            '</ul><p class="notebook-subtotal">Total: <output data-group-total="' +
            esc(group.category) +
            '" aria-live="polite"><strong>' +
            F.format(group.total) +
            '</strong></output></p></section>',
        )
        .join('') +
      '<section class="notebook-group notebook-final"><h3>9. Resumo Final dos Itens 📊</h3><ol>' +
      groups.map((group) => '<li><span>' + esc(group.category) + '</span><output data-summary-total="' + esc(group.category) + '"><strong>' + F.format(group.total) + '</strong></output></li>').join('') +
      '</ol><p class="notebook-grand-total">Total Geral Atualizado 🔥 = <output data-grand-total aria-live="polite">' +
      F.format(total) +
      '</output></p><p class="hint">Valores somente em dólar ficam nas linhas originais e fora do total em reais.</p></section>'
    );
  }
  function render() {
    const all = F.totals(state.entries, state.budget),
      entries = F.filtered(state.entries, filters()),
      t = F.totals(entries, state.budget);
    $('groupedFinanceList').innerHTML = notebookHTML(state.entries, true);
    $('homeTotal').textContent = F.format(all.total);
    $('homeRemaining').textContent = F.format(all.remaining);
    $('homeRemaining').classList.toggle('negative', all.remaining < 0);
    $('financeBudget').value = decimal(state.budget);
    $('financeTotals').textContent = `Filtro atual: ${F.format(t.total)} em gastos registrados\nSomente USD, fora dos reais: ${F.format(t.foreign.USD, 'USD')}. Cancelados e reembolsados são excluídos dos totais.`;
    $('categoryTotals').innerHTML = F.categories
      .map(
        (c) =>
          `<details><summary class="category-row"><span>${esc(c)}</span><span>${F.format(t.byCategory[c])}</span></summary>${
            entries
              .filter((e) => e.category === c)
              .map((e) => `<div class="category-note"><p>${esc(e.description)} · <strong>${F.format(e.amount, e.currency)}</strong> · ${statusLabel(e)}</p>${e.note ? `<p class="hint finance-note">${esc(e.note)}</p>` : ''}</div>`)
              .join('') || '<p class="hint">Sem registros neste filtro.</p>'
          }</details>`,
      )
      .join('');
    $('financeHistory').innerHTML = entries.map(entryHTML).join('') || '<p class="hint">Nenhum lançamento neste período.</p>';
    updateSelection();
    $('shareText').value = FinanceList.text(state.entries);
    $('financeAudit').innerHTML =
      state.audit
        .slice()
        .reverse()
        .map(
          (a) =>
            `<p class="hint">${esc(a.at)} · ${esc(a.type)} · ${esc(a.before?.description || a.entryId || 'Configuração')}${a.before?.amount ? ' · antes: ' + F.format(a.before.amount, a.before.currency) : ''}${a.after?.amount ? ' · depois: ' + F.format(a.after.amount, a.after.currency) : ''}</p>`,
        )
        .join('') || '<p class="hint">Nenhuma correção registrada.</p>';
  }
  function resetForm() {
    if (editPopup) {
      closeInlineEditor();
      return;
    }
    editing = null;
    receiptSuggestion = null;
    $('entryForm').reset();
    $('entryFeedback').hidden = true;
    $('entryDate').value = today();
    $('entryOrigin').textContent = '';
    $('entryTitle').textContent = 'Novo lançamento';
    $('saveEntry').textContent = 'Registrar lançamento';
    $('cancelEdit').hidden = true;
  }
  function fill(entry, edit = false) {
    for (const [field, key] of [
      ['Category', 'category'],
      ['Store', 'store'],
      ['Description', 'description'],
      ['Date', 'date'],
      ['Currency', 'currency'],
      ['Status', 'status'],
      ['Note', 'note'],
    ])
      $('entry' + field).value = (key === 'status' && entry[key] === 'pending' ? 'paid' : entry[key]) || '';
    $('entryAmount').value = entry.amount ? decimal(entry.amount) : '';
    editing = edit ? entry.id : null;
    $('entryTitle').textContent = edit ? 'Editar lançamento' : 'Conferir sugestão do comprovante';
    $('saveEntry').textContent = edit ? 'Confirmar correção' : 'Confirmar e registrar compra';
    $('cancelEdit').hidden = false;
    $('entryOrigin').textContent = entry.originalMoney?.length ? 'Valores originais preservados: ' + entry.originalMoney.map((m) => F.format(m.amount, m.currency)).join(' = ') : '';
    if (!editPopup) $('entryForm').scrollIntoView({ block: 'start' });
  }
  $('entryForm').onsubmit = async (event) => {
    event.preventDefault();
    $('entryFeedback').hidden = true;
    const editedId = editing;
    try {
      const candidate = F.validate({
        category: $('entryCategory').value,
        store: $('entryStore').value,
        description: $('entryDescription').value,
        date: $('entryDate').value,
        amount: F.cents($('entryAmount').value, $('entryCurrency').value),
        currency: $('entryCurrency').value,
        status: $('entryStatus').value,
        note: $('entryNote').value.trim(),
      });
      if (editing) {
        const existing = state.entries.find((e) => e.id === editing);
        if (existing.redemptionId) throw new Error('Este lançamento está vinculado a um registro anterior e não pode ser alterado por aqui.');
        if (!(await AppDialog.confirm('Confirmar correção de ' + existing.description + ' para ' + F.format(candidate.amount, candidate.currency) + ' · ' + statusLabels[candidate.status] + '?'))) return;
        save(F.update(state, { type: 'edit', id: editing, patch: candidate }));
      } else {
        const duplicate = F.duplicates(state.entries, candidate);
        if (duplicate.length && !(await AppDialog.confirm('Há registro com a mesma loja, data, valor e moeda. Esta é outra compra?'))) return;
        if (receiptSuggestion && !(await AppDialog.confirm('Confirmar dados conferidos do comprovante e registrar ' + F.format(candidate.amount, candidate.currency) + '?'))) return;
        save(F.update(state, { type: 'add', entry: { ...candidate, ...(receiptSuggestion ? { source: 'receipt', originalMoney: [{ currency: candidate.currency, amount: candidate.amount }] } : {}) } }));
      }
      resetForm();
      message('Lançamento salvo. Totais atualizados.');
      if (editedId) requestAnimationFrame(() => requestAnimationFrame(() => highlightEditedNote(editedId)));
      $('entryFeedback').className = 'notice';
      $('entryFeedback').textContent = 'Lançamento salvo. Totais atualizados.';
      $('entryFeedback').hidden = false;
    } catch (error) {
      $('entryFeedback').className = 'notice error';
      $('entryFeedback').textContent = error.message;
      $('entryFeedback').hidden = false;
      $('entryFeedback').focus({ preventScroll: true });
      $('entryFeedback').scrollIntoView({ block: 'nearest' });
      message(error.message, true);
    }
  };
  let noteHighlightTimer;
  function highlightEditedNote(id) {
    clearTimeout(noteHighlightTimer);
    $('groupedFinanceList')
      .querySelectorAll('.note-just-edited')
      .forEach((row) => row.classList.remove('note-just-edited'));
    const row = Array.from($('groupedFinanceList').querySelectorAll('[data-note-ids]')).find((row) => row.dataset.noteIds.split(',').includes(id));
    if (!row) return;
    row.classList.add('note-just-edited');
    row.tabIndex = -1;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    noteHighlightTimer = setTimeout(() => row.classList.remove('note-just-edited'), 3500);
  }
  const entryHome = $('entryForm').parentElement;
  let editPopup = null,
    draftBeforeEdit = null;
  function closeInlineEditor() {
    if (!editPopup) return;
    const popup = editPopup;
    editPopup = null;
    entryHome.append($('entryTitle'), $('entryForm'));
    popup.close();
    popup.remove();
    resetForm();
    if (draftBeforeEdit) for (const [id, value] of draftBeforeEdit) $(id).value = value;
    draftBeforeEdit = null;
  }
  function openInlineEditor(entry, opener) {
    draftBeforeEdit = Array.from($('entryForm').querySelectorAll('input,select,textarea')).map((el) => [el.id, el.value]);
    editPopup = document.createElement('dialog');
    editPopup.className = 'note-edit-dialog';
    editPopup.setAttribute('aria-labelledby', 'entryTitle');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'note-editor-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Fechar edição');
    close.onclick = closeInlineEditor;
    editPopup.append(close);
    document.body.append(editPopup);
    editPopup.append($('entryTitle'), $('entryForm'));
    editPopup.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeInlineEditor();
      opener?.focus();
    });
    editPopup.showModal();
    fill(entry, true);
    $('entryDescription').focus({ preventScroll: true });
    editPopup.scrollTop = 0;
  }
  const notebook = $('groupedFinanceList');
  notebook.onclick = async (event) => {
    const row = event.target.closest('[data-note-ids]');
    if (!row) return;
    const button = event.target.closest('button');
    if (!button) return;
    try {
      if (button.hasAttribute('data-note-edit'))
        openInlineEditor(
          state.entries.find((entry) => entry.id === button.dataset.noteEdit),
          button,
        );
      if (button.hasAttribute('data-note-delete')) {
        const ids = row.dataset.noteIds.split(',');
        if (!(await AppDialog.confirm(ids.length > 1 ? 'Excluir estes ' + ids.length + ' valores vinculados da lista? Os totais serão recalculados.' : 'Excluir este item da lista? Os totais serão recalculados.'))) return;
        save(F.update(state, { type: 'deleteMany', ids }));
      }
    } catch (error) {
      AppDialog.alert(error.message);
    }
  };
  let dragging = null;
  function clearDrop() {
    notebook.querySelectorAll('.note-drop').forEach((el) => el.classList.remove('note-drop'));
  }
  function destination(target) {
    const group = target?.closest('[data-note-group]');
    if (!group || !notebook.contains(group)) return null;
    const row = target.closest('[data-note-ids]');
    return { group, row, category: group.dataset.noteGroup, beforeId: row?.dataset.noteIds.split(',')[0] };
  }
  function moveTo(target) {
    const dest = destination(target);
    if (!dragging || !dest || dest.row?.dataset.noteIds === dragging) return;
    try {
      save(F.update(state, { type: 'move', ids: dragging.split(','), category: dest.category, beforeId: dest.beforeId }));
      message('Item movido. Totais atualizados.');
    } catch (error) {
      AppDialog.alert(error.message);
    }
  }
  notebook.addEventListener('dragstart', (event) => {
    if (!event.target.closest('[data-note-drag]')) return;
    dragging = event.target.closest('[data-note-ids]').dataset.noteIds;
    event.dataTransfer.setData('text/plain', dragging);
    event.dataTransfer.effectAllowed = 'move';
  });
  notebook.addEventListener('dragover', (event) => {
    if (!dragging) return;
    const dest = destination(event.target);
    if (!dest) return;
    event.preventDefault();
    clearDrop();
    (dest.row || dest.group).classList.add('note-drop');
  });
  notebook.addEventListener('drop', (event) => {
    if (!dragging) return;
    event.preventDefault();
    moveTo(event.target);
    dragging = null;
    clearDrop();
  });
  notebook.addEventListener('dragend', () => {
    dragging = null;
    clearDrop();
  });
  // Touch users drag only by the handle; the rest of the list keeps normal scrolling.
  notebook.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-note-drag]');
    if (!handle || event.pointerType === 'mouse') return;
    dragging = handle.closest('[data-note-ids]').dataset.noteIds;
    handle.setPointerCapture(event.pointerId);
  });
  notebook.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerType === 'mouse') return;
    const dest = destination(document.elementFromPoint(event.clientX, event.clientY));
    clearDrop();
    if (dest) (dest.row || dest.group).classList.add('note-drop');
    if (event.clientY < 70) window.scrollBy(0, -18);
    if (event.clientY > innerHeight - 70) window.scrollBy(0, 18);
  });
  notebook.addEventListener('pointerup', (event) => {
    if (!dragging || event.pointerType === 'mouse') return;
    moveTo(document.elementFromPoint(event.clientX, event.clientY));
    dragging = null;
    clearDrop();
  });
  notebook.addEventListener('pointercancel', (event) => {
    if (event.pointerType === 'mouse') return;
    dragging = null;
    clearDrop();
  });
  notebook.addEventListener('keydown', (event) => {
    if (!event.target.matches('[data-note-drag]') || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const row = event.target.closest('[data-note-ids]'),
      rows = Array.from(notebook.querySelectorAll('[data-note-ids]'));
    const index = rows.indexOf(row),
      next = rows[index + (event.key === 'ArrowUp' ? -1 : 1)];
    if (!next) return;
    dragging = row.dataset.noteIds;
    if (event.key === 'ArrowDown' && next.closest('[data-note-group]') === row.closest('[data-note-group]')) {
      const after = rows[index + 2];
      const group = next.closest('[data-note-group]');
      try {
        save(F.update(state, { type: 'move', ids: dragging.split(','), category: group.dataset.noteGroup, beforeId: after?.closest('[data-note-group]') === group ? after.dataset.noteIds.split(',')[0] : undefined }));
      } catch (error) {
        AppDialog.alert(error.message);
      }
    } else moveTo(next);
    const moved = Array.from(notebook.querySelectorAll('[data-note-ids]')).find((el) => el.dataset.noteIds === dragging);
    moved?.querySelector('[data-note-drag]')?.focus();
    dragging = null;
  });
  $('cancelEdit').onclick = () => (editPopup ? closeInlineEditor() : resetForm());
  document.querySelectorAll('[data-finance-jump]').forEach(
    (button) =>
      (button.onclick = () => {
        const target = button.dataset.financeJump;
        if (target === 'entry') {
          resetForm();
          $('entryForm').scrollIntoView({ block: 'start' });
          $('entryDescription').focus();
          return;
        }
        const toggle = $(target === 'receipt' ? 'receiptToggle' : 'importListToggle');
        toggle.closest('details').open = true;
        toggle.scrollIntoView({ block: 'start' });
        $(target === 'receipt' ? 'receiptFile' : 'whatsappInput').focus();
      }),
  );
  $('entryStore').addEventListener('change', () => {
    if (!editing && !$('entryDescription').value.trim() && $('entryStore').value.trim()) $('entryDescription').value = F.nextStoreLabel(state.entries, $('entryStore').value.trim());
  });
  $('financeHistory').onclick = async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = button.closest('[data-entry]').dataset.entry,
      entry = state.entries.find((e) => e.id === id);
    try {
      if (entry.redemptionId) throw new Error('Este lançamento está vinculado a um registro anterior e não pode ser alterado por aqui.');
      if (button.dataset.action === 'edit') {
        receiptSuggestion = null;
        fill(entry, true);
        return;
      }
      if (button.dataset.action === 'delete') {
        if (!(await AppDialog.confirm('Excluir ' + entry.description + '? A alteração ficará no registro de correções.'))) return;
        save(F.update(state, { type: 'delete', id }));
      } else if (button.dataset.action === 'refund') {
        if (!['paid', 'pending'].includes(entry.status)) throw new Error('Somente lançamentos pagos podem ser reembolsados.');
        if (!(await AppDialog.confirm('Confirmar reembolso de ' + F.format(entry.amount, entry.currency) + '?'))) return;
        save(F.update(state, { type: 'edit', id, patch: { status: 'refunded' } }));
      } else {
        fill(entry, true);
        $('entryStatus').focus();
      }
    } catch (error) {
      message(error.message, true);
    }
  };
  $('financeHistory').addEventListener('change', (event) => {
    const box = event.target.closest('[data-select-entry]');
    if (!box || box.disabled) return;
    if (box.checked) selectedFinance.add(box.dataset.selectEntry);
    else selectedFinance.delete(box.dataset.selectEntry);
    updateSelection();
  });
  $('selectAllFinance').onchange = () => {
    selectedFinance.clear();
    if ($('selectAllFinance').checked) selectableEntries().forEach((entry) => selectedFinance.add(entry.id));
    updateSelection();
  };
  $('deleteSelectedFinance').onclick = async () => {
    try {
      updateSelection();
      const ids = [...selectedFinance];
      if (!ids.length) return;
      if (!(await AppDialog.confirm('Excluir ' + ids.length + ' lançamentos selecionados? Os totais serão atualizados e as exclusões ficarão no registro de correções.'))) return;
      save(F.update(state, { type: 'deleteMany', ids }));
      message(ids.length + ' lançamentos excluídos.');
    } catch (error) {
      message(error.message, true);
    }
  };
  $('saveBudget').onclick = () => {
    try {
      const budget = F.cents($('financeBudget').value);
      if (budget < 0) throw new Error('Orçamento deve ser zero ou positivo.');
      save({ ...state, budget, revision: state.revision + 1 });
      message('Orçamento salvo.');
    } catch (error) {
      message(error.message, true);
    }
  };
  ['financeFrom', 'financeTo', 'financeCategory', 'financeStore', 'financeStatus'].forEach((id) => $(id).addEventListener('input', render));
  $('clearFinanceFilters').onclick = () => {
    ['financeFrom', 'financeTo', 'financeCategory', 'financeStore', 'financeStatus'].forEach((id) => ($(id).value = ''));
    render();
  };
  $('copySummary').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('shareText').value);
      message('Resumo copiado. Escolha a conversa no WhatsApp.');
    } catch {
      $('shareText').select();
      message('Selecione e copie o resumo acima.');
    }
  };
  function renderPreviewTotals() {
    const p = proposed;
    $('importGroupedList').innerHTML = notebookHTML(p.rows.map((row) => row.entry));
    const counts = { new: 0, duplicate: 0, conflict: 0 };
    p.rows.forEach((r) => counts[r.disposition]++);
    const previewWarnings = p.warnings.filter((w) => !w.includes(': sem situação;'));
    $('importWarnings').textContent =
      `${counts.new} novos · ${counts.duplicate} repetidos · ${counts.conflict} divergentes\nTotal extraído: ${F.format(p.totals.total)} (antes de ignorar duplicados).\n` +
      F.categories.map((category) => category + ': ' + F.format(p.totals.byCategory[category])).join('\n') +
      '\n\nDuplicados e divergentes não serão salvos. Use “Conferir existente” para corrigir explicitamente um registro.\n' +
      previewWarnings.join('\n');
  }
  function renderPreview() {
    const p = proposed;
    $('importPreview').hidden = false;
    renderPreviewTotals();
    $('importRows').innerHTML = p.rows
      .map(
        (r, i) =>
          `<div class="preview-row" data-row="${i}"><div class="row-title"><input aria-label="Importar linha ${i + 1}" type="checkbox" ${r.disposition === 'new' ? 'checked' : 'disabled'}><span>Linha ${r.line} · ${esc(r.entry.description)} · ${F.format(r.entry.amount, r.entry.currency)} · ${r.disposition === 'new' ? 'Novo' : r.disposition === 'duplicate' ? 'Já registrado' : 'Divergência'}</span></div>${
            r.disposition === 'new'
              ? `<details><summary>Conferir e corrigir campos</summary><div class="form-grid"><label>Descrição<input data-field="description" value="${esc(r.entry.description)}"></label><label>Loja<input data-field="store" value="${esc(r.entry.store)}"></label><label>Valor<input data-field="amount" value="${decimal(r.entry.amount)}"></label><label>Data<input data-field="date" type="date" value="${esc(r.entry.date)}"></label><label>Moeda<select data-field="currency">${['BRL', 'USD'].map((c) => `<option ${c === r.entry.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>Situação<select data-field="status">${Object.entries(
                  statusLabels,
                )
                  .map(([k, v]) => `<option value="${k}" ${k === r.entry.status ? 'selected' : ''}>${v}</option>`)
                  .join('')}</select></label><label>Categoria<select data-field="category">${F.categories.map((c) => `<option ${c === r.entry.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div></details>`
              : r.existingId
                ? `<button type="button" data-existing="${esc(r.existingId)}">Conferir existente</button>`
                : ''
          }</div>`,
      )
      .join('');
    $('confirmImport').disabled = !p.rows.some((row) => row.disposition === 'new');
  }
  $('previewImport').onclick = () => {
    try {
      proposed = F.preview($('whatsappInput').value, state.entries, $('importDate').value);
      previewRevision = state.revision;
      renderPreview();
      rememberDraft(true);
    } catch (error) {
      message(error.message, true);
    }
  };
  $('importRows').addEventListener('input', (event) => {
    const input = event.target.closest('[data-field]');
    if (!input || !proposed) return;
    const row = proposed.rows[Number(input.closest('[data-row]').dataset.row)];
    try {
      const container = input.closest('[data-row]');
      const entry = { ...row.entry };
      for (const field of container.querySelectorAll('[data-field]')) if (field.dataset.field !== 'amount') entry[field.dataset.field] = field.value;
      entry.amount = F.cents(container.querySelector('[data-field=amount]').value, entry.currency);
      F.validate(entry);
      row.entry = entry;
      proposed.totals = F.totals(proposed.rows.map((row) => row.entry));
      renderPreviewTotals();
    } catch {
      /* Keep the last valid calculation while a value is incomplete. */
    }
  });
  $('importRows').onclick = (event) => {
    const button = event.target.closest('[data-existing]');
    if (button) {
      const entry = state.entries.find((e) => e.id === button.dataset.existing);
      fill(entry, true);
    }
  };
  $('cancelImport').onclick = () => {
    proposed = null;
    $('importPreview').hidden = true;
    sessionStorage.removeItem(draftKey);
    $('whatsappInput').value = '';
  };
  $('confirmImport').onclick = async () => {
    try {
      if (!proposed || previewRevision !== state.revision) throw new Error('Os registros mudaram. Analise a lista novamente antes de confirmar.');
      const rows = proposed.rows.map((r, i) => {
        if (r.disposition !== 'new') return r;
        const container = $('importRows').querySelector(`[data-row="${i}"]`);
        if (!container.querySelector('input[type=checkbox]').checked) return { ...r, disposition: 'skipped' };
        const entry = { ...r.entry };
        for (const input of container.querySelectorAll('[data-field]')) if (input.dataset.field !== 'amount') entry[input.dataset.field] = input.value;
        entry.amount = F.cents(container.querySelector('[data-field=amount]').value, entry.currency);
        F.validate(entry);
        return { ...r, entry };
      });
      const next = F.commitPreview(state, { rows }),
        count = next.entries.length - state.entries.length;
      if (!count) throw new Error('Nenhum item novo selecionado.');
      if (!(await AppDialog.confirm('Salvar ' + count + ' novos lançamentos? Itens repetidos/divergentes serão ignorados.'))) return;
      save(next);
      proposed = null;
      $('importPreview').hidden = true;
      $('whatsappInput').value = '';
      sessionStorage.removeItem(draftKey);
      message(count + ' lançamentos importados.');
    } catch (error) {
      message(error.message, true);
    }
  };
  function suggest(confidence = null) {
    const result = Receipt.suggest($('receiptText').value, state.entries, confidence);
    receiptSuggestion = result;
    $('receiptWarnings').hidden = false;
    $('receiptWarnings').textContent = result.warnings.join('\n');
    fill(result.entry);
    receiptSuggestion = result;
    $('entryOrigin').textContent = result.warnings.join(' ');
  }
  $('processReceipt').onclick = async () => {
    const file = $('receiptFile').files[0];
    $('processReceipt').disabled = true;
    try {
      const result = await recognizeReceipt(file, (text) => ($('ocrProgress').textContent = text));
      $('receiptText').value = result.text;
      suggest(result.confidence);
      $('ocrProgress').textContent = 'Leitura concluída. Confira a sugestão no formulário; nada foi registrado.';
    } catch (error) {
      $('ocrProgress').textContent = error.message + ' O cadastro manual continua disponível.';
    } finally {
      $('processReceipt').disabled = false;
      $('receiptFile').value = '';
    }
  };
  $('suggestReceipt').onclick = () => {
    try {
      if (!$('receiptText').value.trim()) throw new Error('Insira o texto do comprovante.');
      suggest();
    } catch (error) {
      message(error.message, true);
    }
  };
  window.FinanceUI = { getState: () => structuredClone(state), save, message, render };
  $('whatsappInput').addEventListener('input', () => rememberDraft(false));
  $('importDate').addEventListener('input', () => rememberDraft(false));
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    if (draft && typeof draft.text === 'string' && draft.text.length <= 200000 && (draft.date === '' || F.validDate(draft.date))) {
      $('whatsappInput').value = draft.text;
      $('importDate').value = draft.date;
      if (draft.ready) $('previewImport').click();
    }
  } catch {
    /* Invalid drafts never replace the financial ledger. */
  }
  window.addEventListener('redemptions:changed', () => {
    state = F.validateState(WalletStore.finance());
    render();
  });
  window.addEventListener('wallet:remote', (event) => {
    if (event.detail && !event.detail.initial && !event.detail.financeChanged) return;
    state = F.validateState(WalletStore.finance());
    selectedFinance.clear();
    render();
  });
  render();
});
