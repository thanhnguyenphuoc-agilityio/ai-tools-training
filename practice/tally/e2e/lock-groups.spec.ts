import { expect, test } from '@playwright/test';
import { t } from './i18n';

test.describe('lock_groups (LG-6, LG-7)', () => {
  // LG-6: member and guest see kept line visible, but no lock control
  test('LG-6: member and guest see kept line but no keep control', async ({ page, browser }) => {
    // 1. Sign in and create a locked group via API
    // Create dev session first
    // A fresh account per run: the group stays kept, and the local database keeps it between runs, so a fixed
    // email would reach MAX_LOCKED_GROUPS after a few runs and get 409 LOCK_LIMIT_REACHED.
    const email = `creator-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const devRes = await page.request.post('/api/auth/dev', { data: { email } });
    expect(devRes.status()).toBe(200);

    const groupRes = await page.request.post('/api/groups', {
      data: { name: 'Kept Group', ownerName: 'Alex' },
    });
    expect(groupRes.status()).toBe(201);
    const { code } = await groupRes.json();

    const lockRes = await page.request.post(`/api/groups/${code}/lock`);
    expect(lockRes.status()).toBe(200);

    // 2. Guest context (not signed in, no cookies)
    const guestContext = await browser.newContext({ locale: 'vi-VN' });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`/g/${code}`);

    // Kept line visible
    const guestExpiry = guestPage.locator('.group-expiry');
    await expect(guestExpiry).toBeVisible();
    await expect(guestExpiry).toContainText(t('group.expiry.kept'));
    await expect(guestPage.locator('.group-expiry--soon')).toHaveCount(0);

    // No control in Members tab
    await guestPage.getByRole('tab', { name: t('group.tabs.members') }).click();
    await expect(guestPage.locator('.keep-group')).toHaveCount(0);

    // 3. Member context (joins the group)
    const memberContext = await browser.newContext({ locale: 'vi-VN' });
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`/g/${code}`);

    // Join
    await memberPage.getByLabel(t('join.yourName')).fill('Sam');
    await memberPage.getByRole('button', { name: t('join.submit') }).click();

    // Kept line visible
    const memberExpiry = memberPage.locator('.group-expiry');
    await expect(memberExpiry).toBeVisible();
    await expect(memberExpiry).toContainText(t('group.expiry.kept'));

    // No control in Members tab
    await memberPage.getByRole('tab', { name: t('group.tabs.members') }).click();
    await expect(memberPage.locator('.keep-group')).toHaveCount(0);

    await guestContext.close();
    await memberContext.close();
  });

  // LG-7: owner flow: sign in (dev), lock, unlock, both themes, 375px and 1366px
  for (const { width, height, desc } of [
    { width: 375, height: 667, desc: '375px' },
    { width: 1366, height: 768, desc: '1366px' },
  ]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`LG-7: owner flow at ${desc} in ${theme} theme`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto('/');

        if (theme === 'dark') {
          const picker = page.getByRole('group', { name: t('theme.label') });
          await picker.getByTitle(t('theme.options.dark')).click();
          await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        }

        // Create group anonymously (owner not signed in)
        const email = `owner-${desc}-${theme}@example.com`;
        await page.getByLabel(t('home.create.groupName')).fill('Holiday Fund');
        await page.getByLabel(t('home.create.yourName')).fill('Alex');
        await page.getByRole('button', { name: t('home.create.submit') }).click();

        await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
        await page.getByRole('button', { name: t('ownerKey.done') }).click();

        // Initially unlocked, deletion date shown
        const expiryLine = page.locator('.group-expiry');
        await expect(expiryLine).toBeVisible();
        await expect(expiryLine).not.toContainText(t('group.expiry.kept'));

        // Go to members tab
        await page.getByRole('tab', { name: t('group.tabs.members') }).click();

        // KeepGroup section visible
        const keepGroup = page.locator('.keep-group');
        await expect(keepGroup).toBeVisible();

        const checkbox = keepGroup.locator('input[type="checkbox"]');
        await expect(checkbox).toBeDisabled();
        await expect(checkbox).not.toBeChecked();
        await expect(keepGroup.getByText(t('keepGroup.signInNote'))).toBeVisible();

        // Click sign in button in KeepGroup
        const signInBtn = keepGroup.getByRole('button', { name: t('keepGroup.signIn') });
        await expect(signInBtn).toBeVisible();
        await signInBtn.click();

        // AccountMenu dev form opens
        await expect(page.getByText(t('account.devTitle'))).toBeVisible();
        await page.getByLabel(t('account.devEmail')).fill(email);
        await page.locator('.account-menu__form').getByRole('button', { name: t('account.devSubmit') }).click();

        // Now signed in: control becomes enabled
        await expect(checkbox).toBeEnabled();
        await expect(keepGroup.getByText(t('keepGroup.signInNote'))).toHaveCount(0);

        // Lock group
        await checkbox.click();
        await expect(checkbox).toBeChecked();

        // Kept line now visible on page
        await expect(expiryLine).toContainText(t('group.expiry.kept'));

        // Unlock group
        await checkbox.click();
        await expect(checkbox).not.toBeChecked();

        // Deletion date returns
        await expect(expiryLine).not.toContainText(t('group.expiry.kept'));
      });
    }
  }
});
