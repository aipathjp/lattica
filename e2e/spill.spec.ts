import { test, expect } from '@playwright/test';

/**
 * End-to-end smoke for the dynamic-array (spill) demo page, driven against a
 * served instance of `examples/playground` (its /spill route).
 *
 * The page seeds array formulas (SEQUENCE / TRANSPOSE / SORT / UNIQUE) through
 * the headless controller and reads several resolved cells back; the probe
 * element reports "spill OK" only when the spilled values resolve correctly.
 */
test.describe('Lattica dynamic-array spill', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/spill');
  });

  test('renders the spill demo grid', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Lattica — Dynamic Arrays (spill)' }),
    ).toBeVisible();
    await expect(page.getByTestId('lattica-grid')).toBeVisible();
    await expect(page.getByRole('grid')).toBeVisible();
  });

  test('spilled array values resolve through the controller', async ({ page }) => {
    // The probe runs SEQUENCE/SORT reads after seeding; it must report OK.
    await expect(page.getByTestId('spill-probe')).toHaveText('spill OK');
  });
});

test.describe('Lattica playground navigation', () => {
  test('home links reach both demos', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Lattica Playground' })).toBeVisible();

    await page.getByTestId('nav-spill').click();
    await expect(page).toHaveURL(/\/spill$/);
    await expect(page.getByTestId('lattica-grid')).toBeVisible();

    await page.goto('/');
    await page.getByTestId('nav-kitchen-sink').click();
    await expect(page).toHaveURL(/\/kitchen-sink$/);
    await expect(page.getByTestId('lattica-grid')).toBeVisible();
  });
});
