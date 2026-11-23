import { wishlistAccessAdmin, openWishlistDirectoryEditor } from './wishlist-access.js';

const statusLabels = { pending: 'Pendente', approved: 'Ativa', blocked: 'Revogada' };

function element(tag, text, type) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (type) node.type = type;
  return node;
}

function accountCard(account, assigned) {
  const { email, role, status } = account;
  const card = element('li');
  card.className = 'wish-access-card';
  const header = element('div');
  header.className = 'wish-access-header';
  const identity = element('div');
  identity.className = 'wish-access-identity';
  const badges = element('div');
  badges.className = 'wish-access-badges';
  const state = element('span', statusLabels[status]);
  state.className = 'wish-access-badge';
  state.dataset.status = status;
  const cargo = element('span', { admin: 'Administrador', coadmin: 'Subadministrador', guest: 'Convidado' }[role]);
  cargo.className = 'wish-access-badge';
  badges.append(state, cargo);
  identity.append(element('strong', email), badges);
  const scope = status !== 'approved' ? '' : role !== 'guest' ? 'Acesso à carteira inteira' :
    assigned ? 'Lista de ' + assigned.name + (account.canManagePurchased ? ' · Pode editar itens comprados' : '') : 'Perfil indisponível';
  if (scope) identity.append(element('p', scope));
  header.append(identity);
  card.append(header);
  return { card, header };
}

