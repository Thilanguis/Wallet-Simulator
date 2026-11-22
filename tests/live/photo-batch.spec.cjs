const { test, expect } = require('../firebase-fixture.cjs');

async function photos(page, texts) {
  const images = await page.evaluate((allTexts) => allTexts.map((lines) => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 560;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 800, 560);
    ctx.fillStyle = '#111';
    ctx.font = '40px Arial';
    lines.forEach((line, i) => ctx.fillText(line, 40, 75 + i * 90));
    return canvas.toDataURL('image/png').split(',')[1];
  }), texts);
  return images.map((data, i) => ({ name: 'imagem-' + (i + 1) + '.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') }));
}

test('reads four product photos together and saves only the reviewed selections', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  const names = ['Gingerbread Drink Charm', 'Silver Moon Necklace', 'Pink Blossom Ring', 'Crystal Heart Earrings'];
  const files = await photos(page, names.map((name, i) => ['Pandora', name, 'R$ ' + (i + 10) + ',00']));
  await page.locator('#wishUpload').setInputFiles(files);
  await expect(page.locator('#wishPhotoMessage')).toHaveText('4 produtos para revisar.', { timeout: 35000 });
  const batch = page.locator('#wishBatchRows .preview-row');
  await expect(batch).toHaveCount(4);
  await expect(batch.locator('img')).toHaveCount(4);
  await expect(page.locator('#wishBatchRows')).toHaveCSS('overflow-y', 'visible');
  const lastPrice = batch.last().locator('[data-field=price]');
  await lastPrice.scrollIntoViewIfNeeded();
  await expect(lastPrice).toBeInViewport();
  await expect(batch.nth(1).locator('[data-field=title]')).toHaveValue(names[1]);
  await expect(batch.nth(1).locator('[data-field=price]')).toHaveValue('11');
  await expect(page.locator('.wish-row')).toHaveCount(0);
  await batch.nth(1).locator('[data-field=price]').fill('12,50');
  await batch.first().locator('[data-field=store]').fill('');
  await batch.nth(1).locator('[data-field=quantity]').fill('0');
  await batch.last().locator('.row-title input[type=checkbox]').uncheck();
  await page.locator('#wishSave').click();
  await expect(batch.first().locator('[data-field=store]')).toBeFocused();
  await expect(batch.first().locator('[data-field=store]')).toHaveAttribute('aria-invalid', 'true');
  await expect(batch.first()).toContainText('Informe a loja.');
  await expect(batch.nth(1).locator('[data-field=quantity]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#wishSaveError')).toContainText('Corrija os campos marcados');
  await expect(page.locator('.wish-row')).toHaveCount(0);
  await batch.first().locator('[data-field=store]').fill('Pandora');
  await batch.nth(1).locator('[data-field=quantity]').fill('2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#wishSave').click();
  await expect(page.locator('.wish-row img')).toHaveCount(3);
  await expect(page.locator('#wishEditor')).not.toHaveAttribute('open', '');
  await page.locator('#wishSelectAllPurchase').check();
  await expect(page.locator('#wishTotal')).toContainText('47,00');
  await expect(page.locator('.wish-row a').filter({ hasText: names[1] })).toContainText('×2');
});

