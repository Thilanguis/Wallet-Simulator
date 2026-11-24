import { showWishlistPeople, renderReadonlyWishlist, mountWishlistShortcuts } from './wishlist-people.js';
import { googleAuth } from './firebase-google-auth.js';
import { openWishlistAccess } from './wishlist-access.js';

const $ = (id) => document.getElementById(id);
const selection = new Set();
const personalPage = new URLSearchParams(location.search).has('pessoal');
let giftItems = [];
let session, access, stopAccount, stopList, stopShortcuts;
let generation = 0, listGeneration = 0, requestGeneration = -1;
let state, personId, listName, items = [], itemChecks = new Map(), canManagePurchased = false;
const canManageItem = item => !item.bought || canManagePurchased;

const notices = {
  loading: ['Conferindo seu acesso', ''],
  login: ['Entre para ver sua lista', 'Use sua conta Google para acessar a Lista de Desejos.'],
  request: ['Solicite acesso à lista', 'O acesso fica disponível após a aprovação.'],
  pending: ['Solicitação enviada', 'Aguarde a aprovação para acessar sua Lista de Desejos.'],
  blocked: ['Acesso indisponível', 'Esta conta não tem acesso à Lista de Desejos.'],
  wallet: ['Sua lista está na carteira', 'Entre na carteira para abrir a Lista de Desejos.'],
  unavailable: ['Lista de Desejos indisponível', 'Não foi possível conferir o acesso.'],
  error: ['Não foi possível abrir a lista', 'Verifique a conexão e tente novamente.'],
};

function show(next, message) {
  state = next;
  $('guestAccess').hidden = next === 'list';
  $('guestWishlist').hidden = next !== 'list';
  $('guestHeadingActions').hidden = next !== 'list';
  $('guestGifts').hidden = next !== 'list' || !giftItems.length;
  $('guestSignIn').hidden = next !== 'login';
  $('guestRequest').hidden = next !== 'request';
  $('guestRequest').disabled = requestGeneration === generation;
  $('guestRetry').hidden = !['error', 'unavailable'].includes(next);
  $('guestWalletLink').hidden = next !== 'wallet';
  if (notices[next]) {
    const [title, caption] = notices[next];
    $('guestAccessTitle').textContent = title;
    $('guestAccessStatus').textContent = message ?? caption;
  }
}

function clearShare() {
  $('guestShareFeedback').textContent = '';
  const field = $('guestShareText');
  field.value = '';
  field.hidden = true;
}

function clearList() {
  listGeneration++;
  stopList?.();
  stopList = null;
  stopShortcuts?.();
  stopShortcuts = null;
  personId = null;
  canManagePurchased = false;
  closeEditor();
  closeDelete();
  closePurchase();
  document.querySelector('#wishCircleDialog[open]')?.close();
  giftItems = [];
  $('guestGiftItems').replaceChildren();
  $('guestGifts').hidden = true;
  listName = '';
  items = [];
  selection.clear();
  $('guestHideBought').checked = false;
  itemChecks.clear();
  $('guestWishTitle').textContent = 'Seus desejos';
  $('guestWishCount').textContent = '';
  $('guestWishItems').replaceChildren();
  clearShare();
  updateSelection();
  $('guestWishlist').hidden = true;
}

function quantity(item) {
  return Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
}

function priceLabel(item) {
  const { originalPrice, currency } = item;
  if (!Number.isFinite(originalPrice) || originalPrice < 0 || !/^[A-Z]{3}$/.test(currency)) return 'Preço não informado';
  const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency, currencyDisplay: 'code' }).format(originalPrice);
  return quantity(item) > 1 ? value + ' por unidade' : value;
}

function updateSelection() {
  const count = selection.size;
  const all = $('guestSelectAll');
  const visibleCount = itemChecks.size;
  all.checked = visibleCount > 0 && count === visibleCount;
  all.indeterminate = count > 0 && count < visibleCount;
  $('guestSelectAllLabel').hidden = !visibleCount;
  $('guestShareActions').hidden = !visibleCount;
  $('guestCopy').disabled = !count;
  $('guestShare').disabled = !count;
  $('guestWishCount').textContent = !items.length ? 'Sua lista está vazia.'
    : !visibleCount ? 'Nenhum desejo a comprar.'
      : visibleCount + (visibleCount === 1 ? ' item' : ' itens') + (count ? ' · ' + count + (count === 1 ? ' selecionado' : ' selecionados') : '');
}

function renderList(list) {
  listName = typeof list?.name === 'string' ? list.name.trim() : '';
  items = Array.isArray(list?.items) ? list.items.filter(item => typeof item?.id === 'string' && typeof item.title === 'string') : [];
  giftItems = Array.isArray(list?.gifts) ? list.gifts : [];
  renderReadonlyWishlist($('guestGiftItems'), giftItems);
  closeDisallowedDrafts();
  $('guestWishTitle').textContent = listName || 'Seus desejos';
  renderPersonalItems();
  show('list');
}

function renderPersonalItems() {
  const visible = $('guestHideBought').checked ? items.filter(item => !item.bought) : items;
  const ids = new Set(visible.map(item => item.id));
  for (const id of selection) if (!ids.has(id)) selection.delete(id);
  itemChecks = new Map();
  const stores = new Map();
  for (const item of visible) {
    const store = typeof item.store === 'string' ? item.store.trim() : '';
    if (!stores.has(store)) stores.set(store, []);
    stores.get(store).push(item);
  }
  const groups = [...stores].map(([store, storeItems]) => {
    const group = document.createElement('div');
    group.className = 'wish-store-group';
    if (store) {
      const heading = document.createElement('h4');
      heading.textContent = store;
      group.append(heading);
    }
    const rows = document.createElement('ul');
    rows.className = 'guest-list';
    rows.append(...storeItems.map(renderItem));
    group.append(rows);
    return group;
  });
  $('guestWishItems').replaceChildren(...groups);
  clearShare();
  updateSelection();
}

