const { test, expect } = require('@playwright/test');

async function mockPersonal(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (text) => { window.copiedWishes = text; } },
    });
  });
  await page.route('**/js/firebase-google-auth.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      export async function googleAuth() {
        let user = null, receive;
        return {
          db: {},
          auth: { get currentUser() { return user; } },
          watch(next) { receive = next; next(user); },
          signIn() { user = { uid: 'personal', email: 'personal@example.invalid', emailVerified: true }; receive(user); },
          signOut() { user = null; receive(user); },
        };
      }
    `,
  }));
  await page.route('**/js/wishlist-personal-store.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      let authorized = true, receiveAccess, receiveList, receiveOutgoing, receiveIncoming;
      let list = {
        name: 'Gabriel',
        items: [
          { id: 'a', title: 'Creme de mãos', store: 'Loja A', originalPrice: 44.25, currency: 'CAD', quantity: 1, bought: false, taxQuebec: false },
          { id: 'b', title: 'Bolsa de tecido', store: 'Loja B', originalPrice: 20, currency: 'BRL', quantity: 1, bought: true, taxQuebec: false },
        ],
      };
      const calls = [];
      window.personalFixture = { revokeAccess: () => { authorized = false; receiveAccess?.(false); }, calls, removeIncoming: () => receiveIncoming([]) };
      export async function openPersonalWishlist() {
        if (!authorized) throw Error('Acesso indisponível.');
        return {
          profile: 'wallet-admin',
          watchAccess(next) { receiveAccess = next; next(authorized); return () => { receiveAccess = null; }; },
          watchList(next) {
            receiveList = next;
            next(list);
            return () => { receiveList = null; };
          },
          async sharing() {
            return { profile: 'wallet-admin', api: {
              watchPeople(next) { next([{id:'primary-luana', name:'Luana'}, {id:'wallet-admin', name:'Gabriel'}]); return () => {}; },
              watchGrants(side, next) {
                if (side === 'owner') { receiveOutgoing = next; next([]); }
                else { receiveIncoming = next; next([{owner:'primary-luana', recipient:'wallet-admin'}]); }
                return () => {};
              },
              watchPersonal(owner, next) { next([{title:'Desejo da Luana', store:'Loja A', url:'https://loja.example.invalid/item-luana'}]); return () => {}; },
              grant(recipient) { receiveOutgoing([{owner:'wallet-admin', recipient}]); },
              revoke() { receiveOutgoing([]); },
            } };
          },
          saveItem(item) {
            calls.push({ item });
            list = { ...list, items: [...list.items.filter(row => row.id !== item.id), item] };
            receiveList(list);
          },
          setBought(item, bought) {
            calls.push({ item, markBought: bought });
            list = { ...list, items: list.items.map(row => row.id === item.id ? { ...row, bought } : row) };
            receiveList(list);
          },
          removeItem(item) {
            calls.push({ item, remove: true });
            list = { ...list, items: list.items.filter(row => row.id !== item.id) };
            receiveList(list);
          },
        };
      }
    `,
  }));
}

