/* Presentation only: never changes wallet data or waits for an animation to commit. */
window.UIFeedback = (() => {
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const locks = new WeakMap(),
    pulses = new WeakMap();
  let toast, toastTimer, timerNote, timerNoteTimeout;
  function pulse(element) {
    if (!element || !element.isConnected) return;
    clearTimeout(pulses.get(element));
    element.classList.remove('fx-highlight');
    void element.offsetWidth;
    element.classList.add('fx-highlight');
    pulses.set(
      element,
      setTimeout(() => element.classList.remove('fx-highlight'), 750),
    );
  }
  function busy(button, label = 'Registrando…') {
    if (!button || locks.has(button)) return null;
    dismiss();
    const children = [...button.childNodes].filter((node) => !node.classList?.contains('motion-ripple')),
      disabled = button.disabled,
      aria = button.getAttribute('aria-busy');
    locks.set(button, true);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const spinner = document.createElement('span');
    spinner.className = 'fx-button-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = label;
    button.replaceChildren(spinner, text);
    button.classList.add('fx-busy');
    return () => {
      if (!locks.has(button)) return;
      locks.delete(button);
      if (button.contains(spinner)) button.replaceChildren(...children);
      button.disabled = disabled || !WalletStore.isWritable();
      button.classList.remove('fx-busy');
      if (aria === null) button.removeAttribute('aria-busy');
      else button.setAttribute('aria-busy', aria);
    };
  }
  function dismiss() {
    if (toast) toast.hidden = true;
    clearTimeout(toastTimer);
  }
  function expire() {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(dismiss, 4500);
  }
  function success(title, detail = '') {
    if (!toast) {
      toast = document.createElement('aside');
      toast.id = 'operationFeedback';
      toast.className = 'fx-toast';
      toast.hidden = true;
      toast.innerHTML =
        '<span class="fx-success-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><div class="fx-toast-copy" role="status" aria-live="polite" aria-atomic="true"><strong></strong><span></span></div><button type="button" aria-label="Fechar confirmação">×</button>';
      toast.querySelector('button').onclick = dismiss;
      toast.addEventListener('pointerenter', () => clearTimeout(toastTimer));
      toast.addEventListener('pointerleave', expire);
      toast.addEventListener('focusin', () => clearTimeout(toastTimer));
      toast.addEventListener('focusout', expire);
      document.body.append(toast);
    }
    toast.hidden = false;
    toast.querySelector('strong').textContent = title;
    toast.querySelector('.fx-toast-copy > span').textContent = detail;
    toast.classList.remove('fx-arrive');
    void toast.offsetWidth;
    toast.classList.add('fx-arrive');
    expire();
  }
  function amount(value) {
    return formatBR(value);
  }
  function balance(delta) {
    const target = document.getElementById('saldoDominadora');
    pulse(target);
    pulse(document.getElementById('walletBalanceCard'));
    if (!(delta > 0) || reduced() || !target) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width || rect.bottom < 0 || rect.top > innerHeight) return;
    const tag = document.createElement('span');
    tag.className = 'fx-credit-delta';
    tag.setAttribute('aria-hidden', 'true');
    tag.textContent = '+' + amount(delta);
    tag.style.left = Math.max(12, Math.min(innerWidth - 150, rect.left + rect.width / 2)) + 'px';
    tag.style.top = Math.max(12, rect.top) + 'px';
    document.body.append(tag);
    setTimeout(() => tag.remove(), 1000);
  }
  function wallet(kind, title, value, original) {
    balance(kind === 'gain' ? value : 0);
    success(kind === 'gain' ? 'Crédito registrado' : 'Privilégio adquirido', title + ' · ' + amount(value) + (original > value ? ' · economia de ' + amount(original - value) : ''));
  }
  function depart(element) {
    if (!element || reduced()) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || rect.bottom < 0 || rect.top > innerHeight) return;
    const ghost = element.cloneNode(true);
    ghost.classList.add('fx-departure');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    Object.assign(ghost.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    document.body.append(ghost);
    setTimeout(() => ghost.remove(), 400);
  }
  function wishes(ids, bought = true) {
    const selected = new Set(ids);
    if (bought && document.getElementById('wishHideBought')?.checked)
      [...document.querySelectorAll('#wishList [data-wish-id]')]
        .filter((row) => selected.has(row.dataset.wishId))
        .slice(0, 12)
        .forEach(depart);
    requestAnimationFrame(() => {
      for (const row of document.querySelectorAll('#wishList [data-wish-id]'))
        if (selected.has(row.dataset.wishId)) {
          pulse(row);
          if (bought && !reduced()) {
            row.classList.add('fx-wish-bought');
            setTimeout(() => row.classList.remove('fx-wish-bought'), 750);
          }
        }
      pulse(document.getElementById('wishTotal'));
      pulse(document.getElementById('homeTotal'));
    });
  }
  function timer(text) {
    const area = document.getElementById('contadorBloco');
    if (!area) return;
    if (!timerNote) {
      timerNote = document.createElement('span');
      timerNote.id = 'timerMotionStatus';
      timerNote.className = 'fx-timer-note';
      timerNote.setAttribute('role', 'status');
      area.append(timerNote);
    }
    timerNote.textContent = text;
    timerNote.hidden = false;
    pulse(area);
    clearTimeout(timerNoteTimeout);
    timerNoteTimeout = setTimeout(() => {
      timerNote.hidden = true;
    }, 2500);
  }
  function task(name, part, count, complete, row) {
    if (complete) {
      depart(row);
      success('Tarefa concluída', name + (count > 1 ? ' · ' + count + ' etapas concluídas' : ''));
    } else {
      pulse(row);
      success('Etapa concluída', name + ' · ' + part + ' de ' + count);
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    let previous = document.getElementById('bonusEspecialCheckbox')?.checked;
    document.getElementById('bonusEspecialCheckbox')?.addEventListener('change', (event) => {
      const next = event.target.checked;
      if (next !== previous && (event.isTrusted || event.detail?.userAction)) {
        pulse(document.getElementById('privilegeSeal'));
        pulse(document.getElementById('walletBalanceCard'));
      }
      previous = next;
    });
    // Totals are already rendered by their owner; only briefly accent a changed value.
    for (const id of ['homeTotal', 'financeCadTotal', 'wishTotal']) {
      const node = document.getElementById(id);
      if (!node) continue;
      let previousText = node.textContent;
      new MutationObserver(() => {
        const text = node.textContent;
        if (text !== previousText && node.getClientRects().length) pulse(node);
        previousText = text;
      }).observe(node, { childList: true, subtree: true, characterData: true });
    }
  });
  return { busy, pulse, success, balance, wallet, depart, wishes, timer, task };
})();
