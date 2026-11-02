const { test, expect } = require('@playwright/test');
const { hub } = require('./firebase-primary-hub.cjs');
const root = 'usuarios/gabriel-local';
for (const width of [1440, 393, 820])
  test(`two Google accounts ${width}: same shared wallet, purchases and task completion without session buttons`, async ({ browser }) => {
    const server = await hub(),
      first = await browser.newContext(),
      second = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 1000, hasTouch: width < 1000 });
    const a = await first.newPage(),
      b = await second.newPage();
    try {
      await server.attach(a, '0');
      await expect(a.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
      await server.attach(b, '999', { user: { uid: 'partner', email: 'partner@example.invalid', emailVerified: true } });
      await expect(b.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
      await expect(b.locator('#saldoDominadora')).toHaveText('R$ 1.000,00');
      await a.locator('[data-jump=gasto]').click();
      await a.locator('#selectTarefa').selectOption({ index: 1 });
      await a.locator('#adicionar').click();
      await a.locator('[data-dialog-confirm]').click();
      await expect(b.locator('#saldoDominadora')).toHaveText('R$ 970,00');
      await expect(b.locator('#tarefasPendentes .tarefa-item')).toHaveCount(1);
      expect([...server.docs.keys()].filter((key) => key.startsWith(root + '/historico/')).length).toBe(1);
      expect([...server.docs.keys()].filter((key) => key.startsWith(root + '/tarefas/')).length).toBe(1);
      await expect(a.locator('#cloudControl')).toHaveCount(0);
      expect(await b.evaluate(() => WalletStore.isWritable())).toBe(true);
      await b.locator('#tarefasPendentes input[type=checkbox]').check();
      await expect(a.locator('#tarefasPendentes .tarefa-item')).toHaveCount(0);
      const task = [...server.docs].find(([key]) => key.startsWith(root + '/tarefas/'))[1];
      expect(task.status).toBe('concluida');
      await b.locator('[data-jump=ganho]').click();
      await b.locator('#selectGanho').selectOption('Outro');
      await b.locator('#valorGanho').fill('10');
      await b.locator('#adicionar').click();
      await expect(a.locator('#saldoDominadora')).toHaveText('R$ 980,00');
      await b.reload();
      await expect(b.locator('#saldoDominadora')).toHaveText('R$ 980,00');
    } finally {
      await first.close();
      await second.close();
    }
  });
test('legacy tasks and history load from existing collections and console edits reach the current UI', async ({ page }) => {
  const server = await hub({
    [root + '/tarefas/old']: { titulo: 'Tarefa anterior', status: 'pendente', valor: 25, timestamp: '2026-10-01T12:00:00Z' },
    [root + '/historico/old']: { descricao: 'Histórico anterior', valor: 50, saldoAtual: 1000, tipo: 'ganho', timestamp: '2026-10-01T12:00:00Z' },
  });
  await server.attach(page, '0');
  await expect(page.locator('#tarefasPendentes .tarefa-item')).toContainText('Tarefa anterior');
  await expect(page.locator('#historico')).toContainText('Histórico anterior');
  await server.publish(root + '/tarefas/old', { ...server.docs.get(root + '/tarefas/old'), status: 'concluida' });
  await expect(page.locator('#tarefasPendentes .tarefa-item')).toHaveCount(0);
  await server.publish(root + '/historico/old', { ...server.docs.get(root + '/historico/old'), descricao: 'Histórico conferido' });
  await expect(page.locator('#historico')).toContainText('Histórico conferido');
});
test('offline freezes operations and reconnects to the confirmed Firebase wallet', async ({ page }) => {
  const server = await hub();
  await server.attach(page, '0');
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('#cloudStatusText')).toContainText('Sem conexão');
  expect(await page.evaluate(() => WalletStore.isWritable())).toBe(false);
  expect(server.docs.get(root).saldoDominadora).toBe(1000);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
});
