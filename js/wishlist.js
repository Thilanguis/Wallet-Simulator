'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  let editing = null,
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
  const link = (value) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use um link http ou https válido.');
    return url;
  };
  const message = (text) => {
    $('wishMessage').textContent = text;
  };
  function save(items) {
    AppStorage.setItem('wishlist', JSON.stringify(items));
    AppStorage.flush();
    render();
  }
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
    revision++;
    request?.abort();
    clearTimeout(autoRead);
    $('wishForm').reset();
    showDraftImage(null);
    $('wishCancel').hidden = true;
    $('wishSave').textContent = 'Adicionar desejo';
    message('');
    conversion();
  }
  function render() {
    const list = rows(),
      host = $('wishList');
    host.replaceChildren();
    let totalCents = 0, missing = 0;
    for (const item of list) {
      if (item.bought) continue;
      const original = item.originalPrice ?? item.price;
      const estimate = original == null ? null : WishFx.convert(original, item.currency || 'BRL');
      if (estimate == null) missing++; else totalCents += Math.round(estimate * 100);
    }
    $('wishTotal').textContent = '≈ ' + formatBR(totalCents / 100);
    $('wishTotal').title = missing ? missing + ' item(ns) a comprar sem preço ou cotação, fora do total.' : 'Somente itens ainda não comprados.';
    const boughtCount = list.filter(x => x.bought).length;
    $('wishSummary').textContent = (list.length ? (list.length - boughtCount) + ' a comprar · ' + boughtCount + ' comprado(s)' : 'Sua lista está vazia.') + (missing ? ' · ' + missing + ' sem cotação' : '');
    const groups = new Map();
    for (const item of list) {
      if (!groups.has(item.store)) groups.set(item.store, []);
      groups.get(item.store).push(item);
    }
    for (const [store, items] of groups) {
      const section = document.createElement('section');
      section.className = 'wish-group';
      const heading = document.createElement('h3');
      heading.textContent = store;
      let groupCents = 0, groupMissing = 0;
      for (const item of items) { if(item.bought) continue; const original = item.originalPrice ?? item.price; const value = original == null ? null : WishFx.convert(original,item.currency || 'BRL'); if(value == null) groupMissing++; else groupCents += Math.round(value*100); }
      const groupTotal = document.createElement('span'); groupTotal.className = 'wish-group-total'; groupTotal.textContent = '≈ ' + formatBR(groupCents/100) + (groupMissing ? ' + sem cotação' : ''); heading.append(groupTotal);
      section.append(heading);
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'wish-row';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = item.bought;
        check.setAttribute('aria-label', 'Comprado: ' + item.title);
        check.onchange = () => save(rows().map((x) => (x.id === item.id ? { ...x, bought: check.checked, updatedAt: Date.now() } : x)));
        const anchor = document.createElement('a');
        anchor.className = 'wish-product-link';
        anchor.textContent = item.title;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        try {
          anchor.href = link(item.url).href;
        } catch {}
        const image = thumbnail(item.imageUrl, true);
        if (image) {
          const title = document.createElement('span');
          title.textContent = item.title;
          anchor.replaceChildren(image, title);
        }
        if (item.bought) anchor.classList.add('is-bought');
        const price = document.createElement('span');
        const original = item.originalPrice ?? item.price,
          currency = item.currency || 'BRL';
        const estimate = original == null ? null : WishFx.convert(original, currency);
        price.textContent = original == null ? '—' : currency === 'BRL' ? formatBR(original) : currency + ' ' + original.toLocaleString('pt-BR') + (estimate == null ? ' · sem cotação' : ' ≈ ' + formatBR(estimate));
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'wish-tool';
        edit.textContent = '✎';
        edit.setAttribute('aria-label', 'Editar ' + item.title);
        edit.onclick = () => {
          reset();
          editing = item.id;
          $('wishEditor').open = true;
          $('wishUrl').value = item.url;
          showDraftImage(item.imageUrl);
          $('wishTitle').value = item.title;
          $('wishStore').value = item.store;
          $('wishPrice').value = item.originalPrice ?? item.price ?? '';
          selectCurrency(item.currency || 'BRL');
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
        row.append(check, anchor, price, edit, remove);
        section.append(row);
      }
      host.append(section);
    }
  }
  $('wishCancel').onclick = reset;
  $('wishForm').onsubmit = (event) => {
    event.preventDefault();
    try {
      const url = link($('wishUrl').value).href,
        title = $('wishTitle').value.trim(),
        store = $('wishStore').value.trim(),
        price = $('wishPrice').value === '' ? null : Number($('wishPrice').value);
      if (!title || !store || (price !== null && (!Number.isFinite(price) || price < 0))) throw new Error('Confira produto, loja e valor.');
      const list = rows(),
        previous = list.find((x) => x.id === editing);
      if (editing && !previous) throw new Error('Este desejo foi removido no outro aparelho.');
      const currency = $('wishCurrency').value;
      const next = { ...previous, id: editing || crypto.randomUUID(), url, title, store, originalPrice: price, currency, price: price == null ? null : WishFx.convert(price, currency), bought: previous?.bought || false, updatedAt: Date.now(), imageUrl: draftImage || undefined };
      save(editing ? list.map((x) => (x.id === editing ? next : x)) : [...list, next]);
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
      if (!refreshImage) {
        $('wishTitle').value = '';
        $('wishPrice').value = '';
        $('wishStore').value = WishProduct.store(url.hostname);
      }
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
        $('wishTitle').value = product.title;
        $('wishStore').value = product.store;
        $('wishPrice').value = product.price ?? '';
        selectCurrency(product.currency || (url.hostname.startsWith('ca.') ? 'CAD' : 'BRL'));
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
      autoRead = setTimeout(() => $('wishRead').click(), 600);
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
  render();
});
