import { expect, test } from '@playwright/test';
import { t } from './i18n';

// Viewport-specific. The mobile project (Pixel 7, 412px) is below md, so the side-by-side assertion would fail there.
// The desktop project keeps the configured browser and setViewportSize overrides it.
test.describe('Create form layout (create_form_layout)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'layout checks run in the desktop project');
  });

  test('(a) desktop: the two groups sit side by side with equal tops; the currency group holds the select and the rounding checkbox', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');

    const groups = page.locator('.home-page__group');
    await expect(groups).toHaveCount(2);

    const yourNameGroup = groups.nth(0);
    const currencyGroup = groups.nth(1);
    await expect(currencyGroup.getByLabel(t('home.create.currency'))).toBeVisible();
    await expect(currencyGroup.getByRole('checkbox')).toHaveCount(1);
    await expect(yourNameGroup.getByLabel(t('home.create.yourName'))).toBeVisible();

    const firstBox = await yourNameGroup.boundingBox();
    const secondBox = await currencyGroup.boundingBox();
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    expect(Math.abs(firstBox!.y - secondBox!.y)).toBeLessThanOrEqual(1);
    expect(secondBox!.x).toBeGreaterThan(firstBox!.x + firstBox!.width - 1);
  });

  test('(b) phone: the currency group starts below the "Your name" group', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');

    const groups = page.locator('.home-page__group');
    await expect(groups).toHaveCount(2);

    const firstBox = await groups.nth(0).boundingBox();
    const secondBox = await groups.nth(1).boundingBox();
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    expect(secondBox!.y).toBeGreaterThanOrEqual(firstBox!.y + firstBox!.height);
  });

  test('(c) the form still creates a group from the grouped layout', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel(t('home.create.groupName')).fill('Weekend Trip');
    await page.getByLabel(t('home.create.yourName')).fill('Alex');
    await page.getByRole('button', { name: t('home.create.submit') }).click();
    await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});
