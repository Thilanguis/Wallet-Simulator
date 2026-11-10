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
  await page.locator('#wishEditor').getByRole('button', { name: 'Fechar painel' }).click();
  await page.locator('#wishSelectAllPurchase').check();
  await expect(page.locator('#wishTotal')).toContainText('47,00');
  await expect(page.locator('.wish-row a').filter({ hasText: names[1] })).toContainText('×2');
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
