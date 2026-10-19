import { expect, test } from '@playwright/test';
import { enLocale } from '../src/i18n/locales/en';
import { t } from './i18n';

// The browser runs in Vietnamese (playwright.config.ts); each test starts with
// empty storage, so no language has been chosen yet. Fake data only.
const en = enLocale.messages;

test('the chosen language applies at once and is remembered on this device', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: t('home.create.title') })).toBeVisible();

  await page.getByLabel(t('languagePicker.label')).selectOption('en');
  await expect(page.getByRole('heading', { name: en.home.create.title })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.reload();
  await expect(page.getByRole('heading', { name: en.home.create.title })).toBeVisible();
  await expect(page.getByLabel(en.languagePicker.label)).toHaveValue('en');

  await page.getByLabel(en.languagePicker.label).selectOption('vi');
  await expect(page.getByRole('heading', { name: t('home.create.title') })).toBeVisible();
});

test('an open "new group" form keeps its currency; a newly opened one follows the language', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Weekend trip');
  await expect(page.getByLabel(t('home.create.currency'))).toHaveValue('VND');

  await page.getByLabel(t('languagePicker.label')).selectOption('en');
  await expect(page.getByLabel(en.home.create.currency)).toHaveValue('VND');
  await expect(page.getByLabel(en.home.create.groupName)).toHaveValue('Weekend trip');

  // A newly opened form takes the default currency of the current language.
  await page.reload();
  await expect(page.getByLabel(en.home.create.currency)).toHaveValue('USD');
});

test('the language can be changed on the group page', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Shared house');
  await page.getByLabel(t('home.create.yourName')).fill('Jamie');
  await page.getByRole('button', { name: t('home.create.submit') }).click();
  await expect(page).toHaveURL(/\/g\/[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  const url = page.url();
  await page.getByRole('button', { name: t('ownerKey.done') }).click();
  await expect(page.getByRole('tab', { name: t('group.tabs.members') })).toBeVisible();

  await page.getByLabel(t('languagePicker.label')).selectOption('en');
  await expect(page.getByRole('tab', { name: en.group.tabs.members })).toBeVisible();
  await expect(page).toHaveURL(url);
});
