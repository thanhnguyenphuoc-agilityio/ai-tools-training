import { expect, test } from '@playwright/test';
import { t } from './i18n';

// delete_settled_expense: once a transfer has been paid toward an expense it can no longer be edited or deleted, but
// its author or the owner can hide it. Hidden expenses leave the list (until "All expenses") and still count in
// settle up. Fake data only.
test('a paid-toward expense is kept, can be hidden and shown again, and settle up stays even', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();
  const code = page.url().split('/g/')[1];
  const api = `/api/groups/${code}`;

  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByLabel(t('members.addLabel')).fill('Sam');
  await page.getByRole('button', { name: t('members.add'), exact: true }).click();
  await expect(page.getByText('Sam', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: t('group.tabs.expenses') }).click();

  // The expense is paid by Sam, split equally, through the form (the payer is picked in "Paid by").
  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('300k');
  await page.getByLabel(t('expenseForm.description')).fill('Hotpot');
  await page.getByLabel(t('expenseForm.paidBy')).selectOption({ label: 'Sam' });
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  const row = page.locator('.expense-list__item', { hasText: 'Hotpot' });
  await expect(row).toBeVisible();

  // Alex pays Sam 150,000 and the owner confirms it, through the API with the page's cookies.
  const group = (await (await page.request.get(api)).json()) as { me: { memberId: string }; members: { id: string; name: string }[] };
  const alex = group.me.memberId;
  const sam = group.members.find((m) => m.name === 'Sam')!.id;
  const sent = await page.request.post(`${api}/transfers`, { data: { fromId: alex, toId: sam, amount: 150_000 } });
  expect(sent.ok()).toBe(true);
  const transferId = ((await sent.json()) as { id: string }).id;
  expect((await page.request.post(`${api}/transfers/${transferId}/confirm`)).ok()).toBe(true);
  await page.reload();
  await page.getByRole('tab', { name: t('group.tabs.expenses') }).click();

  // Locked: no edit and no delete; the row says why. Hide is offered to the owner.
  await expect(row).toContainText(t('expenseList.paidTowardLocked'));
  await expect(row.getByRole('button', { name: t('expenseList.editLabel', { description: 'Hotpot' }) })).toHaveCount(0);
  await expect(row.getByRole('button', { name: t('expenseList.deleteLabel', { description: 'Hotpot' }) })).toHaveCount(0);

  // Hide: the row leaves the visible list, and the toast says so.
  await row.getByRole('button', { name: t('expenseList.hideLabel', { description: 'Hotpot' }) }).click();
  await expect(page.getByText(t('toast.expenseHidden'))).toBeVisible();
  await expect(page.locator('.expense-list__item', { hasText: 'Hotpot' })).toHaveCount(0);

  // All expenses: the hidden row comes back with its badge.
  await page.getByRole('button', { name: t('expenseList.showAll') }).click();
  const shown = page.locator('.expense-list__item', { hasText: 'Hotpot' });
  await expect(shown.getByText(t('expenseList.hiddenBadge'))).toBeVisible();

  // Show again, then back to the visible list: the row is visible.
  await shown.getByRole('button', { name: t('expenseList.unhideLabel', { description: 'Hotpot' }) }).click();
  await expect(page.getByText(t('toast.expenseUnhidden'))).toBeVisible();
  await page.getByRole('button', { name: t('expenseList.showVisible') }).click();
  await expect(page.locator('.expense-list__item', { hasText: 'Hotpot' })).toBeVisible();

  // Hiding left the balances alone: settle up still shows everyone even.
  await page.getByRole('tab', { name: t('group.tabs.settle') }).click();
  await expect(page.getByText(t('settle.allEven'))).toBeVisible();
});