test('copies all picker files before OCR and preserves the readable photos in a replacement batch', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeDecode = window.createImageBitmap;
    const nativeRead = Blob.prototype.arrayBuffer;
    const nativeFileRead = FileReader.prototype.readAsArrayBuffer;
    const nativeObjectUrl = URL.createObjectURL;
    URL.createObjectURL = (file) => {
      if (file.name === 'blocked.jpg') throw new DOMException('Picker access lost', 'NotReadableError');
      return nativeObjectUrl(file);
    };
    FileReader.prototype.readAsArrayBuffer = function (file) {
      if (file.name === 'blocked.jpg') throw new DOMException('Picker access lost', 'NotReadableError');
      return nativeFileRead.call(this, file);
    };
    const pickerFiles = new WeakSet();
    document.addEventListener('change', ({ target }) => {
      if (target.id === 'wishUpload') for (const file of target.files) pickerFiles.add(file);
    }, true);
    window.createImageBitmap = (file) => {
      if (pickerFiles.has(file)) throw new Error('Cannot decode from the Android picker');
      return nativeDecode(file);
    };
    Blob.prototype.arrayBuffer = function () {
      if (pickerFiles.has(this) && (this.name === 'blocked.jpg' || ![...document.getElementById('wishUpload').files].includes(this))) {
        throw new DOMException('Picker access lost', 'NotReadableError');
      }
      return nativeRead.call(this);
    };
  });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  const upload = page.locator('#wishUpload');
  const files = await photos(page, [['Pandora', 'Silver Moon Necklace', 'R$ 12,50'], ['Pandora', 'Pink Blossom Ring', 'R$ 13,00']]);
  await upload.setInputFiles(files);
  const batch = page.locator('#wishBatchRows .preview-row');
  await expect(batch.locator('img')).toHaveCount(2);
  await expect(page.locator('#wishPhotoLoading')).toBeHidden();
  await upload.setInputFiles([{...files[0], name: 'blocked.jpg'}, files[1]]);
  await expect(batch.first()).toContainText('O navegador não conseguiu ler este arquivo');
  await expect(batch.first().locator('.row-title input[type=checkbox]')).toBeDisabled();
  await expect(batch.last().locator('[data-field=title]')).toHaveValue('Pink Blossom Ring');
  await expect(batch.last().locator('[data-field=price]')).toHaveValue('13');
  await batch.last().locator('[data-field=price]').fill('14,90');
  const [retry] = await Promise.all([
    page.waitForEvent('filechooser'),
    batch.first().getByRole('button', { name: 'Escolher esta foto em Arquivos' }).click(),
  ]);
  await retry.setFiles(files[0]);
  await expect(batch.first().locator('.row-title input[type=checkbox]')).toBeChecked();
  await expect(batch.first().locator('[data-field=title]')).toHaveValue('Silver Moon Necklace');
  await expect(batch.last().locator('[data-field=price]')).toHaveValue('14,90');
  await expect(page.locator('.wish-row')).toHaveCount(0);
});

test('opens the alternate picker and reads an image when arrayBuffer fails', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeRead = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      if (this instanceof File && this.type === 'application/octet-stream') {
        return Promise.reject(new DOMException('Picker access lost', 'NotReadableError'));
      }
      return nativeRead.call(this);
    };
  });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  const files = await photos(page, [['Pandora', 'Silver Moon Necklace', 'R$ 12,50']]);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#wishBrowseFiles').click()]);
  expect(await chooser.element().getAttribute('id')).toBe('wishFileUpload');
  await chooser.setFiles({...files[0], mimeType: 'application/octet-stream'});
  await expect(page.locator('#wishImagePreview img')).toBeVisible();
  await expect(page.locator('#wishTitle')).toHaveValue('Silver Moon Necklace');
  await expect(page.locator('#wishPrice')).toHaveValue('12.5');
  await expect(page.locator('.wish-row')).toHaveCount(0);
});

test('uses the general picker on Android and recovers files that only the image decoder can open', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14)' });
    const selectedFiles = new WeakSet();
    document.addEventListener('change', ({ target }) => {
      if (target.id === 'wishUpload') for (const file of target.files) selectedFiles.add(file);
    }, true);
    const nativeRead = Blob.prototype.arrayBuffer;
    const nativeFileRead = FileReader.prototype.readAsArrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      if (selectedFiles.has(this)) return Promise.reject(new DOMException('Picker access lost', 'NotReadableError'));
      return nativeRead.call(this);
    };
    FileReader.prototype.readAsArrayBuffer = function (file) {
      if (selectedFiles.has(file)) throw new DOMException('Picker access lost', 'NotReadableError');
      return nativeFileRead.call(this, file);
    };
  });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  const upload = page.locator('#wishUpload');
  expect(await upload.getAttribute('accept')).toBeNull();
  const [photo] = await photos(page, [['Pandora', 'Silver Moon Necklace', 'R$ 12,50']]);
  await upload.setInputFiles({ ...photo, name: 'android.png' });
  await expect(page.locator('#wishImagePreview img')).toBeVisible();
  await expect(page.locator('#wishTitle')).toHaveValue('Silver Moon Necklace');
  await expect(page.locator('#wishPrice')).toHaveValue('12.5');
});

