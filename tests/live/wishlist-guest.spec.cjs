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
              watchPersonal(owner, next) { next([{title:'Desejo da Luana', store:'Loja A'}]); return () => {}; },
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
  await expect(gifts.getByRole('button')).toHaveCount(0);
  await expect(page.locator('#guestWishItems').getByText('Presente separado')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pessoas e listas' }).click();
  const sharing = page.getByRole('dialog', { name: 'Pessoas e listas' });
  await sharing.getByLabel('Escolher conta aprovada').selectOption({ label: 'Gabriel' });
  await sharing.getByRole('button', { name: 'Compartilhar', exact: true }).click();
  await expect(sharing.getByRole('button', { name: 'Revogar acesso de Gabriel' })).toBeVisible();
  await sharing.getByRole('button', { name: 'Luana', exact: true }).click();
  await expect(sharing.getByText('Desejo da Luana')).toBeVisible();
  await expect(sharing.getByRole('button', { name: /Editar|Excluir|Marcar como comprado/ })).toHaveCount(0);
  await page.evaluate(() => window.guestFixture.removeIncoming());
  await expect(sharing.getByText('Desejo da Luana')).toHaveCount(0);
  await sharing.getByRole('button', { name: 'Revogar acesso de Gabriel' }).click();
  await expect(sharing.getByText('Sua lista é privada.')).toBeVisible();
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
