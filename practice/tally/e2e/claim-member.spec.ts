import { expect, test } from '@playwright/test';
import { t } from './i18n';

// A visitor must confirm "I am <name>" before the claim is sent; the owner can release a wrong claim, and the name
// can then be claimed again. Fake data only.
test('confirm before claiming, release by the owner, claim again', async ({ browser, page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Alex');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await page.getByRole('button', { name: t('ownerKey.done') }).click();
  const groupUrl = page.url();

  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByLabel(t('members.addLabel')).fill('Jamie');
  await page.getByRole('button', { name: t('members.add'), exact: true }).click();
  await expect(page.getByText('Jamie', { exact: true }).first()).toBeVisible();

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(groupUrl);
  const iAmJamie = visitor.getByRole('button', { name: t('join.iAm', { name: 'Jamie' }), exact: true });
  await expect(iAmJamie).toBeVisible();

  // Cancel: nothing is sent, the visitor stays a guest.
  await iAmJamie.click();
  const claimDialog = visitor.getByRole('dialog');
  await expect(claimDialog).toBeVisible();
  await expect(claimDialog.getByText(t('join.confirmClaim', { name: 'Jamie' }))).toBeVisible();
  await claimDialog.getByRole('button', { name: t('common.cancel') }).click();
  await expect(claimDialog).toHaveCount(0);
  await expect(visitor.getByText(t('join.title'), { exact: true })).toBeVisible();

  // Confirm: the visitor joins as Jamie.
  await iAmJamie.click();
  await claimDialog.getByRole('button', { name: t('join.confirmClaimSubmit', { name: 'Jamie' }) }).click();
  await expect(claimDialog).toHaveCount(0);
  await expect(visitor.getByRole('button', { name: t('join.iAm', { name: 'Jamie' }), exact: true })).toHaveCount(0);

  // The owner releases the wrong claim through the dialog.
  await page.reload();
  await page.getByRole('tab', { name: t('group.tabs.members') }).click();
  await page.getByRole('button', { name: t('members.releaseLabel', { name: 'Jamie' }) }).click();
  const releaseDialog = page.getByRole('dialog');
  await expect(releaseDialog).toBeVisible();
  await releaseDialog.getByRole('button', { name: t('members.release') }).click();
  await expect(releaseDialog).toHaveCount(0);
  await expect(page.locator('.toasts')).toContainText(t('toast.memberReleased', { name: 'Jamie' }));
  const jamie = page.locator('.list__item', { hasText: 'Jamie' });
  await expect(jamie).toContainText(t('members.unclaimed'));

  // The visitor's device is a guest again and can claim the name once more.
  await visitor.reload();
  await expect(visitor.getByRole('button', { name: t('join.iAm', { name: 'Jamie' }), exact: true })).toBeVisible();

  await visitorContext.close();
});