test('retries product photos when the primary image decoder fails', async ({ page }) => {
  await page.addInitScript(() => {
    window.createImageBitmap = async () => {
      throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
    };
  });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  const upload = page.locator('#wishUpload');
  await upload.setInputFiles({ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('invalid image') });
  await expect(page.locator('#wishPhotoMessage')).toContainText('Não foi possível abrir esta foto');
  const files = await photos(page, [['Pandora', 'Silver Moon Necklace', 'R$ 12,50']]);
  await upload.setInputFiles(files);
  await expect(page.locator('#wishImagePreview img')).toBeVisible();
  await expect(page.locator('#wishTitle')).toHaveValue('Silver Moon Necklace', { timeout: 30000 });
  await expect(page.locator('#wishPrice')).toHaveValue('12.5');
  await expect(page.locator('.wish-row')).toHaveCount(0);
});

test('accepts a pasted print and dropped JPEG and WebP photos without intercepting plain text', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  await page.evaluate(() => {
    const form = document.querySelector('#wishForm');
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'ordinary link or text');
    const event = new ClipboardEvent('paste', {clipboardData, cancelable: true});
    if (!form.dispatchEvent(event)) throw new Error('Text paste was intercepted');
  });
  const [file] = await photos(page, [['Pandora', 'Silver Moon Necklace', 'R$ 12,50']]);
  await page.evaluate((data) => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([Uint8Array.from(data)], 'print.png', {type: 'image/png'}));
    document.querySelector('#wishForm').dispatchEvent(new ClipboardEvent('paste', {clipboardData, cancelable: true}));
  }, [...file.buffer]);
  await expect(page.locator('#wishTitle')).toHaveValue('Silver Moon Necklace');
  await expect(page.locator('#wishSave')).toBeEnabled();
  await page.evaluate(async (data) => {
    const source = await createImageBitmap(new Blob([Uint8Array.from(data)], {type: 'image/png'}));
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d').drawImage(source, 0, 0);
    source.close();
    const dataTransfer = new DataTransfer();
    for (const [extension, type] of [['jpg', 'image/jpeg'], ['webp', 'image/webp']]) {
      const encoded = await new Promise((resolve) => canvas.toBlob(resolve, type));
      if (encoded.type !== type) throw new Error('Unexpected format ' + encoded.type);
      dataTransfer.items.add(new File([encoded], 'photo.' + extension, {type}));
    }
    document.querySelector('#wishForm').dispatchEvent(new DragEvent('drop', {dataTransfer, cancelable: true}));
  }, [...file.buffer]);
  const batch = page.locator('#wishBatchRows .preview-row');
  await expect(batch.locator('img')).toHaveCount(2);
  await expect(batch.last().locator('[data-field=price]')).toHaveValue('12.5');
  await expect(page.locator('.wish-row')).toHaveCount(0);
});

