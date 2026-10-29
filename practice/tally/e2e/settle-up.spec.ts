import { expect, test, type Page } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { buildVietQrPayload, sanitizeTransferMessage } from '../shared/vietqr';
import { VIETQR_MARK } from '../src/qrCard';
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
  // Alex entered the expense, but the row names the payer chosen in "Paid by" (expense_list_wrong_payer).
  const paidBy = (payer: string) => t('expenseList.meta', { payer }).split('{date}')[0];
  const row = page.locator('.expense-list__item');
  await expect(row).toContainText(paidBy('Sam'));
  await expect(row).not.toContainText(paidBy('Alex'));

  await page.getByRole('tab', { name: t('group.tabs.settle') }).click();
  const owes = t('settle.owes', { amount: vnd(150_000) });
  await expect(page.getByText(owes)).toBeVisible();
  await page.getByRole('button', { name: t('settle.pay') }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(t('qr.codeLabel'))).toBeVisible();

  // The VietQR card: bank, account and amount under the code, the bank logo in its centre.
  const frame = dialog.locator('.qr-dialog__frame');
  await expect(frame).toContainText('Vietcombank');
  await expect(frame).toContainText('0123456789');
  await expect(frame).toContainText(vnd(150_000));
  await expect(dialog.getByAltText(t('qr.bankLogo', { bank: 'Vietcombank' }))).toHaveAttribute(
    'src',
    '/bank-logos/970436.png',
  );

  // The code still scans with the logo on top: decode a screenshot of it.
  const png = PNG.sync.read(await dialog.locator('.qr-dialog__code').screenshot());
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded).not.toBeNull();

  const expectedMessage = sanitizeTransferMessage(
    t('qr.messageTemplate', { code: code.slice(0, 4), from: 'Alex', to: 'Sam' }),
  );
  const expectedPayload = buildVietQrPayload({
    bin: '970436',
    accountNo: '0123456789',
    amount: 150_000,
    message: expectedMessage,
  });
  expect(decoded!.data).toBe(expectedPayload);

  await dialog.getByRole('button', { name: t('qr.sent') }).click();

  // The suggestion waits for the receiver instead of offering Pay again.
  await expect(page.getByRole('button', { name: t('settle.pay') })).toHaveCount(0);
  await expect(page.getByText(t('settle.waitingFor', { to: 'Sam' }))).toBeVisible();

  // show_qr_again: the payer can reopen the QR, but cannot record the transfer a second time.
  await page.getByRole('button', { name: t('settle.showQrAgain') }).click();
  const again = page.getByRole('dialog');
  await expect(again.getByRole('heading', { name: t('qr.title', { name: 'Sam', amount: vnd(150_000) }) })).toBeVisible();
  await expect(again.getByRole('button', { name: t('qr.sent') })).toHaveCount(0);
  await again.getByRole('button', { name: t('common.close') }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Still owed until the receiver (or the owner, which we are) confirms.
  await expect(page.getByText(owes)).toBeVisible();
  await page.getByRole('button', { name: t('settle.confirm') }).click();
  await expect(page.getByText(t('settle.allEven'))).toBeVisible();
});

// Alex owes Sam 50k; Sam has a fake bank account. Ends on the expenses tab.
async function owesSam(page: Page) {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Trip');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await page.getByRole('button', { name: t('ownerKey.done') }).click();

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
    data: { bankBin: '970436', accountNo: '0123456789', accountName: 'SAM' },
  });
  expect(patched.ok()).toBe(true);

  await page.reload();
  await page.getByLabel(t('expenseForm.amount')).fill('100k');
  await page.getByLabel(t('expenseForm.paidBy')).selectOption({ label: 'Sam' });
  await page.getByLabel(t('expenseForm.description')).fill('Snack');
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
}

test('settle-up QR falls back to VietQR mark when bank logo returns 404', async ({ page }) => {
  await owesSam(page);

  // The bank logo fails to load.
  await page.route('**/bank-logos/970436.png', (route) => route.fulfill({ status: 404 }));

  await page.getByRole('tab', { name: t('group.tabs.settle') }).click();
  await page.getByRole('button', { name: t('settle.pay') }).click();

  // The centre shows the VietQR mark instead, and stays on it.
  const mark = page.getByRole('dialog').locator('.qr-dialog__mark');
  await expect(mark).toHaveAttribute('src', VIETQR_MARK);
  await expect(mark).toHaveAttribute('alt', t('qr.vietqrLogo'));
  await page.waitForTimeout(300);
  await expect(mark).toHaveAttribute('src', VIETQR_MARK);
});

test('the payment dialog keeps keyboard focus and closes with Escape', async ({ page }) => {
  await owesSam(page);
  await page.getByRole('tab', { name: t('group.tabs.settle') }).click();
  const pay = page.getByRole('button', { name: t('settle.pay') });
  await pay.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: t('common.close') })).toBeFocused();
  for (const key of [...Array(6).fill('Tab'), ...Array(6).fill('Shift+Tab')]) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(pay).toBeFocused();
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
