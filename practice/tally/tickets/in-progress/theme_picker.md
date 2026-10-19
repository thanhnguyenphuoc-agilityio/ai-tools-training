# Dark mode switch

| Field | Value |
|---|---|
| Labels | `type::feature`, `priority::low`, `area::ui` |
| Reporter | Haiku (end user, group member) |
| Assignee | Developer (trainee) |
| Depends on | - |
| Related | `language_picker` |

## Description

The app follows the device theme. With the device in light mode, the app is too bright in the evening. The app
should offer its own light/dark switch without changing the device setting.

## Analysis

The ticket asks for an in-app light/dark switch that works without changing the device setting. It does not say
whether "follow the device" should remain available as an option, whether the choice is remembered, or where the
switch is placed. First step: add a three-way control (system, light, dark) to the app header that calls the
existing `setThemePreference()`.

## Clarifying questions

1. Should the app keep a "same as device" option, or only offer light and dark?
2. Should the choice be remembered on this device after closing the browser?
3. Is a switch in the header acceptable, next to the language choice?

## Answers

From Haiku (reporter):

1. Light and dark are required; a "same as device" option is acceptable but not needed.
2. Yes. The app is mostly used in the evening and the choice should not have to be made again.
3. Yes, as long as it is easy to find.

## Plan

Branch: `feat/theme_picker` from `develop`.

How the agreed answers are met:

1. Light and dark, plus "same as device": a three-way control (system, light, dark). "System" stays the default,
   so nothing changes for users who never touch the control.
2. Remembered on this device: `setThemePreference()` already stores light/dark in `localStorage` (`tally.theme`) and
   removes the key for system. The inline script in `index.html` applies the stored choice before first paint, so a
   dark choice does not flash light on load; `main.tsx` applies it again when the app starts.
3. In the header: the control sits in `.app__header`, aligned to the right of the app name. The language picker
   (`language_picker`) is a separate component placed next to it.

Files:

- `src/components/ThemePicker.tsx` (new): a radio group (`fieldset` with a visually hidden legend) with one option
  per preference, styled as a segmented control. It reads the initial value with `getThemePreference()` and calls
  `setThemePreference()` on change. Native radios give keyboard navigation and accessible names.
- `src/components/ThemePicker.scss` (new): BEM block `theme-picker`, mobile first, colors only through the theme
  custom properties, visible focus ring.
- `src/App.tsx`: one line adds `<ThemePicker />` to `.app__header`. `src/App.scss`: the header becomes a wrapping
  flex row.
- `src/theme.ts`: export `THEME_PREFERENCES`, `isThemePreference()` and the storage key; guard `document` and
  `localStorage` so the module also runs in Node (unit tests).
- `src/i18n/locales/en.ts`, then `vi.ts`: `theme.label` and `theme.options.system|light|dark`.

Tests:

- `tests/unit/theme.test.ts` (new): default is system; stored light/dark is read back; unknown stored values fall
  back to system; setting light/dark stores the value and sets `data-theme`; setting system removes both; the
  choice still applies when storage throws; nothing throws without `document`; `index.html` applies the same
  storage key before the app script.
- `e2e/theme.spec.ts` (new, run by the lead): pick dark, reload, the choice is kept; with the app script blocked, the
  inline script alone applies dark; pick system, the override is removed.
- `npm run typecheck` and `npm test` before each commit.

Docs: `docs/design.md` section 5 and the `language_picker, theme_picker` section, `docs/business-rules.md` (a new
interface preferences rule), `README.md` "Not in the MVP".