export async function mountWishlistAccess({ db, role, existingAccounts = [], signal }) {
  const api = await wishlistAccessAdmin(db);
  if (signal.aborted) return;
  const panel = document.getElementById('wishAccessSettings');
  const list = document.getElementById('wishAccessAccounts');
  const status = document.getElementById('wishAccessStatus');
  const admin = role === 'admin';
  const directory = document.getElementById('wishDirectorySync');
  const notice = document.getElementById('wishApprovalNotice');
  let accounts = null;
  notice?.addEventListener('click', () => {
    document.querySelector('[data-panel="backupPanel"]')?.click();
    panel.open = true;
    panel.scrollIntoView({ block: 'start' });
    panel.querySelector('summary')?.focus({ preventScroll: true });
  }, { signal });
  let busy = false;

  function announce(text) { status.textContent = text; }

  async function publishDirectory() {
    const profiles = WishlistAccessModel.projectionPeople(WalletStore.snapshot().simulator);
    const byProfile = new Map(profiles.map(profile => [profile.id, profile.name]));
    const entries = new Map();
    const known = new Set(existingAccounts.map(account => account.email));
    for (const account of existingAccounts) {
      if (account.role === 'admin') entries.set('wallet-admin', { name: 'Gabriel', accountId: '' });
      if (account.ownsPrimaryList) {
        const managed = accounts.find(row => row.uid === 'email:' + account.email);
        if (!managed || managed.status === 'approved') entries.set('primary-luana', { name: 'Luana', accountId: '' });
      }
    }
    for (const account of accounts) {
      if (account.status !== 'approved' || known.has(account.email) || account.uid.startsWith('email:')) continue;
      const name = byProfile.get(account.personId) || (account.role === 'coadmin' ? 'Subadministrador' : '');
      if (name) entries.set('account-' + account.uid, { name, accountId: account.uid });
    }
    const publish = await openWishlistDirectoryEditor(db);
    return publish(entries);
  }
  directory?.addEventListener('click', async () => {
    if (!accounts || directory.disabled) return;
    directory.disabled = true;
    try {
      await publishDirectory();
      announce('Pessoas disponíveis para compartilhar atualizadas.');
    } catch {
      announce('Não foi possível atualizar as pessoas disponíveis.');
    } finally {
      directory.disabled = false;
    }
  }, { signal });

  async function save(account, updates, question) {
    if (busy || signal.aborted) return;
    busy = true;
    try {
      if (!(await AppDialog.confirm(question)) || signal.aborted) return;
      await api.saveAccount(account, updates);
      accounts = [...(accounts || []).filter(row => row.uid !== account.uid), { ...account, ...updates }];
      render();
      if (!signal.aborted) {
        try { await publishDirectory(); }
        catch {
          announce('Acesso atualizado. Use o botão para atualizar as pessoas disponíveis.');
          return true;
        }
      }
      if (!signal.aborted) announce(updates.status === 'blocked' ? 'Acesso revogado.' : 'Acesso atualizado.');
      return true;
    } catch (error) {
      if (!signal.aborted) announce(error.message || 'Não foi possível atualizar o acesso.');
    } finally {
      busy = false;
    }
  }

  function render() {
    const people = WishlistAccessModel.people(WalletStore.snapshot().simulator);
    const existingEmails = new Set(existingAccounts.map(account => account.email.toLowerCase()));
    const authorized = existingAccounts.filter(account => account.role === 'admin')
      .map(account => accountCard({ ...account, status: 'approved' }).card);
    const managed = new Map((accounts || []).filter(account => account.uid.startsWith('email:')).map(account => [account.email, account]));
    const established = existingAccounts.filter(account => account.role !== 'admin').map(account =>
      ({ ...(managed.get(account.email) || { ...account, uid: 'email:' + account.email, status: 'approved', personId: '', canManagePurchased: false }),
        ownsPrimaryList: account.ownsPrimaryList }));
    const requests = (accounts || []).filter(account => !existingEmails.has(account.email.toLowerCase()));
    const ordered = [...established, ...requests].sort((a, b) =>
      Number(b.status === 'pending') - Number(a.status === 'pending') || a.email.localeCompare(b.email, 'pt-BR'));
    const entries = ordered.map(account => {
      const profiles = account.ownsPrimaryList ? [WishlistAccessModel.primaryProfile, ...people] : people;
      const assigned = profiles.find(person => person.id === account.personId);
      const { card, header } = accountCard(account, assigned);
      if (!admin && account.status !== 'pending') return card;

      const primaryAction = account.status === 'pending' ? 'Revisar solicitação' :
        account.status === 'blocked' ? 'Reativar acesso' : 'Editar acesso';
      const actions = element('div');
      actions.className = 'wish-access-actions';
      const edit = element('button', primaryAction, 'button');
      actions.append(edit);
      if (admin && account.status === 'approved') {
        const revoke = element('button', 'Revogar acesso', 'button');
        revoke.className = 'wish-access-revoke';
        revoke.onclick = () => void save(account, { status: 'blocked' },
          'Revogar o acesso de ' + account.email + '? A sessão perderá acesso assim que a alteração for recebida.');
        actions.append(revoke);
      }
      header.append(actions);

      const form = element('form');
      form.className = 'wish-access-form';
      form.hidden = true;
      edit.setAttribute('aria-expanded', 'false');
      function setEditor(open) {
        form.hidden = !open;
        edit.setAttribute('aria-expanded', String(open));
      }
      edit.onclick = () => setEditor(form.hidden);
      const roleLabel = element('label', 'Cargo');
      const selectRole = element('select');
      selectRole.add(new Option('Convidado', 'guest'));
      const canChangeRole = admin && account.status === 'approved';
      if (canChangeRole || account.role === 'coadmin') selectRole.add(new Option('Subadministrador', 'coadmin'));
      selectRole.value = account.role;
      roleLabel.append(selectRole);
      roleLabel.hidden = !canChangeRole;

      const personLabel = element('label', 'Perfil na Lista de Desejos');
      const selectPerson = element('select');
      selectPerson.add(new Option('Escolha a pessoa', ''));
      for (const person of profiles) selectPerson.add(new Option(person.name, person.id));
      selectPerson.value = assigned?.id || '';
      personLabel.append(selectPerson);
      const permissionLabel = element('label');
      const permission = element('input', '', 'checkbox');
      permission.checked = account.canManagePurchased === true;
      permissionLabel.append(permission, document.createTextNode(' Permitir editar e excluir desejos comprados'));
      permissionLabel.className = 'wish-access-permission';
      function fields() {
        const guest = selectRole.value === 'guest';
        if (guest && !selectPerson.value && account.ownsPrimaryList) selectPerson.value = WishlistAccessModel.primaryProfile.id;
        personLabel.hidden = !guest;
        selectPerson.required = guest;
        permissionLabel.hidden = !canChangeRole || !guest;
      }
      selectRole.onchange = fields;
      fields();
      const action = element('button', account.status === 'pending' ? 'Aprovar' : account.status === 'blocked' ? 'Reativar' : 'Salvar acesso', 'submit');
      const controls = element('div');
      controls.className = 'wish-access-actions';
      action.className = 'wish-access-save';
      const cancel = element('button', 'Cancelar edição', 'button');
      cancel.onclick = () => {
        form.reset();
        selectRole.value = account.role;
        selectPerson.value = assigned?.id || '';
        permission.checked = account.canManagePurchased === true;
        fields();
        setEditor(false);
        edit.focus();
      };
      controls.append(action, cancel);
      form.append(roleLabel, personLabel, permissionLabel, controls);
      form.onsubmit = async event => {
        event.preventDefault();
        const newRole = selectRole.value;
        const personId = newRole === 'guest' ? selectPerson.value : '';
        const person = profiles.find(profile => profile.id === personId);
        if (newRole === 'guest' && !person) return announce('Escolha um perfil da Lista de Desejos.');
        const changes = {
          role: newRole, personId, status: 'approved',
          canManagePurchased: newRole === 'guest' && (canChangeRole ? permission.checked : account.canManagePurchased),
        };
        const question = newRole === 'coadmin'
          ? 'Dar acesso à carteira inteira para ' + account.email + ' como subadministrador?'
          : 'Dar acesso à lista de ' + person.name + ' para ' + account.email + '?';
        if (await save(account, changes, question) && card.isConnected) setEditor(false);
      };
      card.append(form);
      return card;
    });
    const empty = accounts && !requests.length ? [element('li', 'Nenhuma solicitação recebida.')] : [];
    list.replaceChildren(...authorized, ...entries, ...empty);
    const count = (accounts || []).filter(account => account.status === 'pending').length;
    if (notice) {
      notice.hidden = count === 0;
      notice.textContent = count === 1 ? '1 solicitação pendente' : count + ' solicitações pendentes';
    }
    if (directory) directory.hidden = !accounts;
  }

  render();
  announce('Carregando solicitações…');
  const stop = api.watchAccounts(next => {
    if (signal.aborted) return;
    accounts = next;
    render();
    if (status.textContent === 'Carregando solicitações…') announce('');
  }, error => {
    if (!signal.aborted) announce(error.message || 'Não foi possível carregar as solicitações.');
  });
  panel.addEventListener('toggle', () => { if (panel.open) render(); }, { signal });
  window.addEventListener('wallet:remote', event => {
    if (panel.open && (event.detail?.initial || event.detail?.changedKeys?.includes('wishlistPeople'))) render();
  }, { signal });
  signal.addEventListener('abort', () => {
    stop();
    if (notice) notice.hidden = true;
    if (directory) directory.hidden = true;
    list.replaceChildren();
    announce('');
  }, { once: true });
}