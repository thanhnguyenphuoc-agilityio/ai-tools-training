# Interface redesign

| Field | Value |
|---|---|
| ID | `TAL-17` |
| Labels | `type::improvement`, `priority::medium`, `area::ui` |
| Reporter | Opus (product owner) |
| Assignee | - |
| Depends on | - |
| Related | `header_controls_icons` |

## Description

The app works but looks unfinished; new members have mistaken it for a scam site. The interface needs a more
polished design.

## Notes from the reporter

- Icons, and a confirmation message after saving.
- Better use of the space on large screens.
- One-handed use on phones.

## Analysis

The request names three outcomes (icons and a confirmation after saving, better use of large screens, one-handed use
on phones) and one goal (the app should look trustworthy to a new member). It does not say whether the colors and
the brand change, which saves need a confirmation, or what "one-handed" means in layout terms. The header controls
are already handled by `header_controls_icons`. Nothing in the request changes data or the API.

## Clarifying questions

1. Should the color palette and the app name style change, or only the layout and the icons?
2. Which actions need a confirmation message after saving?
3. On phones, what should be reachable with the thumb?
4. On large screens, what should use the extra space?
5. Are screenshots before and after required in the merge request?

## Answers

From Opus (product owner):

1. Keep the colors recognisable (the same green accent in both themes); a small logo next to the app name is
   welcome. No new fonts to download.
2. Every save that does not change the page in an obvious way: an expense added, a member added, bank details
   saved, group settings saved, a transfer recorded or confirmed, an invite link copied. A short message that
   disappears by itself is enough; errors stay on the form.
3. The three group tabs. On a phone they belong at the bottom of the screen.
4. The group page should show a short summary above the tabs: total spent, number of members and the viewer's own
   balance. The expenses tab already uses two columns.
5. Yes, at phone, tablet and desktop widths, in light and dark.
