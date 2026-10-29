import { expect, test } from '@playwright/test';
import { t } from './i18n';

// Alex invites Sam by email; Sam signs in with the same email in another browser context and opens the group link.
// Fake data only.
test('invited member is recognised on sign-in: no join panel, Sam is the default payer', async ({ browser, page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Hiking Trip');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();
  const groupUrl = page.url();

  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByLabel(t('members.addLabel')).fill('Sam');
  await page.getByLabel(t('memberInvite.emailLabel')).fill('sam@example.com');
  await page.getByRole('button', { name: t('members.add'), exact: true }).click();
  await expect(page.getByText('Sam', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(t('memberInvite.badge'), { exact: true })).toBeVisible();

  const samContext = await browser.newContext();
  const samPage = await samContext.newPage();
  await samPage.goto('/');
  await samPage.locator('.account-menu__button').click();
  await samPage.getByLabel(t('account.devEmail')).fill('sam@example.com');
  await samPage
    .locator('.account-menu__form')
    .getByRole('button', { name: t('account.devSubmit') })
    .click();
  await expect(samPage.getByRole('button', { name: t('account.menuLabel', { name: 'sam' }) })).toBeVisible();

  await samPage.goto(groupUrl);
  await expect(samPage.getByRole('button', { name: t('join.submit'), exact: true })).toHaveCount(0);
  await expect(samPage.getByText(t('join.title'), { exact: true })).toHaveCount(0);

  // Sam acts as Sam: recording an expense defaults the payer to Sam.
  await samPage.getByRole('tab', { name: t('group.tabs.expenses') }).click();
  await samPage.getByLabel(t('expenseForm.description')).fill('Train tickets');
  await samPage.getByLabel(t('expenseForm.amount'), { exact: true }).fill('120k');
  await expect(samPage.getByLabel(t('expenseForm.paidBy')).locator('option:checked')).toHaveText('Sam');

  await samContext.close();
});
