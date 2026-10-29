import { expect, test } from '@playwright/test';
import { t } from './i18n';

/** A minimal valid PNG: 8-byte signature, IHDR (1x1, 8-bit RGB), IDAT (one pixel), IEND. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// receipt_photos: a photo is attached with the expense, shown as an icon in the list, and opened in a new tab.
// Fake data only: synthetic names.
test('attach a receipt photo to an expense, see the icon and open the photo', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();

  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('120k');
  await page.getByLabel(t('expenseForm.description')).fill('Groceries');
  // No `capture` attribute: on a phone it opens the camera only, and a receipt saved from a chat could not be picked.
  await expect(page.locator('input[type="file"]')).not.toHaveAttribute('capture');
  await page.setInputFiles('input[type="file"]', { name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();

  const row = page.locator('.expense-list__item');
  await expect(row).toContainText('Groceries');
  const link = row.getByRole('link', { name: t('expenses.receipt.view') });
  await expect(link).toBeVisible();

  const res = await page.request.get((await link.getAttribute('href')) ?? '');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^image\//);
});

test('a failed receipt upload while editing keeps the form open with an error', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();

  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('250k');
  await page.getByLabel(t('expenseForm.description')).fill('Team dinner');
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  const row = page.locator('.expense-list__item');
  await expect(row).toContainText('Team dinner');

  // A file that is not an image makes the browser reject it after the expense edit is saved.
  await row.getByRole('button', { name: t('expenseList.editLabel', { description: 'Team dinner' }) }).click();
  await page.setInputFiles('input[type="file"]', {
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await page.getByRole('button', { name: t('expenseForm.editSubmit') }).click();

  await expect(page.getByText(t('expenses.receipt.failed'))).toBeVisible();
  await expect(page.getByRole('heading', { name: t('expenseForm.editTitle') })).toBeVisible();
  await expect(row.getByRole('link', { name: t('expenses.receipt.view') })).toHaveCount(0);
});
