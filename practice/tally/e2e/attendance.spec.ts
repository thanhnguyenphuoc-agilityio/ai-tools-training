import { expect, test } from '@playwright/test';
import { t, vnd } from './i18n';

// attendance_split: the owner takes attendance for an evening session that ends after midnight, and a cost added from
// the session is shared only among the members present. Fake data only (synthetic names).
test('a session that ends after midnight shows +1 day; its cost is shared among the present members', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Weekly sport');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();

  // Three members: Sam and Jamie will be present, Casey will not.
  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  for (const name of ['Sam', 'Jamie', 'Casey']) {
    await page.getByLabel(t('members.addLabel')).fill(name);
    await page.getByRole('button', { name: t('members.add'), exact: true }).click();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }

  // Take attendance: 21:00 to 00:30, Sam and Jamie present (and Alex, the owner, as a member too).
  await page.getByRole('tab', { name: t('group.tabs.sessions') }).click();
  await page.getByRole('button', { name: t('sessions.new') }).first().click();
  await page.getByLabel(t('sessions.start')).fill('21:00');
  await page.getByLabel(t('sessions.end')).fill('00:30');
  for (const name of ['Casey', 'Alex']) {
    await page.getByRole('checkbox', { name }).uncheck();
  }
  await page.getByRole('button', { name: t('common.save') }).click();

  const card = page.locator('.sessions-panel__session');
  // The day is shown in the UI language's date format, never as the stored YYYY-MM-DD.
  await expect(card).not.toContainText(/\d{4}-\d{2}-\d{2}/);
  await expect(card).toContainText(t('sessions.nextDay'));
  await expect(card).toContainText(t('sessions.duration', { hours: 3, minutes: 30 }));
  await expect(card).toContainText(t('sessions.presentCount', { count: 2 }));
  await expect(card).toContainText('Sam');
  await expect(card).toContainText('Jamie');

  // Add a cost from the session: the present members are ticked and the others are not.
  await card.getByRole('button', { name: t('sessions.addCost') }).click();
  await expect(page.getByRole('checkbox', { name: 'Casey' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Sam' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Jamie' })).toBeChecked();
  await page.getByLabel(t('expenseForm.amount'), { exact: true }).fill('300k');
  await page.getByLabel(t('expenseForm.description')).fill('Court hire');
  await page.getByRole('button', { name: t('expenseForm.submit') }).click();

  // Saving the cost returns to the expenses tab. The session then lists the cost with its total.
  const row = page.locator('.expense-list__item').first();
  await expect(row).toContainText(vnd(300_000));
  await page.getByRole('tab', { name: t('group.tabs.sessions') }).click();
  await expect(card).toContainText(t('sessions.total', { amount: vnd(300_000) }));

  // Only the present members share the cost: Casey, who was not present, is settled rather than owing a share.
  await page.getByRole('tab', { name: t('group.tabs.settle') }).click();
  const casey = page.locator('.list__item').filter({ hasText: 'Casey' });
  await expect(casey).toContainText(t('settle.even'));
});
