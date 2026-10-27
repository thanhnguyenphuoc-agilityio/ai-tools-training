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
  // A click on the backdrop still closes the dialog.
  await page.getByRole('button', { name: t('members.removeLabel', { name: 'Sam' }) }).click();
  await expect(removeDialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(removeDialog).toHaveCount(0);

  const removeSam = page.getByRole('button', { name: t('members.removeLabel', { name: 'Sam' }) });
  await removeSam.click();
  for (const key of [...Array(5).fill('Tab'), ...Array(5).fill('Shift+Tab')]) {
    await page.keyboard.press(key);
    expect(await removeDialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(removeDialog).toHaveCount(0);
  await expect(removeSam).toBeFocused();

  // Busy rule: while the removal is in flight, Escape does not close the dialog.
  await page.route('**/members/*/remove', () => {});
  await removeSam.click();
  await removeDialog.getByRole('button', { name: t('members.remove') }).click();
  await page.keyboard.press('Escape');
  await expect(removeDialog).toBeVisible();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.reload();
  await page.getByRole('tab', { name: t('group.tabs.members') }).click();

  await page.getByRole('button', { name: t('members.removeLabel', { name: 'Jamie' }) }).click();
  await expect(removeDialog).toBeVisible();
  const reasonInput = removeDialog.getByLabel(t('members.removeReason'));
  await expect(reasonInput).toBeFocused();
  await reasonInput.fill('Moved out');
  // Selecting the text with the mouse and releasing it over the backdrop keeps the dialog and the typed reason.
  const box = (await reasonInput.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await expect(removeDialog).toBeVisible();
  await expect(reasonInput).toHaveValue('Moved out');
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

// The member picked as payer is removed on another device while the expense form is open.
test('the expense form moves off a payer who has been removed', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();
  const api = `/api/groups/${page.url().split('/g/')[1]}`;
  const sam = (await (await page.request.post(`${api}/members`, { data: { name: 'Sam' } })).json()) as { id: string };
  await page.reload();

  const paidBy = page.getByLabel(t('expenseForm.paidBy'));
  await paidBy.selectOption({ label: 'Sam' });
  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('90k');
  await page.getByLabel(t('expenseForm.description')).fill('Utilities');
  expect((await page.request.post(`${api}/members/${sam.id}/remove`, { data: {} })).ok()).toBe(true);

  // The first save tells the user why it failed and refreshes the group; Sam is no longer offered.
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  await expect(page.getByText(t('errors.PAYER_NOT_IN_GROUP'))).toBeVisible();
  await expect(paidBy.locator('option', { hasText: 'Sam' })).toHaveCount(0);
  await expect(paidBy.locator('option:checked')).toHaveText('Alex');

  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  await expect(page.locator('.expense-list__item')).toHaveCount(1);
  await expect(page.locator('.expense-list__item')).toContainText('Alex');
});