test('shows a spinner and batch progress only while photos are being read', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  const files = await photos(page, [['Pandora', 'Silver Moon Necklace', 'R$ 10,00'], ['Pandora', 'Pink Blossom Ring', 'R$ 12,00']]);
  await page.evaluate(() => {
    window.withReceiptReader = (read) => read(async () => {
      await new Promise(resolve => { window.releasePhoto = resolve; });
      return {text: 'Pandora\nSilver Moon Necklace\nR$ 10,00'};
    });
  });
  const loading = page.locator('#wishPhotoLoading');
  await expect(loading).toBeHidden();
  await page.locator('#wishUpload').setInputFiles(files);
  await expect(loading).toBeVisible();
  await expect(page.locator('#wishPhotoProgress')).toHaveText('0/2');
  await expect.poll(() => page.evaluate(() => typeof window.releasePhoto)).toBe('function');
  await page.evaluate(() => { window.releasePhoto(); window.releasePhoto = null; });
  await expect(page.locator('#wishPhotoProgress')).toHaveText('1/2');
  await expect.poll(() => page.evaluate(() => typeof window.releasePhoto)).toBe('function');
  await page.evaluate(() => window.releasePhoto());
  await expect(loading).toBeHidden();
  await expect(page.locator('#wishSave')).toBeEnabled();
});

test('retries a missing price with sparse OCR and ignores an old discount price', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 900;
    canvas.getContext('2d').fillRect(0, 0, 400, 900);
    window.withReceiptReader = (read) => {
      let pass = 0;
      return read(async (_file, _report, options) => {
        if (++pass === 1) return { text: 'YesStyle\nMedicube - Pink Collagen Cream' };
        if (options?.tessedit_pageseg_mode === '11') return { text: 'C A S$ 33. 46\nCA$ 47.60 29% OFF' };
        throw new Error('Expected sparse-text pass');
      });
    };
    return canvas.toDataURL().split(',')[1];
  });
  await page.locator('#wishUpload').setInputFiles({ name: 'print.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await expect(page.locator('#wishTitle')).toHaveValue('Medicube - Pink Collagen Cream');
  await expect(page.locator('#wishPrice')).toHaveValue('33.46');
  await expect(page.locator('#wishCurrency')).toHaveValue('CAD');
});

test('reviews multiple receipts independently and saves them only on confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=financePanel]').click();
  await page.locator('#financeImport > summary').click();
  await page.locator('#receiptToggle').click();
  const files = await photos(page, [10, 20, 20, 30].map((value) => ['Loja Aurora', 'Data: 15/01/2026', 'Total pago R$ ' + value + ',00']));
  await page.locator('#receiptFile').setInputFiles(files);
  await page.locator('#processReceipt').click();
  await expect(page.locator('#ocrProgress')).toContainText('Confira os lançamentos', { timeout: 35000 });
  const batch = page.locator('#receiptBatchRows .preview-row');
  await expect(batch).toHaveCount(4);
  await expect(batch.nth(1).locator('[data-field=amount]')).toHaveValue('20,00');
  await expect(batch.nth(2).getByRole('checkbox')).not.toBeChecked();
  await batch.last().getByRole('checkbox').uncheck();
  await batch.first().locator('[data-field=amount]').fill('15,25');
  expect(await page.evaluate(() => FinanceUI.getState().entries)).toHaveLength(0);
  await page.locator('#saveReceiptBatch').click();
  await page.locator('[data-dialog-cancel]').click();
  expect(await page.evaluate(() => FinanceUI.getState().entries)).toHaveLength(0);
  await page.locator('#saveReceiptBatch').click();
  await page.locator('[data-dialog-confirm]').click();
  await expect(page.locator('#ocrProgress')).toContainText('2 lançamentos registrados');
  expect(await page.evaluate(() => FinanceUI.getState().entries.map((item) => item.amount))).toEqual([1525, 2000]);
});


