import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { resetDemo, seedOnboarded, openSettings} from './helpers';

test.describe('landing', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
  });

  test('renders hero, value props, and CTAs', async ({ page }) => {
    await page.goto('/');
    // New "Forged Gold" headline (§5.2). The h1 spans two lines; the accessible name concatenates.
    await expect(page.getByRole('heading', { name: /forged around you/i })).toBeVisible();
    await expect(page.getByText(/Macros, explained/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start in Local Mode' })).toBeVisible();

    // NOTE: landing.png is captured by screenshots.spec.ts at the canonical 390x664 viewport.
  });

  test('offers exactly two ways in, and no third path', async ({ page }) => {
    await page.goto('/');
    // The whole point of this screen. It used to carry an "I have an account" link to a login page
    // that offered Local Mode a second time, and onboarding then offered it a third — three routes
    // to two outcomes. Sign-up and sign-in are one button because Google does not distinguish them.
    await expect(page.getByRole('button', { name: 'Start in Local Mode' })).toBeVisible();
    await expect(page.getByTestId('google-signin')).toBeVisible();
    await expect(page.getByRole('link', { name: /i have an account/i })).toHaveCount(0);
  });

  test('"Start in Local Mode" goes straight to the name, then to the first question', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start in Local Mode' }).click();
    await page.waitForURL(/\/onboarding\/welcome/);
    // The name is asked immediately — it is the first and only thing this screen wants.
    await expect(page.getByTestId('onboarding-name')).toBeVisible();
    // Welcome keeps the frozen "Get started" CTA (§7.9), and it no longer detours via an auth step.
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.waitForURL(/\/onboarding\/goals/);
  });

  test('the retired login route is gone, not merely unlinked', async ({ page }) => {
    const res = await page.request.get('/login/', { failOnStatusCode: false });
    expect(res.status()).toBe(404);
  });

  test('Local Mode onboarding states the trade-off and can restore a backup on the spot', async ({
    page,
  }) => {
    // Produce a real backup from a real populated store, via the Settings export the copy points at.
    await seedOnboarded(page);
    await page.goto('/settings');
    await openSettings(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('settings-export').click(),
    ]);
    const backup = fs.readFileSync(await download.path(), 'utf8');
    expect(JSON.parse(backup)).toBeTruthy();

    // Wipe the browser and arrive as a first-time Local Mode visitor.
    await resetDemo(page);
    await page.goto('/onboarding/welcome');

    const panel = page.getByTestId('welcome-local-backup');
    await expect(panel).toBeVisible();
    // The consequence has to be stated, not implied — this is the only screen where it can still
    // be acted on for free.
    await expect(panel).toContainText(/clearing your browser data erases your training/i);
    await expect(panel).toContainText(/Settings → Local Mode/);
    await expect(page.getByTestId('welcome-import')).toBeVisible();

    // And Import is a working control, not a signpost: the backup restores and lands in the app.
    await page.getByTestId('welcome-import-file').setInputFiles({
      name: 'fitforge-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backup),
    });
    await page.waitForURL(/\/today/);
  });

  test('a backup written on the retired auth step still imports', async ({ page }) => {
    // A backup file is a durable artefact and the import path rejects anything that needs
    // repairing, so retiring a step could quietly invalidate files people already hold. Anyone
    // parked on `auth` when they exported resumes at the welcome screen instead.
    await seedOnboarded(page);
    await page.goto('/settings');
    await openSettings(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('settings-export').click(),
    ]);
    const bundle = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    bundle.demo.onboardingStep = 'auth';

    await resetDemo(page);
    await page.goto('/onboarding/welcome');
    await page.getByTestId('welcome-import-file').setInputFiles({
      name: 'legacy-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(bundle)),
    });
    await page.waitForURL(/\/today/);
    await expect(page.getByTestId('welcome-import-error')).toHaveCount(0);
  });

  test('a fresh deep-link into the app is gated into onboarding (§5.3)', async ({ page }) => {
    await page.goto('/today');
    await page.waitForURL(/\/onboarding\/welcome/);
    await expect(page.getByTestId('onboarding-name')).toBeVisible();
  });
});
