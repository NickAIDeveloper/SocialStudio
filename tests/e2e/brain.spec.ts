import { test, expect } from '@playwright/test';

test.describe.skip('Brain happy path (requires connected IG)', () => {
  test('Run-now produces a brain panel with brief', async ({ page }) => {
    // Assumes test user is logged in via storageState in playwright.config.ts.
    await page.goto('/analyze');
    await page.getByRole('button', { name: /run now/i }).click();

    // Wait up to 30s for the brief to appear.
    await expect(page.getByText(/Formula for the next 7 days/i)).toBeVisible({ timeout: 30_000 });

    // Visit Smart Posts and confirm the badge appears.
    await page.goto('/smart-posts');
    await expect(page.getByText(/Brain v\d+/)).toBeVisible();
  });
});
