import { expect, test } from '@playwright/test';
import { t } from './i18n';

// owner_link_binds_account: a group created while signed in is owned by the account; the recovery link of a
// group that an account owns is revoked; opening a free recovery link while signed in attaches the group.
test.describe('owner_link_binds_account (OL-7, OL-8, OL-9)', () => {
  const signIn = async (page: import('@playwright/test').Page, email: string) => {
    await page.locator('.account-menu__button').click();
    await page.getByLabel(t('account.devEmail')).fill(email);
    await page
      .locator('.account-menu__form')
      .getByRole('button', { name: t('account.devSubmit') })
      .click();
    await expect(page.getByRole('button', { name: t('account.menuLabel', { name: email.split('@')[0] }) })).toBeVisible();
  };

  test('OL-7: a group created while signed in shows the account note instead of a recovery link', async ({ page }) => {
    await page.goto('/');
    await signIn(page, `owner-${Date.now()}@example.com`);

    await page.getByLabel(t('home.create.groupName')).fill('Account Trip');
    await page.getByLabel(t('home.create.yourName')).fill('Alex');
    await page.getByRole('button', { name: t('home.create.submit') }).click();

    await expect(page.getByRole('heading', { name: t('ownerAccess.title') })).toBeVisible();
    await expect(page.getByText(t('ownerAccess.tied'))).toBeVisible();
    await expect(page.getByRole('heading', { name: t('ownerKey.title') })).toHaveCount(0);

    await page.getByRole('button', { name: t('ownerKey.done') }).click();
    await expect(page.getByRole('heading', { name: t('ownerAccess.title') })).toHaveCount(0);

    // The members tab of an account-owned group shows the tied line
    await page.getByRole('tab', { name: t('group.tabs.members') }).click();
    await expect(page.getByText(t('ownerAccess.tied'))).toBeVisible();
  });

  test('OL-8: opening a recovery link while signed in attaches the group and shows the toast', async ({ page, browser }) => {
    // 1. A guest creates a group and keeps the recovery link
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto('/');
    await guestPage.getByLabel(t('home.create.groupName')).fill('Guest Trip');
    await guestPage.getByLabel(t('home.create.yourName')).fill('Sam');
    await guestPage.getByRole('button', { name: t('home.create.submit') }).click();

    const linkInput = guestPage.getByLabel(t('ownerKey.linkLabel'));
    await expect(linkInput).toBeVisible();
    const recoveryUrl = await linkInput.inputValue();
    expect(recoveryUrl).toContain('#owner=');
    await guestContext.close();

    // 2. The same link, opened while signed in, attaches the group
    await page.goto('/');
    await signIn(page, `claimant-${Date.now()}@example.com`);
    await page.goto(recoveryUrl);

    await expect(page.locator('.toasts').getByText(t('toast.ownerAttached'))).toBeVisible();
    await page.getByRole('tab', { name: t('group.tabs.members') }).click();
    await expect(page.getByText(t('ownerAccess.tied'))).toBeVisible();
  });

  test('OL-9: a revoked recovery link shows the translated message after the group loads', async ({ browser }) => {
    // 1. A guest creates a group; a signed-in owner attaches it, which revokes the recovery link
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto('/');
    await guestPage.getByLabel(t('home.create.groupName')).fill('Revoked Trip');
    await guestPage.getByLabel(t('home.create.yourName')).fill('Jamie');
    await guestPage.getByRole('button', { name: t('home.create.submit') }).click();
    const recoveryUrl = await guestPage.getByLabel(t('ownerKey.linkLabel')).inputValue();
    await guestContext.close();

    // The signed-in owner opens the link without visiting the group first, so the claim (not the device history) attaches it
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto('/');
    await signIn(ownerPage, `attacher-${Date.now()}@example.com`);
    await ownerPage.goto(recoveryUrl);
    await expect(ownerPage.locator('.toasts').getByText(t('toast.ownerAttached'))).toBeVisible();
    await ownerContext.close();

    // 2. An anonymous visitor opens the old link: the refusal is shown once the group has loaded
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(recoveryUrl);
    await expect(anonPage.getByText(t('group.badRecoveryLink', { message: t('errors.OWNER_KEY_REVOKED') }))).toBeVisible();
    await anonContext.close();
  });
});
