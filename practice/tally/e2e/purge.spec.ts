import { expect, test } from '@playwright/test';
import { t } from './i18n';

test.describe('purge inactive groups', () => {
  test('PG-6: deletion date shown; highlighted from 72 hours before expiresAt', async ({ page, browser }) => {
    // Create a group
    const res = await page.request.post('/api/groups', {
      data: { name: 'Expiring trip', ownerName: 'Alex' },
    });
    expect(res.status()).toBe(201);
    const { code } = await res.json();

    // Read expiresAt
    const getRes = await page.request.get(`/api/groups/${code}`);
    const { expiresAt } = await getRes.json();
    const expiresMs = Date.parse(expiresAt);

    // 73 hours before expiresAt: not expiring soon
    await page.clock.setFixedTime(expiresMs - 73 * 3600e3);
    await page.goto(`/g/${code}`);

    const expiryLine = page.locator('.group-expiry');
    await expect(expiryLine).toBeVisible();
    await expect(page.locator('.group-expiry--soon')).toHaveCount(0);

    // 71 hours before expiresAt (new page context): highlighted with warning text
    const newPage = await browser.newPage();
    await newPage.clock.setFixedTime(expiresMs - 71 * 3600e3);
    await newPage.goto(`/g/${code}`);

    const soonLine = newPage.locator('.group-expiry--soon');
    await expect(soonLine).toBeVisible();
    await expect(soonLine).toContainText(t('group.expiry.soon'));
    await newPage.close();
  });

  test('PG-7: deleted group shows not found and is removed from recent groups', async ({ page }) => {
    const fakeCode = '2345-6789-abcd';

    await page.goto('/');
    await page.evaluate(
      ({ code }) => {
        localStorage.setItem(
          'tally.history',
          JSON.stringify([{ code, name: 'Deleted trip', visitedAt: new Date().toISOString() }]),
        );
      },
      { code: fakeCode },
    );

    // Open deleted group via plain link
    await page.goto(`/g/${fakeCode}`);
    await expect(page.getByText(t('group.notFound'))).toBeVisible();

    // Back to home: entry is gone from recent groups list
    await page.getByRole('button', { name: t('common.backHome') }).click();
    await expect(page.getByText('Deleted trip')).toHaveCount(0);
    await expect(page.getByText(t('home.history.title'))).toHaveCount(0);

    // Repeat with #owner=xyz recovery link
    await page.evaluate(
      ({ code }) => {
        localStorage.setItem(
          'tally.history',
          JSON.stringify([{ code, name: 'Deleted trip with key', visitedAt: new Date().toISOString() }]),
        );
      },
      { code: fakeCode },
    );

    await page.goto(`/g/${fakeCode}#owner=xyz123`);
    await expect(page.getByText(t('group.notFound'))).toBeVisible();

    await page.getByRole('button', { name: t('common.backHome') }).click();
    await expect(page.getByText('Deleted trip with key')).toHaveCount(0);
    await expect(page.getByText(t('home.history.title'))).toHaveCount(0);
  });

  test('saving unchanged group settings shows no message; a changed save shows one', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(t('home.create.groupName')).fill('Settings trip');
    await page.getByLabel(t('home.create.yourName')).fill('Alex');
    await page.getByRole('button', { name: t('home.create.submit') }).click();
    await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    await page.getByRole('button', { name: t('ownerKey.done') }).click();

    await page.getByRole('tab', { name: t('group.tabs.members') }).click();
    const settings = page.locator('.card', { hasText: t('members.settingsTitle') });
    await expect(settings).toBeVisible();

    // Unchanged: the server answers changed: false and no toast appears
    const unchanged = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && /\/api\/groups\/[^/]+$/.test(r.url()),
    );
    await settings.getByRole('button', { name: t('common.save') }).click();
    expect((await (await unchanged).json()).changed).toBe(false);
    await expect(page.locator('.toasts__item')).toHaveCount(0);

    // Changed: the toast is shown
    await settings.getByLabel(t('members.groupName')).fill('Renamed trip');
    await settings.getByRole('button', { name: t('common.save') }).click();
    await expect(page.locator('.toasts')).toContainText(t('toast.settingsSaved'));
  });
});
