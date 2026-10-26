import { expect, test, type Page } from '@playwright/test';
import { enLocale } from '../src/i18n/locales/en';
import { viLocale } from '../src/i18n/locales/vi';
import { t } from './i18n';

// The browser runs in Vietnamese (playwright.config.ts); each test starts with
// empty storage, so no language has been chosen yet. Fake data only.
const en = enLocale.messages;
const LABELS = { vi: viLocale.label, en: enLocale.label };

// The header menu button (header_controls_icons) is named after the current language, in that language.
const NAMES = {
  vi: viLocale.messages.languagePicker.current.replace('{language}', LABELS.vi),
  en: en.languagePicker.current.replace('{language}', LABELS.en),
};
const languageButton = (page: Page, current: 'vi' | 'en') => page.getByRole('button', { name: NAMES[current] });

// Open the menu (whatever the current language), then pick a language by its own name.
async function chooseLanguage(page: Page, value: 'vi' | 'en') {
  await page.locator('.app__controls [aria-haspopup="listbox"]').click();
  await page.getByRole('option', { name: LABELS[value] }).click();
}

test('the chosen language applies at once and is remembered on this device', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: t('home.create.title') })).toBeVisible();

  await chooseLanguage(page, 'en');
  await expect(page.getByRole('heading', { name: en.home.create.title })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.reload();
  await expect(page.getByRole('heading', { name: en.home.create.title })).toBeVisible();
  await expect(languageButton(page, 'en')).toBeVisible();

  await chooseLanguage(page, 'vi');
  await expect(page.getByRole('heading', { name: t('home.create.title') })).toBeVisible();
});

test('an open "new group" form keeps its currency; a newly opened one follows the language', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(t('home.create.groupName')).fill('Weekend trip');
  await expect(page.getByLabel(t('home.create.currency'))).toHaveValue('VND');

  await chooseLanguage(page, 'en');
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

  await chooseLanguage(page, 'en');
  await expect(page.getByRole('tab', { name: en.group.tabs.members })).toBeVisible();
  await expect(page).toHaveURL(url);
});

test('the language menu shows each language with its flag and works from the keyboard', async ({ page }) => {
  await page.goto('/');
  const button = languageButton(page, 'vi');
  await button.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('listbox', { name: t('languagePicker.label') });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('option')).toHaveText([LABELS.vi, LABELS.en]);
  await expect(menu.getByRole('option', { name: LABELS.vi })).toHaveAttribute('aria-selected', 'true');
  await expect(menu.locator('svg.language-picker__flag')).toHaveCount(2);

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(menu).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('option', { name: LABELS.en })).toHaveClass(/language-picker__option--active/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: en.home.create.title })).toBeVisible();
  await expect(languageButton(page, 'en')).toBeFocused();
});

test('a click outside closes the language menu without changing the language', async ({ page }) => {
  await page.goto('/');
  await languageButton(page, 'vi').click();
  await expect(page.getByRole('listbox')).toBeVisible();
  // Top-left corner of the page content: the menu opens on the right, so on a phone it covers the middle.
  await page.locator('main').click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
});

test('the brand and both header controls fit on one row on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  const brand = await page.locator('.app__brand').boundingBox();
  const language = await languageButton(page, 'vi').boundingBox();
  const theme = await page.getByRole('group', { name: t('theme.label') }).boundingBox();
  for (const box of [language, theme]) {
    expect(Math.abs(box!.y + box!.height / 2 - (brand!.y + brand!.height / 2))).toBeLessThan(4);
  }
  expect(theme!.x + theme!.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('Tab closes the language menu and moves on to the theme control', async ({ page }) => {
  await page.goto('/');
  await languageButton(page, 'vi').click();
  await expect(page.getByRole('listbox')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(page.getByRole('radio', { name: t('theme.options.system') })).toBeFocused();
});