function renderItem(item) {
  const row = document.createElement('li');
  row.className = 'wish-row';
  const label = document.createElement('label');
  label.className = 'guest-item-select';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = selection.has(item.id);
  check.onchange = () => {
    if (check.checked) selection.add(item.id);
    else selection.delete(item.id);
    clearShare();
    updateSelection();
  };
  itemChecks.set(item.id, check);
  const name = document.createElement('span');
  name.className = 'guest-item-name';
  const title = document.createElement('span');
  title.classList.toggle('is-bought', Boolean(item.bought));
  title.textContent = item.title;
  name.append(title);
  const caption = [quantity(item) > 1 ? quantity(item) + ' unidades' : '', item.bought ? 'Comprado' : '',
    item.taxQuebec ? 'Taxas do Québec à parte' : ''].filter(Boolean).join(' · ');
  if (caption) {
    const detail = document.createElement('span');
    detail.className = 'guest-item-meta';
    detail.textContent = caption;
    name.append(detail);
  }
  label.append(check, name);
  const price = document.createElement('span');
  price.className = 'wish-row-price';
  price.textContent = priceLabel(item);
  const attachment = readAttachment(item.id);
  if (attachment.imageUrl) {
    const thumb = document.createElement('img');
    thumb.className = 'wish-thumbnail';
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.referrerPolicy = 'no-referrer';
    thumb.src = attachment.imageUrl;
    label.insertBefore(thumb, name);
  }
  const savedUrl = productUrl(item, attachment);
  if (savedUrl) {
    const productLink = document.createElement('a');
    productLink.href = savedUrl;
    productLink.target = '_blank';
    productLink.rel = 'noopener noreferrer';
    productLink.className = 'guest-item-meta';
    productLink.textContent = 'Abrir produto';
    name.append(productLink);
  }
  row.append(label, price);
  const actions = document.createElement('div');
  actions.className = 'guest-item-actions';
  const purchaseAction = item.bought ? 'Desfazer compra' : 'Marcar como comprado';
  actions.append(itemAction(purchaseAction, item, () => openPurchase(item)));
  if (canManageItem(item)) actions.append(itemAction('Editar', item, () => openEditor(item)), itemAction('Excluir', item, () => openDelete(item)));
  row.append(actions);
  return row;
}

function setAccount(account, attempt) {
  if (attempt !== generation) return;
  const role = account?.role;
  const staffPersonal = personalPage && ['admin', 'coadmin'].includes(role);
  const linked = staffPersonal ? access.profile : role === 'guest' && account.personId;
  $('guestBackToWallet').hidden = !staffPersonal;
  if (typeof linked === 'string' && linked) {
    const allowed = staffPersonal || account.canManagePurchased === true;
    if (personId === linked) {
      if (canManagePurchased !== allowed) {
        canManagePurchased = allowed;
        if (state === 'list') renderList({ name: listName, items, gifts: giftItems });
      }
      return;
    }
    clearList();
    personId = linked;
    canManagePurchased = allowed;
    show('loading');
    const listAttempt = listGeneration;
    const current = () => attempt === generation && listAttempt === listGeneration;
    const stop = access.watchList(personId, (data) => {
      if (!current()) return;
      if (data) renderList(data);
      else {
        clearList();
        show('unavailable', 'A lista vinculada ainda não está disponível.');
      }
    }, () => {
      if (!current()) return;
      clearList();
      show('error');
    }, staffPersonal && linked !== 'primary-luana' ? '' : linked);
    if (current()) {
      stopList = stop;
      if (access.sharing) {
        const linkedPerson = personId;
        stopShortcuts = mountWishlistShortcuts(() => access.sharing(linkedPerson));
      }
    } else stop?.();
    return;
  }
  clearList();
  if (role === 'admin' || role === 'coadmin') {
    show('wallet');
    location.replace(new URL('./', location.href).href);
  }
  else if (role === 'guest') show('blocked', 'Nenhuma lista está vinculada a esta conta.');
  else show(['request', 'pending'].includes(role) ? role : 'blocked');
}

function resetAccess() {
  generation++;
  stopAccount?.();
  stopAccount = null;
  access = null;
  clearList();
}

async function connect(user) {
  resetAccess();
  const attempt = generation;
  $('guestSignOut').hidden = !user;
  if (!user) {
    show('login');
    return;
  }
  show('loading');
  try {
    const opened = await openWishlistAccess({ db: session.db, user });
    if (attempt !== generation) return;
    access = opened;
    if (!opened.enabled) {
      show('unavailable');
      return;
    }
    if (!personalPage && ['admin', 'coadmin'].includes(opened.role)) {
      show('wallet');
      return;
    }
    if (opened.role !== 'guest' || opened.personId) setAccount(opened, attempt);
    const stop = opened.watchAccount(
      account => setAccount(account, attempt),
      () => {
        if (attempt !== generation) return;
        clearList();
        show('error');
      },
    );
    if (attempt !== generation) {
      stop?.();
      return;
    }
    stopAccount = stop;
    if (opened.role === 'request' && state === 'request') void requestAccess();
  } catch {
    if (attempt === generation) {
      clearList();
      show('error');
    }
  }
}

