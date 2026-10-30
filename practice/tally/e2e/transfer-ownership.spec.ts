import { expect, test, type Browser, type Page } from '@playwright/test';
import { t } from './i18n';

// Dev sign-in with a synthetic account. Each browser context is its own device, so Alex and Sam are separate.
async function signInAs(page: Page, email: string) {
  await page.goto('/');
  await page.locator('.account-menu__button').click();
  await page.getByLabel(t('account.devEmail')).fill(email);
  await page
    .locator('.account-menu__form')
    .getByRole('button', { name: t('account.devSubmit') })
    .click();
  await expect(page.getByRole('button', { name: t('account.menuLabel', { name: email.split('@')[0] }) })).toBeVisible();
}

test.describe('transfer_ownership (TO-E2E)', () => {
  test('Alex keeps the group, hands it to Sam; the kept state ends and Alex loses owner tools', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const stamp = Date.now();
    const samName = 'Sam';
    const alexContext = await browser.newContext({ locale: 'vi-VN' });
    const samContext = await browser.newContext({ locale: 'vi-VN' });
    const alex = await alexContext.newPage();
    const sam = await samContext.newPage();

    // Alex creates a group while signed in; owner access is tied to the account, so no recovery link is shown.
    await signInAs(alex, `alex-${stamp}@example.com`);
    await alex.getByLabel(t('home.create.groupName')).fill('Transfer Trip');
    await alex.getByLabel(t('home.create.useDifferentName')).check();
    await alex.getByLabel(t('home.create.yourName')).fill('Alex');
    await alex.getByRole('button', { name: t('home.create.submit') }).click();
    await expect(alex.locator('.group-page__head').getByText(t('common.ownerBadge'))).toBeVisible();
    const groupUrl = alex.url();

    // Sam signs in on another device and joins the group by name, as a signed-in member.
    await signInAs(sam, `sam-${stamp}@example.com`);
    await sam.goto(groupUrl);
    await sam.getByLabel(t('join.yourName')).fill(samName);
    await sam.getByRole('button', { name: t('join.submit'), exact: true }).click();
    await expect(sam.getByLabel(t('join.yourName'))).toHaveCount(0);

    // Alex keeps the group on the Members tab.
    await alex.reload();
    await alex.getByRole('tab', { name: t('group.tabs.members') }).click();
    const keepCheckbox = alex.locator('.keep-group input[type="checkbox"]');
    await keepCheckbox.click();
    await expect(keepCheckbox).toBeChecked();

    // Alex opens Make owner: the dialog says the hand-over stops the keeping; Alex confirms.
    await alex.getByRole('button', { name: t('ownerTransfer.actionLabel', { name: samName }) }).click();
    const dialog = alex.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(t('ownerTransfer.stopsKeeping'))).toBeVisible();
    await dialog.getByRole('button', { name: t('ownerTransfer.confirm') }).click();
    await expect(dialog).toHaveCount(0);

    // Sam now has owner tools (the group settings form) on the Members tab.
    await sam.reload();
    await sam.getByRole('tab', { name: t('group.tabs.members') }).click();
    await expect(sam.getByText(t('members.settingsTitle'))).toBeVisible();
    await expect(
      sam
        .locator('.badge')
        .filter({ hasText: t('common.ownerBadge') })
        .first(),
    ).toBeVisible();

    // The hand-over stopped the keeping: Sam sees the deletion date line and not the kept line.
    const expiry = sam.locator('.group-expiry');
    await expect(expiry).toContainText(t('group.expiry.date', { date: '' }).trim());
    await expect(expiry).not.toContainText(t('group.expiry.kept'));

    // Alex no longer has owner tools.
    await alex.reload();
    await alex.getByRole('tab', { name: t('group.tabs.members') }).click();
    await expect(alex.getByText(t('members.settingsTitle'))).toHaveCount(0);

    await alexContext.close();
    await samContext.close();
  });

  test('Escape closes the Make owner dialog without handing over', async ({ browser }: { browser: Browser }) => {
    const stamp = Date.now();
    const alexContext = await browser.newContext({ locale: 'vi-VN' });
    const samContext = await browser.newContext({ locale: 'vi-VN' });
    const alex = await alexContext.newPage();
    const sam = await samContext.newPage();

    await signInAs(alex, `alex-esc-${stamp}@example.com`);
    await alex.getByLabel(t('home.create.groupName')).fill('Escape Trip');
    await alex.getByLabel(t('home.create.useDifferentName')).check();
    await alex.getByLabel(t('home.create.yourName')).fill('Alex');
    await alex.getByRole('button', { name: t('home.create.submit') }).click();
    await expect(alex.locator('.group-page__head').getByText(t('common.ownerBadge'))).toBeVisible();
    const groupUrl = alex.url();

    await signInAs(sam, `sam-esc-${stamp}@example.com`);
    await sam.goto(groupUrl);
    await sam.getByLabel(t('join.yourName')).fill('Sam');
    await sam.getByRole('button', { name: t('join.submit'), exact: true }).click();
    await expect(sam.getByLabel(t('join.yourName'))).toHaveCount(0);

    await alex.reload();
    await alex.getByRole('tab', { name: t('group.tabs.members') }).click();
    await alex.getByRole('button', { name: t('ownerTransfer.actionLabel', { name: 'Sam' }) }).click();
    const dialog = alex.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await alex.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Nothing was handed over: Alex still has owner tools.
    await expect(alex.getByText(t('members.settingsTitle'))).toBeVisible();

    await alexContext.close();
    await samContext.close();
  });
});
