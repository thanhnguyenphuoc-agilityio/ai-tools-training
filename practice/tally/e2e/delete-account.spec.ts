import { expect, test } from '@playwright/test';
import { t } from './i18n';

test.describe('Delete account (DA-9)', () => {
  for (const { width, height, desc } of [
    { width: 375, height: 667, desc: '375px' },
    { width: 1366, height: 768, desc: '1366px' },
  ]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`menu item, dialog text, cancel keeps account, confirm signs out at ${desc} in ${theme} theme (DA-9)`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await page.goto('/');

        if (theme === 'dark') {
          const picker = page.getByRole('group', { name: t('theme.label') });
          await picker.getByTitle(t('theme.options.dark')).click();
          await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        }

        const proj = test.info().project.name;
        const email = `alex-${proj}-${desc}-${theme}@example.com`;
        const name = `alex-${proj}-${desc}-${theme}`;

        // Sign in via dev login
        const signInBtn = page.locator('.account-menu__button');
        await expect(signInBtn).toBeVisible();
        await signInBtn.click();

        await page.getByLabel(t('account.devEmail')).fill(email);
        await page.locator('.account-menu__form').getByRole('button', { name: t('account.devSubmit') }).click();

        const accountBtn = page.getByRole('button', { name: t('account.menuLabel', { name }) });
        await expect(accountBtn).toBeVisible();

        // Open menu and check delete account item
        await accountBtn.click();
        const deleteItem = page.getByRole('menuitem', { name: t('account.deleteAccount') });
        await expect(deleteItem).toBeVisible();
        await deleteItem.click();

        // Dialog text
        const dialog = page.getByRole('dialog', { name: t('deleteAccount.title') });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText(t('deleteAccount.deleted'))).toBeVisible();
        await expect(dialog.getByText(t('deleteAccount.kept'))).toBeVisible();
        await expect(dialog.getByText(t('deleteAccount.ownerWarning'))).toBeVisible();

        // Cancel keeps account
        const cancelBtn = dialog.getByRole('button', { name: t('common.cancel') });
        await cancelBtn.click();
        await expect(dialog).toBeHidden();
        await expect(accountBtn).toBeVisible();

        // Open again and confirm deletion
        await accountBtn.click();
        await deleteItem.click();
        await expect(dialog).toBeVisible();

        const confirmBtn = dialog.getByRole('button', { name: t('deleteAccount.confirm') });
        await confirmBtn.click();
        await expect(dialog).toBeHidden();

        // Notification and signed out state
        await expect(page.locator('.toasts__text', { hasText: t('deleteAccount.done') })).toBeVisible();
        await expect(page.locator('.account-menu__button')).toBeVisible();
        await expect(accountBtn).toBeHidden();

        // No delete action without a session
        await page.locator('.account-menu__button').click();
        await expect(page.getByRole('menuitem', { name: t('account.deleteAccount') })).toHaveCount(0);
      });
    }
  }
});
