import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { LOCALE, t } from './i18n';

// csv_export: a joined member downloads one CSV with the group's expenses and transfers. Fake data only.
test('a joined member downloads the group as CSV; a guest does not see the button', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();
  const code = page.url().split('/g/')[1];
  const api = `/api/groups/${code}`;

  // Data through the API (same cookies as the page): two expenses, one of them deleted, and one transfer.
  const sam = (await (await page.request.post(`${api}/members`, { data: { name: 'Sam' } })).json()) as { id: string };
  const group = (await (await page.request.get(api)).json()) as { me: { memberId: string } };
  const alex = group.me.memberId;
  const participants = [{ memberId: alex, weight: 1 }, { memberId: sam.id, weight: 1 }];
  const addExpense = async (description: string) => {
    const res = await page.request.post(`${api}/expenses`, {
      data: { payerId: alex, amount: 300_000, description, spentOn: '2026-10-01', splitMode: 'equal', participants },
    });
    expect(res.ok()).toBe(true);
    return ((await res.json()) as { id: string }).id;
  };
  await addExpense('=1+1 Internet');
  const deleted = await addExpense('Deleted expense');
  expect((await page.request.delete(`${api}/expenses/${deleted}`)).ok()).toBe(true);
  expect((await page.request.post(`${api}/transfers`, { data: { toId: sam.id, amount: 50_000 } })).ok()).toBe(true);

  await page.reload();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: t('csvExport.download') }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Shared-house-\d{4}-\d{2}-\d{2}\.csv$/);

  const csv = await readFile(await download.path(), 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const lines = csv.slice(1).trimEnd().split('\r\n');
  expect(lines[0]).toBe(
    [
      ...Object.values(LOCALE.messages.csvExport.columns),
      t('csvExport.shareOf', { name: 'Alex' }),
      t('csvExport.shareOf', { name: 'Sam' }),
    ].join(','),
  );
  expect(lines).toHaveLength(3);
  expect(lines[1]).toBe(`${t('csvExport.types.expense')},2026-10-01,'=1+1 Internet,Alex,,300000,VND,,150000,150000`);
  expect(lines[2]).toMatch(
    new RegExp(`^${t('csvExport.types.transfer')},\\d{4}-\\d{2}-\\d{2},,Alex,Sam,50000,VND,${t('csvExport.status.sent')},,$`),
  );
  expect(csv).not.toContain('Deleted expense');

  // A guest (no cookies) sees the group but not the download button.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`/g/${code}`);
  await expect(guestPage.getByRole('button', { name: t('join.submit'), exact: true })).toBeVisible();
  await expect(guestPage.getByRole('button', { name: t('csvExport.download') })).toHaveCount(0);
  await guest.close();
});
