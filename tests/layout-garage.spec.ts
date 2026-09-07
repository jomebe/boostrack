import {test,expect} from '@playwright/test';
test('single scroll menu, accessible courses, garage persistence, and mobile ranking fit',async({page})=>{
  for(const width of [320,650,1440]){
    await page.setViewportSize({width,height:900});await page.goto('/?qa=1');
    await expect(page.locator('#menu')).toBeVisible();
    expect(await page.locator('#courses').evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
    expect(await page.locator('#menu').evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('none');
    expect(await page.locator('.menu-content').evaluate(el=>getComputedStyle(el).overflowY)).toBe('visible');
    expect(await page.locator('#menu').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await page.locator('[data-course="4"]').click();await expect(page.locator('[data-course="4"]')).toHaveAttribute('aria-pressed','true');
    await page.screenshot({path:`test-results/menu-redesign-${width}.png`});
    await page.locator('#garage-open').click();
    await page.locator('#car-paint').fill('#1166ee');await page.locator('#car-accent').fill('#ffcc11');await page.locator('#car-spoiler').uncheck();
    await page.locator('#settings-close').click();await page.reload();
    await expect.poll(()=>page.evaluate(()=>(window as any).__raceTest?.snapshot().paint)).toBe('1166ee');
    expect(await page.evaluate(()=>(window as any).__raceTest.snapshot().spoiler)).toBe(false);
    await page.locator('#ranking-open').click();
    await expect(page.locator('#ranking-close')).toBeVisible();
    expect(await page.locator('.ranking-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  }
});
