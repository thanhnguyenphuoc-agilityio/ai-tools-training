import { expect, test } from '@playwright/test';
import { enLocale } from '../src/i18n/locales/en';
import { t, vnd } from './i18n';

// Happy path for one person on one device: create, add people, add an expense,
// pay with VietQR, confirm. Fake data only.
test('create a group, split an expense and settle with VietQR', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Hotpot weekend');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await expect(page.getByLabel(t('home.create.currency'))).toHaveValue('VND');
  await page.getByRole('button', { name: t('home.create.submit') }).click();

  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await expect(page.getByRole('heading', { name: t('ownerKey.title') })).toBeVisible();
  await page.getByRole('button', { name: t('ownerKey.done') }).click();

  // Add Sam by name and give them a (fake) bank account through the API.
  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByLabel(t('members.addLabel')).fill('Sam');
  await page.getByRole('button', { name: t('members.add'), exact: true }).click();
  await expect(page.getByText(t('members.unclaimed'))).toBeVisible();
  const code = page.url().split('/g/')[1];
  const sam = await page.evaluate(async (c) => {
    const g = (await (await fetch(`/api/groups/${c}`)).json()) as { members: { id: string; name: string }[] };
    return g.members.find((m) => m.name === 'Sam')!.id;
  }, code);
  const patched = await page.request.patch(`/api/groups/${code}/members/${sam}`, {
    data: { bankBin: '970436', accountNo: '0123456789', accountName: 'SAM TAYLOR' },
  });
  expect(patched.ok()).toBe(true);

  // Sam paid 300k for both of us.
  await page.reload();
  await page.getByLabel(t('expenseForm.amount')).fill('300k');
  await page.getByLabel(t('expenseForm.paidBy')).selectOption({ label: 'Sam' });
  await page.getByLabel(t('expenseForm.description')).fill('Thai hotpot');
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  await expect(page.getByText(t('expenseList.total', { amount: vnd(300_000) }))).toBeVisible();

  await page.getByRole('tab', { name: t('group.tabs.settle') }).click();
  const owes = t('settle.owes', { amount: vnd(150_000) });
  await expect(page.getByText(owes)).toBeVisible();
  await page.getByRole('button', { name: t('settle.pay') }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(t('qr.codeLabel'))).toBeVisible();
  await expect(dialog.getByText('0123456789')).toBeVisible();
  await dialog.getByRole('button', { name: t('qr.sent') }).click();

  // Still owed until the receiver (or the owner, which we are) confirms.
  await expect(page.getByText(owes)).toBeVisible();
  await page.getByRole('button', { name: t('settle.confirm') }).click();
  await expect(page.getByText(t('settle.allEven'))).toBeVisible();
});

test('rejects a malformed group code on the home page', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.join.label')).fill('abcd-1234');
  await page.getByRole('button', { name: t('home.join.submit') }).click();
  await expect(page.getByText(t('home.join.invalidCode'))).toBeVisible();
});

test('shows English when the browser prefers it, with a USD default', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await page.goto('/');
  const en = enLocale.messages.home.create;
  await expect(page.getByRole('heading', { name: en.title })).toBeVisible();
  await expect(page.getByLabel(en.currency)).toHaveValue(enLocale.defaultCurrency);
  await context.close();
});
