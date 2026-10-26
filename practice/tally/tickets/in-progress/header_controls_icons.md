# Icons for the header language and theme controls

| Field | Value |
|---|---|
| ID | `TAL-27` |
| Labels | `type::improvement`, `priority::medium`, `area::ui` |
| Reporter | Opus (product owner) |
| Assignee | Developer (trainee) |
| Depends on | - |
| Related | `language_picker`, `theme_picker`, `ui_redesign` |

## Description

The language and theme controls in the header are plain text. On a phone they take a whole second row above the
page, and the theme control reads as three words rather than as a switch. Common apps show these controls as
icons; the header should look the same way and take less space.

## Notes from the reporter

- Light and dark should be recognisable at a glance, without reading.
- The language control should look like the language menus found on most websites.

## Analysis

The request is about the look and the size of the two existing controls, not their behaviour: the stored choices
(`tally.locale`, `tally.theme`), the pre-paint theme script and the "same as device" default stay as they are.
Open points: which icons, whether the language names stay visible, and whether the header must fit on one row on
a phone.

## Clarifying questions

1. Theme: is an icon-only control acceptable, as long as each option still has a name for screen readers and a
   tooltip?
2. Language: icon only, or icon and language name? Which icon?
3. Should the header fit on one row at phone width (375 px)?
4. Does this ticket include the rest of the interface redesign?

## Answers

From Opus (product owner):

1. Yes: a monitor for "same as device", a sun for light and a moon for dark, in the same segmented control.
2. A dropdown whose button shows the flag and the name of the current language, with a chevron. The menu lists
   each language with its flag and its name in that language (the `label` of each locale). A flag is accepted as the usual
   convention for a language menu.
3. Yes: the app name on the left, both controls on the right, one row from 360 px up. On a narrow phone the
   button may show only the flag; the open menu always shows the names.
4. No. The rest of the redesign stays in `ui_redesign`; this ticket changes only the header.

## Plan

Branch: `feat/header_controls_icons` from `develop`.

Files:

- `src/components/Icon.tsx` (new): inline SVG icons drawn with `currentColor` (monitor, sun, moon, chevron,
  check), so they follow the theme colors without new assets.
- `src/components/Flag.tsx` (new): one inline SVG flag per locale, typed as `Record<Locale, ...>`, so a new locale
  does not type-check until it has a flag.
- `src/components/ThemePicker.tsx` + `.scss`: same `fieldset` of native radios; each option shows its icon, keeps
  its name in a visually hidden span (accessible name) and in `title` (tooltip).
- `src/components/LanguagePicker.tsx` + `.scss`: the native `<select>` becomes a menu button: a button with the
  flag, the current language name and a chevron (`aria-haspopup="listbox"`, `aria-expanded`), and a `listbox` of
  options with flag, name and a check mark on the current one. Arrow keys, Home/End, Enter/Space, Escape and
  Tab work as in a native select; a click outside closes the menu. The name in the button is visually hidden
  below the `sm` breakpoint.
- `src/components/listboxKeys.ts` (new): the pure keyboard logic of the menu (which option is active after a key),
  so it can be unit tested in Node.
- `src/App.scss`: the header no longer wraps; the controls stay on the right.
- Locales: `languagePicker.label` stays the accessible name of the button. No new user-facing text.

Tests:

- Unit (`tests/unit/listboxKeys.test.ts`): arrow keys wrap, Home/End, unknown keys keep the active option.
- E2E: `e2e/language-picker.spec.ts` opens the menu and picks an option by role; a new test checks keyboard use
  and Escape. `e2e/theme.spec.ts` clicks the options by their tooltip names. A header test checks that the brand
  and both controls are on one row at 360 px.
- `npm run typecheck`, `npm test` and `npm run e2e` before the merge request.

Docs: `docs/business-rules.md` (interface language and preferences), `docs/design.md` (section 5 and the
`language_picker, theme_picker` section).
