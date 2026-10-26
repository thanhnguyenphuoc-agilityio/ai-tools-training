# Icons for the header language and theme controls

| Field | Value |
|---|---|
| ID | `TAL-27` |
| Labels | `type::improvement`, `priority::medium`, `area::ui` |
| Reporter | Opus (product owner) |
| Assignee | - |
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
3. Yes: the app name on the left, both controls on the right, one row from 360 px up.
4. No. The rest of the redesign stays in `ui_redesign`; this ticket changes only the header.
