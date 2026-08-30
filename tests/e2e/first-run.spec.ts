import { test, expect } from '@playwright/test';

test('shows first-run setup when Supabase is not configured', async ({ page }) => {
  test.skip(
    Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY),
    'First-run mode is only applicable when Supabase is not configured.',
  );

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /configuraci[oó]n inicial/i })).toBeVisible();
  await expect(page.getByText(/conectar un proyecto supabase existente/i)).toBeVisible();
});
