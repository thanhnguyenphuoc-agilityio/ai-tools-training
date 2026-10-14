# Dark mode switch

| Field | Value |
|---|---|
| Labels | `type::feature`, `priority::low`, `area::ui` |
| Reporter | Haiku (end user, group member) |
| Assignee | - |
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