test('a person removed from the allowlist loses the open list and draft', async ({ page }) => {
  await mockPersonal(page);
  await page.goto('/wishlist-personal.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(page.getByRole('heading', { name: 'Gabriel' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar: Bolsa de tecido' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar desejo' })).toBeVisible();
  await page.evaluate(() => window.personalFixture.revokeAccess());
  await expect(page.getByRole('heading', { name: 'Acesso indisponível' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Editar desejo' })).toBeHidden();
  await expect(page.locator('#personalWishItems li')).toHaveCount(0);
});

test('a previously issued link opens a page that directs people to signed-in sharing', async ({ page }) => {
  await page.goto('/wishlist-shared.html#5c82c026-a04d-46dc-a6fc-cc60d3d9a6e9');
  await expect(page.getByText('Agora as listas são compartilhadas diretamente entre contas autorizadas.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entrar no Wallet' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Marcar como comprado/ })).toHaveCount(0);
});

test('the personal list manages personal sharing with registered people', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPersonal(page);
  await page.goto('/wishlist-personal.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.getByRole('checkbox', { name: 'Ocultar comprados' }).check();
  await expect(page.getByText('Bolsa de tecido')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Selecionar todos' }).check();
  await expect(page.getByRole('button', { name: 'Copiar seleção' })).toBeEnabled();
  await page.getByRole('button', { name: 'Pessoas e listas' }).click();
  const sharing = page.getByRole('dialog', { name: 'Pessoas e listas' });
  await sharing.getByLabel('Escolher conta autorizada').selectOption({ label: 'Luana' });
  await sharing.getByRole('button', { name: 'Compartilhar', exact: true }).click();
  await expect(sharing.getByRole('button', { name: 'Revogar acesso de Luana' })).toBeVisible();
  await sharing.getByRole('button', { name: 'Luana', exact: true }).click();
  await expect(sharing.getByRole('link', { name: 'Desejo da Luana' })).toHaveAttribute('href', 'https://loja.example.invalid/item-luana');
  await expect(sharing.getByRole('button', { name: /Editar|Excluir|Marcar como comprado/ })).toHaveCount(0);
  await page.evaluate(() => window.personalFixture.removeIncoming());
  await expect(sharing.getByText('Desejo da Luana')).toHaveCount(0);
  await sharing.getByRole('button', { name: 'Revogar acesso de Luana' }).click();
  await expect(sharing.getByText('Sua lista é privada.')).toBeVisible();
  await sharing.getByRole('button', { name: 'Fechar pessoas e listas' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('purchase can be cancelled or confirmed and people dialog has a back button', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockPersonal(page);
  await page.goto('/wishlist-personal.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  const mark = page.getByRole('button', { name: 'Marcar como comprado: Creme de mãos' });
  await mark.click();
  const purchase = page.getByRole('dialog', { name: 'Confirmar compra?' });
  await expect(purchase.getByText('Creme de mãos')).toBeVisible();
  await purchase.getByRole('button', { name: 'Voltar' }).click();
  await expect(mark).toBeVisible();
  expect(await page.evaluate(() => window.personalFixture.calls.filter(call => call.markBought).length)).toBe(0);
  await mark.click();
  await purchase.getByRole('button', { name: 'Marcar como comprado', exact: true }).click();
  await expect(purchase).toBeHidden();
  await expect(mark).toHaveCount(0);
  await page.getByRole('button', { name: 'Desfazer compra: Bolsa de tecido' }).click();
  const undo = page.getByRole('dialog', { name: 'Desfazer compra?' });
  await undo.getByRole('button', { name: 'Voltar para pendente' }).click();
  await expect(page.getByRole('button', { name: 'Marcar como comprado: Bolsa de tecido' })).toBeVisible();
  await page.getByRole('button', { name: 'Pessoas e listas' }).click();
  const people = page.getByRole('dialog', { name: 'Pessoas e listas' });
  await expect(people.getByLabel('Escolher conta autorizada')).toBeVisible();
  expect(await people.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await people.getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(people).toBeHidden();
});

test('the personal list saves a product link even when its preview is blocked', async ({ page }) => {
  await mockPersonal(page);
  const url = 'https://loja.example.invalid/bloqueado';
  await page.route(url, route => route.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/wishlist-personal.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.getByRole('button', { name: 'Adicionar desejo' }).click();
  await page.getByLabel('Link do produto').fill(url);
  await expect(page.locator('#personalLinkStatus')).toContainText('O link será salvo');
  await page.getByLabel('Produto', { exact: true }).fill('Produto com prévia bloqueada');
  await page.getByRole('button', { name: 'Salvar desejo' }).click();
  await expect(page.getByRole('link', { name: 'Abrir produto' })).toHaveAttribute('href', url);
  const saved = await page.evaluate(() => window.personalFixture.calls.find(call => call.item?.url)?.item);
  expect(saved?.url).toBe(url);
});

test('the personal list can assign and edit independent product links from one print', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPersonal(page);
  await page.route('https://api.frankfurter.dev/v2/rates?base=BRL', route =>
    route.fulfill({ json: [{ base: 'BRL', quote: 'CAD', date: '2025-05-10', rate: .25 }] }));
  await page.route('https://loja.example.invalid/**', route => route.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/wishlist-personal.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.getByRole('button', { name: 'Adicionar desejo' }).click();
  const editor = page.getByRole('dialog', { name: 'Adicionar desejo' });
  const initialUrl = 'https://loja.example.invalid/rascunho-jeans';
  await editor.getByLabel('Link do produto').fill(initialUrl);
  await editor.getByLabel('Produto', { exact: true }).fill('Denim Jeans');
  const contents = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 840;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 840, 500);
    ctx.fillStyle = '#151515';
    ctx.font = 'bold 33px Arial';
    ctx.fillText('Produto: Linen Shirt         CA$10.00', 50, 90);
    ctx.fillText('Produto: Denim Jeans      CA$16.00', 50, 210);
    return canvas.toDataURL().split(',')[1];
  });
  await editor.locator('#personalUpload').setInputFiles({
    name: 'lista.png', mimeType: 'image/png', buffer: Buffer.from(contents, 'base64'),
  });
  const rows = editor.locator('.personal-photo-row');
  await expect(rows).toHaveCount(2, { timeout: 45000 });
  await expect(editor.locator('#personalSingleLink')).toBeHidden();
  const firstItem = rows.first().getByRole('checkbox').first();
  await firstItem.uncheck();
  await expect(rows.first().getByLabel('Preço unitário')).toBeEditable();
  await firstItem.check();
  await expect(rows.first().getByLabel('Link do produto')).toHaveValue('');
  await expect(rows.nth(1).getByLabel('Link do produto')).toHaveValue(initialUrl);
  const links = ['https://loja.example.invalid/linen', 'https://loja.example.invalid/jeans'];
  for (const [index, url] of links.entries()) {
    const row = rows.nth(index);
    await row.getByLabel('Link do produto').fill(url);
    await expect(row.getByRole('link', { name: 'Abrir link' })).toHaveAttribute('href', url);
  }
  await rows.first().getByRole('button', { name: 'Atualizar prévia' }).click();
  await expect(rows.first()).toContainText('O link será salvo com este item.');
  const second = rows.nth(1).getByLabel('Link do produto');
  await second.fill('javascript:alert(1)');
  await editor.getByRole('button', { name: 'Salvar selecionados' }).click();
  await expect(second).toBeFocused();
  await second.fill(links[1]);
  await editor.getByRole('button', { name: 'Salvar selecionados' }).click();
  const names = ['Linen Shirt', 'Denim Jeans'];
  const savedRows = page.locator('#personalWishItems .wish-row');
  for (const [index, name] of names.entries()) {
    await expect(savedRows.filter({ hasText: name }).getByRole('link', { name: 'Abrir produto' })).toHaveAttribute('href', links[index]);
    await page.getByRole('button', { name: 'Editar: ' + name }).click();
    const edit = page.getByRole('dialog', { name: 'Editar desejo' });
    await expect(edit.getByLabel('Link do produto')).toHaveValue(links[index]);
    await expect(edit.getByRole('link', { name: 'Abrir link' })).toHaveAttribute('href', links[index]);
    await edit.getByRole('button', { name: 'Cancelar' }).click();
  }
  await page.getByRole('button', { name: 'Editar: Denim Jeans' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar desejo' });
  const newUrl = 'https://loja.example.invalid/novo-jeans';
  await edit.getByLabel('Link do produto').fill(newUrl);
  await edit.getByLabel('Preço unitário').fill('12,34');
  await expect(edit.locator('[data-unit-brl]')).toContainText('49,36');
  await edit.getByRole('button', { name: 'Salvar desejo' }).click();
  await expect(savedRows.filter({ hasText: 'Denim Jeans' }).getByRole('link', { name: 'Abrir produto' })).toHaveAttribute('href', newUrl);
  await expect(savedRows.filter({ hasText: 'Linen Shirt' }).getByRole('link', { name: 'Abrir produto' })).toHaveAttribute('href', links[0]);
  const saved = savedRows.filter({ hasText: 'Denim Jeans' });
  await expect(saved).toContainText('49,36');
  await saved.getByRole('checkbox').click();
  await expect(saved.getByRole('checkbox')).toBeChecked();
});

test('the personal list applies store and Quebec taxes to all draft products', async ({ page }) => {
  await mockPersonal(page);
  await page.goto('/wishlist-personal.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.getByRole('button', { name: 'Adicionar desejo' }).click();
  const form = page.getByRole('dialog', { name: 'Adicionar desejo' });
  const shop = form.getByLabel('Loja padrão');
  await shop.fill('Loja inicial');
  await form.getByLabel('Produto', { exact: true }).fill('Produto inicial');
  const add = form.getByRole('button', { name: /Adicionar outro produto/ });
  await add.click();
  const rows = form.locator('.personal-photo-row');
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByLabel('Produto', { exact: true }).fill('Produto de outra loja');
  await rows.nth(1).getByLabel('Loja', { exact: true }).fill('Loja particular');
  await shop.fill('Loja revisada');
  await expect(rows.first().getByLabel('Loja', { exact: true })).toHaveValue('Loja revisada');
  await expect(rows.nth(1).getByLabel('Loja', { exact: true })).toHaveValue('Loja revisada');
  const taxes = form.getByLabel('Taxas do Québec no lote');
  await taxes.selectOption('remove');
  await add.click();
  await expect(rows.last().locator('[name=tax]')).not.toBeChecked();
  await expect(rows.last().getByLabel('Loja', { exact: true })).toHaveValue('Loja revisada');
  await rows.last().getByLabel('Produto', { exact: true }).fill('Produto adicional');
  await taxes.selectOption('apply');
  await expect(rows.last().locator('[name=tax]')).toBeChecked();
  await rows.nth(1).getByLabel('Loja', { exact: true }).fill('Loja particular');
  await rows.nth(1).locator('[name=tax]').uncheck();
  await form.getByRole('button', { name: 'Salvar selecionados' }).click();
  await expect(page.getByText('Produto adicional')).toBeVisible();
  const saved = await page.evaluate(() => window.personalFixture.calls.filter(call => call.item).map(({ item }) => [item.store, item.taxQuebec]));
  expect(saved).toEqual([['Loja revisada', true], ['Loja particular', false], ['Loja revisada', true]]);
});
