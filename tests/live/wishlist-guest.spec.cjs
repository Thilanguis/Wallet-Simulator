const { test, expect } = require('@playwright/test');

async function mockGuest(page) {
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
          signIn() { user = { uid: 'guest', email: 'guest@example.invalid', emailVerified: true }; receive(user); },
          signOut() { user = null; receive(user); },
        };
      }
    `,
  }));
  await page.route('**/js/wishlist-access.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      let account = { role: 'request' }, receiveAccount, receiveList, receiveOutgoing, receiveIncoming;
      let list = {
        name: 'Helena',
        gifts: [{ id: 'gift', title: 'Presente separado', store: 'Loja C', originalPrice: 12, currency: 'CAD', quantity: 1 }],
        items: [
          { id: 'a', title: 'Creme de mãos', store: 'Loja A', originalPrice: 44.25, currency: 'CAD', quantity: 1, bought: false, taxQuebec: false },
          { id: 'b', title: 'Bolsa de tecido', store: 'Loja B', originalPrice: 20, currency: 'BRL', quantity: 1, bought: true, taxQuebec: false },
        ],
      };
      const calls = [];
      function role(next) { account = next; receiveAccount?.(next); }
      window.guestFixture = { role, calls, removeIncoming: () => receiveIncoming([]) };
      export async function openWishlistAccess() {
        return {
          enabled: true, ...account,
          watchAccount(next) { receiveAccount = next; next(account); return () => { receiveAccount = null; }; },
          watchList(id, next) {
            if (id !== 'helena') throw Error('A lista pedida não pertence à convidada.');
            receiveList = next;
            next(list);
            return () => { receiveList = null; };
          },
          async sharing() {
            return { profile: 'account-helena', api: {
              watchPeople(next) { next([{id:'primary-luana', name:'Luana'}, {id:'wallet-admin', name:'Gabriel'}]); return () => {}; },
              watchGrants(side, next) {
                if (side === 'owner') { receiveOutgoing = next; next([]); }
                else { receiveIncoming = next; next([{owner:'primary-luana', recipient:'account-helena'}]); }
                return () => {};
              },
              watchPersonal(owner, next) { next([{title:'Desejo da Luana', store:'Loja A', url:'https://loja.example.invalid/item-luana'}]); return () => {}; },
              grant(recipient) { receiveOutgoing([{owner:'account-helena', recipient}]); },
              revoke() { receiveOutgoing([]); },
            } };
          },
          submitRequest() { calls.push({ request: true }); role({ role: 'pending' }); },
          saveItem(id, item) {
            calls.push({ id, item });
            list = { ...list, items: [...list.items.filter(row => row.id !== item.id), item] };
            receiveList(list);
          },
          setBought(id, item, bought) {
            calls.push({ id, item, markBought: bought });
            list = { ...list, items: list.items.map(row => row.id === item.id ? { ...row, bought } : row) };
            receiveList(list);
          },
          removeItem(id, item) {
            calls.push({ id, item, remove: true });
            list = { ...list, items: list.items.filter(row => row.id !== item.id) };
            receiveList(list);
          },
        };
      }
    `,
  }));
}

