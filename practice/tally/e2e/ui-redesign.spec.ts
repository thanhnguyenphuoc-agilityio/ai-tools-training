import { expect, test, type Page } from '@playwright/test';
import { t, vnd } from './i18n';

// Group page after ui_redesign: confirmation toasts, the summary above the tabs
// and the bottom tab bar on phones. Fake data only.
async function createGroup(page: Page) {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Book club');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await page.getByRole('button', { name: t('ownerKey.done') }).click();
}

// The visible toast cards; the screen reader copy is in a separate live region (role="status").
const toasts = (page: Page) => page.locator('.toasts');

test('saving an expense shows a toast and updates the summary', async ({ page }) => {
  await createGroup(page);
  const summary = page
    .getByRole('definition')
    .filter({ hasText: vnd(0) })
    .first();
  await expect(summary).toBeVisible();

  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByLabel(t('members.addLabel')).fill('Sam');
  await page.getByRole('button', { name: t('members.add'), exact: true }).click();
  await expect(toasts(page)).toContainText(t('toast.memberAdded', { name: 'Sam' }));
  // Wait for the reloaded group, so the expense form opens with Sam in it.
  await expect(page.locator('.group-page__figure').nth(1).getByRole('definition')).toHaveText('2');

  await page.getByRole('tab', { name: t('group.tabs.expenses') }).click();
  await page.getByLabel(t('expenseForm.amount')).fill('200k');
  await page.getByLabel(t('expenseForm.description')).fill('Snacks');
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  await expect(toasts(page)).toContainText(t('toast.expenseAdded'));

  const figures = page.locator('.group-page__summary');
  await expect(figures).toContainText(t('group.summary.total'));
  await expect(figures).toContainText(vnd(200_000));
  await expect(figures).toContainText(t('group.summary.owed'));
  await expect(figures).toContainText(vnd(100_000));
});

test('a toast can be dismissed and disappears by itself', async ({ page }) => {
  await createGroup(page);
  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByLabel(t('members.addLabel')).fill('Jamie');
  await page.getByRole('button', { name: t('members.add'), exact: true }).click();
  const item = page.locator('.toasts__item', { hasText: t('toast.memberAdded', { name: 'Jamie' }) });
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: t('common.close') }).click();
  await expect(item).toBeHidden();

  await page.getByLabel(t('members.addLabel')).fill('Riley');
  await page.getByRole('button', { name: t('members.add'), exact: true }).click();
  const second = page.locator('.toasts__item', { hasText: t('toast.memberAdded', { name: 'Riley' }) });
  await expect(second).toBeVisible();
  await expect(second).toBeHidden({ timeout: 10000 });
});

test('a phone shows only the two newest toasts', async ({ page }) => {
  await createGroup(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  for (const name of ['Sam', 'Jamie', 'Taylor']) {
    await page.getByLabel(t('members.addLabel')).fill(name);
    await page.getByRole('button', { name: t('members.add'), exact: true }).click();
    await expect(toasts(page)).toContainText(t('toast.memberAdded', { name }));
  }
  const items = page.locator('.toasts__item');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toBeHidden();
  await expect(items.nth(2)).toBeVisible();
  await expect(page.getByRole('status')).toContainText(t('toast.memberAdded', { name: 'Sam' }));

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(items.first()).toBeVisible();
});

test('copying the invite link confirms with a toast', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are granted in Chromium only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await createGroup(page);
  await page.getByRole('button', { name: t('group.copyInvite') }).click();
  await expect(toasts(page)).toContainText(t('toast.inviteCopied'));
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test('the tabs are a bottom bar on a phone and sit above the content on a desktop', async ({ page }) => {
  await createGroup(page);
  const tablist = page.getByRole('tablist');

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(tablist.getByRole('tab')).toHaveCount(4);
  await expect(tablist).toHaveCSS('position', 'fixed');
  await expect
    .poll(async () =>
      Math.round(((await tablist.boundingBox())?.y ?? 0) + ((await tablist.boundingBox())?.height ?? 0)),
    )
    .toBe(800);
  await expect.poll(async () => Math.round((await tablist.boundingBox())?.width ?? 0)).toBe(390);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(tablist).toHaveCSS('position', 'static');
  const desktop = await tablist.boundingBox();
  const summary = await page.locator('.group-page__summary').boundingBox();
  expect(desktop!.y).toBeGreaterThan(summary!.y);
});

test('a visitor who has not joined sees no personal balance in the summary', async ({ page, browser }) => {
  await createGroup(page);
  const visitor = await browser.newPage();
  await visitor.goto(page.url());
  await expect(visitor.locator('.group-page__summary')).toContainText(t('group.summary.total'));
  await expect(visitor.locator('.group-page__figure')).toHaveCount(2);
  await visitor.close();
});

test('the confirmation is announced once to screen readers, without the close button', async ({ page }) => {
  await createGroup(page);
  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByLabel(t('members.addLabel')).fill('Morgan');
  await page.getByRole('button', { name: t('members.add'), exact: true }).click();
  const live = page.getByRole('status');
  await expect(live).toHaveText(t('toast.memberAdded', { name: 'Morgan' }));
  await expect(live.getByRole('button')).toHaveCount(0);
});

test('a toast stays while the pointer is over it', async ({ page }) => {
  await createGroup(page);
  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByLabel(t('members.addLabel')).fill('Casey');
  await page.getByRole('button', { name: t('members.add'), exact: true }).click();
  const item = page.locator('.toasts__item', { hasText: t('toast.memberAdded', { name: 'Casey' }) });
  await item.hover();
  await page.waitForTimeout(5000);
  await expect(item).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(item).toBeHidden({ timeout: 10000 });
});
