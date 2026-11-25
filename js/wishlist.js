'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  let editing = null,
    editBaseline = null,
    editItem = null,
    request = null,
    revision = 0,
    autoRead = null,
    draftImage = null,
    photoRevision = 0,
    photoBusy = false,
    photoPreparing = false,
    photoBatch = false,
    singlePhoto = null;
  const photoRows = new WeakMap();
  let photoRowId = 0;
  const validQuantity = (value) => Number.isSafeInteger(value) && value > 0;
  const quantityOf = (item) => validQuantity(item.quantity) ? item.quantity : 1;
  const countUnits = (items) => items.reduce((sum, item) => sum + quantityOf(item), 0);
  const titleWithQuantity = (item) => item.title + (quantityOf(item) > 1 ? ' ×' + quantityOf(item) : '');
  function originalSubtotal(item) {
    const unitPrice = item.originalPrice ?? item.price;
    return unitPrice == null ? null : Math.round(unitPrice * 100) * quantityOf(item) / 100;
  }
  // One-step calculation follows Revenu Québec: 5% GST + 9.975% QST,
  // both on the pre-tax price; round the line total to cents.
  const QUEBEC_TAX_RATE = 0.14975;
  function quebecTax(item) {
    const before = originalSubtotal(item);
    return before == null || item.taxQuebec !== true ? 0 : Math.round(Math.round(before * 100) * QUEBEC_TAX_RATE) / 100;
  }
  function taxableSubtotal(item) {
    const before = originalSubtotal(item);
    return before == null ? null : Math.round((before + quebecTax(item)) * 100) / 100;
  }
  function conversion() {
    const currency = $('wishCurrency').value;
    const quantity = $('wishQuantity').valueAsNumber;
    const unitPrice = WishProduct.parsePrice($('wishPrice').value);
    const shownBrl = WishProduct.priceInReais(unitPrice, currency);
    $('wishUnitBrl').textContent = shownBrl ? 'Valor unitário em reais · ' + shownBrl : '';
    const item = { originalPrice: unitPrice, quantity, taxQuebec: $('wishTaxQuebec').checked };
    const base = validQuantity(quantity) && Number.isFinite(unitPrice) ? originalSubtotal(item) : null;
    const value = base == null ? null : taxableSubtotal(item);
    const estimate = value == null || !currency ? null : WishFx.convert(value, currency);
    const date = WishFx.current()?.dates?.[currency];
    const taxes = base != null && item.taxQuebec ? ' · GST/QST ' + originalPriceLabel(quebecTax(item), currency) : '';
    $('wishConversion').textContent = base == null || !currency ? '' :
      (quantity > 1 ? quantity + ' unidades · ' : '') + originalPriceLabel(base, currency) + taxes +
      ' · total ' + originalPriceLabel(value, currency) +
      (estimate == null ? ' · cotação indisponível' : ' ≈ ' + formatBR(estimate)) +
      (currency === 'BRL' ? ' · sem frete' : ' · cotação ' + (date || 'salva') + ' · sem frete');
  }
  const rows = () => JSON.parse(AppStorage.getItem('wishlist') || '[]');
  const defaultPerson = 'Dominadora';
  const defaultPersonLabel = 'Luana';
  const newPerson = '';
  const roster = () => JSON.parse(AppStorage.getItem('wishlistPeople') || '[]');
  const personOf = (item, registered = roster()) => registered.find((person) => person.id === item.personId)?.name || item.person?.trim() || defaultPerson;
  const personKey = (name) => name.normalize('NFC').toLocaleLowerCase('pt-BR');
  const personLabel = (name) => personKey(name) === personKey(defaultPerson) ? defaultPersonLabel : name;
  const personFromInput = (name, names) => names.get(personKey(name)) || (personKey(name) === personKey(defaultPersonLabel) ? defaultPerson : name);
  const normalizeName = (name) => name.trim().replace(/\s+/g, ' ').normalize('NFC');
  function groupByStore(items) {
    const groups = new Map();
    for (const item of items) {
      const name = normalizeName(item.store || '');
      const key = personKey(name);
      if (!groups.has(key)) groups.set(key, { name, items: [] });
      groups.get(key).items.push(item);
    }
    return groups;
  }
  function people(items, registered = roster()) {
    const names = [...items.map((item) => personOf(item, registered)), ...registered.map((person) => person.name), defaultPerson];
    return new Map(names.map((name) => [personKey(name), name]));
  }
  const friendsOnly = (names) => [...names].filter(([key]) => key !== personKey(defaultPerson));
  function personFields() {
    const adding = $('wishPerson').value === newPerson;
    $('wishPersonNameField').hidden = !adding;
    $('wishPersonName').disabled = !adding;
    $('wishPersonName').required = adding && !photoBatch;
  }
  function updatePeople(items, selection = $('wishPerson').value) {
    const select = $('wishPerson');
    const registered = roster();
    const names = people(items, registered);
    const options = [...names.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((name) => {
      const option = new Option(personLabel(name), name);
      const person = registered.find((entry) => personKey(entry.name) === personKey(name));
      if (person) option.dataset.personId = person.id;
      return option;
    });
    options.push(new Option('＋ Cadastrar pessoa', newPerson));
    function rebuild(field, value) {
      const previousId = field.selectedOptions[0]?.dataset.personId;
      if (value && value === field.value && previousId) {
        value = registered.find((person) => person.id === previousId)?.name || value;
      }
      field.replaceChildren(...options.map((option) => option.cloneNode(true)));
      field.value = value ? names.get(personKey(value)) || defaultPerson : newPerson;
    }
    rebuild(select, selection);
    for (const field of $('wishBatchRows').querySelectorAll('[data-field=person]')) rebuild(field, field.value);
    personFields();
  }
  $('wishPerson').addEventListener('change', () => {
    personFields();
    applyBatchPerson();
    if ($('wishPerson').value === newPerson) $('wishPersonName').focus();
  });
  $('wishPersonName').addEventListener('input', applyBatchPerson);
  $('wishApplyBatchPerson').onclick = applyBatchPerson;
  const link = (value) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use um link http ou https válido.');
    return url;
  };
  const message = (text) => {
    $('wishMessage').textContent = text;
  };
  function save(items, registered) {
    if (!WalletStore.isWritable()) throw new Error('Aguarde a conexão com a carteira para salvar.');
    if (registered) AppStorage.setItem('wishlistPeople', JSON.stringify(registered));
    if (items) AppStorage.setItem('wishlist', JSON.stringify(items));
    AppStorage.flush();
    render();
  }
  async function confirmWishSave(items, registered, changed) {
    const wallet = WalletStore.snapshot();
    wallet.simulator.wishlist = JSON.stringify(items);
    if (registered) wallet.simulator.wishlistPeople = JSON.stringify(registered);
    const sync = window.SharedWallet;
    if (sync) sync.assertWalletFits(WalletCloud.pack(wallet));
    WalletStore.commitBoth(wallet.finance, wallet.simulator);
    if (sync) {
      await sync.flush();
      const confirmed = JSON.parse(sync.state().base?.simulator?.wishlist || '[]');
      const byId = new Map(confirmed.map(item => [item.id, item]));
      if (!changed.every(item => Object.entries(item).every(([key, value]) => byId.get(item.id)?.[key] === value))) {
        const reason = $('cloudStatusBar').classList.contains('is-error') ? $('cloudStatusText').textContent : '';
        throw new Error('O Firebase ainda não confirmou o salvamento. ' + reason);
      }
    }
    render();
  }
  function checkedName(value) {
    const name = normalizeName(value);
    if (!name || name.length > 80) throw new Error('Informe um nome de até 80 caracteres.');
    return name;
  }
  function registerPerson(name, registered) {
    const existing = registered.find((person) => personKey(person.name) === personKey(name));
    if (existing) return existing;
    const person = { id: crypto.randomUUID(), name };
    registered.push(person);
    return person;
  }
  $('wishRegisterPerson').onclick = () => {
    try {
      const name = checkedName($('wishPersonName').value);
      const selectedName = personFromInput(name, people(rows()));
      const registered = roster();
      if (personKey(selectedName) !== personKey(defaultPerson)) registerPerson(selectedName, registered);
      save(null, registered);
      updatePeople(rows(), selectedName);
      $('wishPersonName').value = '';
      applyBatchPerson();
      message('Pessoa selecionada.');
    } catch (error) {
      message(error.message);
    }
  };
  function thumbnail(value, lazy = false) {
    const url = WishProduct.savedImageUrl(value);
    if (!url) return null;
    const image = document.createElement('img');
    image.className = 'wish-thumbnail';
    image.alt = '';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    if (lazy) image.loading = 'lazy';
    image.addEventListener('error', () => image.remove(), { once: true });
    image.src = url;
    return image;
  }
  function showDraftImage(value) {
    draftImage = WishProduct.savedImageUrl(value);
    const image = thumbnail(draftImage);
    $('wishImagePreview').replaceChildren(...(image ? [image] : []));
    $('wishRemovePhoto').hidden = !draftImage?.startsWith('data:');
  }
  let wishFormGeneration = 0, draftWishId;
  function reset() {
    wishFormGeneration++;
    draftWishId = undefined;
    editing = null;
    editBaseline = null;
    editItem = null;
    revision++;
    photoRevision++;
    setPhotoBusy(false);
    request?.abort();
    clearTimeout(autoRead);
    $('wishForm').reset();
    syncWishLink();
    $('wishEditorEditTitle').hidden = true;
    $('wishDefaultStoreLabel').hidden = false;
    $('wishAddManualProduct').hidden = false;
    setPhotoBatch(false);
    setSinglePhoto(null);
    updatePeople(rows(), defaultPerson);
    showDraftImage(null);
    $('wishPhotoMessage').textContent = '';
    $('wishCancel').hidden = true;
    $('wishCancel').textContent = 'Cancelar edição';
    $('wishSave').textContent = 'Adicionar desejo';
    $('wishSaveError').textContent = '';
    message('');
    conversion();
  }
  function estimate(items) {
    let cents = 0, missing = 0;
    for (const item of items) {
      const original = taxableSubtotal(item);
      const value = original == null ? null : WishFx.convert(original, item.currency || 'BRL');
      if (value == null) missing += quantityOf(item);
      else cents += Math.round(value * 100);
    }
    return { cents, missing };
  }
  function originalPriceLabel(original, currency) {
    if (currency === 'BRL') return formatBR(original);
    return currency + ' ' + original.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }
  function priceLabel(item, convert = true) {
    if (item.bought && Number.isSafeInteger(item.purchasePaidBrl)) {
      const cad = Number.isSafeInteger(item.purchasePaidCad) ? originalPriceLabel(item.purchasePaidCad / 100, 'CAD') : '';
      return cad + (convert ? (cad ? ' · ' : '') + Finance.format(item.purchasePaidBrl) : cad ? '' : 'Valor pago registrado');
    }
    const original = originalSubtotal(item);
    const currency = item.currency || 'BRL';
    if (original == null) return 'Preço não informado';
    const withTax = taxableSubtotal(item);
    const label = item.taxQuebec === true
      ? originalPriceLabel(withTax, currency)
      : originalPriceLabel(original, currency);
    const taxHint = item.taxQuebec === true ? ' · c/ taxas' : '';
    if (!convert || currency === 'BRL') return label + taxHint;
    const converted = WishFx.convert(withTax, currency);
    return label + (converted == null ? ' · sem cotação' : ' ≈ ' + formatBR(converted)) + taxHint;
  }
  function estimateLabel({ cents, missing }) {
    return '≈ ' + formatBR(cents / 100) + (missing ? ' · ' + missing + ' sem estimativa' : '');
  }
  const peopleDialog = $('wishPeopleDialog');
  let friendEditing = null;
  const peopleStatus = (text) => { $('wishPeopleStatus').textContent = text; };
  function resetFriendForm() {
    friendEditing = null;
    $('wishPeopleForm').reset();
    $('wishPeopleLabel').textContent = 'Nome da amiga';
    $('wishPeopleSave').textContent = 'Adicionar';
    $('wishPeopleCancel').hidden = true;
    peopleStatus('');
  }
  function renderFriends(items) {
    const registered = roster();
    const friends = friendsOnly(people(items, registered));
    const list = $('wishPeopleList');
    list.replaceChildren();
    if (!friends.length) {
      const empty = document.createElement('li');
      empty.className = 'wish-people-empty';
      empty.textContent = 'Nenhuma amiga cadastrada.';
      list.append(empty);
      return;
    }
    for (const [key, name] of friends.sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'))) {
      const friend = registered.find((person) => personKey(person.name) === key);
      const count = items.filter((item) => personKey(personOf(item, registered)) === key).length;
      const row = document.createElement('li');
      const avatar = document.createElement('span');
      avatar.className = 'wish-people-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = [...name][0].toLocaleUpperCase('pt-BR');
      const caption = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = name;
      const detail = document.createElement('small');
      detail.textContent = count === 1 ? '1 desejo' : count + ' desejos';
      caption.append(title, detail);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'wish-people-action';
      edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 12-12a2 2 0 0 1 3 3L7 19l-4 1zM14 6l3 3"/></svg>';
      edit.setAttribute('aria-label', 'Editar nome de ' + name);
      edit.title = 'Editar nome';
      edit.onclick = () => {
        friendEditing = { id: friend?.id, name };
        $('wishPeopleLabel').textContent = 'Editar nome';
        $('wishPeopleName').value = name;
        $('wishPeopleSave').textContent = 'Salvar nome';
        $('wishPeopleCancel').hidden = false;
        peopleStatus('');
        $('wishPeopleName').focus();
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'wish-people-action';
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></svg>';
      remove.setAttribute('aria-label', 'Remover ' + name);
      remove.title = 'Remover amiga';
      remove.onclick = async () => {
        if (count) {
          peopleStatus('Mova os desejos de ' + name + ' para outra pessoa antes de remover.');
          return;
        }
        if (!(await AppDialog.confirm('Remover ' + name + ' da lista de amigas?'))) return;
        try {
          const current = roster();
          const person = current.find((entry) => entry.id === friend?.id);
          if (!person || person.name !== name) throw new Error('O cadastro mudou. Confira a lista e tente novamente.');
          if (rows().some((item) => personKey(personOf(item, current)) === key)) throw new Error('Há desejos vinculados a esta pessoa.');
          if (friendEditing?.id === person.id) resetFriendForm();
          save(null, current.filter((entry) => entry.id !== person.id));
          peopleStatus('Amiga removida.');
        } catch (error) {
          peopleStatus(error.message);
        }
      };
      row.append(avatar, caption, edit, remove);
      list.append(row);
    }
  }
  $('wishManagePeople').onclick = () => {
    resetFriendForm();
    renderFriends(rows());
    peopleDialog.showModal();
  };
  $('wishPeopleCancel').onclick = resetFriendForm;
  $('wishPeopleForm').onsubmit = (event) => {
    event.preventDefault();
    try {
      const name = checkedName($('wishPeopleName').value);
      const key = personKey(name), items = rows(), registered = roster();
      const names = people(items, registered);
      if (key === personKey(defaultPerson) || (key === personKey(defaultPersonLabel) && friendEditing?.name !== name)) throw new Error(defaultPersonLabel + ' é o perfil padrão da lista.');
      if (names.has(key) && (!friendEditing || personKey(friendEditing.name) !== key)) throw new Error('Esse nome já está na lista.');
      if (!friendEditing) {
        registerPerson(name, registered);
        save(null, registered);
        resetFriendForm();
        peopleStatus('Amiga adicionada.');
        return;
      }
      const oldKey = personKey(friendEditing.name);
      let friend = registered.find((person) => person.id === friendEditing.id);
      if (friendEditing.id ? friend?.name !== friendEditing.name : !names.has(oldKey)) throw new Error('O cadastro mudou. Reabra a edição para conferir.');
      friend ||= registerPerson(friendEditing.name, registered);
      const linked = items.map((item) => !item.personId && personKey(personOf(item, registered)) === oldKey
        ? { ...item, person: name, personId: friend.id, updatedAt: Date.now() } : item);
      friend.name = name;
      save(linked.some((item, index) => item !== items[index]) ? linked : null, registered);
      resetFriendForm();
      peopleStatus('Nome atualizado.');
    } catch (error) {
      peopleStatus(error.message);
    }
  };
  const shareDialog = $('wishShareDialog');
  const supportsNativeShare = typeof navigator.share === 'function';
  let photoPreparation;
  const photoPreviewUrls = [];
  function clearPhotoPreview() {
    photoPreparation?.abort();
    $('wishImageExport').hidden = true;
    $('wishImageShareStatus').textContent = '';
    $('wishImageCards').replaceChildren();
    for (const url of photoPreviewUrls.splice(0)) URL.revokeObjectURL(url);
  }
  shareDialog.addEventListener('close', clearPhotoPreview);
  const photoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const maxPhotoBytes = 4 * 1024 * 1024;
  const itemsPerCard = 10;
  async function loadSharePhoto(url, signal) {
    try {
      const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal });
      const type = response.headers.get('content-type')?.split(';')[0];
      if (!response.ok || !photoTypes.has(type) || Number(response.headers.get('content-length')) > maxPhotoBytes) return null;
      const blob = await response.blob();
      if (!blob.size || blob.size > maxPhotoBytes) return null;
      return blob;
    } catch {
      return null;
    }
  }
  function pandoraPhotoRelay(value) {
    const source = new URL(value);
    if (source.origin !== 'https://ca.pandora.net' ||
      !/^\/dw\/image\/v2\/AAVX_PRD\/on\/demandware\.static\/-\/Sites-pandora-master-catalog\/default\/dw[0-9a-f]+\/productimages\/[a-z0-9_-]+\/[a-z0-9_.-]+\.(?:jpe?g|png|webp)$/i.test(source.pathname)) return null;
    // Send only the public catalog path and known image resize parameters.
    const allowed = { bgcolor: /^[a-f\d]{6}$/i, q: /^\d{1,3}$/, sw: /^\d{1,4}$/, sh: /^\d{1,4}$/, sfrm: /^(?:jpg|png|webp)$/i, sm: /^(?:fit|crop)$/i };
    for (const [key, value] of [...source.searchParams]) {
      if (!Object.hasOwn(allowed, key) || !allowed[key].test(value)) source.searchParams.delete(key);
    }
    source.hash = '';
    return 'https://wsrv.nl/?' + new URLSearchParams({ url: source.href, w: '384', output: 'jpg' });
  }
  async function prepareSharePhoto(url, signal) {
    const direct = await loadSharePhoto(url, AbortSignal.any([signal, AbortSignal.timeout(2500)]));
    if (direct || signal.aborted) return direct;
    const relay = pandoraPhotoRelay(url);
    return relay ? loadSharePhoto(relay, signal) : null;
  }
  async function makeWishPhotoCard({ person, items, images, links, prices, total, page, pageCount }) {
    const bitmaps = new Map();
    await Promise.all([...images].map(async ([url, file]) => {
      try {
        bitmaps.set(url, await createImageBitmap(file));
      } catch {}
    }));
    try {
      const canvas = document.createElement('canvas');
      const width = 420;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const titleFont = 'bold 14px system-ui';
      const detailFont = '12px system-ui';
      const headerFont = 'bold 19px system-ui';
      const totalFont = 'bold 17px system-ui';
      const wrap = (text, font, available) => {
        ctx.font = font;
        const lines = [];
        let line = '';
        for (const word of text.trim().split(/\s+/)) {
          const next = line ? line + ' ' + word : word;
          if (ctx.measureText(next).width <= available) {
            line = next;
            continue;
          }
          if (line) lines.push(line);
          line = '';
          for (const char of word) {
            if (line && ctx.measureText(line + char).width > available) {
              lines.push(line);
              line = '';
            }
            line += char;
          }
        }
        if (line) lines.push(line);
        return lines;
      };
      const write = (lines, font, color, x, y, step) => {
        ctx.font = font;
        ctx.fillStyle = color;
        lines.forEach((line, index) => ctx.fillText(line, x, y + index * step));
      };
      const heading = wrap('Lista de itens · ' + person, headerFont, width - 32);
      const header = 54 + heading.length * 22;
      const rows = items.map((item) => {
        const bitmap = bitmaps.get(WishProduct.savedImageUrl(item.imageUrl));
        const x = bitmap ? 72 : 16;
        const available = width - x - 16;
        const titles = wrap(item.title, titleFont, available);
        const quantity = quantityOf(item);
        const detail = [quantity > 1 && quantity + ' un.', prices.get(item.id), item.store].filter(Boolean).join(' · ');
        const details = wrap(detail, detailFont, available);
        const url = links.get(item.id);
        const linkText = url?.replace(/^https?:\/\//, '') || '';
        const firstLinkLine = wrap(linkText.slice(0, 150), detailFont, available)[0];
        let linkLine = firstLinkLine;
        if (firstLinkLine && firstLinkLine !== linkText) {
          const characters = Array.from(firstLinkLine);
          while (characters.length && ctx.measureText(characters.join('') + '…').width > available) characters.pop();
          linkLine = characters.join('') + '…';
        }
        const height = Math.max(78, 37 + 18 * titles.length + 16 * details.length + (linkLine ? 16 : 0));
        return { bitmap, x, titles, details, linkLine, height };
      });
      const footer = rows.reduce((y, row) => y + row.height, header);
      const totalLines = wrap(total, totalFont, width - 32);
      const height = footer + 45 + totalLines.length * 20;
      const scale = Math.min(2, 4000 / height);
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      ctx.scale(scale, scale);
      ctx.fillStyle = '#20161e';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#4d2639';
      ctx.fillRect(0, 0, width, header - 10);
      write(heading, headerFont, '#ffe0ea', 16, 34, 22);
      const units = countUnits(items);
      const subtitle = pageCount > 1 ? 'Parte ' + page + ' de ' + pageCount : units + (units === 1 ? ' item' : ' itens');
      write([subtitle], detailFont, '#efd2df', 16, header - 23, 16);
      let y = header;
      for (const row of rows) {
        const { bitmap, x, titles, details, linkLine } = row;
        if (bitmap) {
          const size = 44;
          const ratio = Math.min(size / bitmap.width, size / bitmap.height);
          const w = bitmap.width * ratio, h = bitmap.height * ratio;
          ctx.fillStyle = '#f2e5eb';
          ctx.fillRect(16, y + 7, size, size);
          ctx.drawImage(bitmap, 16 + (size - w) / 2, y + 7 + (size - h) / 2, w, h);
        }
        write(titles, titleFont, '#fff0f6', x, y + 23, 18);
        const detailY = y + 24 + 18 * titles.length;
        write(details, detailFont, '#ffe1a2', x, detailY, 16);
        if (linkLine) write([linkLine], detailFont, '#e3adc4', x, detailY + 16 * details.length, 16);
        y += row.height;
        ctx.fillStyle = '#563748';
        ctx.fillRect(16, y - 7, width - 32, 1);
      }
      write(['Total estimado da lista'], detailFont, '#efd2df', 16, footer + 20, 16);
      write(totalLines, totalFont, '#ffe1a2', 16, footer + 45, 20);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
      const filename = 'lista-de-itens' + (pageCount > 1 ? '-' + page : '') + '.jpg';
      return blob ? new File([blob], filename, { type: 'image/jpeg' }) : null;
    } finally {
      for (const bitmap of bitmaps.values()) bitmap.close();
    }
  }
  function sumOriginalAmounts(items, totals = new Map(), foreignOnly = false) {
    let missing = 0;
    for (const item of items) {
      const currency = item.currency || 'BRL';
      if (foreignOnly && currency === 'BRL') continue;
      const original = taxableSubtotal(item);
      if (original == null) {
        missing += quantityOf(item);
        continue;
      }
      totals.set(currency, (totals.get(currency) || 0) + Math.round(original * 100));
    }
    return { totals, missing };
  }
  function originalAmountLabels(totals) {
    return [...totals].map(([currency, cents]) => originalPriceLabel(cents / 100, currency)).join(' + ');
  }
  function originalTotals(items) {
    const { totals, missing } = sumOriginalAmounts(items);
    return [originalAmountLabels(totals), missing ? missing + ' sem preço' : ''].filter(Boolean).join(' + ') || '—';
  }
  function sharedProductUrl(value) {
    const url = link(value);
    const tracking = /^(?:utm_.*|fbclid|gclid|dclid|msclkid|ttclid|igshid)$/i;
    const signed = /^(?:sig|signature|x-amz-signature|x-goog-signature)$/i;
    if ([...url.searchParams.keys()].some((key) => signed.test(key))) return url.href;
    // Keep the original encoding and any functional parameters, such as variant.
    url.search = url.search.slice(1).split('&').filter((part) => {
      const key = new URLSearchParams(part).keys().next().value || '';
      return !tracking.test(key) && !(/(^|\.)pandora\.net$/i.test(url.hostname) && key === 'product_finding_method');
    }).join('&');
    return url.href;
  }
  async function shareImagePng(file) {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Imagem indisponível');
      return blob;
    } finally {
      bitmap.close();
    }
  }
  function copyShareImage(file) {
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': shareImagePng(file) })]);
  }
  function shareGroup(person, items) {
    clearPhotoPreview();
    const selected = new Set(items.filter((item) => !item.bought).map((item) => item.id));
    const links = new Map();
    const prices = new Map();
    const conversionOption = $('wishShareConvert');
    const photoButton = $('wishSharePhotos');
    const photoStatus = $('wishShareStatus');
    const imageStatus = $('wishImageShareStatus');
    const sendImages = $('wishSendImages');
    const chosenItems = () => items.filter((item) => selected.has(item.id));
    function resetPhotos() {
      clearPhotoPreview();
      photoButton.hidden = !selected.size;
      photoButton.disabled = false;
      photoButton.textContent = 'Montar imagem';
    }
    photoButton.onclick = async () => {
      const chosen = chosenItems();
      if (!chosen.length) return;
      clearPhotoPreview();
      const controller = new AbortController();
      photoPreparation = controller;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
      const cardPrices = new Map(chosen.map((item) => [item.id, priceLabel(item, conversionOption.checked)]));
      const total = $('wishShareTotal').textContent;
      const pageCount = Math.ceil(chosen.length / itemsPerCard);
      const files = [];
      let missingPhotos = false;
      photoButton.disabled = true;
      photoStatus.textContent = 'Montando imagem…';
      try {
        for (let page = 1; page <= pageCount; page++) {
          const cardItems = chosen.slice((page - 1) * itemsPerCard, page * itemsPerCard);
          const photos = [...new Set(cardItems.map((item) => WishProduct.savedImageUrl(item.imageUrl)).filter(Boolean))];
          const results = await Promise.all(photos.map((url) => prepareSharePhoto(url, signal)));
          if (controller.signal.aborted || !shareDialog.open) return;
          const images = new Map(photos.flatMap((url, index) => results[index] ? [[url, results[index]]] : []));
          missingPhotos ||= images.size !== photos.length;
          const card = await makeWishPhotoCard({ person, items: cardItems, images, links, prices: cardPrices, total, page, pageCount });
          if (!card) throw new Error('Imagem indisponível');
          files.push(card);
        }
        if (controller.signal.aborted || !shareDialog.open) return;
        const canCopyImage = typeof navigator.clipboard?.write === 'function' && typeof ClipboardItem === 'function' && (ClipboardItem.supports?.('image/png') ?? true);
        $('wishImageCards').replaceChildren(...files.map((file, index) => {
          const figure = document.createElement('figure');
          const url = URL.createObjectURL(file);
          photoPreviewUrls.push(url);
          const preview = document.createElement('img');
          preview.src = url;
          preview.alt = 'Lista de itens de ' + person + (pageCount > 1 ? ', parte ' + (index + 1) : '');
          const download = document.createElement('a');
          download.href = url;
          download.download = file.name;
          download.textContent = pageCount > 1 ? 'Salvar imagem ' + (index + 1) : 'Salvar imagem';
          const actions = document.createElement('div');
          actions.className = 'wish-image-actions';
          actions.append(download);
          if (canCopyImage) {
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.textContent = pageCount > 1 ? 'Copiar imagem ' + (index + 1) : 'Copiar imagem';
            copy.onclick = async () => {
              try {
                await copyShareImage(file);
                if (!controller.signal.aborted) imageStatus.textContent = 'Imagem copiada. Cole na conversa do WhatsApp.';
              } catch {
                if (!controller.signal.aborted) {
                  download.click();
                  imageStatus.textContent = 'Cópia indisponível. Imagem baixada.';
                }
              }
            };
            actions.append(copy);
          }
          figure.append(preview, actions);
          return figure;
        }));
        sendImages.hidden = !supportsNativeShare || !navigator.canShare?.({ files });
        sendImages.textContent = files.length > 1 ? 'Enviar imagens' : 'Enviar imagem';
        sendImages.onclick = async () => {
          imageStatus.textContent = '';
          try {
            await navigator.share({ files });
          } catch (error) {
            if (controller.signal.aborted || error.name === 'AbortError') return;
            if (files.length === 1) {
              $('wishImageCards').querySelector('a[download]').click();
              imageStatus.textContent = 'Envio indisponível. Imagem baixada.';
            } else {
              imageStatus.textContent = 'Envio indisponível. Copie ou salve cada imagem.';
            }
          }
        };
        $('wishImageExport').hidden = false;
        $('wishImageExport').scrollIntoView({ block: 'nearest' });
        photoStatus.textContent = '';
        imageStatus.textContent = missingPhotos ? 'Algumas fotos não estão disponíveis.' : '';
      } catch (error) {
        if (!controller.signal.aborted) photoStatus.textContent = 'Não foi possível montar a imagem: ' + (error?.message || 'erro de processamento no navegador') + '.';
      } finally {
        if (!controller.signal.aborted) photoButton.disabled = false;
      }
    };
    conversionOption.checked = true;
    $('wishShareHeading').textContent = '🛍️ Lista de itens · ' + person;
    const refresh = () => {
      const chosen = chosenItems();
      const includeConversion = conversionOption.checked;
      const total = includeConversion ? estimateLabel(estimate(chosen)) : originalTotals(chosen);
      for (const item of items) prices.get(item.id).textContent = priceLabel(item, includeConversion);
      $('wishShareTotal').textContent = total;
      const clean = (value) => String(value).replace(/[\r\n]+/g, ' ').replace(/[*_~`]/g, '').trim();
      const lines = chosen.map((item) => [
        (item.bought ? '✅ ' : '🎁 ') + '*' + clean(titleWithQuantity(item)) + '* — 💰 ' + priceLabel(item, includeConversion),
        item.store && '🏷️ ' + clean(item.store),
        links.has(item.id) && '🔗 ' + links.get(item.id),
      ].filter(Boolean).join('\n'));
      const text = chosen.length ? ['🛍️ *Lista de itens — ' + clean(person) + '*', ...lines, '🧾 *Total estimado:* ' + total].join('\n\n') : '';
      $('wishSharePreview').value = text;
      $('wishShareStatus').textContent = '';
      $('wishShareCopy').disabled = !text;
      $('wishShareNative').disabled = !text;
      $('wishShareWhatsApp').hidden = !text;
      if (text) $('wishShareWhatsApp').href = 'https://wa.me/?text=' + encodeURIComponent(text);
      else $('wishShareWhatsApp').removeAttribute('href');
    };
    $('wishShareItems').replaceChildren(...items.map((item) => {
      const row = document.createElement('div');
      row.className = 'wish-share-row';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = selected.has(item.id);
      check.onchange = () => {
        if (check.checked) selected.add(item.id);
        else selected.delete(item.id);
        resetPhotos();
        refresh();
      };
      const label = document.createElement('label');
      const image = thumbnail(item.imageUrl, true);
      const name = document.createElement('span');
      name.className = 'wish-share-name';
      name.textContent = titleWithQuantity(item) + (item.bought ? ' · comprado' : '');
      label.append(check, ...(image ? [image] : []), name);
      const price = document.createElement('span');
      prices.set(item.id, price);
      row.append(label, price);
      try {
        const url = sharedProductUrl(item.url);
        links.set(item.id, url);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.textContent = '🔗 Ver na loja';
        anchor.setAttribute('aria-label', 'Ver ' + item.title + ' na loja');
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        const actions = document.createElement('div');
        actions.className = 'wish-share-item-links';
        const sendLink = document.createElement('a');
        sendLink.href = 'https://wa.me/?text=' + encodeURIComponent(url);
        sendLink.target = '_blank';
        sendLink.rel = 'noopener noreferrer';
        sendLink.textContent = 'WhatsApp · só o link';
        sendLink.setAttribute('aria-label', 'Compartilhar só o link de ' + item.title + ' no WhatsApp');
        actions.append(anchor, sendLink);
        row.append(actions);
      } catch {}
      return row;
    }));
    conversionOption.onchange = () => {
      resetPhotos();
      refresh();
    };
    resetPhotos();
    refresh();
    shareDialog.showModal();
  }
  $('wishShareNative').hidden = !supportsNativeShare;
  $('wishShareNative').onclick = async () => {
    $('wishShareStatus').textContent = '';
    try {
      await navigator.share({ text: $('wishSharePreview').value });
    } catch (error) {
      if (error.name !== 'AbortError') await copyShareMessage();
    }
  };
  async function copyShareMessage() {
    const preview = $('wishSharePreview');
    try {
      await navigator.clipboard.writeText(preview.value);
      $('wishShareStatus').textContent = 'Mensagem copiada.';
      UIFeedback.pulse($('wishShareCopy'));
      UIFeedback.pulse($('wishShareStatus'));
    } catch {
      preview.focus();
      preview.select();
      $('wishShareStatus').textContent = 'Mensagem selecionada para copiar.';
    }
  }
  $('wishShareCopy').onclick = copyShareMessage;
  const quoteMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const localQuoteDay = new Intl.DateTimeFormat('sv-SE');
  const displayQuoteDay = (date) => date.split('-').reverse().join('/');
  function renderQuotes(items) {
    const currencies = [...new Set(items.map((item) => item.currency || 'BRL').filter((currency) => currency !== 'BRL'))].sort();
    $('wishQuotes').hidden = !currencies.length;
    const snapshot = WishFx.current();
    const today = localQuoteDay.format(new Date());
    const checkedDay = Number.isFinite(snapshot?.checkedAt) ? localQuoteDay.format(snapshot.checkedAt) : null;
    $('wishQuoteList').replaceChildren(...currencies.map((currency) => {
      const quote = document.createElement('li');
      const rate = snapshot?.rates?.[currency];
      if (!Number.isFinite(rate) || rate <= 0) {
        quote.textContent = currency + ' · cotação indisponível';
        return quote;
      }
      const amount = document.createElement('strong');
      amount.textContent = '1 ' + currency + ' ≈ ' + quoteMoney.format(rate);
      quote.append(amount);
      const date = snapshot?.dates?.[currency];
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const time = document.createElement('time');
        if (date <= today) {
          time.dateTime = date;
          time.textContent = displayQuoteDay(date);
          quote.append(time);
        } else if (checkedDay && checkedDay <= today) {
          time.dateTime = checkedDay;
          time.textContent = 'Consulta ' + displayQuoteDay(checkedDay);
          time.title = 'A fonte informou ' + displayQuoteDay(date) + ', uma data à frente neste aparelho.';
          quote.append(time);
        }
      }
      return quote;
    }));
  }
  let managingPerson = null;
  const selectedWishes = new Set();
  const purchaseSelection = new Set();
  const selectAllPurchase = $('wishSelectAllPurchase');
  const selectStore = $('wishSelectStore');
  const showBought = $('wishShowBought');
  function wishesInStore(items) {
    const store = selectStore.value;
    return store ? items.filter((item) => personKey(normalizeName(item.store || '')) === store) : items;
  }
  function visibleWishes(items) {
    return wishesInStore(items).filter((item) => showBought.checked || !item.bought);
  }
  const purchaseGroups = [];
  const purchaseDialog = $('wishPurchaseDialog');
  const purchaseForm = $('wishPurchaseForm');
  const purchaseDate = $('wishPurchaseDate');
  const purchaseItems = $('wishPurchaseItems');
  const purchaseToday = () => new Date().toLocaleDateString('sv-SE');
  let purchaseDraft = [];
  const shownPurchaseAmounts = new WeakMap();
  const reducedPurchaseMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let purchaseCountFrame;

  function selectionEstimateAmounts(pending, selected) {
    const currencies = new Set(pending.map((item) => item.currency).filter((currency) => currency && currency !== 'BRL'));
    if (!currencies.size) currencies.add('CAD');
    const initial = new Map([...currencies].map((currency) => [currency, 0]));
    const { totals } = sumOriginalAmounts(selected, initial, true);
    const { cents, missing } = estimate(selected);
    totals.set('BRL', cents);
    return { totals, missing };
  }

  function paintPurchaseAmounts(counters, animate) {
    cancelAnimationFrame(purchaseCountFrame);
    const active = counters.flatMap(({ element, totals, paint }) => {
      const previous = shownPurchaseAmounts.get(element);
      if (animate && previous && [...totals].some(([currency, cents]) => cents !== (previous.get(currency) ?? 0))) {
        return [{ element, totals, paint, previous }];
      }
      paint(totals);
      shownPurchaseAmounts.set(element, totals);
      return [];
    });
    if (!active.length) return;
    const started = performance.now();
    function tick(now) {
      const progress = Math.min(1, Math.max(0, (now - started) / 650));
      const eased = 1 - (1 - progress) ** 2;
      for (const { element, totals, paint, previous } of active) {
        const shown = new Map();
        for (const [currency, cents] of totals) {
          const from = previous.get(currency) ?? 0;
          shown.set(currency, Math.round(from + (cents - from) * eased));
        }
        paint(shown);
        shownPurchaseAmounts.set(element, shown);
      }
      if (progress < 1) purchaseCountFrame = requestAnimationFrame(tick);
    }
    purchaseCountFrame = requestAnimationFrame(tick);
  }

  function updatePurchaseEstimates(pending, selected, animate) {
    const total = $('wishTotal');
    const original = $('wishOriginalTotal');
    const status = $('wishTotalStatus');
    const selecting = selected.length > 0;
    const { totals, missing } = selectionEstimateAmounts(pending, selected);
    const labels = (amounts, missing) => {
      const foreign = new Map(amounts);
      foreign.delete('BRL');
      return [originalAmountLabels(foreign), estimateLabel({ cents: amounts.get('BRL'), missing })];
    };
    const announcement = 'Seleção · estimativa: ' + labels(totals, missing).join(' · ');
    if (status.textContent !== announcement) status.textContent = announcement;
    total.parentElement.classList.toggle('is-selection', selecting);
    const counters = [{
      element: total,
      totals,
      paint(amounts) {
        const [foreign, reais] = labels(amounts, missing);
        original.textContent = foreign;
        total.textContent = reais;
      },
    }];
    for (const group of purchaseGroups) {
      const groupSelected = group.pending.filter((item) => purchaseSelection.has(item.id));
      const count = countUnits(groupSelected);
      const label = count ? (count === 1 ? '1 selecionado' : count + ' selecionados') : countUnits(group.pending) + ' a comprar';
      const amounts = selectionEstimateAmounts(group.pending, groupSelected);
      counters.push({
        element: group.total,
        totals: amounts.totals,
        paint(shown) {
          group.total.textContent = [label, ...labels(shown, amounts.missing)].join(' · ');
        },
      });
      group.total.classList.toggle('has-selection', count > 0);
    }
    paintPurchaseAmounts(counters, animate && !reducedPurchaseMotion.matches);
  }
  function updatePurchaseBar(items, animate = false) {
    const pending = items.filter((item) => !item.bought);
    const available = pending.map((item) => item.id);
    const selected = pending.filter((item) => purchaseSelection.has(item.id));
    purchaseSelection.clear();
    selected.forEach((item) => purchaseSelection.add(item.id));
    const count = countUnits(selected);
    $('wishPurchaseBar').hidden = count === 0;
    $('wishPurchaseCount').textContent = count === 1 ? '1 item na compra' : count + ' itens na compra';
    $('wishSelectAllPurchaseLabel').hidden = !available.length;
    selectAllPurchase.onchange = () => togglePurchaseSelection(available, selectAllPurchase.checked);
    const checks = purchaseGroups.filter((group) => group.check).map((group) => [group.check, group.ids]);
    for (const [check, ids] of [[selectAllPurchase, available], ...checks]) {
      const checked = ids.filter((id) => purchaseSelection.has(id)).length;
      check.checked = checked > 0 && checked === ids.length;
      check.indeterminate = checked > 0 && checked < ids.length;
    }
    const checkedIds = new Set(selected.map(item => String(item.id)));
    for (const check of $('wishList').querySelectorAll('[data-purchase-wish]')) {
      check.checked = checkedIds.has(check.dataset.purchaseWish);
    }
    updatePurchaseEstimates(pending, selected, animate);
  }
  function togglePurchaseSelection(ids, checked) {
    for (const id of ids) {
      if (checked) purchaseSelection.add(id);
      else purchaseSelection.delete(id);
    }
    $('wishPurchaseFeedback').textContent = '';
    updatePurchaseBar(visibleWishes(rows()), true);
  }
  $('wishClearPurchase').onclick = () => {
    purchaseSelection.clear();
    updatePurchaseBar(visibleWishes(rows()), true);
  };
  $('wishReviewPurchase').onclick = () => {
    const items = visibleWishes(rows());
    updatePurchaseBar(items);
    if (!purchaseSelection.size) return;
    const registered = roster();
    const names = people(items, registered);
    const stores = groupByStore(items.filter((item) => purchaseSelection.has(item.id)));
    purchaseDraft = [...stores.values()].map(({ name, items: products }) => {
      const groups = new Map();
      for (const item of products) {
        const person = names.get(personKey(personOf(item, registered)));
        if (!groups.has(person)) groups.set(person, []);
        groups.get(person).push(item);
      }
      return {
        store: name,
        groups: [...groups].sort(([a], [b]) => Number(b === defaultPerson) - Number(a === defaultPerson)),
      };
    });
    purchaseForm.reset();
    purchaseDate.max = purchaseToday();
    purchaseDate.value = purchaseDate.max;
    $('wishPurchaseError').textContent = '';
    purchaseItems.replaceChildren(...purchaseDraft.map(({ store, groups }) => {
      const shop = document.createElement('section');
      shop.className = 'wish-purchase-shop';
      const shopHeading = document.createElement('h3');
      const subtotal = document.createElement('output');
      subtotal.dataset.purchaseShopTotal = '';
      shopHeading.append(store || 'Loja não informada', subtotal);
      shop.append(shopHeading, ...groups.map(([person, wishes]) => purchasePersonFields(person, wishes, store)));
      return shop;
    }));
    updatePurchaseTotals();
    purchaseDialog.showModal();
  };
  function purchasePersonFields(person, wishes, store) {
    const group = document.createElement('section');
    group.className = 'wish-purchase-group';
    const heading = document.createElement('h4');
    const subtotal = document.createElement('output');
    heading.append(personLabel(person), subtotal);
    group.append(heading);
    for (const item of wishes) {
      const label = document.createElement('label');
      const title = document.createElement('span');
      const amount = document.createElement('input');
      amount.dataset.purchaseAmount = '';
      amount.inputMode = 'decimal';
      amount.required = true;
      amount.setAttribute('aria-label', 'Valor pago em reais por ' + item.title);
      const price = taxableSubtotal(item);
      const currency = item.currency || 'BRL';
      const estimatedBRL = price == null ? null : WishFx.convert(price, currency);
      if (estimatedBRL != null) amount.value = estimatedBRL.toFixed(2).replace('.', ',');
      title.textContent = titleWithQuantity(item);
      if (price != null && currency !== 'BRL') {
        const original = document.createElement('small');
        original.className = 'hint';
        original.textContent = originalPriceLabel(price, currency);
        title.append(original);
      }
      amount.placeholder = 'Informe em R$';
      label.append(title, amount);
      group.append(label);
    }
    if (personKey(person) !== personKey(defaultPerson)) {
      const label = document.createElement('label');
      const contribution = document.createElement('input');
      contribution.dataset.purchaseContribution = '';
      contribution.inputMode = 'decimal';
      contribution.placeholder = 'R$ 0,00';
      contribution.setAttribute('aria-label', 'Contribuição de ' + personLabel(person) + (purchaseDraft.length > 1 ? ' · ' + (store || 'Loja não informada') : ''));
      label.append('Contribuição (opcional)', contribution);
      group.append(label);
    }
    return group;
  }
  function purchaseAmounts(strict = false) {
    const read = (input, optional = false) => {
      if (optional && !input?.value.trim()) return 0;
      try {
        const cents = Finance.cents(input.value);
        if (cents < 0) throw new Error();
        return cents;
      } catch {
        if (strict) throw new Error('Confira o campo “' + input.getAttribute('aria-label') + '”.');
        return null;
      }
    };
    return purchaseDraft.map(({ store, groups }, index) => {
      const shop = purchaseItems.children[index];
      const fields = shop.querySelectorAll('.wish-purchase-group');
      const parts = groups.map(([person, wishes], groupIndex) => {
        const group = fields[groupIndex];
        const amounts = [...group.querySelectorAll('[data-purchase-amount]')].map((input) => read(input));
        return {
          person,
          wishes,
          amounts,
          subtotal: amounts.includes(null) ? null : amounts.reduce((sum, value) => sum + value, 0),
          contribution: read(group.querySelector('[data-purchase-contribution]'), true),
        };
      });
      return {
        store,
        groups: parts,
        subtotal: parts.some((group) => group.subtotal === null) ? null : parts.reduce((sum, group) => sum + group.subtotal, 0),
        contribution: parts.reduce((sum, group) => sum + group.contribution, 0),
      };
    });
  }
  function updatePurchaseTotals() {
    const shops = purchaseAmounts();
    const total = shops.reduce((sum, shop) => sum + shop.subtotal, 0);
    const contributions = shops.reduce((sum, shop) => sum + shop.contribution, 0);
    const complete = shops.every((shop) => shop.subtotal !== null);
    const subtotalLabel = (amount) => amount === null ? '—' : Finance.format(amount);
    shops.forEach((shop, index) => {
      const section = purchaseItems.children[index];
      section.querySelector('[data-purchase-shop-total]').textContent = subtotalLabel(shop.subtotal);
      section.querySelectorAll('.wish-purchase-group output').forEach((output, groupIndex) => {
        output.textContent = subtotalLabel(shop.groups[groupIndex].subtotal);
      });
    });
    $('wishPurchaseTotal').textContent = complete ? Finance.format(total) : '—';
    $('wishPurchaseNetRow').hidden = !contributions;
    $('wishPurchaseNet').textContent = complete && shops.every((shop) => shop.contribution <= shop.subtotal) ? Finance.format(total - contributions) : '—';
  }
  purchaseForm.addEventListener('input', () => {
    $('wishPurchaseError').textContent = '';
    updatePurchaseTotals();
  });
  purchaseForm.onsubmit = (event) => {
    event.preventDefault();
    const release = UIFeedback.busy(purchaseForm.querySelector('button[type=submit]'));
    if (!release) return;
    try {
      const date = purchaseDate.value;
      if (!Finance.validDate(date) || date > purchaseToday()) throw new Error('Informe a data em que a compra foi realizada.');
      const shops = purchaseAmounts(true);
      const total = shops.reduce((sum, shop) => sum + shop.subtotal, 0);
      if (!shops.length || !Number.isSafeInteger(total) || total < 0) throw new Error('Confira o total da compra.');
      for (const shop of shops) {
        if (shop.contribution > shop.subtotal) {
          throw new Error('As contribuições excedem o total de “' + (shop.store || 'Loja não informada') + '”.');
        }
      }
      const groups = shops.flatMap((shop) => shop.groups);
      const snapshot = WalletStore.snapshot();
      const list = JSON.parse(snapshot.simulator.wishlist || '[]');
      const current = new Map(list.map((item) => [item.id, item]));
      const registered = roster();
      const ids = new Set();
      for (const { person, wishes } of groups) {
        for (const item of wishes) {
          const latest = current.get(item.id);
          if (!latest || latest.bought || latest.title !== item.title || latest.store !== item.store || latest.originalPrice !== item.originalPrice || latest.price !== item.price || latest.currency !== item.currency || !!latest.taxQuebec !== !!item.taxQuebec || quantityOf(latest) !== quantityOf(item) || personKey(personOf(latest, registered)) !== personKey(person)) {
            throw new Error('Um item mudou durante a revisão. Feche e abra a compra novamente.');
          }
          ids.add(item.id);
        }
      }
      const oneLine = (text) => text.replace(/\s+/g, ' ').trim();
      let finance = snapshot.finance;
      const links = new Map();
      const updatedAt = Date.now();
      for (const shop of shops) {
        const { store, groups, subtotal: amount, contribution } = shop;
        const id = crypto.randomUUID();
        const purchaseItems = PurchaseItems.snapshot(groups);
        const paidWishes = groups.flatMap((group) => group.wishes.filter((_, index) => group.amounts[index] > 0));
        const cadReference = FinanceCad.fromWishes(paidWishes, amount);
        const lines = groups.map((group) =>
          oneLine(group.person) + ' · ' + Finance.format(group.subtotal) +
          (group.contribution ? ' · contribuição ' + Finance.format(group.contribution) : '') + '\n' +
          group.wishes.map((item, index) => '  • ' + oneLine(titleWithQuantity(item)) + ' · ' + Finance.format(group.amounts[index])).join('\n'),
        );
        const payment = contribution ? 'Contribuições: ' + Finance.format(contribution) + '\nPago pela Dominadora: ' + Finance.format(amount - contribution) : '';
        const note = [lines.join('\n'), payment].filter(Boolean).join('\n');
        finance = Finance.update(finance, { type: 'add', entry: {
          id, date, description: store || 'Loja não informada', store, category: 'Lista de Compras',
          amount, currency: 'BRL', status: 'paid', source: 'wishlist', note,
          purchaseItems,
          ...(cadReference ? { cadReference: { ...cadReference, recordedAt: new Date(updatedAt).toISOString() } } : {}),
        } });
        for (const part of purchaseItems) {
          links.set(part.wishId, { bought: true, purchaseNoteId: id, purchasePaidBrl: part.amount, purchasePaidCad: part.cadAmount, updatedAt });
        }
      }
      snapshot.simulator.wishlist = JSON.stringify(list.map((item) =>
        links.has(item.id) ? { ...item, ...links.get(item.id) } : item,
      ));
      WalletStore.commitBoth(finance, snapshot.simulator);
      purchaseSelection.clear();
      purchaseDialog.close();
      $('wishPurchaseFeedback').textContent = (total ? 'Compra registrada na Lista de Compras' : 'Brindes registrados na Lista de Compras') + ' · ' + Finance.format(total);
      UIFeedback.wishes([...ids]);
      window.dispatchEvent(new Event('wishlist:purchase'));
      const stores = shops.map((shop) => shop.store || 'Loja não informada');
      const units = groups.reduce((sum, group) => sum + group.wishes.reduce((n, item) => n + quantityOf(item), 0), 0);
      UIFeedback.success('Compra registrada', (stores.length === 1 ? stores[0] : stores.length + ' lojas') + ' · ' + units + (units === 1 ? ' item · ' : ' itens · ') + Finance.format(total));
    } catch (error) {
      $('wishPurchaseError').textContent = error.message;
    } finally { release(); }
  };
  function wishGroupButton(label, accessibleLabel) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wish-share-button';
    button.textContent = label;
    if (accessibleLabel) button.setAttribute('aria-label', accessibleLabel);
    return button;
  }
  function wishBulkActions(person, items) {
    const allowed = new Set(items.map((item) => item.id));
    for (const id of selectedWishes) if (!allowed.has(id)) selectedWishes.delete(id);
    const checks = [];
    const toolbar = document.createElement('div');
    toolbar.className = 'wish-bulk-actions';
    const label = document.createElement('label');
    const selectAll = document.createElement('input');
    selectAll.type = 'checkbox';
    label.append(selectAll, 'Selecionar todos');
    const count = document.createElement('span');
    count.setAttribute('role', 'status');
    const remove = wishGroupButton('Excluir selecionados');
    remove.classList.add('wish-bulk-delete');
    toolbar.append(label, count, remove);
    function refreshSelection() {
      const size = selectedWishes.size;
      selectAll.checked = size === items.length;
      selectAll.indeterminate = size > 0 && size < items.length;
      count.textContent = size === 1 ? '1 selecionado' : size + ' selecionados';
      remove.hidden = !size;
    }
    selectAll.onchange = () => {
      selectedWishes.clear();
      if (selectAll.checked) for (const id of allowed) selectedWishes.add(id);
      for (const { id, check } of checks) check.checked = selectedWishes.has(id);
      refreshSelection();
    };
    remove.onclick = async () => {
      const ids = new Set(selectedWishes);
      if (!ids.size || !(await AppDialog.confirm('Excluir ' + ids.size + (ids.size === 1 ? ' item' : ' itens') + ' da lista de ' + personLabel(person) + '?'))) return;
      const current = rows();
      const registered = roster();
      const key = personKey(person);
      const matches = current.filter((item) => ids.has(item.id) && personKey(personOf(item, registered)) === key);
      if (matches.length !== ids.size) {
        AppDialog.alert('A lista mudou durante a confirmação. Confira os itens e selecione novamente.');
        return;
      }
      try {
        if (ids.has(editing)) reset();
        selectedWishes.clear();
        save(current.filter((item) => !ids.has(item.id)));
        $('wishList').querySelector('.wish-bulk-actions input')?.focus();
      } catch (error) {
        AppDialog.alert(error.message);
      }
    };
    refreshSelection();
    return {
      toolbar,
      bind(item, check) {
        checks.push({ id: item.id, check });
        check.checked = selectedWishes.has(item.id);
        check.setAttribute('aria-label', 'Selecionar ' + item.title);
        check.onchange = () => {
          if (check.checked) selectedWishes.add(item.id);
          else selectedWishes.delete(item.id);
          refreshSelection();
        };
      },
    };
  }
  const wishSnapshot = () => JSON.stringify([
    AppStorage.getItem('wishlist'),
    AppStorage.getItem('wishlistPeople'),
    WalletStore.finance().entries.filter(entry => entry.source === 'wishlist').map(entry => [entry.id, entry.status]),
  ]);
  let lastWishSnapshot;
  function renderWishSummary(list) {
    const scoped = wishesInStore(list);
    const unbought = scoped.filter((item) => !item.bought);
    const { missing } = estimate(unbought);
    const boughtCount = countUnits(scoped.filter((item) => item.bought));
    $('wishSummary').textContent = (scoped.length
      ? countUnits(unbought) + ' a comprar · ' + boughtCount + ' comprado(s)'
      : list.length ? 'Nenhum item com esses filtros.' : 'Sua lista está vazia.') + (missing ? ' · ' + missing + ' sem cotação' : '');
  }
  function render() {
    lastWishSnapshot = wishSnapshot();
    const list = rows(),
      host = $('wishList');
    host.replaceChildren();
    purchaseGroups.length = 0;
    const activePurchases = new Set(WalletStore.finance().entries.filter((entry) => ['paid', 'pending'].includes(entry.status)).map((entry) => entry.id));
    const current = editing && list.find((item) => item.id === editing);
    if (current && editBaseline?.person === $('wishPerson').value) {
      editBaseline.person = personOf(current);
      updatePeople(list, editBaseline.person);
    } else updatePeople(list);
    if (peopleDialog.open) renderFriends(list);
    const stores = groupByStore(list);
    const selectedStore = selectStore.value;
    selectStore.replaceChildren(new Option('Todas as lojas', ''), ...[...stores]
      .filter(([key]) => key)
      .map(([key, store]) => new Option(store.name, key)));
    selectStore.value = stores.has(selectedStore) ? selectedStore : '';
    selectStore.hidden = selectStore.options.length === 1;
    const visible = visibleWishes(list);
    renderWishSummary(list);
    renderQuotes(list);
    const groups = new Map();
    const registered = roster();
    const names = people(list, registered);
    const friendCount = friendsOnly(names).length;
    $('wishFriendCount').textContent = String(friendCount);
    $('wishManagePeople').setAttribute('aria-label', 'Gerenciar amigas: ' + friendCount + (friendCount === 1 ? ' amiga' : ' amigas'));
    for (const item of visible) {
      const person = names.get(personKey(personOf(item, registered)));
      if (!groups.has(person)) groups.set(person, []);
      groups.get(person).push(item);
    }
    if (managingPerson && !groups.has(managingPerson)) {
      managingPerson = null;
      selectedWishes.clear();
    }
    for (const [person, items] of groups) {
      const section = document.createElement('section');
      section.className = 'wish-group';
      section.classList.toggle('wish-group-featured', personKey(person) === personKey(defaultPerson));
      const heading = document.createElement('h3');
      const name = personLabel(person);
      heading.textContent = name;
      const header = document.createElement('header');
      header.className = 'wish-group-header';
      const pending = items.filter((item) => !item.bought);
      const groupTotal = document.createElement('span');
      groupTotal.className = 'wish-group-total';
      const purchaseGroup = { pending, total: groupTotal };
      purchaseGroups.push(purchaseGroup);
      const managing = managingPerson === person;
      const share = wishGroupButton('Compartilhar', 'Compartilhar desejos de ' + name);
      share.onclick = () => shareGroup(name, items);
      const manage = wishGroupButton(managing ? 'Concluir' : 'Gerenciar', (managing ? 'Concluir gerenciamento de ' : 'Gerenciar itens de ') + name);
      manage.setAttribute('aria-pressed', String(managing));
      manage.onclick = () => {
        managingPerson = managing ? null : person;
        selectedWishes.clear();
        render();
        const buttons = [...host.querySelectorAll('.wish-group-header button')];
        const focus = managing ? buttons.find((button) => button.getAttribute('aria-label') === 'Gerenciar itens de ' + name) : host.querySelector('.wish-bulk-actions input');
        focus?.focus();
      };
      const actions = document.createElement('div');
      actions.className = 'wish-group-actions';
      if (!managing && pending.length) {
        const label = document.createElement('label');
        label.className = 'wish-purchase-all';
        const selectGroup = document.createElement('input');
        selectGroup.type = 'checkbox';
        selectGroup.setAttribute('aria-label', 'Selecionar todos de ' + name + ' para compra');
        const ids = pending.map((item) => item.id);
        selectGroup.onchange = () => togglePurchaseSelection(ids, selectGroup.checked);
        purchaseGroup.check = selectGroup;
        purchaseGroup.ids = ids;
        label.append(selectGroup, 'Selecionar todos');
        actions.append(label);
      }
      actions.append(share);
      actions.append(manage);
      const identity = document.createElement('div');
      identity.className = 'wish-group-identity';
      identity.append(heading, groupTotal);
      header.append(identity, actions);
      section.append(header);
      const bulk = managing ? wishBulkActions(person, items) : null;
      if (bulk) section.append(bulk.toolbar);
      const storeSections = new Map();
      for (const { name, items: products } of groupByStore(items).values()) {
        const block = document.createElement('div');
        block.className = 'wish-store-group';
        const title = document.createElement('h4');
        title.textContent = name || 'Sem loja informada';
        block.append(title);
        section.append(block);
        for (const item of products) storeSections.set(item.id, block);
      }
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'wish-row';
        row.dataset.wishId = item.id;
        const check = document.createElement('input');
        check.type = 'checkbox';
        if (bulk) bulk.bind(item, check);
        else {
          check.checked = item.bought;
          if (!item.bought) check.dataset.purchaseWish = item.id;
          check.setAttribute('aria-label', (item.bought ? 'Comprado: ' : 'Selecionar para compra: ') + item.title);
          check.disabled = item.bought && activePurchases.has(item.purchaseNoteId);
          if (check.disabled) check.title = 'Para corrigir a compra, abra a nota em Notas e Gastos Reais.';
          check.onchange = () => {
            $('wishPurchaseFeedback').textContent = '';
            if (item.bought) {
              save(rows().map((x) => (x.id === item.id ? { ...x, bought: false, purchaseNoteId: undefined, updatedAt: Date.now() } : x)));
              return;
            }
            togglePurchaseSelection([item.id], check.checked);
          };
        }
        const anchor = document.createElement('a');
        anchor.className = 'wish-product-link';
        anchor.textContent = titleWithQuantity(item);
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        try {
          anchor.href = link(item.url).href;
        } catch {}
        const image = thumbnail(item.imageUrl, true);
        const product = document.createElement('div');
        product.className = 'wish-product';
        if (image) {
          const title = document.createElement('span');
          title.textContent = titleWithQuantity(item);
          anchor.classList.add('wish-product-link');
          anchor.replaceChildren(image, title);
          product.classList.add('has-thumbnail');
        }
        product.append(anchor);
        if (item.bought) anchor.classList.add('is-bought');
        const price = document.createElement('span');
        price.className = 'wish-row-price';
        if (item.taxQuebec && originalSubtotal(item) != null) price.title = 'Preço sem impostos: ' + originalPriceLabel(originalSubtotal(item), item.currency || 'BRL') + ' · GST/QST: ' + originalPriceLabel(quebecTax(item), item.currency || 'BRL');
        price.textContent = priceLabel(item);
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'wish-tool';
        edit.textContent = '✎';
        edit.setAttribute('aria-label', 'Editar ' + item.title);
        edit.onclick = () => {
          reset();
          editing = item.id;
          editItem = item;
          $('wishEditor').open = true;
          $('wishUrl').value = item.url || '';
          syncWishLink();
          $('wishEditorEditTitle').hidden = false;
          $('wishDefaultStoreLabel').hidden = true;
          $('wishAddManualProduct').hidden = true;
          showDraftImage(item.imageUrl);
          $('wishTitle').value = item.title;
          $('wishStore').value = item.store;
          $('wishPrice').value = item.originalPrice ?? item.price ?? '';
          $('wishQuantity').value = quantityOf(item);
          $('wishTaxQuebec').checked = item.taxQuebec === true;
          selectCurrency(item.currency || 'BRL');
          updatePeople(rows(), personOf(item));
          editBaseline = formValues(false);
          conversion();
          $('wishCancel').hidden = false;
          $('wishSave').textContent = 'Salvar desejo';
          $('wishTitle').focus({ preventScroll: true });
          $('wishEditor').scrollIntoView({ block: 'start' });
        };
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'wish-tool';
        remove.textContent = '×';
        remove.setAttribute('aria-label', 'Excluir ' + item.title);
        remove.onclick = async () => {
          if (await AppDialog.confirm('Excluir este desejo?')) {
            save(rows().filter((x) => x.id !== item.id));
            if (editing === item.id) reset();
          }
        };
        row.append(check, product, price, edit, remove);
        storeSections.get(item.id).append(row);
      }
      host.append(section);
    }
    updatePurchaseBar(visible);
  }
  function formValues(validateLink = true) {
    const enteredName = ($('wishPerson').value || $('wishPersonName').value).trim().replace(/\s+/g, ' ');
    const person = personFromInput(enteredName, people(rows()));
    const url = $('wishUrl').value.trim();
    return {
      url: validateLink && url ? link(url).href : url,
      title: $('wishTitle').value.trim(),
      store: $('wishStore').value.trim(),
      person,
      originalPrice: WishProduct.parsePrice($('wishPrice').value),
      quantity: $('wishQuantity').valueAsNumber,
      currency: $('wishCurrency').value || ($('wishPrice').value === '' ? 'BRL' : ''),
      taxQuebec: $('wishTaxQuebec').checked,
      imageUrl: draftImage || undefined,
    };
  }
  $('wishCancel').onclick = reset;
  function batchFieldError(input, error) {
    const hint = input.parentElement.querySelector('.wish-field-error');
    hint.textContent = error;
    if (error) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', hint.id);
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  }
  function batchPersonName(select) {
    const input = select.closest('.wish-batch-person').querySelector('[data-field=personName]');
    input.parentElement.hidden = select.value !== newPerson;
    input.disabled = input.parentElement.hidden;
    batchFieldError(input, '');
    return input;
  }
  function setBatchPerson(select) {
    select.value = $('wishPerson').value;
    batchPersonName(select).value = select.value === newPerson ? $('wishPersonName').value : '';
  }
  function applyBatchPerson() {
    if (!photoBatch) return;
    for (const select of $('wishBatchRows').querySelectorAll('[data-field=person]')) setBatchPerson(select);
  }
  const validLinePrice = (price, quantity) => price === null ||
    (Number.isFinite(price) && price >= 0 && Number.isSafeInteger(Math.round(price * 100) * quantity));
  async function savePhotoBatch(generation) {
    const list = rows();
    const registered = roster();
    const registeredCount = registered.length;
    const names = people(list, registered);
    const additions = [];
    const invalidFields = [];
    for (const row of $('wishBatchRows').children) {
      if (!row.querySelector('input[type=checkbox]').checked) continue;
      const fieldInput = (field) => row.querySelector('[data-field=' + field + ']');
      const get = (field) => fieldInput(field).value.trim();
      const title = get('title'), store = get('store');
      const enteredName = get('person') || normalizeName(get('personName'));
      const rawUrl = get('url'), url = rawUrl ? WishProduct.imageUrl(rawUrl) : '';
      const rawPrice = get('price');
      const originalPrice = WishProduct.parsePrice(rawPrice);
      const currency = get('currency') || (originalPrice === null ? 'BRL' : '');
      const rawQuantity = get('quantity');
      const taxQuebec = fieldInput('taxQuebec').checked;
      const quantity = Number(rawQuantity);
      const quantityValid = /^\d+$/.test(rawQuantity) && validQuantity(quantity);
      const errors = {
        url: url === null ? 'Informe um link http ou https válido.' : '',
        title: title ? '' : 'Informe o nome do produto.',
        store: store ? '' : 'Informe a loja.',
        personName: enteredName && enteredName.length <= 80 ? '' : 'Informe um nome de até 80 caracteres.',
        price: validLinePrice(originalPrice, quantityValid ? quantity : 1) ? '' : 'Informe um preço unitário válido.',
        currency: currency ? '' : 'Escolha a moeda do preço.',
        quantity: quantityValid ? '' : 'Informe uma quantidade inteira a partir de 1.',
      };
      for (const [field, error] of Object.entries(errors)) {
        const input = fieldInput(field);
        batchFieldError(input, error);
        if (error) invalidFields.push(input);
      }
      if (Object.values(errors).some(Boolean)) continue;
      const data = photoRows.get(row);
      const { photo } = data;
      data.saveId ||= crypto.randomUUID();
      const selectedPerson = personFromInput(enteredName, names);
      const friend = personKey(selectedPerson) === personKey(defaultPerson) ? undefined : registerPerson(selectedPerson, registered);
      additions.push({ id: data.saveId, url, title, store, person: friend?.name || selectedPerson, personId: friend?.id, originalPrice, currency, quantity, taxQuebec, imageUrl: photo.imageUrl, price: originalPrice == null ? null : WishFx.convert(originalPrice, currency), bought: false, updatedAt: Date.now() });
    }
    if (invalidFields.length) {
      invalidFields[0].focus();
      throw new Error('Corrija os campos marcados ou desmarque os produtos que quer deixar de fora.');
    }
    if (!additions.length) throw new Error('Selecione pelo menos um produto.');
    const ids = new Set(additions.map(item => item.id));
    await confirmWishSave([...list.filter(item => !ids.has(item.id)), ...additions], registered.length !== registeredCount ? registered : undefined, additions);
    if (generation !== wishFormGeneration) return;
    reset();
    $('wishEditor').open = false;
    message(additions.length + ' produtos adicionados.');
    UIFeedback.wishes(additions.map(item => item.id), false);
    UIFeedback.success('Desejos adicionados', additions.length + ' produtos na sua lista.');
  }
  $('wishForm').onsubmit = async (event) => {
    event.preventDefault();
    const release = UIFeedback.busy($('wishSave'), 'Salvando…');
    if (!release) return;
    $('wishSaveError').textContent = '';
    const generation = wishFormGeneration;
    try {
      if (!WalletStore.isWritable()) throw new Error('Aguarde a conexão com a carteira para salvar o desejo.');
      if (photoPreparing) throw new Error('Aguarde a prévia da foto antes de salvar.');
      if (photoBatch) {
        await savePhotoBatch(generation);
        return;
      }
      const draft = formValues();
      const { title, store, person, originalPrice, currency, quantity } = draft;
      if (!title || !store || !person || person.length > 80) throw new Error('Confira produto, loja e pessoa.');
      if (!validQuantity(quantity)) throw new Error('Informe uma quantidade inteira a partir de 1.');
      if (!validLinePrice(originalPrice, quantity)) throw new Error('Confira o preço unitário e a quantidade.');
      if (!currency) {
        $('wishCurrency').focus();
        throw new Error('Escolha a moeda do preço.');
      }
      const list = rows(),
        previous = list.find((x) => x.id === editing);
      if (editing && !previous) throw new Error('Este desejo foi removido no outro aparelho.');
      const changes = {};
      const fields = [['url', 'imageUrl'], ['title'], ['store'], ['person'], ['originalPrice', 'currency', 'taxQuebec'], ['quantity']];
      for (const group of fields) {
        if (editBaseline && group.every((key) => draft[key] === editBaseline[key])) continue;
        const changedRemotely = group[0] === 'person'
          ? personOf(previous || {}) !== editBaseline?.person && personOf(previous || {}) !== person
          : editItem && group.some((key) => previous[key] !== editItem[key] && previous[key] !== draft[key]);
        if (editItem && changedRemotely) {
          throw new Error('Este campo mudou no outro aparelho. Reabra o desejo para conferir o valor atual.');
        }
        for (const key of group) changes[key] = draft[key];
      }
      let registered;
      if ('person' in changes) {
        if (personKey(person) === personKey(defaultPerson)) changes.personId = undefined;
        else {
          registered = roster();
          changes.personId = registerPerson(person, registered).id;
        }
      }
      if ('originalPrice' in changes) changes.price = originalPrice == null ? null : WishFx.convert(originalPrice, currency);
      const updated = !!editing;
      draftWishId ||= crypto.randomUUID();
      const id = editing || draftWishId;
      const next = { bought: false, ...previous, ...changes, id, updatedAt: Date.now() };
      const nextRows = list.some(item => item.id === id) ? list.map(item => item.id === id ? next : item) : [...list, next];
      await confirmWishSave(nextRows, registered, [next]);
      if (generation !== wishFormGeneration) return;
      reset();
      $('wishEditor').open = false;
      UIFeedback.wishes([next.id], false);
      UIFeedback.success(updated ? 'Desejo atualizado' : 'Desejo adicionado', next.title);
    } catch (error) {
      if (generation !== wishFormGeneration) return;
      $('wishSaveError').textContent = error?.name === 'QuotaExceededError'
        ? 'O navegador atingiu o limite real de armazenamento. Tente adicionar este produto por link, sem foto embutida.'
        : error.message;
    } finally {
      release();
      updateWishSaveAvailability();
    }
  };
  $('wishRemovePhoto').onclick = () => {
    photoRevision++;
    setPhotoBusy(false);
    $('wishUpload').value = '';
    $('wishFileUpload').value = '';
    $('wishPhotoMessage').textContent = '';
    setSinglePhoto(null);
    showDraftImage(null);
  };
  function photoWarning(suggestion) {
    if (suggestion.failed) return 'Não foi possível ler o texto. A foto está pronta e você pode preencher os campos manualmente.';
    if (suggestion.priceIssue === 'ambiguous') return 'O print tem mais de um preço possível. Informe o preço atual e confira a moeda.';
    if (suggestion.assumedCurrency) return 'CAD sugerido. Altere a moeda se o preço for de outro país.';
    if (suggestion.priceIssue === 'currency') {
      return suggestion.price == null
        ? 'A moeda não ficou clara. Informe o preço e a moeda do produto.'
        : 'Encontrei o valor. Escolha a moeda indicada na loja antes de salvar.';
    }
    const missing = [!suggestion.title && 'nome', !suggestion.store && 'loja', suggestion.price == null && 'preço'].filter(Boolean);
    return missing.length ? 'Confira e preencha o que faltar: ' + missing.join(', ') + '.' : 'Confira nome, loja, preço e moeda antes de salvar.';
  }

  const { prepareWishPhoto, recognizeWishPhoto, photoProductKey } = WishPhotoReader;
  const photoFields = ['title', 'store', 'price', 'currency', 'quantity'];
  const singleFields = Object.fromEntries(photoFields.map(key => [key, $('wish' + key[0].toUpperCase() + key.slice(1))]));
  const touchedPhotoFields = new WeakSet();
  $('wishForm').addEventListener('input', markPhotoField);
  $('wishForm').addEventListener('change', markPhotoField);
  function markPhotoField({ target }) {
    if (Object.values(singleFields).includes(target) || photoFields.includes(target.dataset?.field)) touchedPhotoFields.add(target);
  }
  function setSinglePhoto(photo) {
    singlePhoto = photo;
    $('wishRetryPhoto').hidden = !photo;
    $('wishAddPhotoRow').hidden = !photo || !!editing;
    if (photo) showDraftImage(photo.imageUrl);
    else for (const field of Object.values(singleFields)) touchedPhotoFields.delete(field);
  }
  function applyPhotoSuggestion(fields, suggestion) {
    for (const key of ['title', 'store']) {
      if (!fields[key].value.trim() && !touchedPhotoFields.has(fields[key]) && suggestion[key]) fields[key].value = suggestion[key];
    }
    if (validQuantity(suggestion.quantity) && !touchedPhotoFields.has(fields.quantity)) fields.quantity.value = suggestion.quantity;
    const { price, currency } = fields;
    if (suggestion.price == null || touchedPhotoFields.has(price)) return;
    const editedCurrency = touchedPhotoFields.has(currency);
    if (editedCurrency && !suggestion.assumedCurrency && suggestion.currency && currency.value !== suggestion.currency) return;
    const code = suggestion.currency || '';
    if (price.value === '') {
      price.value = suggestion.price;
    } else if (Number(price.value) !== suggestion.price || currency.value || !code) {
      return;
    }
    if (!editedCurrency) {
      if (![...currency.options].some(option => option.value === code)) {
        currency.add(new Option(code || 'Escolha a moeda', code));
      }
      currency.value = code;
    }
  }
  async function readPhotoSuggestions(items, token, onResult) {
    const isCurrent = () => token === photoRevision;
    let index = 0;
    function finish(suggestion) {
      const completed = index++;
      if (isCurrent()) onResult(items[completed], suggestion, completed);
    }
    try {
      await withReceiptReader(async (recognize) => {
        for (const item of items) {
          if (!isCurrent()) return;
          let suggestion = null;
          if (item.photo.file) {
            try {
              suggestion = await recognizeWishPhoto(item.photo, item.url, recognize, isCurrent);
            } catch {
              // A failed image or worker must not prevent reading the remaining rows.
              suggestion = { failed: true };
            }
          }
          finish(suggestion);
        }
      });
    } catch {
      while (index < items.length && isCurrent()) finish(items[index].photo.file ? { failed: true } : null);
    }
  }
  function showPhotoBatchReview() {
    const count = $('wishBatchRows').querySelectorAll('[data-field="title"]').length;
    $('wishPhotoMessage').textContent = count
      ? count + (count === 1 ? ' produto para revisar.' : ' produtos para revisar.')
      : 'Nenhuma foto pôde ser aberta. Confira os avisos abaixo.';
  }
  function setPhotoBatch(active) {
    photoBatch = !!active;
    $('wishBatch').hidden = !active;
    $('wishPersonLabel').textContent = active ? 'Para quem no lote?' : 'Para quem?';
    $('wishApplyBatchPerson').hidden = !active;
    personFields();
    $('wishBatchTaxLabel').hidden = !active;
    $('wishSingleFields').hidden = active;
    $('wishUrl').closest('.wish-link-row').hidden = active;
    $('wishImagePreview').hidden = active;
    $('wishConversion').hidden = active;
    $('wishUnitBrl').hidden = active;
    for (const id of ['wishTitle', 'wishStore', 'wishPrice', 'wishCurrency', 'wishQuantity', 'wishUrl']) $(id).disabled = active;
    if (active) {
      $('wishRemovePhoto').hidden = true;
      $('wishCancel').hidden = false;
      $('wishCancel').textContent = 'Descartar lote';
      $('wishSave').textContent = 'Adicionar selecionados';
    }
    $('wishBatchRows').replaceChildren();
  }
  const applyDefaultStore = WishProduct.bindDefaultStore($('wishDefaultStore'), () =>
    photoBatch ? [...$('wishBatchRows').querySelectorAll('[data-field=store]')] : [$('wishStore')]);
  const applyBatchTax = WishProduct.bindBatchTax($('wishBatchTax'), () =>
    $('wishBatchRows').querySelectorAll('[data-field=taxQuebec]'));
  function createPhotoRow(file, suggestion, { first = true, url = '', draftOnly = false } = {}) {
    const i = ++photoRowId;
    const esc = escapeHTML;
    const row = document.createElement('div');
    row.className = 'preview-row';
    photoRows.set(row, { photo: suggestion, file, draftOnly });
    const currencies = [...$('wishCurrency').options].map(option => option.value).filter(Boolean);
    const field = (label, key, attributes) => '<label>' + label + '<input data-field="' + key + '" ' + attributes + '><small class="wish-field-error" id="wishBatchError-' + i + '-' + key + '"></small></label>';
    row.innerHTML = '<label class="row-title"><input type="checkbox" ' + (suggestion.imageUrl ? 'checked' : draftOnly ? '' : 'disabled') + '> <span>' + esc(file.name) + '</span></label>';
    const image = thumbnail(suggestion.imageUrl);
    if (image || draftOnly) {
      if (image) {
        image.alt = 'Prévia de ' + file.name;
        row.append(image);
      }
      row.insertAdjacentHTML('beforeend', '<div class="form-grid">' +
        field('Produto', 'title', 'maxlength="300"') +
        field('Loja', 'store', 'maxlength="150"') +
        field('Preço unitário', 'price', 'inputmode="decimal"') +
        '<label>Moeda<select data-field="currency">' + currencies.map(value => '<option>' + esc(value) + '</option>').join('') + '</select><small class="wish-field-error" id="wishBatchError-' + i + '-currency"></small></label>' +
        field('Quantidade', 'quantity', 'inputmode="numeric" value="1"') +
        '<div class="wish-batch-person"><label>Para quem?<select data-field="person"></select></label>' +
        field('Nome da pessoa', 'personName', 'maxlength="80"') + '</div>' +
        '<output class="wish-brl-preview" data-unit-brl></output>' +
        '<label class="wish-tax-option"><input type="checkbox" data-field="taxQuebec"> Taxas do Québec (GST 5% + QST 9,975%)</label></div>' +
        '<p class="hint" data-photo-status role="status"></p>');
      const recipient = row.querySelector('[data-field=person]');
      recipient.replaceChildren(...[...$('wishPerson').options].map((option) => option.cloneNode(true)));
      setBatchPerson(recipient);
      recipient.addEventListener('change', () => {
        const name = batchPersonName(recipient);
        if (!name.disabled) name.focus();
      });
      applyBatchTax(row.querySelector('[data-field=taxQuebec]'));
      row.addEventListener('input', () => updateBatchBrl(row));
      row.addEventListener('change', () => updateBatchBrl(row));
      row.querySelector('.form-grid').prepend(WishProduct.batchLinkField(batchPhotoFields(row), {
        value: url, inputId: 'wishBatchUrl-' + i,
      }));
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'wish-share-button';
      retry.dataset.retryPhoto = '';
      retry.disabled = photoBusy;
      retry.textContent = 'Tentar ler texto novamente';
      retry.onclick = () => void retryRecognizePhoto(suggestion, row);
      if (image) row.append(retry);
      if (first && image) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'wish-share-button';
        add.dataset.addPhotoRow = '';
        add.disabled = photoBusy;
        add.textContent = 'Adicionar outra linha com esta foto';
        add.onclick = () => addManualPhotoRow(row);
        row.append(add);
      }
    } else {
      const warning = document.createElement('p');
      warning.className = 'hint';
      warning.textContent = suggestion.warning;
      row.append(warning);
    }
    if (!suggestion.imageUrl && !draftOnly) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'wish-share-button';
      retry.textContent = 'Escolher esta foto em Arquivos';
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.hidden = true;
      retry.onclick = () => { if (!photoBusy) picker.click(); };
      picker.onchange = () => {
        if (picker.files[0] && !photoBusy) void retryPhotoRow(picker, row);
      };
      row.append(retry, picker);
    }
    return row;
  }
  function batchPhotoFields(row) {
    return Object.fromEntries(photoFields.map(key => [key, row.querySelector('[data-field=' + key + ']')]));
  }

  function updateBatchBrl(row) {
    const output = row.querySelector('[data-unit-brl]');
    if (!output) return;
    const value = WishProduct.priceInReais(WishProduct.parsePrice(row.querySelector('[data-field=price]').value), row.querySelector('[data-field=currency]').value);
    output.textContent = value ? 'Valor unitário em reais · ' + value : '';
  }
  function fillBatchPhotoFields(row, result) {
    const fields = batchPhotoFields(row);
    applyPhotoSuggestion(fields, result);
    applyDefaultStore(fields.store);
    updateBatchBrl(row);
    row.querySelector('[data-photo-status]').textContent = photoWarning(result);
  }
  function expandPhotoRows(row, products) {
    const draft = photoRows.get(row);
    const fields = batchPhotoFields(row);
    const draftKey = photoProductKey(fields.title.value);
    const matches = products.filter(item => draftKey && photoProductKey(item.title) === draftKey);
    const hasProductInput = photoFields.some(key => {
      if (touchedPhotoFields.has(fields[key])) return true;
      if (key === 'store') return Boolean(applyDefaultStore.originalValue(fields.store).trim());
      if (key === 'quantity') return fields.quantity.value !== '1';
      return key !== 'currency' && Boolean(fields[key].value.trim());
    });
    const hasInput = row.querySelector('[data-field=url]').value.trim() || hasProductInput ||
      row.querySelector('[data-field=taxQuebec]').checked !== ($('wishBatchTax').value === 'apply');
    const selected = row.querySelector('.row-title input').checked;
    const reused = matches.length === 1 ? matches[0] : !hasInput ? products[0] : null;
    let insertAfter = row;
    for (const item of products) {
      const itemRow = item === reused ? row : createPhotoRow(draft.file, draft.photo, { first: false });
      if (itemRow !== row) {
        if (reused && products.indexOf(item) < products.indexOf(reused)) row.before(itemRow);
        else {
          insertAfter.after(itemRow);
          insertAfter = itemRow;
        }
        itemRow.querySelector('.row-title input').checked = selected;
      }
      photoRows.get(itemRow).productKey = photoProductKey(item.title);
      itemRow.querySelector('.row-title span').textContent = item.title + ' · ' + draft.file.name;
      fillBatchPhotoFields(itemRow, item);
    }
    if (!reused) {
      draft.productKey = draftKey;
      // Keep a draft that cannot safely be matched. Leave it unchecked to
      // avoid adding that product twice, while keeping all its edits available.
      row.querySelector('.row-title input').checked = false;
      row.querySelector('[data-photo-status]').textContent = 'Confira seu rascunho e marque esta linha se quiser adicioná-la.';
    }
  }
  function fillBatchPhoto({ row }, result) {
    if (!result) return;
    const draft = photoRows.get(row);
    if (draft.productKey !== undefined) {
      if (result.failed) return fillBatchPhotoFields(row, result);
      const matches = result.products?.filter(item => photoProductKey(item.title) === draft.productKey);
      if (matches?.length === 1) fillBatchPhotoFields(row, matches[0]);
      else row.querySelector('[data-photo-status]').textContent = 'Não consegui confirmar este item na nova leitura. Confira os campos.';
    } else if (result.products) expandPhotoRows(row, result.products);
    else fillBatchPhotoFields(row, result);
  }
  function reviewSinglePhotoAsBatch(photo, { draftOnly = false } = {}) {
    const url = $('wishUrl').value.trim();
    setPhotoBatch(true);
    const row = createPhotoRow(photo.file || { name: 'Rascunho anterior' }, photo, {
      url, draftOnly, first: !draftOnly,
    });
    $('wishBatchRows').append(row);
    const fields = batchPhotoFields(row);
    for (const key of photoFields) {
      if (key === 'currency' && !singleFields.currency.value) {
        fields.currency.add(new Option('Escolha a moeda', ''));
      }
      fields[key].value = key === 'store' ? applyDefaultStore.originalValue(singleFields.store) : singleFields[key].value;
      if (touchedPhotoFields.has(singleFields[key])) touchedPhotoFields.add(fields[key]);
    }
    row.querySelector('[data-field=taxQuebec]').checked = $('wishTaxQuebec').checked;
    applyDefaultStore(fields.store);
    setSinglePhoto(null);
    updateBatchBrl(row);
    return row;
  }
  function addManualPhotoRow(row) {
    const { file, photo } = photoRows.get(row);
    const newRow = createPhotoRow(file, photo, { first: false });
    const related = [...$('wishBatchRows').children].filter(other => photoRows.get(other).photo === photo);
    related.at(-1).after(newRow);
    photoRows.get(newRow).productKey = '';
    newRow.querySelector('[data-photo-status]').textContent = 'Preencha os dados do produto desta foto.';
    showPhotoBatchReview();
    const fields = batchPhotoFields(newRow);
    applyDefaultStore(fields.store);
    fields.title.focus();
  }
  $('wishAddManualProduct').onclick = () => {
    if (editing || photoBusy || photoPreparing) return;
    if (!photoBatch) {
      const draft = reviewSinglePhotoAsBatch(singlePhoto || { imageUrl: draftImage }, { draftOnly: true });
      draft.querySelector('.row-title input').checked = true;
    }
    const row = createPhotoRow({ name: 'Novo produto' }, {}, { draftOnly: true });
    row.querySelector('.row-title input').checked = true;
    $('wishBatchRows').append(row);
    const fields = batchPhotoFields(row);
    applyDefaultStore(fields.store);
    showPhotoBatchReview();
    fields.title.focus();
  };
  $('wishAddPhotoRow').onclick = () => {
    if (!singlePhoto || photoBusy || editing) return;
    addManualPhotoRow(reviewSinglePhotoAsBatch(singlePhoto));
  };
  function fillSinglePhoto({ photo }, result) {
    if (!result) return;
    if (result.products) {
      if (editing) {
        $('wishPhotoMessage').textContent = 'Este print tem vários produtos. Confira os dados deste desejo ou importe o print em Adicionar desejo.';
        return;
      }
      expandPhotoRows(reviewSinglePhotoAsBatch(photo), result.products);
      showPhotoBatchReview();
      return;
    }
    applyPhotoSuggestion(singleFields, result);
    applyDefaultStore(singleFields.store);
    conversion();
    void WishFx.refresh();
    $('wishPhotoMessage').textContent = 'Foto pronta. ' + photoWarning(result);
  }
  async function retryRecognizePhoto(photo, row) {
    if (photoBusy || !photo?.imageUrl) return;
    const token = ++photoRevision;
    setPhotoBusy(true);
    try {
      await readPhotoSuggestions([{photo, row, url: row ? '' : $('wishUrl').value}], token, row ? fillBatchPhoto : fillSinglePhoto);
    } finally {
      if (token === photoRevision) {
        if (photoBatch) showPhotoBatchReview();
        setPhotoBusy(false);
      }
    }
  }
  $('wishRetryPhoto').onclick = () => void retryRecognizePhoto(singlePhoto);
  async function retryPhotoRow(picker, row) {
    const file = picker.files[0];
    const token = ++photoRevision;
    setPhotoBusy(true, '', true);
    try {
      const photo = await prepareWishPhoto(file);
      if (token !== photoRevision) return;
      const replacement = createPhotoRow(file, photo);
      row.replaceWith(replacement);
      setPhotoBusy(true);
      await readPhotoSuggestions([{photo, row: replacement, url: ''}], token, fillBatchPhoto);
      if (token === photoRevision) showPhotoBatchReview();
    } finally {
      if (token === photoRevision) {
        picker.value = '';
        setPhotoBusy(false);
      }
    }
  }
  $('wishBatchRows').addEventListener('input', ({ target }) => {
    if (target.matches('[data-field][aria-invalid]')) batchFieldError(target, '');
    if (target.matches('.row-title input[type="checkbox"]') && !target.checked) {
      for (const input of target.closest('.preview-row').querySelectorAll('[data-field][aria-invalid]')) batchFieldError(input, '');
    }
    if (!$('wishBatchRows').querySelector('[data-field][aria-invalid]')) $('wishSaveError').textContent = '';
  });
  const isAndroid = /Android/i.test(navigator.userAgent);
  // Chromium can route image-only inputs through the Android photo picker.
  if (isAndroid) $('wishUpload').removeAttribute('accept');
  $('wishBrowseFiles').onclick = () => $('wishFileUpload').click();
  $('wishUpload').onchange = $('wishFileUpload').onchange = ({ currentTarget: input }) =>
    importWishPhotos([...input.files], () => { input.value = ''; });
  function transferredPhotos(transfer) {
    return [...transfer.files].filter((file) => file.type.startsWith('image/') || /\.(?:jpe?g|png|webp|bmp)$/i.test(file.name));
  }
  $('wishForm').addEventListener('paste', (event) => {
    const photos = transferredPhotos(event.clipboardData);
    if (!photos.length) return;
    event.preventDefault();
    void importWishPhotos(photos);
  });
  $('wishForm').addEventListener('dragover', (event) => {
    if (event.dataTransfer.types.includes('Files')) event.preventDefault();
  });
  $('wishForm').addEventListener('drop', (event) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    const photos = transferredPhotos(event.dataTransfer);
    if (photos.length) void importWishPhotos(photos);
  });
  function updateWishSaveAvailability() {
    const button = $('wishSave');
    if (button.getAttribute('aria-busy') === 'true') return;
    button.disabled = photoPreparing || !WalletStore.isWritable();
  }
  window.addEventListener('cloud:state', updateWishSaveAvailability);
  function setPhotoBusy(busy, progress = '', preparing = false) {
    photoBusy = busy;
    photoPreparing = busy && preparing;
    updateWishSaveAvailability();
    $('wishPhotoProgress').textContent = progress;
    $('wishPhotoLoading').hidden = !busy;
    for (const id of ['wishUpload', 'wishBrowseFiles', 'wishRetryPhoto', 'wishAddPhotoRow', 'wishAddManualProduct']) $(id).disabled = busy;
    for (const button of $('wishBatchRows').querySelectorAll('[data-retry-photo], [data-add-photo-row]')) button.disabled = busy;
  }
  async function importWishPhotos(files, clearInput = () => {}) {
    if (!files.length || photoBusy) return;
    if (editing && files.length > 1) {
      clearInput();
      $('wishPhotoMessage').textContent = 'Na edição, escolha uma foto. Para cadastrar várias, abra Adicionar desejo.';
      return;
    }
    let token = ++photoRevision;
    const status = $('wishPhotoMessage');
    revision++;
    request?.abort();
    clearTimeout(autoRead);
    message('');
    const count = files.length > 1 ? '0/' + files.length : '';
    status.textContent = '';
    setPhotoBusy(true, count, true);
    try {
      const picked = [];
      for (const file of files) {
        picked.push(await prepareWishPhoto(file));
        if (token !== photoRevision) return;
      }
      const batchPerson = $('wishPerson').value;
      const batchNewName = $('wishPersonName').value;
      const keepRows = photoBatch && [...$('wishBatchRows').children].some(row => {
        const recipient = row.querySelector('[data-field=person]');
        return photoRows.get(row).draftOnly || row.querySelector('[data-field=url]')?.value.trim() ||
          (recipient && (recipient.value !== batchPerson ||
            (recipient.value === newPerson && row.querySelector('[data-field=personName]').value !== batchNewName)));
      });
      if (photoBatch && !keepRows) {
        const defaultStore = $('wishDefaultStore').value;
        const batchTax = $('wishBatchTax').value;
        reset();
        $('wishDefaultStore').value = defaultStore;
        $('wishBatchTax').value = batchTax;
        $('wishPersonName').value = batchNewName;
        updatePeople(rows(), batchPerson);
        token = ++photoRevision;
        setPhotoBusy(true, count, true);
      }
      if (files.length > 1 || keepRows) {
        if (!keepRows && $('wishUrl').value.trim()) {
          const draft = reviewSinglePhotoAsBatch(singlePhoto || {}, { draftOnly: true });
          draft.querySelector('.row-title input').checked = false;
          draft.querySelector('[data-photo-status]').textContent = 'Seu rascunho foi mantido. Marque esta linha se quiser salvá-lo.';
        } else if (!keepRows) {
          setSinglePhoto(null);
          setPhotoBatch(true);
        }
        const items = files.map((file, index) => {
          const row = createPhotoRow(file, picked[index]);
          $('wishBatchRows').append(row);
          return { photo: picked[index], row, url: '' };
        });
        setPhotoBusy(true, count);
        await readPhotoSuggestions(items, token, (item, result, index) => {
          fillBatchPhoto(item, result);
          $('wishPhotoProgress').textContent = (index + 1) + '/' + files.length;
        });
        if (token === photoRevision) showPhotoBatchReview();
        return;
      }
      const photo = picked[0];
      if (!photo.imageUrl) throw new Error(photo.warning);
      setSinglePhoto(photo);
      setPhotoBusy(true);
      await readPhotoSuggestions([{photo, url: $('wishUrl').value}], token, fillSinglePhoto);
    } catch (error) {
      if (token === photoRevision) status.textContent = error.message || 'Não foi possível abrir a foto.';
    } finally {
      if (token === photoRevision) {
        clearInput();
        setPhotoBusy(false);
      }
    }
  }
  $('wishRead').onclick = async () => {
    clearTimeout(autoRead);
    const token = ++revision;
    request?.abort();
    request = new AbortController();
    const controller = request;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const url = link($('wishUrl').value);
      const savedItem = editing && rows().find((item) => item.id === editing);
      const refreshImage = savedItem?.url === url.href;
      if (!refreshImage && !$('wishStore').value) $('wishStore').value = WishProduct.store(url.hostname);
      const inputIds = ['wishTitle', 'wishStore', 'wishPrice', 'wishCurrency'];
      const initial = Object.fromEntries(inputIds.map((id) => [id, $(id).value]));
      message('Lendo link…');
      const product = await WishProduct.readLink(url, controller.signal);
      if (token !== revision) return;
      if (product.imageUrl && !draftImage?.startsWith('data:')) showDraftImage(product.imageUrl);
      if (!refreshImage) {
        if ($('wishTitle').value === initial.wishTitle && product.title) $('wishTitle').value = product.title;
        if ($('wishStore').value === initial.wishStore && product.store) $('wishStore').value = product.store;
        if ($('wishPrice').value === initial.wishPrice && $('wishCurrency').value === initial.wishCurrency && product.price != null) {
          $('wishPrice').value = product.price;
          selectCurrency(product.currency || (url.hostname.startsWith('ca.') ? 'CAD' : 'BRL'));
        }
        conversion();
        void WishFx.refresh();
      }
      message(refreshImage ? (product.imageUrl ? 'Foto encontrada. Salve para exibir na lista.' : 'A loja não informou uma foto para este produto.') : 'Prévia pronta. Confira antes de adicionar.');
    } catch {
      if (token === revision) message('Prévia indisponível. Preencha os dados manualmente. O link será salvo com o desejo.');
    } finally {
      clearTimeout(timeout);
    }
  };
  function syncWishLink() {
    WishProduct.updateLinkAction($('wishOpenLink'), $('wishUrl').value);
  }
  $('wishUrl').addEventListener('input', () => {
    syncWishLink();
    revision++;
    request?.abort();
    if (!draftImage?.startsWith('data:')) showDraftImage(null);
    clearTimeout(autoRead);
    try {
      link($('wishUrl').value);
      autoRead = setTimeout(() => {
        if ($('wishEditor').open) $('wishRead').click();
      }, 600);
    } catch {}
  });
  function selectCurrency(currency) {
    if (![...$('wishCurrency').options].some((option) => option.value === currency)) $('wishCurrency').add(new Option(currency, currency));
    $('wishCurrency').value = currency;
  }
  $('wishPrice').addEventListener('input', conversion);
  $('wishQuantity').addEventListener('input', conversion);
  $('wishTaxQuebec').addEventListener('change', conversion);
  $('wishCurrency').addEventListener('change', conversion);
  window.addEventListener('wishlist:rates', () => {
    for (const row of $('wishBatchRows').children) updateBatchBrl(row);
    conversion();
    const all = rows();
    const visible = visibleWishes(all);
    const byId = new Map(visible.map(item => [String(item.id), item]));
    for (const row of $('wishList').querySelectorAll('[data-wish-id]')) {
      const item = byId.get(row.dataset.wishId);
      if (item) row.querySelector('.wish-row-price').textContent = priceLabel(item);
    }
    renderQuotes(all);
    renderWishSummary(all);
    updatePurchaseBar(visible);
  });
  window.addEventListener('wallet:remote', conversion);
  function renderChangedWishes() {
    if (lastWishSnapshot !== wishSnapshot()) render();
  }
  window.addEventListener('wallet:remote', renderChangedWishes);
  window.addEventListener('finance:changed', renderChangedWishes);
  selectStore.addEventListener('change', render);
  showBought.addEventListener('change', render);
  window.addEventListener('wishlist:purchase-undone', (event) => {
    selectStore.value = '';
    purchaseSelection.clear();
    render();
    const feedback = $('wishPurchaseFeedback');
    feedback.textContent = 'Compra desfeita. Os itens voltaram para a lista de desejos.';
    if (event.detail?.ids?.length) {
      UIFeedback.wishes(event.detail.ids, false);
      UIFeedback.success('Compra desfeita', 'Os itens voltaram para a lista de desejos.');
    }
    feedback.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
  const incoming = new URL(location.href);
  const shareKeys = ['wishShareUrl', 'wishShareText', 'wishShareTitle'];
  function openIncomingShare() {
    if (!WalletStore.isWritable() || !shareKeys.some((key) => incoming.searchParams.has(key))) return;
    let sharedLink;
    for (const key of shareKeys) {
      const value = incoming.searchParams.get(key)?.trim();
      if (!value) continue;
      const candidates = key === 'wishShareUrl' && !/\s/.test(value) ? [value] : (value.match(/https?:\/\/[^\s<>"']+/gi) || []).map((url) => url.replace(/[)\]},.;!?]+$/, ''));
      for (const candidate of candidates) {
        try {
          sharedLink = link(candidate).href;
          break;
        } catch {}
      }
      if (sharedLink) break;
    }
    const title = incoming.searchParams.get('wishShareTitle')?.trim();
    for (const key of shareKeys) incoming.searchParams.delete(key);
    history.replaceState(history.state, '', incoming);
    document.querySelector('[data-panel="wishlistPanel"]').click();
    reset();
    $('wishEditor').open = true;
    if (!sharedLink) {
      message('O compartilhamento não trouxe um link válido. Cole o link do produto para continuar.');
      return;
    }
    $('wishUrl').value = sharedLink;
    syncWishLink();
    if (title && !/https?:\/\//i.test(title)) $('wishTitle').value = title.slice(0, 300);
    void $('wishRead').onclick();
  }
  window.addEventListener('wallet:control', openIncomingShare);
  render();
  updatePeople(rows(), defaultPerson);
  openIncomingShare();
});
