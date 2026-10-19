import { expect, test } from '@playwright/test';
import { t } from './i18n';

// Light/dark switch in the header (theme_picker). The device is in light mode,
// so a dark choice must come from the app and survive a reload.
test.use({ colorScheme: 'light' });

const theme = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.dataset.theme ?? null);

test('the theme choice is applied, remembered and can follow the device again', async ({ page }) => {
  await page.goto('/');
  const picker = page.getByRole('group', { name: t('theme.label') });
  await expect(picker.getByRole('radio', { name: t('theme.options.system') })).toBeChecked();
  expect(await theme(page)).toBeNull();

  await picker.getByText(t('theme.options.dark'), { exact: true }).click();
  await expect(picker.getByRole('radio', { name: t('theme.options.dark') })).toBeChecked();
  expect(await theme(page)).toBe('dark');

  await page.reload();
  await expect(picker.getByRole('radio', { name: t('theme.options.dark') })).toBeChecked();
  expect(await theme(page)).toBe('dark');

  await picker.getByText(t('theme.options.system'), { exact: true }).click();
  await expect(picker.getByRole('radio', { name: t('theme.options.system') })).toBeChecked();
  expect(await theme(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('tally.theme'))).toBeNull();
});

test('a stored dark choice is applied before the app script runs', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('tally.theme', 'dark'));
  // Block the app bundle: only the inline script in index.html can set the theme.
  await page.route('**/src/main.tsx*', (route) => route.abort());
  await page.goto('/');
  expect(await theme(page)).toBe('dark');
});
