const { test, expect } = require('../firebase-fixture.cjs');
async function start(page, context, width = 1440) {
  await context.route('https://firestore.googleapis.com/**', (r) => r.abort());
  await page.setViewportSize({ width, height: 1000 });
  await page.route('https://api.frankfurter.dev/**', (r) => r.fulfill({ json: [{ base: 'CAD', quote: 'BRL', rate: 4, date: '2026-11-16' }] }));
  await page.goto('/');
  await expect(page.locator('#cloudStatusText')).toHaveText('Salvo no Firebase');
}
for (const width of [1440, 768, 393])
  test('all five panels and safe backup flow ' + width, async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await start(page, context, width);
    const before = await page.evaluate(() => JSON.stringify(WalletStore.finance().entries));
    for (const id of ['simulator', 'financePanel', 'wishlistPanel', 'contractPanel', 'backupPanel']) {
      await page.locator('[data-panel=' + id + ']').click();
      await expect(page.locator('#' + id)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await expect(page.locator('#contractDocument')).not.toBeEmpty();
    await page.locator('#customEconomy > summary').click();
    await expect(page.locator('#customEconomyJson')).toBeVisible();
    await page.locator('#customEconomy > summary').click();
    const download = page.waitForEvent('download');
    await page.locator('#exportBackup').click();
    expect((await download).suggestedFilename()).toMatch(/findom-backup.*json/);
    await expect(page.locator('#operationFeedback')).toContainText('Backup preparado');
    await page.locator('#operationFeedback button').click();
    await page.locator('#walletMaintenance > summary').click();
    await page.locator('#resetSaldo').click();
    await expect(page.locator('.app-dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.app-dialog[open]')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify(WalletStore.finance().entries))).toBe(before);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '.local/system-motion-settings-' + width + '.png', animations: 'disabled' });
  });
test('wish creation, editing and clipboard have visual confirmation', async ({ page, context }) => {
  await start(page, context, 393);
  await page.evaluate(() => {
    window.clipboardCalls = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => window.clipboardCalls.push(text) } });
  });
  await page.locator('[data-panel=wishlistPanel]').click();
  await page.locator('#wishEditor > summary').click();
  await page.locator('#wishUrl').fill('https://example.invalid/produto');
  await page.locator('#wishTitle').fill('Produto de exemplo');
  await page.locator('#wishStore').fill('Loja de exemplo');
  await page.locator('#wishCurrency').selectOption('BRL');
  await page.locator('#wishPrice').fill('12.50');
  await page.locator('#wishSave').click();
  await expect(page.locator('#operationFeedback')).toContainText('Desejo adicionado');
  await expect(page.locator('#wishEditor')).not.toHaveAttribute('open', '');
  await expect(page.locator('#wishSave')).toBeEnabled();
  await page.getByRole('button', { name: 'Editar Produto de exemplo', exact: true }).click();
  await page.locator('#wishTitle').fill('Produto editado');
  await page.locator('#wishSave').click();
  await expect(page.locator('#operationFeedback')).toContainText('Desejo atualizado');
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('wishlist')).length)).toBe(1);
  await page.getByRole('button', { name: 'Compartilhar desejos de Luana', exact: true }).click();
  await page.locator('#wishShareCopy').click();
  await expect(page.locator('#wishShareStatus')).toContainText('Mensagem copiada');
  expect(await page.evaluate(() => window.clipboardCalls.length)).toBe(1);
  await page.keyboard.press('Escape');
});
test('runtime reduced motion stops decorative loops and roulette still awards exactly once', async ({ page, context }) => {
  await start(page, context);
  await page.locator('#privilegeSeal').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.money-glow')).toHaveCount(0);
  await expect(page.locator('#simuladorTitulo .spark')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => titleFlickerTimeout)).toBeNull();
  expect(await page.evaluate(() => document.querySelectorAll('#simuladorTitulo span').length > 0)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('bonusEspecialAtivo')))).toBe(true);
  await page.evaluate(() => {
    Economy.drawRoulette = () => 8;
  });
  await page.locator('#btnRoletaFlutuante').click();
  await page.locator('#btnRoletaGirar').click();
  await expect(page.locator('#roletaPointer')).toHaveCSS('animation-name', 'none');
  expect(await page.locator('#roletaWheel').evaluate((el) => el.style.transition)).toBe('none');
  await expect(page.locator('#roletaVisor')).toContainText('Vale sair sozinha');
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('rouletteAwards')).length)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('roulette:awards')));
  expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('rouletteAwards')).length)).toBe(1);
});
