import { expect, test } from '@playwright/test';
import { t } from './i18n';

// Alex creates a group; Sam joins through the link in a second context. Sam types a description; Alex adds an
// expense. Sam sees the new row without reloading, his typed text is kept, and no toast shows on his page.
// Fake data only.
test('an open group page shows another member’s new expense without a reload, and keeps typed text', async ({
  browser,
  page,
}) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Live Trip');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();
  const groupUrl = page.url();

  const samContext = await browser.newContext();
  const samPage = await samContext.newPage();
  await samPage.goto(groupUrl);
  await samPage.getByPlaceholder(t('join.yourName')).fill('Sam');
  await samPage.getByRole('button', { name: t('join.submit'), exact: true }).click();
  await expect(samPage.getByRole('button', { name: t('join.submit'), exact: true })).toHaveCount(0);
  // Let the join message leave the screen, so the toast check below only sees what the live update shows.
  await expect(samPage.locator('.toasts__item')).toHaveCount(0, { timeout: 10_000 });

  // Sam starts typing a description before Alex's change arrives.
  await samPage.getByRole('tab', { name: t('group.tabs.expenses') }).click();
  await samPage.getByLabel(t('expenseForm.description')).fill('Train tickets');

  // Alex adds an expense in the first context.
  await page.getByRole('tab', { name: t('group.tabs.expenses') }).click();
  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('2m');
  await page.getByLabel(t('expenseForm.description')).fill('Lunch by the lake');
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  await expect(page.getByText('Lunch by the lake', { exact: true }).first()).toBeVisible();

  // Sam sees the new row without reloading the page.
  await expect(samPage.getByText('Lunch by the lake', { exact: true }).first()).toBeVisible({ timeout: 10_000 });

  // The text Sam typed is still there, and no toast was shown on his page for the change.
  await expect(samPage.getByLabel(t('expenseForm.description'))).toHaveValue('Train tickets');
  await expect(samPage.locator('.toasts__item')).toHaveCount(0);

  await samContext.close();
});
