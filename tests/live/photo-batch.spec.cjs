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
  await expect(page.locator('#wishPhotoMessage')).toContainText('Confira os produtos', { timeout: 35000 });
  const batch = page.locator('#wishBatchRows .preview-row');
  await expect(batch).toHaveCount(4);
  await expect(batch.locator('img')).toHaveCount(4);
  await expect(batch.nth(1).locator('[data-field=title]')).toHaveValue(names[1]);
  await expect(batch.nth(1).locator('[data-field=price]')).toHaveValue('11');
  await expect(page.locator('.wish-row')).toHaveCount(0);
  await batch.nth(1).locator('[data-field=price]').fill('12,50');
  await batch.first().locator('[data-field=store]').fill('');
  await batch.nth(1).locator('[data-field=quantity]').fill('0');
  await batch.last().getByRole('checkbox').uncheck();
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
  await expect(page.locator('#wishSave')).toBeEnabled();
  await upload.setInputFiles([{...files[0], name: 'blocked.jpg'}, files[1]]);
  await expect(batch.first()).toContainText('O navegador não conseguiu ler este arquivo');
  await expect(batch.first().getByRole('checkbox')).toBeDisabled();
  await expect(batch.last().locator('[data-field=title]')).toHaveValue('Pink Blossom Ring');
  await expect(batch.last().locator('[data-field=price]')).toHaveValue('13');
  await batch.last().locator('[data-field=price]').fill('14,90');
  const [retry] = await Promise.all([
    page.waitForEvent('filechooser'),
    batch.first().getByRole('button', { name: 'Escolher esta foto em Arquivos' }).click(),
  ]);
  await retry.setFiles(files[0]);
  await expect(batch.first().getByRole('checkbox')).toBeChecked();
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