async function start() {
  show('loading');
  try {
    session = await googleAuth();
    session.watch(user => void connect(user));
  } catch {
    show('error');
  }
}

function shareText() {
  const selected = items.filter(item => selection.has(item.id));
  if (!selected.length) return '';
  const title = 'Lista de Desejos' + (listName ? ' · ' + listName : '');
  const lines = selected.map(item => [item.title + (quantity(item) > 1 ? ' ×' + quantity(item) : ''), item.store, priceLabel(item),
    item.bought ? 'Comprado' : '', item.taxQuebec ? 'Taxas do Québec à parte' : '', productUrl(item)].filter(Boolean).join(' · '));
  return [title, ...lines].join('\n\n');
}

const editor = $('guestEditor');
const editForm = $('guestEditForm');
const deleteDialog = $('guestDeleteDialog');
const purchaseDialog = $('guestPurchaseDialog');
let purchaseDraft;
let editDraft, deleteDraft, editRevision = 0, deleteRevision = 0, photoRevision = 0;
const formFields = Object.fromEntries([...editForm.elements].filter(field => field.name).map(field => [field.name, field]));
const touched = new Set();
const photoValues = new Map();
let photo, suggestions = [];
const batchRows = new Map();
let linkTimer, linkRequest;

function cancelLinkRead() {
  clearTimeout(linkTimer);
  linkRequest?.abort();
  linkRequest = null;
  $('guestReadLink').disabled = false;
}

async function readLink() {
  cancelLinkRead();
  const savedUrl = WishProduct.imageUrl(formFields.url.value);
  if (!savedUrl || !editDraft) return;
  const url = new URL(savedUrl);
  const controller = new AbortController();
  linkRequest = controller;
  const current = () => linkRequest === controller && editor.open && editDraft;
  const status = $('guestLinkStatus');
  const deadline = setTimeout(() => controller.abort(), 8000);
  $('guestReadLink').disabled = true;
  status.textContent = 'Lendo o link…';
  try {
    const product = await WishProduct.readLink(url, controller.signal);
    if (!current()) return;
    applySuggestion(product, { preserveMissing: true });
    if (product.imageUrl && !editDraft.imageUrl?.startsWith('data:')) {
      editDraft.imageUrl = product.imageUrl;
      photoPreview(product.imageUrl);
    }
    status.textContent = 'Confira a prévia do produto antes de salvar.';
  } catch {
    if (!current()) return;
    if (!formFields.store.value && !touched.has('store')) {
      applySuggestion({ store: WishProduct.store(url.hostname) }, { preserveMissing: true });
    }
    status.textContent = 'Prévia indisponível. Preencha o nome ou use um print. O link será salvo com o desejo.';
  } finally {
    clearTimeout(deadline);
    if (current()) cancelLinkRead();
  }
}

$('guestReadLink').onclick = () => void readLink();
formFields.url.addEventListener('input', () => {
  WishProduct.updateLinkAction($('guestOpenLink'), formFields.url.value);
  cancelLinkRead();
  $('guestLinkStatus').textContent = '';
  if (editDraft?.imageUrl && !editDraft.imageUrl.startsWith('data:')) {
    editDraft.imageUrl = '';
    photoPreview('');
  }
  if (WishProduct.imageUrl(formFields.url.value)) linkTimer = setTimeout(readLink, 600);
});

function attachmentKey(id) {
  return 'wallet-wish-attachment:' + session.auth.currentUser.uid + ':' + id;
}

function readAttachment(id) {
  try {
    const value = JSON.parse(localStorage.getItem(attachmentKey(id)) || '{}');
    return { url: WishProduct.imageUrl(value.url) || '', imageUrl: WishProduct.savedImageUrl(value.imageUrl) || '' };
  } catch {
    return {};
  }
}

function productUrl(item, attachment = readAttachment(item.id)) {
  return WishProduct.imageUrl(item.url ?? attachment.url) || '';
}

function photoPreview(imageUrl) {
  const preview = $('guestPhotoPreview');
  preview.hidden = !imageUrl;
  if (imageUrl) preview.src = imageUrl;
  else preview.removeAttribute('src');
  $('guestRemovePhoto').hidden = !imageUrl;
  $('guestReadPhoto').hidden = !photo;
}

function applySuggestion(suggestion, { preserveMissing = false } = {}) {
  for (const key of ['title', 'store', 'price', 'currency']) {
    const field = formFields[key];
    if (touched.has(key) || (field.value && field.value !== photoValues.get(key))) continue;
    const proposed = suggestion[key] ?? '';
    if (preserveMissing && proposed === '') continue;
    if (key === 'currency' && proposed && ![...field.options].some(option => option.value === proposed)) {
      field.add(new Option(proposed, proposed));
    }
    field.value = proposed;
    photoValues.set(key, field.value);
  }
}

for (const event of ['input', 'change']) {
  editForm.addEventListener(event, ({ target }) => { if (target.name) touched.add(target.name); });
}

function photoLoading(progress = '') {
  $('guestPhotoProgress').textContent = progress;
  $('guestPhotoLoading').hidden = !progress;
  $('guestUpload').disabled = Boolean(progress);
}

