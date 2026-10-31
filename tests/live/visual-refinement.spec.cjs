const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function open(page, seed = {}) {
  await page.route('**/firebaseConfiguration.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {};' }));
  await page.addInitScript((seed) => {
    if (!localStorage.getItem('findom.wallet.v2')) for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
  }, seed);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#transactionTitle')).toHaveText('Resgatar Privilégio');
  return errors;
}
for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px visual refinement`, () => {
    test.use({ viewport });
    test('modes, empty tasks, explicit contract choices and existing roulette access', async ({ page }) => {
      const errors = await open(page, { saldoDominadora: '200' });
      await expect(page.locator('#tipoTransacao')).toBeHidden();
      await expect(page.locator('#pendingTasksSection')).toHaveClass(/is-empty/);
      await expect(page.locator('#tarefasLimitadasSection')).toHaveClass(/is-empty/);
      expect(await page.locator('#pendingTasksSection').evaluate((el) => el.nextElementSibling.id)).toBe('tarefasLimitadasSection');
      await page.locator('[data-jump=ganho]').click();
      await expect(page.locator('#transactionTitle')).toHaveText('Ganhar Créditos');
      await expect(page.locator('#ganhoFields')).toBeVisible();
      await page.locator('[data-jump=gasto]').click();
      await expect(page.locator('#compraFields')).toBeVisible();
      await expect(page.locator('#ganhoFields')).toBeHidden();
      await page.locator('#contractOccurrences summary').click();
      await page.locator('[data-contract-rule=creamPenalty]').click();
      await expect(page.locator('[data-contract-rule=creamPenalty]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-rule-impact=creamPenalty]')).toContainText('40,00');
      await page.locator('#contractOccurrenceNote').fill('Observação fictícia');
      await page.locator('#registerContractOccurrence').click();
      await expect(page.locator('.app-dialog[open]')).toBeVisible();
      await page.locator('[data-dialog-cancel]').click();
      await expect(page.locator('#saldoDominadora')).toHaveText('R$ 200,00');
      await expect(page.locator('#rouletteNextSpin')).toHaveText('Disponível agora');
      await page.locator('#openRouletteCard').click();
      await expect(page.locator('#roletaBox')).toBeVisible();
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    test('populated tasks and read-only roulette summary retain stored rewards', async ({ page }) => {
      const awards = [{ id: 'fictional-reward', label: 'Massagem nos pés', kind: 'freeService', serviceId: 'Massagem nos pés', claimed: true, createdAt: new Date().toISOString() }];
      const seed = {
        tarefasPendentes: JSON.stringify([{ id: 321, tarefa: 'Serviço fictício', descricao: 'Descrição do serviço', valor: 20, timestamp: new Date().toISOString() }]),
        tarefasBloqueadas: JSON.stringify([{ nome: 'Massagem nos pés', expiraEm: Date.now() + 86400000 }]),
        rouletteAwards: JSON.stringify(awards),
        roletaUltimoUso: String(Date.now() - 3600000),
        roletaUltimoResultadoTexto: 'Massagem nos pés',
      };
      const errors = await open(page, seed);
      await expect(page.locator('#pendingTasksSection')).not.toHaveClass(/is-empty/);
      await expect(page.locator('#tarefasLimitadasSection')).not.toHaveClass(/is-empty/);
      await expect(page.locator('#tarefasPendentes input[type=checkbox]')).toBeVisible();
      await expect(page.locator('#tarefasLimitadasLista [data-expira]')).toContainText('Massagem nos pés');
      await expect(page.locator('#roulettePendingCount, #rouletteLastPrize')).toHaveCount(0);
      await expect(page.locator('#roulettePrizeList')).toBeHidden();
      await expect(page.locator('#rouletteNextSpin')).toContainText('2d');
      await expect(page.locator('#openRouletteCard')).toBeDisabled();
      expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('rouletteAwards')))).toEqual(awards);
      expect(errors).toEqual([]);
    });
    test('daily history renders bonus, discount, adjustment and archive without rewriting data', async ({ page }) => {
      const history = [
        { descricao: 'Ganho fictício com bônus', tipo: 'ganho', valor: 11.5, saldoAtual: 111.5, timestamp: '2026-10-29T15:00:00', valorOriginal: 10, valorFinal: 11.5, diferenca: 1.5, percentual: 15 },
        { descricao: 'Serviço fictício com desconto', tipo: 'gasto', valor: 17, saldoAtual: 94.5, timestamp: '2026-10-29T16:00:00', valorOriginal: 20, valorFinal: 17, diferenca: -3, percentual: -15 },
        { descricao: 'Ajuste manual de saldo: 94.5 → 0', tipo: 'ajuste', valor: 0, saldoAtual: 0, timestamp: '2026-10-30T10:00:00' },
        { descricao: 'Prêmio fictício', tipo: 'premio', valor: 0, saldoAtual: 0, timestamp: '2026-10-30T11:00:00' },
      ];
      const errors = await open(page, { historico: JSON.stringify(history) });
      await expect(page.locator('.history-day')).toHaveCount(2);
      await expect(page.locator('.history-ganho')).toContainText('Bônus +15%');
      await expect(page.locator('.history-gasto')).toContainText('Desconto −15%');
      await expect(page.locator('.history-gasto')).toContainText('Economia R$ 3,00');
      await expect(page.locator('.history-ajuste .history-amount')).toHaveText('−R$ 94,50');
      await expect(page.locator('.history-premio .history-amount')).toHaveText('Gratuito');
      expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('historico')))).toEqual(history);
      await page.locator('#filterDate').fill('2026-10-29');
      await page.locator('#aplicarFiltro').click();
      await expect(page.locator('.history-day')).toHaveCount(1);
      await expect(page.locator('.history-row')).toHaveCount(2);
      await expect(page.locator('.history-heading #enviarHistoricoWhatsApp')).toBeVisible();
      await page.locator('#limparFiltro').click();
      await expect(page.locator('.history-row')).toHaveCount(4);
      const dir = path.resolve('.local');
      fs.mkdirSync(dir, { recursive: true });
      await page.locator('#historySection').screenshot({ path: path.join(dir, `history-${viewport.width}.png`) });
      await page.locator('.history-premio .history-archive').click();
      await page.locator('[data-dialog-cancel]').click();
      await expect(page.locator('.history-row')).toHaveCount(4);
      await page.locator('.history-premio .history-archive').click();
      await page.locator('[data-dialog-confirm]').click();
      await expect(page.locator('.history-row')).toHaveCount(3);
      expect(await page.evaluate(() => JSON.parse(AppStorage.getItem('archivedHistory')))).toEqual([history[3]]);
      await expect(page.locator('#saldoDominadora')).toHaveText('R$ 0,00');
      expect(errors).toEqual([]);
    });
    test('notes preserve long descriptions, order, equivalents, totals and small tools', async ({ page }) => {
      const errors = await open(page);
      const original = await page.evaluate(() => {
        const list =
          '1. Perfil\n• Jogo em partes: R$ 12,00 + R$ 3,00\n2. Comida para Luana e Mel\n• $5 dólares = R$ 20,00\n3. Lista de Compras\n• Compra fictícia com uma descrição longa para conferir a quebra de linha completa sem esconder nenhuma informação do produto ✅: R$ 40,00\n• Item estrangeiro ✅: $8,00 x3';
        const state = Finance.commitPreview(Finance.empty(), Finance.preview(list, [], ''));
        WalletStore.commitFinance(state);
        return state;
      });
      await page.reload();
      await page.locator('[data-panel=financePanel]').click();
      await expect(page.locator('#groupedFinanceList .notebook-group')).toHaveCount(9);
      await expect(page.locator('#groupedFinanceList > details')).toHaveCount(0);
      await expect(page.locator('#groupedFinanceList [data-grand-total]')).toHaveText(/75,00/);
      const equivalent = page.locator('#groupedFinanceList .note-content').filter({ hasText: '=' });
      await expect(equivalent).toHaveText(/\$.*5,00 = R\$.*20,00/);
      const long = page.locator('#groupedFinanceList .notebook-line').filter({ hasText: 'Compra fictícia' });
      await expect(long.locator('.note-content')).toContainText('sem esconder nenhuma informação do produto ✅');
      const box = await long.locator('.note-icon').first().boundingBox();
      expect(box.width).toBeLessThanOrEqual(30);
      expect(box.height).toBeLessThanOrEqual(32);
      expect(await page.evaluate(() => FinanceUI.getState())).toEqual(original);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('#groupedFinanceList').screenshot({ path: path.resolve('.local', `notes-${viewport.width}.png`) });
      expect(errors).toEqual([]);
    });
  });
}
