function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, action) {
  const node = element('button', text, 'wish-share-button');
  node.type = 'button';
  node.onclick = action;
  return node;
}

function listItems(host, items) {
  const formatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  host.replaceChildren(...items.map(item => {
    const row = element('li', null, 'wish-people-item');
    const label = element('span', item.title, item.bought ? 'wish-people-bought' : '');
    const details = [item.store, item.quantity > 1 ? '×' + item.quantity : '',
      Number.isFinite(item.originalPrice) ? item.currency + ' ' + formatter.format(item.originalPrice) : '',
      item.bought ? 'Comprado' : ''].filter(Boolean);
    row.append(label, element('small', details.join(' · ')));
    return row;
  }));
  if (!items.length) host.append(element('li', 'Nenhum desejo cadastrado.', 'hint'));
}

export async function showWishlistPeople(getSharing, { signal, personalLink } = {}) {
  document.querySelector('#wishCircleDialog')?.close();
  const dialog = element('dialog', null, 'wish-circle-dialog');
  dialog.id = 'wishCircleDialog';
  dialog.setAttribute('aria-label', 'Pessoas e listas');
  const header = element('header');
  const close = button('×', () => dialog.close());
  close.classList.add('wish-circle-close');
  close.setAttribute('aria-label', 'Fechar pessoas e listas');
  header.append(element('h2', 'Pessoas e listas'), close);
  const feedback = element('p', '', 'hint');
  feedback.setAttribute('role', 'status');
  const shareHeading = element('h3', 'Compartilhar minha lista');
  const inboundHeading = element('h3', 'Compartilhadas comigo');
  const recipient = element('div', null, 'wish-circle-picker');
  const picker = element('select');
  picker.setAttribute('aria-label', 'Escolher conta aprovada');
  const form = element('form');
  const submit = element('button', 'Compartilhar', 'wish-share-button');
  submit.type = 'submit';
  const recipientHelp = element('p', '', 'hint');
  const outgoing = element('ul', null, 'wish-circle-granted');
  const incoming = element('ul');
  const viewer = element('section');
  viewer.hidden = true;
  const viewedTitle = element('h3');
  const viewedItems = element('ul');
  viewer.append(viewedTitle, viewedItems);
  const stops = [];
  let stopView, viewing, profile, busy = false;
  let people = new Map(), sent = [], received = [];
  const failed = () => { feedback.textContent = 'Não foi possível atualizar as listas. Tente novamente.'; };

  recipient.append(picker);
  form.append(recipient, submit);
  const shareCard = element('section', null, 'wish-circle-card');
  shareCard.append(shareHeading, form, recipientHelp, outgoing);
  const receivedCard = element('section', null, 'wish-circle-card');
  receivedCard.append(inboundHeading, incoming);
  dialog.append(header);
  if (personalLink) {
    const mine = element('a', 'Minha lista pessoal', 'wish-share-button');
    mine.href = personalLink;
    dialog.append(mine);
  }
  const footer = element('footer', null, 'wish-circle-footer');
  const back = button('← Voltar à lista', () => dialog.close());
  back.classList.add('wish-circle-back');
  footer.append(back);
  dialog.append(shareCard, receivedCard, viewer, feedback, footer);
  viewer.classList.add('wish-circle-card');
  const closeForSession = () => dialog.close();
  dialog.addEventListener('close', () => {
    stops.splice(0).forEach(stop => stop());
    stopView?.();
    signal?.removeEventListener('abort', closeForSession);
    dialog.remove();
  }, { once: true });
  if (signal?.aborted) return;
  signal?.addEventListener('abort', closeForSession, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  form.hidden = true;
  feedback.textContent = 'Carregando pessoas…';

  function render() {
    const picked = picker.value;
    const targets = [...people].filter(([id]) => id !== profile && !sent.some(grant => grant.recipient === id));
    picker.replaceChildren(new Option('Escolha uma pessoa', ''), ...targets.map(([id, name]) => new Option(name, id)));
    picker.value = targets.some(([id]) => id === picked) ? picked : '';
    form.hidden = !targets.length;
    recipientHelp.textContent = targets.length ? 'As pessoas escolhidas podem ver a sua lista.' :
      (sent.length ? 'Todas as contas disponíveis já receberam acesso.' : 'Nenhuma outra conta aprovada disponível para compartilhar.');
    submit.disabled = busy || !picker.value;
    outgoing.replaceChildren(...sent.filter(item => people.has(item.recipient)).map(({ recipient }) => {
      const row = element('li', null, 'wish-circle-person');
      const remove = button('×', async () => {
        remove.disabled = true;
        try {
          await api.revoke(recipient);
        } catch {
          failed();
          remove.disabled = false;
        }
      });
      remove.classList.add('wish-circle-revoke');
      remove.title = remove.ariaLabel = 'Revogar acesso de ' + people.get(recipient);
      row.append(element('span', people.get(recipient)), remove);
      return row;
    }));
    if (!outgoing.childElementCount) outgoing.append(element('li', 'Sua lista é privada.', 'hint'));
    incoming.replaceChildren(...received.filter(item => people.has(item.owner)).map(({ owner }) => {
      const row = element('li');
      row.append(button(people.get(owner), () => open(owner)));
      return row;
    }));
    if (!incoming.childElementCount) {
      incoming.append(element('li', 'Nenhuma lista compartilhada com você.', 'hint'));
      if (sent.length) incoming.append(element('li', 'Para ver a lista de alguém, essa pessoa precisa compartilhá-la com você.', 'hint'));
    }
    if (viewing && (!people.has(viewing) || !received.some(grant => grant.owner === viewing))) dismiss();
  }

  function dismiss() {
    stopView?.();
    stopView = null;
    viewing = null;
    viewer.hidden = true;
    viewedItems.replaceChildren();
  }
  function open(owner) {
    dismiss();
    if (!people.has(owner)) return;
    viewing = owner;
    viewedTitle.textContent = people.get(owner);
    viewer.hidden = false;
    viewedItems.replaceChildren(element('li', 'Abrindo lista…', 'hint'));
    stopView = api.watchPersonal(owner, items => {
      if (viewing === owner) listItems(viewedItems, items);
    }, () => {
      if (viewing !== owner) return;
      dismiss();
      feedback.textContent = 'Esta lista não está mais disponível.';
    });
  }

  let api;
  try {
    const sharing = await getSharing();
    if (!dialog.open) return;
    ({ api, profile } = sharing);
    picker.onchange = () => { submit.disabled = !picker.value || busy; };
    form.onsubmit = async event => {
      event.preventDefault();
      if (!picker.value || busy) return;
      busy = true;
      submit.disabled = true;
      try {
        await api.grant(picker.value);
        picker.value = '';
      } catch {
        failed();
      } finally {
        busy = false;
        submit.disabled = !picker.value;
      }
    };
    stops.push(api.watchPeople(entries => {
      people = new Map(entries.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(entry => [entry.id, entry.name]));
      feedback.textContent = '';
      render();
    }, failed));
    stops.push(api.watchGrants('owner', entries => { sent = entries; render(); }, failed));
    stops.push(api.watchGrants('recipient', entries => { received = entries; render(); }, failed));
  } catch {
    if (dialog.open) failed();
  }
}

export { listItems as renderReadonlyWishlist };

export function mountWishlistShortcuts(getSharing) {
  const host = document.getElementById('guestSharingShortcuts');
  const outgoing = document.getElementById('guestSharingOutgoing');
  const incoming = document.getElementById('guestSharingIncoming');
  const section = document.getElementById('guestReceivedWish');
  const title = document.getElementById('guestReceivedWishTitle');
  const items = document.getElementById('guestReceivedWishItems');
  const close = document.getElementById('guestCloseReceivedWish');
  const feedback = document.getElementById('guestShortcutStatus');
  const stops = [];
  const pending = new Set();
  let active = true, api, people = new Map(), sent = [], received = [], viewing, stopView;
  function dismiss() {
    viewing = null;
    stopView?.();
    stopView = null;
    section.hidden = true;
    items.replaceChildren();
  }
  function open(owner) {
    if (viewing === owner) {
      dismiss();
      render();
      return;
    }
    dismiss();
    viewing = owner;
    title.textContent = 'Desejos de ' + people.get(owner);
    section.hidden = false;
    items.replaceChildren(element('li', 'Abrindo lista…', 'hint'));
    stopView = api.watchPersonal(owner, wishes => {
      if (active && viewing === owner) listItems(items, wishes);
    }, () => {
      if (!active || viewing !== owner) return;
      dismiss();
      feedback.textContent = 'Esta lista não está mais disponível.';
      render();
    });
    render();
  }
  function render() {
    if (!active) return;
    if (viewing && (!people.has(viewing) || !received.some(grant => grant.owner === viewing))) dismiss();
    const granted = sent.map(({ recipient }) => {
      const name = people.get(recipient) || 'Conta indisponível';
      const chip = element('li', null, 'wish-shortcut-chip');
      const revoke = button('×', async () => {
        pending.add(recipient);
        feedback.textContent = '';
        revoke.disabled = true;
        try {
          await api.revoke(recipient);
        } catch {
          if (active) feedback.textContent = 'Não foi possível retirar o acesso. Tente novamente.';
        } finally {
          pending.delete(recipient);
          render();
        }
      });
      revoke.setAttribute('aria-label', 'Retirar acesso de ' + name);
      revoke.disabled = pending.has(recipient);
      chip.append(element('span', name), revoke);
      return chip;
    });
    const available = received.filter(({ owner }) => people.has(owner)).map(({ owner }) => {
      const chip = element('li', null, 'wish-shortcut-chip');
      const control = button(people.get(owner), () => open(owner));
      control.setAttribute('aria-pressed', String(viewing === owner));
      control.setAttribute('aria-controls', 'guestReceivedWish');
      chip.append(control);
      return chip;
    });
    outgoing.querySelector('ul').replaceChildren(...granted);
    const receivedList = incoming.querySelector('ul');
    receivedList.replaceChildren(...available);
    if (!available.length && granted.length) receivedList.append(element('li', 'Nenhuma lista recebida.', 'hint'));
    outgoing.hidden = !granted.length;
    incoming.hidden = !available.length && !granted.length;
    host.hidden = outgoing.hidden && incoming.hidden && !feedback.textContent;
  }
  close.onclick = () => { dismiss(); render(); };
  const unavailable = () => {
    if (!active) return;
    dismiss();
    sent = [];
    received = [];
    feedback.textContent = 'Não foi possível carregar os atalhos de compartilhamento.';
    render();
  };
  void getSharing().then(({ api: live }) => {
    if (!active) return;
    api = live;
    stops.push(api.watchPeople(entries => {
      people = new Map(entries.map(({ id, name }) => [id, name]));
      render();
    }, unavailable));
    stops.push(api.watchGrants('owner', entries => { sent = entries; render(); }, unavailable));
    stops.push(api.watchGrants('recipient', entries => { received = entries; render(); }, unavailable));
  }).catch(unavailable);
  return () => {
    active = false;
    for (const stop of stops) stop();
    dismiss();
    close.onclick = null;
    feedback.textContent = '';
    host.hidden = true;
    for (const row of [outgoing, incoming]) row.querySelector('ul').replaceChildren();
  };
}
