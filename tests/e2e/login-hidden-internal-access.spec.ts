import { expect, test } from '@playwright/test';

test.describe('login internal access discovery', () => {
  test('keeps Staff and Admin out of the public login and unlocks them only through the five-tap gestures', async ({ page }) => {
    await page.goto('/login');

    await expect(
      page.getByRole('button', { name: 'Acceso de personal de cafetería' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Acceso de administración' }),
    ).toHaveCount(0);

    const studentTab = page.getByRole('tab', { name: 'Estudiante' });
    for (let index = 0; index < 5; index += 1) {
      await studentTab.click();
    }
    await expect(page.getByText('Acceso interno')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Personal de cafetería' })).toBeVisible();

    await page.getByRole('button', { name: 'Volver al acceso general' }).click();

    const parentTab = page.getByRole('tab', { name: 'Padre de familia' });
    for (let index = 0; index < 5; index += 1) {
      await parentTab.click();
    }
    await expect(page.getByText('Acceso interno')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  });
});