test('reads unknown storefronts in different layouts and keeps a print with no visible price', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  // A photo import should be independent of the PDF reader.
  await page.route('**/vendor/pdf/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  const examples = await page.evaluate(() => {
    const screenshots = [
      { width: 1080, height: 740, header: 'arcolume.ca', lines: [
        [570, 218, 'Cedar Trail Backpack'], [570, 285, 'Regular price: CAD 219.00'],
        [570, 343, 'Sale price: CAD 149.00'], [570, 403, 'Shipping: CAD 12.00'],
      ] },
      { width: 620, height: 1250, header: 'Loja: Casa Bruma', lines: [
        [46, 218, 'Por R$ 199,90'], [46, 284, 'Produto: Vaso Horizonte'],
        [46, 1000, 'Antes: R$ 249,90'], [46, 1060, 'Frete: R$ 23,00'],
      ] },
      { width: 760, height: 650, header: 'Store: Harbor Form', lines: [
        [42, 460, 'Product: Linen Studio Apron'], [42, 525, 'Select a size'],
      ] },
    ];
    return screenshots.map(({ width, height, header, lines }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ece9df';
      ctx.fillRect(0, 0, width, 120);
      ctx.fillStyle = '#34595a';
      ctx.fillRect(55, width === 620 ? 400 : 160, width === 620 ? 500 : 430, width === 620 ? 480 : 220);
      ctx.font = '31px Arial';
      ctx.fillStyle = '#111';
      ctx.fillText(header, 42, 76);
      lines.forEach(([x,y,text]) => ctx.fillText(text, x, y));
      return canvas.toDataURL('image/png').split(',')[1];
    });
  });
  await page.locator('#wishUpload').setInputFiles(examples.map((data, i) => ({
    name: 'loja-desconhecida-' + i + '.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64'),
  })));
  const rows = page.locator('#wishBatchRows .preview-row');
  await expect(rows.locator('img')).toHaveCount(3);
  await expect(page.locator('#wishPhotoLoading')).toBeHidden({ timeout: 35000 });
  for (const [index, title, store, price, currency] of [
    [0, 'Cedar Trail Backpack', 'Arcolume', '149', 'CAD'],
    [1, 'Vaso Horizonte', 'Casa Bruma', '199.9', 'BRL'],
    [2, 'Linen Studio Apron', 'Harbor Form', '', 'BRL'],
  ]) {
    const row = rows.nth(index);
    await expect(row.locator('[data-field=title]')).toHaveValue(title);
    await expect(row.locator('[data-field=store]')).toHaveValue(store);
    await expect(row.locator('[data-field=price]')).toHaveValue(price);
    await expect(row.locator('[data-field=currency]')).toHaveValue(currency);
  }
  await expect(rows.last().locator('[data-photo-status]')).toContainText('preço');
  await rows.last().locator('[data-field=price]').fill('29.99');
  await rows.last().locator('[data-field=currency]').selectOption('USD');
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist') || '[]'))).toHaveLength(0);
  await page.locator('#wishSave').click();
  await expect(page.locator('.wish-row img')).toHaveCount(3);
  expect(await page.evaluate(() => FinanceUI.getState().entries)).toHaveLength(0);
});

test('keeps the single photo and manual fields when OCR fails and when reading again', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  await page.evaluate(() => {
    window.withReceiptReader = async () => { throw Error('Simulated OCR startup failure'); };
  });
  const [file] = await photos(page, [['Produto de demonstração']]);
  await page.locator('#wishUpload').setInputFiles(file);
  const preview = page.locator('#wishImagePreview img');
  await expect(preview).toBeVisible();
  await expect(page.locator('#wishPhotoMessage')).toContainText('preencher os campos manualmente');
  const image = await preview.getAttribute('src');
  await page.locator('#wishTitle').fill('Meu título corrigido');
  await page.locator('#wishPrice').fill('72');
  await page.locator('#wishCurrency').selectOption('USD');
  await page.evaluate(() => {
    window.withReceiptReader = callback => callback(async () => ({ text: 'Store: Bruma\nProduct: Another Name\nCAD 10.00' }));
  });
  await page.locator('#wishRetryPhoto').click();
  await expect(page.locator('#wishStore')).toHaveValue('Bruma');
  await expect(page.locator('#wishTitle')).toHaveValue('Meu título corrigido');
  await expect(page.locator('#wishPrice')).toHaveValue('72');
  await expect(page.locator('#wishCurrency')).toHaveValue('USD');
  await expect(preview).toHaveAttribute('src', image);
  await page.locator('#wishSave').click();
  await expect(page.locator('.wish-row img')).toHaveAttribute('src', image);
});