const batchCurrency = $('guestBatchCurrency');
batchCurrency.replaceChildren(...[...formFields.currency.options].map(option => option.cloneNode(true)));
const batchCurrencyRow = $('guestBatchCurrencyRow');
const batchCurrencyStatus = $('guestBatchCurrencyStatus');
const applyCurrency = $('guestApplyBatchCurrency');

function missingBatchCurrencies() {
  return [...batchRows.values()].flatMap(({ include, fields }) => {
    const currency = fields.querySelector('[name=currency]');
    const price = fields.querySelector('[name=price]');
    return include.checked && price.value !== '' && currency.value === '' ? [currency] : [];
  });
}

function updateBatchCurrency() {
  batchCurrencyRow.hidden = !missingBatchCurrencies().length;
  applyCurrency.disabled = !batchCurrency.value;
}
batchCurrency.onchange = updateBatchCurrency;
applyCurrency.onclick = () => {
  const code = batchCurrency.value;
  if (!code) return;
  const pending = missingBatchCurrencies();
  for (const field of pending) field.value = code;
  batchCurrencyStatus.textContent = pending.length === 1 ? 'Moeda preenchida em 1 produto.' :
    'Moeda preenchida em ' + pending.length + ' produtos.';
  updateBatchCurrency();
};

function setBatch(active) {
  $('guestPhotoBatch').hidden = !active;
  $('guestSingleFields').hidden = active;
  $('guestSingleFields').disabled = active;
  $('guestSingleLink').hidden = active;
  formFields.url.disabled = active;
  if (active) cancelLinkRead();
  $('guestSave').textContent = active ? 'Salvar selecionados' : 'Salvar desejo';
  if (active) {
    $('guestPhotoPreview').hidden = true;
    $('guestRemovePhoto').hidden = true;
    $('guestReadPhoto').hidden = true;
  } else {
    batchCurrency.value = '';
    batchCurrencyStatus.textContent = '';
  }
  updateBatchCurrency();
}
const applyDefaultStore = WishProduct.bindDefaultStore($('guestDefaultStore'), () =>
  batchRows.size ? [...batchRows.values()].map(({ fields }) => fields.querySelector('[name=store]')) : [formFields.store]);
function appendPhotoRow(suggestion, source, caption, checked = true) {
  const row = document.createElement('div');
  row.className = 'guest-photo-row';
  const header = document.createElement('label');
  header.className = 'guest-photo-row-heading';
  const include = document.createElement('input');
  include.type = 'checkbox';
  include.checked = checked;
  const title = document.createElement('span');
  title.textContent = suggestion.title || caption;
  header.append(include, title);
  const fields = $('guestSingleFields').cloneNode(true);
  fields.removeAttribute('id');
  fields.hidden = false;
  fields.disabled = !checked;
  for (const field of fields.querySelectorAll('[name]')) {
    field.removeAttribute('autofocus');
    const value = typeof field.value === 'string' ? suggestion[field.name] : undefined;
    if (field.type === 'checkbox') field.checked = suggestion[field.name] === true;
    else if (field.name === 'quantity') field.value = suggestion.quantity || '1';
    else {
      if (field.name === 'currency' && value && ![...field.options].some(option => option.value === value)) {
        field.add(new Option(value, value));
      }
      field.value = value ?? '';
    }
  }
  const inputs = Object.fromEntries([...fields.querySelectorAll('[name]')].map(field => [field.name, field]));
  fields.prepend(WishProduct.batchLinkField(inputs, { value: suggestion.url }));
  applyDefaultStore(inputs.store);
  include.onchange = () => {
    fields.disabled = !include.checked;
    updateBatchCurrency();
  };
  fields.addEventListener('input', updateBatchCurrency);
  fields.addEventListener('change', updateBatchCurrency);
  row.append(header);
  if (source?.imageUrl) {
    const thumb = document.createElement('img');
    thumb.alt = 'Prévia de ' + caption;
    thumb.className = 'wish-thumbnail';
    thumb.src = source.imageUrl;
    row.append(thumb);
  }
  if (!suggestion.manual && (suggestion.failed || suggestion.priceIssue || suggestion.assumedCurrency || !source || !suggestion.title || suggestion.price == null)) {
    const note = document.createElement('p');
    note.className = 'guest-hint';
    note.textContent = !source && suggestion.url ? 'Seu rascunho foi mantido. Marque esta linha se quiser salvá-lo.' :
      !source ? 'Não foi possível abrir a foto. Você pode preencher os dados manualmente.' :
      suggestion.priceIssue === 'currency' ? 'Moeda não identificada no print.' :
        suggestion.priceIssue ? 'Confira qual preço é o atual no print.' :
          suggestion.assumedCurrency ? 'CAD sugerido. Altere se necessário.' :
          !suggestion.title && suggestion.price == null ? 'Preencha o nome e o preço que aparecem no print.' :
          !suggestion.title ? 'Nome não identificado no print.' : 'Preço não identificado no print.';
    row.append(note);
  }
  row.append(fields);
  $('guestPhotoRows').append(row);
  batchRows.set(row, { include, fields, imageUrl: source?.imageUrl || '' });
  updateBatchCurrency();
  return inputs;
}

