import { test, expect } from "@playwright/test";

test("two independent players create, join, race, see each other, finish and rematch", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const a = await browser.newContext(),
    b = await browser.newContext();
  for (const context of [a, b])
    await context.addInitScript(() =>
      localStorage.setItem(
        "boostrack.v2.settings",
        JSON.stringify({ quality: "low", music: 0, sfx: 0 }),
      ),
    );
  const host = await a.newPage(),
    guest = await b.newPage();
  const errors: string[] = [];
  for (const page of [host, guest]) {
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/?qa=1");
    await expect(page.locator("#menu")).toBeVisible();
    console.log("multiplayer page loaded");
    await page.screenshot({ path: "test-results/multiplayer-menu.png" });
    await page.evaluate(async () => {
      const { drive } = await import(/* @vite-ignore */ "/tests/driver.mjs");
      (window as any).__raceTest.setDriver(drive);
    });
    await page.locator("#multiplayer-open").click();
    console.log("multiplayer dialog opened");
  }
  await host.locator("#nickname").fill("Host racer");
  await host.locator("#create-room").click();
  await expect(host.locator("#room-code")).toHaveText(/^[A-F0-9]{8}$/);
  const code = await host.locator("#room-code").textContent();
  await guest.locator("#nickname").fill("Guest racer");
  await guest.locator("#join-code").fill(code!);
  await guest.locator("#join-room").click();
  await expect(host.locator("#room-players .racer-row")).toHaveCount(2);
  await expect(guest.locator("#room-players .racer-row")).toHaveCount(2);
  await host.locator("#ready-room").click();
  await guest.locator("#ready-room").click();
  await expect(host.locator("#start-room")).toBeEnabled();
  await host.locator("#start-room").click();
  for (const page of [host, guest])
    await expect(page.locator("#online-board")).toBeVisible();
  await expect
    .poll(
      () => host.evaluate(() => (window as any).__raceTest.snapshot().state),
      { timeout: 15000 },
    )
    .toBe("running");
  await expect(host.locator(".opponent-label")).toHaveCount(1);
  await expect(guest.locator(".opponent-label")).toHaveCount(1);
  await host.keyboard.press("KeyR");
  await expect
    .poll(() =>
      host.evaluate(() => (window as any).__raceTest.snapshot().state),
    )
    .toBe("running");
  await host.screenshot({ path: "test-results/multiplayer-race.png" });
  for (const page of [host, guest])
    await expect(page.locator("#dialog-title")).toHaveText("RACE RESULTS", {
      timeout: 160000,
    });
  const results = await host.evaluate(
    () => (window as any).__raceTest.snapshot().room,
  );
  expect(results.players).toHaveLength(2);
  for (const player of results.players) {
    expect(player.time).toBeGreaterThan(30);
    expect(player.dnf).toBe(false);
    expect(player.checkpoint).toBe(3);
  }
  expect(
    await guest.evaluate(() =>
      (window as any).__raceTest
        .snapshot()
        .room.players.map((p: any) => p.time),
    ),
  ).toEqual(results.players.map((p: any) => p.time));
  await host.screenshot({ path: "test-results/multiplayer-results.png" });
  await host.locator("#restart").click();
  await expect(host.locator("#multiplayer")).toBeVisible();
  await expect(guest.locator("#multiplayer")).toBeVisible();
  await host.locator("#leave-room").click();
  await expect(guest.locator("#room-players .racer-row")).toHaveCount(1);
  await expect(guest.locator("#start-room")).toBeVisible();
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});

test("quick match puts two players into the same available lobby", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const codes: string[] = [];
  try {
    for (const [i, context] of contexts.entries()) {
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/");
      await expect(page.locator("#menu")).toBeVisible();
      await page.locator(`[data-course="${i===0?3:1}"]`).click();
      await page.locator("#multiplayer-open").click();
      await page.locator("#nickname").fill(`Quick ${i}`);
      await page.locator("#quick-match").click();
      await expect(page.locator("#room-code")).toHaveText(/^[A-F0-9]{8}$/);
      codes.push((await page.locator("#room-code").textContent())!);
    }
    expect(codes[0]).toBe(codes[1]);
  } finally {
    for (const context of contexts) await context.close();
  }
});
