import { test, expect } from '@playwright/test';

test('shows the first-run setup wizard', async ({ page }) => {
  // The CI suite runs against a fully configured Supabase environment, so the
  // application correctly renders the login router at '/'. The setup wizard
  // remains directly available at /setup for first-run configuration.
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: /configuraci[oó]n inicial/i })).toBeVisible();
  await expect(page.getByText(/QuickBite no encontró una configuración completa/i)).toBeVisible();
  await expect(page.getByText('Variables mínimas')).toBeVisible();
});
