import { expect, test } from '@playwright/test';
import { t, vnd } from './i18n';

// Exact amounts: the total is typed first, then each person's amount. Saving is blocked until the
// parts add up; a person left empty owes zero and is still listed. Fake data only.
test('split an expense by exact amounts', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Dinner out');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();

  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  for (const name of ['Sam', 'Jamie', 'Christopher']) {
    await page.getByLabel(t('members.addLabel')).fill(name);
    await page.getByRole('button', { name: t('members.add'), exact: true }).click();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
  await page.getByRole('tab', { name: t('group.tabs.expenses') }).click();

  await page.getByLabel(t('expenseForm.exact')).check();
  await expect(page.getByText(t('expenseForm.exactTotalFirst'))).toBeVisible();
  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('250.500');
  await page.getByLabel(t('expenseForm.description')).fill('Restaurant bill');
  await page.getByLabel(t('expenseForm.shareOf', { name: 'Alex' })).fill('120.500');
  await page.getByLabel(t('expenseForm.shareOf', { name: 'Sam' })).fill('100k');
  await expect(page.getByText(t('expenseForm.exactLeft', { amount: vnd(30_000) }))).toBeVisible();

  // Each name stays readable: its text ends before its share field starts (desktop and phone).
  const overlaps = await page.locator('.expense-form__participant:has(.expense-form__share-input)').evaluateAll((rows) =>
    rows.map((row) => {
      const name = document.createRange();
      name.selectNodeContents(row.querySelector('label')!);
      const field = row.querySelector('.expense-form__share-input')!;
      return Math.round(name.getBoundingClientRect().right - field.getBoundingClientRect().left);
    }),
  );
  expect(overlaps).toHaveLength(4);
  expect(overlaps.every((px) => px <= 0), `overlap in px per row: ${overlaps.join(', ')}`).toBe(true);

  // The parts do not add up yet: nothing is saved.
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  await expect(page.getByText(t('expenseForm.exactMismatch'))).toBeVisible();
  await expect(page.getByText(t('expenseList.empty'))).toBeVisible();

  // Jamie's field stays empty: Jamie owes zero.
  await page.getByLabel(t('expenseForm.shareOf', { name: 'Sam' })).fill('130k');
  await expect(page.getByText(t('expenseForm.exactMatches'))).toBeVisible();
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();

  const row = page.locator('.expense-list__item');
  await expect(row).toContainText(t('expenseList.exact'));
  await expect(row).toContainText(`Alex ${vnd(120_500)}`);
  await expect(row).toContainText(`Sam ${vnd(130_000)}`);
  await expect(row).toContainText(`Jamie ${vnd(0)}`);
});
