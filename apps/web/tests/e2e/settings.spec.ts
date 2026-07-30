import { test, expect } from '@playwright/test';
import { resetDemo, seedOnboarded, openSettings} from './helpers';

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page);
    // (app) routes are gated (§5.3): complete onboarding so /settings is reachable.
    await seedOnboarded(page);
  });

  test('renders and lets you edit an onboarding answer', async ({ page }) => {
    await page.goto('/settings');
    await openSettings(page);
    // The screen is a profile: identity and the training at a glance, with every control behind
    // the Settings disclosure that `openSettings` just opened.
    await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
    await expect(page.getByTestId('profile-card')).toBeVisible();

    // Every §2.2 profile section is present.
    await expect(page.getByText('Primary goal')).toBeVisible();
    await expect(page.getByText('Experience')).toBeVisible();
    await expect(page.getByText('Diet')).toBeVisible();

    // The Local Mode data section is present (§5.1).
    await expect(page.getByRole('button', { name: /Export data \(JSON\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Erase Local Mode data/ })).toBeVisible();

    // Edit the display name (an onboarding answer).
    const nameInput = page.getByRole('textbox').first();
    await nameInput.fill('Test Athlete');
    await expect(nameInput).toHaveValue('Test Athlete');

    // Change the primary goal card and confirm it becomes selected.
    const enduranceGoal = page.getByRole('radio', { name: /Endurance/ });
    await enduranceGoal.click();
    await expect(enduranceGoal).toHaveAttribute('aria-checked', 'true');

    // Changing equipment surfaces the "re-generate my plan?" prompt.
    await page.getByRole('button', { name: 'Barbell', exact: true }).click();
    await expect(page.getByText('Re-generate your plan?')).toBeVisible();
  });
});