function startBatch(products = [], keepDraft = false) {
  if (batchRows.size) return products;
  if (keepDraft || formFields.url.value.trim() || ['title', 'store', 'price'].some(key => touched.has(key) && formFields[key].value)) {
    const initial = Object.fromEntries([...$('guestSingleFields').querySelectorAll('[name]')].map(field =>
      [field.name, field.type === 'checkbox' ? field.checked : field.value]));
    const draft = { ...initial, url: formFields.url.value.trim() };
    if (applyDefaultStore.isInherited(formFields.store)) draft.store = '';
    const key = WishPhotoReader.photoProductKey;
    const matches = draft.title && products.filter(item => key(item.title) === key(draft.title));
    if (matches?.length === 1) {
      const match = matches[0];
      const manual = Object.fromEntries(Object.entries(draft).filter(([field, value]) =>
        field === 'url' || touched.has(field) || (['title', 'store', 'price'].includes(field) && value !== '')));
      products = products.map(item => item === match ? { ...item, ...manual } : item);
    } else {
      appendPhotoRow({ ...draft, manual: keepDraft }, photo || { imageUrl: editDraft?.imageUrl }, 'Produto inicial', keepDraft);
    }
  }
  setBatch(true);
  return products;
}

$('guestAddManualProduct').onclick = () => {
  if (!editDraft || editDraft.baseline || !$('guestPhotoLoading').hidden || $('guestSave').disabled) return;
  startBatch([], true);
  const fields = appendPhotoRow({ manual: true }, null, 'Novo produto');
  $('guestPhotoStatus').textContent = batchRows.size + ' produtos para revisar.';
  fields.title.focus();
};

async function openPhotos(files) {
  if (!$('guestPhotoLoading').hidden) return;
  if (files.length <= 1 && !batchRows.size) return openPhoto(files[0]);
  if (!editDraft || editDraft.baseline || !files.length) return openPhoto(files[0]);
  const attempt = ++photoRevision;
  const current = () => editor.open && editDraft && attempt === photoRevision;
  startBatch();
  $('guestPhotoStatus').textContent = '';
  $('guestSave').disabled = true;
  try {
    const prepared = [];
    for (const [index, file] of files.entries()) {
      if (!current()) return;
      photoLoading((index + 1) + '/' + files.length + ' · Preparando foto');
      const source = await WishPhotoReader.prepareWishPhoto(file).catch(() => ({}));
      prepared.push({ source, file });
    }
    let processed = 0;
    try {
      await withReceiptReader(async recognize => {
        for (const { source, file } of prepared) {
          if (!current()) return;
          photoLoading((processed + 1) + '/' + files.length + ' · Reconhecendo produtos');
          if (source.imageUrl) {
            const result = await WishPhotoReader.recognizeWishPhoto(source, '', recognize, current).catch(() => ({ failed: true }));
            if (!current()) return;
            for (const item of result.products?.length ? result.products : [result]) appendPhotoRow(item, source, file.name);
          } else appendPhotoRow({}, null, file.name);
          processed++;
        }
      });
    } catch {
      if (!current()) return;
      for (const { source, file } of prepared.slice(processed)) appendPhotoRow({ failed: true }, source.imageUrl ? source : null, file.name);
    }
  } finally {
    if (current()) {
      $('guestUpload').value = '';
      $('guestSave').disabled = false;
      photoLoading();
      $('guestPhotoStatus').textContent = batchRows.size + ' produtos para revisar.';
    }
  }
}

async function readPhoto(attempt = ++photoRevision) {
  const current = () => editor.open && editDraft && attempt === photoRevision;
  const status = $('guestPhotoStatus');
  $('guestReadPhoto').disabled = true;
  status.textContent = '';
  photoLoading('1/1 · Reconhecendo produtos');
  try {
    const url = WishProduct.imageUrl(formFields.url.value) || '';
    const result = await withReceiptReader(recognize => WishPhotoReader.recognizeWishPhoto(photo, url, recognize, current));
    if (!current()) return;
    suggestions = result.products || [];
    if (suggestions.length > 1 && !editDraft.baseline) {
      const products = startBatch(suggestions);
      products.forEach((item, index) => appendPhotoRow(item, photo, 'Produto ' + (index + 1)));
      status.textContent = batchRows.size + ' produtos para revisar.';
      $('guestReadPhoto').hidden = true;
      return;
    }
    if (suggestions.length > 1) {
      const picker = $('guestPhotoChoice');
      picker.replaceChildren(new Option('Escolha um produto', ''), ...suggestions.map((item, index) => new Option(item.title || 'Produto ' + (index + 1), String(index))));
      $('guestPhotoProducts').hidden = false;
      status.textContent = 'Confira qual produto quer preencher com este print.';
      return;
    }
    applySuggestion(suggestions[0] || result);
    status.textContent = result.failed ? 'Foto pronta. Preencha os campos manualmente.' : result.assumedCurrency ? 'Foto pronta. CAD sugerido; altere se necessário.' : 'Foto pronta. Confira os dados antes de salvar.';
  } catch {
    if (current()) status.textContent = 'Foto pronta. Preencha os campos manualmente.';
  } finally {
    if (current()) {
      $('guestReadPhoto').disabled = false;
      photoLoading();
    }
  }
}

