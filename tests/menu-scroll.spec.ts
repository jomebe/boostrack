import { test, expect } from '@playwright/test';

for (const width of [320, 650, 1440]) {
  test(`menu has no nested scrollbars at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?qa=1');
    const menu = page.locator('#menu');
    await expect(menu).toBeVisible();
    expect(await menu.evaluate(el => getComputedStyle(el).scrollbarWidth)).toBe('none');
    expect(await menu.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.locator('#courses').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await page.locator('[data-course="4"]').click();
    await expect(page.locator('[data-course="4"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#ranking-open').scrollIntoViewIfNeeded();
    await expect(page.locator('#ranking-open')).toBeInViewport();
  });
}
