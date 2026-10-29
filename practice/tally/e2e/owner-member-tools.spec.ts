import { expect, test } from '@playwright/test';
import { t, vnd } from './i18n';

// The owner acts for members who never open the app: edits a receiving account and records a payment for them.
test('owner edits a member account and records a payment for them', async ({ browser, page }) => {
  // Alex creates the group and adds Sam and Jamie by name.
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Weekend trip');
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

  // A closed member row spans the full width, so its buttons sit at the right edge.
  const samRow = page.locator('.list__item', { hasText: 'Sam' }).first();
  const rowBox = await samRow.boundingBox();
  const rowContentBox = await samRow.locator('> div').first().boundingBox();
  expect(rowBox).not.toBeNull();
  expect(rowContentBox).not.toBeNull();
  expect(Math.abs((rowContentBox?.width ?? 0) - (rowBox?.width ?? 0))).toBeLessThan(1);

  // Alex edits Jamie's account from the member list.
  await page.getByRole('button', { name: t('members.editAccountLabel', { name: 'Jamie' }) }).click();
  const jamieCard = page.locator('.card', { hasText: t('members.bankTitleFor', { name: 'Jamie' }) });
  await jamieCard.getByLabel(t('members.bank')).selectOption({ index: 1 });
  await jamieCard.getByLabel(t('members.accountNo')).fill('0123456789');
  await jamieCard.getByLabel(t('members.accountName')).fill('JAMIE');
  await jamieCard.getByRole('button', { name: t('common.save') }).click();

  await expect(page.locator('.toasts')).toContainText(t('toast.bankSavedFor', { name: 'Jamie' }));
  await expect(page.locator('.list__item', { hasText: 'Jamie' })).toContainText('0123456789');

  // Alex adds an expense paid by Jamie and shared by Jamie and Sam.
  await page.getByRole('tab', { name: t('group.tabs.expenses') }).click();
  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('100k');
  await page.getByLabel(t('expenseForm.paidBy')).selectOption({ label: 'Jamie' });
  await page.getByLabel(t('expenseForm.description')).fill('Snacks');
  await page.getByRole('checkbox', { name: 'Alex' }).uncheck();
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  await expect(page.locator('.expense-list__item')).toHaveCount(1);

  // On the Settle tab, Alex records the payment from Sam to Jamie.
  await page.getByRole('tab', { name: t('group.tabs.settle') }).click();
  await page.getByRole('button', { name: t('settle.recordForLabel', { from: 'Sam', to: 'Jamie' }) }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('0123456789')).toBeVisible();
  await expect(dialog.locator('canvas')).toBeVisible();

  await dialog.getByRole('button', { name: t('qr.sentFor', { name: 'Sam' }) }).click();
  await expect(
    page.getByText(t('settle.pendingItem', { from: 'Sam', to: 'Jamie', amount: vnd(50_000) })),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: t('settle.recordForLabel', { from: 'Sam', to: 'Jamie' }) }),
  ).toHaveCount(0);
  await expect(page.getByText(t('settle.waitingFor', { to: 'Jamie' }))).toBeVisible();

  // A second browser context joins as Taylor and sees no owner-only controls.
  const secondContext = await browser.newContext({ locale: 'vi-VN' });
  const secondPage = await secondContext.newPage();
  await secondPage.goto(page.url());
  await secondPage.getByLabel(t('join.yourName')).fill('Taylor');
  await secondPage.getByRole('button', { name: t('join.submit'), exact: true }).click();
  await expect(secondPage.locator('.toasts')).toContainText(t('toast.joined'));

  await secondPage.getByRole('tab', { name: t('group.tabs.members') }).click();
  await expect(secondPage.getByRole('button', { name: t('members.editAccount') })).toHaveCount(0);

  await secondPage.getByRole('tab', { name: t('group.tabs.settle') }).click();
  await expect(
    secondPage.getByText(t('settle.transferLine', { from: 'Sam', to: 'Jamie', amount: vnd(50_000) })),
  ).toBeVisible();
  await expect(
    secondPage.getByRole('button', { name: t('settle.recordForLabel', { from: 'Sam', to: 'Jamie' }) }),
  ).toHaveCount(0);

  await secondContext.close();
});
