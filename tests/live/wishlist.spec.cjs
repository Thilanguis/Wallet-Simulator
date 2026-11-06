const { test, expect } = require('../firebase-fixture.cjs');
for (const width of [393, 1440])
  test(`wishlist ${width} stays independent and preserves checked items`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    const before = await page.evaluate(() => ({ finance: WalletStore.finance(), balance: AppStorage.getItem('saldoDominadora') }));
    await page.locator('[data-panel=wishlistPanel]').click();
    await page.locator('#wishEditor > summary').click();
    let metadata = width === 393
      ? '<meta property="og:image" content="/product-photo.svg">'
      : '<script type="application/ld+json">{"@type":"Product","image":[{"contentUrl":"/product-photo.svg"}]}</script>';
    await page.route('https://example.invalid/*photo.svg', (r) =>
      r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="orange"/></svg>' }),
    );
    await page.route('https://example.invalid/product', (r) =>
      r.fulfill({ contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<title>Produto de teste</title><meta property="product:price:amount" content="42.50"><meta property="product:price:currency" content="BRL">' + metadata }),
    );
    await page.locator('#wishUrl').fill('https://example.invalid/product');
    await page.locator('#wishRead').click();
    await expect(page.locator('#wishTitle')).toHaveValue('Produto de teste');
    await expect(page.locator('#wishPrice')).toHaveValue('42.5');
    await expect(page.locator('#wishImagePreview img')).toHaveAttribute('src', 'https://example.invalid/product-photo.svg');
    await page.locator('#wishSave').click();
    await expect(page.locator('.wish-row')).toHaveCount(1);
    await expect(page.locator('#wishTotal')).toContainText('42,50');
    expect(await page.locator('#wishTotal').evaluate(el => el.getBoundingClientRect().top < document.getElementById('wishForm').getBoundingClientRect().top)).toBe(true);
    await page.locator('.wish-row input').check();
    await expect(page.locator('#wishSummary')).toHaveText('0 a comprar · 1 comprado(s)');
    await expect(page.locator('#wishTotal')).toContainText('0,00');
    expect(await page.evaluate(() => ({ finance: WalletStore.finance(), balance: AppStorage.getItem('saldoDominadora') }))).toEqual(before);
    await page.reload();
    await page.locator('[data-panel=wishlistPanel]').click();
    await expect(page.locator('.wish-row input')).toBeChecked();
    await expect.poll(() => page.locator('.wish-row img').evaluate((image) => image.naturalWidth)).toBe(80);
    await page.getByRole('button', { name: 'Editar Produto de teste', exact: true }).click();
    await page.locator('#wishTitle').fill('Alterado');
    await page.locator('#wishPrice').fill('39');
    metadata = '<meta property="og:image" content="/updated-photo.svg">';
    await page.locator('#wishRead').click();
    await expect(page.locator('#wishImagePreview img')).toHaveAttribute('src', 'https://example.invalid/updated-photo.svg');
    await expect(page.locator('#wishPrice')).toHaveValue('39');
    await page.locator('#wishSave').click();
    await expect(page.locator('.wish-row a')).toHaveText('Alterado');
    await expect(page.locator('.wish-row img')).toHaveAttribute('src', 'https://example.invalid/updated-photo.svg');
    await page.screenshot({ path: '.local/wishlist-' + width + '.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Excluir Alterado', exact: true }).click();
    await page.locator('[data-dialog-cancel]').click();
    await expect(page.locator('.wish-row')).toHaveCount(1);
  });
