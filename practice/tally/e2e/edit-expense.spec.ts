import { expect, test } from '@playwright/test';
import { t, vnd } from './i18n';

// edit_expense: an expense is corrected instead of deleted and added again. The form opens with the stored values,
// the row shows an "edited" marker, and the balances follow the new amount. Fake data only.
test('edit an expense that was entered with the wrong amount', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();

  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByLabel(t('members.addLabel')).fill('Sam');
  await page.getByRole('button', { name: t('members.add'), exact: true }).click();
  await expect(page.getByText('Sam', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: t('group.tabs.expenses') }).click();

  // 2m was meant to be 200k.
  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('2m');
  await page.getByLabel(t('expenseForm.description')).fill('Utilities');
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  const row = page.locator('.expense-list__item');
  await expect(row).toContainText(vnd(2_000_000));
  await expect(row).not.toContainText(t('expenseList.edited'));

  // The edit form opens with the stored values, and cancelling leaves the expense as it was.
  await page.getByRole('button', { name: t('expenseList.editLabel', { description: 'Utilities' }) }).click();
  await expect(page.getByRole('heading', { name: t('expenseForm.editTitle') })).toBeVisible();
  await expect(page.getByLabel(t('expenseForm.amount'), { exact: true })).toHaveValue('2000000');
  await expect(page.getByLabel(t('expenseForm.description'))).toHaveValue('Utilities');
  await page.getByRole('button', { name: t('common.cancel') }).click();
  await expect(row).toContainText(vnd(2_000_000));

  // Correct the amount: the row and the balances follow, and the row says it was edited.
  await page.getByRole('button', { name: t('expenseList.editLabel', { description: 'Utilities' }) }).click();
  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('200k');
  await page.getByRole('button', { name: t('expenseForm.editSubmit') }).click();
  await expect(row).toContainText(vnd(200_000));
  await expect(row).toContainText(t('expenseList.edited'));
  await expect(page.getByText(t('expenseList.total', { amount: vnd(200_000) }))).toBeVisible();
  await expect(page.getByRole('heading', { name: t('expenseForm.title') })).toBeVisible();

  await page.getByRole('tab', { name: t('group.tabs.settle') }).click();
  await expect(page.getByText(t('settle.owes', { amount: vnd(100_000) }))).toBeVisible();
});

test('deleting the expense that is being edited returns the form to adding', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();

  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('120k');
  await page.getByLabel(t('expenseForm.description')).fill('Groceries');
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  await expect(page.locator('.expense-list__item')).toHaveCount(1);

  await page.getByRole('button', { name: t('expenseList.editLabel', { description: 'Groceries' }) }).click();
  await expect(page.getByRole('heading', { name: t('expenseForm.editTitle') })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: t('expenseList.deleteLabel', { description: 'Groceries' }) }).click();
  await expect(page.locator('.expense-list__item')).toHaveCount(0);

  // The form no longer edits an expense that is gone: it adds a new one, with empty fields.
  await expect(page.getByRole('heading', { name: t('expenseForm.title') })).toBeVisible();
  await expect(page.getByLabel(t('expenseForm.amount'), { exact: true })).toHaveValue('');
});
