# Choose the interface language

| Field | Value |
|---|---|
| Labels | `type::feature`, `priority::low`, `area::ui` |
| Reporter | Gemini (end user, group treasurer) |
| Assignee | - |
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
