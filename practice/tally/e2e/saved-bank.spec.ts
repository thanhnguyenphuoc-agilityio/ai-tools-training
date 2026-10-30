import { expect, test } from '@playwright/test';
import { t } from './i18n';

test.describe('Saved bank details (SB-6, SB-7, SB-9)', () => {
  test('SB-7 UI: signed out person has no My bank details menu item', async ({ page }) => {
    await page.goto('/');

    const signInBtn = page.locator('.account-menu__button');
    await expect(signInBtn).toBeVisible();
    await signInBtn.click();

    // Dev login form is visible, but not the bank details menu item
    await expect(page.getByText(t('account.devTitle'))).toBeVisible();
    await expect(page.getByRole('menuitem', { name: t('account.bankDetails') })).toBeHidden();
  });

  // TAL-44 saved_bank_dialog_keyboard
  test('keyboard: focus starts in the dialog, Tab stays inside, Escape closes and refocuses the account menu', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'keyboard check runs on desktop only');
    await page.goto('/');
    await page.locator('.account-menu__button').click();
    await page.getByLabel(t('account.devEmail')).fill('kim@example.com');
    await page
      .locator('.account-menu__form')
      .getByRole('button', { name: t('account.devSubmit') })
      .click();

    const menuBtn = page.getByRole('button', { name: t('account.menuLabel', { name: 'kim' }) });
    await menuBtn.click();
    await page.getByRole('menuitem', { name: t('account.bankDetails') }).click();

    const dialog = page.getByRole('dialog', { name: t('savedBank.title') });
    await expect(dialog.getByLabel(t('members.bank'))).toBeFocused();

    const close = dialog.getByRole('button', { name: t('common.close') });
    await close.focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel(t('members.bank'))).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(close).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(menuBtn).toBeFocused();
  });

  test('SB-6: dev sign-in, save details, join a VND group, another member opens Pay and sees QR and saved account', async ({
    browser,
  }) => {
    // Context 1: Sam signs in and saves bank details
    const contextSam = await browser.newContext();
    const pageSam = await contextSam.newPage();
    await pageSam.goto('/');

    await pageSam.locator('.account-menu__button').click();
    await pageSam.getByLabel(t('account.devEmail')).fill('sam@example.com');
    await pageSam
      .locator('.account-menu__form')
      .getByRole('button', { name: t('account.devSubmit') })
      .click();

    const samMenuBtn = pageSam.getByRole('button', { name: t('account.menuLabel', { name: 'sam' }) });
    await expect(samMenuBtn).toBeVisible();

    await samMenuBtn.click();
    const bankDetailsItem = pageSam.getByRole('menuitem', { name: t('account.bankDetails') });
    await expect(bankDetailsItem).toBeVisible();
    await bankDetailsItem.click();

    // Fill saved bank details
    const dialog = pageSam.getByRole('dialog', { name: t('savedBank.title') });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(t('members.bank')).selectOption({ value: '970436' });
    await dialog.getByLabel(t('members.accountNo')).fill('0123456789');
    await dialog.getByLabel(t('members.accountName')).fill('SAM TAYLOR');
    await dialog.getByRole('button', { name: t('savedBank.save') }).click();

    await expect(dialog).toBeHidden();

    // Context 2: Alex creates a group
    const contextAlex = await browser.newContext();
    const pageAlex = await contextAlex.newPage();
    await pageAlex.goto('/');
    await pageAlex.getByLabel(t('home.create.groupName')).fill('Trip with Sam');
    await pageAlex.getByLabel(t('home.create.yourName')).fill('Alex');
    await pageAlex.getByRole('button', { name: t('home.create.submit') }).click();

    await expect(pageAlex).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const groupUrl = pageAlex.url();
    await pageAlex.getByRole('button', { name: t('ownerKey.done') }).click();

    // Sam opens group and joins
    await pageSam.goto(groupUrl);
    await pageSam.getByPlaceholder(t('join.yourName')).fill('Sam');
    await pageSam.getByRole('button', { name: t('join.submit') }).click();
    await expect(pageSam.getByRole('tab', { name: t('group.tabs.expenses') })).toBeVisible();

    // Alex adds an expense paid by Sam
    await pageAlex.reload();
    await pageAlex.getByLabel(t('expenseForm.amount')).fill('200k');
    await pageAlex.getByLabel(t('expenseForm.paidBy')).selectOption({ label: 'Sam' });
    await pageAlex.getByLabel(t('expenseForm.description')).fill('Snacks');
    await pageAlex.getByRole('button', { name: t('expenseForm.submit') }).click();

    // Alex goes to settle tab and clicks Pay to Sam
    await pageAlex.getByRole('tab', { name: t('group.tabs.settle') }).click();
    await pageAlex.getByRole('button', { name: t('settle.pay') }).click();

    // QrDialog displays the saved bank account
    const qrDialog = pageAlex.getByRole('dialog');
    await expect(qrDialog.getByLabel(t('qr.codeLabel'))).toBeVisible();
    await expect(qrDialog.getByText('0123456789')).toBeVisible();
    await expect(qrDialog.getByText('Vietcombank')).toBeVisible();

    await contextSam.close();
    await contextAlex.close();
  });

  test('SB-9: own form shows note, Use different details opens empty form without PATCH until save, Use my saved bank details returns to saved', async ({
    page,
  }) => {
    // Sign in and save bank details
    await page.goto('/');
    await page.locator('.account-menu__button').click();
    await page.getByLabel(t('account.devEmail')).fill('pat@example.com');
    await page
      .locator('.account-menu__form')
      .getByRole('button', { name: t('account.devSubmit') })
      .click();

    const patMenuBtn = page.getByRole('button', { name: t('account.menuLabel', { name: 'pat' }) });
    await expect(patMenuBtn).toBeVisible();
    await patMenuBtn.click();
    await page.getByRole('menuitem', { name: t('account.bankDetails') }).click();

    const bankDialog = page.getByRole('dialog', { name: t('savedBank.title') });
    await bankDialog.getByLabel(t('members.bank')).selectOption({ value: '970436' });
    await bankDialog.getByLabel(t('members.accountNo')).fill('0123456789');
    await bankDialog.getByLabel(t('members.accountName')).fill('PAT SAVED');
    await bankDialog.getByRole('button', { name: t('savedBank.save') }).click();
    await expect(bankDialog).toBeHidden();

    // Create a group
    await page.getByLabel(t('home.create.groupName')).fill('Pat Weekend');
    await page.getByLabel(t('home.create.useDifferentName')).check();
    await page.getByLabel(t('home.create.yourName')).fill('Pat');
    await page.getByRole('button', { name: t('home.create.submit') }).click();
    await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);

    // Open members tab
    await page.getByRole('tab', { name: t('group.tabs.members') }).click();

    const bankSection = page
      .locator('section.card')
      .filter({ has: page.getByRole('heading', { name: t('members.bankTitle') }) });

    // Own form shows usingSaved note
    await expect(bankSection.getByText(t('savedBank.usingSaved'))).toBeVisible();
    const useDiffBtn = bankSection.getByRole('button', { name: t('savedBank.useDifferent') });
    await expect(useDiffBtn).toBeVisible();

    // Track network PATCH calls to members
    let memberPatchCalled = false;
    page.on('request', (req) => {
      if (req.method() === 'PATCH' && req.url().includes('/members/')) {
        memberPatchCalled = true;
      }
    });

    // Click "Use different details in this group"
    await useDiffBtn.click();

    // Empty form revealed
    const bankSelect = bankSection.getByLabel(t('members.bank'));
    const accInput = bankSection.getByLabel(t('members.accountNo'));
    await expect(bankSelect).toHaveValue('');
    await expect(accInput).toHaveValue('');

    // Ensure no network request happened yet
    expect(memberPatchCalled).toBe(false);

    // Fill different details and Save
    await bankSelect.selectOption({ value: '970418' });
    await accInput.fill('9876543210');
    await bankSection.getByLabel(t('members.accountName')).fill('PAT GROUP');
    await bankSection.getByRole('button', { name: t('common.save') }).click();

    // Now member PATCH was called
    expect(memberPatchCalled).toBe(true);

    // After save, bankSource is group: "Use my saved bank details" button is offered
    const useSavedBtn = bankSection.getByRole('button', { name: t('savedBank.useSaved') });
    await expect(useSavedBtn).toBeVisible();

    // Click "Use my saved bank details"
    await useSavedBtn.click();

    // Returns to saved note and "Use different details in this group" button
    await expect(bankSection.getByText(t('savedBank.usingSaved'))).toBeVisible();
    await expect(bankSection.getByRole('button', { name: t('savedBank.useDifferent') })).toBeVisible();
  });
});