test('guest requests access, manages only her wishes and loses access to purchased drafts immediately', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGuest(page);
  await page.goto('/wishlist-guest.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(page.getByRole('heading', { name: 'Solicitação enviada' })).toBeVisible();
  await expect(page.locator('#guestWishItems li')).toHaveCount(0);
  const grant = (allowed) => page.evaluate(canManagePurchased => {
    window.guestFixture.role({ role: 'guest', personId: 'helena', canManagePurchased });
  }, allowed);
  await grant(false);
  await expect(page.getByRole('heading', { name: 'Helena' })).toBeVisible();
  await expect(page.locator('#guestWishItems li')).toHaveCount(2);
  await expect(page.getByText('CAD 44,25')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar: Bolsa de tecido' })).toHaveCount(0);
  await expect(page.locator('[data-panel], #simulator, #financePanel')).toHaveCount(0);
  expect(await page.evaluate(() => !window.WalletStore && document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('checkbox', { name: /Creme de mãos/ }).check();
  await page.getByRole('button', { name: 'Copiar seleção' }).click();
  const shared = await page.evaluate(() => window.copiedWishes);
  expect(shared).toContain('Creme de mãos');
  expect(shared).not.toContain('Bolsa de tecido');

  const editor = page.getByRole('dialog', { name: /desejo/ });
  await page.getByRole('button', { name: 'Adicionar desejo' }).click();
  await editor.getByLabel('Produto', { exact: true }).fill('Sabonete de teste');
  await editor.getByLabel('Loja', { exact: true }).fill('Loja C');
  await editor.getByRole('button', { name: 'Salvar desejo' }).click();
  await expect(page.getByText('Sabonete de teste')).toBeVisible();
  await page.getByRole('button', { name: 'Editar: Sabonete de teste' }).click();
  await editor.getByLabel('Produto', { exact: true }).fill('Sabonete de lavanda');
  await editor.getByRole('button', { name: 'Salvar desejo' }).click();
  await expect(page.getByText('Sabonete de lavanda')).toBeVisible();
  await page.getByRole('button', { name: 'Excluir: Sabonete de lavanda' }).click();
  await page.getByRole('button', { name: 'Excluir desejo', exact: true }).click();
  await expect(page.getByText('Sabonete de lavanda')).toHaveCount(0);

  await grant(true);
  await page.getByRole('button', { name: 'Editar: Bolsa de tecido' }).click();
  await expect(editor.getByLabel('Produto', { exact: true })).toHaveValue('Bolsa de tecido');
  await grant(false);
  await expect(editor).toBeHidden();
  await expect(page.getByRole('button', { name: 'Editar: Bolsa de tecido' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Editar: Creme de mãos' }).click();
  await page.evaluate(() => window.guestFixture.role({ role: 'blocked' }));
  await expect(page.getByRole('heading', { name: 'Acesso indisponível' })).toBeVisible();
  await expect(page.locator('#guestWishItems li')).toHaveCount(0);
  await expect(page.locator('[name=title]')).toHaveValue('');
  const calls = await page.evaluate(() => window.guestFixture.calls);
  expect(calls.filter(call => call.request)).toHaveLength(1);
  expect(calls.slice(1).map(call => [call.id, call.item.title, call.item.bought, Boolean(call.remove)])).toEqual([
    ['helena', 'Sabonete de teste', false, false],
    ['helena', 'Sabonete de lavanda', false, false],
    ['helena', 'Sabonete de lavanda', false, true],
  ]);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
});

test('a connected guest promoted to subadmin opens the wallet automatically', async ({ page }) => {
  await mockGuest(page);
  await page.route('**/js/firebase-ui.js', route => route.abort());
  await page.goto('/wishlist-guest.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(page.getByRole('heading', { name: 'Solicitação enviada' })).toBeVisible();
  await page.evaluate(() => window.guestFixture.role({ role: 'guest', personId: 'helena' }));
  await expect(page.getByRole('heading', { name: 'Helena' })).toBeVisible();
  await page.evaluate(() => window.guestFixture.role({ role: 'coadmin' }));
  await expect(page).toHaveURL(/\/$/);
});

test('a previously issued link opens a page that directs people to signed-in sharing', async ({ page }) => {
  await page.goto('/wishlist-shared.html#5c82c026-a04d-46dc-a6fc-cc60d3d9a6e9');
  await expect(page.getByText('Agora as listas são compartilhadas diretamente entre contas aprovadas.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entrar no Wallet' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Marcar como comprado/ })).toHaveCount(0);
});

test('guest sees Wallet gifts separately and manages personal sharing with registered people', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGuest(page);
  await page.goto('/wishlist-guest.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.evaluate(() => window.guestFixture.role({ role: 'guest', personId: 'helena' }));
  const gifts = page.getByRole('region', { name: 'Presentes da Luana' });
  await expect(gifts.getByText('Presente separado')).toBeVisible();
  await expect(gifts.getByText('Somente visualização')).toBeVisible();
  await expect(gifts.getByRole('button')).toHaveCount(0);
  await expect(gifts.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Ocultar comprados' }).check();
  await expect(page.getByText('Bolsa de tecido')).toHaveCount(0);
  await expect(gifts.getByText('Presente separado')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Selecionar todos' }).check();
  await expect(page.getByRole('button', { name: 'Copiar seleção' })).toBeEnabled();
  await expect(page.locator('#guestWishItems').getByText('Presente separado')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pessoas e listas' }).click();
  const sharing = page.getByRole('dialog', { name: 'Pessoas e listas' });
  await sharing.getByLabel('Escolher conta aprovada').selectOption({ label: 'Gabriel' });
  await sharing.getByRole('button', { name: 'Compartilhar', exact: true }).click();
  await expect(sharing.getByRole('button', { name: 'Revogar acesso de Gabriel' })).toBeVisible();
  await sharing.getByRole('button', { name: 'Luana', exact: true }).click();
  await expect(sharing.getByRole('link', { name: 'Desejo da Luana' })).toHaveAttribute('href', 'https://loja.example.invalid/item-luana');
  await expect(sharing.getByRole('button', { name: /Editar|Excluir|Marcar como comprado/ })).toHaveCount(0);
  await page.evaluate(() => window.guestFixture.removeIncoming());
  await expect(sharing.getByText('Desejo da Luana')).toHaveCount(0);
  await sharing.getByRole('button', { name: 'Revogar acesso de Gabriel' }).click();
  await expect(sharing.getByText('Sua lista é privada.')).toBeVisible();
  await sharing.getByRole('button', { name: 'Fechar pessoas e listas' }).click();
  await expect(gifts.getByText('Presente separado')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(gifts.getByText('Presente separado')).toBeVisible();
});

test('purchase can be cancelled or confirmed and people dialog has a back button', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockGuest(page);
  await page.goto('/wishlist-guest.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.evaluate(() => window.guestFixture.role({ role: 'guest', personId: 'helena' }));
  const mark = page.getByRole('button', { name: 'Marcar como comprado: Creme de mãos' });
  await mark.click();
  const purchase = page.getByRole('dialog', { name: 'Confirmar compra?' });
  await expect(purchase.getByText('Creme de mãos')).toBeVisible();
  await purchase.getByRole('button', { name: 'Voltar' }).click();
  await expect(mark).toBeVisible();
  expect(await page.evaluate(() => window.guestFixture.calls.filter(call => call.markBought).length)).toBe(0);
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
  await expect(people.getByLabel('Escolher conta aprovada')).toBeVisible();
  expect(await people.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await people.getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(people).toBeHidden();
});

test('guest saves a product link even when its preview is blocked', async ({ page }) => {
  await mockGuest(page);
  const url = 'https://loja.example.invalid/bloqueado';
  await page.route(url, route => route.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/wishlist-guest.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.evaluate(() => window.guestFixture.role({ role: 'guest', personId: 'helena' }));
  await page.getByRole('button', { name: 'Adicionar desejo' }).click();
  await page.getByLabel('Link do produto').fill(url);
  await expect(page.locator('#guestLinkStatus')).toContainText('O link será salvo');
  await page.getByLabel('Produto', { exact: true }).fill('Produto com prévia bloqueada');
  await page.getByRole('button', { name: 'Salvar desejo' }).click();
  await expect(page.getByRole('link', { name: 'Abrir produto' })).toHaveAttribute('href', url);
  const saved = await page.evaluate(() => window.guestFixture.calls.find(call => call.item?.url)?.item);
  expect(saved?.url).toBe(url);
});

test('guest can assign and edit independent product links from one print', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGuest(page);
  await page.route('https://loja.example.invalid/**', route => route.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/wishlist-guest.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.evaluate(() => window.guestFixture.role({ role: 'guest', personId: 'helena' }));
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
  await editor.locator('#guestUpload').setInputFiles({
    name: 'lista.png', mimeType: 'image/png', buffer: Buffer.from(contents, 'base64'),
  });
  const rows = editor.locator('.guest-photo-row');
  await expect(rows).toHaveCount(2, { timeout: 45000 });
  await expect(editor.locator('#guestSingleLink')).toBeHidden();
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
  const savedRows = page.locator('#guestWishItems .wish-row');
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
  await edit.getByRole('button', { name: 'Salvar desejo' }).click();
  await expect(savedRows.filter({ hasText: 'Denim Jeans' }).getByRole('link', { name: 'Abrir produto' })).toHaveAttribute('href', newUrl);
  await expect(savedRows.filter({ hasText: 'Linen Shirt' }).getByRole('link', { name: 'Abrir produto' })).toHaveAttribute('href', links[0]);
});

test('guest adds product rows without photos and can change the default store independently', async ({ page }) => {
  await mockGuest(page);
  await page.goto('/wishlist-guest.html');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.evaluate(() => window.guestFixture.role({ role: 'guest', personId: 'helena' }));
  await page.getByRole('button', { name: 'Adicionar desejo' }).click();
  const form = page.getByRole('dialog', { name: 'Adicionar desejo' });
  const shop = form.getByLabel('Loja padrão');
  await shop.fill('Loja inicial');
  await form.getByLabel('Produto', { exact: true }).fill('Produto inicial');
  const add = form.getByRole('button', { name: /Adicionar outro produto/ });
  await add.click();
  const rows = form.locator('.guest-photo-row');
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByLabel('Produto', { exact: true }).fill('Produto de outra loja');
  await rows.nth(1).getByLabel('Loja', { exact: true }).fill('Loja particular');
  await shop.fill('Loja revisada');
  await expect(rows.first().getByLabel('Loja', { exact: true })).toHaveValue('Loja revisada');
  await expect(rows.nth(1).getByLabel('Loja', { exact: true })).toHaveValue('Loja particular');
  await add.click();
  await expect(rows.last().getByLabel('Loja', { exact: true })).toHaveValue('Loja revisada');
  await rows.last().getByLabel('Produto', { exact: true }).fill('Produto adicional');
  await form.getByRole('button', { name: 'Salvar selecionados' }).click();
  await expect(page.getByText('Produto adicional')).toBeVisible();
  const stores = await page.evaluate(() => window.guestFixture.calls.map(call => call.item?.store));
  expect(stores.filter(Boolean)).toEqual(['Loja revisada', 'Loja particular', 'Loja revisada']);
});
