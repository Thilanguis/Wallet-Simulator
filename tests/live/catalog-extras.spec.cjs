const { test, expect } = require('@playwright/test');
for (const width of [1280, 390]) {
  test('JSON gain extras create controls, calculate, persist and record individual labels at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/firebaseConfiguration.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
    await page.goto('/');
    await page.locator('[data-panel=backupPanel]').click();
    await page.locator('#customEconomy > summary').click();
    const code = page.locator('#customEconomyJson'),
      doc = JSON.parse(await code.inputValue());
    expect(doc.gains.find((g) => g.id === 'Pés na cara').extras.map((e) => e.id)).toEqual(['chkChule', 'chkFrancesinha']);
    expect(doc.gains.find((g) => g.id === 'Cuspir na cara').extras[0].id).toBe('chkCatarro');
    doc.gains.push({
      id: 'Atividade de exemplo',
      amount: 10,
      timerEligible: true,
      extras: [
        { id: 'testA', label: 'Adicional A', amount: 2 },
        { id: 'testB', label: 'Adicional B', amount: 3 },
      ],
    });
    await code.fill(JSON.stringify(doc));
    await page.locator('#saveCustomEconomy').click();
    await expect(page.locator('#economyCodeMessage')).toContainText('Catálogo salvo');
    await page.reload();
    await page.locator('[data-jump=ganho]').click();
    await page.locator('#selectGanho').selectOption('Atividade de exemplo');
    await expect(page.locator('#gainExtras input')).toHaveCount(2);
    await page.locator('#gainExtras input').first().check();
    await page.locator('#gainExtras input').nth(1).check();
    await expect(page.locator('#valorGanho')).toHaveValue('15');
    await page.locator('#adicionar').click();
    await expect(page.locator('#saldoDominadora')).toHaveText('R$ 15,00');
    expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('historico'))[0].descricao)).toBe('Atividade de exemplo (Adicional A + Adicional B)');
    await page.locator('#selectGanho').selectOption('Pés na cara');
    await expect(page.locator('#gainExtras input')).toHaveCount(2);
    await page.locator('#chkChule').check();
    await expect(page.locator('#valorGanho')).toHaveValue('32');
    await page.locator('#selectGanho').selectOption('Cuspir na cara');
    await expect(page.locator('#gainExtras input')).toHaveCount(1);
    await page.locator('#chkCatarro').check();
    await expect(page.locator('#valorGanho')).toHaveValue('35');
    expect(await page.evaluate(() => FinanceUI.getState().entries.length)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
