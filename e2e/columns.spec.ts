import { expect, test } from '@playwright/test';

// "Col 1" exactly — a bare substring would also match "Col 10".."Col 19".
const firstColumnHeader = (page: import('@playwright/test').Page) =>
  page.getByRole('columnheader').filter({ hasText: /Col 1(?!\d)/ }).first();

test.describe('Column settings playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/columns');
    await expect(page.getByRole('heading', { name: 'Column Settings' })).toBeVisible();
  });

  test('hides and restores a column', async ({ page }) => {
    await expect(firstColumnHeader(page)).toBeVisible();

    await page.getByTestId('lattica-colsettings-vis-0').uncheck();
    await expect(firstColumnHeader(page)).toHaveCount(0);

    await page.getByTestId('lattica-colsettings-showall').click();
    await expect(firstColumnHeader(page)).toBeVisible();
  });

  test('admin mode edits a column width', async ({ page }) => {
    const header = firstColumnHeader(page);
    const before = await header.boundingBox();
    expect(before).not.toBeNull();

    await page.getByTestId('mode-admin').check();
    const input = page.getByTestId('lattica-colsettings-width-0');
    await input.fill('160');
    await input.blur();

    await expect.poll(async () => (await header.boundingBox())?.width).toBeGreaterThan((before?.width ?? 0) + 40);
  });

  test('restores per-user hidden state after reload', async ({ page }) => {
    await page.getByTestId('lattica-colsettings-vis-0').uncheck();
    await expect(firstColumnHeader(page)).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Column Settings' })).toBeVisible();
    await expect(firstColumnHeader(page)).toHaveCount(0);
  });
});

test.describe('Data ops display toggles', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/data-ops');
    await expect(page.getByRole('heading', { name: 'Sort / Filter / Find' })).toBeVisible();
  });

  const copyFirstRegion = async (page: import('@playwright/test').Page): Promise<string> => {
    await page.getByTestId('lattica-grid').click({ position: { x: 60, y: 40 } });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
    return page.evaluate(() => navigator.clipboard.readText());
  };

  test('sort icons can be hidden while header-click sorting still works', async ({ page }) => {
    expect(await copyFirstRegion(page)).toBe('Tokyo');

    await page.getByTestId('toggle-showSortIcons').uncheck();
    await expect(page.getByTestId('lattica-sort-2')).toHaveCount(0);
    await page.getByRole('columnheader').filter({ hasText: 'Units' }).click();

    expect(await copyFirstRegion(page)).toBe('Nagoya');
  });

  test('row number gutter can be hidden', async ({ page }) => {
    await expect(page.getByRole('rowheader').first()).toBeVisible();
    await page.getByTestId('toggle-showRowNumbers').uncheck();
    await expect(page.getByRole('rowheader')).toHaveCount(0);
  });
});