$('guestPhotoChoice').onchange = ({ target }) => {
  if (target.value !== '') applySuggestion(suggestions[Number(target.value)]);
};
async function openPhoto(file) {
  if (!editDraft || !file) return;
  const attempt = ++photoRevision;
  $('guestPhotoProducts').hidden = true;
  $('guestPhotoStatus').textContent = '';
  photoLoading('1/1 · Preparando foto');
  $('guestSave').disabled = true;
  const prepared = await WishPhotoReader.prepareWishPhoto(file);
  if (attempt !== photoRevision || !editDraft) return;
  $('guestUpload').value = '';
  $('guestSave').disabled = false;
  if (!prepared.imageUrl) {
    photoLoading();
    $('guestPhotoStatus').textContent = prepared.warning;
    return;
  }
  photo = prepared;
  editDraft.imageUrl = prepared.imageUrl;
  photoPreview(prepared.imageUrl);
  void readPhoto(attempt);
}
$('guestUpload').onchange = ({ target }) => void openPhotos([...target.files]);
editForm.addEventListener('paste', event => {
  const image = [...(event.clipboardData?.items || [])].find(item => item.kind === 'file' && item.type.startsWith('image/'));
  if (!image) return;
  event.preventDefault();
  void openPhotos([image.getAsFile()].filter(Boolean));
});
const photoField = $('guestUpload').closest('.guest-image-field');
photoField.addEventListener('dragover', event => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
photoField.addEventListener('drop', event => {
  const files = [...(event.dataTransfer?.files || [])];
  if (!files.length) return;
  event.preventDefault();
  void openPhotos(files);
});
$('guestReadPhoto').onclick = () => { if (photo) void readPhoto(); };
$('guestRemovePhoto').onclick = () => {
  photoRevision++;
  photo = null;
  editDraft.imageUrl = '';
  $('guestSave').disabled = false;
  $('guestPhotoProducts').hidden = true;
  $('guestPhotoStatus').textContent = '';
  photoLoading();
  batchRows.clear();
  $('guestPhotoRows').replaceChildren();
  setBatch(false);
  photoPreview('');
};

function itemAction(verb, item, action) {
  const button = document.createElement('button');
  button.className = 'wish-tool';
  button.type = 'button';
  button.textContent = { 'Marcar como comprado': '✓', 'Desfazer compra': '↶', Editar: '✎', Excluir: '×' }[verb];
  button.title = verb;
  button.setAttribute('aria-label', verb + ': ' + item.title);
  button.onclick = action;
  return button;
}

function closeEditor() {
  editRevision++;
  editDraft = null;
  cancelLinkRead();
  $('guestLinkStatus').textContent = '';
  photoRevision++;
  photo = null;
  suggestions = [];
  touched.clear();
  photoValues.clear();
  batchRows.clear();
  $('guestPhotoRows').replaceChildren();
  setBatch(false);
  photoLoading();
  editForm.reset();
  $('guestPhotoStatus').textContent = '';
  $('guestPhotoProducts').hidden = true;
  $('guestReadPhoto').disabled = false;
  photoPreview('');
  $('guestEditError').textContent = '';
  setBusy('guestSave', 'guestEditCancel', false);
  if (editor.open) editor.close();
}

function closeDelete() {
  deleteRevision++;
  deleteDraft = null;
  $('guestDeleteItem').textContent = '';
  $('guestDeleteError').textContent = '';
  setBusy('guestDeleteConfirm', 'guestDeleteCancel', false);
  if (deleteDialog.open) deleteDialog.close();
}

function setBusy(submit, cancel, busy) {
  $(submit).disabled = busy;
  $(cancel).disabled = busy;
  if (submit === 'guestSave') $('guestEditorClose').disabled = busy;
}

function closeDisallowedDrafts() {
  const stillAllowed = (draft) => {
    const liveItem = items.find(item => item.id === draft.id);
    return liveItem && canManageItem(liveItem);
  };
  if (editDraft?.baseline && !stillAllowed(editDraft.baseline)) closeEditor();
  if (deleteDraft && !stillAllowed(deleteDraft)) closeDelete();
  if (purchaseDraft && !items.some(item => item.id === purchaseDraft.id && item.bought === purchaseDraft.bought)) closePurchase();
}

function openEditor(baseline = null) {
  if (state !== 'list' || !personId || (baseline && !canManageItem(baseline))) return;
  closeEditor();
  editDraft = { baseline, ...(baseline ? readAttachment(baseline.id) : {}) };
  $('guestDefaultStoreLabel').hidden = !!baseline;
  $('guestAddManualProduct').hidden = !!baseline;
  $('guestEditorTitle').textContent = baseline ? 'Editar desejo' : 'Adicionar desejo';
  const fields = formFields;
  editDraft.originalImage = editDraft.imageUrl;
  fields.url.value = baseline ? productUrl(baseline, editDraft) : '';
  WishProduct.updateLinkAction($('guestOpenLink'), fields.url.value);
  photoPreview(editDraft.imageUrl);
  if (baseline) {
    fields.title.value = baseline.title;
    fields.store.value = baseline.store || '';
    fields.price.value = baseline.originalPrice ?? '';
    fields.quantity.value = quantity(baseline);
    fields.tax.checked = baseline.taxQuebec === true;
    if (![...fields.currency.options].some(option => option.value === baseline.currency)) {
      fields.currency.add(new Option(baseline.currency, baseline.currency));
    }
    fields.currency.value = baseline.currency;
  }
  editor.showModal();
  editor.scrollTop = 0;
}

function closePurchase() {
  purchaseDraft = null;
  $('guestPurchaseError').textContent = '';
  setBusy('guestPurchaseConfirm', 'guestPurchaseBack', false);
  if (purchaseDialog.open) purchaseDialog.close();
}

function openPurchase(item) {
  if (state !== 'list' || !personId) return;
  purchaseDraft = item;
  $('guestPurchaseTitle').textContent = item.bought ? 'Desfazer compra?' : 'Confirmar compra?';
  $('guestPurchaseConfirm').textContent = item.bought ? 'Voltar para pendente' : 'Marcar como comprado';
  $('guestPurchaseItem').textContent = item.title;
  $('guestPurchaseInfo').textContent = [item.store, quantity(item) > 1 ? '×' + quantity(item) : '', priceLabel(item)].filter(Boolean).join(' · ');
  purchaseDialog.showModal();
}

$('guestPurchaseBack').onclick = closePurchase;
purchaseDialog.oncancel = event => {
  event.preventDefault();
  if (!$('guestPurchaseConfirm').disabled) closePurchase();
};
$('guestPurchaseConfirm').onclick = async () => {
  const item = purchaseDraft;
  if (!item || !personId || $('guestPurchaseConfirm').disabled) return;
  setBusy('guestPurchaseConfirm', 'guestPurchaseBack', true);
  $('guestPurchaseError').textContent = '';
  try {
    await access.setBought(personId, item, !item.bought);
    if (purchaseDraft === item) closePurchase();
  } catch (error) {
    if (purchaseDraft !== item) return;
    $('guestPurchaseError').textContent = mutationError(error);
    setBusy('guestPurchaseConfirm', 'guestPurchaseBack', false);
  }
};

function openDelete(item) {
  if (state !== 'list' || !personId || !canManageItem(item)) return;
  closeDelete();
  deleteDraft = item;
  $('guestDeleteItem').textContent = item.title;
  deleteDialog.showModal();
}

function mutationError(error) {
  if (error?.code === 'permission-denied') return 'A conta perdeu a permissão para fazer esta alteração.';
  return error?.message || 'Não foi possível salvar a alteração. Tente novamente.';
}

$('guestPeople').onclick = () => {
  if (personId && state === 'list') void showWishlistPeople(() => access.sharing(personId));
};
$('guestAdd').onclick = () => openEditor();
$('guestEditCancel').onclick = closeEditor;
$('guestEditorClose').onclick = closeEditor;
$('guestDeleteCancel').onclick = closeDelete;
editor.oncancel = event => {
  event.preventDefault();
  if (!$('guestEditorClose').disabled) closeEditor();
};
deleteDialog.oncancel = event => {
  event.preventDefault();
  if (!$('guestDeleteConfirm').disabled) closeDelete();
};

async function savePhotoBatch(guest) {
  const selected = [];
  for (const [row, draft] of batchRows) {
    if (!draft.include.checked) continue;
    const values = Object.fromEntries([...draft.fields.querySelectorAll('[name]')].map(field => [field.name, field]));
    const rawUrl = values.url.value.trim();
    const url = rawUrl ? WishProduct.imageUrl(rawUrl) : '';
    if (url === null) {
      values.url.setAttribute('aria-invalid', 'true');
      $('guestEditError').textContent = 'Informe um link http ou https válido no produto marcado.';
      values.url.focus();
      return;
    }
    const price = values.price.value === '' ? null : values.price.valueAsNumber;
    const units = values.quantity.valueAsNumber;
    const valid = Number.isSafeInteger(units) && units > 0 &&
      (price === null || (Number.isFinite(price) && price >= 0 && price <= 90071992547409 / units));
    if (!valid || price !== null && !values.currency.value || !values.title.value.trim()) {
      $('guestEditError').textContent = 'Confira o produto, o preço, a moeda e a quantidade dos itens marcados.';
      (price !== null && !values.currency.value ? values.currency : values.title).focus();
      return;
    }
    selected.push({ row, draft, item: { id: crypto.randomUUID(), title: values.title.value.trim(),
      store: values.store.value.trim(), originalPrice: price, currency: values.currency.value || 'BRL',
      quantity: units, taxQuebec: values.tax.checked, bought: false, ...(url ? { url } : {}) } });
  }
  if (!selected.length) {
    $('guestEditError').textContent = 'Selecione pelo menos um produto.';
    return;
  }
  const attempt = editRevision;
  $('guestEditError').textContent = '';
  setBusy('guestSave', 'guestEditCancel', true);
  let saved = 0;
  try {
    for (const { row, draft, item } of selected) {
      if (attempt !== editRevision) return;
      const key = attachmentKey(item.id);
      if (draft.imageUrl) localStorage.setItem(key, JSON.stringify({ imageUrl: draft.imageUrl }));
      try {
        await access.saveItem(guest, item);
      } catch (error) {
        if (draft.imageUrl) localStorage.removeItem(key);
        throw error;
      }
      saved++;
      row.remove();
      batchRows.delete(row);
      updateBatchCurrency();
    }
    if (attempt === editRevision) {
      closeEditor();
      $('guestShareFeedback').textContent = saved === 1 ? 'Desejo adicionado.' : saved + ' desejos adicionados.';
    }
  } catch (error) {
    if (attempt === editRevision) $('guestEditError').textContent = (saved ? saved + ' já salvo(s). ' : '') + mutationError(error);
  } finally {
    if (attempt === editRevision) setBusy('guestSave', 'guestEditCancel', false);
  }
}

editForm.onsubmit = async event => {
  event.preventDefault();
  const guest = personId, draft = editDraft;
  if (state !== 'list' || !guest || !draft || $('guestSave').disabled) return;
  if (batchRows.size) {
    await savePhotoBatch(guest);
    return;
  }
  const fields = formFields;
  const title = fields.title.value.trim(), store = fields.store.value.trim();
  const originalPrice = fields.price.value === '' ? null : fields.price.valueAsNumber;
  const units = fields.quantity.valueAsNumber;
  const validAmount = originalPrice === null || (Number.isFinite(originalPrice) && originalPrice >= 0 && originalPrice <= 90071992547409 / units);
  if (!title || !Number.isSafeInteger(units) || units < 1 || !validAmount) {
    $('guestEditError').textContent = 'Confira o nome, o preço e a quantidade.';
    return;
  }
  const url = fields.url.value ? WishProduct.imageUrl(fields.url.value) : '';
  if (url === null || (originalPrice !== null && !fields.currency.value)) {
    $('guestEditError').textContent = url === null ? 'Informe um link http ou https.' : 'Escolha a moeda do preço.';
    return;
  }
  const baseline = draft.baseline;
  const item = {
    id: baseline?.id ?? crypto.randomUUID(),
    title, store, originalPrice,
    currency: fields.currency.value || 'BRL',
    quantity: units,
    taxQuebec: fields.tax.checked,
    bought: baseline?.bought === true,
    ...(url || baseline?.url !== undefined || draft.url ? { url } : {}),
  };
  const attempt = editRevision;
  $('guestEditError').textContent = '';
  setBusy('guestSave', 'guestEditCancel', true);
  try {
    const key = attachmentKey(item.id);
    if (draft.imageUrl) localStorage.setItem(key, JSON.stringify({ imageUrl: draft.imageUrl }));
    try {
      await access.saveItem(guest, item, baseline);
    } catch (error) {
      const previous = draft.baseline ? { url: draft.url || '', imageUrl: draft.originalImage || '' } : null;
      if (previous?.url || previous?.imageUrl) localStorage.setItem(key, JSON.stringify(previous));
      else if (draft.imageUrl) localStorage.removeItem(key);
      throw error;
    }
    if (!draft.imageUrl) localStorage.removeItem(key);
    if (attempt === editRevision) {
      closeEditor();
      renderList({ name: listName, items, gifts: giftItems });
    }
  } catch (error) {
    if (attempt === editRevision) $('guestEditError').textContent = mutationError(error);
  } finally {
    if (attempt === editRevision) setBusy('guestSave', 'guestEditCancel', false);
  }
};

$('guestDeleteConfirm').onclick = async () => {
  const guest = personId, item = deleteDraft;
  if (state !== 'list' || !guest || !item || $('guestDeleteConfirm').disabled) return;
  const attempt = deleteRevision;
  $('guestDeleteError').textContent = '';
  setBusy('guestDeleteConfirm', 'guestDeleteCancel', true);
  try {
    const key = attachmentKey(item.id);
    await access.removeItem(guest, item);
    localStorage.removeItem(key);
    if (attempt === deleteRevision) closeDelete();
  } catch (error) {
    if (attempt === deleteRevision) $('guestDeleteError').textContent = mutationError(error);
  } finally {
    if (attempt === deleteRevision) setBusy('guestDeleteConfirm', 'guestDeleteCancel', false);
  }
};

$('guestSignIn').onclick = async () => {
  const button = $('guestSignIn');
  button.disabled = true;
  try {
    await session.signIn();
  } catch (error) {
    if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error?.code)) {
      show('login', 'O acesso pelo Google falhou. Tente novamente.');
    }
  } finally {
    button.disabled = false;
  }
};

