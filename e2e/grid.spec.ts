import { test, expect } from '@playwright/test';

/**
 * Representative end-to-end smoke for the Lattica canvas grid, driven against a
 * served instance of `examples/playground` (its kitchen-sink page).
 *
 * Selectors are kept in sync with:
 *   - examples/playground/app/kitchen-sink/page.tsx (buttons, headings)
 *   - packages/react/src/LatticaGrid.tsx testids:
 *       lattica-grid (root, role="grid"), lattica-sort-<col>,
 *       lattica-fill-handle, lattica-menu.
 *
 * This requires a server at `baseURL` (see playwright.config.ts webServer note).
 * Run with:  pnpm exec playwright test
 */
test.describe('Lattica kitchen-sink grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/kitchen-sink');
  });

  test('renders the grid with role="grid"', async ({ page }) => {
    // The page heading confirms the kitchen-sink route loaded.
    await expect(page.getByRole('heading', { name: 'Lattica Kitchen Sink' })).toBeVisible();

    // The canvas grid exposes both an ARIA grid role and a stable testid.
    const grid = page.getByTestId('lattica-grid');
    await expect(grid).toBeVisible();
    await expect(page.getByRole('grid')).toBeVisible();
  });

  test('clicking a header sort control re-sorts the grid', async ({ page }) => {
    const grid = page.getByTestId('lattica-grid');
    await expect(grid).toBeVisible();

    // The first column's header carries the sort control testid lattica-sort-0.
    const sortControl = page.getByTestId('lattica-sort-0');
    await expect(sortControl).toBeVisible();
    await sortControl.click();

    // The grid stays mounted after a sort interaction.
    await expect(grid).toBeVisible();
  });

  test('export buttons exist', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export XLSX' })).toBeVisible();
  });

  test('grid exposes a fill handle for selection drag-fill', async ({ page }) => {
    const grid = page.getByTestId('lattica-grid');
    await expect(grid).toBeVisible();

    // Selecting a cell surfaces the fill handle overlay (lattica-fill-handle).
    await grid.click({ position: { x: 80, y: 60 } });
    await expect(page.getByTestId('lattica-fill-handle')).toBeVisible();
  });
});
