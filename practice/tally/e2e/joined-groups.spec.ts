import { expect, test } from '@playwright/test';
import { t } from './i18n';

test.describe('Joined groups list (JG-7, JG-8)', () => {
  test('JG-7: second browser context dev sign-in shows groups and acts as member', async ({ browser }) => {
    const testId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const email = `user_${testId}@example.com`;
    const groupName = `Trip_${testId}`;

    // Context 1: signs in, creates group, returns to home page
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await page1.goto('/');

    await page1.locator('.account-menu__button').click();
    await page1.getByLabel(t('account.devEmail')).fill(email);
    await page1.locator('.account-menu__form').getByRole('button', { name: t('account.devSubmit') }).click();
    await expect(page1.getByRole('button', { name: t('account.menuLabel', { name: email.split('@')[0] }) })).toBeVisible();

    await page1.getByLabel(t('home.create.groupName')).fill(groupName);
    await page1.getByLabel(t('home.create.yourName')).fill('Alex');
    await page1.getByRole('button', { name: t('home.create.submit') }).click();

    await expect(page1).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    await expect(page1.getByText(t('common.ownerBadge'))).toBeVisible();

    // Context 2: separate browser context (second device)
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto('/');

    // Signed out: account groups card is hidden
    await expect(page2.getByText(t('home.accountGroups.title'))).toBeHidden();

    // Dev sign-in as same email
    await page2.locator('.account-menu__button').click();
    await page2.getByLabel(t('account.devEmail')).fill(email);
    await page2.locator('.account-menu__form').getByRole('button', { name: t('account.devSubmit') }).click();
    await expect(page2.getByRole('button', { name: t('account.menuLabel', { name: email.split('@')[0] }) })).toBeVisible();

    // Account groups card is now visible with the group and owner badge
    await expect(page2.getByText(t('home.accountGroups.title'))).toBeVisible();
    const accountCard = page2.locator('.home-page__account-groups');
    const groupLink = accountCard.getByRole('link', { name: new RegExp(groupName) });
    await expect(groupLink).toBeVisible();

    // Click group link: opens group page and user acts as owner member without claiming again
    await groupLink.click();
    await expect(page2).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    await expect(page2.getByText(t('common.ownerBadge'))).toBeVisible();

    await context1.close();
    await context2.close();
  });

  for (const { width, height, desc } of [
    { width: 375, height: 667, desc: '375px' },
    { width: 1366, height: 768, desc: '1366px' },
  ]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`JG-8: group in both lists shown once; signed out shows device list at ${desc} in ${theme} theme`, async ({
        page,
      }) => {
        const testId = `${width}_${theme}_${Math.random().toString(36).slice(2, 7)}`;
        const email = `user_${testId}@example.com`;
        const groupName = `Group_${testId}`;

        await page.setViewportSize({ width, height });
        await page.goto('/');

        if (theme === 'dark') {
          const picker = page.getByRole('group', { name: t('theme.label') });
          await picker.getByTitle(t('theme.options.dark')).click();
          await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        }

        // Sign in
        await page.locator('.account-menu__button').click();
        await page.getByLabel(t('account.devEmail')).fill(email);
        await page.locator('.account-menu__form').getByRole('button', { name: t('account.devSubmit') }).click();
        const accountMenuBtn = page.getByRole('button', {
          name: t('account.menuLabel', { name: email.split('@')[0] }),
        });
        await expect(accountMenuBtn).toBeVisible();

        // Create a group
        await page.getByLabel(t('home.create.groupName')).fill(groupName);
        await page.getByLabel(t('home.create.yourName')).fill('Owner');
        await page.getByRole('button', { name: t('home.create.submit') }).click();

        await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
        await expect(page.locator('.group-page__head').getByText(t('common.ownerBadge'))).toBeVisible();

        // Navigate back to home page
        await page.locator('.app__brand').click();
        await expect(page).toHaveURL(/\/$/);

        // Account groups list shows group
        await expect(page.getByText(t('home.accountGroups.title'))).toBeVisible();
        await expect(page.locator('.home-page__account-groups')).toContainText(groupName);
        await expect(page.getByText(groupName)).toHaveCount(1);
        // Device history card is hidden because the only history group is already in account groups
        await expect(page.getByText(t('home.history.title'))).toBeHidden();

        // Sign out
        await accountMenuBtn.click();
        const signOutBtn = page.getByRole('menuitem', { name: t('account.signOut') });
        await expect(signOutBtn).toBeVisible();
        await signOutBtn.click();

        // Now signed out: account groups card is hidden, device history card is visible with the group
        await expect(page.getByText(t('home.accountGroups.title'))).toBeHidden();
        await expect(page.getByText(t('home.history.title'))).toBeVisible();
        await expect(page.locator('.card', { hasText: t('home.history.title') })).toContainText(groupName);
        await expect(page.getByText(groupName)).toHaveCount(1);
      });
    }
  }
});
