import { test, expect } from '@playwright/test';
import { resetDemo } from './helpers';

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
    await expect(page.getByRole('link', { name: 'I have an account' })).toBeVisible();

    // NOTE: landing.png is captured by screenshots.spec.ts at the canonical 390x664 viewport.
  });

  test('"Start in Local Mode" navigates into onboarding', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start in Local Mode' }).click();
    await page.waitForURL(/\/onboarding\/welcome/);
    // Welcome keeps the frozen "Get started" CTA (§7.9).
    await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible();
  });

  test('"I have an account" navigates to the login entry', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'I have an account' }).click();
    await page.waitForURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByTestId('enter-demo')).toBeVisible();
  });

  test('a fresh deep-link into the app is gated into onboarding (§5.3)', async ({ page }) => {
    await page.goto('/today');
    await page.waitForURL(/\/onboarding\/welcome/);
    await expect(page.getByTestId('onboarding-name')).toBeVisible();
  });
});
