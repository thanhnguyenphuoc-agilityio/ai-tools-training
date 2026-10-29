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

async function createGroupAsAlex(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Weekend Trip');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  const groupUrl = page.url();
  await page.getByRole('button', { name: t('ownerKey.done') }).click();
  return groupUrl;
}

test.describe('Join as account (join_as_account)', () => {
  test('My name is saved, the join field is prefilled, and the join succeeds', async ({ browser }) => {
    const contextAlex = await browser.newContext();
    const pageAlex = await contextAlex.newPage();
    const groupUrl = await createGroupAsAlex(pageAlex);

    const contextSam = await browser.newContext();
    const pageSam = await contextSam.newPage();
    const samName = await devSignIn(pageSam, uniqueEmail('sam'));
    await setAccountName(pageSam, samName, 'Sam Kim');

    await pageSam.goto(groupUrl);
    const joinInput = pageSam.getByLabel(t('join.yourName'));
    await expect(joinInput).toHaveValue('Sam Kim');
    await pageSam.getByRole('button', { name: t('join.submit') }).click();
    await expect(pageSam.getByRole('tab', { name: t('group.tabs.expenses') })).toBeVisible();

    await pageSam.getByRole('tab', { name: t('group.tabs.members') }).click();
    await expect(pageSam.getByText('Sam Kim', { exact: true }).first()).toBeVisible();

    await contextSam.close();
    await contextAlex.close();
  });

  test('a taken prefilled name shows DUPLICATE_NAME, then the edited name joins', async ({ browser }) => {
    const contextAlex = await browser.newContext();
    const pageAlex = await contextAlex.newPage();
    const groupUrl = await createGroupAsAlex(pageAlex);

    const contextSam = await browser.newContext();
    const pageSam = await contextSam.newPage();
    const samName = await devSignIn(pageSam, uniqueEmail('sam'));
    await setAccountName(pageSam, samName, 'Alex');

    await pageSam.goto(groupUrl);
    const joinInput = pageSam.getByLabel(t('join.yourName'));
    await expect(joinInput).toHaveValue('Alex');
    await pageSam.getByRole('button', { name: t('join.submit') }).click();
    await expect(pageSam.locator('.text--error')).toHaveText(t('errors.DUPLICATE_NAME'));

    await expect(joinInput).toBeEditable();
    await joinInput.fill('Sam Joined');
    await pageSam.getByRole('button', { name: t('join.submit') }).click();
    await expect(pageSam.getByRole('tab', { name: t('group.tabs.expenses') })).toBeVisible();

    await contextSam.close();
    await contextAlex.close();
  });

  test('Escape closes the My name dialog and focus returns to the account menu', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'keyboard check runs on desktop only');
    const name = await devSignIn(page, uniqueEmail('kim'));
    const menuBtn = page.getByRole('button', { name: t('account.menuLabel', { name }) });
    await menuBtn.click();
    await page.getByRole('menuitem', { name: t('account.name') }).click();

    const dialog = page.getByRole('dialog', { name: t('accountName.title') });
    await expect(dialog.getByLabel(t('accountName.label'))).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(menuBtn).toBeFocused();
  });
});
