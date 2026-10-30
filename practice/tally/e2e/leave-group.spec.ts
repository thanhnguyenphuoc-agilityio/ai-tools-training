import { expect, test } from '@playwright/test';
import { t } from './i18n';

// A member leaves on their own; the owner can delete the group only when alone. Fake data only.
test('a member leaves the group, cancel keeps them, and the owner deletes the group when alone', async ({
  browser,
  page,
}) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();
  const groupUrl = page.url();

  // Sam joins in a second context.
  const samContext = await browser.newContext();
  const sam = await samContext.newPage();
  await sam.goto(groupUrl);
  await sam.getByLabel(t('join.yourName')).fill('Sam');
  await sam.getByRole('button', { name: t('join.submit') }).click();
  await expect(sam.getByRole('tab', { name: t('group.tabs.members') })).toBeVisible();

  // The owner sees no leave action; Delete is hidden while Sam is present.
  await page.reload();
  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await expect(page.getByRole('button', { name: t('leaveGroup.action'), exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: t('deleteGroup.action'), exact: true })).toHaveCount(0);

  // Sam: cancel keeps the membership.
  await sam.getByRole('tab', { name: t('group.tabs.members') }).click();
  await sam.getByRole('button', { name: t('leaveGroup.action'), exact: true }).click();
  const leaveDialog = sam.getByRole('dialog');
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole('button', { name: t('common.cancel') }).click();
  await expect(leaveDialog).toHaveCount(0);
  await expect(sam.getByRole('button', { name: t('leaveGroup.action'), exact: true })).toBeVisible();

  // Sam: confirm. The toast shows, and the device becomes a guest who sees the join panel.
  await sam.getByRole('button', { name: t('leaveGroup.action'), exact: true }).click();
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole('button', { name: t('leaveGroup.confirm'), exact: true }).click();
  await expect(leaveDialog).toHaveCount(0);
  await expect(sam.locator('.toasts')).toContainText(t('toast.leftGroup'));
  await expect(sam.getByText(t('join.title'), { exact: true })).toBeVisible();

  // The owner sees Sam in the removed list as "left the group".
  await page.reload();
  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  const samRow = page.locator('.list__item', { hasText: 'Sam' });
  await expect(samRow).toContainText(t('members.left'));

  // Now the owner is alone (Sam is removed): Delete appears, and confirming goes home.
  await expect(page.getByRole('button', { name: t('deleteGroup.action'), exact: true })).toBeVisible();
  await page.getByRole('button', { name: t('deleteGroup.action'), exact: true }).click();
  const deleteDialog = page.getByRole('dialog');
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button', { name: t('deleteGroup.confirm'), exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.toasts')).toContainText(t('toast.groupDeleted'));

  // The old link answers "group not found".
  await page.goto(groupUrl);
  await expect(page.getByText(t('group.notFound'), { exact: true })).toBeVisible();

  await samContext.close();
});

// Leaving is refused while Sam still owes money: the dialog shows the leave wording, not the remove wording.
test('leaving with a balance shows the settle-up message', async ({ browser, page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();
  const groupUrl = page.url();

  const samContext = await browser.newContext();
  const sam = await samContext.newPage();
  await sam.goto(groupUrl);
  await sam.getByLabel(t('join.yourName')).fill('Sam');
  await sam.getByRole('button', { name: t('join.submit') }).click();
  await expect(sam.getByRole('tab', { name: t('group.tabs.members') })).toBeVisible();

  // Alex paid for both, so Sam owes money.
  await page.getByRole('tab', { name: t('group.tabs.expenses') }).click();
  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('90k');
  await page.getByLabel(t('expenseForm.description')).fill('Utilities');
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();
  await expect(page.locator('.expense-list__item')).toHaveCount(1);

  await sam.reload();
  await sam.getByRole('tab', { name: t('group.tabs.members') }).click();
  await sam.getByRole('button', { name: t('leaveGroup.action'), exact: true }).click();
  const leaveDialog = sam.getByRole('dialog');
  await leaveDialog.getByRole('button', { name: t('leaveGroup.confirm'), exact: true }).click();
  await expect(leaveDialog.getByText(t('leaveGroup.hasBalance'))).toBeVisible();
  await expect(leaveDialog.getByText(t('errors.MEMBER_HAS_BALANCE'))).toHaveCount(0);

  await samContext.close();
});
