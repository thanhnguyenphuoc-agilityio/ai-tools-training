import { expect, test } from '@playwright/test';
import { t, vnd } from './i18n';

// The amount and exact-share fields keep only digits, "." and ",", and the shorthand letters K, M and B
// (shown in upper case) while typing and pasting. Fake data only.
test('filter amount input while typing and filling', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Lunch club');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();

  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByLabel(t('members.addLabel')).fill('Sam');
  await page.getByRole('button', { name: t('members.add'), exact: true }).click();
  await expect(page.getByText('Sam', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: t('group.tabs.expenses') }).click();

  const amount = page.getByLabel(t('expenseForm.amount'), { exact: true });
  const amountHint = page.locator('label.field').filter({ has: amount }).locator('.field__hint');

  // Typed one key at a time: the letters and spaces are dropped, "k" becomes "K" as it is typed.
  await amount.pressSequentially('x150k ');
  await expect(amount).toHaveValue('150K');
  await expect(amountHint).toHaveText(vnd(150_000));

  // Filled as a whole: "t", "r", "a" and "c" are dropped, "b" is kept as the billion shorthand.
  await amount.fill('1,2tr abc 150k');
  await expect(amount).toHaveValue('1,2B150K');

  await amount.fill('200k');
  await expect(amount).toHaveValue('200K');
  await expect(amountHint).toHaveText(vnd(200_000));

  // Exact shares: a currency sign typed after the shorthand is dropped.
  await page.getByLabel(t('expenseForm.exact')).check();
  await page.getByLabel(t('expenseForm.shareOf', { name: 'Alex' })).fill('50k\u20ab');
  await expect(page.getByLabel(t('expenseForm.shareOf', { name: 'Alex' }))).toHaveValue('50K');
});
