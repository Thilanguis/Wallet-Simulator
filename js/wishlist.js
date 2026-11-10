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
    photoBatch = null;
  const validQuantity = (value) => Number.isSafeInteger(value) && value > 0;
  const quantityOf = (item) => validQuantity(item.quantity) ? item.quantity : 1;
  const countUnits = (items) => items.reduce((sum, item) => sum + quantityOf(item), 0);
  const titleWithQuantity = (item) => item.title + (quantityOf(item) > 1 ? ' ×' + quantityOf(item) : '');
  function originalSubtotal(item) {
    const unitPrice = item.originalPrice ?? item.price;
    return unitPrice == null ? null : Math.round(unitPrice * 100) * quantityOf(item) / 100;
  }
  function conversion() {
    const currency = $('wishCurrency').value;
    const quantity = $('wishQuantity').valueAsNumber;
    const unitPrice = $('wishPrice').valueAsNumber;
    const value = validQuantity(quantity) && Number.isFinite(unitPrice) ? originalSubtotal({ originalPrice: unitPrice, quantity }) : null;
    const estimate = value == null ? null : WishFx.convert(value, currency);
    const date = WishFx.current()?.dates[currency];
    $('wishConversion').textContent = value == null ? '' : estimate == null ? 'Cotação indisponível' : (quantity > 1 ? 'Total para ' + quantity + ' unidades · ' : '') + '≈ ' + formatBR(estimate) + (currency === 'BRL' ? '' : ' · cotação ' + (date || 'salva') + ' · sem taxas/frete');
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
    $('wishPersonName').required = adding;
  }
  function updatePeople(items, selection = $('wishPerson').value) {
    const select = $('wishPerson');
    const registered = roster();
    const previousId = select.selectedOptions[0]?.dataset.personId;
    if (selection && selection === select.value && previousId) {
      selection = registered.find((person) => person.id === previousId)?.name || selection;
    }
    const names = people(items, registered);
    const options = [...names.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((name) => {
      const option = new Option(personLabel(name), name);
      const person = registered.find((entry) => personKey(entry.name) === personKey(name));
      if (person) option.dataset.personId = person.id;
      return option;
    });
    select.replaceChildren(...options, new Option('＋ Cadastrar pessoa', newPerson));
    select.value = selection ? names.get(personKey(selection)) || defaultPerson : newPerson;
    personFields();
  }
  $('wishPerson').addEventListener('change', () => {
    personFields();
    if ($('wishPerson').value === newPerson) $('wishPersonName').focus();
  });
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
  function reset() {
    editing = null;
    editBaseline = null;
    editItem = null;
    revision++;
    photoRevision++;
    setPhotoBusy(false);
    request?.abort();
    clearTimeout(autoRead);
    $('wishForm').reset();
    setPhotoBatch(null);
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
      const original = originalSubtotal(item);
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
    const original = originalSubtotal(item);
    const currency = item.currency || 'BRL';
    if (original == null) return 'Preço não informado';
    const label = originalPriceLabel(original, currency);
    if (!convert || currency === 'BRL') return label;
    const converted = WishFx.convert(original, currency);
    return label + (converted == null ? ' · sem cotação' : ' ≈ ' + formatBR(converted));
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
      const original = originalSubtotal(item);
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
      } catch {
        if (!controller.signal.aborted) photoStatus.textContent = 'Não foi possível montar a imagem.';
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
      label.append(check, ...(image ? [image] : []), titleWithQuantity(item) + (item.bought ? ' · comprado' : ''));
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
  const hideBought = $('wishHideBought');
  function visibleWishes(items) {
    const store = selectStore.value;
    return items.filter((item) => (!hideBought.checked || !item.bought) &&
      (!store || personKey(normalizeName(item.store || '')) === store));
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
    const { totals, missing } = selectionEstimateAmounts(pending, selected);
    const labels = (amounts, missing) => {
      const foreign = new Map(amounts);
      foreign.delete('BRL');
      return [originalAmountLabels(foreign), estimateLabel({ cents: amounts.get('BRL'), missing })];
    };
    const announcement = 'Seleção · estimativa: ' + labels(totals, missing).join(' · ');
    if (status.textContent !== announcement) status.textContent = announcement;
    total.parentElement.classList.toggle('is-selection', selected.length > 0);
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
    for (const check of $('wishList').querySelectorAll('[data-purchase-wish]')) {
      check.checked = purchaseSelection.has(check.dataset.purchaseWish);
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
    const groups = new Map();
    const names = people(items, registered);
    for (const item of items) {
      if (!purchaseSelection.has(item.id)) continue;
      const person = names.get(personKey(personOf(item, registered)));
      if (!groups.has(person)) groups.set(person, []);
      groups.get(person).push(item);
    }
    purchaseDraft = [...groups].sort(([a], [b]) => Number(b === defaultPerson) - Number(a === defaultPerson));
    purchaseForm.reset();
    purchaseDate.max = purchaseToday();
    purchaseDate.value = purchaseDate.max;
    $('wishPurchaseError').textContent = '';
    purchaseItems.replaceChildren(...purchaseDraft.map(([person, wishes]) => {
      const group = document.createElement('section');
      group.className = 'wish-purchase-group';
      const heading = document.createElement('h3');
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
        const price = originalSubtotal(item);
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
        contribution.setAttribute('aria-label', 'Contribuição de ' + person);
        label.append('Contribuição (opcional)', contribution);
        group.append(label);
      }
      return group;
    }));
    updatePurchaseTotals();
    purchaseDialog.showModal();
  };
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
    return purchaseDraft.map(([person, wishes], index) => {
      const group = purchaseItems.children[index];
      const amounts = [...group.querySelectorAll('[data-purchase-amount]')].map((input) => read(input));
      return {
        person,
        wishes,
        amounts,
        subtotal: amounts.includes(null) ? null : amounts.reduce((sum, value) => sum + value, 0),
        contribution: read(group.querySelector('[data-purchase-contribution]'), true),
      };
    });
  }
  function updatePurchaseTotals() {
    const groups = purchaseAmounts();
    const total = groups.reduce((sum, group) => sum + group.subtotal, 0);
    const contributions = groups.reduce((sum, group) => sum + group.contribution, 0);
    const complete = groups.every((group) => group.subtotal !== null);
    groups.forEach((group, index) => {
      purchaseItems.children[index].querySelector('output').textContent = group.subtotal === null ? '—' : Finance.format(group.subtotal);
    });
    $('wishPurchaseTotal').textContent = complete ? Finance.format(total) : '—';
    $('wishPurchaseNetRow').hidden = !contributions;
    $('wishPurchaseNet').textContent = complete && contributions <= total ? Finance.format(total - contributions) : '—';
  }
  purchaseForm.addEventListener('input', () => {
    $('wishPurchaseError').textContent = '';
    updatePurchaseTotals();
  });
  purchaseForm.onsubmit = (event) => {
    event.preventDefault();
    try {
      const date = purchaseDate.value;
      if (!Finance.validDate(date) || date > purchaseToday()) throw new Error('Informe a data em que a compra foi realizada.');
      const groups = purchaseAmounts(true);
      const total = groups.reduce((sum, group) => sum + group.subtotal, 0);
      const contributions = groups.reduce((sum, group) => sum + group.contribution, 0);
      if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Informe um total de compra válido e maior que zero.');
      if (contributions > total) throw new Error('As contribuições excedem o total da compra.');
      const snapshot = WalletStore.snapshot();
      const list = JSON.parse(snapshot.simulator.wishlist || '[]');
      const current = new Map(list.map((item) => [item.id, item]));
      const registered = roster();
      const ids = new Set();
      for (const { person, wishes } of groups) {
        for (const item of wishes) {
          const latest = current.get(item.id);
          if (!latest || latest.bought || latest.title !== item.title || latest.store !== item.store || latest.originalPrice !== item.originalPrice || latest.price !== item.price || latest.currency !== item.currency || quantityOf(latest) !== quantityOf(item) || personKey(personOf(latest, registered)) !== personKey(person)) {
            throw new Error('Um item mudou durante a revisão. Feche e abra a compra novamente.');
          }
          ids.add(item.id);
        }
      }
      const oneLine = (text) => text.replace(/\s+/g, ' ').trim();
      function formatNote(includeStores) {
        const lines = groups.map(({ person, wishes, amounts, subtotal, contribution }) =>
          oneLine(person) + ' · ' + Finance.format(subtotal) + (contribution ? ' · contribuição ' + Finance.format(contribution) : '') + '\n' +
          wishes.map((item, index) => {
            const store = includeStores ? oneLine(item.store || '') : '';
            return '  • ' + oneLine(titleWithQuantity(item)) + (store ? ' · Loja: ' + store : '') + ' · ' + Finance.format(amounts[index]);
          }).join('\n'),
        );
        if (contributions) lines.push('Contribuições: ' + Finance.format(contributions) + '\nPago pela Dominadora: ' + Finance.format(total - contributions));
        return lines.join('\n');
      }
      const noteWithStores = formatNote(true);
      const note = noteWithStores.length <= 4000 ? noteWithStores : formatNote(false);
      const id = crypto.randomUUID();
      const finance = Finance.update(snapshot.finance, { type: 'add', entry: {
        id, date, description: 'Compra da Dominadora', category: 'Lista de Compras',
        amount: total, currency: 'BRL', status: 'paid', source: 'wishlist', note,
      } });
      snapshot.simulator.wishlist = JSON.stringify(list.map((item) =>
        ids.has(item.id) ? { ...item, bought: true, purchaseNoteId: id, updatedAt: Date.now() } : item,
      ));
      WalletStore.commitBoth(finance, snapshot.simulator);
      purchaseSelection.clear();
      purchaseDialog.close();
      $('wishPurchaseFeedback').textContent = 'Compra registrada na Lista de Compras · ' + Finance.format(total);
      window.dispatchEvent(new Event('wishlist:purchase'));
    } catch (error) {
      $('wishPurchaseError').textContent = error.message;
    }
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
  function render() {
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
    const unbought = visible.filter((item) => !item.bought);
    const { missing } = estimate(unbought);
    const boughtCount = countUnits(visible.filter((item) => item.bought));
    $('wishSummary').textContent = (visible.length
      ? countUnits(unbought) + ' a comprar · ' + boughtCount + ' comprado(s)'
      : list.length ? 'Nenhum item com esses filtros.' : 'Sua lista está vazia.') + (missing ? ' · ' + missing + ' sem cotação' : '');
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
      actions.append(share, manage);
      header.append(heading, groupTotal, actions);
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
        const check = document.createElement('input');
        check.type = 'checkbox';
        if (bulk) bulk.bind(item, check);
        else {
          check.checked = item.bought;
          if (!item.bought) check.dataset.purchaseWish = item.id;
          check.setAttribute('aria-label', 'Comprado: ' + item.title);
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
          showDraftImage(item.imageUrl);
          $('wishTitle').value = item.title;
          $('wishStore').value = item.store;
          $('wishPrice').value = item.originalPrice ?? item.price ?? '';
          $('wishQuantity').value = quantityOf(item);
          selectCurrency(item.currency || 'BRL');
          updatePeople(rows(), personOf(item));
          editBaseline = formValues(false);
          conversion();
          $('wishCancel').hidden = false;
          $('wishSave').textContent = 'Salvar desejo';
          $('wishTitle').focus();
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
      originalPrice: $('wishPrice').value === '' ? null : Number($('wishPrice').value),
      quantity: $('wishQuantity').valueAsNumber,
      currency: $('wishCurrency').value,
      imageUrl: draftImage || undefined,
    };
  }
  $('wishCancel').onclick = reset;
  function checkPhotoSpace(items) {
    const photoBytes = items.reduce((sum, item) => sum + (item.imageUrl?.startsWith('data:') ? item.imageUrl.length : 0), 0);
    const snapshot = WalletStore.snapshot();
    snapshot.simulator.wishlist = JSON.stringify(items);
    if (photoBytes > 256 * 1024 || new TextEncoder().encode(JSON.stringify(snapshot)).length > 700 * 1024) {
      throw new Error('A carteira atingiu o espaço reservado para fotos. Desmarque itens para salvar um lote menor ou remova uma foto antiga.');
    }
  }
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
  const validLinePrice = (price, quantity) => price === null ||
    (Number.isFinite(price) && price >= 0 && Number.isSafeInteger(Math.round(price * 100) * quantity));
  function savePhotoBatch() {
    const list = rows();
    const registered = roster();
    const enteredName = checkedName($('wishPerson').value || $('wishPersonName').value);
    const person = personFromInput(enteredName, people(list, registered));
    const personId = personKey(person) === personKey(defaultPerson) ? undefined : registerPerson(person, registered).id;
    const additions = [];
    const invalidFields = [];
    for (const [i, row] of [...$('wishBatchRows').children].entries()) {
      if (!row.querySelector('input[type=checkbox]').checked) continue;
      const fieldInput = (field) => row.querySelector('[data-field=' + field + ']');
      const get = (field) => fieldInput(field).value.trim();
      const title = get('title'), store = get('store'), currency = get('currency');
      const rawPrice = get('price');
      const originalPrice = rawPrice === '' ? null : /^\d+(?:[.,]\d{1,2})?$/.test(rawPrice) ? Number(rawPrice.replace(',', '.')) : NaN;
      const rawQuantity = get('quantity');
      const quantity = Number(rawQuantity);
      const quantityValid = /^\d+$/.test(rawQuantity) && validQuantity(quantity);
      const errors = {
        title: title ? '' : 'Informe o nome do produto.',
        store: store ? '' : 'Informe a loja.',
        price: validLinePrice(originalPrice, quantityValid ? quantity : 1) ? '' : 'Informe um preço unitário válido.',
        quantity: quantityValid ? '' : 'Informe uma quantidade inteira a partir de 1.',
      };
      for (const [field, error] of Object.entries(errors)) {
        const input = fieldInput(field);
        batchFieldError(input, error);
        if (error) invalidFields.push(input);
      }
      if (Object.values(errors).some(Boolean)) continue;
      additions.push({ id: crypto.randomUUID(), url: '', title, store, person, personId, originalPrice, currency, quantity, imageUrl: photoBatch[i].imageUrl, price: originalPrice == null ? null : WishFx.convert(originalPrice, currency), bought: false, updatedAt: Date.now() });
    }
    if (invalidFields.length) {
      invalidFields[0].focus();
      throw new Error('Corrija os campos marcados ou desmarque os produtos que quer deixar de fora.');
    }
    if (!additions.length) throw new Error('Selecione pelo menos um produto.');
    const next = [...list, ...additions];
    checkPhotoSpace(next);
    save(next, personId ? registered : undefined);
    reset();
    $('wishEditor').open = false;
    message(additions.length + ' produtos adicionados.');
  }
  $('wishForm').onsubmit = (event) => {
    event.preventDefault();
    $('wishSaveError').textContent = '';
    try {
      if (!WalletStore.isWritable()) throw new Error('Aguarde a conexão com a carteira para salvar o desejo.');
      if (photoBusy) throw new Error('Aguarde a foto ficar pronta antes de salvar.');
      if (photoBatch) {
        savePhotoBatch();
        return;
      }
      const draft = formValues();
      if (!draft.url && !draft.imageUrl?.startsWith('data:')) throw new Error('Informe o link ou escolha uma foto do produto.');
      const { title, store, person, originalPrice, currency, quantity } = draft;
      if (!title || !store || !person || person.length > 80) throw new Error('Confira produto, loja e pessoa.');
      if (!validQuantity(quantity)) throw new Error('Informe uma quantidade inteira a partir de 1.');
      if (!validLinePrice(originalPrice, quantity)) throw new Error('Confira o preço unitário e a quantidade.');
      const list = rows(),
        previous = list.find((x) => x.id === editing);
      if (editing && !previous) throw new Error('Este desejo foi removido no outro aparelho.');
      const changes = {};
      const fields = [['url', 'imageUrl'], ['title'], ['store'], ['person'], ['originalPrice', 'currency'], ['quantity']];
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
      const next = { bought: false, ...previous, ...changes, id: editing || crypto.randomUUID(), updatedAt: Date.now() };
      const nextRows = editing ? list.map((x) => (x.id === editing ? next : x)) : [...list, next];
      if (changes.imageUrl?.startsWith('data:') && changes.imageUrl !== previous?.imageUrl) checkPhotoSpace(nextRows);
      save(nextRows, registered);
      reset();
      $('wishEditor').open = false;
    } catch (error) {
      $('wishSaveError').textContent = error.message;
    }
  };
  function drawWishPhoto(bitmap, max, crop = { x: 0, y: 0, w: 1, h: 1 }, maxScale = 1, padding = 0) {
    const width = bitmap.naturalWidth ?? bitmap.width;
    const height = bitmap.naturalHeight ?? bitmap.height;
    const w = width * crop.w, h = height * crop.h;
    const scale = Math.min(maxScale, max / Math.max(w, h));
    const canvas = document.createElement('canvas');
    const outputWidth = Math.max(1, Math.round(w * scale));
    const outputHeight = Math.max(1, Math.round(h * scale));
    canvas.width = outputWidth + 2 * padding;
    canvas.height = outputHeight + 2 * padding;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, width * crop.x, height * crop.y, w, h, padding, padding, outputWidth, outputHeight);
    return canvas;
  }
  function compressWishPhoto(bitmap, crop) {
    for (const max of [320, 240, 180, 128]) {
      const data = drawWishPhoto(bitmap, max, crop).toDataURL('image/jpeg', 0.68);
      if (WishProduct.savedImageUrl(data)) return data;
    }
    throw new Error('Não foi possível reduzir esta foto.');
  }
  function knownWishStore(title) {
    const key = personKey(normalizeName(title));
    if (!key) return '';
    const stores = new Map(rows()
      .filter((item) => item.store?.trim() && personKey(normalizeName(item.title)) === key)
      .map((item) => [personKey(normalizeName(item.store)), item.store]));
    return stores.size === 1 ? stores.values().next().value : '';
  }
  $('wishRemovePhoto').onclick = () => {
    photoRevision++;
    setPhotoBusy(false);
    $('wishUpload').value = '';
    $('wishFileUpload').value = '';
    $('wishPhotoMessage').textContent = '';
    showDraftImage(null);
  };
  async function decodeWishPhoto(file) {
    try {
      return await createImageBitmap(file);
    } catch {
      const image = new Image();
      const url = URL.createObjectURL(file);
      try {
        image.src = url;
        await image.decode();
        return image;
      } catch {
        throw new Error('Não foi possível abrir esta foto. Tente selecionar o arquivo novamente ou use outro print em JPG ou PNG.');
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }
  async function copyPickedPhoto(file) {
    const extension = file.name.match(/\.(jpe?g|png|webp|bmp)$/i)?.[1].toLowerCase();
    const type = !file.type || file.type === 'application/octet-stream'
      ? extension && 'image/' + (extension === 'jpg' ? 'jpeg' : extension)
      : file.type;
    if (!/^image\/(?:jpeg|png|webp|bmp)$/.test(type) || file.size > 12 * 1024 * 1024) return { warning: 'Escolha uma foto JPG, PNG, WebP ou BMP de até 12 MB.' };
    try {
      // Keep a readable copy before resetting the picker or starting OCR.
      const bytes = await Promise.resolve().then(() => file.arrayBuffer()).catch(() => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.onabort = () => reject();
        reader.readAsArrayBuffer(file);
      }));
      return { file: new File([bytes], file.name, { type }) };
    } catch {
      return { warning: 'O navegador não conseguiu ler este arquivo. Use Procurar em Arquivos e selecione a foto em Imagens ou Downloads.' };
    }
  }
  async function readWishPhoto(file, url, recognize, onImage = () => {}) {
    const bitmap = await decodeWishPhoto(file);
    let detailPhoto, badgePhoto, badgesArea;
    let imageUrl;
    try {
      const isPortrait = (bitmap.naturalHeight ?? bitmap.height) > (bitmap.naturalWidth ?? bitmap.width);
      const sample = drawWishPhoto(bitmap, isPortrait ? 320 : 160);
      const regions = WishProduct.screenshotRegions(sample.getContext('2d').getImageData(0, 0, sample.width, sample.height));
      imageUrl = compressWishPhoto(bitmap, regions?.photo);
      onImage(imageUrl);
      const cropFile = async (region, scale, padding) => {
        const canvas = drawWishPhoto(bitmap, 1550, region, scale, padding);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        return blob && new File([blob], file.name, { type: blob.type });
      };
      const textRegion = regions?.text || (isPortrait ? { x: 0, y: 0.43, w: 0.84, h: 0.48 } : null);
      if (textRegion) detailPhoto = await cropFile(textRegion, 2);
      if (isPortrait) {
        const badgeSample = drawWishPhoto(bitmap, 1280);
        const badge = WishProduct.mobileStoreBadge(badgeSample.getContext('2d').getImageData(0, 0, badgeSample.width, badgeSample.height));
        if (badge) badgePhoto = await cropFile(badge, 5, 16);
        badgesArea = await cropFile({ x: 0.80, y: 0.105, w: 0.20, h: 0.10 }, 4, 16);
      }
    } finally {
      bitmap.close?.();
    }
    const suggestion = { imageUrl };
    try {
      const { text } = await recognize(detailPhoto || file, () => {});
      Object.assign(suggestion, WishProduct.readPhotoText(text, url));
      suggestion.store ||= knownWishStore(suggestion.title);
      if (!suggestion.store && badgesArea) {
        const yesStyle = /\b(?:[yv][eo]sstyl[eo]|esstyle)\b/i;
        const badge = badgePhoto && await recognize(badgePhoto, () => {}, { tessedit_pageseg_mode: '7' });
        if ((badge && yesStyle.test(badge.text)) || yesStyle.test((await recognize(badgesArea, () => {}, { tessedit_pageseg_mode: '11' })).text)) {
          suggestion.store = 'YesStyle';
        }
      }
      if (detailPhoto && (!suggestion.title || !suggestion.store || suggestion.price == null)) {
        const full = await recognize(file, () => {});
        const fallback = WishProduct.readPhotoText(full.text, url);
        suggestion.title ||= fallback.title;
        suggestion.store ||= fallback.store || knownWishStore(suggestion.title);
        if (suggestion.price == null) {
          suggestion.price = fallback.price;
          suggestion.currency = fallback.currency;
        }
      }
    } catch {
      suggestion.warning = 'Confira e complete os campos que ficaram vazios.';
    }
    return suggestion;
  }
  function setPhotoBatch(batch) {
    photoBatch = batch;
    const active = batch !== null;
    $('wishBatch').hidden = !active;
    $('wishSingleFields').hidden = active;
    $('wishUrl').closest('.wish-link-row').hidden = active;
    $('wishImagePreview').hidden = active;
    $('wishConversion').hidden = active;
    for (const id of ['wishTitle', 'wishStore', 'wishPrice', 'wishCurrency', 'wishQuantity', 'wishUrl']) $(id).disabled = active;
    if (active) {
      $('wishRemovePhoto').hidden = true;
      $('wishCancel').hidden = false;
      $('wishCancel').textContent = 'Descartar lote';
      $('wishSave').textContent = 'Adicionar selecionados';
    }
    $('wishBatchRows').replaceChildren();
  }
  function appendPhotoRow(file, suggestion, i) {
    const esc = escapeHTML;
    const row = document.createElement('div');
    row.className = 'preview-row';
    const currency = suggestion.currency || 'BRL';
    const currencies = new Set([...$('wishCurrency').options].map((option) => option.value).concat(currency));
    const field = (label, key, attributes) => `<label>${label}<input data-field="${key}" ${attributes}><small class="wish-field-error" id="wishBatchError-${i}-${key}"></small></label>`;
    row.innerHTML = `<label class="row-title"><input type="checkbox" ${suggestion.imageUrl ? 'checked' : 'disabled'}> <span>${i + 1}. ${esc(file.name)}</span></label>${
      suggestion.imageUrl ? `<div class="form-grid">
        ${field('Produto', 'title', `maxlength="300" value="${esc(suggestion.title || '')}"`)}
        ${field('Loja', 'store', `maxlength="150" value="${esc(suggestion.store || '')}"`)}
        ${field('Preço unitário', 'price', `inputmode="decimal" value="${suggestion.price ?? ''}"`)}
        <label>Moeda<select data-field="currency">${[...currencies].map((value) => `<option ${value === currency ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>
        ${field('Quantidade', 'quantity', 'inputmode="numeric" value="1"')}
      </div>` : ''
    }${suggestion.warning ? `<p class="hint">${esc(suggestion.warning)}</p>` : ''}`;
    const image = thumbnail(suggestion.imageUrl);
    if (image) row.querySelector('.row-title').after(image);
    $('wishBatchRows').append(row);
  }
  $('wishBatchRows').addEventListener('input', ({ target }) => {
    if (target.matches('input[aria-invalid]')) batchFieldError(target, '');
    if (target.matches('input[type="checkbox"]') && !target.checked) {
      for (const input of target.closest('.preview-row').querySelectorAll('input[aria-invalid]')) batchFieldError(input, '');
    }
    if (!$('wishBatchRows').querySelector('input[aria-invalid]')) $('wishSaveError').textContent = '';
  });
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
  function setPhotoBusy(busy, progress = '') {
    photoBusy = busy;
    $('wishPhotoProgress').textContent = progress;
    $('wishPhotoLoading').hidden = !busy;
    for (const id of ['wishSave', 'wishUpload', 'wishBrowseFiles']) $(id).disabled = busy;
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
    setPhotoBusy(true, count);
    try {
      const picked = await Promise.all(files.map(copyPickedPhoto));
      if (token !== photoRevision) return;
      if (photoBatch) {
        reset();
        token = ++photoRevision;
        setPhotoBusy(true, count);
      }
      if (files.length > 1) {
        const batch = [];
        setPhotoBatch(batch);
        await withReceiptReader(async (recognize) => {
          for (const [i, file] of files.entries()) {
            if (token !== photoRevision) return;
            const photo = picked[i];
            const suggestion = photo.file
              ? await readWishPhoto(photo.file, '', recognize).catch((error) => ({ warning: error.message || 'Não foi possível abrir a foto.' }))
              : photo;
            if (token !== photoRevision) return;
            batch.push(suggestion);
            appendPhotoRow(file, suggestion, i);
            $('wishPhotoProgress').textContent = (i + 1) + '/' + files.length;
          }
        });
        if (token === photoRevision) status.textContent = batch.some(({ imageUrl }) => imageUrl)
          ? 'Confira os produtos antes de adicionar.'
          : 'Nenhuma foto pôde ser aberta. Confira os avisos abaixo.';
        return;
      }
      const photo = picked[0];
      if (!photo.file) throw new Error(photo.warning);
      const suggestion = await withReceiptReader((recognize) => readWishPhoto(photo.file, $('wishUrl').value, recognize, (imageUrl) => {
        if (token !== photoRevision) return;
        showDraftImage(imageUrl);
      }));
      if (token !== photoRevision) return;
      if (!$('wishTitle').value.trim()) $('wishTitle').value = suggestion.title || '';
      if (!$('wishStore').value.trim()) $('wishStore').value = suggestion.store || '';
      if ($('wishPrice').value === '' && suggestion.price != null) {
        $('wishPrice').value = suggestion.price;
        selectCurrency(suggestion.currency);
      }
      conversion();
      void WishFx.refresh();
      status.textContent = suggestion.title && suggestion.store && suggestion.price != null
        ? 'Confira nome, loja, preço e moeda antes de salvar.'
        : !suggestion.store && suggestion.title && suggestion.price != null
          ? 'Nome e preço encontrados. Informe a loja ou cole o link do produto.'
          : 'Foto pronta. Confira e complete os campos que ficaram vazios.';
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
      const response = await fetch(url.href, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: request.signal });
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error();
      const text = await response.text();
      if (text.length > 2000000) throw new Error();
      const doc = new DOMParser().parseFromString(text, 'text/html');
      if (token !== revision) return;
      const product = WishProduct.read(doc, url.hostname, response.url || url.href);
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
      if (token === revision) message(editing ? 'A loja não permitiu atualizar a prévia.' : 'A loja não permitiu a leitura. Preencha produto e valor.');
    } finally {
      clearTimeout(timeout);
    }
  };
  $('wishUrl').addEventListener('input', () => {
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
  $('wishCurrency').addEventListener('change', conversion);
  window.addEventListener('wishlist:rates', () => {
    conversion();
    render();
  });
  window.addEventListener('wallet:remote', conversion);
  window.addEventListener('wallet:remote', render);
  window.addEventListener('finance:changed', render);
  selectStore.addEventListener('change', render);
  hideBought.addEventListener('change', render);
  window.addEventListener('wishlist:purchase-undone', () => {
    selectStore.value = '';
    purchaseSelection.clear();
    render();
    const feedback = $('wishPurchaseFeedback');
    feedback.textContent = 'Compra desfeita. Os itens voltaram para a lista de desejos.';
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
    if (title && !/https?:\/\//i.test(title)) $('wishTitle').value = title.slice(0, 300);
    void $('wishRead').onclick();
  }
  window.addEventListener('wallet:control', openIncomingShare);
  render();
  updatePeople(rows(), defaultPerson);
  openIncomingShare();
});
