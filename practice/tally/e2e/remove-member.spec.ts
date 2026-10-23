import { expect, test } from '@playwright/test';
import { t } from './i18n';

// The owner removes a member who has settled up; a member who still owes money stays. Fake data only.
test('remove a member who has settled up', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();

  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  for (const name of ['Sam', 'Jamie']) {
    await page.getByLabel(t('members.addLabel')).fill(name);
    await page.getByRole('button', { name: t('members.add'), exact: true }).click();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }

  // Alex paid for Alex and Sam: Sam owes money, Jamie owes nothing.
  await page.getByRole('tab', { name: t('group.tabs.expenses') }).click();
  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('90k');
  await page.getByLabel(t('expenseForm.description')).fill('Utilities');
  await page.getByRole('checkbox', { name: 'Jamie' }).uncheck();
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  await expect(page.locator('.expense-list__item')).toHaveCount(1);

  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByRole('button', { name: t('members.removeLabel', { name: 'Sam' }) }).click();
  const removeDialog = page.getByRole('dialog');
  await expect(removeDialog).toBeVisible();
  await removeDialog.getByRole('button', { name: t('members.remove') }).click();
  await expect(removeDialog.getByText(t('errors.MEMBER_HAS_BALANCE'))).toBeVisible();
  await removeDialog.getByRole('button', { name: t('common.cancel') }).click();
  await expect(removeDialog).toHaveCount(0);

  await page.getByRole('button', { name: t('members.removeLabel', { name: 'Jamie' }) }).click();
  await expect(removeDialog).toBeVisible();
  await removeDialog.getByLabel(t('members.removeReason')).fill('Moved out');
  await removeDialog.getByRole('button', { name: t('members.remove') }).click();
  await expect(removeDialog).toHaveCount(0);
  const jamie = page.locator('.list__item', { hasText: 'Jamie' });
  await expect(jamie).toContainText(t('members.removed'));
  await expect(jamie).toContainText('Moved out');
  await expect(page.getByRole('button', { name: t('members.removeLabel', { name: 'Jamie' }) })).toHaveCount(0);
  await expect(page.getByRole('button', { name: t('members.removeLabel', { name: 'Sam' }) })).toBeVisible();

  // Jamie can no longer be picked for a new expense.
  await page.getByRole('tab', { name: t('group.tabs.expenses') }).click();
  await expect(page.getByRole('checkbox', { name: 'Sam' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Jamie' })).toHaveCount(0);
  await expect(page.getByLabel(t('expenseForm.paidBy')).locator('option', { hasText: 'Jamie' })).toHaveCount(0);
});
