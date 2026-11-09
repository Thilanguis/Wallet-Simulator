'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  let editing = null,
    editBaseline = null,
    editItem = null,
    request = null,
    revision = 0,
    autoRead = null,
    draftImage = null;
  function conversion() {
    const value = $('wishPrice').value === '' ? null : Number($('wishPrice').value),
      currency = $('wishCurrency').value;
    const estimate = value == null ? null : WishFx.convert(value, currency);
    const date = WishFx.current()?.dates[currency];
    $('wishConversion').textContent = value == null ? '' : estimate == null ? 'Cotação indisponível · preço original preservado' : '≈ ' + formatBR(estimate) + (currency === 'BRL' ? '' : ' · cotação ' + (date || 'salva') + ' · sem taxas/frete');
  }
  const rows = () => JSON.parse(AppStorage.getItem('wishlist') || '[]');
  const defaultPerson = 'Dominadora';
  const newPerson = '';
  const roster = () => JSON.parse(AppStorage.getItem('wishlistPeople') || '[]');
  const personOf = (item, registered = roster()) => registered.find((person) => person.id === item.personId)?.name || item.person?.trim() || defaultPerson;
  const personKey = (name) => name.normalize('NFC').toLocaleLowerCase('pt-BR');
  const normalizeName = (name) => name.trim().replace(/\s+/g, ' ').normalize('NFC');
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
      const option = new Option(name, name);
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
      const existingName = people(rows()).get(personKey(name));
      const registered = roster();
      if (personKey(name) !== personKey(defaultPerson)) registerPerson(existingName || name, registered);
      save(null, registered);
      updatePeople(rows(), existingName || name);
      $('wishPersonName').value = '';
      message('Pessoa selecionada.');
    } catch (error) {
      message(error.message);
    }
  };
  function thumbnail(value, lazy = false) {
    const url = WishProduct.imageUrl(value);
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
    draftImage = WishProduct.imageUrl(value);
    const image = thumbnail(draftImage);
    $('wishImagePreview').replaceChildren(...(image ? [image] : []));
  }
  function reset() {
    editing = null;
    editBaseline = null;
    editItem = null;
    revision++;
    request?.abort();
    clearTimeout(autoRead);
    $('wishForm').reset();
    updatePeople(rows(), defaultPerson);
    showDraftImage(null);
    $('wishCancel').hidden = true;
    $('wishSave').textContent = 'Adicionar desejo';
    message('');
    conversion();
  }
  function estimate(items) {
    let cents = 0, missing = 0;
    for (const item of items) {
      const original = item.originalPrice ?? item.price;
      const value = original == null ? null : WishFx.convert(original, item.currency || 'BRL');
      if (value == null) missing++;
      else cents += Math.round(value * 100);
    }
    return { cents, missing };
  }
  function originalPriceLabel(original, currency) {
    if (currency === 'BRL') return formatBR(original);
    return currency + ' ' + original.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }
  function priceLabel(item, convert = true) {
    const original = item.originalPrice ?? item.price;
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
      if (key === personKey(defaultPerson)) throw new Error('Dominadora é o perfil padrão da lista.');
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
  let photoPreparation;
  const photoPreviewUrls = [];
  function clearPhotoPreview() {
    photoPreparation?.abort();
    $('wishImageExport').hidden = true;
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
      const width = 420, header = 76, rowHeight = 78, scale = 2;
      const footer = header + items.length * rowHeight;
      const height = footer + 65;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#20161e';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#4d2639';
      ctx.fillRect(0, 0, width, 66);
      function write(text, x, y, available) {
        const label = String(text).replace(/\s+/g, ' ').trim();
        if (ctx.measureText(label).width <= available) {
          ctx.fillText(label, x, y);
          return;
        }
        const characters = Array.from(label).slice(0, 100);
        while (characters.length && ctx.measureText(characters.join('') + '…').width > available) characters.pop();
        ctx.fillText(characters.join('') + '…', x, y);
      }
      ctx.font = 'bold 19px system-ui';
      ctx.fillStyle = '#ffe0ea';
      write('Lista de itens · ' + person, 16, 34, width - 32);
      ctx.font = '12px system-ui';
      ctx.fillStyle = '#efd2df';
      write(pageCount > 1 ? 'Parte ' + page + ' de ' + pageCount : items.length + (items.length === 1 ? ' item' : ' itens'), 16, 53, width - 32);
      items.forEach((item, index) => {
        const y = header + index * rowHeight;
        const bitmap = bitmaps.get(WishProduct.imageUrl(item.imageUrl));
        const x = bitmap ? 72 : 16;
        if (bitmap) {
          const size = 44;
          const ratio = Math.min(size / bitmap.width, size / bitmap.height);
          const w = bitmap.width * ratio, h = bitmap.height * ratio;
          ctx.fillStyle = '#f2e5eb';
          ctx.fillRect(16, y + 7, size, size);
          ctx.drawImage(bitmap, 16 + (size - w) / 2, y + 7 + (size - h) / 2, w, h);
        }
        ctx.font = 'bold 14px system-ui';
        ctx.fillStyle = '#fff0f6';
        write(item.title, x, y + 23, width - x - 16);
        ctx.font = '12px system-ui';
        ctx.fillStyle = '#ffe1a2';
        write([prices.get(item.id), item.store].filter(Boolean).join(' · '), x, y + 42, width - x - 16);
        ctx.fillStyle = '#e3adc4';
        const url = links.get(item.id);
        if (url) write(url.replace(/^https?:\/\//, ''), x, y + 60, width - x - 16);
        ctx.fillStyle = '#563748';
        ctx.fillRect(16, y + 71, width - 32, 1);
      });
      ctx.font = '12px system-ui';
      ctx.fillStyle = '#efd2df';
      write('Total estimado da lista', 16, footer + 20, width - 32);
      ctx.font = 'bold 17px system-ui';
      ctx.fillStyle = '#ffe1a2';
      write(total, 16, footer + 45, width - 32);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
      const filename = 'lista-de-itens' + (pageCount > 1 ? '-' + page : '') + '.jpg';
      return blob ? new File([blob], filename, { type: 'image/jpeg' }) : null;
    } finally {
      for (const bitmap of bitmaps.values()) bitmap.close();
    }
  }
  function originalTotals(items) {
    const totals = new Map();
    let missing = 0;
    for (const item of items) {
      const original = item.originalPrice ?? item.price;
      if (original == null) {
        missing++;
        continue;
      }
      const currency = item.currency || 'BRL';
      totals.set(currency, (totals.get(currency) || 0) + Math.round(original * 100));
    }
    const labels = [...totals].map(([currency, cents]) => originalPriceLabel(cents / 100, currency));
    if (missing) labels.push(missing + ' sem preço');
    return labels.join(' + ') || '—';
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
  function shareGroup(person, items) {
    clearPhotoPreview();
    const selected = new Set(items.filter((item) => !item.bought).map((item) => item.id));
    const links = new Map();
    const prices = new Map();
    const conversionOption = $('wishShareConvert');
    const photoButton = $('wishSharePhotos');
    const photoStatus = $('wishShareStatus');
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
      photoStatus.textContent = 'Montando a imagem da lista…';
      try {
        for (let page = 1; page <= pageCount; page++) {
          const cardItems = chosen.slice((page - 1) * itemsPerCard, page * itemsPerCard);
          const photos = [...new Set(cardItems.map((item) => WishProduct.imageUrl(item.imageUrl)).filter(Boolean))];
          const results = await Promise.all(photos.map((url) => prepareSharePhoto(url, signal)));
          if (controller.signal.aborted || !shareDialog.open) return;
          const images = new Map(photos.flatMap((url, index) => results[index] ? [[url, results[index]]] : []));
          missingPhotos ||= images.size !== photos.length;
          const card = await makeWishPhotoCard({ person, items: cardItems, images, links, prices: cardPrices, total, page, pageCount });
          if (!card) throw new Error('Imagem indisponível');
          files.push(card);
        }
        if (controller.signal.aborted || !shareDialog.open) return;
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
          figure.append(preview, download);
          return figure;
        }));
        sendImages.hidden = typeof navigator.share !== 'function' || !navigator.canShare?.({ files });
        sendImages.textContent = files.length > 1 ? 'Enviar imagens' : 'Enviar imagem';
        sendImages.onclick = async () => {
          try {
            await navigator.share({ files });
          } catch (error) {
            if (error.name !== 'AbortError') photoStatus.textContent = 'Não foi possível abrir o compartilhamento. Use Salvar imagem.';
          }
        };
        $('wishImageExport').hidden = false;
        $('wishImageExport').scrollIntoView({ block: 'nearest' });
        photoStatus.textContent = missingPhotos ? 'Algumas lojas não liberaram a foto. Os itens continuam na imagem.' : '';
      } catch {
        if (!controller.signal.aborted) photoStatus.textContent = 'Não foi possível montar a imagem. A mensagem de texto continua disponível.';
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
        (item.bought ? '✅ ' : '🎁 ') + '*' + clean(item.title) + '* — 💰 ' + priceLabel(item, includeConversion),
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
      label.append(check, ...(image ? [image] : []), item.title + (item.bought ? ' · comprado' : ''));
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
  $('wishShareNative').hidden = typeof navigator.share !== 'function';
  $('wishShareNative').onclick = async () => {
    try {
      await navigator.share({ text: $('wishSharePreview').value });
    } catch (error) {
      if (error.name !== 'AbortError') $('wishShareStatus').textContent = 'Não foi possível abrir o compartilhamento. Use WhatsApp ou copie a mensagem.';
    }
  };
  $('wishShareCopy').onclick = async () => {
    const preview = $('wishSharePreview');
    try {
      await navigator.clipboard.writeText(preview.value);
      $('wishShareStatus').textContent = 'Mensagem copiada.';
    } catch {
      preview.focus();
      preview.select();
      $('wishShareStatus').textContent = 'Mensagem selecionada. Use a opção Copiar do aparelho.';
    }
  };
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
      if (!ids.size || !(await AppDialog.confirm('Excluir ' + ids.size + (ids.size === 1 ? ' item' : ' itens') + ' da lista de ' + person + '?'))) return;
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
    const current = editing && list.find((item) => item.id === editing);
    if (current && editBaseline?.person === $('wishPerson').value) {
      editBaseline.person = personOf(current);
      updatePeople(list, editBaseline.person);
    } else updatePeople(list);
    if (peopleDialog.open) renderFriends(list);
    const { cents, missing } = estimate(list.filter((item) => !item.bought));
    $('wishTotal').textContent = '≈ ' + formatBR(cents / 100);
    $('wishTotal').title = missing ? missing + ' item(ns) a comprar sem preço ou cotação, fora do total.' : 'Somente itens ainda não comprados.';
    const boughtCount = list.filter(x => x.bought).length;
    $('wishSummary').textContent = (list.length ? (list.length - boughtCount) + ' a comprar · ' + boughtCount + ' comprado(s)' : 'Sua lista está vazia.') + (missing ? ' · ' + missing + ' sem cotação' : '');
    renderQuotes(list);
    const groups = new Map();
    const registered = roster();
    const names = people(list, registered);
    const friendCount = friendsOnly(names).length;
    $('wishFriendCount').textContent = String(friendCount);
    $('wishManagePeople').setAttribute('aria-label', 'Gerenciar amigas: ' + friendCount + (friendCount === 1 ? ' amiga' : ' amigas'));
    for (const item of list) {
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
      heading.textContent = person;
      const header = document.createElement('header');
      header.className = 'wish-group-header';
      const pending = items.filter((item) => !item.bought);
      const groupTotal = document.createElement('span');
      groupTotal.className = 'wish-group-total';
      groupTotal.textContent = pending.length + ' a comprar · ' + estimateLabel(estimate(pending));
      const managing = managingPerson === person;
      const share = wishGroupButton('Compartilhar', 'Compartilhar desejos de ' + person);
      share.onclick = () => shareGroup(person, items);
      const manage = wishGroupButton(managing ? 'Concluir' : 'Gerenciar', (managing ? 'Concluir gerenciamento de ' : 'Gerenciar itens de ') + person);
      manage.setAttribute('aria-pressed', String(managing));
      manage.onclick = () => {
        managingPerson = managing ? null : person;
        selectedWishes.clear();
        render();
        const buttons = [...host.querySelectorAll('.wish-group-header button')];
        const focus = managing ? buttons.find((button) => button.getAttribute('aria-label') === 'Gerenciar itens de ' + person) : host.querySelector('.wish-bulk-actions input');
        focus?.focus();
      };
      const actions = document.createElement('div');
      actions.className = 'wish-group-actions';
      actions.append(share, manage);
      header.append(heading, groupTotal, actions);
      section.append(header);
      const bulk = managing ? wishBulkActions(person, items) : null;
      if (bulk) section.append(bulk.toolbar);
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'wish-row';
        const check = document.createElement('input');
        check.type = 'checkbox';
        if (bulk) bulk.bind(item, check);
        else {
          check.checked = item.bought;
          check.setAttribute('aria-label', 'Comprado: ' + item.title);
          check.onchange = () => save(rows().map((x) => (x.id === item.id ? { ...x, bought: check.checked, updatedAt: Date.now() } : x)));
        }
        const anchor = document.createElement('a');
        anchor.className = 'wish-product-link';
        anchor.textContent = item.title;
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
          title.textContent = item.title;
          anchor.classList.add('wish-product-link');
          anchor.replaceChildren(image, title);
          product.classList.add('has-thumbnail');
        }
        const store = document.createElement('small');
        store.textContent = item.store;
        product.append(anchor, store);
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
          $('wishUrl').value = item.url;
          showDraftImage(item.imageUrl);
          $('wishTitle').value = item.title;
          $('wishStore').value = item.store;
          $('wishPrice').value = item.originalPrice ?? item.price ?? '';
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
        section.append(row);
      }
      host.append(section);
    }
  }
  function formValues(validateLink = true) {
    const enteredName = ($('wishPerson').value || $('wishPersonName').value).trim().replace(/\s+/g, ' ');
    const person = people(rows()).get(personKey(enteredName)) || enteredName;
    return {
      url: validateLink ? link($('wishUrl').value).href : $('wishUrl').value,
      title: $('wishTitle').value.trim(),
      store: $('wishStore').value.trim(),
      person,
      originalPrice: $('wishPrice').value === '' ? null : Number($('wishPrice').value),
      currency: $('wishCurrency').value,
      imageUrl: draftImage || undefined,
    };
  }
  $('wishCancel').onclick = reset;
  $('wishForm').onsubmit = (event) => {
    event.preventDefault();
    try {
      if (!WalletStore.isWritable()) throw new Error('Aguarde a conexão com a carteira para salvar o desejo.');
      const draft = formValues();
      const { title, store, person, originalPrice, currency } = draft;
      if (!title || !store || !person || person.length > 80 || (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice < 0))) throw new Error('Confira produto, loja, pessoa e valor.');
      const list = rows(),
        previous = list.find((x) => x.id === editing);
      if (editing && !previous) throw new Error('Este desejo foi removido no outro aparelho.');
      const changes = {};
      const fields = [['url', 'imageUrl'], ['title'], ['store'], ['person'], ['originalPrice', 'currency']];
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
      save(editing ? list.map((x) => (x.id === editing ? next : x)) : [...list, next], registered);
      reset();
      $('wishEditor').open = false;
    } catch (error) {
      message(error.message);
    }
  };
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
      if (product.imageUrl) showDraftImage(product.imageUrl);
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
    showDraftImage(null);
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
  $('wishCurrency').addEventListener('change', conversion);
  window.addEventListener('wishlist:rates', () => {
    conversion();
    render();
  });
  window.addEventListener('wallet:remote', conversion);
  window.addEventListener('wallet:remote', render);
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
