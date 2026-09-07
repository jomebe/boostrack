import { test, expect } from "@playwright/test";

test("menu, physical keyboard driving, brake, recover, restart and pause", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?qa=1");
  await expect(page.locator("#menu")).toBeVisible();
  await expect(page.locator(".course")).toHaveCount(5);
  await page.screenshot({ path: "test-results/menu.png" });
  await page.locator("#play").click();
  await expect
    .poll(
      () => page.evaluate(() => (window as any).__raceTest.snapshot().state),
      { timeout: 20000 },
    )
    .toBe("running");
  await page.keyboard.down("KeyW");
  await expect
    .poll(async () => Number(await page.locator("#speed").textContent()), {
      timeout: 15000,
    })
    .toBeGreaterThan(65);
  await page.keyboard.up("KeyW");
  const speed = Number(await page.locator("#speed").textContent());
  expect(speed).toBeGreaterThan(50);
  await page.screenshot({ path: "test-results/race.png" });
  await page.keyboard.down("Space");
  await page.waitForTimeout(1100);
  await page.keyboard.up("Space");
  expect(Number(await page.locator("#speed").textContent())).toBeLessThan(
    speed,
  );
  const time = await page.locator("#timer").textContent();
  await page.keyboard.press("KeyT");
  await page.waitForTimeout(150);
  expect(await page.locator("#timer").textContent()).not.toBe("00:00.000");
  await page.keyboard.press("Escape");
  await expect(page.locator("#dialog-title")).toHaveText("PAUSED");
  const paused = await page.locator("#timer").textContent();
  await page.waitForTimeout(350);
  await expect(page.locator("#timer")).toHaveText(paused!);
  await page.locator("#restart").click();
  await expect(page.locator("#timer")).toHaveText("00:00.000");
  expect(time).not.toBe("00:00.000");
  expect(errors).toEqual([]);
});

for (const i of [0, 1, 2, 3, 4]) test(`circuit ${i}: finishes with real physics, saves records and replays ghosts`, async ({
  page,
}) => {
  test.setTimeout(220000);
  await page.addInitScript(() => localStorage.setItem('boostrack.v2.settings', JSON.stringify({quality:'low',music:0,sfx:0})));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?qa=1");
  await expect(page.locator("#menu")).toBeVisible();
  await page.evaluate(async () => {
    const { drive } = await import(/* @vite-ignore */ "/tests/driver.mjs");
    (window as any).__raceTest.setDriver(drive);
  });
  {
    await page.locator(`[data-course="${i}"]`).click();
    await page.locator("#play").click();
    await expect(page.locator("#overlay")).toBeVisible({ timeout: 180000 });
    await expect(page.locator("#dialog-title")).toHaveText("FINISH.", {
      timeout: 110000,
    });
    await expect(page.locator("#result")).toContainText("복귀 0회");
    const snapshot = await page.evaluate(() =>
      (window as any).__raceTest.snapshot(),
    );
    console.log("BROWSER RACE", i, snapshot);
    expect(snapshot.drawCalls).toBeLessThan(220);
    expect(snapshot.time).toBeGreaterThan(30);
    await page.screenshot({ path: `test-results/finish-${i}.png` });
    await page.locator("#back").click();
    await expect(page.locator("#menu-pb")).not.toHaveText("—:——.———");
  }
  await page.reload();
  await expect(page.locator("#menu")).toBeVisible();
  await page.locator(`[data-course="${i}"]`).click();
  await expect(page.locator("#menu-pb")).not.toHaveText("—:——.———");
  await page.locator("#play").click();
  await expect
    .poll(
      () => page.evaluate(() => (window as any).__raceTest.snapshot().state),
      { timeout: 15000 },
    )
    .toBe("running");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__raceTest.snapshot().ghostVisible),
    )
    .toBe(true);
  await page.screenshot({ path: "test-results/ghost.png" });
  expect(errors).toEqual([]);
});

test("small screens expose touch controls and persist audio settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#menu")).toBeVisible();
  await page.locator("#settings-open").click();
  await page.locator("#music").fill("0");
  await page.locator("#settings-close").click();
  await page.reload();
  await expect(page.locator("#menu")).toBeVisible();
  await page.locator("#settings-open").click();
  await expect(page.locator("#music")).toHaveValue("0");
  await page.locator("#settings-close").click();
  await page.locator("#play").click();
  await expect(page.locator(".touch-controls")).toBeVisible();
  await page.screenshot({ path: "test-results/mobile.png" });
});
