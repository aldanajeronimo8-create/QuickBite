import { test, expect } from '@playwright/test';

test('shows first-run setup when Supabase is not configured', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /configuracion inicial/i })).toBeVisible();
  await expect(page.getByText(/conectar un proyecto supabase existente/i)).toBeVisible();
});
