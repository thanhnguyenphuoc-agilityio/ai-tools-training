# Choose the interface language

| Field | Value |
|---|---|
| Labels | `type::feature`, `priority::low`, `area::ui` |
| Reporter | Gemini (end user, group treasurer) |
| Assignee | Developer (trainee) |
| Depends on | - |
| Related | `theme_picker` |

## Description

The app follows the browser language. On a computer set to English the app is shown in English, and some group
members cannot follow when the screen is shared. The language should be selectable in the app and the choice
remembered.

## Analysis

The ticket asks for an in-app control to choose the interface language, with the choice remembered on the device.
It does not say where the control lives, whether the choice stays on one device or follows the person to other
devices, or whether changing the language should change the suggested currency of new groups. First step: add a
picker to the app header that calls the existing `setLocale()`, which already stores the choice under
`tally.locale`.

## Clarifying questions

1. Should the choice apply to this device only, or follow the person to other devices?
2. Is the picker needed on every page, or only on the home page?
3. When the language changes on the "new group" form, should the suggested currency change with it?
4. Which languages are expected besides Vietnamese and English?

## Answers

From Gemini (reporter):

1. This device only; the choice needs to stay set on the laptop used for screen sharing.
2. Every page, so that the language can be changed without returning to the home page.
3. No opinion; referred to the product owner.
4. None known; Vietnamese and English are enough.

From Opus (product owner):

3. A "new group" form that is already open keeps its currency when the language changes. A newly opened form
   still takes its default currency from the current interface language (Vietnamese: VND, English: USD), as in
   `docs/business-rules.md`. The person can change the currency by hand before creating the group.

## Plan

Branch: `feat/language_picker` from `develop`.

Files:

- `src/components/LanguagePicker.tsx` (new): a labelled `<select>` listing every entry of `LOCALES` by its own
  `label` (the language name in that language), with the current locale selected. Changing it calls the existing
  `useI18n().setLocale()`, which stores the choice under `tally.locale`.
- `src/components/LanguagePicker.scss` (new): BEM block `language-picker`, mobile first, colors only through the
  theme custom properties.
- `src/App.tsx`: one line that renders `<LanguagePicker />` in `.app__header`, so the control is on every page.
  `src/App.scss`: the header lays out the brand and the controls on one row.
- `src/i18n/index.tsx`: export `localeOptions()` (the list the picker shows) and `saveLocale()` (the storage write
  that `setLocale()` already performs), so both can be unit tested without a browser.
- `src/i18n/locales/en.ts`, then `vi.ts`: the accessible label of the picker.

How the agreed answers are met:

1. This device only: the choice is stored in `localStorage` (`tally.locale`), nothing is sent to the API, and
   `detectLocale()` already prefers the stored choice over the browser languages.
2. Every page: the picker sits in the shared `.app__header`, which the home page and the group page both render.
3. Currency of the "new group" form: `HomePage` keeps the selected currency in component state that is initialised
   once, so a form that is already open keeps its currency when the language changes. A newly opened form
   initialises from the current locale's `defaultCurrency` (Vietnamese: VND, English: USD). No change to the form
   is needed; the behaviour is covered by tests.
4. Languages: Vietnamese and English, the two existing entries of `LOCALES`. A new locale appears in the picker
   automatically.

Tests:

- Unit (`tests/unit/languagePicker.test.ts`): `localeOptions()` lists every locale with its own name; a saved
  choice is used by `detectLocale()` ahead of the browser languages; an unknown stored value is ignored; the
  default currency of a new form follows the locale (vi: VND, en: USD).
- E2e (`e2e/language-picker.spec.ts`): switching to English changes the interface and survives a reload; the
  picker is available on the group page; an open "new group" form keeps VND after switching to English, and a
  newly opened form defaults to USD.

## Merge request

Branch `feat/language_picker` into `develop`.

The merge request is opened on GitLab from this branch; its link is added when it exists.

- Built: `src/components/LanguagePicker.tsx` (+ `.scss`) in `.app__header`, on every page; the choice is stored in
  `localStorage` (`tally.locale`) on this device only.
- An open "new group" form keeps its currency when the language changes; a newly opened form defaults from the
  current language (VND for Vietnamese, USD for English).
- Checked by the developer: `npm run typecheck` and `npm test` pass. New tests: `tests/unit/languagePicker.test.ts`
  and `e2e/language-picker.spec.ts` (e2e is run by the team lead).
- Docs updated: `docs/business-rules.md` (section "Interface language"), `docs/design.md` (sections 5 and 6) and
  `README.md` ("Not in the MVP").

## Review

Approved by the AI team lead after one round: typecheck, 114 unit and API tests and 12 e2e tests pass. Review
comments addressed: 16px text and a 44px tap height on phones, header controls grouped in `.app__controls`, and
clearer tests.

Released on 2026-10-23.
