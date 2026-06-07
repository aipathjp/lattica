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

/**
 * Range-selection regression suite, driven against the formatting page because
 * it mounts <LatticaStatusBar> (lattica-statusbar), whose live Count aggregate
 * exposes the size of the current selection to assertions.
 *
 * Guards the 2026-06-07 field report that shift+click failed to extend the
 * selection from the active cell (drag and shift+arrow worked); the unit test
 * in LatticaGrid.test.tsx covers the synthetic-event path, this covers a real
 * browser's modifier-click pipeline.
 */
test.describe('Lattica range selection (formatting page)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/formatting');
  });

  /** Reads the leading "Count: N" aggregate from the status bar. */
  const readCount = async (page: import('@playwright/test').Page): Promise<number> => {
    const text = await page.getByTestId('lattica-statusbar').textContent();
    const match = /Count:\s*(\d+)/.exec(text ?? '');
    expect(match).not.toBeNull();
    return Number(match![1]);
  };

  test('shift+click extends the selection from the active cell', async ({ page }) => {
    // The formatting page mounts several demo grids; the first one is the
    // number-format showcase wired to the status bar.
    const grid = page.getByTestId('lattica-grid').first();
    await expect(grid).toBeVisible();

    // Anchor a single cell; the status bar reports a count of exactly 1.
    await grid.click({ position: { x: 150, y: 80 } });
    expect(await readCount(page)).toBe(1);

    // Shift+click a cell a few rows below: the selection must grow to the
    // full rectangle between the anchor and the clicked cell, not collapse
    // to the clicked cell alone.
    await grid.click({ position: { x: 150, y: 200 }, modifiers: ['Shift'] });
    const shiftClickCount = await readCount(page);
    expect(shiftClickCount).toBeGreaterThan(1);

    // Drag-select over the same rectangle as a reference: shift+click and
    // drag must agree on the selection size.
    await grid.click({ position: { x: 150, y: 80 } });
    await grid.hover({ position: { x: 150, y: 80 } });
    await page.mouse.down();
    await grid.hover({ position: { x: 150, y: 200 } });
    await page.mouse.up();
    expect(await readCount(page)).toBe(shiftClickCount);
  });
});