test('a failed OCR result in a batch leaves its preview and editable fields intact', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  await page.evaluate(() => {
    window.withReceiptReader = callback => callback(async (file) => {
      if (file.name !== 'imagem-2.png') throw Error('Cannot recognize this product');
      return { text: 'Store: Fold Studio\nProduct: Raven Card Holder\nEUR 24.99' };
    });
  });
  await page.locator('#wishUpload').setInputFiles(await photos(page, [['Foto um'], ['Foto dois']]));
  const rows = page.locator('#wishBatchRows .preview-row');
  await expect(rows.locator('img')).toHaveCount(2);
  await expect(rows.first().locator('[data-photo-status]')).toContainText('preencher os campos manualmente');
  await expect(rows.last().locator('[data-field=title]')).toHaveValue('Raven Card Holder');
  await rows.first().locator('[data-field=title]').fill('Nome editado');
  await rows.last().locator('[data-field=price]').fill('32');
  const before = await rows.locator('img').evaluateAll(list => list.map(image => image.src));
  await page.evaluate(() => {
    window.withReceiptReader = callback => callback(async () => ({ text: 'Store: Areia Studio\nProduct: Another Product\nCAD 19.99' }));
  });
  await rows.first().locator('[data-retry-photo]').click();
  await expect(rows.first().locator('[data-field=title]')).toHaveValue('Nome editado');
  await expect(rows.first().locator('[data-field=store]')).toHaveValue('Areia Studio');
  await expect(rows.first().locator('[data-field=price]')).toHaveValue('19.99');
  await expect(rows.last().locator('[data-field=price]')).toHaveValue('32');
  expect(await rows.locator('img').evaluateAll(list => list.map(image => image.src))).toEqual(before);
  await page.locator('#wishSave').click();
  await expect(page.locator('.wish-row img')).toHaveCount(2);
});


test('allows saving a manually completed wish while OCR is still reading', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  await page.evaluate(() => {
    window.withReceiptReader = callback => callback(() => new Promise(resolve => {
      window.finishWishOcr = () => resolve({ text: 'Store: Outra Loja\nProduct: Another Product\nUSD 10.00' });
    }));
  });
  const [file] = await photos(page, [['Produto de teste']]);
  await page.locator('#wishUpload').setInputFiles(file);
  await expect(page.locator('#wishImagePreview img')).toBeVisible();
  await expect(page.locator('#wishPhotoLoading')).toBeVisible();
  await page.locator('#wishTitle').fill('Produto corrigido');
  await page.locator('#wishStore').fill('Minha loja');
  await page.locator('#wishSave').click();
  await expect(page.locator('.wish-row img')).toBeVisible();
  await expect(page.locator('#wishEditor')).not.toHaveAttribute('open', '');
  await page.evaluate(() => window.finishWishOcr());
  await expect(page.locator('#wishTitle')).toHaveValue('');
  const [wish] = await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist')));
  expect(wish).toMatchObject({ title: 'Produto corrigido', store: 'Minha loja', originalPrice: null });
});

