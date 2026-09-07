import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const targetUrl = process.argv[2] || 'https://boostrack.pages.dev/';
console.log(`Checking 1v1 Ghost Battle on ${targetUrl}...`);

// 1. Check API endpoints
const rankingRes = await fetch(new URL('/api/leaderboard?track=v2-apex-01', targetUrl).href);
assert.equal(rankingRes.status, 200, 'Leaderboard API should return 200');
const rankingData = await rankingRes.json();
console.log('Leaderboard entries count:', rankingData.entries?.length);

const ghostRes = await fetch(new URL('/api/leaderboard?track=v2-apex-01&ghost_rank=1', targetUrl).href);
assert.equal(ghostRes.status, 200, 'Ghost API should return 200');
const ghostData = await ghostRes.json();
assert.equal(ghostData.ok, true, 'Ghost data ok should be true');
assert.equal(ghostData.rank, 1, 'Ghost rank should be 1');
assert.ok(ghostData.nickname, 'Ghost should have nickname');
assert.ok(Array.isArray(ghostData.frames) && ghostData.frames.length >= 50, 'Ghost should have frames');
console.log(`Verified Rank #1 Ghost for ${ghostData.nickname}: ${ghostData.frames.length} frames, ${ghostData.time_ms}ms`);

// Verify the ghost speed is NOT constant and realistically accelerates from 0 km/h
const speeds = [];
for (let i = 0; i < ghostData.frames.length - 1; i++) {
  const f0 = ghostData.frames[i];
  const f1 = ghostData.frames[i + 1];
  const dt = f1.t - f0.t;
  if (dt > 0.001) {
    const dist = Math.hypot(f1.p[0] - f0.p[0], f1.p[1] - f0.p[1], f1.p[2] - f0.p[2]);
    speeds.push({ t: f0.t, speed: (dist / dt) * 3.6 });
  }
}
const initialSpeed = speeds.find(s => s.t >= 0.05)?.speed ?? 0;
const speedAt2s = speeds.find(s => s.t >= 2.0)?.speed ?? 0;
const speedAt5s = speeds.find(s => s.t >= 5.0)?.speed ?? 0;
const maxSpeed = Math.max(...speeds.map(s => s.speed));
const minSpeedAfterLaunch = Math.min(...speeds.filter(s => s.t > 3.0).map(s => s.speed));

console.log(`Ghost Speed Profile -> Launch: ${initialSpeed.toFixed(1)} km/h | 2s: ${speedAt2s.toFixed(1)} km/h | 5s: ${speedAt5s.toFixed(1)} km/h | Peak: ${maxSpeed.toFixed(1)} km/h | Corner dip: ${minSpeedAfterLaunch.toFixed(1)} km/h`);
assert.ok(initialSpeed < 30, `Launch speed should be low (standing start), got ${initialSpeed}`);
assert.ok(speedAt2s > initialSpeed + 30, `Speed at 2s should be significantly higher than launch, got ${speedAt2s}`);
assert.ok(maxSpeed > 150, `Ghost peak speed should exceed 150 km/h, got ${maxSpeed}`);
assert.ok(maxSpeed - minSpeedAfterLaunch > 30, `Ghost should slow down for corners and vary speed, speed variance: ${maxSpeed - minSpeedAfterLaunch}`);
console.log('✓ Verified: Ghost accelerates from standstill and dynamically varies speed throughout the lap!');

// 2. Headless Browser E2E Check
const browser = await chromium.launch({ args: ['--enable-webgl', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  const res = await page.goto(targetUrl);
  assert.equal(res.status(), 200);
  await page.locator('#menu').waitFor({ state: 'visible' });

  // Open ranking
  await page.locator('#ranking-open').click();
  await page.locator('#rankings').waitFor({ state: 'visible' });
  await expect(page.locator('#ranking-entries .ranking-row')).not.toHaveCount(0, { timeout: 15000 });

  // Check 1v1 battle buttons
  await expect(page.locator('.ranking-challenge-btn').first()).toBeVisible();
  const topChallenge = page.locator('.ranking-top-challenge');
  await expect(topChallenge).toBeVisible();
  console.log('Top challenge button text:', await topChallenge.textContent());

  // Click 1v1 Ghost Battle button
  await topChallenge.click();

  // Verify game starts with challenger banner
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#challenger-banner').waitFor({ state: 'visible', timeout: 10000 });
  console.log('Challenger banner text:', await page.locator('#challenger-banner').textContent());

  // Wait for countdown to GO
  await page.locator('#countdown').filter({ hasText: 'GO' }).waitFor({ timeout: 15000 });

  // Drive forward
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2000);
  await page.keyboard.up('ArrowUp');

  // Verify delta HUD is working
  const deltaText = await page.locator('#challenger-delta').textContent();
  console.log('Live Challenger Delta:', deltaText);
  assert.ok(deltaText.length > 0, 'Challenger delta should be populated');

  // Take screenshot of 1v1 Ghost Battle
  await page.screenshot({ path: 'test-results/production-ghost-battle.png' });
  console.log('Screenshot saved to test-results/production-ghost-battle.png');

  assert.deepEqual(errors, [], `Page errors: ${errors.join(', ')}`);
  console.log('Production 1v1 Ghost Battle verification SUCCESSFUL!');
} finally {
  await browser.close();
}
