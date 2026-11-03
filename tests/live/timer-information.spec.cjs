const { test, expect } = require('../firebase-fixture.cjs');

for (const width of [1440, 393])
  test(`timer information ${width}: distinguishes immediate and dynamic increases without changing calculations`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    await page.goto('/');
    await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await expect(page.locator('[data-registration-rate]').first()).toHaveText('Conforme atividade · veja ao selecionar');
    await page.locator('[data-jump=ganho]').click();
    await page.locator('#selectGanho').selectOption('Vestir cinta e comer dominado');
    const before = Number(await page.locator('#valorPorMinuto').inputValue());
    const expected = await page.evaluate(() =>
      Economy.round(
        Economy.round(
          Number(document.getElementById('valorPorMinuto').value) + Economy.taskIncrement(Economy.config.gains.find((item) => item.id === document.getElementById('selectGanho').value).classic, getEconomy()) + getEconomy().timer.repeatIncrement,
        ) - Number(document.getElementById('valorPorMinuto').value),
      ),
    );
    await expect(page.locator('#activityImmediateRate')).toHaveText('+' + new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(expected) + '/min');
    await expect(page.locator('#activityDynamicRate')).toContainText('Sem aumento automático');
    await expect(page.locator('.rate-calculation-details')).toBeHidden();
    await expect(page.locator('#activityRateFormula')).toContainText('Registro nº 1');
    await page.locator('#adicionar').click();
    expect(Number(await page.locator('#valorPorMinuto').inputValue())).toBeCloseTo(before + expected, 2);
    await expect(page.locator('#activityRateHint')).toBeHidden();
    await page.locator('#selectGanho').selectOption('Vestir cinta e comer dominado');
    await expect(page.locator('#activityRateFormula')).toContainText('Registro nº 2');
    await page.locator('#selectGanho').selectOption('Videogames Competitivos');
    await expect(page.locator('#activityDynamicRate')).toContainText('60s');
    await expect(page.locator('#activityDynamicRate')).toContainText('+ Combo');
    await page.locator('#adicionar').click();
    await page.locator('#selectGanho').selectOption('Videogames Competitivos');
    await expect(page.locator('#activityDynamicRate')).toContainText('✓ No combo');
    await page.locator('#activityRateHint').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.local/timer-info-' + width + '.png' });
    await page.locator('#btnTerminarTempo').click();
    await page.locator('[data-panel=backupPanel]').click();
    await page.locator('#customEconomy > summary').click();
    await page.locator('#timerFieldGuide > summary').click();
    await expect(page.locator('[data-timer-guide=base]')).toContainText('R$ 0,50/min');
    await expect(page.locator('[data-timer-guide=repeatIncrement]')).toContainText('0,01/min');
    await expect(page.locator('[data-timer-guide=taskScale]')).toContainText('Fator 0,05');
    const original = JSON.parse(await page.locator('#customEconomyJson').inputValue());
    expect(await page.locator('#customEconomyJson').inputValue()).toMatch(/"timer": \{\n\s+"base":/);
    const prior = await page.evaluate(() => structuredClone(getEconomy()));
    await page.locator('#saveCustomEconomy').click();
    await expect(page.locator('#economyCodeMessage')).toContainText('Catálogo salvo');
    expect(await page.evaluate(() => getEconomy())).toEqual({ ...prior, mode: 'custom' });
    original.timer.base = 0.75;
    original.timer.autoEvery = 30;
    original.timer.autoIncrement = 0.02;
    original.timer.taskScale = 0.02;
    original.timer.repeatIncrement = 0.004;
    await page.locator('#customEconomyJson').fill(JSON.stringify(original));
    await page.locator('#saveCustomEconomy').click();
    await expect(page.locator('[data-timer-guide=base]')).toContainText('R$ 0,75/min');
    await expect(page.locator('[data-timer-guide=autoIncrement]')).toContainText('30 segundos');
    await expect(page.locator('[data-timer-guide=repeatIncrement]')).toContainText('0,004/min');
    await expect(page.locator('[data-timer-guide=taskScale]')).toContainText('Fator 0,02');
    await page.locator('#timerFieldGuide').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.local/timer-guide-' + width + '.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