test('expands a multi-product print alongside another photo and lets missing rows reuse the print', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  const listImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1150;
    canvas.height = 750;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111';
    ctx.font = '38px Arial';
    const write = (label, x, y) => ctx.fillText(label, x, y);
    write('Loja: Verdant Market', 50, 60);
    write('CA$ 18.00', 65, 180);
    write('Bamboo Comb', 350, 180);
    write('CA$ 24.99', 65, 290);
    write('Lavender Shampoo', 350, 290);
    write('Loja: Morning Grove', 50, 410);
    write('Oat Conditioner', 350, 530);
    write('US$ 13.50', 875, 530);
    write('Shipping: US$ 6.00', 350, 670);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const [onlyOne] = await photos(page, [['Pandora', 'Silver Moon Necklace', 'R$ 12,50']]);
  await page.locator('#wishUpload').setInputFiles([
    { name: 'lista.png', mimeType: 'image/png', buffer: Buffer.from(listImage, 'base64') },
    onlyOne,
  ]);
  await expect(page.locator('#wishPhotoMessage')).toHaveText('4 produtos para revisar.', { timeout: 45000 });
  const rows = page.locator('#wishBatchRows .preview-row');
  await expect(rows).toHaveCount(4);
  const products = [
    ['Bamboo Comb', 'Verdant Market', '18', 'CAD'],
    ['Lavender Shampoo', 'Verdant Market', '24.99', 'CAD'],
    ['Oat Conditioner', 'Morning Grove', '13.5', 'USD'],
    ['Silver Moon Necklace', 'Pandora', '12.5', 'BRL'],
  ];
  for (const [i, product] of products.entries()) {
    const row = rows.nth(i);
    for (const [j, field] of ['title', 'store', 'price', 'currency'].entries()) {
      await expect(row.locator('[data-field=' + field + ']')).toHaveValue(product[j]);
    }
  }
  await rows.first().getByRole('button', { name: 'Adicionar outra linha com esta foto' }).click();
  await expect(rows).toHaveCount(5);
  await expect(page.locator('#wishPhotoMessage')).toHaveText('5 produtos para revisar.');
  const manual = rows.nth(3);
  expect(await manual.locator('img').getAttribute('src')).toBe(await rows.first().locator('img').getAttribute('src'));
  await expect(manual.locator('[data-field=price]')).toHaveValue('');
  await manual.locator('[data-field=title]').fill('Scalp Brush');
  await manual.locator('[data-field=store]').fill('Morning Grove');
  await manual.locator('[data-field=currency]').selectOption('USD');
  await manual.locator('[data-field=price]').fill('7,25');
  await page.locator('#wishSave').click();
  await expect(page.locator('.wish-row img')).toHaveCount(5);
  const saved = await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist')));
  expect(saved.find(item => item.title === 'Scalp Brush').originalPrice).toBe(7.25);
});

test('reads the current prices in a stacked cart and asks for the currency', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  const cart = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 1050;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const print = (text, x, y, font = '26px Arial', color = '#151515') => {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    function former(price, x, y) {
      print(price, x, y);
      ctx.fillRect(x, y - 9, ctx.measureText(price).width, 2);
    }
    print('Search', 42, 67);
    print('Loja: Jardim do Norte', 43, 120, 'bold 29px Arial');
    print('Juniper Labs', 174, 198, 'bold 25px Arial');
    print('Daily Mineral Sunscreen', 174, 233);
    print('Sensitive Skin SPF 50', 174, 264);
    print('Size 45 mL - ITEM 251749', 174, 301, '23px Arial', '#545454');
    // Reverse the price order from the next card to exercise the strike, not a fixed column.
    former('$49.99', 174, 352);
    print('$33.20', 281, 352, 'bold 30px Arial', '#bb1231');
    print('Remove', 174, 417);
    print('Amanita Studio', 174, 510, 'bold 25px Arial');
    print('Silk Sleep Mask', 174, 545);
    print('Adjustable Cotton Strap', 174, 576);
    print('Size Large - ITEM 385149', 174, 613, '23px Arial', '#545454');
    print('$16.75', 174, 664, 'bold 30px Arial', '#bb1231');
    former('$28.30', 281, 664);
    print('Remove', 174, 729);
    print('Estimated Total (2 items)', 48, 820, 'bold 26px Arial');
    print('$49.95', 500, 820, 'bold 26px Arial');
    print('Checkout', 240, 891);
    return canvas.toDataURL('image/jpeg', 0.78).split(',')[1];
  });
  await page.locator('#wishUpload').setInputFiles({
    name: 'carrinho.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(cart, 'base64'),
  });
  await expect(page.locator('#wishPhotoLoading')).toBeHidden({ timeout: 45000 });
  const rows = page.locator('#wishBatchRows .preview-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.locator('img')).toHaveCount(2);
  const expected = [
    [/Daily Mineral Sunscreen.*Sensitive Skin SPF 50/i, '33.2'],
    [/Silk Sleep Mask.*Adjustable Cotton Strap/i, '16.75'],
  ];
  for (const [index, [title, price]] of expected.entries()) {
    const row = rows.nth(index);
    await expect(row.locator('[data-field=title]')).toHaveValue(title);
    await expect(row.locator('[data-field=store]')).toHaveValue('Jardim do Norte');
    await expect(row.locator('[data-field=price]')).toHaveValue(price);
    await expect(row.locator('[data-field=currency]')).toHaveValue('');
  }
  await page.locator('#wishSave').click();
  await expect(page.locator('.wish-row')).toHaveCount(0);
  await expect(rows.first().locator('[data-field=currency]')).toBeFocused();
  await expect(rows.first().locator('[data-field=currency]')).toHaveAttribute('aria-invalid', 'true');
  for (const row of await rows.all()) await row.locator('[data-field=currency]').selectOption('CAD');
  await page.locator('#wishSave').click();
  await expect(page.locator('.wish-row img')).toHaveCount(2);
  const saved = await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist')));
  expect(saved.map(({ originalPrice, currency }) => [originalPrice, currency])).toEqual([[33.2, 'CAD'], [16.75, 'CAD']]);
});

