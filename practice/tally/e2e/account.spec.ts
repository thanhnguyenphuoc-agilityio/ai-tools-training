import { expect, test } from '@playwright/test';
import { t } from './i18n';

test.describe('Account and Dev sign-in (GS-11, GS-15, GS-2)', () => {
  for (const { width, height, desc } of [
    { width: 360, height: 740, desc: '360px' },
    { width: 1366, height: 768, desc: '1366px' },
  ]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`dev sign-in and sign-out at ${desc} in ${theme} theme (GS-11)`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto('/');

        if (theme === 'dark') {
          const picker = page.getByRole('group', { name: t('theme.label') });
          await picker.getByTitle(t('theme.options.dark')).click();
          await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        }

        const signInBtn = page.locator('.account-menu__button');
        await expect(signInBtn).toBeVisible();
        await signInBtn.click();

        await expect(page.getByText(t('account.devTitle'))).toBeVisible();
        await page.getByLabel(t('account.devEmail')).fill('alex@example.com');
        await page
          .locator('.account-menu__form')
          .getByRole('button', { name: t('account.devSubmit') })
          .click();

        const accountMenuBtn = page.getByRole('button', { name: t('account.menuLabel', { name: 'alex' }) });
        await expect(accountMenuBtn).toBeVisible();

        await accountMenuBtn.click();
        const signOutBtn = page.getByRole('menuitem', { name: t('account.signOut') });
        await expect(signOutBtn).toBeVisible();
        await signOutBtn.click();

        await expect(page.locator('.account-menu__button')).toBeVisible();
      });
    }
  }

  test('create group while signed in, second context signed in is owner without key (GS-2 e2e)', async ({
    browser,
  }) => {
    // Context 1: signs in and creates a group
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await page1.goto('/');

    await page1.locator('.account-menu__button').click();
    await page1.getByLabel(t('account.devEmail')).fill('founder@example.com');
    await page1
      .locator('.account-menu__form')
      .getByRole('button', { name: t('account.devSubmit') })
      .click();
    await expect(page1.getByRole('button', { name: t('account.menuLabel', { name: 'founder' }) })).toBeVisible();

    await page1.getByLabel(t('home.create.groupName')).fill('Company Retreat');
    await page1.getByLabel(t('home.create.yourName')).fill('Alex');
    await page1.getByRole('button', { name: t('home.create.submit') }).click();

    await expect(page1).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const groupUrl = page1.url();
    await expect(page1.getByText(t('common.ownerBadge'))).toBeVisible();

    // Context 2: signed in with same email on a new browser context
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto('/');
    await page2.locator('.account-menu__button').click();
    await page2.getByLabel(t('account.devEmail')).fill('founder@example.com');
    await page2
      .locator('.account-menu__form')
      .getByRole('button', { name: t('account.devSubmit') })
      .click();
    await expect(page2.getByRole('button', { name: t('account.menuLabel', { name: 'founder' }) })).toBeVisible();

    await page2.goto(groupUrl);
    // Directly recognized as owner without recovery link
    await expect(page2.getByText(t('common.ownerBadge'))).toBeVisible();

    // Context 3: guest context without sign-in opens group
    const context3 = await browser.newContext();
    const page3 = await context3.newPage();
    await page3.goto(groupUrl);
    // Not owner, can join as guest as before
    await expect(page3.getByText(t('common.ownerBadge'))).toBeHidden();
    await expect(page3.getByPlaceholder(t('join.yourName'))).toBeVisible();
    await page3.getByPlaceholder(t('join.yourName')).fill('Guest Charlie');
    await page3.getByRole('button', { name: t('join.submit') }).click();
    await expect(page3.getByRole('tab', { name: t('group.tabs.expenses') })).toBeVisible();

    await context1.close();
    await context2.close();
    await context3.close();
  });

  test('Link to my account: a guest group is attached after signing in, and the button goes away', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(t('home.create.groupName')).fill('Hiking Weekend');
    await page.getByLabel(t('home.create.yourName')).fill('Alex');
    await page.getByRole('button', { name: t('home.create.submit') }).click();
    await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    await page.getByRole('button', { name: t('ownerKey.done') }).click();

    // A guest has nothing to link
    const link = page.getByRole('button', { name: t('account.link') });
    await expect(link).toBeHidden();

    await page.locator('.account-menu__button').click();
    await page.getByLabel(t('account.devEmail')).fill('alex@example.com');
    await page
      .locator('.account-menu__form')
      .getByRole('button', { name: t('account.devSubmit') })
      .click();

    // Signing in attaches the owner group right away (owner_link_binds_account): no button, owner tools shown
    await page.getByRole('tab', { name: t('group.tabs.members') }).click();
    await expect(page.getByText(t('ownerAccess.tied'))).toBeVisible();
    await expect(link).toBeHidden();

    // A second device that signs in with the same account is the owner without the recovery link
    const other = await page.context().browser()!.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto('/');
    await otherPage.locator('.account-menu__button').click();
    await otherPage.getByLabel(t('account.devEmail')).fill('alex@example.com');
    await otherPage
      .locator('.account-menu__form')
      .getByRole('button', { name: t('account.devSubmit') })
      .click();
    await expect(otherPage.getByRole('button', { name: t('account.menuLabel', { name: 'alex' }) })).toBeVisible();
    await otherPage.goto(page.url());
    await expect(otherPage.getByText(t('common.ownerBadge'))).toBeVisible();
    await other.close();
  });

  test('signed in at 360px, the brand and all three header controls stay on one row', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    await page.locator('.account-menu__button').click();
    await page.getByLabel(t('account.devEmail')).fill('sam@example.com');
    await page
      .locator('.account-menu__form')
      .getByRole('button', { name: t('account.devSubmit') })
      .click();
    const account = page.getByRole('button', { name: t('account.menuLabel', { name: 'sam' }) });
    await expect(account).toBeVisible();

    const brand = await page.locator('.app__brand').boundingBox();
    const boxes = [
      await account.boundingBox(),
      await page.locator('.app__controls [aria-haspopup="listbox"]').boundingBox(),
      await page.getByRole('group', { name: t('theme.label') }).boundingBox(),
    ];
    for (const box of boxes) {
      expect(Math.abs(box!.y + box!.height / 2 - (brand!.y + brand!.height / 2))).toBeLessThan(4);
    }
    expect(boxes[2]!.x + boxes[2]!.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
