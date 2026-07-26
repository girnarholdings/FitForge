import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve the preinstalled full Chromium binary. The pinned @playwright/test build may not match
 * the browsers baked into the image (and `playwright install` is disallowed), so we point directly
 * at whatever `chromium-*` build exists under PLAYWRIGHT_BROWSERS_PATH. Using the full chrome
 * binary (not chrome-headless-shell) sidesteps the version-specific headless-shell lookup.
 */
function resolveChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = fs
      .readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort();
    for (const d of dir.reverse()) {
      const bin = path.join(root, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  } catch {
    /* fall through to Playwright's default resolution */
  }
  return undefined;
}

const CHROMIUM_BIN = resolveChromium();

/**
 * DEMO MODE end-to-end suite. The app is a Next.js static export (`out/`) served by `serve`.
 * Everything runs client-side (localStorage key `fitforge.demo.v1`); there is no backend.
 *
 * Assumes `out/` is already built:
 *   npm run build -w @fitforge/shared
 *   NEXT_PUBLIC_BASE_PATH="" NEXT_PUBLIC_DEMO=1 npm run build -w @fitforge/web
 *
 * `PLAYWRIGHT_BROWSERS_PATH` is respected from the environment (Chromium is preinstalled).
 */
const PORT = 4599;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/.output',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      // iPhone 13 viewport/UA but pinned to the preinstalled Chromium build.
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        defaultBrowserType: 'chromium',
        launchOptions: CHROMIUM_BIN ? { executablePath: CHROMIUM_BIN } : {},
      },
    },
  ],
  webServer: {
    // A tiny zero-dependency server instead of `npx serve`: `serve` leaks a file descriptor per
    // request and dies with EMFILE partway through a full run (the box's hard `ulimit -n` is
    // 4096), failing every remaining test with ERR_CONNECTION_REFUSED — a fake regression that
    // looks exactly like a product break. See tests/static-server.mjs.
    command: `node tests/static-server.mjs out ${PORT}`,
    cwd: '.',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
