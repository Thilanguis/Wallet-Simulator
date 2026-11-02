const { test, expect } = require('@playwright/test');
const { hub } = require('./firebase-primary-hub.cjs');
const root = 'usuarios/gabriel-local';

test('catalog changes sync to the other account and survive reload without replacing wallet data', async ({ browser }) => {
  const server = await hub(),
    ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await server.attach(a);
    await server.attach(b, '0', { user: { uid: 'partner', email: 'partner@example.invalid', emailVerified: true } });
    for (const page of [a, b]) await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await a.locator('[data-panel=backupPanel]').click();
    await a.locator('#customEconomy > summary').click();
    const catalog = JSON.parse(await a.locator('#customEconomyJson').inputValue());
    catalog.services[0].price = 37.25;
    catalog.bonusPercent = 19;
    catalog.discountPercent = 17;
    catalog.gains.push({ id: 'Atividade de teste isolada', amount: 7.45, timerEligible: true, extras: [] });
    await a.locator('#customEconomyJson').fill(JSON.stringify(catalog));
    await a.locator('#saveCustomEconomy').click();
    await expect(a.locator('#economyCodeMessage')).toContainText('Catálogo salvo');
    await expect.poll(() => b.evaluate(() => getEconomy().bonusPercent)).toBe(19);
    await expect(b.locator('#privilegeSeal')).toContainText('+19%');
    await b.reload();
    await expect(b.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    expect(await b.evaluate(() => getEconomy().prices[Economy.config.services[0].id])).toBe(37.25);
    await expect(b.locator('#selectGanho option[value="Atividade de teste isolada"]')).toHaveText('Atividade de teste isolada 💲 — R$ 7,45');
    expect(server.docs.get(root).saldoDominadora).toBe(1000);
    expect(JSON.parse(server.docs.get(root).walletAtualV4.simulator.economy).discountPercent).toBe(17);
    expect(await a.evaluate(() => !!localStorage.getItem('findom.firebase.before-primary.v4'))).toBe(true);
  } finally {
    await ca.close();
    await cb.close();
  }
});

test('accelerator checkpoints stay bounded and a companion gain does not replay the reduction', async ({ browser }) => {
  const start = Date.now(),
    target = 'Vale sair sozinha com amiga';
  const server = await hub({ [root]: { saldoDominadora: 1000, bonusEspecialAtivo: false, tarefasBloqueadas: [{ nome: target, expiraEm: start + 7 * 86400000 }], accelBoosts: [] } });
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    for (const page of [a, b]) {
      await page.clock.install({ time: new Date(start) });
      await server.attach(page);
      await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
      await page.evaluate(
        ({ start, target }) => {
          window.__reducerDeviations = [];
          const merge = SharedMerge.merge;
          SharedMerge.merge = (...args) => {
            const result = merge(...args),
              left = JSON.parse(result.simulator.accelBoosts || '[]').reduce((sum, boost) => sum + boost.budgetLeftMs, 0);
            const row = JSON.parse(result.simulator.tarefasBloqueadas || '[]').find((t) => t.nome === target);
            if (args.slice(0, 3).some((doc) => JSON.parse(doc.simulator.accelBoosts || '[]').length) && row && Math.abs(row.expiraEm - (start + 7 * 86400000 - 43200000 + left)) > 0.1) {
              window.__reducerDeviations.push({
                at: args[3]?.accelerationNow,
                rows: args.slice(0, 3).map((doc) => ({ blocks: doc.simulator.tarefasBloqueadas, boosts: doc.simulator.accelBoosts })),
                result: { blocks: result.simulator.tarefasBloqueadas, boosts: result.simulator.accelBoosts },
              });
            }
            return result;
          };
        },
        { start, target },
      );
    }
    await a.locator('[data-jump=gasto]').click();
    const reducer = await a.locator('#selectTarefa option').evaluateAll((opts) => opts.find((o) => o.value.includes('|REDUZIR_BLOQUEIO_12H|')).value);
    await a.locator('#selectTarefa').selectOption(reducer);
    await a.locator('#adicionar').click();
    await a.locator('[data-dialog-confirm]').click();
    await a.clock.runFor(100);
    await b.clock.runFor(100);
    const before = server.writes();
    await a.clock.runFor(20000);
    await b.clock.runFor(20000);
    await b.locator('[data-jump=ganho]').click();
    await b.locator('#selectGanho').selectOption('Outro');
    await b.locator('#valorGanho').fill('10');
    await b.locator('#adicionar').click();
    await b.clock.runFor(100);
    await a.clock.runFor(100);
    await expect(a.locator('#saldoDominadora')).toHaveText('R$ 950,00');
    for (const page of [a, b]) await expect(page.locator('#storageWarning')).toBeHidden();
    await a.clock.runFor(41000);
    await b.clock.runFor(41000);
    await a.evaluate(() => SharedWallet.flush());
    const sim = server.docs.get(root).walletAtualV4.simulator;
    for (const page of [a, b]) expect(await page.evaluate(() => window.__reducerDeviations)).toEqual([]);
    expect(JSON.parse(sim.accelBoosts)).toEqual([]);
    expect(JSON.parse(sim.tarefasBloqueadas).find((t) => t.nome === target).expiraEm).toBe(start + 7 * 86400000 - 12 * 3600000);
    expect(server.writes() - before).toBeLessThanOrEqual(10);
  } finally {
    await ca.close();
    await cb.close();
  }
});

