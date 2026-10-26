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

  await picker.getByTitle(t('theme.options.dark')).click();
  await expect(picker.getByRole('radio', { name: t('theme.options.dark') })).toBeChecked();
  expect(await theme(page)).toBe('dark');

  await page.reload();
  await expect(picker.getByRole('radio', { name: t('theme.options.dark') })).toBeChecked();
  expect(await theme(page)).toBe('dark');

  await picker.getByTitle(t('theme.options.system')).click();
  await expect(picker.getByRole('radio', { name: t('theme.options.system') })).toBeChecked();
  expect(await theme(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('tally.theme'))).toBeNull();
});

test('with "same as device" selected, the page follows a live device theme change', async ({ page }) => {
  const background = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim());

  await page.goto('/');
  const picker = page.getByRole('group', { name: t('theme.label') });
  await expect(picker.getByRole('radio', { name: t('theme.options.system') })).toBeChecked();
  const light = await background();

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(background).not.toBe(light);
  const dark = await background();

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(background).toBe(light);
  expect(dark).not.toBe('');
});

test('a stored dark choice is applied before the app script runs', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('tally.theme', 'dark'));
  // Block the app bundle: only the inline script in index.html can set the theme.
  await page.route('**/src/main.tsx*', (route) => route.abort());
  await page.goto('/');
  expect(await theme(page)).toBe('dark');
});

test('each theme option is an icon with a name for screen readers and a tooltip', async ({ page }) => {
  await page.goto('/');
  const picker = page.getByRole('group', { name: t('theme.label') });
  for (const option of ['system', 'light', 'dark'] as const) {
    const label = picker.getByTitle(t(`theme.options.${option}`));
    await expect(label.locator('svg')).toBeVisible();
    await expect(picker.getByRole('radio', { name: t(`theme.options.${option}`) })).toBeAttached();
  }
});
