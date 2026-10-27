# Interface redesign

| Field | Value |
|---|---|
| ID | `TAL-17` |
| Labels | `type::improvement`, `priority::medium`, `area::ui` |
| Reporter | Product owner (human) |
| Assignee | Developer (trainee) |
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

From the product owner (human):

1. Keep the colors recognisable (the same green accent in both themes); a small logo next to the app name is
   welcome. No new fonts to download.
2. Every save that does not change the page in an obvious way: an expense added, a member added, bank details
   saved, group settings saved, a transfer recorded or confirmed, an invite link copied. A short message that
   disappears by itself is enough; errors stay on the form.
3. The three group tabs. On a phone they belong at the bottom of the screen.
4. The group page should show a short summary above the tabs: total spent, number of members and the viewer's own
   balance. The expenses tab already uses two columns.
5. Yes, at phone, tablet and desktop widths, in light and dark.

## Plan

Branch: `feat/ui_redesign` from `develop`.

How the agreed answers are met:

1. Colors and brand: same accent; a logo mark (inline SVG, `currentColor`) next to the app name; section titles
   in small caps style; softer card borders. Colors only through `base/_themes.scss`.
2. Confirmation messages: a toast area rendered once by `ToastProvider` (around `App` in `main.tsx`), fed by
   `useToast()`. A visually hidden `role="status"` region carries the texts; the visible cards with their close
   buttons are outside it.
   A toast stores a message key and its variables, not translated text, so it follows a language change while it
   is visible. It disappears after a few seconds (the timer pauses while hovered or focused) and can be
   dismissed. Errors keep their place on the forms.
3. Thumb reach: below `md`, the group tabs become a bottom bar fixed to the screen edge with an icon and a label
   per tab (still `role="tab"`); the page gets bottom padding so nothing hides behind it. From `md` up they stay
   above the content.
4. Summary: three figures above the tabs (total spent, members, the viewer's balance: "you are owed", "you owe"
   or "settled"; not shown to a visitor who has not joined). Computed by a pure `groupSummary()` from the
   existing `computeBalances()`.
5. Screenshots: 3 widths x 2 themes x (home + 3 tabs), before and after, attached to the merge request.

Icons: on the tabs, "Copy invite link", "Download CSV", "Add" (member) and the delete buttons of the expense
list, which become icon buttons with the existing accessible names.

Tests:

- Unit: `groupSummary()` (owed, owes, settled, visitor, removed members); toast queue (add, expire, dismiss,
  limit).
- E2E: a toast after adding an expense and after copying the invite link; the bottom tab bar on a phone and the
  top tabs on desktop; the summary after an expense; existing specs keep passing.

Docs: `docs/business-rules.md` (confirmation messages, the summary), `docs/design.md` (section 5 and the
`ui_redesign` section), `README.md` if it lists the redesign as not in the MVP.

## Merge request

The merge request is opened on GitLab from this branch; its link is added when it exists. Screenshots before and
after (3 widths x 2 themes x home and 3 tabs) are attached to it.

The branch was first built on an earlier draft of `develop` and then reapplied on the current `develop`. Four
components conflicted with the remove-member work there, and each keeps the `develop` behaviour with the redesign
added on top:

- `MembersPanel.tsx`: removal still goes through `RemoveMemberDialog` (no `window.prompt`); the
  `toast.memberRemoved` message is shown only after the dialog reports success.
- `ExpenseList.tsx`: an expense that involves a removed member still shows `expenseList.deleteLocked` instead of
  a delete button; the other rows get the new icon button and the `toast.expenseDeleted` message.
- `SettlePanel.tsx`: suggestions still come from `settleView` (current members only, removed members with a
  balance listed); the transfer toasts are added on the success paths.
- `GroupPage.tsx`: the summary bar is added above the owner key banner; `ExpenseForm` still receives `onStale`.

## Review

Reviewed by the AI team lead with the `review-checklist` skill and an independent review pass, against the
screenshots. Round 1: one defect (the bottom tab bar could cover the end of the page on phones with a home
indicator, because the page padding left out the safe-area inset) and seven risks (toast ids in a state updater,
close buttons inside the live region, no pause on hover or focus, an untrimmed member name, a layout read right
after a resize in a test, missing tests for the pause and the announcement). All fixed in one commit. Typecheck,
287 unit and API tests, 28 hook tests and 50 e2e tests pass. Waiting for the human to test on `develop`.
Released in release/2026-10-26.
