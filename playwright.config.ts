import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      args: [
        "--enable-webgl",
        "--enable-unsafe-swiftshader",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
      ],
    },
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: 'npx wrangler pages dev dist --port 8788',
      url: 'http://127.0.0.1:8788/api/leaderboard?track=v2-apex-01',
      reuseExistingServer: true,
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
    },
    {
      command: "npx wrangler dev --config server/wrangler.jsonc --port 8787",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: true,
    },
  ],
  reporter: "list",
});
