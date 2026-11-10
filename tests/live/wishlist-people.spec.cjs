const { test, expect } = require('../firebase-fixture.cjs');

function useSharePlatform(page, platform) {
  return page.addInitScript((value) => {
    Object.defineProperty(navigator, 'userAgentData', { value: { platform: value } });
  }, platform);
}

async function productImage(page) {
  return Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 20;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#23a65c';
    ctx.fillRect(0, 0, 20, 20);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
}

test('groups old and new wishes and shares only the confirmed selection', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: async ({ text }) => { window.lastSharedWish = text; } });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.lastCopiedWish = text; } } });
  });
  await page.setViewportSize({ width: 393, height: 850 });
  await page.route('https://shop.example.invalid/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  const legacy = { id: 'legacy', title: 'Anel', store: 'Joalheria', url: 'https://shop.example.invalid/anel', originalPrice: 150, currency: 'BRL', bought: true };
  await page.evaluate((item) => {
    AppStorage.setItem('wishlist', JSON.stringify([item]));
    AppStorage.flush();
    window.dispatchEvent(new Event('wallet:remote'));
  }, legacy);
  await page.locator('[data-panel=wishlistPanel]').click();
  const editor = page.locator('#wishEditor');
  await editor.locator('summary').click();
  await page.locator('#wishPerson').selectOption('');
  await page.locator('#wishPersonName').fill('Camila');
  await page.getByRole('button', { name: 'Salvar pessoa' }).click();
  await expect(page.locator('#wishPerson')).toHaveValue('Camila');
  await expect(page.locator('.wish-row')).toHaveCount(1);
  await editor.getByRole('button', { name: 'Fechar painel' }).click();
  const add = async (title, price, person) => {
    await editor.locator('summary').click();
    await page.locator('#wishUrl').fill('https://shop.example.invalid/' + title.toLowerCase());
    await page.locator('#wishTitle').fill(title);
    await page.locator('#wishStore').fill('Loja teste');
    await page.locator('#wishPrice').fill(String(price));
    await page.locator('#wishPerson').selectOption(person === 'new' ? '' : 'Ana');
    if (person === 'new') await page.locator('#wishPersonName').fill('  Ana  ');
    await page.locator('#wishSave').click();
    await expect(editor).not.toHaveAttribute('open', '');
  };
  await add('Bolsa', 200, 'new');
  await add('Relógio', 75, 'existing');
  const ana = page.locator('.wish-group').filter({ has: page.getByRole('heading', { name: 'Ana', exact: true }) });
  await expect(ana.locator('.wish-group-total')).toHaveText(/2 a comprar.*R\$\s*0,00/);
  await expect(ana).toContainText('Loja teste');
  await ana.getByRole('checkbox', { name: 'Comprado: Relógio' }).check();
  await page.getByRole('button', { name: 'Registrar compra', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await expect(ana.locator('.wish-group-total')).toHaveText(/1 a comprar.*R\$\s*0,00/);
  await ana.getByRole('button', { name: 'Compartilhar desejos de Ana' }).click();
  const dialog = page.locator('#wishShareDialog');
  const preview = dialog.locator('#wishSharePreview');
  await expect(dialog.getByRole('checkbox', { name: 'Bolsa' })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Relógio · comprado' })).not.toBeChecked();
  await expect(preview).toHaveValue(/Bolsa.*200,00[\s\S]*https:\/\/shop.example.invalid\/bolsa/);
  expect(await page.evaluate(() => window.lastSharedWish)).toBeUndefined();
  await dialog.getByRole('checkbox', { name: 'Bolsa' }).uncheck();
  await expect(dialog.getByRole('button', { name: 'Copiar mensagem' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Relógio · comprado' }).check();
  await expect(dialog.locator('#wishShareTotal')).toContainText('75,00');
  const text = await preview.inputValue();
  expect(new URL(await dialog.locator('#wishShareWhatsApp').getAttribute('href')).searchParams.get('text')).toBe(text);
  await dialog.getByRole('button', { name: 'Copiar mensagem' }).click();
  await dialog.getByRole('button', { name: 'Compartilhar…' }).click();
  expect(await page.evaluate(() => [window.lastCopiedWish, window.lastSharedWish])).toEqual([text, text]);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await dialog.getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(page.getByRole('heading', { name: 'Luana', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist'))[0])).toEqual(legacy);
  await ana.getByRole('button', { name: 'Gerenciar itens de Ana' }).click();
  await expect(ana.getByRole('button', { name: 'Excluir selecionados' })).toBeHidden();
  await ana.getByRole('checkbox', { name: 'Selecionar todos' }).check();
  await expect(ana.getByRole('checkbox', { name: 'Selecionar Relógio' })).toBeChecked();
  await expect(ana.getByRole('status')).toHaveText('2 selecionados');
  await ana.getByRole('button', { name: 'Excluir selecionados' }).click();
  await page.locator('[data-dialog-cancel]').click();
  await expect(ana.locator('.wish-row')).toHaveCount(2);
  await ana.getByRole('checkbox', { name: 'Selecionar Bolsa' }).uncheck();
  await expect(ana.getByRole('status')).toHaveText('1 selecionado');
  await ana.getByRole('checkbox', { name: 'Selecionar todos' }).check();
  await ana.getByRole('button', { name: 'Excluir selecionados' }).click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(ana).toHaveCount(0);
  await expect(page.locator('#wishList .wish-row')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist')))).toEqual([legacy]);
  await expect(page.locator('#wishFriendCount')).toHaveText('2');
});

test('shares original currencies on request and shortens links without losing product options', async ({ page }) => {
  const image = await productImage(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: ({ files }) => files.length === 1 && files[0].type === 'image/jpeg' });
    Object.defineProperty(navigator, 'share', { value: async ({ text, files }) => {
      const bitmap = await createImageBitmap(files[0]);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const [r, g] = ctx.getImageData(60, 210, 1, 1).data;
      window.sharedWithPhoto = { text: text || null, photos: files.map((file) => file.name), width: bitmap.width, height: bitmap.height, hasThumbnail: g > r + 50 };
      bitmap.close();
    } });
  });
  await page.route('https://ca.pandora.net/photo.png', (route) => route.fulfill({
    contentType: 'image/png',
    headers: { 'access-control-allow-origin': '*' },
    body: image,
  }));
  await page.route('https://api.frankfurter.dev/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  const url = 'https://ca.pandora.net/anel?variant=azul&product_finding_method=search&utm_source=feed&fbclid=long#details';
  await page.evaluate((productUrl) => {
    const items = [
      { id: 'a', title: 'Anel', url: productUrl, store: 'Pandora', originalPrice: 25, currency: 'CAD', imageUrl: 'https://ca.pandora.net/photo.png' },
      { id: 'b', title: 'Bolsa', url: 'https://example.invalid/bolsa', originalPrice: 50, currency: 'BRL' },
    ];
    AppStorage.setItem('wishlist', JSON.stringify(items));
    AppStorage.setItem('wishlistFx', JSON.stringify({ rates: { CAD: 4 }, dates: {} }));
    AppStorage.flush();
    window.dispatchEvent(new Event('wallet:remote'));
  }, url);
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.getByRole('button', { name: 'Compartilhar desejos de Luana' }).click();
  const dialog = page.locator('#wishShareDialog');
  const preview = dialog.locator('#wishSharePreview');
  const cleaned = 'https://ca.pandora.net/anel?variant=azul#details';
  await expect(dialog.getByRole('link', { name: 'Ver Anel na loja' })).toHaveAttribute('href', cleaned);
  const single = await dialog.getByRole('link', { name: 'Compartilhar só o link de Anel no WhatsApp' }).getAttribute('href');
  expect(new URL(single).searchParams.get('text')).toBe(cleaned);
  await expect(preview).toHaveValue(/CAD 25,00 ≈ R\$\s*100,00[\s\S]*150,00/);
  await dialog.getByRole('checkbox', { name: 'Incluir conversão em reais' }).uncheck();
  await expect(dialog.locator('#wishShareTotal')).toContainText(/CAD 25,00 \+ R\$\s*50,00/);
  const shared = await preview.inputValue();
  expect(shared).not.toMatch(/100,00|150,00|utm_source|fbclid|product_finding_method/);
  expect(shared).toContain(cleaned);
  expect(new URL(await dialog.locator('#wishShareWhatsApp').getAttribute('href')).searchParams.get('text')).toBe(shared);
  await expect(dialog.locator('.wish-share-row img')).toBeVisible();
  await dialog.getByRole('button', { name: 'Montar imagem' }).click();
  await expect(dialog.getByRole('img', { name: 'Lista de itens de Luana' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Salvar imagem' })).toHaveAttribute('download', 'lista-de-itens.jpg');
  expect(await page.evaluate(() => window.sharedWithPhoto)).toBeUndefined();
  await dialog.getByRole('button', { name: 'Enviar imagem', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.sharedWithPhoto)).toEqual({
    text: null, photos: ['lista-de-itens.jpg'], width: 840, height: 594, hasThumbnail: true,
  });
  await dialog.getByRole('checkbox', { name: 'Anel' }).uncheck();
  await expect(dialog.locator('#wishImageExport')).toBeHidden();
  await expect(dialog.locator('#wishSharePhotos')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist'))[0].url)).toBe(url);
});

test('automatically attaches a public Pandora photo when direct reading is blocked', async ({ page }) => {
  const image = await productImage(page);
  const publicUrl = 'https://ca.pandora.net/dw/image/v2/AAVX_PRD/on/demandware.static/-/Sites-pandora-master-catalog/default/dw1234/productimages/main_rect_center/charm.jpg?sw=384&sfrm=png';
  const url = publicUrl + '&token=private-value&tracking=private-value#extra';
  let relaySource;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: ({ files }) => files.every((file) => ['image/png', 'image/jpeg'].includes(file.type)) });
    Object.defineProperty(navigator, 'share', { value: async ({ files, text }) => {
      window.localPhotoShare = { files: files.map((file) => file.name), text: text || null };
    } });
  });
  await page.setViewportSize({ width: 393, height: 850 });
  await page.route(url, (route) => route.request().resourceType() === 'image'
    ? route.fulfill({ contentType: 'image/png', body: image })
    : route.abort('failed'));
  await page.route('https://wsrv.nl/**', (route) => {
    relaySource = new URL(route.request().url()).searchParams.get('url');
    return route.fulfill({ contentType: 'image/jpeg', body: image });
  });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.evaluate((imageUrl) => {
    const item = { id: 'charm', title: 'Pingente', store: 'Loja', url: 'https://shop.example.invalid/charm', imageUrl, originalPrice: 50, currency: 'BRL' };
    AppStorage.setItem('wishlist', JSON.stringify([item]));
    AppStorage.flush();
    window.dispatchEvent(new Event('wallet:remote'));
  }, url);
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.getByRole('button', { name: 'Compartilhar desejos de Luana' }).click();
  const dialog = page.locator('#wishShareDialog');
  await expect(dialog.locator('img')).toBeVisible();
  await dialog.getByRole('button', { name: 'Montar imagem' }).click();
  await dialog.getByRole('button', { name: 'Enviar imagem', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.localPhotoShare)).toEqual({
    files: ['lista-de-itens.jpg'],
    text: null,
  });
  expect(relaySource).toBe(publicUrl);
  await expect(dialog.locator('input[type=file]')).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: 'Pingente' }).uncheck();
  await expect(dialog.getByRole('button', { name: 'Montar imagem' })).toBeHidden();
});

test('renders full product names and multi-unit quantities in the shared JPEG', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  const longTitle = 'Kit de cuidados para a pele com embalagem especial e refil de viagem edição comemorativa ' + 'X'.repeat(75) + ' Acabamento lavanda';
  await page.evaluate((title) => {
    const canvas = document.createElement('canvas');
    const imageUrl = canvas.toDataURL('image/jpeg');
    AppStorage.setItem('wishlist', JSON.stringify([
      { id: 'long', title, store: 'Loja Aurora', imageUrl, originalPrice: 12.5, currency: 'BRL', quantity: 3 },
      { id: 'legacy', title: 'Produto seguinte', store: 'Loja Aurora', originalPrice: 7.25, currency: 'BRL' },
    ]));
    AppStorage.flush();
    window.dispatchEvent(new Event('wallet:remote'));
    window.cardLines = [];
    const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y) {
      window.cardLines.push({ text, x, y, width: this.measureText(text).width, color: this.fillStyle });
      return nativeFillText.call(this, text, x, y);
    };
  }, longTitle);
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.getByRole('button', { name: 'Compartilhar desejos de Luana' }).click();
  const dialog = page.locator('#wishShareDialog');
  await dialog.getByRole('button', { name: 'Montar imagem' }).click();
  const preview = dialog.locator('#wishImageCards img');
  await expect(preview).toBeVisible();
  expect(await preview.evaluate(async (image) => { await image.decode(); return image.naturalHeight; })).toBeGreaterThan(594);
  const lines = await page.evaluate(() => window.cardLines);
  const titles = lines.filter(({ color }) => color === '#fff0f6');
  expect(titles.at(-1).text).toBe('Produto seguinte');
  expect(titles.slice(0, -1).map(({ text }) => text).join('').replace(/\s/g, '')).toBe(longTitle.replace(/\s/g, ''));
  expect(titles[0].x).toBe(72);
  const quantity = lines.find(({ text }) => text.includes('3 un.'));
  expect(quantity.text).toContain('37,50');
  expect(quantity.y).toBeGreaterThan(titles.at(-2).y);
  expect(quantity.y).toBeLessThan(titles.at(-1).y);
  expect(lines.some(({ text }) => text.includes('44,75'))).toBe(true);
  expect(lines.every(({ x, width }) => x + width <= 405)).toBe(true);
});

test('provides a usable fallback when native text and image sharing fail', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true });
    Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('Share unavailable', 'NotAllowedError'); } });
  });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.evaluate(() => {
    const item = { id: 'a', title: 'Anel', store: 'Loja', originalPrice: 50, currency: 'BRL' };
    AppStorage.setItem('wishlist', JSON.stringify([item]));
    AppStorage.flush();
    window.dispatchEvent(new Event('wallet:remote'));
  });
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.getByRole('button', { name: 'Compartilhar desejos de Luana' }).click();
  const dialog = page.locator('#wishShareDialog');
  await dialog.locator('#wishShareNative').click();
  await expect(dialog.locator('#wishShareStatus')).toContainText('Mensagem copiada');
  const message = await dialog.locator('#wishSharePreview').inputValue();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(message);
  expect(new URL(await dialog.locator('#wishShareWhatsApp').getAttribute('href')).searchParams.get('text')).toBe(message);
  await dialog.getByRole('button', { name: 'Montar imagem' }).click();
  await dialog.getByRole('button', { name: 'Copiar imagem', exact: true }).click();
  await expect(dialog.locator('#wishImageShareStatus')).toContainText('Imagem copiada');
  expect(await page.evaluate(async () => (await navigator.clipboard.read()).some((item) => item.types.includes('image/png')))).toBe(true);
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Enviar imagem', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('lista-de-itens.jpg');
  await expect(dialog.locator('#wishImageShareStatus')).toContainText('Imagem baixada');
});

