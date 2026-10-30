import { expect, test } from '@playwright/test';
import { t } from './i18n';

/** A unique synthetic email per call: the dev database persists across tests, and a saved account name is kept. */
function uniqueEmail(base: string): string {
  return `${base}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
}

/** Signs in as a development user and returns the name the account shows (the email local part). */
async function devSignIn(page: import('@playwright/test').Page, email: string): Promise<string> {
  const name = email.split('@')[0];
  await page.goto('/');
  await page.locator('.account-menu__button').click();
  await page.getByLabel(t('account.devEmail')).fill(email);
  await page
    .locator('.account-menu__form')
    .getByRole('button', { name: t('account.devSubmit') })
    .click();
  await expect(page.getByRole('button', { name: t('account.menuLabel', { name }) })).toBeVisible();
  return name;
}

async function setAccountName(page: import('@playwright/test').Page, name: string, accountName: string) {
  await page.getByRole('button', { name: t('account.menuLabel', { name }) }).click();
  await page.getByRole('menuitem', { name: t('account.name') }).click();
  const dialog = page.getByRole('dialog', { name: t('accountName.title') });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(t('accountName.label')).fill(accountName);
  await dialog.getByRole('button', { name: t('accountName.save') }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.toasts')).toContainText(t('accountName.saved'));
}

test.describe('Create group with the account name (create_group_account_name)', () => {
  test('(a) signed in: the name field shows the account name, read-only and unchecked; the owner is that name', async ({
    page,
  }) => {
    const name = await devSignIn(page, uniqueEmail('sam'));
    await setAccountName(page, name, 'Sam Kim');
    await page.goto('/');

    const yourName = page.getByLabel(t('home.create.yourName'));
    await expect(yourName).toHaveValue('Sam Kim');
    await expect(yourName).toHaveAttribute('readonly');
    await expect(page.getByLabel(t('home.create.useDifferentName'))).not.toBeChecked();

    await page.getByLabel(t('home.create.groupName')).fill('Weekend Trip');
    await page.getByRole('button', { name: t('home.create.submit') }).click();
    await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    await page.getByRole('button', { name: t('ownerKey.done') }).click();

    await page.getByRole('tab', { name: t('group.tabs.members') }).click();
    await expect(page.getByText('Sam Kim', { exact: true }).first()).toBeVisible();
  });

  test('(b) checking "Use a different name" focuses the field; the typed name is the owner; the account name stays', async ({
    page,
  }) => {
    const name = await devSignIn(page, uniqueEmail('sam'));
    await setAccountName(page, name, 'Sam Kim');
    await page.goto('/');

    await page.getByLabel(t('home.create.useDifferentName')).check();
    const yourName = page.getByLabel(t('home.create.yourName'));
    await expect(yourName).toBeEditable();
    await expect(yourName).toBeFocused();

    await yourName.fill('Sam');
    await page.getByLabel(t('home.create.groupName')).fill('Weekend Trip');
    await page.getByRole('button', { name: t('home.create.submit') }).click();
    await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    await page.getByRole('button', { name: t('ownerKey.done') }).click();

    await page.getByRole('tab', { name: t('group.tabs.members') }).click();
    await expect(page.getByText('Sam', { exact: true }).first()).toBeVisible();

    // The chosen name does not change the account name shown in the account menu
    await expect(page.getByRole('button', { name: t('account.menuLabel', { name: 'Sam Kim' }) })).toBeVisible();
  });

  test('(c) checking then unchecking restores the account name', async ({ page }) => {
    const name = await devSignIn(page, uniqueEmail('sam'));
    await setAccountName(page, name, 'Sam Kim');
    await page.goto('/');

    const checkbox = page.getByLabel(t('home.create.useDifferentName'));
    await checkbox.check();
    await page.getByLabel(t('home.create.yourName')).fill('Sam');
    await checkbox.uncheck();

    const yourName = page.getByLabel(t('home.create.yourName'));
    await expect(yourName).toHaveValue('Sam Kim');
    await expect(yourName).toHaveAttribute('readonly');
  });

  test('(d) signed out: the name field is empty and editable, and there is no checkbox', async ({ page }) => {
    await page.goto('/');

    const yourName = page.getByLabel(t('home.create.yourName'));
    await expect(yourName).toHaveValue('');
    await expect(yourName).toBeEditable();
    await expect(page.getByRole('checkbox', { name: t('home.create.useDifferentName') })).toHaveCount(0);
  });
});
