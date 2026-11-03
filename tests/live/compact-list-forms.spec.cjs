const {test,expect}=require('../firebase-fixture.cjs');
for(const width of [1440,393])test(`compact list forms ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/');await expect(page.locator('#cloudStatusText')).toContainText('Salvo no Firebase');
 await page.locator('[data-panel=financePanel]').click();await page.locator('[data-finance-jump=entry]').click();await page.locator('#entryForm').scrollIntoViewIfNeeded();
 expect(await page.locator('#entryAmount').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(40);
 await page.screenshot({path:'.local/compact-notes-form-'+width+'.png'});
 await page.locator('[data-panel=wishlistPanel]').click();await page.locator('#wishEditor > summary').click();expect(await page.locator('#wishPrice').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(40);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