test('uses native image sharing on Windows and keeps the preview usable after cancellation', async ({ page, context }) => {
  await useSharePlatform(page, 'Windows');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true });
    Object.defineProperty(navigator, 'share', { value: async ({ files }) => {
      window.nativeSharedFile = files[0].name;
      throw new DOMException('Share canceled', 'AbortError');
    } });
  });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.evaluate(() => {
    AppStorage.setItem('wishlist', JSON.stringify([{ id: 'a', title: 'Anel', store: 'Loja', originalPrice: 50, currency: 'BRL' }]));
    AppStorage.flush();
    window.dispatchEvent(new Event('wallet:remote'));
  });
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.getByRole('button', { name: 'Compartilhar desejos de Luana' }).click();
  const dialog = page.locator('#wishShareDialog');
  await expect(dialog.locator('#wishShareNative')).toBeVisible();
  await expect(dialog.locator('#wishShareWhatsApp')).toBeVisible();
  await dialog.getByRole('button', { name: 'Montar imagem' }).click();
  await dialog.getByRole('button', { name: 'Enviar imagem', exact: true }).click();
  expect(await page.evaluate(() => window.nativeSharedFile)).toBe('lista-de-itens.jpg');
  await expect(dialog.locator('#wishImageShareStatus')).toBeEmpty();
  await dialog.getByRole('button', { name: 'Copiar imagem', exact: true }).click();
  await expect(dialog.locator('#wishImageShareStatus')).toContainText('Imagem copiada');
  await dialog.getByRole('button', { name: 'Fechar prévia' }).click();
  await expect(dialog).toBeHidden();
});

