# Toast duration and stack height on phones

| Field | Value |
|---|---|
| ID | `TAL-38` |
| Labels | `type::improvement`, `priority::low`, `area::ui` |
| Reporter | Sonnet (QA tester) |
| Assignee | Developer (trainee) |
| Depends on | `ui_redesign` |
| Related | - |

## Description

Found during the manual test of `ui_redesign` on `develop`. A confirmation toast disappears after four seconds. After
a transfer is confirmed, the only other change on the page is the status of one row, so the message is easy to
miss. On a phone, three stacked toasts reach the middle of the screen and cover the content above the tab bar.

## Notes from the reporter

- Not a defect; every toast appears and is announced as specified.
- The language name hidden in the header button below `sm` is accepted as specified in `header_controls_icons`.

## Analysis

Both points are display settings of the existing toast area. The queue limit, the pause on hover or focus and the
live region stay as they are. No API or data change.

## Plan

Branch: `feat/toast_timing` from `develop`.

- `src/toast.tsx`: `TOAST_DURATION` from 4000 to 6000 ms.
- `src/toast.scss`: below `md`, only the two newest cards are shown; the older card stays in the queue, in the live
  region and expires as usual.
- E2E: a phone shows two of three toasts and the live region still holds all three; the desktop shows all three.
  Existing timeouts in `e2e/ui-redesign.spec.ts` follow the new duration.
- Docs: `docs/business-rules.md` (confirmation messages), `docs/design.md` (section 5).

## Merge request

The merge request is opened on GitLab from this branch; its link is added when it exists.

## Review

Found and fixed during the manual test of `develop` on Day 11; the change was checked with typecheck, lint, 287 unit
and API tests and 52 e2e tests. Confirmed by the human on `develop`.
Released in release/2026-10-26.