test('clock ticks render locally while Firebase receives bounded checkpoints', async ({ page }) => {
  await page.clock.install();
  const server = await hub();
  await server.attach(page);
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.locator('[data-jump=ganho]').click();
  await page.locator('#selectGanho').selectOption('Videogames Competitivos');
  await page.clock.runFor(100);
  const before = server.writes();
  await page.clock.runFor(31000);
  await page.evaluate(() => SharedWallet.flush());
  expect(server.writes() - before).toBeLessThanOrEqual(5);
  expect(JSON.parse(server.docs.get(root).walletAtualV4.simulator.timerSession).seconds).toBeGreaterThanOrEqual(30);
  await page.locator('#btnPlayPauseTempo').click();
  await page.clock.runFor(100);
  await expect.poll(() => JSON.parse(server.docs.get(root).walletAtualV4.simulator.timerSession).running).toBe(false);
  const paused = server.writes();
  await page.clock.runFor(31000);
  expect(server.writes()).toBe(paused);
});

test('two tabs of the same browser stay usable and preserve typed form values', async ({ browser }) => {
  const context = await browser.newContext(),
    a = await context.newPage(),
    b = await context.newPage(),
    server = await hub();
  try {
    await server.attach(a);
    await expect(a.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await server.attach(b);
    await expect(b.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await a.locator('[data-jump=ganho]').click();
    await a.locator('#selectGanho').selectOption('Outro');
    await a.locator('#valorGanho').fill('17');
    await b.locator('[data-jump=gasto]').click();
    await b.locator('#selectTarefa').selectOption({ index: 1 });
    await b.locator('#adicionar').click();
    await b.locator('[data-dialog-confirm]').click();
    await expect(a.locator('#saldoDominadora')).toHaveText('R$ 970,00');
    await expect(a.locator('#valorGanho')).toHaveValue('17');
    await expect(a.locator('#adicionar')).toBeEnabled();
    await a.locator('#adicionar').click();
    await expect(b.locator('#saldoDominadora')).toHaveText('R$ 987,00');
    await expect(a.locator('#storageWarning')).toBeHidden();
    await expect(b.locator('#storageWarning')).toBeHidden();
  } finally {
    await context.close();
  }
});
test('one shared clock keeps running while the companion registers a gain, and either user can pause it', async ({ browser }) => {
  const server = await hub(),
    ca = await browser.newContext(),
    cb = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await server.attach(a);
    await expect(a.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    await server.attach(b, '0', { user: { uid: 'partner', email: 'partner@example.invalid', emailVerified: true } });
    await expect(b.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
    for (const page of [a, b])
      await page.evaluate(() => {
        window.__mergeConflicts = [];
        const merge = SharedMerge.merge;
        SharedMerge.merge = (...args) => {
          try {
            return merge(...args);
          } catch (error) {
            window.__mergeConflicts.push({ base: args[0].simulator.timerSession, local: args[1].simulator.timerSession, remote: args[2].simulator.timerSession, owner: args[3]?.timerOwner });
            throw error;
          }
        };
      });
    await a.locator('[data-jump=ganho]').click();
    await a.locator('#selectGanho').selectOption('Videogames Competitivos');
    await expect.poll(() => a.evaluate(() => !!timerInterval)).toBe(true);
    await expect.poll(() => JSON.parse(server.docs.get(root).walletAtualV4.simulator.timerSession).running).toBe(true);
    await b.locator('[data-jump=ganho]').click();
    await b.locator('#selectGanho').selectOption('Outro');
    await b.locator('#valorGanho').fill('10');
    await b.locator('#adicionar').click();
    await expect(a.locator('#saldoDominadora')).toHaveText('R$ 1.010,00');
    await expect.poll(() => a.evaluate(() => !!timerInterval)).toBe(true);
    expect(await b.evaluate(() => !!timerInterval)).toBe(false);
    await expect.poll(() => b.evaluate(() => tempoSegundos), { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    await b.locator('#btnPlayPauseTempo').click();
    await expect.poll(() => JSON.parse(server.docs.get(root).walletAtualV4.simulator.timerSession).running).toBe(false);
    await expect.poll(() => a.evaluate(() => !!timerInterval)).toBe(false);
    expect(await b.evaluate(() => !!timerInterval)).toBe(false);
    await b.locator('#btnPlayPauseTempo').click();
    await expect.poll(() => b.evaluate(() => !!timerInterval)).toBe(true);
    expect(await a.evaluate(() => !!timerInterval)).toBe(false);
    await b.locator('#btnTerminarTempo').click();
    await expect.poll(() => JSON.parse(server.docs.get(root).walletAtualV4.simulator.timerSession).active).toBe(false);
    const logs = JSON.parse(server.docs.get(root).walletAtualV4.simulator.historico);
    expect(logs.filter((x) => x.descricao.startsWith('Ganho por tempo')).length).toBeLessThanOrEqual(1);
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const page of [a, b]) {
      const conflicts = await page.evaluate(() => window.__mergeConflicts);
      if (conflicts.length) console.log(JSON.stringify(conflicts));
      expect(conflicts).toEqual([]);
      await expect(page.locator('#storageWarning')).toBeHidden();
    }
    await a.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await b.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await b.screenshot({ path: '.local/shared-wallet-phone-top.png' });
    await b.locator('#walletBalanceCard').screenshot({ path: '.local/shared-wallet-phone.png' });
    await a.screenshot({ path: '.local/shared-wallet-desktop.png' });
  } finally {
    await ca.close();
    await cb.close();
  }
});