$('guestSignOut').onclick = async () => {
  const button = $('guestSignOut');
  button.disabled = true;
  resetAccess();
  show('loading');
  try {
    await session.signOut();
  } catch {
    show('error', 'Não foi possível sair. Tente novamente.');
  } finally {
    button.disabled = false;
  }
};

async function requestAccess() {
  const button = $('guestRequest');
  if (state !== 'request' || !access || requestGeneration === generation) return;
  const attempt = generation;
  requestGeneration = attempt;
  show('request', 'Enviando solicitação…');
  try {
    await access.submitRequest();
    if (attempt === generation && state === 'request') show('pending');
  } catch {
    if (attempt === generation && state === 'request') show('request', 'Não foi possível enviar a solicitação. Tente novamente.');
  } finally {
    if (attempt === generation) {
      requestGeneration = -1;
      button.disabled = false;
    }
  }
}

$('guestRequest').onclick = requestAccess;
$('guestRetry').onclick = () => session ? void connect(session.auth.currentUser) : void start();

$('guestHideBought').onchange = renderPersonalItems;

$('guestSelectAll').onchange = ({ target }) => {
  selection.clear();
  for (const [id, checkbox] of itemChecks) {
    checkbox.checked = target.checked;
    if (target.checked) selection.add(id);
  }
  clearShare();
  updateSelection();
};

async function copySelection() {
  const data = shareText();
  if (!data) return;
  const attempt = listGeneration;
  clearShare();
  try {
    await navigator.clipboard.writeText(data);
    if (attempt === listGeneration) $('guestShareFeedback').textContent = 'Seleção copiada.';
  } catch {
    if (attempt !== listGeneration) return;
    const field = $('guestShareText');
    field.value = data;
    field.hidden = false;
    field.focus();
    field.select();
    $('guestShareFeedback').textContent = 'Texto selecionado para copiar.';
  }
}

$('guestCopy').onclick = copySelection;
$('guestShare').hidden = typeof navigator.share !== 'function';
$('guestShare').onclick = async () => {
  const data = shareText();
  if (!data) return;
  const attempt = listGeneration;
  try {
    await navigator.share({ text: data });
  } catch (error) {
    if (error.name !== 'AbortError' && attempt === listGeneration) await copySelection();
  }
};

void start();
