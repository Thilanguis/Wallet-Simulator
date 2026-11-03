const {test,expect}=require('../firebase-fixture.cjs');
for(const width of [1440,393]) test(`list menus ${width} preserve totals and open editors on demand`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.goto('/');await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
 await page.locator('[data-panel=wishlistPanel]').click();await expect(page.locator('#wishForm')).toBeHidden();await page.locator('#wishEditor > summary').click();
 await page.locator('#wishUrl').fill('https://example.invalid/product');await page.locator('#wishTitle').fill('Desejo teste');await page.locator('#wishStore').fill('Loja teste');await page.locator('#wishPrice').fill('25');await page.locator('#wishSave').click();
 await expect(page.locator('#wishForm')).toBeHidden();await expect(page.locator('#wishTotal')).toContainText('25,00');await expect(page.locator('.wish-group-total')).toContainText('25,00');
 await page.getByRole('button',{name:'Editar Desejo teste',exact:true}).click();await expect(page.locator('#wishForm')).toBeVisible();await page.locator('#wishCancel').click();await page.locator('#wishEditor > summary').click();
 await page.screenshot({path:'.local/wishlist-menus-'+width+'.png'});
 await page.locator('[data-panel=financePanel]').click();await expect(page.locator('#entryForm')).toBeHidden();await expect(page.locator('#financeImportTitle')).toBeHidden();await expect(page.locator('#financePanel')).not.toContainText('Sua lista de jogos');
 await expect(page.locator('#groupedFinanceList .notebook-group')).toHaveCount(9);
 await page.locator('[data-finance-jump=entry]').click();await expect(page.locator('#entryForm')).toBeVisible();await page.locator('#entryDescription').fill('Rascunho');await page.locator('[data-finance-jump=entry]').click();await expect(page.locator('#entryForm')).toBeHidden();await page.locator('[data-finance-jump=entry]').click();await expect(page.locator('#entryDescription')).toHaveValue('Rascunho');await page.locator('[data-finance-jump=entry]').click();
 await page.locator('#financeImport > summary').click();await page.locator('[data-finance-jump=receipt]').click();await expect(page.locator('#receiptFile')).toBeVisible();await page.locator('#financeImport > summary').click();
 await page.screenshot({path:'.local/notes-menus-'+width+'.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