test('uses the right prices across staggered product columns', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1040;
    canvas.height = 1030;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f9f7f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    function text(text, x, y, font = '29px Arial', color = '#292d37') {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }
    text('Loja: Casa Aurora', 55, 76, 'bold 38px Arial');
    text('Products', 55, 130, '28px Arial', '#616574');
    function card(x, y, lines, price, colors) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, 413, 354);
      const gradient = ctx.createLinearGradient(x + 17, y + 17, x + 393, y + 193);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(1, colors[1]);
      ctx.fillStyle = gradient;
      ctx.fillRect(x + 17, y + 17, 379, 175);
      ctx.fillStyle = '#ffffff87';
      ctx.beginPath();
      ctx.roundRect(x + 151, y + 67, 111, 105, 20);
      ctx.fill();
      lines.forEach((line, index) => text(line, x + 23, y + 236 + index * 34));
      text(price, x + 23, y + 276 + (lines.length - 1) * 34, 'bold 30px Arial', '#2d364a');
    }
    card(55, 166, ['Amber Face Oil'], 'R$ 45,90', ['#f3e3cd', '#cc9c60']);
    card(569, 181, ['Silky Body Lotion', 'with Oat Extract'], 'R$ 61,50', ['#d6dce9', '#aea0ca']);
    card(55, 571, ['Vanilla Candle', 'Glass Jar'], 'R$ 37,20', ['#e3ead5', '#a9c5a2']);
    card(569, 550, ['Cotton Travel Pouch'], 'R$ 29,75', ['#ffdecc', '#eab4ac']);
    return canvas.toDataURL('image/png');
  });
  await page.locator('#wishUpload').setInputFiles({
    name: 'catalogo-duas-colunas.png',
    mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
  });
  const rows = page.locator('#wishBatchRows .preview-row');
  await expect(page.locator('#wishPhotoLoading')).toBeHidden({ timeout: 45000 });
  await expect(rows).toHaveCount(4);
  await expect(rows.locator('img')).toHaveCount(4);
  const listed = await rows.evaluateAll(rows => rows.map(row => Object.fromEntries(
    Array.from(row.querySelectorAll('[data-field]'), field => [field.dataset.field, field.value])
  )));
  expect(listed.map(row => [row.title, row.store, row.price, row.currency]).sort((a, b) => a[0].localeCompare(b[0]))).toEqual([
    ['Amber Face Oil', 'Casa Aurora', '45.9', 'BRL'],
    ['Cotton Travel Pouch', 'Casa Aurora', '29.75', 'BRL'],
    ['Silky Body Lotion with Oat Extract', 'Casa Aurora', '61.5', 'BRL'],
    ['Vanilla Candle Glass Jar', 'Casa Aurora', '37.2', 'BRL'],
  ]);
});
