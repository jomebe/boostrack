import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ args: ['--enable-webgl', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  // Do not generate advertiser impressions during deployment checks.
  await page.route('**/www.highrevenueformat.com/**', route => route.fulfill({contentType:'application/javascript',body:''}));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const response = await page.goto(process.argv[2] || 'https://boostrack.pages.dev/');
  assert.equal(response.status(), 200);
  await page.locator('#menu').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#menu').evaluate(el=>getComputedStyle(el).scrollbarWidth),'none');
  assert.equal(await page.locator('.course').count(), 5);
  assert.equal(await page.evaluate(() => '__raceTest' in window), false, 'test controls leaked into production');
  for (let index = 0; index < 5; index++) {
    await page.locator(`[data-course="${index}"]`).click();
    assert.ok((await page.locator('#preview-title').textContent()).length > 0);
  }
  await page.locator('[data-course="0"]').click();
  await page.locator('#ranking-open').click();
  await expect(page.locator('#ranking-mine')).toContainText('아직 등록한', {timeout:15000});
  for (const course of ['v2-apex-01','v2-air-01','v2-pulse-01','v3-cascade-01','v3-switch-01']) {
    const ranking = await page.request.get(new URL(`/api/leaderboard?track=${course}`,page.url()).href);
    assert.equal(ranking.status(),200);
    const data = await ranking.json();
    assert.equal(data.season,'s4');
    assert.ok(Array.isArray(data.entries));
  }
  await page.screenshot({path:'test-results/production-ranking.png'});
  await page.locator('#ranking-close').click();
  await page.screenshot({ path: 'test-results/production-menu.png' });
  await page.locator('#play').click();
  await page.locator('#countdown').filter({ hasText: 'GO' }).waitFor({ timeout: 20000 });
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => Number(document.getElementById('speed').textContent) > 60, { timeout: 20000 });
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: 'test-results/production-race.png' });
  await page.keyboard.press('Escape');
  await page.locator('#overlay').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#dialog-title').textContent(), 'PAUSED');
  await page.locator('#back').click();
  await page.locator('#multiplayer-open').click();
  await page.locator('#nickname').fill('Deploy check A');
  await page.locator('#create-room').click();
  await expect(page.locator('#room-code')).toHaveText(/^[A-F0-9]{8}$/);
  const code=await page.locator('#room-code').textContent();
  const other=await browser.newPage({viewport:{width:1280,height:800}});
  await other.route('**/www.highrevenueformat.com/**', route => route.fulfill({contentType:'application/javascript',body:''}));
  other.on('pageerror',error=>errors.push(error.message));
  await other.goto(process.argv[2]||'https://boostrack.pages.dev/');
  await other.locator('#menu').waitFor({state:'visible'});
  await other.locator('#multiplayer-open').click();
  await other.locator('#nickname').fill('Deploy check B');
  await other.locator('#join-code').fill(code);
  await other.locator('#join-room').click();
  await expect(page.locator('#room-players .racer-row')).toHaveCount(2);
  await page.locator('#room-course').selectOption('v2-air-01');
  await expect(other.locator('#room-course')).toHaveValue('v2-air-01');
  await expect(other.locator('#room-course')).toBeDisabled();
  await page.locator('#room-collisions').selectOption('on');
  await expect(other.locator('#room-collisions')).toHaveValue('on');
  await page.locator('#ready-room').click();await other.locator('#ready-room').click();
  await expect(page.locator('#start-room')).toBeEnabled();await page.locator('#start-room').click();
  await expect(other.locator('#online-board')).toBeVisible();
  await expect(page.locator('#online-board')).toBeVisible();
  await expect(page.locator('.opponent-label')).toHaveCount(1,{timeout:15000});
  await page.screenshot({path:'test-results/production-multiplayer.png'});
  await page.locator('#online-leave').click();await other.locator('#online-leave').click();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ http: response.status(), title: await page.title(), speed: await page.locator('#speed').textContent(), errors, productionTestControls: false }));
} finally {
  await browser.close();
}