test('reads a product screenshot locally and reuses the saved photo without a link', async ({ page }) => {
  await page.route('https://api.frankfurter.dev/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 660;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f3f3f3';
    ctx.fillRect(0, 0, 330, canvas.height);
    ctx.fillStyle = '#ab243e';
    ctx.fillRect(105, 175, 110, 150);
    ctx.fillRect(145, 145, 35, 20);
    ctx.fillStyle = '#71384a';
    ctx.fillRect(0, 585, 330, 75);
    ctx.fillStyle = '#111';
    ctx.font = '30px sans-serif';
    ['Pandora', 'Gingerbread Drink Charm', 'Sterling silver', 'C$ 95.00'].forEach((line, index) => ctx.fillText(line, 455, 55 + index * 45));
    ctx.fillRect(455, 255, 500, 55);
    ctx.fillText('+95 POINTS = C$ 2.38', 455, 460);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  await page.locator('#wishUpload').setInputFiles({ name: 'produto.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') });
  await expect(page.locator('#wishPhotoMessage')).toContainText('Confira nome, loja, preço e moeda', { timeout: 30000 });
  await expect(page.locator('#wishTitle')).toHaveValue('Gingerbread Drink Charm');
  await expect(page.locator('#wishStore')).toHaveValue('Pandora');
  await expect(page.locator('#wishPrice')).toHaveValue('95');
  await expect(page.locator('#wishCurrency')).toHaveValue('CAD');
  await expect.poll(() => page.locator('#wishImagePreview img').evaluate((img) => img.naturalHeight > img.naturalWidth)).toBe(true);
  await expect(page.locator('.wish-row')).toHaveCount(0);
  await page.locator('#wishSave').click();
  await expect(page.locator('.wish-row img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await expect(page.locator('.wish-row a')).not.toHaveAttribute('href');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.reload();
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.getByRole('button', { name: 'Compartilhar desejos de Luana' }).click();
  const dialog = page.locator('#wishShareDialog');
  await expect(dialog.locator('.wish-share-row img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await dialog.getByRole('button', { name: 'Montar imagem' }).click();
  await expect(dialog.getByRole('link', { name: 'Salvar imagem' })).toHaveAttribute('download', 'lista-de-itens.jpg');
});

for (const blocked of [false, true]) {
  test(`opens a PWA share as a draft with store reading ${blocked ? 'blocked' : 'available'}`, async ({ page, request }) => {
    const { share_target: target } = await (await request.get('/manifest.json')).json();
    expect(target.method).toBe('GET');
    const productUrl = 'https://shop.example.invalid/product?ref=123';
    await page.route(productUrl, (route) => blocked ? route.abort() : route.fulfill({
      contentType: 'text/html',
      headers: { 'access-control-allow-origin': '*' },
      body: '<title>Produto compartilhado</title><meta property="product:price:amount" content="25"><meta property="product:price:currency" content="USD">',
    }));
    const params = new URLSearchParams({
      [target.params.title]: 'Título enviado',
      [target.params.text]: 'Veja este produto: ' + productUrl + '\n',
    });
    await page.goto('/' + target.action + '?' + params);
    await expect(page.locator('#wishForm')).toBeVisible();
    await expect(page.locator('#wishUrl')).toHaveValue(productUrl);
    await expect(page.locator('#wishTitle')).toHaveValue(blocked ? 'Título enviado' : 'Produto compartilhado');
    expect(await page.evaluate(() => new URL(location.href).search)).toBe('');
    await expect(page.locator('.wish-row')).toHaveCount(0);
    if (blocked) {
      await expect(page.locator('#wishMessage')).toContainText('Preencha produto e valor');
      await page.locator('#wishPrice').fill('30');
    } else {
      await expect(page.locator('#wishPrice')).toHaveValue('25');
      await expect(page.locator('#wishCurrency')).toHaveValue('USD');
    }
    await page.locator('#wishSave').click();
    await expect(page.locator('.wish-row')).toHaveCount(1);
  });
}
