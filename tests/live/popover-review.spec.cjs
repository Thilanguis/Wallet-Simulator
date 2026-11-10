const {test,expect}=require('../firebase-fixture.cjs');
for(const width of [1440,393])test(`popover review ${width}: stable triggers and remaining wishlist totals`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.goto('/');await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');await expect(page.locator('#abrirContrato')).toHaveCount(0);
 await page.locator('[data-panel=wishlistPanel]').click();const summary=page.locator('#wishEditor > summary'), before=await summary.boundingBox();await summary.click();await expect(page.locator('#wishForm')).toBeVisible();const after=await summary.boundingBox();expect(Math.abs(after.y-before.y)).toBeLessThan(2);expect(Math.abs(after.width-before.width)).toBeLessThan(2);
 await page.locator('#wishUrl').fill('https://example.invalid/item');await page.locator('#wishTitle').fill('Desejo teste');await page.locator('#wishStore').fill('Loja teste');await page.locator('#wishPrice').fill('25');await page.locator('#wishSave').click();
 await expect(page.locator('#wishTotal')).toHaveText(/R\$\s*0,00/);
 await page.locator('.wish-row input').check();
 await expect(page.locator('#wishPurchaseCount')).toHaveText('1 item na compra');
 await expect(page.locator('#wishTotal')).toContainText('25,00');
 await page.locator('.wish-row input').uncheck();
 await expect(page.locator('#wishPurchaseBar')).toBeHidden();
 await expect(page.locator('#wishTotal')).toHaveText(/R\$\s*0,00/);
 await expect(page.locator('.wish-row')).toHaveCount(1);
 await page.screenshot({animations:'disabled',path:'.local/wish-review-'+width+'.png'});
 await page.locator('[data-panel=financePanel]').click();const trigger=page.locator('[data-finance-jump=entry]'), original=await trigger.boundingBox();await trigger.click();await expect(page.locator('#entryForm')).toBeVisible();const expanded=await trigger.boundingBox();expect(Math.abs(expanded.y-original.y)).toBeLessThan(2);expect(Math.abs(expanded.width-original.width)).toBeLessThan(2);await page.locator('#entryDescription').fill('Rascunho');await page.screenshot({animations:'disabled',path:'.local/note-popover-'+width+'.png'});await page.keyboard.press('Escape');await expect(page.locator('#entryForm')).toBeHidden();await trigger.click();await expect(page.locator('#entryDescription')).toHaveValue('Rascunho');await page.locator('#financePanel .list-title-row h2').click();await expect(page.locator('#entryForm')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

